import { createWorker } from 'tesseract.js';

export async function recognizeText(file: File | Blob): Promise<string> {
    const worker = await createWorker('eng+fin+swe'); // Supporting English, Finnish, and Swedish

    try {
        const { data: { text } } = await worker.recognize(file);
        return text;
    } catch (error) {
        console.error('[OCR] Recognition failed:', error);
        return '';
    } finally {
        await worker.terminate();
    }
}
