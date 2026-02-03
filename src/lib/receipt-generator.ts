
export interface MetaReceiptData {
    id: string;
    date: Date;
    amount: string;
    currency: string;
    merchant: string;
    billing_reason: string;
    account_name: string;
    account_id: string;
}

export const generateMetaReceiptPdf = async (data: MetaReceiptData): Promise<Blob | null> => {
    if (typeof window === 'undefined') return null;

    try {
        // Dynamic import jsPDF
        const { jsPDF } = await import('jspdf');

        console.log(`[Meta PDF] Generating PDF for transaction ${data.id}`);

        // Create PDF document (A4)
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 20;
        let y = 25;

        // Colors
        const darkGray = '#1c1e21';
        const lightGray = '#606770';
        const metaBlue = '#0668E1';

        // Format date
        const formattedDate = data.date.toLocaleDateString('en-GB', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // === HEADER ===
        doc.setFontSize(22);
        doc.setTextColor(darkGray);
        doc.setFont('helvetica', 'bold');
        doc.text(`Invoice for ${data.account_name}`, margin, y);

        y += 8;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(lightGray);
        doc.text(`Account ID: ${data.account_id}`, margin, y);

        // Subtitle (right side) - subtle, not flashy
        doc.setFontSize(11);
        doc.setTextColor(lightGray);
        doc.setFont('helvetica', 'normal');
        doc.text('Meta Ads Invoice', pageWidth - margin, 28, { align: 'right' });

        // Horizontal line
        y += 12;
        doc.setDrawColor('#edeff2');
        doc.setLineWidth(0.5);
        doc.line(margin, y, pageWidth - margin, y);

        // === DETAILS SECTION ===
        y += 15;

        // Left column - Invoice details
        doc.setFontSize(10);
        doc.setTextColor(lightGray);
        doc.setFont('helvetica', 'normal');
        doc.text('INVOICE/PAYMENT DATE', margin, y);

        y += 6;
        doc.setFontSize(14);
        doc.setTextColor(darkGray);
        doc.setFont('helvetica', 'bold');
        doc.text(formattedDate, margin, y);

        y += 14;
        doc.setFontSize(10);
        doc.setTextColor(lightGray);
        doc.setFont('helvetica', 'normal');
        doc.text('TRANSACTION ID', margin, y);

        y += 6;
        doc.setFontSize(11);
        doc.setTextColor(darkGray);
        doc.setFont('helvetica', 'bold');
        doc.text(data.id, margin, y);

        // Right column - Amount box
        const boxX = pageWidth - margin - 70;
        const boxY = 55;
        const boxWidth = 70;
        const boxHeight = 45;

        doc.setFillColor('#f5f6f7');
        doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 3, 3, 'F');

        doc.setFontSize(10);
        doc.setTextColor(lightGray);
        doc.setFont('helvetica', 'normal');
        doc.text('AMOUNT CHARGED', boxX + 10, boxY + 12);

        doc.setFontSize(24);
        doc.setTextColor(darkGray);
        doc.setFont('helvetica', 'bold');
        doc.text(`${data.amount} ${data.currency}`, boxX + 10, boxY + 28);

        doc.setFontSize(9);
        doc.setTextColor(lightGray);
        doc.setFont('helvetica', 'normal');
        doc.text('Includes applicable taxes', boxX + 10, boxY + 38);

        // === ACTIVITY TABLE ===
        y = 120;
        doc.setFontSize(11);
        doc.setTextColor(lightGray);
        doc.setFont('helvetica', 'bold');
        doc.text('ACTIVITY DETAILS', margin, y);

        y += 3;
        doc.setDrawColor('#edeff2');
        doc.line(margin, y, pageWidth - margin, y);

        // Table header
        y += 10;
        doc.setFontSize(12);
        doc.setTextColor(darkGray);
        doc.setFont('helvetica', 'bold');
        doc.text('Description', margin, y);
        doc.text('Amount', pageWidth - margin, y, { align: 'right' });

        // Table row
        y += 3;
        doc.setDrawColor('#edeff2');
        doc.line(margin, y, pageWidth - margin, y);

        y += 10;
        doc.setFont('helvetica', 'bold');
        doc.text(data.billing_reason || 'Ad Account Activity', margin, y);
        doc.text(`${data.amount} ${data.currency}`, pageWidth - margin, y, { align: 'right' });

        y += 6;
        doc.setFontSize(11);
        doc.setTextColor(lightGray);
        doc.setFont('helvetica', 'normal');
        doc.text('Facebook Ads Services', margin, y);

        // === FOOTER ===
        const footerY = 250;
        doc.setDrawColor('#edeff2');
        doc.setLineWidth(0.5);
        doc.line(margin, footerY, pageWidth - margin, footerY);

        doc.setFontSize(10);
        doc.setTextColor(darkGray);
        doc.setFont('helvetica', 'bold');
        doc.text('Meta Platforms Ireland Limited', margin, footerY + 10);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(lightGray);
        doc.text('4 Grand Canal Square, Grand Canal Harbour', margin, footerY + 16);
        doc.text('Dublin 2, Ireland', margin, footerY + 22);
        doc.text('VAT Reg. No. IE9692928F', margin, footerY + 28);

        // Invoice ID (right)
        doc.setTextColor(lightGray);
        doc.text(`Invoice ID: FBADS-${data.id.substring(0, 10)}`, pageWidth - margin, footerY + 16, { align: 'right' });

        // Quitti attribution
        doc.setFontSize(9);
        doc.setTextColor('#9ca3af');
        doc.text('Data fetched via Meta API • PDF generated by quitti.app', pageWidth / 2, footerY + 40, { align: 'center' });

        // Generate blob
        const blob = doc.output('blob');

        console.log(`[Meta PDF] Generated PDF blob: ${blob.size} bytes`);

        if (blob.size < 1000) {
            console.error(`[Meta PDF] CRITICAL: PDF blob is too small!`);
        }

        return blob;

    } catch (e) {
        console.error("[Meta PDF] Failed to generate PDF:", e);
        return null;
    }
};
