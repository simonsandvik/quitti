"use client";

import React from "react";
import { Button } from "./ui/Button";
import { StatusBadge } from "./StatusBadge";
import { CheckCircle2, Trash2 } from "lucide-react";
import { MatchResult } from "@/lib/matcher";
import { ReceiptRequest } from "@/lib/parser";

interface MerchantGroupProps {
    merchant: string;
    receipts: ReceiptRequest[];
    matches: MatchResult[];
    manualFiles: Record<string, File>;
    missingIds: Set<string>;
    onFileChange: (id: string, file: File | null) => void;
    onPreview: (url: string, type: 'pdf' | 'image' | 'html') => void;
    onToggleMissing: (id: string) => void;
    onRemoveFile: (id: string) => void;
    onDeclare: (receipt: ReceiptRequest) => void;
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
    onRemoveFile,
    onDeclare
}: MerchantGroupProps) => {
    const sortedReceipts = [...receipts].sort((a, b) => b.date.localeCompare(a.date));

    // Calculate group stats for color coding
    const stats = sortedReceipts.reduce((acc, req) => {
        const manualFile = manualFiles[req.id];
        const match = matches.find(m => m.receiptId === req.id);
        const isMissing = missingIds.has(req.id);
        const status = isMissing ? "MISSING" : (manualFile ? "FOUND" : (match ? match.status : "NOT_FOUND"));

        if (status === "FOUND") acc.found++;
        acc.total++;
        return acc;
    }, { found: 0, total: 0 });

    const isAllFound = stats.found === stats.total;
    const isSomeFound = stats.found > 0 && !isAllFound;

    const headerBorderColor = isAllFound
        ? "border-emerald-500"
        : isSomeFound
            ? "border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.1)] active:scale-[0.99] transition-all"
            : "border-slate-200 opacity-80";

    return (
        <div className="mb-6 last:mb-0">
            <div className={`px-4 py-3 bg-slate-50 border-l-4 ${headerBorderColor} flex justify-between items-center rounded-t-xl transition-all duration-500`}>
                <div className="flex items-center gap-3">
                    <h3 className="text-sm font-extrabold tracking-wider uppercase text-slate-900">{merchant}</h3>
                    {isSomeFound && (
                        <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                        </span>
                    )}
                </div>
                <span className="text-[10px] text-slate-600 font-bold bg-slate-200/50 px-2 py-1 rounded-lg">
                    {stats.found} / {stats.total} {stats.total === 1 ? "RECEIPT" : "RECEIPTS"}
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
                                                <div className="flex items-center gap-2">
                                                    <Button variant="secondary" size="sm" className="h-auto py-1 px-2 text-[10px] border-slate-200" onClick={() => onToggleMissing(req.id)}>
                                                        Restore
                                                    </Button>
                                                    {!req.is_truly_missing && (
                                                        <button
                                                            onClick={() => onDeclare(req)}
                                                            className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 bg-indigo-50 px-2 py-1 rounded transition-colors"
                                                        >
                                                            Formal Declaration
                                                        </button>
                                                    )}
                                                    {req.is_truly_missing && (
                                                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded flex items-center gap-1 border border-amber-100">
                                                            <CheckCircle2 className="w-3 h-3" />
                                                            Truly Missing
                                                        </span>
                                                    )}
                                                </div>
                                            ) : ( /* Normal Actions */
                                                <>
                                                    {status === "FOUND" ? (
                                                        <>
                                                            {/* Download Action */}
                                                            {(manualFile || match?.storagePath) ? (
                                                                <Button variant="secondary" size="sm" className="h-auto py-1 px-2 text-[10px] bg-white hover:bg-slate-50 text-slate-700 border-slate-200" onClick={async () => {
                                                                    if (manualFile) {
                                                                        const type = manualFile.type.includes('pdf') ? 'pdf' : 'image';
                                                                        onPreview(URL.createObjectURL(manualFile), type);
                                                                    } else if (match?.storagePath) {
                                                                        try {
                                                                            const { getSignedUrlServerAction } = await import("@/app/actions");
                                                                            const signedUrl = await getSignedUrlServerAction(match.storagePath);
                                                                            const type = match.storagePath.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image';
                                                                            onPreview(signedUrl, type);
                                                                        } catch (err) {
                                                                            console.error("Failed to get signed URL", err);
                                                                            alert("Failed to open preview. Please try again.");
                                                                        }
                                                                    }
                                                                }}>
                                                                    {(manualFile?.type.includes('pdf') || match?.storagePath?.toLowerCase().endsWith('.pdf')) ? 'View PDF' : 'View Image'}
                                                                </Button>
                                                            ) : (
                                                                /* Preview (HTML) Action */
                                                                <Button variant="secondary" size="sm" className="h-auto py-1 px-2 text-[10px] bg-white hover:bg-slate-50 text-slate-700 border-slate-200" onClick={() => {
                                                                    if (match?.matchedHtml) {
                                                                        onPreview(match.matchedHtml, 'html');
                                                                    }
                                                                }}>Preview</Button>
                                                            )}

                                                            {/* Generation Action (Only if no file yet but we have HTML) */}
                                                            {!manualFile && !match?.storagePath && match?.matchedHtml && (
                                                                <Button
                                                                    variant="secondary"
                                                                    size="sm"
                                                                    className="h-auto py-1 px-2 text-[10px] bg-emerald-500 hover:bg-emerald-600 text-white border-0 rounded-lg shadow-sm"
                                                                    onClick={async (e) => {
                                                                        e.stopPropagation();
                                                                        try {
                                                                            const { htmlToPdfBlob } = await import("@/lib/pdf");
                                                                            const blob = await htmlToPdfBlob(match.matchedHtml || "");
                                                                            const filename = `${req.date}_${req.merchant}_${req.amount}.pdf`;
                                                                            const file = new File([blob], filename, { type: "application/pdf" });
                                                                            onFileChange(req.id, file); // Save as if manual file
                                                                        } catch (err) {
                                                                            console.error("Manual PDF generation failed", err);
                                                                            alert("Failed to generate PDF. Please try again.");
                                                                        }
                                                                    }}
                                                                >
                                                                    📄 Make PDF
                                                                </Button>
                                                            )}
                                                            {/* Remove Action */}
                                                            <button
                                                                onClick={() => onRemoveFile(req.id)}
                                                                className="p-1 rounded hover:bg-slate-100 text-slate-300 hover:text-red-500 transition-colors ml-2"
                                                                title="Remove File / Unassign"
                                                            >
                                                                <Trash2 className="w-3 h-3" />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        /* NOT FOUND Actions */
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
            </div >
        </div >
    );
};
