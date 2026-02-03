import { jsPDF } from 'jspdf';
import { ReceiptRequest } from './parser';

interface DeclarationOptions {
    companyName: string;
    representativeName: string;
    missingReceipts: ReceiptRequest[];
    date: Date;
}

export async function generateMissingReceiptDeclaration({
    companyName,
    representativeName,
    missingReceipts,
    date = new Date()
}: DeclarationOptions): Promise<Blob> {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 20;

    // Helper: Draw Horizontal Line
    const line = () => {
        doc.setDrawColor(200);
        doc.line(20, y, pageWidth - 20, y);
        y += 10;
    };

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("Declaration of Missing Receipts", 20, y);
    y += 8;
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text("(Replacement Voucher / Eigenbeleg)", 20, y);
    y += 15;

    // Info Section
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("ISSUED BY", 20, y);
    doc.text("DATE OF ISSUE", pageWidth - 60, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.text(companyName || "Company Name Not Provided", 20, y);
    doc.text(date.toLocaleDateString(), pageWidth - 60, y);
    y += 15;

    line();

    // Declaration Text
    doc.setFont("helvetica", "bold");
    doc.text("LEGAL DECLARATION", 20, y);
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const declarationText = `I, the undersigned ${representativeName || 'representative'}, hereby declare that the original receipts for the business expenses listed below are missing and could not be recovered despite reasonable efforts. I certify that these expenses were incurred solely for business purposes on behalf of ${companyName || 'the company'}. This document serves as a formal replacement voucher for bookkeeping and tax purposes.`;
    const lines = doc.splitTextToSize(declarationText, pageWidth - 40);
    doc.text(lines, 20, y);
    y += lines.length * 5 + 10;

    line();

    // Table Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Date", 25, y);
    doc.text("Merchant", 55, y);
    doc.text("Amount", pageWidth - 60, y, { align: 'right' });
    doc.text("Reason", pageWidth - 55, y);
    y += 8;
    line();

    // Missing Items
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    missingReceipts.forEach((r) => {
        if (y > 270) {
            doc.addPage();
            y = 20;
        }
        doc.text(r.date, 25, y);
        doc.text(r.merchant.substring(0, 30), 55, y);
        doc.text(`${r.amount.toFixed(2)} ${r.currency}`, pageWidth - 60, y, { align: 'right' });

        const reasonLines = doc.splitTextToSize(r.missing_reason || "Reason not specified", 50);
        doc.text(reasonLines, pageWidth - 55, y);

        y += Math.max(8, reasonLines.length * 4 + 2);
    });

    y += 10;
    line();

    // Summary
    const total = missingReceipts.reduce((sum, r) => sum + r.amount, 0);
    doc.setFont("helvetica", "bold");
    doc.text(`Total Amount: ${total.toFixed(2)} ${missingReceipts[0]?.currency || 'EUR'}`, pageWidth - 60, y, { align: 'right' });
    y += 20;

    // Signature Area
    if (y > 240) {
        doc.addPage();
        y = 30;
    }
    doc.setFontSize(10);
    doc.text("Signature & Capacity:", 20, y);
    y += 30;
    doc.line(20, y, 100, y);
    y += 6;
    doc.setFontSize(8);
    doc.text(`${representativeName || 'Representative Signature Name'} / ${companyName || 'Company'}`, 20, y);
    y += 20;

    // Quitti Disclaimer
    doc.setFontSize(7);
    doc.setTextColor(150);
    const disclaimer = "This document was generated with the assistance of Quitti (quittiapp.com). Quitti simplifies the administrative process of documenting missing receipts but does not provide legal or tax advice. The user bears sole responsibility for the accuracy and legality of this declaration under local tax laws.";
    const disclaimerLines = doc.splitTextToSize(disclaimer, pageWidth - 40);
    doc.text(disclaimerLines, 20, y);

    return doc.output('blob');
}
