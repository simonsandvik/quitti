"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { useSession } from "next-auth/react";

interface TeamSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const TeamSettingsModal = ({ isOpen, onClose }: TeamSettingsModalProps) => {
    const { data: session } = useSession();
    const [loading, setLoading] = useState(false);
    const [inviteUrl, setInviteUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleInvite = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/team/invite", {
                method: "POST"
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");

            let url = data.url;
            if (url && !url.startsWith('http')) {
                // If the API returns relative path (or if we want to force relative origin)
                url = `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
            } else if (url && url.includes('localhost') && !window.location.href.includes('localhost')) {
                // Heuristic: If we are on a tunnel (not localhost) but URL says localhost, rewrite it
                url = url.replace(/https?:\/\/localhost:[0-9]+/, window.location.origin);
            }

            setInviteUrl(url);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = () => {
        if (!inviteUrl) return;
        navigator.clipboard.writeText(inviteUrl);
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
                <Card className="p-8 max-w-[500px] w-[95vw] border border-slate-100 bg-white shadow-2xl relative overflow-hidden">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-50 transition-colors"
                    >
                        ✕
                    </button>

                    <h3 className="text-xl font-bold text-slate-900 mt-0 mb-2">Team Settings 🏢</h3>
                    <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                        Collaborate with your team on the same receipt batches.
                    </p>

                    <div className="mb-6">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Your Team</label>
                        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                            {session?.user?.image ? (
                                <img src={session.user.image} className="w-8 h-8 rounded-full" />
                            ) : (
                                <div className="w-8 h-8 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center font-bold">
                                    {session?.user?.name?.[0] || "U"}
                                </div>
                            )}
                            <div>
                                <div className="text-sm font-bold text-slate-900">{session?.user?.name}'s Team</div>
                                <div className="text-xs text-slate-500">Admin (You)</div>
                            </div>
                        </div>
                    </div>

                    <hr className="border-slate-100 mb-6" />

                    <div className="mb-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Invite Members</label>
                        {!inviteUrl ? (
                            <Button
                                variant="primary"
                                className="w-full justify-center bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/20"
                                onClick={handleInvite}
                                disabled={loading}
                            >
                                {loading ? "Generating Link..." : "Generate Invite Link"}
                            </Button>
                        ) : (
                            <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                                <p className="text-xs text-purple-800 mb-2 font-bold">Copy this link and send it to your team:</p>
                                <div className="flex gap-2">
                                    <input
                                        readOnly
                                        value={inviteUrl}
                                        className="flex-1 text-xs bg-white border border-purple-200 rounded px-3 py-2 font-mono text-purple-700"
                                        onClick={e => e.currentTarget.select()}
                                    />
                                    <Button onClick={handleCopy} className={`text-xs ${copied ? 'bg-slate-800 text-white' : 'bg-purple-600 text-white'}`}>
                                        {copied ? "Copied" : "Copy"}
                                    </Button>
                                </div>
                                <p className="text-[10px] text-purple-400 mt-2">Link expires in 7 days.</p>
                            </div>
                        )}
                        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
                    </div>

                </Card>
            </motion.div>
        </div>
    );
};
