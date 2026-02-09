import { ReceiptRequest } from "./parser";

/** Quick amount pre-filter for LLM verification. Checks if text contains the amount in any common format.
 *  Uses non-digit boundaries to prevent "25.00" matching inside "125.00". */
export function textContainsAmount(text: string, amount: number): boolean {
    const normText = text.toLowerCase().replace(/\s+/g, ' ');
    const amountStr = amount.toFixed(2); // "25.00"
    const amountEU = amountStr.replace('.', ','); // "25,00"

    // Escape dots for regex, use non-digit lookbehind/lookahead
    const escDot = amountStr.replace('.', '\\.');
    if (new RegExp(`(?<!\\d)${escDot}(?!\\d)`).test(normText)) return true;
    if (new RegExp(`(?<!\\d)${amountEU}(?!\\d)`).test(normText)) return true;

    // Thousands separator: "1 234,56"
    if (amount >= 1000) {
        const withSpaces = amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ').replace('.', ',');
        const escSpaces = withSpaces.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`(?<!\\d)${escSpaces}(?!\\d)`).test(normText)) return true;
    }

    // Integer match for round numbers: "25" but not "25.50" or "125"
    if (amount === Math.floor(amount)) {
        const amountInt = Math.floor(amount).toString();
        if (new RegExp(`(?<!\\d)${amountInt}(?![.,\\d])`).test(normText)) return true;
    }

    return false;
}

export interface PdfContentMatch {
    isMatch: boolean;
    confidence: number;
    details: string[];
    extractedText: string;
    hasHardAmountMismatch?: boolean;
}

export const parsePdfContent = async (buffer: Uint8Array | Buffer, ocrWorker?: any): Promise<string> => {
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
            page.cleanup(); // Release page resources
        }

        // OCR FALLBACK: If no text layer and PDF is short (receipt-sized), try OCR
        if (!fullText.trim() && ocrWorker && pdf.numPages <= 3) {
            console.log(`[PDF Parser] No text layer. Running OCR on page 1 (${pdf.numPages} pages)...`);
            try {
                const page = await pdf.getPage(1);
                const viewport = page.getViewport({ scale: 2.0 }); // 2x scale for better OCR quality
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d')!;
                await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
                page.cleanup();

                // Convert canvas to image blob for Tesseract
                const imageBlob = await new Promise<Blob>((resolve) => {
                    canvas.toBlob((blob) => resolve(blob!), 'image/png');
                });

                const { data: { text } } = await ocrWorker.recognize(imageBlob);
                fullText = text;
                console.log(`[PDF Parser] OCR extracted ${text.length} chars`);

                // Clean up canvas
                canvas.width = 0;
                canvas.height = 0;
            } catch (ocrErr) {
                console.error("[PDF Parser] OCR failed:", ocrErr);
            }
        } else if (!fullText.trim()) {
            const reason = !ocrWorker ? "no OCR worker" : pdf.numPages > 3 ? `too many pages (${pdf.numPages})` : "unknown";
            console.log(`[PDF Parser] No text layer found. Skipping (${reason}).`);
        }

        // CRITICAL: Destroy PDF document to free memory (prevents tab crash on 900+ PDFs)
        pdf.destroy();

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
 * PDF verification: checks if PDF contains amount and date (±3 days).
 * Merchant is logged but not required — credit card statement names often differ from receipt text.
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

    // --- 2. DATE CHECK (±5 days, comprehensive formats) ---
    let dateFound = false;
    let dateOffset = Infinity;
    const reqDate = new Date(request.date);

    const MONTH_NAMES_FI = ['tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu', 'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu'];
    const MONTH_NAMES_SV = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
    const MONTH_NAMES_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const MONTH_ABBR_FI = ['tammi', 'helmi', 'maalis', 'huhti', 'touko', 'kesä', 'heinä', 'elo', 'syys', 'loka', 'marras', 'joulu'];
    const MONTH_ABBR_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

    for (let offset = -5; offset <= 5 && !dateFound; offset++) {
        const d = new Date(reqDate);
        d.setDate(d.getDate() + offset);
        const day = d.getDate();
        const month = d.getMonth() + 1;
        const year = d.getFullYear();
        const yy = (year % 100).toString().padStart(2, '0');
        const dd = day.toString().padStart(2, '0');
        const mm = month.toString().padStart(2, '0');
        const monthIdx = d.getMonth();

        const formats = [
            // ISO
            `${year}-${mm}-${dd}`,
            // European with 4-digit year
            `${day}.${month}.${year}`, `${dd}.${mm}.${year}`,
            `${day}/${month}/${year}`, `${dd}/${mm}/${year}`,
            `${day}-${month}-${year}`, `${dd}-${mm}-${year}`,
            // European with 2-digit year
            `${day}.${month}.${yy}`, `${dd}.${mm}.${yy}`,
            `${day}/${month}/${yy}`, `${dd}/${mm}/${yy}`,
            `${day}-${month}-${yy}`, `${dd}-${mm}-${yy}`,
            // US with 4-digit year
            `${month}/${day}/${year}`, `${mm}/${dd}/${year}`,
            // US with 2-digit year
            `${month}/${day}/${yy}`, `${mm}/${dd}/${yy}`,
            // Finnish month names: "15. tammikuuta 2024" or "15 tammikuu 2024"
            `${day}. ${MONTH_NAMES_FI[monthIdx]}ta ${year}`,
            `${day} ${MONTH_NAMES_FI[monthIdx]} ${year}`,
            `${day}. ${MONTH_ABBR_FI[monthIdx]} ${year}`,
            // Swedish month names: "15 januari 2024" or "den 15 januari 2024"
            `${day} ${MONTH_NAMES_SV[monthIdx]} ${year}`,
            `den ${day} ${MONTH_NAMES_SV[monthIdx]} ${year}`,
            // English month names: "15 January 2024", "Jan 15, 2024"
            `${day} ${MONTH_NAMES_EN[monthIdx]} ${year}`,
            `${MONTH_ABBR_EN[monthIdx]} ${day}, ${year}`,
            `${MONTH_ABBR_EN[monthIdx]} ${dd}, ${year}`,
            `${MONTH_NAMES_EN[monthIdx]} ${day}, ${year}`,
            // Compact: "15jan2024", "20240115" (common in filenames/IDs)
            `${year}${mm}${dd}`,
        ];

        for (const f of formats) {
            if (normText.includes(f.toLowerCase())) {
                dateFound = true;
                dateOffset = Math.abs(offset);
                details.push(`Date found: ${f} (offset: ${offset}d)`);
                break;
            }
        }
    }

    // --- 3. MERCHANT CHECK (strict: min 5-char tokens to avoid false positives) ---
    let merchantFound = false;
    const merchantPart = request.merchant.split(',')[0].toLowerCase();
    const STOP_WORDS = new Set([
        // Corporate suffixes
        "oy", "ab", "ltd", "inc", "corp", "gmbh", "co", "llc", "sa", "ag", "oyj",
        // TLDs and web
        "com", "cc", "www", "net", "org", "fi", "se", "no", "dk", "de", "uk", "eu", "info", "io",
        // Common words
        "the", "and", "for", "pay", "mob", "gsuite", "google", "payment", "invoice",
        "receipt", "total", "amount", "price", "charge", "service", "services",
        // Countries and cities (Nordic focus)
        "finland", "sweden", "norway", "denmark", "ireland", "dublin",
        "helsinki", "vasa", "turku", "tampere", "oulu", "espoo",
        "stockholm", "copenhagen", "oslo", "koebenhavn",
        // Currency
        "eur", "usd", "gbp", "sek", "nok", "dkk", "kurssi",
    ]);
    const tokens = merchantPart
        .split(/[^a-z]+/g)
        .filter(t => t.length >= 4 && !STOP_WORDS.has(t));

    for (const token of tokens) {
        if (token.length >= 7) {
            // Long tokens (finnair, microsoft): substring match is safe
            if (normText.includes(token)) {
                merchantFound = true;
                details.push(`Merchant found: "${token}"`);
                break;
            }
        } else {
            // Short tokens (stape, bolt): require word boundary to avoid false positives
            const regex = new RegExp(`\\b${token}\\b`, 'i');
            if (regex.test(normText)) {
                merchantFound = true;
                details.push(`Merchant found (boundary): "${token}"`);
                break;
            }
        }
    }

    // --- RESULT: Amount required + (Date OR Merchant) ---
    if (!amountFound) details.push(`Amount NOT found: ${amountStr}`);
    if (!dateFound) details.push(`Date NOT found within ±5 days of ${request.date}`);
    if (!merchantFound) details.push(`Merchant NOT found: ${tokens.join(', ')}`);

    // Amount is always required. Then need at least one of: date or merchant.
    // Date formats are now comprehensive (FI/SV/EN months, 2-digit years, etc.)
    // Merchant matching uses word boundaries for short tokens to reduce false positives.
    const isMatch = amountFound && (dateFound || merchantFound);

    return { isMatch, details, dateOffset };
};
