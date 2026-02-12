import JSZip from "jszip";
import { saveAs } from "file-saver";
import { MatchResult } from "./matcher";
import { ReceiptRequest } from "./parser";
import { htmlToPdfBlob } from "./pdf";
import { getMerchantHierarchy } from "./grouping";

export const exportReceipts = async (
    receipts: ReceiptRequest[],
    matches: MatchResult[],
    manualFiles: Record<string, File>,
    useFolders: boolean,
    declarationBlob?: Blob | null
) => {
    const zip = new JSZip();
    console.log(`[Export] Starting export. useFolders=${useFolders}`);

    for (const req of receipts) {
        const match = matches.find(m => m.receiptId === req.id);
        const manualFile = manualFiles[req.id];

        let folder = zip; // Default to root

        if (useFolders) {
            // Group by merchant hierarchy
            const { main, sub } = getMerchantHierarchy(req.merchant);

            // Sanitize names
            const safeMain = main.replace(/[\\/:*?"<>|]/g, "").trim();
            const safeSub = sub.replace(/[\\/:*?"<>|]/g, "").trim();

            if (safeMain.toLowerCase() === safeSub.toLowerCase()) {
                folder = zip.folder(safeMain) || zip;
            } else {
                folder = zip.folder(safeMain)?.folder(safeSub) || zip;
            }
        }

        const cleanDate = req.date.replace(/-/g, "");
        const cleanMerchant = req.merchant.replace(/[\s\\/:*?"<>|]/g, "_");
        const cleanAmount = req.amount.toFixed(2).replace(/\./g, "_");

        // Final filename: YYYYMMDD_Merchant_Amount.pdf (or original ext if manual)
        const ext = manualFile ? manualFile.name.split('.').pop() : (match?.storagePath?.split('.').pop() || 'pdf');
        const filename = `${cleanDate}_${cleanMerchant}_${cleanAmount}.${ext}`;

        // Ensure we write to the chosen folder (zip root or subfolder)
        const targetFolder = folder;

        if (manualFile) {
            // Use locally available file - this includes auto-generated PDFs from scanner!
            console.log(`[Export] Adding LOCAL file for ${req.id} (${req.merchant}), size: ${manualFile.size}`);
            const content = await manualFile.arrayBuffer();
            targetFolder.file(filename, content);
        } else if (match && (match.status === "FOUND" || match.status === "POSSIBLE")) {
            // No local file - try cloud or generate
            if (match.downloadUrl) {
                // Shared Portal Case: Pre-signed URL available
                try {
                    console.log(`[Export] Fetching PRE-SIGNED file for ${req.id}`);
                    const res = await fetch(match.downloadUrl);
                    if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
                    const blob = await res.blob();
                    console.log(`[Export] PRE-SIGNED file fetched, size: ${blob.size}`);
                    targetFolder.file(filename, blob);
                } catch (e) {
                    console.error("[Export] Failed to fetch pre-signed file", e);
                    targetFolder.file(filename, `Dummy Content (Pre-signed Fetch Failed) for ${req.merchant}\nDate: ${req.date}\nError: ${e}`);
                }
            } else if (match.storagePath) {
                // Fetch actual file from cloud storage (Authenticated)
                try {
                    console.log(`[Export] Fetching CLOUD file for ${req.id}: ${match.storagePath}`);
                    const { getSignedUrlServerAction } = await import("@/app/actions");
                    const url = await getSignedUrlServerAction(match.storagePath);
                    const res = await fetch(url);
                    if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
                    const blob = await res.blob();
                    console.log(`[Export] CLOUD file fetched, size: ${blob.size}`);
                    targetFolder.file(filename, blob);
                } catch (e) {
                    console.error("[Export] Failed to fetch cloud file for export", e);
                    targetFolder.file(filename, `Dummy Content (Cloud Fetch Failed) for ${req.merchant}\nDate: ${req.date}\nError: ${e}`);
                }
            } else if (match.matchedHtml) {
                // Convert email HTML to PDF
                try {
                    console.log(`[Export] Generating PDF from HTML for ${req.id}`);
                    const pdfBlob = await htmlToPdfBlob(match.matchedHtml);
                    targetFolder.file(filename, pdfBlob);
                } catch (e) {
                    console.error("[Export] PDF generation failed", e);
                    targetFolder.file(filename, `Dummy Content (PDF Generation Failed) for ${req.merchant}\nDate: ${req.date}`);
                }
            } else {
                // Fallback to dummy for matches without body or file
                console.log(`[Export] No file/body for match ${req.id}, adding dummy.`);
                targetFolder.file(filename, `Dummy Content for ${req.merchant}\nDate: ${req.date}\nAmount: ${req.amount}`);
            }
        } else {
            console.log(`[Export] No match for ${req.id}, skipping file or adding placeholder?`);
        }
    }
    // 4. Add declaration if exists
    if (declarationBlob) {
        console.log("[Export] Adding formal declaration PDF");
        zip.file("Declaration_of_Missing_Receipts.pdf", declarationBlob);
    }

    try {
        console.log("[Export] Generating zip blob...");
        const content = await zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            mimeType: "application/zip"
        });

        console.log(`[Export] Zip generated, size: ${content.size} bytes. Triggering download...`);
        saveAs(content, "receipts_hunted.zip");
    } catch (e) {
        console.error("[Export] Zip generation/download error:", e);
        alert("Export failed. Please try again.");
        throw e;
    }
};
