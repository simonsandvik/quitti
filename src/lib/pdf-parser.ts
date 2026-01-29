import { ReceiptRequest } from "./parser";
import * as pdfjsLib from "pdfjs-dist";

// Configure worker for browser environment
// Using a CDN is the most reliable way to get the worker running without complex Next.js config
if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

export interface PdfContentMatch {
    isMatch: boolean;
    confidence: number;
    details: string[];
    extractedText: string;
}

export const parsePdfContent = async (buffer: Uint8Array | Buffer): Promise<string> => {
    try {
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

        // OCR FALLBACK: If PDF has no text layer, try OCR on the buffer
        if (!fullText.trim()) {
            console.log("[PDF Parser] No text layer found. Triggering OCR fallback...");
            const { recognizeText } = await import("./ocr");
            const blob = new Blob([data as any], { type: "application/pdf" });
            fullText = await recognizeText(blob);
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
    const { score, details } = matchReceiptByContent(text, request);

    // Accept if Score >= 50
    // (Exact Amount = 50 -> Match)
    // (Fuzzy Amount 30 + Keyword 25 = 55 -> Match)
    const isMatch = score >= 50;

    return {
        isMatch,
        confidence: score,
        details,
        extractedText: text
    };
};
