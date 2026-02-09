import { jsPDF } from 'jspdf';

/**
 * Converts HTML receipt content to a PDF blob using jsPDF text rendering.
 * Extracts clean text from the HTML and renders it as a formatted document.
 * This approach is 100% reliable — no html2canvas/screenshot dependencies.
 */
export async function htmlToPdfBlob(html: string): Promise<Blob> {
    // Extract clean text from HTML
    const div = document.createElement('div');
    div.innerHTML = html;

    // Remove scripts, styles, tracking pixels, and hidden elements
    div.querySelectorAll('script, style, link, meta, [style*="display:none"], [style*="display: none"], img[width="1"], img[height="1"]').forEach(el => el.remove());

    const text = (div.innerText || div.textContent || '').trim();

    if (!text) {
        throw new Error('No text content found in HTML');
    }

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);

    // Header
    pdf.setFontSize(12);
    pdf.setTextColor(99, 102, 241);
    pdf.text('Quitti', margin, margin + 2);
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text('Automated Export', margin + 16, margin + 2);

    pdf.setDrawColor(230, 230, 230);
    pdf.line(margin, margin + 5, pageWidth - margin, margin + 5);

    // Content — split into lines that fit the page width
    pdf.setFontSize(9);
    pdf.setTextColor(51, 51, 51);

    // Clean up whitespace: collapse multiple blank lines, trim each line
    const cleanedText = text
        .split('\n')
        .map(line => line.trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n');

    const lines = pdf.splitTextToSize(cleanedText, contentWidth);
    let y = margin + 12;
    const lineHeight = 4;

    for (const line of lines) {
        if (y + lineHeight > pageHeight - margin) {
            pdf.addPage();
            y = margin;
        }
        pdf.text(line, margin, y);
        y += lineHeight;
    }

    return pdf.output('blob');
}
