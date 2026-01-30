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

    // --- 2. Merchant & Keyword Scoring (Max 40) ---
    const merchantLower = request.merchant.toLowerCase();
    const senderLower = email.sender.toLowerCase();
    const subjectLower = email.subject.toLowerCase();
    const bodySnippetLower = (email.snippet || "").toLowerCase();
    const senderNameLower = senderLower.split('<')[0].trim();

    const rule = getMerchantRule(request.merchant);
    let merchantScore = 0;
    let merchantHit = "";

    // A. Direct Name Match (35 pts)
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
        merchantScore = 35;
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
            merchantScore = 15;
            merchantHit = "Fuzzy Name Match";
        }
    }

    // C. Domain Match (Boosting +20)
    if (rule?.domains) {
        if (rule.domains.some(d => senderLower.includes(d))) {
            merchantScore += 20;
            detailsParts.push(`Domain Match (${rule.domains[0]})`);
        }
    }

    // D. Keyword Anchor Match (Boosting +15)
    // If we haven't hit a strong name match yet, keywords are critical.
    if (rule?.keywords) {
        const foundKeyword = rule.keywords.find(k =>
            subjectLower.includes(k.toLowerCase()) ||
            bodySnippetLower.includes(k.toLowerCase())
        );

        if (foundKeyword) {
            merchantScore += 15;
            detailsParts.push(`Keyword Match (${foundKeyword})`);
        }
    }

    // Cap merchant score at 40 (decreased from 60)
    merchantScore = Math.min(merchantScore, 40);

    if (merchantScore > 0) {
        score += merchantScore;
        detailsParts.push(`Merchant: ${merchantHit || "Rule Match"} (+${merchantScore})`);
    }


    // --- 3. Attachment Check (Max 20) ---
    // STRICT MODE: Must have attachment
    if (!email.hasAttachments || email.attachments.length === 0) {
        return {
            receiptId: request.id,
            emailId: email.id,
            status: "NOT_FOUND",
            confidence: 0,
            details: "Skipped: No attachments",
            matchedHtml: undefined
        };
    }
    score += 20;
    detailsParts.push("Has Attachment");


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
}

export function matchReceiptByContent(text: string, request: ReceiptRequest): ContentMatchScore {
    const normText = text.toLowerCase().replace(/\s+/g, ' ');
    const details: string[] = [];
    let score = 0;

    // --- 1. Amount Scoring (Max 50) ---
    const tolerance = 0.20;
    const amountRegex = /(?:[\$€£¥]|USD|EUR|GBP|SEK|NOK|DKK)?\s*(\d{1,3}(?:[\s,]\d{3})*(?:[.,]\d{2}))(?![0-9])/gi;
    const matches = normText.matchAll(amountRegex);
    let amountFound = false;

    for (const match of matches) {
        const rawAmount = match[1]
            .replace(/\s/g, '')
            .replace(/,(\d{2})$/, '.$1') // European decimal
            .replace(/,/g, ''); // Thousands separator

        const parsedAmount = parseFloat(rawAmount);
        if (!isNaN(parsedAmount) && parsedAmount > 0) {
            const diff = Math.abs(parsedAmount - request.amount) / request.amount;

            // Exact Amount (+70)
            if (diff <= 0.01) {
                amountFound = true;
                score += 70;
                details.push(`Amount Exact Match (${parsedAmount})`);
                break;
            }
            // Fuzzy Amount (+40)
            else if (diff <= tolerance) {
                if (!amountFound) {
                    amountFound = true;
                    score += 40;
                    details.push(`Amount Fuzzy Match (${parsedAmount})`);
                }
            }
        }
    }

    if (!amountFound) {
        details.push(`Amount NOT found (${request.amount})`);
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

    return { score, details };
}
