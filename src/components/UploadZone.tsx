import React, { useState } from "react";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { parseReceipts, ReceiptRequest } from "@/lib/parser";
import { ingestFile, RawData } from "@/lib/importer";
import { ImportConfirmation } from "./ImportConfirmation";

interface UploadZoneProps {
    onConfirm: (receipts: ReceiptRequest[]) => void;
}

export const UploadZone = ({ onConfirm }: UploadZoneProps) => {
    const [textInput, setTextInput] = useState("");
    const [parsed, setParsed] = useState<ReceiptRequest[]>([]);
    const [pendingRawData, setPendingRawData] = useState<RawData | null>(null);

    const handleParseText = () => {
        const results = parseReceipts(textInput);
        setParsed(results);
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
    };

    return (
        <div className="animate-enter">
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

            <div className="grid lg:grid-cols-2 gap-6 items-start">
                {/* Input Area */}
                <div className="flex flex-col gap-2">
                    <h3 className="text-lg font-bold text-slate-900 text-center mb-2">Input Missing Receipts</h3>
                    <Card className="p-6 bg-white shadow-xl border border-slate-100">
                        <div className="relative mb-6 p-8 border-2 border-dashed border-slate-200 rounded-xl text-center cursor-pointer transition-all duration-300 hover:border-emerald-500/50 hover:bg-emerald-50/50 group">
                            <p className="text-sm text-slate-500 mb-3 group-hover:text-slate-700 transition-colors">
                                Drop your CSV or Excel here or
                            </p>
                            <Button variant="secondary" size="sm" className="pointer-events-none px-6 py-2 bg-white shore-slate-200">Choose File</Button>
                            <input
                                type="file"
                                accept=".csv, .xlsx, .xls"
                                onChange={handleFileChange}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-[0]"
                            />
                        </div>

                        <div className="flex items-center gap-3 mb-4">
                            <div className="flex-1 h-px bg-slate-100"></div>
                            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">or paste text</span>
                            <div className="flex-1 h-px bg-slate-100"></div>
                        </div>

                        <textarea
                            className="w-full min-h-[150px] bg-slate-50 border border-slate-200 text-slate-700 rounded-lg p-4 font-mono text-sm mb-4 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 outline-none transition-all placeholder:text-slate-400"
                            placeholder={`2025-01-14 | IKEA | 129.90\n2025-02-03 | Amazon | 49.00`}
                            value={textInput}
                            onChange={(e) => setTextInput(e.target.value)}
                        />
                        <Button onClick={handleParseText} className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl border-0 shadow-lg shadow-slate-900/10">
                            Parse & Preview Text
                        </Button>
                    </Card>
                </div>

                {/* Preview Area */}
                <div className="flex flex-col gap-2">
                    <h3 className="text-lg font-bold text-slate-900 text-center mb-2">
                        Preview <span className="text-slate-400 text-sm font-normal ml-2">({parsed.length} items)</span>
                    </h3>
                    <Card glass className="border border-slate-200 bg-white p-6 min-h-[460px] shadow-xl">
                        <div className="flex justify-end mb-4 h-8">
                            {parsed.length > 0 && (
                                <Button variant="primary" size="sm" onClick={() => onConfirm(parsed)} className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-xl shadow-emerald-500/20 px-6 py-2 w-full rounded-xl border-0">
                                    Confirm & Start Hunt
                                </Button>
                            )}
                        </div>

                        <div className="max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {parsed.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center py-20 opacity-50">
                                    <div className="text-4xl mb-4 grayscale">📝</div>
                                    <p className="text-slate-500 text-sm">No data parsed yet</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="text-left text-slate-400 border-b border-slate-100">
                                                <th className="py-2 font-semibold text-[10px] uppercase tracking-wider">Date</th>
                                                <th className="py-2 font-semibold text-[10px] uppercase tracking-wider">Merchant</th>
                                                <th className="py-2 font-semibold text-[10px] uppercase tracking-wider text-right">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {parsed.map((r, idx) => (
                                                <tr key={r.id || idx} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors group">
                                                    <td className="py-3 text-slate-500 group-hover:text-slate-700 font-mono text-xs">{r.date}</td>
                                                    <td className="py-3 text-slate-700 group-hover:text-slate-900 font-bold">{r.merchant}</td>
                                                    <td className="py-3 text-right text-emerald-600 group-hover:text-emerald-700 font-mono font-bold">{r.amount.toFixed(2)} {r.currency}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};
