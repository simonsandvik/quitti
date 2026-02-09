import { ReceiptRequest } from "./parser";
import { EmailCandidate, MatchResult } from "./matcher";
import { v4 as uuidv4 } from "uuid";

// Mock data generator for MVP demos without real API keys
const generateMockEmails = (requests: ReceiptRequest[]): EmailCandidate[] => {
    return requests.map(req => {
        // 80% chance to generate a good match
        const isMatch = Math.random() > 0.2;

        if (isMatch) {
            return {
                id: uuidv4(),
                subject: `Receipt from ${req.merchant}`,
                sender: `no-reply@${req.merchant.toLowerCase().replace(/\s/g, "")}.com`,
                date: new Date(req.date), // Exact date
                hasAttachments: true,
                attachments: [{ name: "receipt.pdf", type: "application/pdf", size: 1024, id: uuidv4() }],
                snippet: `Your order of ${req.amount} ${req.currency} was successful.`
            }
        } else {
            // Random junk
            return {
                id: uuidv4(),
                subject: "Weekly Newsletter",
                sender: "news@spam.com",
                date: new Date(),
                hasAttachments: false,
                attachments: []
            }
        }
    });
};

import { searchGmail, searchGmailForPdfs, getGmailAttachment } from "./integrations/gmail";
import { searchOutlook, searchOutlookForPdfs, getOutlookAttachment } from "./integrations/outlook";
import { parsePdfContent, verifyPdfForRequest, textContainsAmount } from "./pdf-parser";
import type { PdfAttachmentInfo } from "./integrations/outlook";
import { uploadReceiptFile } from "./supabase";

export const scanEmails = async (
    sessions: any[], // Array of typed sessions with accessToken
    requests: ReceiptRequest[],
    onProgress?: (status: string, percentage: number, foundCount: number, pdfCount: number) => void,
    userId?: string
): Promise<{ matches: MatchResult[], candidates: EmailCandidate[], files: Record<string, File> }> => {
    console.log(`[Diagnostic] scanEmails starting for ${requests.length} receipts.`);

    let allCandidates: EmailCandidate[] = [];
    const files: Record<string, File> = {};
    const extractedTexts: Record<string, string> = {};
    const matches: MatchResult[] = [];
    const foundIds = new Set<string>();
    let foundCount = 0;
    let pdfCount = 0;

    onProgress?.("Initializing scan...", 0, 0, 0);

    // Filter out invalid sessions (no email or no token)
    const validSessions = sessions.filter(s => s?.user?.email && s?.accessToken);
    if (validSessions.length < sessions.length) {
        console.log(`[Scanner] Filtered out ${sessions.length - validSessions.length} invalid session(s) (missing email or token)`);
    }

    // Calculate total work for progress bar
    const totalSteps = Math.max(validSessions.length * requests.length, 1);
    let completedSteps = 0;

    const updateProgress = (msg: string, currentSessionProgress: number = 0) => {
        const totalProgress = completedSteps + currentSessionProgress;
        const percent = Math.min(Math.round((totalProgress / totalSteps) * 100), 100);
        onProgress?.(msg, percent, foundCount, pdfCount);
    };

    // Process all sessions
    for (const session of validSessions) {
        let sessionCandidates: EmailCandidate[] = [];
        const provider = (session?.provider === "google" ? "google" : (session?.provider === "azure-ad" ? "azure-ad" : (session?.provider === "facebook" ? "facebook" : undefined))) as "google" | "azure-ad" | "facebook" | undefined;
        const token = session?.accessToken;
        const email = session?.user?.email || "unknown";

        // Progress tracking for API integrations
        let currentProgressCount = 0;

        // ==========================================
        // PDF-First Scanning Approach
        // ==========================================
        // Instead of searching by merchant name, we:
        // 1. Find all PDFs in the date range
        // 2. Download each PDF
        // 3. Check if it contains: amount + date (±3 days) + merchant name

        if ((provider === "google" || provider === "azure-ad") && token) {
            console.log(`Starting PDF-First Scan for ${email} (${provider})...`);

            // Calculate date range from all requests
            const dates = requests.map(r => new Date(r.date).getTime());
            const minDate = new Date(Math.min(...dates));
            const maxDate = new Date(Math.max(...dates));
            minDate.setDate(minDate.getDate() - 5);
            maxDate.setDate(maxDate.getDate() + 5);

            console.log(`[Scanner] Date range: ${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]}`);

            // Search for all PDFs in the date range
            updateProgress(`Searching for PDF attachments...`, 0);

            let pdfList: PdfAttachmentInfo[] = [];
            let ocrWorker: any = null;

            try {
                if (provider === "google") {
                    pdfList = await searchGmailForPdfs(token, minDate, maxDate, (msg) => updateProgress(msg, 0));
                } else {
                    pdfList = await searchOutlookForPdfs(token, minDate, maxDate, (msg) => updateProgress(msg, 0));
                }

                // Deduplicate PDFs by messageId+attachmentId (Outlook pagination can return overlaps)
                const seenPdfs = new Set<string>();
                const uniquePdfList = pdfList.filter(pdf => {
                    const key = `${pdf.messageId}:${pdf.attachmentId}`;
                    if (seenPdfs.has(key)) return false;
                    seenPdfs.add(key);
                    return true;
                });
                if (uniquePdfList.length < pdfList.length) {
                    console.log(`[Scanner] Deduplicated: ${pdfList.length} → ${uniquePdfList.length} unique PDFs`);
                }
                pdfList = uniquePdfList;

                console.log(`[Scanner] Found ${pdfList.length} PDF attachments in date range`);
                updateProgress(`Found ${pdfList.length} PDFs. Initializing OCR...`, 10);

                // Initialize shared Tesseract OCR worker (one worker for all PDFs = fast)
                try {
                    const { createWorker } = await import('tesseract.js');
                    ocrWorker = await createWorker('eng+fin+swe');
                    console.log('[Scanner] OCR worker initialized (eng+fin+swe)');
                } catch (ocrInitErr) {
                    console.error('[Scanner] Failed to initialize OCR worker:', ocrInitErr);
                }

                // Track which requests are still unmatched
                const unmatchedRequests = new Set(requests.map(r => r.id));

                // Check if LLM verification is available
                let useLLM = false;
                try {
                    const { checkLLMAvailableAction } = await import("@/app/actions");
                    useLLM = await checkLLMAvailableAction();
                } catch (e) {
                    console.log('[Scanner] LLM check failed, using rule-based matching');
                }
                console.log(`[Scanner] ${useLLM ? 'LLM verification enabled' : 'Rule-based matching (no API key)'}`);

                // ==========================================
                // Merchant-First + Date-Proximity Matching
                // ==========================================
                // Stop words for merchant tokenization
                const MERCHANT_STOP_WORDS = new Set([
                    "oy", "ab", "ltd", "inc", "corp", "gmbh", "co", "llc", "sa", "ag", "oyj",
                    "com", "www", "net", "org", "fi", "se", "no", "dk", "de", "uk", "eu",
                    "the", "and", "for", "pay", "payment", "invoice", "receipt", "total",
                    "helsinki", "stockholm", "copenhagen", "oslo",
                    "eur", "usd", "gbp", "sek", "nok", "dkk"
                ]);

                const getMerchantTokens = (merchant: string): string[] => {
                    return merchant.toLowerCase()
                        .split(/[^a-z0-9]+/g)
                        .filter(t => t.length >= 2 && !MERCHANT_STOP_WORDS.has(t));
                };

                const findMerchantMatches = (pdf: PdfAttachmentInfo, unmatchedReqs: ReceiptRequest[]): ReceiptRequest[] => {
                    const subject = (pdf.emailSubject || '').toLowerCase();
                    const sender = (pdf.emailSender || '').toLowerCase();
                    const filename = (pdf.attachmentName || '').toLowerCase();

                    return unmatchedReqs.filter(req => {
                        const tokens = getMerchantTokens(req.merchant);
                        return tokens.some(token => {
                            if (token.length < 4) {
                                const regex = new RegExp(`\\b${token}\\b`, 'i');
                                return regex.test(subject) || regex.test(sender) || regex.test(filename);
                            }
                            return subject.includes(token) || sender.includes(token) || filename.includes(token);
                        });
                    });
                };

                const findDateProximityMatches = (pdf: PdfAttachmentInfo, unmatchedReqs: ReceiptRequest[], maxDays: number = 3): ReceiptRequest[] => {
                    return unmatchedReqs.filter(req => {
                        const diff = Math.abs(pdf.emailDate.getTime() - new Date(req.date).getTime());
                        return diff <= maxDays * 24 * 60 * 60 * 1000;
                    });
                };

                // Helper to process a single PDF: download, extract, LLM verify
                const processPdf = async (
                    pdf: PdfAttachmentInfo,
                    candidateReqs: ReceiptRequest[],
                    bucket: string,
                    progressPercent: number
                ): Promise<void> => {
                    try {
                        let blob: Blob | null = null;
                        if (provider === "google") {
                            blob = await getGmailAttachment(token, pdf.messageId, pdf.attachmentId);
                        } else {
                            blob = await getOutlookAttachment(token, pdf.messageId, pdf.attachmentId);
                        }

                        if (!blob) {
                            console.log(`[Scanner] Failed to download ${pdf.attachmentName}`);
                            return;
                        }

                        const arrayBuffer = await blob.arrayBuffer();
                        const fileBytes = new Uint8Array(arrayBuffer).slice(); // Safe copy — pdfjs transfers the buffer to its worker, detaching the original
                        const text = await parsePdfContent(new Uint8Array(arrayBuffer), ocrWorker);

                        if (!text.trim()) {
                            console.log(`[Scanner] No text in ${pdf.attachmentName} (skipping)`);
                            return;
                        }

                        // --- 1. Always try rule-based matching first (free, fast) ---
                        let bestMatch: { reqId: string; req: ReceiptRequest; details: string[]; dateOffset: number } | null = null;
                        const activeReqs = candidateReqs.filter(r => unmatchedRequests.has(r.id));
                        if (activeReqs.length === 0) return;

                        for (const req of activeReqs) {
                            const { isMatch, details, dateOffset } = verifyPdfForRequest(text, req);
                            if (isMatch && (!bestMatch || dateOffset < bestMatch.dateOffset)) {
                                bestMatch = { reqId: req.id, req, details, dateOffset };
                            }
                        }

                        // --- 2. If rule-based matched, use it directly (no LLM needed) ---
                        if (bestMatch) {
                            const { reqId, req, details } = bestMatch;
                            console.log(`[Scanner] ✓ [${bucket}] Rule-matched ${req.merchant} (${req.amount}) to ${pdf.attachmentName}`);

                            const file = new File([fileBytes], pdf.attachmentName, { type: "application/pdf" });
                            files[req.id] = file;
                            extractedTexts[req.id] = text.slice(0, 3000);
                            foundCount++;
                            pdfCount++;

                            matches.push({
                                receiptId: req.id,
                                emailId: pdf.messageId,
                                status: "FOUND",
                                confidence: 100,
                                details: `Rule match [${bucket}]: ${pdf.attachmentName} (${details.join(', ')})`
                            });

                            if (userId) {
                                try {
                                    const storagePath = await uploadReceiptFile(userId, req.id, file);
                                    console.log(`[Cloud Sync] Uploaded: ${storagePath}`);
                                } catch (e) {
                                    console.error(`[Cloud Sync] Failed to upload ${pdf.attachmentName}`, e);
                                }
                            }

                            unmatchedRequests.delete(reqId);
                            updateProgress(`Matched ${req.merchant}!`, progressPercent);
                            return;
                        }

                        // --- 3. LLM fallback (only if rule-based didn't match) ---
                        if (useLLM) {
                            // Bucket B: skip LLM if no candidate amount found in text
                            if (bucket === 'B') {
                                const hasAnyAmount = activeReqs.some(r => textContainsAmount(text, r.amount));
                                if (!hasAnyAmount) return;
                            }

                            const { verifyReceiptWithLLMAction } = await import("@/app/actions");
                            const result = await verifyReceiptWithLLMAction(
                                text,
                                activeReqs.map(r => ({ id: r.id, amount: r.amount, date: r.date, merchant: r.merchant, currency: r.currency })),
                                { subject: pdf.emailSubject || '', sender: pdf.emailSender || '', filename: pdf.attachmentName }
                            );

                            if (result.matchId && result.confidence >= 50) {
                                const req = requests.find(r => r.id === result.matchId)!;
                                if (!unmatchedRequests.has(result.matchId)) return;

                                console.log(`[Scanner] ✓ [${bucket}] LLM matched ${req.merchant} (${req.amount}) to ${pdf.attachmentName} (${result.confidence}%: ${result.reasoning})`);

                                const file = new File([fileBytes], pdf.attachmentName, { type: "application/pdf" });
                                files[req.id] = file;
                                extractedTexts[req.id] = text.slice(0, 3000);
                                foundCount++;
                                pdfCount++;

                                matches.push({
                                    receiptId: req.id,
                                    emailId: pdf.messageId,
                                    status: "FOUND",
                                    confidence: result.confidence,
                                    details: `LLM match [${bucket}]: ${pdf.attachmentName} (${result.reasoning})`
                                });

                                if (userId) {
                                    try {
                                        const storagePath = await uploadReceiptFile(userId, req.id, file);
                                        console.log(`[Cloud Sync] Uploaded: ${storagePath}`);
                                    } catch (e) {
                                        console.error(`[Cloud Sync] Failed to upload ${pdf.attachmentName}`, e);
                                    }
                                }

                                unmatchedRequests.delete(result.matchId);
                                updateProgress(`Matched ${req.merchant}!`, progressPercent);
                            } else {
                                console.log(`[Scanner] ✗ [${bucket}] LLM rejected ${pdf.attachmentName}: "${result.reasoning}"`);
                            }
                        }
                    } catch (e) {
                        console.error(`[Scanner] Error processing ${pdf.attachmentName}`, e);
                    }
                };

                // Classify PDFs into buckets (before downloading anything)
                const unmatchedReqList = () => [...unmatchedRequests].map(id => requests.find(r => r.id === id)!);

                const bucketA: { pdf: PdfAttachmentInfo; candidates: ReceiptRequest[] }[] = [];
                const bucketAIds = new Set<string>();

                // Debug: log VR requests and their tokens to diagnose matching issues
                const vrReqs = unmatchedReqList().filter(r => r.merchant.toLowerCase().includes('vr'));
                if (vrReqs.length > 0) {
                    vrReqs.forEach(r => console.log(`[Debug] VR request: "${r.merchant}" → tokens: [${getMerchantTokens(r.merchant).join(', ')}]`));
                }

                for (const pdf of pdfList) {
                    const merchantMatches = findMerchantMatches(pdf, unmatchedReqList());

                    // Debug: log VR-related PDFs to diagnose why they may not match
                    if (pdf.emailSubject?.toLowerCase().includes('vr') || pdf.emailSender?.toLowerCase().includes('vr')) {
                        console.log(`[Debug] VR PDF: "${pdf.emailSubject}" from ${pdf.emailSender}, file: ${pdf.attachmentName}, bucket A match: ${merchantMatches.length > 0}`);
                    }

                    if (merchantMatches.length > 0) {
                        bucketA.push({ pdf, candidates: merchantMatches });
                        bucketAIds.add(`${pdf.messageId}:${pdf.attachmentId}`);
                    }
                }

                console.log(`[Scanner] Bucket A: ${bucketA.length} merchant-matched PDFs (Bucket B will be built after A completes)`);

                // Process Bucket A: merchant-matched (high priority) — parallel batches
                const CONCURRENCY = 10;
                for (let i = 0; i < bucketA.length; i += CONCURRENCY) {
                    if (unmatchedRequests.size === 0) break;
                    const batch = bucketA.slice(i, i + CONCURRENCY);
                    const progressPercent = 10 + Math.floor((i / bucketA.length) * 60);
                    updateProgress(`[A] Processing ${i + 1}-${Math.min(i + CONCURRENCY, bucketA.length)}/${bucketA.length}...`, progressPercent);
                    await Promise.all(batch.map(({ pdf, candidates }) => {
                        console.log(`[Scanner] [A] Downloading ${pdf.attachmentName}`);
                        return processPdf(pdf, candidates, 'A', progressPercent);
                    }));
                }

                console.log(`[Scanner] Bucket A complete. Matched ${foundCount} so far. ${unmatchedRequests.size} still unmatched.`);

                // Rebuild Bucket B AFTER Bucket A (only unmatched requests remain)
                const bucketB: PdfAttachmentInfo[] = [];
                if (unmatchedRequests.size > 0) {
                    for (const pdf of pdfList) {
                        const key = `${pdf.messageId}:${pdf.attachmentId}`;
                        if (bucketAIds.has(key)) continue;
                        const dateMatches = findDateProximityMatches(pdf, unmatchedReqList());
                        if (dateMatches.length > 0) bucketB.push(pdf);
                    }

                    // Sort by closest date proximity to any unmatched request
                    const unmatchedDates = unmatchedReqList().map(r => new Date(r.date).getTime());
                    bucketB.sort((a, b) => {
                        const aMin = Math.min(...unmatchedDates.map(d => Math.abs(a.emailDate.getTime() - d)));
                        const bMin = Math.min(...unmatchedDates.map(d => Math.abs(b.emailDate.getTime() - d)));
                        return aMin - bMin;
                    });

                    // Cap to prevent runaway processing
                    const BUCKET_B_CAP = 150;
                    if (bucketB.length > BUCKET_B_CAP) {
                        console.log(`[Scanner] Capping Bucket B: ${bucketB.length} → ${BUCKET_B_CAP}`);
                        bucketB.length = BUCKET_B_CAP;
                    }
                }

                // Process Bucket B: date-proximity (fallback) — parallel batches
                if (unmatchedRequests.size > 0 && bucketB.length > 0) {
                    console.log(`[Scanner] Starting Bucket B: ${bucketB.length} date-proximity PDFs for ${unmatchedRequests.size} unmatched transactions`);
                    for (let i = 0; i < bucketB.length; i += CONCURRENCY) {
                        if (unmatchedRequests.size === 0) break;
                        const batch = bucketB.slice(i, i + CONCURRENCY);
                        const progressPercent = 70 + Math.floor((i / bucketB.length) * 20);
                        updateProgress(`[B] Processing ${i + 1}-${Math.min(i + CONCURRENCY, bucketB.length)}/${bucketB.length}...`, progressPercent);
                        await Promise.all(batch.map(pdf => {
                            const candidates = findDateProximityMatches(pdf, unmatchedReqList());
                            if (candidates.length === 0) return Promise.resolve();
                            return processPdf(pdf, candidates, 'B', progressPercent);
                        }));
                    }
                }

                console.log(`[Scanner] PDF-First scan complete. Matched ${foundCount}/${requests.length} receipts.`);

                // Terminate OCR worker to free memory
                if (ocrWorker) {
                    try {
                        await ocrWorker.terminate();
                        console.log('[Scanner] OCR worker terminated');
                    } catch (e) {
                        // Ignore termination errors
                    }
                }

                // ==========================================
                // Bucket C: HTML Email Scan
                // ==========================================
                // For still-unmatched transactions, search email bodies
                // for receipt keywords (kvitto, kuitti, invoice, etc.)
                if (unmatchedRequests.size > 0 && useLLM) {
                    const unmatchedForHtml = unmatchedReqList();
                    console.log(`[Scanner] Starting HTML scan for ${unmatchedForHtml.length} unmatched transactions`);
                    updateProgress(`Scanning email bodies for receipts...`, 92);

                    try {
                        // Use existing email search (already has keyword filtering)
                        const htmlCandidates = provider === "google"
                            ? await searchGmail(token, unmatchedForHtml, (msg) => updateProgress(msg, 93))
                            : await searchOutlook(token, unmatchedForHtml, (msg) => updateProgress(msg, 93));

                        console.log(`[Scanner] HTML scan found ${htmlCandidates.length} email candidates`);

                        for (const candidate of htmlCandidates) {
                            if (!candidate.bodyHtml) continue;
                            if (unmatchedRequests.size === 0) break;

                            // Skip emails with PDF attachments (already handled in Bucket A/B)
                            const hasPdf = candidate.attachments?.some(a =>
                                a.type?.toLowerCase().includes('pdf') || a.name?.toLowerCase().endsWith('.pdf')
                            );
                            if (hasPdf) continue;

                            // Strip HTML → plain text for LLM
                            const textContent = candidate.bodyHtml
                                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                                .replace(/<[^>]+>/g, ' ')
                                .replace(/&nbsp;/g, ' ')
                                .replace(/&amp;/g, '&')
                                .replace(/&lt;/g, '<')
                                .replace(/&gt;/g, '>')
                                .replace(/\s+/g, ' ')
                                .trim();

                            if (textContent.length < 50) continue;

                            // Find which unmatched transactions this email might match
                            const emailAsPdfInfo: PdfAttachmentInfo = {
                                messageId: candidate.id,
                                attachmentId: '',
                                attachmentName: candidate.subject || 'email',
                                emailDate: candidate.date,
                                emailSubject: candidate.subject,
                                emailSender: candidate.sender
                            };

                            let candidateReqs = findMerchantMatches(emailAsPdfInfo, unmatchedReqList());
                            if (candidateReqs.length === 0) {
                                candidateReqs = findDateProximityMatches(emailAsPdfInfo, unmatchedReqList());
                            }
                            if (candidateReqs.length === 0) continue;

                            // LLM verify the email body text
                            const { verifyReceiptWithLLMAction } = await import("@/app/actions");
                            const result = await verifyReceiptWithLLMAction(
                                textContent,
                                candidateReqs.map(r => ({ id: r.id, amount: r.amount, date: r.date, merchant: r.merchant, currency: r.currency })),
                                { subject: candidate.subject || '', sender: candidate.sender || '', filename: 'email-body' }
                            );

                            if (result.matchId && result.confidence >= 80) {
                                const req = requests.find(r => r.id === result.matchId)!;
                                if (!unmatchedRequests.has(result.matchId)) continue;

                                console.log(`[Scanner] ✓ [C-HTML] LLM matched ${req.merchant} to email "${candidate.subject}" (${result.confidence}%: ${result.reasoning})`);

                                // Convert HTML email to PDF
                                try {
                                    const { htmlToPdfBlob } = await import("@/lib/pdf");
                                    const pdfBlob = await htmlToPdfBlob(candidate.bodyHtml);
                                    const safeFilename = `${req.merchant.replace(/[^a-zA-Z0-9]/g, '_')}_email_receipt.pdf`;
                                    const pdfFile = new File([pdfBlob], safeFilename, { type: "application/pdf" });

                                    files[req.id] = pdfFile;
                                    extractedTexts[req.id] = textContent.slice(0, 3000);
                                    foundCount++;
                                    pdfCount++;

                                    matches.push({
                                        receiptId: req.id,
                                        emailId: candidate.id,
                                        status: "FOUND",
                                        confidence: result.confidence,
                                        details: `HTML email → PDF: "${candidate.subject}" (${result.reasoning})`
                                    });

                                    if (userId) {
                                        try {
                                            const storagePath = await uploadReceiptFile(userId, req.id, pdfFile);
                                            console.log(`[Cloud Sync] Uploaded HTML→PDF: ${storagePath}`);
                                        } catch (e) {
                                            console.error(`[Cloud Sync] Failed to upload HTML→PDF`, e);
                                        }
                                    }

                                    unmatchedRequests.delete(result.matchId);
                                    updateProgress(`Matched ${req.merchant} (email)!`, 94);
                                } catch (pdfErr) {
                                    console.error(`[Scanner] HTML→PDF conversion failed for "${candidate.subject}"`, pdfErr);
                                }
                            }
                        }
                    } catch (htmlErr) {
                        console.error(`[Scanner] HTML scan failed`, htmlErr);
                    }

                    console.log(`[Scanner] HTML scan complete. Total matched: ${foundCount}/${requests.length}`);
                }

            } catch (e) {
                console.error(`[Scanner] PDF search failed for ${provider}`, e);
                // Clean up OCR worker on error too
                if (ocrWorker) {
                    try { await ocrWorker.terminate(); } catch (_) {}
                }
            }
        } else if (!provider || !token) {
            // Demo Mode / Mock
            console.log("Starting Mock Scan...");
            updateProgress("Running demo scan...");
            await new Promise(resolve => setTimeout(resolve, 1000));
            sessionCandidates = generateMockEmails(requests);
        }

        // ==========================================
        // Google Ads API Scan
        // ==========================================
        if (provider === "google" && token) {
            const developerToken = process.env.NEXT_PUBLIC_GOOGLE_ADS_DEVELOPER_TOKEN;

            if (developerToken) {
                updateProgress(`Checking Google Ads...`, completedSteps + currentProgressCount);
                console.log("[Scanner] checking Google Ads API...");

                try {
                    const { listAccessibleCustomers, listInvoices, downloadInvoicePdf } = await import("./google-ads");

                    const customers = await listAccessibleCustomers(token, developerToken);
                    console.log(`[GoogleAds] Found ${customers.length} accessible customers`);

                    for (let i = 0; i < customers.length; i++) {
                        const customerResourceName = customers[i];
                        // Calculate progress for this sub-step
                        const progressPerCustomer = requests.length / customers.length;
                        currentProgressCount = Math.floor(i * progressPerCustomer);
                        updateProgress(`Checking Google Ads (${i + 1}/${customers.length})...`, currentProgressCount);
                        // customerResourceName is like "customers/1234567890"
                        // We need to fetch invoices for this customer
                        // API needs the 10-digit ID.

                        try {
                            const invoices = await listInvoices(token, developerToken, customerResourceName);
                            console.log(`[GoogleAds] Found ${invoices.length} invoices for ${customerResourceName}`);

                            for (const inv of invoices) {
                                if (!inv.pdfUrl) continue;

                                const invAmount = parseInt(inv.totalAmountMicros || "0") / 1000000;
                                const invDate = new Date(inv.issueDate); // YYYY-MM-DD

                                const match = requests.find(r => {
                                    if (foundIds.has(r.id)) return false;

                                    // Amount Check
                                    const diff = Math.abs(r.amount - invAmount);
                                    const isAmountMatch = diff < 0.05;

                                    // Date Check (Month/Year)
                                    const reqDate = new Date(r.date);
                                    const isDateMatch = reqDate.getMonth() === invDate.getMonth() && reqDate.getFullYear() === invDate.getFullYear();

                                    // Merchant "Google"
                                    const isMerchantMatch = r.merchant.toLowerCase().includes("google");

                                    return isAmountMatch && (isDateMatch || isMerchantMatch);
                                });

                                if (match) {
                                    console.log(`[GoogleAds] Matched Invoice ${inv.id} to Request ${match.merchant} (${match.amount})`);

                                    updateProgress(`Downloading Google Ads Invoice for ${match.merchant}...`, completedSteps + currentProgressCount);
                                    try {
                                        const base64Pdf = await downloadInvoicePdf(inv.pdfUrl, token);

                                        if (base64Pdf) {
                                            // Convert base64 to Blob
                                            const binaryString = atob(base64Pdf);
                                            const bytes = new Uint8Array(binaryString.length);
                                            for (let i = 0; i < binaryString.length; i++) {
                                                bytes[i] = binaryString.charCodeAt(i);
                                            }
                                            const blob = new Blob([bytes], { type: "application/pdf" });

                                            const fileName = `GoogleAds_${match.date}_${match.merchant}_${match.amount}.pdf`;
                                            const file = new File([blob], fileName, { type: "application/pdf" });

                                            files[match.id] = file;
                                            foundCount++;
                                            pdfCount++;

                                            foundIds.add(match.id);
                                            matches.push({
                                                receiptId: match.id,
                                                emailId: `google-ads-${inv.id}`,
                                                status: "FOUND",
                                                confidence: 100,
                                                details: "Direct Google Ads API Match",
                                                matchedHtml: "<div>Google Ads API Match</div>"
                                            });

                                            console.log(`[GoogleAds] Successfully saved ${fileName}`);
                                        } else {
                                            console.error(`[GoogleAds] Failed to download PDF (Server returned null)`);
                                        }
                                    } catch (err) {
                                        console.error("[GoogleAds] Failed to download PDF", err);
                                    }
                                }
                            }

                        } catch (e) {
                            console.error(`[GoogleAds] Failed to scan customer ${customerResourceName}`, e);
                        }
                    }
                } catch (e) {
                    console.error("[GoogleAds] Scan Failed", e);
                }
            } else {
                console.log("[GoogleAds] Skipping scan - Missing NEXT_PUBLIC_GOOGLE_ADS_DEVELOPER_TOKEN");
            }
        }

        if (provider === "azure-ad" && token) {
            updateProgress(`Checking Azure Billing...`, completedSteps + currentProgressCount);
            console.log("[Scanner] checking Azure Billing API...");
            try {
                // Dynamic import
                const { listSubscriptions, listInvoices, getInvoiceDownloadUrl } = await import("./azure-billing");

                const subs = await listSubscriptions(token);
                console.log(`[Azure] Found ${subs.length} subscriptions`);

                for (let i = 0; i < subs.length; i++) {
                    const sub = subs[i];
                    const progressPerSub = requests.length / Math.max(1, subs.length);
                    currentProgressCount = Math.floor(i * progressPerSub);
                    updateProgress(`Checking Azure Billing (${i + 1}/${subs.length})...`, currentProgressCount);
                    if (sub.state !== 'Enabled') continue;

                    try {
                        const invoices = await listInvoices(token, sub.subscriptionId);
                        console.log(`[Azure] Found ${invoices.length} invoices for ${sub.displayName}`);

                        for (const inv of invoices) {
                            // Try to match this invoice to a Request
                            const invAmount = inv.properties.grandTotal?.amount || 0;
                            const invDate = new Date(inv.properties.invoicePeriodEndDate);

                            const match = requests.find(r => {
                                if (foundIds.has(r.id)) return false;

                                // Amount Check
                                const diff = Math.abs(r.amount - invAmount);
                                const isAmountMatch = diff < 0.05;

                                // Date Check
                                const reqDate = new Date(r.date);
                                const isDateMatch = reqDate.getMonth() === invDate.getMonth() && reqDate.getFullYear() === invDate.getFullYear();

                                // Merchant name
                                const isMerchantMatch = r.merchant.toLowerCase().includes("microsoft") || r.merchant.toLowerCase().includes("azure");

                                return isAmountMatch && (isDateMatch || isMerchantMatch);
                            });

                            if (match) {
                                console.log(`[Azure] Matched Invoice ${inv.name} to Request ${match.merchant} (${match.amount})`);
                                foundIds.add(match.id);

                                // Get PDF URL
                                let pdfUrl = inv.properties.downloadUrl?.url;
                                if (!pdfUrl) {
                                    pdfUrl = await getInvoiceDownloadUrl(token, inv.id) || undefined;
                                }

                                if (pdfUrl) {
                                    updateProgress(`Downloading Azure Invoice for ${match.merchant}...`, completedSteps + currentProgressCount);

                                    try {
                                        const pdfRes = await fetch(pdfUrl);
                                        const blob = await pdfRes.blob();
                                        const fileName = `Azure_${match.date}_${match.merchant}_${match.amount}.pdf`;
                                        const file = new File([blob], fileName, { type: "application/pdf" });

                                        files[match.id] = file;
                                        foundCount++;
                                        pdfCount++;

                                        matches.push({
                                            receiptId: match.id,
                                            emailId: `azure-${inv.name}`,
                                            status: "FOUND",
                                            confidence: 100,
                                            details: "Direct Azure Billing API Match",
                                            matchedHtml: "<div>Azure API Match</div>"
                                        });

                                        console.log(`[Azure] Successfully saved ${fileName}`);
                                    } catch (err) {
                                        console.error("[Azure] Failed to download PDF", err);
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.error(`[Azure] Failed to scan subscription ${sub.displayName}`, e);
                    }
                }
            } catch (e) {
                console.error("[Azure] Billing Scan Failed", e);
            }
        }

        // ==========================================
        // Meta (Facebook) Ads API Scan
        // ==========================================
        if (provider === "facebook" && token) {
            updateProgress(`Checking Meta Ads...`, completedSteps + currentProgressCount);
            console.log("[Scanner] checking Meta Ads API...");
            try {
                const { listAdAccounts, listAdAccountTransactions, listBusinessInvoices, listAdAccountBillingActivities, downloadMetaFile } = await import("./meta-ads");

                const accounts = await listAdAccounts(token);
                console.log(`[Meta] Found ${accounts.length} ad accounts`);

                const scannedBusinessIds = new Set<string>();

                for (let i = 0; i < accounts.length; i++) {
                    const account = accounts[i];
                    const progressPerAccount = requests.length / Math.max(1, accounts.length);
                    currentProgressCount = Math.floor(i * progressPerAccount);
                    updateProgress(`Checking Meta Ads (${i + 1}/${accounts.length})...`, currentProgressCount);
                    try {
                        const accAny = account as any;
                        let sinceTimestamp: number | undefined = undefined;
                        if (requests.length > 0) {
                            const dates = requests.map(r => new Date(r.date).getTime());
                            const minDate = Math.min(...dates);
                            const buffer = 30 * 24 * 60 * 60 * 1000;
                            sinceTimestamp = Math.floor((minDate - buffer) / 1000);
                        }

                        // Primary: Fetch Transactions
                        const transactions = await listAdAccountTransactions(token, account.id, sinceTimestamp, 500);
                        console.log(`[Meta] Found ${transactions.length} transactions for ${account.name}`);

                        // Fallback 1: Business Invoices
                        if (transactions.length === 0 && accAny.business && accAny.business.id) {
                            if (!scannedBusinessIds.has(accAny.business.id)) {
                                scannedBusinessIds.add(accAny.business.id);

                                let fromDate: string | undefined = undefined;
                                if (requests.length > 0 && sinceTimestamp) {
                                    fromDate = new Date(sinceTimestamp * 1000).toISOString().split('T')[0];
                                }

                                console.log(`[Meta] 0 Transactions found. Scanning Business ID: ${accAny.business.id} (From: ${fromDate || 'Default'})`);

                                const invoices = await listBusinessInvoices(token, accAny.business.id, fromDate);
                                console.log(`[Meta] Found ${invoices.length} Business Invoices`);

                                for (const inv of invoices) {
                                    transactions.push({
                                        id: inv.id,
                                        time: new Date(inv.issue_date).getTime() / 1000,
                                        amount: inv.total_amount?.amount,
                                        currency: inv.total_amount?.currency,
                                        billing_reason: 'INVOICE_PDF',
                                        invoice_id: inv.invoice_id,
                                        download_uri: inv.download_uri
                                    });
                                }
                            }
                        }

                        // Fallback 2: Billing Activities (Credit Card Charges)
                        if (transactions.length === 0) {
                            console.log(`[Meta] Still 0 transactions. Trying Billing Activities for ${account.name}...`);
                            const billingActivities = await listAdAccountBillingActivities(token, account.id, sinceTimestamp);

                            for (const activity of billingActivities) {
                                let amount = "0";
                                let currency = "USD";

                                try {
                                    if (activity.extra_data) {
                                        const extra = typeof activity.extra_data === 'string'
                                            ? JSON.parse(activity.extra_data)
                                            : activity.extra_data;

                                        // Only process if it looks like a payment amount (numeric new_value)
                                        // "new_value" in activities is typically in cents/base units (e.g. 262 for 2.62 EUR)
                                        if (extra.new_value !== undefined && extra.new_value !== null && typeof extra.new_value === 'number') {
                                            amount = (extra.new_value / 100).toFixed(2);
                                        }
                                        if (extra.currency) currency = extra.currency;
                                    }
                                } catch (e) {
                                    // Ignore parsing errors for non-JSON extra_data
                                }

                                // Skip if amount is 0 (likely a status change or non-monetary event)
                                if (amount === "0" || amount === "0.00") continue;

                                const eventTime = new Date(activity.event_time).getTime() / 1000;

                                transactions.push({
                                    id: activity.id || `activity-${eventTime}`,
                                    time: eventTime,
                                    amount: amount,
                                    currency: currency,
                                    billing_reason: activity.translated_event_type || 'BILLING_CHARGE'
                                });
                            }
                            console.log(`[Meta] Added ${transactions.length} valid billing transactions from activities`);
                        }

                        if (transactions.length > 0) {
                            console.log(`[Meta Debug] Scanning ${transactions.length} transactions against ${requests.length} requests`);
                            if (requests.length > 0) {
                                console.log(`[Meta Debug] Request 0: ${requests[0].merchant} - ${requests[0].amount} ${requests[0].currency} (${requests[0].date})`);
                            }
                        }

                        for (const tx of transactions) {
                            const rawAmount = tx.amount?.amount || tx.amount || "0";
                            const txAmount = Math.abs(parseFloat(rawAmount));
                            const txDate = new Date(tx.time * 1000);

                            const match = requests.find(r => {
                                if (foundIds.has(r.id)) return false;

                                const diff = Math.abs(r.amount - txAmount);
                                const isAmountMatch = diff < 0.10; // Tighter tolerance: 10 cents for tax rounding
                                const reqDate = new Date(r.date);
                                const isDateMatch = reqDate.getMonth() === txDate.getMonth() && reqDate.getFullYear() === txDate.getFullYear();

                                // Strict merchant check - must be Meta/Facebook specific
                                const mLower = r.merchant.toLowerCase().replace(/[\.\s]/g, '');
                                const isMerchantMatch = mLower.includes("facebook") || mLower.includes("meta") || mLower.includes("facebk") || mLower.includes("fbme");
                                // Note: Removed "ads" - too generic, matched Google!

                                // Log potential matches for debugging
                                if (isAmountMatch && isMerchantMatch) {
                                    console.log(`[Meta Match Debug]
                                         Tx: ${txAmount} ${tx.currency} (Date: ${txDate.toISOString().split('T')[0]})
                                         Req: ${r.amount} ${r.currency} (Date: ${r.date})
                                         Diff: ${diff.toFixed(2)}
                                         Match? Amount: ${isAmountMatch}, Date: ${isDateMatch}, Merchant: ${isMerchantMatch}
                                     `);
                                }

                                // MUST match merchant AND (date OR close amount)
                                return isMerchantMatch && isAmountMatch && isDateMatch;
                            });

                            if (match) {
                                console.log(`[Meta] Matched Transaction ${tx.id}`);
                                foundIds.add(match.id);

                                // Generate PDF Receipt since Meta API often doesn't provide a direct link for activities
                                if (!files[match.id]) {
                                    try {
                                        updateProgress(`Generating Receipt for ${match.merchant}...`, completedSteps + currentProgressCount);
                                        const { generateMetaReceiptPdf } = await import("./receipt-generator");
                                        const blob = await generateMetaReceiptPdf({
                                            id: tx.id,
                                            date: txDate,
                                            amount: tx.amount,
                                            currency: tx.currency || "USD",
                                            merchant: "Meta Ads", // Standardized name
                                            account_name: account.name,
                                            account_id: account.id,
                                            billing_reason: tx.billing_reason || "Ad Billing"
                                        });

                                        if (blob) {
                                            console.log(`[Meta Debug] Generated Blob Size: ${blob.size}, Type: ${blob.type}`);
                                            const fileName = `Meta_Receipt_${tx.id}.pdf`;
                                            const file = new File([blob], fileName, { type: "application/pdf" });
                                            files[match.id] = file;
                                            foundCount++;
                                            pdfCount++;
                                            console.log(`[Meta] Generated PDF for ${match.merchant}`);
                                        }
                                    } catch (e) {
                                        console.error(`[Meta] Failed to generate PDF for ${tx.id}`, e);
                                    }
                                }

                                matches.push({
                                    receiptId: match.id,
                                    emailId: `meta-${tx.id}`,
                                    status: "FOUND",
                                    confidence: 100,
                                    details: `Direct Meta Ads API Match (ID: ${tx.id})`,
                                    matchedHtml: `<div>Meta Transaction Match: ${tx.billing_reason || 'Billing'}</div>`,
                                    // @ts-ignore
                                    matchedData: {
                                        id: tx.id,
                                        date: txDate,
                                        amount: tx.amount,
                                        currency: tx.currency || "USD",
                                        merchant: "Meta Ads",
                                        account_name: account.name,
                                        account_id: account.id,
                                        billing_reason: tx.billing_reason || "Ad Billing"
                                    }
                                });
                            }
                        }
                    } catch (e) {
                        console.error(`[Meta] Failed to scan ad account ${account.name}`, e);
                    }
                }
            } catch (e) {
                console.error("[Meta] Scan Failed", e);
            }
        }


        // Attach session info to candidates for later fetching
        if (provider && token) {
            sessionCandidates = sessionCandidates.map(c => ({
                ...c,
                provider: provider as any,
                accessToken: token
            }));
        }

        allCandidates = [...allCandidates, ...sessionCandidates];

        // Session done, add full requests length to completedSteps
        completedSteps += requests.length;
    }

    // Deduplicate candidates by ID across all sessions
    const candidates = Array.from(new Map(allCandidates.map(c => [c.id, c])).values());

    updateProgress(`Analyzing ${candidates.length} emails found...`);

    // ==========================================
    // Final LLM Verification Pass
    // ==========================================
    // Group matches by merchant and verify correct pairing
    // Only for merchants with 2+ matches (single matches can't be swapped)
    if (foundCount > 0) {
        let hasLLM = false;
        try {
            const { checkLLMAvailableAction } = await import("@/app/actions");
            hasLLM = await checkLLMAvailableAction();
        } catch (_) {}

        if (hasLLM) {
            console.log(`[Scanner] Starting final LLM verification of ${foundCount} matches`);
            updateProgress(`Verifying match accuracy...`, 96);

            // Group FOUND matches by normalized merchant name
            const merchantGroups = new Map<string, { match: MatchResult; req: ReceiptRequest }[]>();
            for (const match of matches) {
                if (match.status !== "FOUND") continue;
                const req = requests.find(r => r.id === match.receiptId);
                if (!req) continue;
                // Normalize merchant to first significant token for grouping
                const tokens = req.merchant.toLowerCase().split(/[^a-z0-9]+/g).filter(t => t.length >= 3);
                const groupKey = tokens[0] || req.merchant.toLowerCase();
                const group = merchantGroups.get(groupKey) || [];
                group.push({ match, req });
                merchantGroups.set(groupKey, group);
            }

            for (const [merchant, group] of merchantGroups) {
                if (group.length < 2) continue;

                console.log(`[Scanner] Verifying ${group.length} matches for "${merchant}"`);

                const payload = group.map(({ match, req }) => ({
                    receiptId: req.id,
                    merchant: req.merchant,
                    amount: req.amount,
                    date: req.date,
                    currency: req.currency,
                    pdfText: extractedTexts[req.id] || match.details,
                    emailSubject: match.details
                }));

                try {
                    const { verifyMatchGroupAction } = await import("@/app/actions");
                    const result = await verifyMatchGroupAction(payload);

                    if (!result.verified && result.reassignments.length > 0) {
                        console.log(`[Scanner] ⚠ Reassigning ${result.reassignments.length} matches for "${merchant}": ${result.reasoning}`);

                        // Apply reassignments: swap files between receipt IDs
                        for (const { receiptId, shouldMatchTo } of result.reassignments) {
                            const file1 = files[receiptId];
                            const file2 = files[shouldMatchTo];
                            if (file1 && file2) {
                                files[shouldMatchTo] = file1;
                                files[receiptId] = file2;

                                // Also swap extracted texts
                                const text1 = extractedTexts[receiptId];
                                const text2 = extractedTexts[shouldMatchTo];
                                if (text1) extractedTexts[shouldMatchTo] = text1;
                                if (text2) extractedTexts[receiptId] = text2;

                                // Re-upload swapped files if userId available
                                if (userId) {
                                    try {
                                        await uploadReceiptFile(userId, receiptId, files[receiptId]);
                                        await uploadReceiptFile(userId, shouldMatchTo, files[shouldMatchTo]);
                                        console.log(`[Cloud Sync] Re-uploaded swapped files for ${receiptId} ↔ ${shouldMatchTo}`);
                                    } catch (e) {
                                        console.error(`[Cloud Sync] Failed to re-upload swapped files`, e);
                                    }
                                }
                            }
                        }
                    } else {
                        console.log(`[Scanner] ✓ Verified ${group.length} matches for "${merchant}"`);
                    }
                } catch (e) {
                    console.error(`[Scanner] Verification failed for "${merchant}"`, e);
                }
            }

            console.log(`[Scanner] Final verification complete.`);
        }
    }

    // Final check for missing items (stream didn't find them)
    for (const req of requests) {
        if (!files[req.id]) {
            // Check if we have a match in matches array?
            const existingMatch = matches.find(m => m.receiptId === req.id);
            if (!existingMatch) {
                matches.push({
                    receiptId: req.id,
                    emailId: "",
                    status: "NOT_FOUND",
                    confidence: 0,
                    details: "No matching email found"
                });
            }
        }
    }

    console.log(`[Diagnostic] scanEmails finished. Found: ${foundCount}, Pdfs: ${pdfCount}`);
    onProgress?.("Finalizing results...", 100, foundCount, pdfCount);
    return { matches, candidates, files };
};
