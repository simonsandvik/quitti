"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

interface MissingReceiptModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (reason: string) => void;
    merchant: string;
    amount: number;
    currency: string;
}

const REASONS = [
    "Receipt not available in vendor portal",
    "Vendor does not issue receipts",
    "Receipt lost / deleted",
    "Email no longer accessible",
    "Other"
];

export const MissingReceiptModal = ({ isOpen, onClose, onConfirm, merchant, amount, currency }: MissingReceiptModalProps) => {
    const [selectedReason, setSelectedReason] = useState("");
    const [otherReason, setOtherReason] = useState("");
    const [confirmed, setConfirmed] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleConfirm = () => {
        if (!selectedReason) {
            setError("Please select a reason");
            return;
        }
        if (selectedReason === "Other" && !otherReason.trim()) {
            setError("Please specify the reason");
            return;
        }
        if (!confirmed) {
            setError("Please confirm the legal declaration");
            return;
        }

        const finalReason = selectedReason === "Other" ? otherReason : selectedReason;
        onConfirm(finalReason);
        onClose();
        // Reset state
        setSelectedReason("");
        setOtherReason("");
        setConfirmed(false);
        setError(null);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 bg-slate-900/60 z-[1000] flex items-center justify-center p-4 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="w-full max-w-lg"
                >
                    <Card className="bg-white border-0 shadow-2xl rounded-3xl overflow-hidden">
                        <div className="p-8">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Formal Declaration</h2>
                                <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="bg-amber-50 rounded-2xl p-4 mb-6 flex gap-3 border border-amber-100">
                                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                <p className="text-sm text-amber-800 leading-relaxed font-medium">
                                    This action will generate a legally binding <strong>Replacement Voucher</strong> for your bookkeeping.
                                </p>
                            </div>

                            <div className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">Transaction Details</p>
                                <div className="flex justify-between items-baseline">
                                    <span className="font-bold text-slate-800 text-lg">{merchant}</span>
                                    <span className="font-bold text-slate-900 text-xl">{amount.toFixed(2)} <span className="text-slate-400 text-sm font-black">{currency}</span></span>
                                </div>
                            </div>

                            <div className="space-y-4 mb-8">
                                <p className="text-sm font-bold text-slate-700">Why is the original receipt missing?</p>
                                <div className="grid gap-2">
                                    {REASONS.map(reason => (
                                        <button
                                            key={reason}
                                            onClick={() => {
                                                setSelectedReason(reason);
                                                setError(null);
                                            }}
                                            className={`text-left px-4 py-3 rounded-xl border text-sm transition-all ${selectedReason === reason ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-bold shadow-sm' : 'border-slate-100 hover:border-slate-300 text-slate-600'}`}
                                        >
                                            {reason}
                                        </button>
                                    ))}
                                </div>

                                {selectedReason === "Other" && (
                                    <textarea
                                        autoFocus
                                        placeholder="Please specify..."
                                        className="w-full mt-2 p-4 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all min-h-[80px]"
                                        value={otherReason}
                                        onChange={(e) => setOtherReason(e.target.value)}
                                    />
                                )}
                            </div>

                            <div className="space-y-6">
                                <label className="flex gap-3 cursor-pointer group select-none">
                                    <input
                                        type="checkbox"
                                        className="mt-1"
                                        checked={confirmed}
                                        onChange={(e) => {
                                            setConfirmed(e.target.checked);
                                            setError(null);
                                        }}
                                    />
                                    <span className="text-xs text-slate-500 leading-relaxed font-medium group-hover:text-slate-700 transition-colors">
                                        I solemnly declare that this expense relates to business activities, no original receipt could be obtained despite reasonable efforts, and I assume full legal responsibility for this declaration.
                                    </span>
                                </label>

                                {error && (
                                    <p className="text-xs text-red-500 font-bold bg-red-50 p-2 rounded-lg text-center border border-red-100">{error}</p>
                                )}

                                <div className="flex gap-3">
                                    <Button variant="secondary" onClick={onClose} className="flex-1 py-4 h-auto rounded-xl">Cancel</Button>
                                    <Button
                                        variant="primary"
                                        onClick={handleConfirm}
                                        className="flex-1 py-4 h-auto rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-600/20 font-black"
                                    >
                                        Seal Declaration
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </Card>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
