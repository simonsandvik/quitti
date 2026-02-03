import React, { useState, useEffect } from "react";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { parseReceipts, ReceiptRequest } from "@/lib/parser";
import { ingestFile, RawData } from "@/lib/importer";
import { ImportConfirmation } from "./ImportConfirmation";
import { motion, AnimatePresence } from "framer-motion";
import { Clipboard, FileSpreadsheet, Keyboard, Trash2, Plus, ArrowLeft, CheckCircle2 } from "lucide-react";

interface UploadZoneProps {
    onConfirm: (receipts: ReceiptRequest[]) => void;
}

type InputMethod = 'choice' | 'paste' | 'upload' | 'review';

export const UploadZone = ({ onConfirm }: UploadZoneProps) => {
    const [inputMethod, setInputMethod] = useState<InputMethod>('choice');
    const [textInput, setTextInput] = useState("");
    const [parsed, setParsed] = useState<ReceiptRequest[]>([]);
    const [pendingRawData, setPendingRawData] = useState<RawData | null>(null);

    const handleParseText = () => {
        if (!textInput.trim()) return;
        const results = parseReceipts(textInput);
        setParsed(results);
        setInputMethod('review');
    };

    const updateRow = (id: string, field: keyof ReceiptRequest, value: any) => {
        setParsed(prev => prev.map(row => {
            if (row.id === id) {
                return { ...row, [field]: value };
            }
            return row;
        }));
    };

    const deleteRow = (id: string) => {
        setParsed(prev => prev.filter(row => row.id !== id));
    };

    const addRow = () => {
        const newRow: ReceiptRequest = {
            id: Math.random().toString(36).substr(2, 9),
            date: new Date().toISOString().split('T')[0],
            merchant: "New Merchant",
            amount: 0,
            currency: "EUR",
            status: "pending"
        };
        setParsed(prev => [newRow, ...prev]);
    };

    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSelectedFile(file);

        try {
            const raw = await ingestFile(file);
            setPendingRawData(raw);
        } catch (err) {
            console.error("Failed to ingest file:", err);
            alert("Failed to read file. Please ensure it is a valid CSV or Excel file.");
        }
    };

    const handleDelimiterChange = async (delimiter: string) => {
        if (!selectedFile) return;
        try {
            const raw = await ingestFile(selectedFile, delimiter);
            setPendingRawData(raw);
        } catch (err) {
            console.error("Failed to re-ingest file:", err);
        }
    };

    const handleImportConfirm = (data: ReceiptRequest[]) => {
        setParsed(data);
        setPendingRawData(null);
        setSelectedFile(null);
        setInputMethod('review');
    };

    return (
        <div className="w-full">
            {pendingRawData && (
                <div className="mb-8">
                    <ImportConfirmation
                        rawData={pendingRawData}
                        onConfirm={handleImportConfirm}
                        onCancel={() => { setPendingRawData(null); setSelectedFile(null); }}
                        onDelimiterChange={handleDelimiterChange}
                    />
                </div>
            )}

            <AnimatePresence mode="wait">
                {inputMethod === 'choice' && (
                    <motion.div
                        key="choice"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="grid md:grid-cols-3 gap-6"
                    >
                        <Card
                            className="p-8 cursor-pointer hover:shadow-2xl transition-all duration-300 border-2 border-transparent hover:border-emerald-100 bg-white group flex flex-col items-center text-center"
                            onClick={() => setInputMethod('paste')}
                        >
                            <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                <Clipboard className="w-8 h-8 text-emerald-600" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-2">Smart Paste</h3>
                            <p className="text-slate-500 text-sm leading-relaxed">
                                Copy-paste from Excel, email, or your bookkeeping software.
                            </p>
                        </Card>

                        <Card
                            className="p-8 cursor-pointer hover:shadow-2xl transition-all duration-300 border-2 border-transparent hover:border-blue-100 bg-white group flex flex-col items-center text-center relative overflow-hidden"
                        >
                            <input
                                type="file"
                                accept=".csv, .xlsx, .xls"
                                onChange={handleFileChange}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                <FileSpreadsheet className="w-8 h-8 text-blue-600" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-2">Upload File</h3>
                            <p className="text-slate-500 text-sm leading-relaxed">
                                Upload CSV or Excel files. We'll help you map the columns.
                            </p>
                        </Card>

                        <Card
                            className="p-8 cursor-pointer hover:shadow-2xl transition-all duration-300 border-2 border-transparent hover:border-amber-100 bg-white group flex flex-col items-center text-center"
                            onClick={() => {
                                setParsed([{
                                    id: Math.random().toString(36).substr(2, 9),
                                    date: new Date().toISOString().split('T')[0],
                                    merchant: "New Merchant",
                                    amount: 0,
                                    currency: "EUR",
                                    status: "pending"
                                }]);
                                setInputMethod('review');
                            }}
                        >
                            <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                <Keyboard className="w-8 h-8 text-amber-600" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-2">Quick Entry</h3>
                            <p className="text-slate-500 text-sm leading-relaxed">
                                Add receipts manually one by one directly in the app.
                            </p>
                        </Card>
                    </motion.div>
                )}

                {inputMethod === 'paste' && (
                    <motion.div
                        key="paste"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="max-w-2xl mx-auto"
                    >
                        <Card className="p-8 bg-white shadow-2xl border-0 ring-1 ring-slate-200">
                            <div className="flex items-center gap-4 mb-6">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setInputMethod('choice')}
                                    className="p-2 rounded-lg"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                </Button>
                                <h3 className="text-xl font-bold text-slate-900">Smart Paste</h3>
                            </div>

                            <p className="text-slate-500 text-sm mb-4">
                                Paste your raw list of receipts below. Format doesn't matter much - we'll handle the parsing.
                            </p>

                            <textarea
                                autoFocus
                                className="w-full min-h-[300px] bg-slate-50 border-2 border-slate-100 text-slate-700 rounded-2xl p-6 font-mono text-sm mb-6 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all placeholder:text-slate-400"
                                placeholder={`Example:\n2025-01-14 | IKEA | 129.90\nAmazon Order #123 - 49.00 USD - Feb 3\nAdobe Subscription | 34,95 \u20ac`}
                                value={textInput}
                                onChange={(e) => setTextInput(e.target.value)}
                            />

                            <div className="flex gap-4">
                                <Button
                                    onClick={() => setTextInput("")}
                                    variant="secondary"
                                    className="flex-1 py-4 rounded-xl font-bold"
                                >
                                    Clear
                                </Button>
                                <Button
                                    onClick={handleParseText}
                                    disabled={!textInput.trim()}
                                    className="flex-[2] bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-xl font-bold shadow-xl shadow-slate-900/20 disabled:opacity-50"
                                >
                                    Parse & Review
                                </Button>
                            </div>
                        </Card>
                    </motion.div>
                )}

                {inputMethod === 'review' && (
                    <motion.div
                        key="review"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="w-full"
                    >
                        <Card className="p-8 bg-white shadow-2xl border-0 ring-1 ring-slate-200 overflow-hidden">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                                <div className="flex items-center gap-4">
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => setInputMethod('choice')}
                                        className="p-2 rounded-lg"
                                    >
                                        <ArrowLeft className="w-4 h-4" />
                                    </Button>
                                    <div>
                                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">Review List</h3>
                                        <p className="text-slate-500 text-sm font-medium">{parsed.length} receipts identified</p>
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <Button
                                        variant="secondary"
                                        onClick={addRow}
                                        className="rounded-xl px-6 py-3 font-bold border-slate-200"
                                    >
                                        <Plus className="w-4 h-4 mr-2" /> Add Row
                                    </Button>
                                    <Button
                                        onClick={() => onConfirm(parsed)}
                                        disabled={parsed.length === 0}
                                        className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-3 rounded-xl font-black shadow-xl shadow-emerald-500/30 disabled:opacity-50 border-0 flex items-center gap-2"
                                    >
                                        <CheckCircle2 className="w-5 h-5" /> Start Hunt
                                    </Button>
                                </div>
                            </div>

                            <div className="overflow-x-auto -mx-8">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50/50 border-y border-slate-100">
                                            <th className="px-8 py-4 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest w-[180px]">Date</th>
                                            <th className="px-8 py-4 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Merchant / Vendor</th>
                                            <th className="px-8 py-4 text-right text-[11px] font-black text-slate-400 uppercase tracking-widest w-[150px]">Amount</th>
                                            <th className="px-8 py-4 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest w-[80px]"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {parsed.map((r) => (
                                            <motion.tr
                                                layout
                                                key={r.id}
                                                className="group hover:bg-slate-50/80 transition-colors"
                                            >
                                                <td className="px-8 py-4">
                                                    <input
                                                        type="date"
                                                        value={r.date}
                                                        onChange={(e) => updateRow(r.id, 'date', e.target.value)}
                                                        className="w-full bg-transparent border-0 font-mono text-sm text-slate-600 focus:ring-0 focus:text-slate-900 outline-none"
                                                    />
                                                </td>
                                                <td className="px-8 py-4">
                                                    <input
                                                        type="text"
                                                        value={r.merchant}
                                                        onChange={(e) => updateRow(r.id, 'merchant', e.target.value)}
                                                        className="w-full bg-transparent border-0 font-bold text-slate-900 focus:ring-0 outline-none placeholder:font-normal placeholder:text-slate-300"
                                                        placeholder="e.g. Amazon"
                                                    />
                                                </td>
                                                <td className="px-8 py-4">
                                                    <div className="flex items-center justify-end gap-2 bg-slate-100/50 px-3 py-2 rounded-lg group-hover:bg-white transition-colors">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={r.amount}
                                                            onChange={(e) => updateRow(r.id, 'amount', parseFloat(e.target.value) || 0)}
                                                            className="w-full bg-transparent border-0 text-right font-mono font-black text-emerald-600 focus:ring-0 outline-none p-0"
                                                        />
                                                        <span className="text-[10px] font-black text-emerald-600/50">{r.currency}</span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-4 text-center">
                                                    <button
                                                        onClick={() => deleteRow(r.id)}
                                                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </tbody>
                                </table>

                                {parsed.length === 0 && (
                                    <div className="py-24 flex flex-col items-center justify-center text-slate-400">
                                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                            <Trash2 className="w-6 h-6 opacity-20" />
                                        </div>
                                        <p className="font-bold">No receipts in the list</p>
                                        <p className="text-sm">Click "Add Row" to start manually or go back to paste.</p>
                                    </div>
                                )}
                            </div>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
