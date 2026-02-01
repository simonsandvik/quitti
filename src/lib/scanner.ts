import { ReceiptRequest } from "./parser";
import { EmailCandidate, matchReceipt, MatchResult } from "./matcher";
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

import { searchGmail } from "./integrations/gmail";
import { searchOutlook } from "./integrations/outlook";

import { getGmailAttachment } from "./integrations/gmail";
import { getOutlookAttachment } from "./integrations/outlook";
import { uploadReceiptFile } from "./supabase";

export const scanEmails = async (
    sessions: any[], // Array of typed sessions with accessToken
    requests: ReceiptRequest[],
    onProgress?: (status: string, percentage: number, foundCount: number, pdfCount: number) => void,
    userId?: string
): Promise<{ matches: MatchResult[], candidates: EmailCandidate[], files: Record<string, File> }> => {

    let allCandidates: EmailCandidate[] = [];
    const files: Record<string, File> = {};
    const matches: MatchResult[] = [];
    let foundCount = 0;
    let pdfCount = 0;

    onProgress?.("Initializing scan...", 0, 0, 0);

    // Calculate total work for progress bar
    // Scanning (requests * sessions) + Matching (requests)
    // Total Steps = (Sessions * Requests).
    // Each request performed is 1 step.
    const totalSteps = sessions.length * requests.length;
    let completedSteps = 0;

    const updateProgress = (msg: string, currentSessionProgress: number = 0) => {
        // currentSessionProgress is how many requests the CURRENT session has finished (or is working on)
        // totalProgress = completedSteps (from previous sessions) + currentSessionProgress
        const totalProgress = completedSteps + currentSessionProgress;
        const percent = Math.min(Math.round((totalProgress / totalSteps) * 100), 100);
        onProgress?.(msg, percent, foundCount, pdfCount);
    };

    // Process all sessions
    for (const session of sessions) {
        let sessionCandidates: EmailCandidate[] = [];
        const provider = (session?.provider === "google" ? "google" : (session?.provider === "azure-ad" ? "azure-ad" : (session?.provider === "facebook" ? "facebook" : undefined))) as "google" | "azure-ad" | "facebook" | undefined;
        const token = session?.accessToken;
        const email = session?.user?.email || "unknown";

        // State to track current session progress for callbacks
        let currentProgressCount = 0;

        // Progress Handler for Search
        const handleSearchProgress = (msg: string) => {
            // Outlook sends "Check I/N: Merchant" -> We use I as progress
            // Gmail currently sends "Check I-J/N: Merchant" -> We use J as progress
            // We need to extract the number of processed requests in THIS session.

            const matchPair = msg.match(/Check (\d+)-(\d+)\/(\d+)/); // Gmail batch
            const matchSingle = msg.match(/Check (\d+)\/(\d+)/);     // Outlook single

            if (matchPair) {
                currentProgressCount = parseInt(matchPair[2], 10);
            } else if (matchSingle) {
                currentProgressCount = parseInt(matchSingle[1], 10);
            }

            updateProgress(msg, currentProgressCount);
        };



        const handleCandidateFound = async (candidate: EmailCandidate, req: ReceiptRequest) => {
            // Inject provider/token since searchOutlook creates the raw candidate
            const enrichedCandidate = {
                ...candidate,
                provider: provider as any,
                accessToken: token
            };

            try {
                const result = matchReceipt(req, enrichedCandidate);
                console.log(`[Scanner] 🧐 Analyzing candidate for ${req.merchant}: "${enrichedCandidate.subject}" (Confidence: ${result.confidence}, Status: ${result.status})`);

                if (result.confidence > 20) {
                    console.log(`[Scanner Debug] Match candidate for ${req.merchant}: Confidence ${result.confidence.toFixed(2)} - ${enrichedCandidate.subject}`);
                }

                if (result.confidence > 0) {
                    if (result.status === "FOUND") {
                        if (files[req.id]) return;

                        // Content Verification will determine if we push this match
                        // matches.push(result);

                        // Auto-Fetch
                        // STRICT MVP: Only fetching PDFs.
                        // If it's not a PDF, we skip it (as per user request: "only take the receipts with an attached PDF")

                        const pdf = enrichedCandidate.attachments.find(a =>
                            a.type.toLowerCase().includes("pdf") ||
                            a.name.toLowerCase().endsWith(".pdf")
                        );

                        // Removed Image Fallback
                        const target = pdf;

                        if (target) {
                            try {
                                console.log(`[Auto-Fetch] Downloading ${target.name} for receipt ${req.merchant}...`);
                                updateProgress(`Found ${req.merchant}! Downloading...`, currentProgressCount);

                                let blob: Blob | null = null;
                                if (provider === "google") {
                                    blob = await getGmailAttachment(token, enrichedCandidate.id, target.id);
                                } else if (provider === "azure-ad") {
                                    blob = await getOutlookAttachment(token, enrichedCandidate.id, target.id);
                                }

                                if (blob) {
                                    let isValid = true;
                                    const isPdf = target.type.includes("pdf") || target.name.toLowerCase().endsWith(".pdf");

                                    // PDF Content Verification
                                    if (isPdf) {
                                        try {
                                            const arrayBuffer = await blob.arrayBuffer();
                                            const buffer = Buffer.from(arrayBuffer);
                                            const { verifyPdfMatch } = await import("./pdf-parser"); // Dynamic import to avoid top-level issues if server-side only

                                            const verification = await verifyPdfMatch(buffer, req);

                                            if (verification.isMatch) {
                                                console.log(`[Content Verify] PDF Match Confirmed for ${req.merchant}: ${verification.details.join(", ")}`);
                                            } else {
                                                console.warn(`[Content Verify] PDF Mismatch for ${req.merchant}. extracted text did not contain strong signals. Details: ${verification.details.join(", ")}`);

                                                // METADATA OVERRIDE: Accept if email metadata was a very strong match (e.g. Exact Date + Strong Merchant)
                                                // BUT REJECT if we found a Hard Amount Mismatch (e.g. Found 6.00 but needed 500.00)
                                                if (result.confidence > 85 && !verification.hasHardAmountMismatch) {
                                                    console.log(`[Content Verify] OVERRIDE: Accepting file despite PDF content mismatch due to High Confidence Metadata Match (${result.confidence}). (No hard mismatch detected)`);
                                                    isValid = true;
                                                } else if (verification.hasHardAmountMismatch) {
                                                    console.log(`[Content Verify] REJECTING: Hard Amount Mismatch detected. Metadata confidence (${result.confidence}) overridden by content failure.`);
                                                    isValid = false;
                                                } else {
                                                    // STRICT CHECK: If we extracted text successfully (>50 chars) but failed to match, it's a BAD match
                                                    if (verification.extractedText && verification.extractedText.length > 50) {
                                                        console.log(`[Content Verify] REJECTING: Valid text found but content mismatch. False Positive prevented.`);
                                                        isValid = false;
                                                    } else {
                                                        // Text extraction likely failed or PDF is image-only
                                                        console.log(`[Content Verify] WARNING: Low text extraction. Trusting metadata match due to lack of evidence.`);
                                                        isValid = true;
                                                    }
                                                }
                                            }
                                        } catch (err) {
                                            console.error("[Content Verify] Failed to parse PDF", err);
                                            // If parse fails, do we discard? 
                                            // Maybe safer to keep it if metadata match was strong?
                                            // Let's keep it but warn.
                                        }
                                    }

                                    if (isValid) {
                                        const file = new File([blob], target.name, { type: target.type || blob.type });
                                        files[req.id] = file;
                                        matches.push(result); // ONLY push match if content verified
                                        foundCount++;

                                        // Track PDF count
                                        if (isPdf) {
                                            pdfCount++;
                                        }

                                        updateProgress(`Saved ${req.merchant}`, completedSteps + currentProgressCount);
                                        console.log(`[Auto-Fetch] Success! Created file: ${file.name} (${file.size})`);

                                        // Trigger Cloud Upload if User ID is present
                                        let storagePath = undefined;
                                        if (userId) {
                                            try {
                                                console.log(`[Cloud Sync] Uploading ${file.name} to Supabase...`);
                                                storagePath = await uploadReceiptFile(userId, req.id, file);
                                                console.log(`[Cloud Sync] Upload complete: ${storagePath}`);
                                            } catch (e) {
                                                console.error(`[Cloud Sync] Failed to upload ${file.name}`, e);
                                            }
                                        }

                                        // Update the match result with the storage path (referenced when saving to DB later)
                                        result.storagePath = storagePath;
                                        result.matchedHtml = undefined; // Optimization: Don't store huge HTML if we have a file? Maybe keep it for debug.
                                    } else {
                                        console.log(`[Auto-Fetch] Skipped ${target.name} due to content mismatch.`);
                                    }
                                }
                            } catch (e) {
                                console.error("Failed to auto-fetch attachment", e);
                            }
                        }
                    } else {
                        console.log(`[Scanner Debug] Match FOUND for ${req.merchant} but NO PDF/Attachment. Skipping (Text-Only Disabled).`);
                    }
                }
            } catch (err) {
                console.error(`[Scanner Error] Matching logic failed for ${req.merchant}`, err);
            }
        };

        // Check for Real Providers
        if (provider === "google" && token) {
            console.log(`Starting Gmail Scan for ${email}...`);
            updateProgress(`Scanning Gmail (${email})...`);
            try {
                sessionCandidates = await searchGmail(token, requests, handleSearchProgress);
            } catch (e) {
                console.error("Gmail Scan Error", e);
                sessionCandidates = [];
            }
        } else if (provider === "azure-ad" && token) {
            console.log(`Starting Outlook Scan for ${email}...`);
            updateProgress(`Scanning Outlook (${email})...`);
            try {
                sessionCandidates = await searchOutlook(token, requests, handleSearchProgress, handleCandidateFound);
            } catch (e) {
                console.error("Outlook Scan Error", e);
                sessionCandidates = [];
            }
        } else {
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

                    for (const customerResourceName of customers) {
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
                                    if (files[r.id]) return false;

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

                for (const sub of subs) {
                    if (sub.state !== 'Enabled') continue;

                    try {
                        const invoices = await listInvoices(token, sub.subscriptionId);
                        console.log(`[Azure] Found ${invoices.length} invoices for ${sub.displayName}`);

                        for (const inv of invoices) {
                            // Try to match this invoice to a Request
                            const invAmount = inv.properties.grandTotal?.amount || 0;
                            const invDate = new Date(inv.properties.invoicePeriodEndDate);

                            const match = requests.find(r => {
                                if (files[r.id]) return false;

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
                const { listAdAccounts, listAdAccountTransactions, downloadMetaFile } = await import("./meta-ads");

                const accounts = await listAdAccounts(token);
                console.log(`[Meta] Found ${accounts.length} ad accounts`);

                for (const account of accounts) {
                    try {
                        // Transactions often contain invoice IDs and amounts
                        const transactions = await listAdAccountTransactions(token, account.id);
                        console.log(`[Meta] Found ${transactions.length} transactions for ${account.name}`);

                        for (const tx of transactions) {
                            const txAmount = Math.abs(parseFloat(tx.amount?.amount || "0"));
                            const txDate = new Date(tx.time * 1000);

                            const match = requests.find(r => {
                                if (files[r.id]) return false;

                                // Amount Check
                                const diff = Math.abs(r.amount - txAmount);
                                const isAmountMatch = diff < 0.05;

                                // Date Check (Month/Year)
                                const reqDate = new Date(r.date);
                                const isDateMatch = reqDate.getMonth() === txDate.getMonth() && reqDate.getFullYear() === txDate.getFullYear();

                                // Merchant "Facebook" or "Meta"
                                const isMerchantMatch = r.merchant.toLowerCase().includes("facebook") || r.merchant.toLowerCase().includes("meta");

                                return isAmountMatch && (isDateMatch || isMerchantMatch);
                            });

                            if (match) {
                                console.log(`[Meta] Matched Transaction ${tx.id} to Request ${match.merchant} (${match.amount})`);

                                // Meta rarely gives a direct PDF URL for transactions via API, 
                                // but if it does (not in current transactions fields but maybe invoices)
                                // For now, we report the match. If we find a way to get the PDF, we'll download it.

                                matches.push({
                                    receiptId: match.id,
                                    emailId: `meta-${tx.id}`,
                                    status: "FOUND",
                                    confidence: 100,
                                    details: `Direct Meta Ads API Match (ID: ${tx.id})`,
                                    matchedHtml: `<div>Meta Transaction Match: ${tx.billing_reason || 'Billing'}</div>`
                                });

                                // Note: pdfCount won't increment unless we find a download_uri
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

    onProgress?.("Finalizing results...", 100, foundCount, pdfCount);
    return { matches, candidates, files };
};
