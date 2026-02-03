"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    batchId?: string;
}

export const ShareModal = ({ isOpen, onClose, batchId }: ShareModalProps) => {
    const [loading, setLoading] = useState(false);
    const [shareUrl, setShareUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleGenerate = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/share/create", {
                method: "POST",
                body: JSON.stringify({ batchId }),
                headers: { "Content-Type": "application/json" }
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create link");

            let url = data.url;
            if (url && !url.startsWith('http')) {
                url = `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
            } else if (url && url.includes('localhost') && !window.location.href.includes('localhost')) {
                url = url.replace(/https?:\/\/localhost:[0-9]+/, window.location.origin);
            }

            setShareUrl(url);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = () => {
        if (!shareUrl) return;
        navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-950/80 z-[1200] flex items-center justify-center backdrop-blur-sm">
            <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
            >
                <Card className="p-8 max-w-[450px] w-[95vw] border border-slate-100 bg-white shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500/20">
                        <div className="h-full bg-emerald-500 w-1/3 rounded-r-full"></div>
                    </div>

                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-50 transition-colors"
                    >
                        ✕
                    </button>

                    <h3 className="text-xl font-bold text-slate-900 mt-2 mb-2">Share with Bookkeeper</h3>
                    <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                        Create a secure, read-only link for your accountant. They can view the report and download files without creating an account.
                    </p>

                    {!shareUrl ? (
                        <div className="bg-slate-50 rounded-xl p-6 border border-slate-100 mb-6 text-center">
                            <div className="text-3xl mb-3">🔗</div>
                            <p className="text-sm text-slate-600 mb-4 font-medium">Ready to generate link?</p>
                            <Button
                                variant="primary"
                                onClick={handleGenerate}
                                disabled={loading}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white w-full justify-center shadow-lg shadow-emerald-500/20"
                            >
                                {loading ? "Generating..." : "Create Secure Link"}
                            </Button>
                            {error && <p className="text-red-500 text-xs mt-3">{error}</p>}
                        </div>
                    ) : (
                        <div className="bg-emerald-50/50 rounded-xl p-6 border border-emerald-100 mb-6">
                            <label className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2 block">Secret Link</label>
                            <div className="flex gap-2">
                                <input
                                    readOnly
                                    value={shareUrl}
                                    className="flex-1 bg-white border border-emerald-200 text-slate-600 text-sm rounded-lg px-3 py-2 font-mono"
                                    onClick={(e) => e.currentTarget.select()}
                                />
                                <Button
                                    onClick={handleCopy}
                                    className={`min-w-[80px] justify-center ${copied ? 'bg-slate-800 text-white' : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'}`}
                                >
                                    {copied ? "Copied!" : "Copy"}
                                </Button>
                            </div>
                            <p className="text-[10px] text-emerald-600 mt-3 flex items-center gap-1">
                                <span>ℹ️</span> This link expires in 30 days. Anyone with the link can view the report.
                            </p>
                        </div>
                    )}

                    {!shareUrl && (
                        <div className="flex justify-end">
                            <Button variant="secondary" onClick={onClose} className="border-slate-200">Cancel</Button>
                        </div>
                    )}
                </Card>
            </motion.div>
        </div>
    );
};
