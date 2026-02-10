import { ReceiptRequest } from "./parser";
import { EmailCandidate, MatchResult } from "./matcher";
import { v4 as uuidv4 } from "uuid";

// Mock data generator for MVP demos without real API keys
const generateMockEmails = (requests: ReceiptRequest[]): EmailCandidate[] => {
    return requests.map(req => {
        const isMatch = Math.random() > 0.2;
        if (isMatch) {
            return {
                id: uuidv4(),
                subject: `Receipt from ${req.merchant}`,
                sender: `no-reply@${req.merchant.toLowerCase().replace(/\s/g, "")}.com`,
                date: new Date(req.date),
                hasAttachments: true,
                attachments: [{ name: "receipt.pdf", type: "application/pdf", size: 1024, id: uuidv4() }],
                snippet: `Your order of ${req.amount} ${req.currency} was successful.`
            }
        } else {
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

import { searchGmailForPdfs, getGmailAttachment } from "./integrations/gmail";
import { searchOutlookForPdfs, getOutlookAttachment } from "./integrations/outlook";
import { parsePdfContent, verifyPdfForRequest, textContainsAmount } from "./pdf-parser";
import type { PdfAttachmentInfo } from "./integrations/outlook";
import { uploadReceiptFile } from "./supabase";

export const scanEmails = async (
    sessions: any[],
    requests: ReceiptRequest[],
    onProgress?: (status: string, percentage: number, foundCount: number, pdfCount: number) => void,
    userId?: string
): Promise<{ matches: MatchResult[], candidates: EmailCandidate[], files: Record<string, File> }> => {
    console.log(`[Scanner] Starting scan for ${requests.length} receipts.`);

    const allCandidates: EmailCandidate[] = [];
    const files: Record<string, File> = {};
    const extractedTexts: Record<string, string> = {};
    const matches: MatchResult[] = [];
    const foundIds = new Set<string>();
    let foundCount = 0;
    let pdfCount = 0;

    onProgress?.("Initializing scan...", 0, 0, 0);

    const validSessions = sessions.filter(s => s?.user?.email && s?.accessToken);
    if (validSessions.length < sessions.length) {
        console.log(`[Scanner] Filtered out ${sessions.length - validSessions.length} invalid session(s)`);
    }

    const updateProgress = (msg: string, percent: number = 0) => {
        onProgress?.(msg, Math.min(percent, 100), foundCount, pdfCount);
    };

    for (const session of validSessions) {
        let sessionCandidates: EmailCandidate[] = [];
        const provider = (session?.provider === "google" ? "google" : (session?.provider === "azure-ad" ? "azure-ad" : (session?.provider === "facebook" ? "facebook" : undefined))) as "google" | "azure-ad" | "facebook" | undefined;
        const token = session?.accessToken;
        const email = session?.user?.email || "unknown";
        let currentProgressCount = 0;

        // ==========================================
        // PDF-Only Flat Pipeline
        // ==========================================
        // 1. Discover all PDFs in date range
        // 2. Download + extract text (pdfjs / OCR fallback)
        // 3. Amount pre-filter (free — skip if no matching amount)
        // 4. Rule-based quick check (free — accept if amount+date+merchant)
        // 5. LLM matching (only for amount-filtered PDFs that rule-based missed)
        // 6. Post-verification (LLM reviews merchant groups, reassigns/discards)

        if ((provider === "google" || provider === "azure-ad") && token) {
            console.log(`[Scanner] PDF scan for ${email} (${provider})`);

            const dates = requests.map(r => new Date(r.date).getTime());
            const minDate = new Date(Math.min(...dates));
            const maxDate = new Date(Math.max(...dates));
            minDate.setDate(minDate.getDate() - 5);
            maxDate.setDate(maxDate.getDate() + 5);

            console.log(`[Scanner] Date range: ${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]}`);
            updateProgress(`Searching for PDF attachments...`, 0);

            let pdfList: PdfAttachmentInfo[] = [];
            let ocrWorker: any = null;

            try {
                // Step 1: Discover all PDFs
                if (provider === "google") {
                    pdfList = await searchGmailForPdfs(token, minDate, maxDate, (msg) => updateProgress(msg, 0));
                } else {
                    pdfList = await searchOutlookForPdfs(token, minDate, maxDate, (msg) => updateProgress(msg, 0));
                }

                // Deduplicate
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

                console.log(`[Scanner] Found ${pdfList.length} PDF attachments`);
                updateProgress(`Found ${pdfList.length} PDFs. Initializing OCR...`, 5);

                // Initialize OCR worker
                try {
                    const { createWorker } = await import('tesseract.js');
                    ocrWorker = await createWorker('eng+fin+swe');
                    console.log('[Scanner] OCR worker initialized (eng+fin+swe)');
                } catch (ocrInitErr) {
                    console.error('[Scanner] Failed to initialize OCR worker:', ocrInitErr);
                }

                // Track unmatched requests
                const unmatchedRequests = new Set(requests.map(r => r.id));

                // Check LLM availability
                let useLLM = false;
                try {
                    const { checkLLMAvailableAction } = await import("@/app/actions");
                    useLLM = await checkLLMAvailableAction();
                } catch (e) {
                    console.log('[Scanner] LLM check failed, rule-based only');
                }
                console.log(`[Scanner] ${useLLM ? 'LLM enabled' : 'Rule-based only (no API key)'}`);

                // Track matched PDF texts for post-verification
                const matchedPdfTexts = new Map<string, { text: string; emailSubject?: string }>();
                let llmCalls = 0;
                let skippedNoText = 0;
                let skippedNoAmount = 0;

                // Step 2-5: Process each PDF
                const processPdf = async (pdf: PdfAttachmentInfo): Promise<void> => {
                    try {
                        // Download
                        let blob: Blob | null = null;
                        if (provider === "google") {
                            blob = await getGmailAttachment(token, pdf.messageId, pdf.attachmentId);
                        } else {
                            blob = await getOutlookAttachment(token, pdf.messageId, pdf.attachmentId);
                        }
                        if (!blob) return;

                        // Extract text
                        const arrayBuffer = await blob.arrayBuffer();
                        const fileBytes = new Uint8Array(arrayBuffer).slice(); // Safe copy — pdfjs transfers the buffer
                        const text = await parsePdfContent(new Uint8Array(arrayBuffer), ocrWorker);

                        if (!text.trim()) {
                            skippedNoText++;
                            return;
                        }

                        // Amount pre-filter: check against all unmatched transactions
                        const activeReqs = [...unmatchedRequests].map(id => requests.find(r => r.id === id)!);
                        if (activeReqs.length === 0) return;

                        const amountCandidates = activeReqs.filter(r => textContainsAmount(text, r.amount));
                        if (amountCandidates.length === 0) {
                            skippedNoAmount++;
                            return;
                        }

                        // Rule-based quick check (free)
                        let bestRuleMatch: { req: ReceiptRequest; details: string[]; dateOffset: number } | null = null;
                        for (const req of amountCandidates) {
                            const { isMatch, details, dateOffset } = verifyPdfForRequest(text, req);
                            if (isMatch && (!bestRuleMatch || dateOffset < bestRuleMatch.dateOffset)) {
                                bestRuleMatch = { req, details, dateOffset };
                            }
                        }

                        if (bestRuleMatch) {
                            const { req, details } = bestRuleMatch;
                            if (!unmatchedRequests.has(req.id)) return;

                            console.log(`[Scanner] ✓ Rule: ${req.merchant} (${req.amount}) → ${pdf.attachmentName}`);

                            const file = new File([fileBytes], pdf.attachmentName, { type: "application/pdf" });
                            files[req.id] = file;
                            extractedTexts[req.id] = text.slice(0, 4000);
                            foundCount++;
                            pdfCount++;

                            matches.push({
                                receiptId: req.id,
                                emailId: pdf.messageId,
                                status: "FOUND",
                                confidence: 100,
                                details: `Rule match: ${pdf.attachmentName} (${details.join(', ')})`
                            });

                            if (userId) {
                                try {
                                    await uploadReceiptFile(userId, req.id, file);
                                } catch (e) {
                                    console.error(`[Cloud Sync] Upload failed: ${pdf.attachmentName}`, e);
                                }
                            }

                            unmatchedRequests.delete(req.id);
                            matchedPdfTexts.set(req.id, { text: text.slice(0, 1500), emailSubject: pdf.emailSubject });
                            return;
                        }

                        // LLM matching (only for PDFs that passed amount filter but rule-based missed)
                        if (useLLM) {
                            llmCalls++;
                            const { verifyReceiptWithLLMAction } = await import("@/app/actions");
                            const result = await verifyReceiptWithLLMAction(
                                text,
                                amountCandidates.map(r => ({ id: r.id, amount: r.amount, date: r.date, merchant: r.merchant, currency: r.currency })),
                                { subject: pdf.emailSubject || '', sender: pdf.emailSender || '', filename: pdf.attachmentName }
                            );

                            if (result.matchId && result.confidence >= 50) {
                                const req = requests.find(r => r.id === result.matchId)!;
                                if (!unmatchedRequests.has(result.matchId)) return;

                                console.log(`[Scanner] ✓ LLM: ${req.merchant} (${req.amount}) → ${pdf.attachmentName} (${result.confidence}%: ${result.reasoning})`);

                                const file = new File([fileBytes], pdf.attachmentName, { type: "application/pdf" });
                                files[req.id] = file;
                                extractedTexts[req.id] = text.slice(0, 4000);
                                foundCount++;
                                pdfCount++;

                                matches.push({
                                    receiptId: req.id,
                                    emailId: pdf.messageId,
                                    status: "FOUND",
                                    confidence: result.confidence,
                                    details: `LLM match: ${pdf.attachmentName} (${result.reasoning})`
                                });

                                if (userId) {
                                    try {
                                        await uploadReceiptFile(userId, req.id, file);
                                    } catch (e) {
                                        console.error(`[Cloud Sync] Upload failed: ${pdf.attachmentName}`, e);
                                    }
                                }

                                unmatchedRequests.delete(result.matchId);
                                matchedPdfTexts.set(req.id, { text: text.slice(0, 1500), emailSubject: pdf.emailSubject });
                            }
                        }
                    } catch (e) {
                        console.error(`[Scanner] Error processing ${pdf.attachmentName}`, e);
                    }
                };

                // Process all PDFs in parallel batches
                const CONCURRENCY = 10;
                for (let i = 0; i < pdfList.length; i += CONCURRENCY) {
                    if (unmatchedRequests.size === 0) break;
                    const batch = pdfList.slice(i, i + CONCURRENCY);
                    const progressPercent = 10 + Math.floor((i / pdfList.length) * 70);
                    updateProgress(`Processing PDF ${i + 1}-${Math.min(i + CONCURRENCY, pdfList.length)}/${pdfList.length}...`, progressPercent);
                    await Promise.all(batch.map(pdf => processPdf(pdf)));
                }

                console.log(`[Scanner] PDF scan complete. Matched: ${foundCount}/${requests.length}, LLM calls: ${llmCalls}, Skipped (no text): ${skippedNoText}, Skipped (no amount): ${skippedNoAmount}`);

                // ==========================================
                // Step 6: Post-Verification (LLM reviews groups)
                // ==========================================
                if (useLLM && matchedPdfTexts.size >= 2) {
                    updateProgress(`Verifying match quality...`, 85);

                    // Group matches by merchant
                    const merchantGroups = new Map<string, MatchResult[]>();
                    for (const match of matches) {
                        if (match.status !== "FOUND") continue;
                        const req = requests.find(r => r.id === match.receiptId);
                        if (!req) continue;
                        const key = req.merchant.toLowerCase().split(',')[0].trim();
                        if (!merchantGroups.has(key)) merchantGroups.set(key, []);
                        merchantGroups.get(key)!.push(match);
                    }

                    for (const [merchantKey, groupMatches] of merchantGroups) {
                        if (groupMatches.length < 2) continue;

                        const matchGroup = groupMatches.map(m => {
                            const req = requests.find(r => r.id === m.receiptId)!;
                            const pdfInfo = matchedPdfTexts.get(m.receiptId);
                            return {
                                receiptId: m.receiptId,
                                merchant: req.merchant,
                                amount: req.amount,
                                date: req.date,
                                currency: req.currency,
                                pdfText: pdfInfo?.text || '',
                                emailSubject: pdfInfo?.emailSubject
                            };
                        });

                        try {
                            const { verifyMatchGroupAction } = await import("@/app/actions");
                            const verification = await verifyMatchGroupAction(matchGroup);

                            if (!verification.verified && verification.reassignments.length > 0) {
                                console.log(`[Scanner] Post-verify "${merchantKey}": ${verification.reasoning}`);
                                for (const reassignment of verification.reassignments) {
                                    const fromId = reassignment.receiptId;
                                    const toId = reassignment.shouldMatchTo;
                                    if (files[fromId] && files[toId]) {
                                        const tempFile = files[fromId];
                                        const tempText = extractedTexts[fromId];
                                        files[fromId] = files[toId];
                                        extractedTexts[fromId] = extractedTexts[toId];
                                        files[toId] = tempFile;
                                        extractedTexts[toId] = tempText;
                                        console.log(`[Scanner] Swapped: ${fromId} ↔ ${toId}`);
                                    }
                                }
                            } else {
                                console.log(`[Scanner] Post-verify "${merchantKey}": OK`);
                            }
                        } catch (e) {
                            console.error(`[Scanner] Post-verification failed for "${merchantKey}"`, e);
                        }
                    }
                }

                // Terminate OCR worker
                if (ocrWorker) {
                    try {
                        await ocrWorker.terminate();
                        console.log('[Scanner] OCR worker terminated');
                    } catch (e) { /* ignore */ }
                }

            } catch (e) {
                console.error(`[Scanner] PDF search failed for ${provider}`, e);
                if (ocrWorker) {
                    try { await ocrWorker.terminate(); } catch (_) {}
                }
            }
        } else if (!provider || !token) {
            // Demo Mode
            console.log("Starting Mock Scan...");
            updateProgress("Running demo scan...", 0);
            await new Promise(resolve => setTimeout(resolve, 1000));
            sessionCandidates = generateMockEmails(requests);
        }

        // ==========================================
        // Google Ads API Scan
        // ==========================================
        if (provider === "google" && token) {
            const developerToken = process.env.NEXT_PUBLIC_GOOGLE_ADS_DEVELOPER_TOKEN;

            if (developerToken) {
                updateProgress(`Checking Google Ads...`, 90);
                console.log("[Scanner] checking Google Ads API...");

                try {
                    const { listAccessibleCustomers, listInvoices, downloadInvoicePdf } = await import("./google-ads");

                    const customers = await listAccessibleCustomers(token, developerToken);
                    console.log(`[GoogleAds] Found ${customers.length} accessible customers`);

                    for (let i = 0; i < customers.length; i++) {
                        const customerResourceName = customers[i];
                        currentProgressCount = Math.floor(i * (requests.length / customers.length));
                        updateProgress(`Checking Google Ads (${i + 1}/${customers.length})...`, 90);

                        try {
                            const invoices = await listInvoices(token, developerToken, customerResourceName);
                            console.log(`[GoogleAds] Found ${invoices.length} invoices for ${customerResourceName}`);

                            for (const inv of invoices) {
                                if (!inv.pdfUrl) continue;

                                const invAmount = parseInt(inv.totalAmountMicros || "0") / 1000000;
                                const invDate = new Date(inv.issueDate);

                                const match = requests.find(r => {
                                    if (foundIds.has(r.id)) return false;
                                    const diff = Math.abs(r.amount - invAmount);
                                    const isAmountMatch = diff < 0.05;
                                    const reqDate = new Date(r.date);
                                    const isDateMatch = reqDate.getMonth() === invDate.getMonth() && reqDate.getFullYear() === invDate.getFullYear();
                                    const isMerchantMatch = r.merchant.toLowerCase().includes("google");
                                    return isAmountMatch && (isDateMatch || isMerchantMatch);
                                });

                                if (match) {
                                    console.log(`[GoogleAds] Matched Invoice ${inv.id} to ${match.merchant} (${match.amount})`);
                                    updateProgress(`Downloading Google Ads Invoice...`, 92);
                                    try {
                                        const base64Pdf = await downloadInvoicePdf(inv.pdfUrl, token);
                                        if (base64Pdf) {
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
                                                details: "Direct Google Ads API Match"
                                            });
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
            }
        }

        // ==========================================
        // Azure Billing API Scan
        // ==========================================
        if (provider === "azure-ad" && token) {
            updateProgress(`Checking Azure Billing...`, 90);
            console.log("[Scanner] checking Azure Billing API...");
            try {
                const { listSubscriptions, listInvoices, getInvoiceDownloadUrl } = await import("./azure-billing");

                const subs = await listSubscriptions(token);
                console.log(`[Azure] Found ${subs.length} subscriptions`);

                for (let i = 0; i < subs.length; i++) {
                    const sub = subs[i];
                    updateProgress(`Checking Azure Billing (${i + 1}/${subs.length})...`, 92);
                    if (sub.state !== 'Enabled') continue;

                    try {
                        const invoices = await listInvoices(token, sub.subscriptionId);
                        console.log(`[Azure] Found ${invoices.length} invoices for ${sub.displayName}`);

                        for (const inv of invoices) {
                            const invAmount = inv.properties.grandTotal?.amount || 0;
                            const invDate = new Date(inv.properties.invoicePeriodEndDate);

                            const match = requests.find(r => {
                                if (foundIds.has(r.id)) return false;
                                const diff = Math.abs(r.amount - invAmount);
                                const isAmountMatch = diff < 0.05;
                                const reqDate = new Date(r.date);
                                const isDateMatch = reqDate.getMonth() === invDate.getMonth() && reqDate.getFullYear() === invDate.getFullYear();
                                const isMerchantMatch = r.merchant.toLowerCase().includes("microsoft") || r.merchant.toLowerCase().includes("azure");
                                return isAmountMatch && (isDateMatch || isMerchantMatch);
                            });

                            if (match) {
                                console.log(`[Azure] Matched Invoice ${inv.name} to ${match.merchant} (${match.amount})`);
                                foundIds.add(match.id);

                                let pdfUrl = inv.properties.downloadUrl?.url;
                                if (!pdfUrl) {
                                    pdfUrl = await getInvoiceDownloadUrl(token, inv.id) || undefined;
                                }

                                if (pdfUrl) {
                                    updateProgress(`Downloading Azure Invoice...`, 93);
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
                                            details: "Direct Azure Billing API Match"
                                        });
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
            updateProgress(`Checking Meta Ads...`, 90);
            console.log("[Scanner] checking Meta Ads API...");
            try {
                const { listAdAccounts, listAdAccountTransactions, listBusinessInvoices, listAdAccountBillingActivities } = await import("./meta-ads");

                const accounts = await listAdAccounts(token);
                console.log(`[Meta] Found ${accounts.length} ad accounts`);

                const scannedBusinessIds = new Set<string>();

                for (let i = 0; i < accounts.length; i++) {
                    const account = accounts[i];
                    updateProgress(`Checking Meta Ads (${i + 1}/${accounts.length})...`, 92);
                    try {
                        const accAny = account as any;
                        let sinceTimestamp: number | undefined = undefined;
                        if (requests.length > 0) {
                            const dates = requests.map(r => new Date(r.date).getTime());
                            const minDate = Math.min(...dates);
                            const buffer = 30 * 24 * 60 * 60 * 1000;
                            sinceTimestamp = Math.floor((minDate - buffer) / 1000);
                        }

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

                        // Fallback 2: Billing Activities
                        if (transactions.length === 0) {
                            const billingActivities = await listAdAccountBillingActivities(token, account.id, sinceTimestamp);
                            for (const activity of billingActivities) {
                                let amount = "0";
                                let currency = "USD";
                                try {
                                    if (activity.extra_data) {
                                        const extra = typeof activity.extra_data === 'string'
                                            ? JSON.parse(activity.extra_data)
                                            : activity.extra_data;
                                        if (extra.new_value !== undefined && extra.new_value !== null && typeof extra.new_value === 'number') {
                                            amount = (extra.new_value / 100).toFixed(2);
                                        }
                                        if (extra.currency) currency = extra.currency;
                                    }
                                } catch (e) { /* ignore */ }

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
                            console.log(`[Meta] Added ${transactions.length} billing transactions from activities`);
                        }

                        for (const tx of transactions) {
                            const rawAmount = tx.amount?.amount || tx.amount || "0";
                            const txAmount = Math.abs(parseFloat(rawAmount));
                            const txDate = new Date(tx.time * 1000);

                            const match = requests.find(r => {
                                if (foundIds.has(r.id)) return false;
                                const diff = Math.abs(r.amount - txAmount);
                                const isAmountMatch = diff < 0.10;
                                const reqDate = new Date(r.date);
                                const isDateMatch = reqDate.getMonth() === txDate.getMonth() && reqDate.getFullYear() === txDate.getFullYear();
                                const mLower = r.merchant.toLowerCase().replace(/[\.\s]/g, '');
                                const isMerchantMatch = mLower.includes("facebook") || mLower.includes("meta") || mLower.includes("facebk") || mLower.includes("fbme");
                                return isMerchantMatch && isAmountMatch && isDateMatch;
                            });

                            if (match) {
                                console.log(`[Meta] Matched Transaction ${tx.id}`);
                                foundIds.add(match.id);

                                if (!files[match.id]) {
                                    try {
                                        updateProgress(`Generating Receipt for ${match.merchant}...`, 93);
                                        const { generateMetaReceiptPdf } = await import("./receipt-generator");
                                        const blob = await generateMetaReceiptPdf({
                                            id: tx.id,
                                            date: txDate,
                                            amount: tx.amount,
                                            currency: tx.currency || "USD",
                                            merchant: "Meta Ads",
                                            account_name: account.name,
                                            account_id: account.id,
                                            billing_reason: tx.billing_reason || "Ad Billing"
                                        });

                                        if (blob) {
                                            const fileName = `Meta_Receipt_${tx.id}.pdf`;
                                            const file = new File([blob], fileName, { type: "application/pdf" });
                                            files[match.id] = file;
                                            foundCount++;
                                            pdfCount++;
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

        // Attach session info to candidates
        if (provider && token) {
            sessionCandidates = sessionCandidates.map(c => ({
                ...c,
                provider: provider as any,
                accessToken: token
            }));
        }

        allCandidates.push(...sessionCandidates);
    }

    const candidates = Array.from(new Map(allCandidates.map(c => [c.id, c])).values());
    updateProgress(`Finalizing results...`, 98);

    // Final pass: NOT_FOUND for unmatched
    for (const req of requests) {
        if (!files[req.id]) {
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

    console.log(`[Scanner] Scan finished. Found: ${foundCount}, PDFs: ${pdfCount}`);
    onProgress?.("Scan complete!", 100, foundCount, pdfCount);
    return { matches, candidates, files };
};
