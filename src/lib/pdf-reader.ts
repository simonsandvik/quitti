import * as pdfjsLib from 'pdfjs-dist';

// Use local worker copy to ensure matching version and avoid CDN issues
// We copied node_modules/pdfjs-dist/build/pdf.worker.min.mjs to public/pdf.worker.min.mjs
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export async function extractTextFromPdf(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();

    // Check if it's actually a PDF by magic bytes or extension to be safe
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        return '';
    }

    try {
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
                .map((item: any) => item.str)
                .join(' ');
            fullText += pageText + '\n';
        }

        // OCR FALLBACK: If PDF has no text layer, try OCR on the first page
        if (!fullText.trim()) {
            console.log('[PDF Reader] No text layer found. Triggering OCR fallback...');
            const { recognizeText } = await import('./ocr');
            const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
            fullText = await recognizeText(blob);
        }

        return fullText;
    } catch (err) {
        console.error('Error parsing PDF:', err);
        return '';
    }
}
