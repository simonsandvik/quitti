"use client";

import React from "react";
import { Button } from "./ui/Button";
import { StatusBadge } from "./StatusBadge";
import { MatchResult } from "@/lib/matcher";
import { ReceiptRequest } from "@/lib/parser";

interface MerchantGroupProps {
    merchant: string;
    receipts: ReceiptRequest[];
    matches: MatchResult[];
    manualFiles: Record<string, File>;
    missingIds: Set<string>;
    onFileChange: (id: string, file: File | null) => void;
    onPreview: (id: string) => void;
    onToggleMissing: (id: string) => void;
    onRemoveFile: (id: string) => void;
}

export const MerchantGroup = ({
    merchant,
    receipts,
    matches,
    manualFiles,
    missingIds,
    onFileChange,
    onPreview,
    onToggleMissing,
    onRemoveFile
}: MerchantGroupProps) => {
    const sortedReceipts = [...receipts].sort((a, b) => b.date.localeCompare(a.date));

    return (
        <div className="mb-6 last:mb-0">
            <div className="px-4 py-3 bg-slate-50 border-l-4 border-emerald-500 flex justify-between items-center rounded-t-xl">
                <h3 className="text-sm font-extrabold tracking-wider uppercase text-slate-900">{merchant}</h3>
                <span className="text-[10px] text-slate-600 font-bold bg-slate-200/50 px-2 py-1 rounded-lg">
                    {receipts.length} {receipts.length === 1 ? "RECEIPT" : "RECEIPTS"}
                </span>
            </div>
            <div className="bg-white border border-slate-100 border-t-0 rounded-b-xl overflow-hidden shadow-sm">
                <table className="w-full text-xs border-collapse">
                    <thead>
                        <tr className="text-left text-slate-400 border-b border-slate-50">
                            <th className="p-3 w-[100px] font-semibold uppercase tracking-tight">Status</th>
                            <th className="p-3 w-[120px] font-semibold uppercase tracking-tight">Date</th>
                            <th className="p-3 w-[150px] font-semibold uppercase tracking-tight">Merchant</th>
                            <th className="p-3 font-semibold uppercase tracking-tight">Amount</th>
                            <th className="p-3 font-semibold uppercase tracking-tight">Found Item</th>
                            <th className="p-3 text-right w-[140px] font-semibold uppercase tracking-tight">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedReceipts.map((req) => {
                            const match = matches.find(m => m.receiptId === req.id);
                            const manualFile = manualFiles[req.id];
                            const isMissing = missingIds.has(req.id);

                            // Visual status override
                            const status = isMissing ? "MISSING" : (manualFile ? "FOUND" : (match ? match.status : "NOT_FOUND"));

                            return (
                                <tr key={req.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors group">
                                    <td className="p-3"><StatusBadge status={status} /></td>
                                    <td className="p-3 text-slate-500 font-mono">{req.date}</td>
                                    <td className="p-3 text-slate-900 font-bold">{req.merchant}</td>
                                    <td className="p-3 font-black text-emerald-600">{req.amount.toFixed(2)} {req.currency}</td>
                                    <td className="p-3 text-slate-500 text-[11px]">
                                        {manualFile ? (
                                            <span className="text-emerald-600 font-medium flex items-center gap-1">
                                                <span>📎</span> {manualFile.name} <span className="opacity-50">(manual)</span>
                                            </span>
                                        ) : (
                                            match?.details || <span className="opacity-30">-</span>
                                        )}
                                    </td>
                                    <td className="p-3 text-right">
                                        <div className="flex gap-2 justify-end items-center opacity-80 group-hover:opacity-100 transition-opacity">
                                            {isMissing ? (
                                                <Button variant="secondary" size="sm" className="h-auto py-1 px-2 text-[10px] border-slate-200" onClick={() => onToggleMissing(req.id)}>
                                                    Restore
                                                </Button>
                                            ) : ( /* Normal Actions */
                                                <>
                                                    {status === "FOUND" ? (
                                                        <>
                                                            <Button variant="secondary" size="sm" className="h-auto py-1 px-2 text-[10px] bg-white hover:bg-slate-50 text-slate-700 border-slate-200" onClick={() => {
                                                                if (manualFile) {
                                                                    onPreview(URL.createObjectURL(manualFile));
                                                                } else if (match?.matchedHtml) {
                                                                    // Preview HTML if no file yet
                                                                    const blob = new Blob([match.matchedHtml], { type: 'text/html' });
                                                                    onPreview(URL.createObjectURL(blob));
                                                                } else {
                                                                    // For email/auto matches, passed ID
                                                                    onPreview(req.id);
                                                                }
                                                            }}>Preview</Button>

                                                            {/* PDF Generation Button */}
                                                            {!manualFile && match?.matchedHtml && (
                                                                <Button
                                                                    variant="secondary"
                                                                    size="sm"
                                                                    className="h-auto py-1 px-2 text-[10px] bg-emerald-500 hover:bg-emerald-600 text-white border-0 rounded-lg shadow-sm"
                                                                    onClick={async (e) => {
                                                                        e.stopPropagation();
                                                                        const { default: html2pdf } = await import("html2pdf.js");
                                                                        const element = document.createElement("div");
                                                                        element.innerHTML = match.matchedHtml || "";
                                                                        // Basic styling for the receipt
                                                                        element.style.padding = "40px";
                                                                        element.style.fontFamily = "sans-serif";

                                                                        const opt = {
                                                                            margin: 10,
                                                                            filename: `${req.date}_${req.merchant}_${req.amount}.pdf`,
                                                                            image: { type: 'jpeg' as const, quality: 0.98 },
                                                                            html2canvas: { scale: 2 },
                                                                            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
                                                                        };

                                                                        // @ts-ignore
                                                                        html2pdf().set(opt).from(element).outputPdf('blob').then((blob: Blob) => {
                                                                            const file = new File([blob], opt.filename, { type: "application/pdf" });
                                                                            onFileChange(req.id, file); // Save as if manual file
                                                                        });
                                                                    }}
                                                                >
                                                                    📄 Make PDF
                                                                </Button>
                                                            )}

                                                            {manualFile && (
                                                                <button
                                                                    onClick={() => onRemoveFile(req.id)}
                                                                    title="Remove File"
                                                                    className="bg-none border-0 cursor-pointer text-sm text-red-500 hover:text-red-600 px-1 font-bold"
                                                                >
                                                                    ✕
                                                                </button>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <div className="relative inline-block">
                                                            <Button variant="secondary" size="sm" className="h-auto py-1 px-2 text-[10px] border-slate-200 hover:bg-slate-50">
                                                                Upload
                                                            </Button>
                                                            <input
                                                                type="file"
                                                                accept="image/*,.pdf"
                                                                onChange={(e) => onFileChange(req.id, e.target.files?.[0] || null)}
                                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                            />
                                                        </div>
                                                    )}

                                                    {/* Missing Toggle (only if not found) */}
                                                    {status !== "FOUND" && (
                                                        <button
                                                            onClick={() => onToggleMissing(req.id)}
                                                            title="Mark as Missing/Lost"
                                                            className="bg-transparent border-0 cursor-pointer text-slate-300 hover:text-red-400 text-base px-1 transition-colors"
                                                        >
                                                            🗑️
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
