import JSZip from "jszip";
import { saveAs } from "file-saver";
import { MatchResult } from "./matcher";
import { ReceiptRequest } from "./parser";
import { htmlToPdfBlob } from "./pdf";
import { getMerchantHierarchy } from "./grouping";

export const exportReceipts = async (
    receipts: ReceiptRequest[],
    matches: MatchResult[],
    manualFiles: Record<string, File> = {}
) => {
    const zip = new JSZip();

    for (const req of receipts) {
        const match = matches.find(m => m.receiptId === req.id);
        const manualFile = manualFiles[req.id];

        // Group by merchant hierarchy
        const { main, sub } = getMerchantHierarchy(req.merchant);

        // Sanitize names
        const safeMain = main.replace(/[\\/:*?"<>|]/g, "").trim();
        const safeSub = sub.replace(/[\\/:*?"<>|]/g, "").trim();

        let folder;
        if (safeMain.toLowerCase() === safeSub.toLowerCase()) {
            folder = zip.folder(safeMain);
        } else {
            folder = zip.folder(safeMain)?.folder(safeSub);
        }

        const cleanDate = req.date.replace(/-/g, "");
        const cleanMerchant = req.merchant.replace(/[\s\\/:*?"<>|]/g, "_");
        const cleanAmount = req.amount.toFixed(2).replace(/\./g, "_");

        // Final filename: YYYYMMDD_Merchant_Amount.pdf (or original ext if manual)
        const ext = manualFile ? manualFile.name.split('.').pop() : 'pdf';
        const filename = `${cleanDate}_${cleanMerchant}_${cleanAmount}.${ext}`;

        if (manualFile) {
            const content = await manualFile.arrayBuffer();
            folder?.file(filename, content);
        } else if (match && match.status === "FOUND") {
            if (match.matchedHtml) {
                // Convert email HTML to PDF
                try {
                    const pdfBlob = await htmlToPdfBlob(match.matchedHtml);
                    folder?.file(filename, pdfBlob);
                } catch (e) {
                    console.error("PDF generation failed", e);
                    folder?.file(filename, `Dummy Content (PDF Generation Failed) for ${req.merchant}\nDate: ${req.date}`);
                }
            } else {
                // Fallback to dummy for matches without body (e.g. mock data)
                folder?.file(filename, `Dummy Content for ${req.merchant}\nDate: ${req.date}\nAmount: ${req.amount}`);
            }
        }
    }

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "receipts_hunted.zip");
};
