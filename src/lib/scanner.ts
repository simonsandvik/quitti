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
    console.log(`[Diagnostic] scanEmails starting for ${requests.length} receipts.`);

    let allCandidates: EmailCandidate[] = [];
    const files: Record<string, File> = {};
    const matches: MatchResult[] = [];
    const foundIds = new Set<string>();
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

                if (result.confidence > 0 && (result.status === "FOUND" || result.status === "POSSIBLE")) {
                    if (foundIds.has(req.id)) return;
                    foundIds.add(req.id);

                    // --- Strategy 1: PDF Attachment (original behavior) ---
                    const pdf = enrichedCandidate.attachments.find(a =>
                        a.type.toLowerCase().includes("pdf") ||
                        a.name.toLowerCase().endsWith(".pdf")
                    );

                    if (pdf) {
                        try {
                            console.log(`[Auto-Fetch] Downloading ${pdf.name} for receipt ${req.merchant}...`);
                            updateProgress(`Found ${req.merchant}! Downloading...`, currentProgressCount);

                            let blob: Blob | null = null;
                            if (provider === "google") {
                                blob = await getGmailAttachment(token, enrichedCandidate.id, pdf.id);
                            } else if (provider === "azure-ad") {
                                blob = await getOutlookAttachment(token, enrichedCandidate.id, pdf.id);
                            }

                            if (blob) {
                                let isValid = true;

                                // PDF Content Verification
                                try {
                                    const arrayBuffer = await blob.arrayBuffer();
                                    const buffer = Buffer.from(arrayBuffer);
                                    const { verifyPdfMatch } = await import("./pdf-parser");

                                    const verification = await verifyPdfMatch(buffer, req);

                                    if (verification.isMatch) {
                                        console.log(`[Content Verify] PDF Match Confirmed for ${req.merchant}: ${verification.details.join(", ")}`);
                                    } else {
                                        console.warn(`[Content Verify] PDF Mismatch for ${req.merchant}. Details: ${verification.details.join(", ")}`);

                                        if (result.confidence > 85 && !verification.hasHardAmountMismatch) {
                                            console.log(`[Content Verify] OVERRIDE: Accepting due to High Confidence Metadata Match (${result.confidence}).`);
                                            isValid = true;
                                        } else if (verification.hasHardAmountMismatch) {
                                            console.log(`[Content Verify] REJECTING: Hard Amount Mismatch detected.`);
                                            isValid = false;
                                        } else {
                                            if (verification.extractedText && verification.extractedText.length > 50) {
                                                console.log(`[Content Verify] REJECTING: Valid text found but content mismatch.`);
                                                isValid = false;
                                            } else {
                                                console.log(`[Content Verify] WARNING: Low text extraction. Trusting metadata match.`);
                                                isValid = true;
                                            }
                                        }
                                    }
                                } catch (err) {
                                    console.error("[Content Verify] Failed to parse PDF", err);
                                }

                                if (isValid) {
                                    const file = new File([blob], pdf.name, { type: pdf.type || blob.type });
                                    files[req.id] = file;
                                    matches.push(result);
                                    foundCount++;
                                    pdfCount++;

                                    updateProgress(`Saved ${req.merchant}`, completedSteps + currentProgressCount);
                                    console.log(`[Auto-Fetch] Success! Created file: ${file.name} (${file.size})`);

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

                                    result.storagePath = storagePath;
                                    result.matchedHtml = undefined;
                                    return; // PDF found and verified, done with this candidate
                                } else {
                                    console.log(`[Auto-Fetch] Skipped ${pdf.name} due to content mismatch.`);
                                    // Fall through to HTML fallback
                                    foundIds.delete(req.id);
                                }
                            }
                        } catch (e) {
                            console.error("Failed to auto-fetch attachment", e);
                            foundIds.delete(req.id);
                        }
                    }

                    // --- Strategy 2: HTML Email Body → PDF (fallback) ---
                    if (!files[req.id] && enrichedCandidate.bodyHtml) {
                        try {
                            const { analyzeHtmlReceipt, cleanEmailHtml } = await import("./html-receipt-detector");
                            const analysis = analyzeHtmlReceipt(enrichedCandidate.bodyHtml, req);

                            if (analysis.isReceipt) {
                                console.log(`[HTML Receipt] Email body IS a receipt for ${req.merchant} (confidence: ${analysis.confidence})`);
                                updateProgress(`Converting email receipt for ${req.merchant}...`, currentProgressCount);

                                const cleanedHtml = cleanEmailHtml(enrichedCandidate.bodyHtml, req.merchant);
                                const { htmlToPdfBlob } = await import("./pdf");
                                const pdfBlob = await htmlToPdfBlob(cleanedHtml);

                                if (pdfBlob && pdfBlob.size > 0) {
                                    const fileName = `${req.merchant.replace(/[^a-zA-Z0-9]/g, '_')}_${req.date}_email.pdf`;
                                    const file = new File([pdfBlob], fileName, { type: "application/pdf" });
                                    files[req.id] = file;
                                    foundIds.add(req.id);
                                    matches.push({
                                        ...result,
                                        status: "FOUND",
                                        details: result.details + ", HTML Email → PDF",
                                    });
                                    foundCount++;
                                    pdfCount++;

                                    updateProgress(`Saved ${req.merchant} (from email)`, completedSteps + currentProgressCount);
                                    console.log(`[HTML Receipt] Success! Converted email to PDF: ${fileName} (${file.size})`);

                                    let storagePath = undefined;
                                    if (userId) {
                                        try {
                                            storagePath = await uploadReceiptFile(userId, req.id, file);
                                            console.log(`[Cloud Sync] Upload complete: ${storagePath}`);
                                        } catch (e) {
                                            console.error(`[Cloud Sync] Failed to upload ${fileName}`, e);
                                        }
                                    }

                                    result.storagePath = storagePath;
                                    return; // HTML receipt converted, done
                                }
                            } else {
                                console.log(`[HTML Receipt] Email body is NOT a receipt for ${req.merchant} (confidence: ${analysis.confidence})`);
                            }
                        } catch (e) {
                            console.error(`[HTML Receipt] Failed to process HTML body for ${req.merchant}`, e);
                        }
                    }

                    // Always release if neither strategy produced a file
                    if (!files[req.id]) {
                        foundIds.delete(req.id);
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
                sessionCandidates = await searchGmail(token, requests, handleSearchProgress, handleCandidateFound);
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
