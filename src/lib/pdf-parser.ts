import { ReceiptRequest } from "./parser";

export interface PdfContentMatch {
    isMatch: boolean;
    confidence: number;
    details: string[];
    extractedText: string;
    hasHardAmountMismatch?: boolean;
}

export const parsePdfContent = async (buffer: Uint8Array | Buffer): Promise<string> => {
    // Only run in browser - pdfjs-dist requires DOM APIs
    if (typeof window === "undefined") {
        console.log("[PDF Parser] Skipping - not in browser environment");
        return "";
    }

    try {
        // Dynamic import to avoid SSR issues with pdfjs-dist
        const pdfjsLib = await import("pdfjs-dist");

        // Configure worker for browser environment
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        }

        // Ensure we have a Uint8Array
        const data = buffer instanceof Buffer ? new Uint8Array(buffer) : buffer;

        // Load document
        const loadingTask = pdfjsLib.getDocument({ data });
        const pdf = await loadingTask.promise;

        let fullText = "";

        // Extract text from all pages
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
                .map((item: any) => item.str)
                .join(" ");
            fullText += pageText + "\n";
        }

        // No OCR fallback - if PDF has no text layer, return empty string
        if (!fullText.trim()) {
            console.log("[PDF Parser] No text layer found. Skipping (no OCR).");
        }

        return fullText;
    } catch (e) {
        console.error("[PDF Parser] Extraction failed", e);
        return "";
    }
};

import { matchReceiptByContent } from "./matcher";

export const verifyPdfMatch = async (buffer: Uint8Array | Buffer, request: ReceiptRequest): Promise<PdfContentMatch> => {
    const text = await parsePdfContent(buffer);

    // Use centralized "Ultimate" matching logic
    const { score, details, allAmountsFound } = matchReceiptByContent(text, request);

    // Accept if Score >= 50
    // (Exact Amount = 50 -> Match)
    // (Fuzzy Amount 30 + Keyword 25 = 55 -> Match)
    const isMatch = score >= 50;

    // Detect Hard Mismatch: We found amounts, but none were close to correct.
    // If allAmountsFound is empty, it means OCR failed or text extraction failed (Soft Mismatch).
    // If allAmountsFound has values, but isMatch is false, it's a Hard Mismatch.
    const hasHardAmountMismatch = !isMatch && (allAmountsFound && allAmountsFound.length > 0);

    return {
        isMatch,
        confidence: score,
        details,
        extractedText: text,
        hasHardAmountMismatch
    };
};

/**
 * Simple PDF verification: checks if PDF contains amount, date (±3 days), and merchant name.
 * Returns true only if ALL three criteria are found.
 */
export const verifyPdfForRequest = (text: string, request: ReceiptRequest): { isMatch: boolean; details: string[]; dateOffset: number } => {
    const normText = text.toLowerCase().replace(/\s+/g, ' ');
    const details: string[] = [];

    if (!text.trim()) {
        return { isMatch: false, details: ["No text extracted from PDF"], dateOffset: Infinity };
    }

    // --- 1. AMOUNT CHECK (required) ---
    let amountFound = false;
    const amountStr = request.amount.toFixed(2);
    const amountEU = amountStr.replace('.', ',');
    // Also check for amount without decimals for round numbers
    const amountInt = Math.floor(request.amount).toString();
    // Check for amount with space as thousands separator (e.g., "1 234,56")
    const amountWithSpaces = request.amount >= 1000
        ? request.amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ').replace('.', ',')
        : null;

    if (normText.includes(amountStr) || normText.includes(amountEU)) {
        amountFound = true;
        details.push(`Amount found: ${amountStr}`);
    } else if (amountWithSpaces && normText.includes(amountWithSpaces.toLowerCase())) {
        amountFound = true;
        details.push(`Amount found (spaces): ${amountWithSpaces}`);
    } else if (request.amount === Math.floor(request.amount) && normText.includes(amountInt)) {
        amountFound = true;
        details.push(`Amount found (integer): ${amountInt}`);
    }

    // --- 2. DATE CHECK (±3 days) ---
    let dateFound = false;
    let dateOffset = Infinity;
    const reqDate = new Date(request.date);

    for (let offset = -3; offset <= 3 && !dateFound; offset++) {
        const d = new Date(reqDate);
        d.setDate(d.getDate() + offset);
        const day = d.getDate();
        const month = d.getMonth() + 1;
        const year = d.getFullYear();

        const formats = [
            // ISO format
            `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
            // European formats
            `${day}.${month}.${year}`,
            `${day.toString().padStart(2, '0')}.${month.toString().padStart(2, '0')}.${year}`,
            `${day}/${month}/${year}`,
            `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`,
            // US format
            `${month}/${day}/${year}`,
            `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year}`,
        ];

        for (const f of formats) {
            if (normText.includes(f)) {
                dateFound = true;
                dateOffset = Math.abs(offset);
                details.push(`Date found: ${f} (offset: ${offset}d)`);
                break;
            }
        }
    }

    // --- 3. MERCHANT CHECK ---
    let merchantFound = false;
    const merchantLower = request.merchant.toLowerCase();
    const STOP_WORDS = new Set(["oy", "ab", "ltd", "inc", "corp", "gmbh", "the", "and", "for", "co", "llc"]);
    const tokens = merchantLower.split(/[^a-z0-9]+/g).filter(t => t.length >= 2 && !STOP_WORDS.has(t));

    for (const token of tokens) {
        if (token.length < 4) {
            // Short tokens need word boundary to avoid false positives
            const regex = new RegExp(`\\b${token}\\b`, 'i');
            if (regex.test(normText)) {
                merchantFound = true;
                details.push(`Merchant found: "${token}"`);
                break;
            }
        } else if (normText.includes(token)) {
            merchantFound = true;
            details.push(`Merchant found: "${token}"`);
            break;
        }
    }

    // --- RESULT: All 3 must pass ---
    if (!amountFound) details.push(`Amount NOT found: ${amountStr}`);
    if (!dateFound) details.push(`Date NOT found within ±3 days of ${request.date}`);
    if (!merchantFound) details.push(`Merchant NOT found: ${tokens.join(', ')}`);

    const isMatch = amountFound && dateFound && merchantFound;

    return { isMatch, details, dateOffset };
};
