import { ReceiptRequest } from "./parser";

export interface EmailCandidate {
    id: string;
    subject: string;
    sender: string;
    date: Date;
    snippet?: string;
    bodyHtml?: string; // Full HTML body for PDF conversion
    hasAttachments: boolean;
    attachments: { name: string; type: string; size: number; id: string }[];
    provider?: "google" | "azure-ad";
    accessToken?: string;
}

export type MatchStatus = "FOUND" | "POSSIBLE" | "NOT_FOUND" | "MISSING";

export interface MatchResult {
    receiptId: string;
    emailId: string;
    status: MatchStatus;
    confidence: number;
    details: string;
    matchedHtml?: string; // Stored HTML from email candidate
    storagePath?: string; // Cloud bucket path for matched file
}

/**
 * Simple Levenshtein distance implementation for fuzzy matching
 */
function levenshteinDistance(a: string, b: string): number {
    const matrix = Array.from({ length: a.length + 1 }, () =>
        Array.from({ length: b.length + 1 }, (_, i) => i)
    );
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    return matrix[a.length][b.length];
}

/**
 * Check if two strings have a fuzzy match based on a threshold
 */
function isFuzzyMatch(a: string, b: string, threshold: number = 0.8): boolean {
    if (!a || !b) return false;
    const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
    const maxLength = Math.max(a.length, b.length);
    const similarity = 1 - distance / maxLength;
    return similarity >= threshold;
}

import { getMerchantRule } from "./merchant-rules";

export const matchReceipt = (request: ReceiptRequest, email: EmailCandidate): MatchResult => {
    let score = 0;
    const detailsParts: string[] = [];

    // DEBUG: Log the sender to debug Domain Matching issues
    if (request.merchant.toLowerCase().includes("finnair")) {
        console.log(`[Matcher Debug] Analyzing Finnair Candidate | Sender: "${email.sender}" | Subject: "${email.subject}"`);
    }

    // --- 1. Date Scoring (Max 25) ---
    const reqDate = new Date(request.date);
    const emailDate = new Date(email.date);
    const diffTime = Math.abs(emailDate.getTime() - reqDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffTime <= 1000 * 60 * 60 * 24) { // Within 24h
        score += 25;
        detailsParts.push("Date: Exact (24h)");
    } else if (diffDays <= 3) { // Close range
        score += 15;
        detailsParts.push(`Date: Close (${diffDays}d)`);
    } else if (diffDays <= 7) { // Weekly range
        score += 5;
        detailsParts.push(`Date: Week (${diffDays}d)`);
    }

    // --- 2. Merchant & Keyword Scoring (Max 40 -> Uncapped for Domains) ---
    const merchantLower = request.merchant.toLowerCase();
    const senderLower = email.sender.toLowerCase();
    const subjectLower = email.subject.toLowerCase();
    const bodySnippetLower = (email.snippet || "").toLowerCase();
    const senderNameLower = senderLower.split('<')[0].trim();

    const rule = getMerchantRule(request.merchant);
    let baseNameScore = 0;
    let bonusScore = 0;
    let merchantHit = "";

    // A. Direct Name Match (30 pts)
    // VR FIX: Allow 2-letter words but block specific stop words
    const STOP_WORDS = new Set(["oy", "ab", "ltd", "inc", "corp", "pllc", "gmbh", "the", "and", "for", "receipt", "payment", "invoice", "no-reply", "support", "hello", "team", "to", "at", "on", "in", "of", "by", "is", "it", "no"]);
    const merchantTokens = merchantLower.split(/[^a-z0-9]+/g).filter(t => t.length >= 2 && !STOP_WORDS.has(t));

    const isDirectMatch = merchantTokens.some(token => {
        if (token.length < 4) {
            // Use word boundary for short tokens to avoid false positives (e.g. "vr" in "over")
            const regex = new RegExp(`\\b${token}\\b`, 'i');
            return regex.test(senderNameLower) || regex.test(subjectLower);
        }
        return senderNameLower.includes(token) || subjectLower.includes(token);
    });

    if (isDirectMatch) {
        baseNameScore = 30;
        merchantHit = "Direct Name Match";
    } else {
        // B. Fuzzy Name Match (15 pts)
        const isFuzzy = merchantTokens.some(token => {
            if (token.length > 4) {
                const senderParts = senderNameLower.split(/[^a-z0-9]+/g);
                return senderParts.some(sp => isFuzzyMatch(sp, token, 0.85));
            }
            return false;
        });

        if (isFuzzy) {
            baseNameScore = 15;
            merchantHit = "Fuzzy Name Match";
        }
    }

    // C. Microsoft / Invoice ID Match (Golden Key +100)
    // Microsoft often includes the Invoice ID in the merchant string: "Microsoft-G092604318"
    const msIdMatch = request.merchant.match(/G\d{10,12}/);
    if (msIdMatch) {
        const invoiceId = msIdMatch[0];
        console.log(`[Matcher] Looking for Invoice ID: ${invoiceId}`);

        // Check Subject or Filename
        const idInSubject = email.subject.includes(invoiceId);
        const idInFilename = email.attachments.some(a => a.name.includes(invoiceId));

        if (idInSubject || idInFilename) {
            bonusScore += 100; // GUARANTEED MATCH
            detailsParts.push(`Invoice ID Match (${invoiceId})`);
        }
    }

    // D. Domain Match (Boosting +35)
    // High trust signal
    if (rule?.domains) {
        if (rule.domains.some(d => senderLower.includes(d))) {
            bonusScore += 35;
            detailsParts.push(`Domain Match (${rule.domains[0]})`);
        }
    }

    // D. Keyword Anchor Match (Boosting +15)
    if (rule?.keywords) {
        const foundKeyword = rule.keywords.find(k =>
            subjectLower.includes(k.toLowerCase()) ||
            bodySnippetLower.includes(k.toLowerCase())
        );

        if (foundKeyword) {
            bonusScore += 15;
            detailsParts.push(`Keyword Match (${foundKeyword})`);
        }
    }

    // E. Global Hallmark Match (Boosting +10)
    // Helps with unknown merchants or missing keywords
    const GLOBAL_HALLMARKS = ["receipt", "invoice", "payment", "order", "confirmation", "booking", "ticket", "kvitto", "lasku", "faktura", "kuitti", "tilausvahvistus", "bokning", "biljett"];
    const foundHallmark = GLOBAL_HALLMARKS.find(h => subjectLower.includes(h));

    // Only apply if we haven't already hit a specific keyword match (to avoid double counting)
    if (foundHallmark && !detailsParts.some(d => d.includes("Keyword Match"))) {
        bonusScore += 10;
        detailsParts.push(`Global Hallmark (${foundHallmark})`);
    }

    // Combine Scores
    // We cap the Name Match impact, but allow Domains/Keywords to boost freely
    const merchantScore = Math.min(baseNameScore, 30) + bonusScore;

    if (merchantScore > 0) {
        score += merchantScore;
        detailsParts.push(`Merchant: ${merchantHit || "Rule Match"} (+${merchantScore})`);
    }


    // --- 3. Attachment Check (Max 20) ---
    // STRICT MODE: Must have PDF attachment (User Request for MVP)
    const hasPdf = email.attachments.some(a =>
        a.type.toLowerCase().includes("pdf") ||
        a.name.toLowerCase().endsWith(".pdf")
    );

    if (!hasPdf) {
        return {
            receiptId: request.id,
            emailId: email.id,
            status: "NOT_FOUND",
            confidence: 0,
            details: "Skipped: No PDF attachment",
            matchedHtml: undefined
        };
    }
    score += 20;
    detailsParts.push("Has PDF Attachment");


    // --- 4. Final Status Determination ---
    // Thresholds: FOUND >= 75, POSSIBLE >= 45
    let status: MatchStatus = "NOT_FOUND";
    if (score >= 75) status = "FOUND";
    else if (score >= 45) status = "POSSIBLE";

    return {
        receiptId: request.id,
        emailId: email.id,
        status,
        confidence: score,
        details: detailsParts.join(", "),
        matchedHtml: email.bodyHtml
    };
};

export interface ContentMatchScore {
    score: number;
    details: string[];
    foundAmount?: number;
}

export function matchReceiptByContent(text: string, request: ReceiptRequest): ContentMatchScore {
    const normText = text.toLowerCase().replace(/\s+/g, ' ');
    const details: string[] = [];
    let score = 0;
    let foundAmount: number | undefined;

    // --- 1. Amount Scoring (Max 50) ---
    // STRICTER TOLERANCE: 5% (Prevent 83 EUR matching 95 EUR)
    const tolerance = 0.05;
    const amountRegex = /(?:[\$€£¥]|USD|EUR|GBP|SEK|NOK|DKK)?\s*(\d{1,3}(?:[\s,]\d{3})*(?:[.,]\d{2}))(?![0-9])/gi;
    const matches = normText.matchAll(amountRegex);
    let amountFound = false;
    const allAmountsFound: number[] = [];

    for (const match of matches) {
        const rawAmount = match[1]
            .replace(/\s/g, '')
            .replace(/,(\d{2})$/, '.$1') // European decimal
            .replace(/,/g, ''); // Thousands separator

        const parsedAmount = parseFloat(rawAmount);
        if (!isNaN(parsedAmount) && parsedAmount > 0) {
            allAmountsFound.push(parsedAmount);
            const diff = Math.abs(parsedAmount - request.amount) / request.amount;

            // Exact Amount (+70)
            if (diff <= 0.01) {
                amountFound = true;
                score += 70;
                foundAmount = parsedAmount;
                details.push(`Amount Exact Match (${parsedAmount})`);
                break;
            }
            // Fuzzy Amount (+35) - Reduced score so it requires other signals
            else if (diff <= tolerance) {
                if (!amountFound) {
                    amountFound = true;
                    score += 35; // Lowered from 40 to prevent Date (10) + Fuzzy (35) = 45 < 50
                    foundAmount = parsedAmount;
                    details.push(`Amount Fuzzy Match (${parsedAmount})`);
                }
            }
        }
    }

    if (!amountFound) {
        // PENALTY: Validating amount is critical for automated receipts.
        // If we can't find the money, we can't trust the match.
        score -= 60;
        details.push(`Amount NOT found (${request.amount}) [-60]`);
    }

    // --- 2. Merchant & Keyword Scoring (Max 20) ---
    const merchantLower = request.merchant.toLowerCase();

    // VR FIX: Allow 2-letter tokens here too, matching the logic in matchReceipt
    const STOP_WORDS = new Set(["oy", "ab", "ltd", "inc", "corp", "pllc", "gmbh", "the", "and", "for", "receipt", "payment", "invoice", "no-reply", "support", "hello", "team", "to", "at", "on", "in", "of", "by", "is", "it", "no"]);
    const tokens = merchantLower.split(/[^a-z0-9]+/g).filter(t => t.length >= 2 && !STOP_WORDS.has(t));

    let merchantScore = 0;

    // A. Direct Token Match (+20)
    if (tokens.some(t => {
        if (t.length < 4) {
            const regex = new RegExp(`\\b${t}\\b`, 'i');
            return regex.test(normText);
        }
        return normText.includes(t);
    })) {
        merchantScore += 20;
        details.push("Merchant Name Found");
    }
    // B. Rule-based Keyword Match (+25)
    else {
        const rule = getMerchantRule(request.merchant);
        if (rule?.keywords) {
            const foundKey = rule.keywords.find(k => normText.includes(k.toLowerCase()));
            if (foundKey) {
                merchantScore += 25;
                details.push(`Merchant Keyword Found (${foundKey})`);
            }
        }
    }
    score += merchantScore;

    // --- 3. Date Scoring (Max 10) ---
    if (request.date) {
        const reqDate = new Date(request.date);
        const day = reqDate.getDate();
        const month = reqDate.getMonth() + 1;
        const year = reqDate.getFullYear();
        const dateFormats = [
            `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
            `${day}.${month}.${year}`,
            `${day}/${month}/${year}`
        ];

        if (dateFormats.some(d => normText.includes(d))) {
            score += 10;
            details.push("Date Found");
        }
    }

    // ... (inside matchReceiptByContent) ...

    return {
        score,
        details,
        foundAmount,
        allAmountsFound: allAmountsFound, // Expose all amounts found for Hard Mismatch check
        matches: {
            amount: score >= 40 && amountFound, // 40 is fuzzy amount threshold
            merchant: merchantScore > 0,
            date: details.some(d => d.includes("Date Found"))
        }
    };
}

export interface ContentMatchScore {
    score: number;
    details: string[];
    foundAmount?: number;
    allAmountsFound?: number[];
    matches: {
        amount: boolean;
        merchant: boolean;
        date: boolean;
    };
}
