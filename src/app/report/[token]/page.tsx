"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/StatusBadge";

interface SharedData {
    share: any;
    user: { name: string; email: string; image?: string };
    receipts: any[];
}

export default function SharedReportPage() {
    const params = useParams();
    const token = params.token as string;

    const [data, setData] = useState<SharedData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    const handleDownloadPdf = async (receipt: any) => {
        if (!receipt.matched_receipts?.[0]?.details) return;
        // Note: In a real implementation we would fetch the HTML or File URL.
        // For this MVP, we are assuming 'details' contains the matched snippet or we need a way to get the matched HTML.
        // The API returns matched_receipts with 'matchedHtml' if we SELECT it?
        // Let's assume standard 'exportReceipts' logic which re-generates or uses available content. 
        // Re-implementing simplified html2pdf for this view:

        alert("Feature: Download single PDF logic would trigger here.");
    };

    const handleDownloadAll = () => {
        alert("Feature: Download ZIP logic would trigger here.");
    }

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
    const sortedReceipts = [...receipts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
                    <Button onClick={handleDownloadAll} className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 border-0">
                        Download All (ZIP)
                    </Button>
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
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 text-left font-bold text-slate-400 uppercase tracking-wider text-xs">Date</th>
                                <th className="px-6 py-4 text-left font-bold text-slate-400 uppercase tracking-wider text-xs">Merchant</th>
                                <th className="px-6 py-4 text-left font-bold text-slate-400 uppercase tracking-wider text-xs">Amount</th>
                                <th className="px-6 py-4 text-left font-bold text-slate-400 uppercase tracking-wider text-xs">Status</th>
                                <th className="px-6 py-4 text-right font-bold text-slate-400 uppercase tracking-wider text-xs">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sortedReceipts.map((receipt) => {
                                const isFound = receipt.status === 'found';
                                const matchDate = receipt.date ? new Date(receipt.date).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' }) : "Unknown";

                                return (
                                    <tr key={receipt.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4 font-mono text-slate-500">{matchDate}</td>
                                        <td className="px-6 py-4 font-bold text-slate-800">{receipt.merchant}</td>
                                        <td className="px-6 py-4 font-mono font-bold text-slate-900">
                                            {Number(receipt.amount).toFixed(2)} <span className="text-slate-400 text-xs">{receipt.currency}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <StatusBadge status={isFound ? "FOUND" : "MISSING"} />
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {isFound && receipt.downloadUrl ? (
                                                <a
                                                    href={receipt.downloadUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-emerald-600 hover:text-emerald-700 font-bold text-xs bg-emerald-50 px-3 py-2 rounded-lg transition-colors inline-block"
                                                >
                                                    Download PDF
                                                </a>
                                            ) : isFound ? (
                                                <span className="text-slate-400 text-xs italic">Processing...</span>
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
