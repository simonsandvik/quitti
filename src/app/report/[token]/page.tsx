"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { Download, Folder, FileText, ChevronDown, Loader2 } from "lucide-react";

interface SharedData {
    share: any;
    user: { name: string; email: string; image?: string };
    receipts: any[];
}

import { exportReceipts } from "@/lib/export";
import { MatchResult, MatchStatus } from "@/lib/matcher";
import { ReceiptRequest } from "@/lib/parser";

export default function SharedReportPage() {
    const params = useParams();
    const token = params.token as string;

    const [data, setData] = useState<SharedData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!token) return;

        fetch(`/api/share/${token}`)
            .then(async (res) => {
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || "Failed to load report");
                }
                return res.json();
            })
            .then((data) => {
                setData(data);
                setLoading(false);
            })
            .catch((err) => {
                setError(err.message);
                setLoading(false);
            });
    }, [token]);

    const [generatingId, setGeneratingId] = useState<string | null>(null);

    const handleDownloadPdf = async (receipt: any) => {
        // 1. If cloud URL exists, use it
        if (receipt.downloadUrl) {
            setDownloadedIds(prev => new Set(prev).add(receipt.id));
            window.open(receipt.downloadUrl, '_blank', 'noopener,noreferrer');
            return;
        }

        // 2. Fallback: Generate client-side if we have data/html
        if (receipt.matchedData || receipt.matchedHtml) {
            setGeneratingId(receipt.id);
            try {
                let blob: Blob | null = null;
                const fileName = `Receipt_${receipt.merchant}_${receipt.amount}.pdf`.replace(/\s+/g, '_');

                if (receipt.matchedData) {
                    const { generateMetaReceiptPdf } = await import("@/lib/receipt-generator");
                    blob = await generateMetaReceiptPdf({
                        ...receipt.matchedData,
                        date: new Date(receipt.matchedData.date) // Ensure Date object
                    });
                } else if (receipt.matchedHtml) {
                    const { htmlToPdfBlob } = await import("@/lib/pdf");
                    blob = await htmlToPdfBlob(receipt.matchedHtml);
                }

                if (blob) {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    setDownloadedIds(prev => new Set(prev).add(receipt.id));
                }
            } catch (err) {
                console.error("Client-side PDF generation failed", err);
            } finally {
                setGeneratingId(null);
            }
        }
    };

    const handleDownloadAll = async (useFolders: boolean = true) => {
        if (!data || !data.receipts) return;
        setShowExportMenu(false);

        try {
            // Map API data to export format
            const exportReceiptsList: ReceiptRequest[] = data.receipts.map(r => ({
                id: r.id,
                date: r.date,
                amount: Number(r.amount),
                currency: r.currency,
                merchant: r.merchant,
                status: r.status,
                batchId: r.batch_id
            }));

            const exportMatchesList: MatchResult[] = data.receipts.map(r => {
                const match = r.matched_receipts?.[0];
                return {
                    receiptId: r.id,
                    emailId: match?.id || "",
                    status: (r.status === 'found' ? 'FOUND' : 'NOT_FOUND') as MatchStatus,
                    confidence: match?.confidence || 0,
                    details: match?.details || "",
                    storagePath: match?.file_url || undefined,
                    downloadUrl: r.downloadUrl // CRITICAL: Use the pre-signed URL from API
                };
            });

            await exportReceipts(exportReceiptsList, exportMatchesList, {}, useFolders);

        } catch (e) {
            console.error("Download failed", e);
            alert("Failed to generate zip");
        }
    }

    const [sortConfig, setSortConfig] = useState<{ field: 'date' | 'merchant' | 'amount' | 'status', direction: 'asc' | 'desc' }>({
        field: 'date',
        direction: 'desc'
    });

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="animate-pulse flex flex-col items-center">
                    <div className="h-12 w-12 bg-emerald-200 rounded-full mb-4"></div>
                    <div className="h-4 w-32 bg-slate-200 rounded"></div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="text-center max-w-md p-8 bg-white shadow-lg rounded-2xl">
                    <h1 className="text-2xl font-bold text-red-500 mb-2">Access Denied</h1>
                    <p className="text-slate-500">{error}</p>
                </div>
            </div>
        );
    }

    if (!data) return null;

    const { user, receipts } = data;

    const handleSort = (field: 'date' | 'merchant' | 'amount' | 'status') => {
        setSortConfig(current => ({
            field,
            direction: current.field === field && current.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    const sortedReceipts = [...receipts].sort((a, b) => {
        const modifier = sortConfig.direction === 'asc' ? 1 : -1;

        if (sortConfig.field === 'date') {
            return (new Date(a.date).getTime() - new Date(b.date).getTime()) * modifier;
        }
        if (sortConfig.field === 'amount') {
            return (Number(a.amount) - Number(b.amount)) * modifier;
        }
        if (sortConfig.field === 'merchant') {
            return a.merchant.localeCompare(b.merchant) * modifier;
        }
        if (sortConfig.field === 'status') {
            const statusOrder = { found: 2, pending: 1, missing: 0 };
            const statusA = statusOrder[a.status as keyof typeof statusOrder] || 0;
            const statusB = statusOrder[b.status as keyof typeof statusOrder] || 0;
            return (statusA - statusB) * modifier;
        }
        return 0;
    });

    const totalAmount = receipts.reduce((sum, r) => sum + Number(r.amount), 0);

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-emerald-100">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
                <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        {/* Logo Placeholder */}
                        <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white font-bold text-xl">Q</div>
                        <div>
                            <h1 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Receipt Report</h1>
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900">{user.name}</span>
                                <span className="text-slate-400 text-sm">({user.email})</span>
                            </div>
                        </div>
                    </div>
                    <div className="relative">
                        <Button
                            onClick={() => setShowExportMenu(!showExportMenu)}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 border-0 flex items-center gap-2"
                        >
                            Export / Download
                            <ChevronDown className={`w-4 h-4 transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
                        </Button>

                        <AnimatePresence>
                            {showExportMenu && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 10 }}
                                        className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 z-20"
                                    >
                                        <button
                                            onClick={() => handleDownloadAll(false)}
                                            className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 rounded-xl transition-colors group"
                                        >
                                            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 group-hover:bg-emerald-50 group-hover:text-emerald-600">
                                                <FileText className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-slate-800">Download ZIP (Flat)</div>
                                                <div className="text-[10px] text-slate-400">All files in one folder</div>
                                            </div>
                                        </button>

                                        <button
                                            onClick={() => handleDownloadAll(true)}
                                            className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 rounded-xl transition-colors group"
                                        >
                                            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 group-hover:bg-emerald-50 group-hover:text-emerald-600">
                                                <Folder className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-slate-800">Download ZIP (Structured)</div>
                                                <div className="text-[10px] text-slate-400">Organized by merchant</div>
                                            </div>
                                        </button>
                                    </motion.div>
                                </>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-6 py-12">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                    <Card className="p-6 bg-white border-slate-100 shadow-sm">
                        <h3 className="text-sm text-slate-400 font-bold uppercase mb-2">Total Receipts</h3>
                        <p className="text-3xl font-black text-slate-900">{receipts.length}</p>
                    </Card>
                    <Card className="p-6 bg-white border-slate-100 shadow-sm">
                        <h3 className="text-sm text-slate-400 font-bold uppercase mb-2">Total Value</h3>
                        <p className="text-3xl font-black text-emerald-600">€{totalAmount.toFixed(2)}</p>
                    </Card>
                    <Card className="p-6 bg-white border-slate-100 shadow-sm">
                        <h3 className="text-sm text-slate-400 font-bold uppercase mb-2">Status</h3>
                        <p className="text-3xl font-black text-slate-900">
                            <span className="text-emerald-500">{receipts.filter(r => r.status === 'found').length}</span>
                            <span className="text-slate-300 mx-2">/</span>
                            <span className="text-slate-400">{receipts.length}</span>
                        </p>
                    </Card>
                </div>

                {/* Transaction Table */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200 select-none">
                            <tr>
                                <th onClick={() => handleSort('date')} className="px-6 py-4 text-left font-bold text-slate-400 uppercase tracking-wider text-xs cursor-pointer hover:bg-slate-100 transition-colors group">
                                    Date <span className="invisible group-hover:visible">{sortConfig.field === 'date' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                                    {sortConfig.field === 'date' && <span className="ml-1 text-slate-900">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                                </th>
                                <th onClick={() => handleSort('merchant')} className="px-6 py-4 text-left font-bold text-slate-400 uppercase tracking-wider text-xs cursor-pointer hover:bg-slate-100 transition-colors group">
                                    Merchant <span className="invisible group-hover:visible">{sortConfig.field === 'merchant' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                                    {sortConfig.field === 'merchant' && <span className="ml-1 text-slate-900">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                                </th>
                                <th onClick={() => handleSort('amount')} className="px-6 py-4 text-left font-bold text-slate-400 uppercase tracking-wider text-xs cursor-pointer hover:bg-slate-100 transition-colors group">
                                    Amount <span className="invisible group-hover:visible">{sortConfig.field === 'amount' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                                    {sortConfig.field === 'amount' && <span className="ml-1 text-slate-900">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                                </th>
                                <th onClick={() => handleSort('status')} className="px-6 py-4 text-left font-bold text-slate-400 uppercase tracking-wider text-xs cursor-pointer hover:bg-slate-100 transition-colors group">
                                    Status <span className="invisible group-hover:visible">{sortConfig.field === 'status' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                                    {sortConfig.field === 'status' && <span className="ml-1 text-slate-900">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                                </th>
                                <th className="px-6 py-4 text-right font-bold text-slate-400 uppercase tracking-wider text-xs">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sortedReceipts.map((receipt) => {
                                const isFound = receipt.status === 'found';
                                const isDownloaded = downloadedIds.has(receipt.id);
                                const matchDate = receipt.date ? new Date(receipt.date).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' }) : "Unknown";

                                return (
                                    <tr
                                        key={receipt.id}
                                        className={`transition-colors border-b border-slate-100 ${isDownloaded ? 'bg-emerald-50/40' : 'hover:bg-slate-50/50'}`}
                                    >
                                        <td className="px-6 py-4 font-mono text-slate-500">{matchDate}</td>
                                        <td className="px-6 py-4 font-bold text-slate-800">{receipt.merchant}</td>
                                        <td className="px-6 py-4 font-mono font-bold text-slate-900">
                                            {Number(receipt.amount).toFixed(2)} <span className="text-slate-400 text-xs">{receipt.currency}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <StatusBadge status={isFound ? "FOUND" : "MISSING"} />
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {(isFound && (receipt.downloadUrl || receipt.matchedData || receipt.matchedHtml)) ? (
                                                <button
                                                    onClick={() => handleDownloadPdf(receipt)}
                                                    disabled={generatingId === receipt.id}
                                                    className={`font-bold text-xs px-3 py-2 rounded-lg transition-all inline-flex items-center gap-2 ${isDownloaded ? 'text-emerald-500 bg-white border border-emerald-100' : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'}`}
                                                >
                                                    {generatingId === receipt.id ? (
                                                        <>
                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                            Generating...
                                                        </>
                                                    ) : (
                                                        isDownloaded ? "Download Again" : "Download PDF"
                                                    )}
                                                </button>
                                            ) : isFound ? (
                                                <div className="flex flex-col items-end gap-1">
                                                    <span className="text-emerald-500 text-[11px] font-bold animate-pulse flex items-center gap-1.5">
                                                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                                                        Syncing to cloud...
                                                    </span>
                                                    <span className="text-[9px] text-slate-400 italic">This usually takes 5-10s</span>
                                                </div>
                                            ) : (
                                                <span className="text-slate-300 text-xs italic">Not available</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="mt-12 text-center text-slate-400 text-sm">
                    <p>Generated by Quitti App for {user.name}</p>
                </div>
            </main>
        </div>
    );
}
