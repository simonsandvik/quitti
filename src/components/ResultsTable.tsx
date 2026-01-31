"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { MatchResult } from "@/lib/matcher";
import { ReceiptRequest } from "@/lib/parser";
import { getMerchantHierarchy } from "@/lib/grouping";
import { uploadReceiptFile, updateMatchResult } from "@/lib/supabase";
import { useSession } from "next-auth/react";
import { StatusBadge } from "./StatusBadge";
import { MerchantGroup } from "./MerchantGroup";
import { ShareModal } from "./ShareModal";
import { TeamSettingsModal } from "./TeamSettingsModal";

interface ResultsTableProps {
    receipts: ReceiptRequest[];
    matches: MatchResult[];
    autoFoundFiles?: Record<string, File>;
    onExport: (manualFiles: Record<string, File>) => void;
    onRestart: () => void;
    onAddInbox?: () => void;
}

export const ResultsTable = ({ receipts, matches, autoFoundFiles, onExport, onRestart, onAddInbox }: ResultsTableProps) => {
    const { data: session } = useSession();
    const [manualFiles, setManualFiles] = React.useState<Record<string, File>>({});
    const [previewId, setPreviewId] = React.useState<string | null>(null);
    const [showShareModal, setShowShareModal] = React.useState(false);
    const [showTeamModal, setShowTeamModal] = React.useState(false);

    // Sync auto-found files into manualFiles state
    React.useEffect(() => {
        if (autoFoundFiles && Object.keys(autoFoundFiles).length > 0) {
            setManualFiles(prev => ({ ...autoFoundFiles, ...prev }));
        }
    }, [autoFoundFiles]);
    const [missingIds, setMissingIds] = React.useState<Set<string>>(new Set());
    const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set());

    const [unmatchedFiles, setUnmatchedFiles] = React.useState<File[]>([]);
    const [isScanning, setIsScanning] = React.useState(false);
    const [confirmation, setConfirmation] = React.useState<{ type: 'MISSING' | 'REMOVE', id: string, title: string, message: string } | null>(null);

    const requestToggleMissing = (id: string) => {
        const isCurrentlyMissing = missingIds.has(id);
        if (isCurrentlyMissing) {
            setConfirmation({
                type: 'MISSING',
                id,
                title: 'Restore Receipt?',
                message: 'This will move the receipt back to the active list.'
            });
        } else {
            setConfirmation({
                type: 'MISSING',
                id,
                title: 'Mark as Missing?',
                message: 'This will move the receipt to the Missing Items list.'
            });
        }
    };

    const requestRemoveFile = (id: string) => {
        setConfirmation({
            type: 'REMOVE',
            id,
            title: 'Remove File?',
            message: 'Are you sure you want to unassign this file? This cannot be undone.'
        });
    };

    const confirmAction = () => {
        if (!confirmation) return;
        const { type, id } = confirmation;

        if (type === 'MISSING') {
            const next = new Set(missingIds);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            setMissingIds(next);
        } else if (type === 'REMOVE') {
            setManualFiles(prev => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
        }
        setConfirmation(null);
    };

    const cancelAction = () => {
        setConfirmation(null);
    };

    const toggleMissing = (id: string) => requestToggleMissing(id); /* Wrapper to keep prop name same */
    const handleRemoveFileWrapper = (id: string) => requestRemoveFile(id);

    const toggleGroup = (group: string) => {
        const next = new Set(expandedGroups);
        if (next.has(group)) next.delete(group);
        else next.add(group);
        setExpandedGroups(next);
    };

    const uploadAndSave = async (receiptId: string, file: File) => {
        if (!session?.user) return;
        const userId = (session.user as any).id;
        try {
            console.log(`[Cloud] Uploading receipt ${receiptId}...`);
            const path = await uploadReceiptFile(userId, receiptId, file);
            await updateMatchResult(receiptId, {
                receiptId,
                emailId: "manual", // Mock emailId for manual uplaod
                status: "FOUND",
                confidence: 100, // Manual match is 100%
                details: `Manual Upload (Drag & Drop) - ${file.name}`
            }, userId, path);
            console.log(`[Cloud] Upload complete: ${path}`);
        } catch (e) {
            console.error("Failed to upload receipt", e);
        }
    };

    const handleFileChange = (receiptId: string, file: File | null) => {
        if (file) {
            setManualFiles(prev => ({ ...prev, [receiptId]: file }));
            // Trigger background upload
            uploadAndSave(receiptId, file);
        } else {
            setManualFiles(prev => {
                const next = { ...prev };
                delete next[receiptId];
                return next;
            });
        }
    };

    // Helper for props
    const onRemoveFile = handleRemoveFileWrapper;

    const handleBulkUpload = async (files: FileList | null, targetReceipts: ReceiptRequest[] = receipts) => {
        if (!files) return;
        setIsScanning(true);
        setUnmatchedFiles([]); // Reset unmatched for new batch
        const newFiles = { ...manualFiles };
        const newUnmatched: File[] = [];

        // Dynamic import to avoid SSR issues
        const { extractTextFromPdf } = await import("@/lib/pdf-reader");
        const { matchReceiptByContent } = await import("@/lib/matcher");

        for (const file of Array.from(files)) {
            let bestMatchId: string | null = null;
            let bestScore = 0;
            const isPdf = file.name.toLowerCase().endsWith('.pdf');
            const isImage = file.type.startsWith('image/');

            // 1. Try Content Match (PDF or Image)
            if (isPdf || isImage) {
                try {
                    let text = "";
                    if (isPdf) {
                        text = await extractTextFromPdf(file);
                    } else if (isImage) {
                        const { recognizeText } = await import("@/lib/ocr");
                        text = await recognizeText(file);
                    }

                    if (text) {
                        for (const req of targetReceipts) {
                            // Skip already found?
                            const status = (matches.find(m => m.receiptId === req.id)?.status || "NOT_FOUND");
                            if (status === "FOUND" || newFiles[req.id]) continue;

                            const { score } = matchReceiptByContent(text, req);
                            // UNIFIED LOGIC: Threshold >= 50 matches server logic (Exact Amount = 50)
                            if (score > bestScore && score >= 50) {
                                bestScore = score;
                                bestMatchId = req.id;
                            }
                        }
                    }
                } catch (e) {
                    console.error("Content Matching Failed", e);
                }
            }

            // 2. Strict Match Required
            if (bestMatchId) {
                newFiles[bestMatchId] = file;
            } else {
                newUnmatched.push(file);
            }
        }

        setManualFiles(newFiles);
        setUnmatchedFiles(newUnmatched);

        // Background upload all new matches
        Object.entries(newFiles).forEach(([id, file]) => {
            if (!manualFiles[id]) { // Only upload if it wasn't there before
                uploadAndSave(id, file);
            }
        });

        setIsScanning(false);
    };
    // Active receipts are those NOT marked missing
    const activeReceipts = receipts.filter(r => !missingIds.has(r.id));
    const missingReceiptsList = receipts.filter(r => missingIds.has(r.id));

    const foundCount = activeReceipts.filter(r => {
        const status = manualFiles[r.id] ? "FOUND" : (matches.find(m => m.receiptId === r.id)?.status || "NOT_FOUND");
        return status === "FOUND";
    }).length;

    // "Missing" count for header logic refers to items NOT found yet
    const pendingCount = activeReceipts.length - foundCount;

    // Merchants based on ACTIVE only
    const merchants = Array.from(new Set(activeReceipts.map(r => r.merchant))).sort();

    // Grouping logic for the UI
    const groupMap = new Map<string, string[]>();
    activeReceipts.forEach(r => {
        const { main } = getMerchantHierarchy(r.merchant);
        if (!groupMap.has(main)) {
            groupMap.set(main, []);
        }
        if (!groupMap.get(main)?.includes(r.merchant)) {
            groupMap.get(main)?.push(r.merchant);
        }
    });

    const sortedGroups = Array.from(groupMap.keys()).sort();

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-6xl mx-auto"
        >
            <div className="flex flex-col md:flex-row justify-between items-baseline mb-8 gap-4">
                <div>
                    <h2 className="text-3xl font-extrabold bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent mb-2">Hunting Results</h2>
                    <p className="text-slate-500 text-sm">
                        Found {foundCount} items. {pendingCount} still pending. {missingReceiptsList.length} marked missing.
                    </p>
                </div>
                <div className="flex flex-wrap gap-3 items-center">
                    {isScanning && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="animate-pulse text-xs text-emerald-500 font-bold">Scanning content...</motion.span>}
                    <div className="relative">
                        <Button variant="secondary" disabled={isScanning} size="sm" className="px-4 py-2 border-slate-200">Bulk Upload All</Button>
                        <input
                            type="file"
                            multiple
                            accept="image/*,.pdf"
                            onChange={(e) => handleBulkUpload(e.target.files)}
                            disabled={isScanning}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                    </div>
                    <Button variant="primary" onClick={() => onExport(manualFiles)} className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-xl shadow-emerald-500/20 px-6 py-2 h-auto border-0 rounded-xl">
                        Download Finished ZIP
                    </Button>
                    <Button variant="secondary" onClick={() => setShowShareModal(true)} className="bg-white hover:bg-slate-50 text-emerald-600 border border-emerald-100 shadow-sm px-4 py-2 h-auto rounded-xl">
                        Share w/ Bookkeeper
                    </Button>
                </div>
            </div>

            <AnimatePresence>
                {pendingCount > 0 && onAddInbox && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                    >
                        <Card glass className="mb-8 border border-dashed border-slate-300 bg-slate-50 p-6 flex flex-col md:flex-row justify-between items-center gap-4 shadow-sm">
                            <div>
                                <p className="text-sm text-slate-500">
                                    <strong className="text-slate-900">Still missing items?</strong>
                                    <span className="ml-2">You can connect another inbox or mark them as missing manually.</span>
                                </p>
                            </div>
                            <Button variant="secondary" size="sm" onClick={onAddInbox} className="text-xs px-4 py-2 h-auto border-slate-200">Connect another inbox</Button>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Unmatched Files Alert */}
            <AnimatePresence>
                {unmatchedFiles.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                    >
                        <Card className="mb-8 border border-red-500/20 bg-red-500/5 p-6 shadow-xl shadow-red-500/5">
                            <div className="flex flex-col gap-2">
                                <h4 className="text-sm font-bold text-red-400 m-0 flex items-center gap-2">
                                    <span className="text-lg">⚠️</span>
                                    Unable to auto-match {unmatchedFiles.length} {unmatchedFiles.length === 1 ? 'file' : 'files'}
                                </h4>
                                <p className="text-xs text-slate-400 ml-7">
                                    Please manually assign these files to their receipts:
                                </p>
                                <div className="flex flex-wrap gap-2 mt-2 ml-7">
                                    {unmatchedFiles.slice(0, 20).map((file, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.05 }}
                                            className="flex items-center gap-2 bg-black/40 px-2 py-1 rounded text-[10px] text-red-300 border border-red-500/10"
                                        >
                                            <span>{file.name}</span>
                                            <button
                                                onClick={() => setPreviewId(URL.createObjectURL(file))}
                                                className="bg-none border-0 cursor-pointer text-white hover:text-red-200"
                                                title="Preview File"
                                            >
                                                👁️
                                            </button>
                                        </motion.div>
                                    ))}
                                    {unmatchedFiles.length > 20 && (
                                        <span className="text-[10px] text-red-300 opacity-80 flex items-center">
                                            + {unmatchedFiles.length - 20} more
                                        </span>
                                    )}
                                </div>
                                <p className="text-[10px] text-slate-500 mt-2 italic ml-7">
                                    Tip: You can drag & drop these files directly onto the "Upload" buttons below.
                                </p>
                            </div>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex flex-col gap-4">
                {sortedGroups.map((mainGroup, index) => {
                    const groupReceipts = activeReceipts.filter(r => getMerchantHierarchy(r.merchant).main === mainGroup);
                    const groupFoundCount = groupReceipts.filter(r => {
                        const status = matches.find(m => m.receiptId === r.id)?.status;
                        return status === "FOUND" || !!manualFiles[r.id];
                    }).length;
                    const isComplete = groupFoundCount === groupReceipts.length && groupReceipts.length > 0;
                    const isPartial = groupFoundCount > 0 && !isComplete;
                    const isExpanded = expandedGroups.has(mainGroup);
                    const subMerchants = groupMap.get(mainGroup) || [];

                    return (
                        <motion.div
                            key={mainGroup}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className={`bg-white rounded-xl transition-all shadow-sm ${isComplete ? "border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.05)]" : isPartial ? "border border-amber-400/30 shadow-[0_0_20px_rgba(251,191,36,0.05)]" : "border border-slate-100"}`}
                        >
                            <div
                                onClick={() => toggleGroup(mainGroup)}
                                className="p-4 cursor-pointer flex items-center justify-between hover:bg-slate-50 rounded-xl transition-colors group"
                            >
                                <div className="flex items-center gap-3">
                                    <motion.div
                                        animate={{ rotate: isExpanded ? 90 : 0 }}
                                        className="w-5 h-5 flex items-center justify-center text-slate-500"
                                    >
                                        ▶
                                    </motion.div>
                                    <div className="relative">
                                        <div className={`w-2 h-2 rounded-full ${isComplete ? "bg-emerald-500" : isPartial ? "bg-amber-400" : (isExpanded ? "bg-emerald-500/50" : "bg-slate-200")}`}></div>
                                        {isComplete && (
                                            <motion.div
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                className="absolute -left-1 -top-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                                            >
                                                <span className="text-[10px] text-white font-bold">✓</span>
                                            </motion.div>
                                        )}
                                        {isPartial && (
                                            <motion.div
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                className="absolute -left-1 -top-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(251,191,36,0.5)] animate-pulse"
                                            >
                                                <span className="text-[10px] text-white font-bold inline-block animate-bounce">!</span>
                                            </motion.div>
                                        )}
                                    </div>

                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <h3 className={`text-base font-bold m-0 ${isComplete ? "text-emerald-600" : isPartial ? "text-amber-600" : "text-slate-900"}`}>{mainGroup}</h3>
                                        </div>
                                        {isComplete && <span className="text-[10px] text-emerald-500 text-opacity-80 font-bold uppercase tracking-tight">All found</span>}
                                        {isPartial && <span className="text-[10px] text-amber-500 text-opacity-80 font-bold uppercase tracking-tight">Partial match</span>}
                                    </div>

                                    <span className="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded-full ml-2">
                                        {groupFoundCount} / {groupReceipts.length} {groupReceipts.length === 1 ? 'Receipt' : 'Receipts'}
                                    </span>
                                </div>

                                <div className="relative" onClick={(e) => e.stopPropagation()}>
                                    <Button variant="secondary" size="sm" className="text-xs px-4 py-2 h-auto opacity-60 group-hover:opacity-100 transition-opacity border-slate-200">
                                        Upload for {mainGroup}
                                    </Button>
                                    <input
                                        type="file"
                                        multiple
                                        accept="image/*,.pdf"
                                        onChange={(e) => handleBulkUpload(e.target.files, groupReceipts)}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                </div>
                            </div>

                            <AnimatePresence>
                                {isExpanded && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="p-4 pt-0 flex flex-col gap-4 border-t border-slate-100 mt-4">
                                            {subMerchants.sort().map(merchant => {
                                                const merchantReceipts = activeReceipts.filter(r => r.merchant === merchant);
                                                return (
                                                    <MerchantGroup
                                                        key={merchant}
                                                        merchant={merchant}
                                                        receipts={merchantReceipts}
                                                        matches={matches}
                                                        manualFiles={manualFiles}
                                                        missingIds={missingIds}
                                                        onFileChange={handleFileChange}
                                                        onPreview={setPreviewId}
                                                        onToggleMissing={toggleMissing}
                                                        onRemoveFile={onRemoveFile}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    );
                })}
            </div>

            {/* MISSING RECEIPTS CARD */}
            {missingReceiptsList.length > 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="mt-12 border-t border-dashed border-white/10 pt-8"
                >
                    <h3 className="text-lg text-slate-400 mb-4 flex items-center gap-2">
                        <span>⚠️</span> Missing Receipts ({missingReceiptsList.length})
                    </h3>
                    <div className="opacity-70 grayscale-[0.5]">
                        <MerchantGroup
                            merchant="Lost & Missing Items"
                            receipts={missingReceiptsList}
                            matches={matches}
                            manualFiles={manualFiles}
                            missingIds={missingIds}
                            onFileChange={handleFileChange}
                            onPreview={setPreviewId}
                            onToggleMissing={toggleMissing}
                            onRemoveFile={onRemoveFile}
                        />
                    </div>
                </motion.div>
            )}

            {/* REAL PDF Preview Modal */}
            <AnimatePresence>
                {previewId && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/90 z-[1100] flex items-center justify-center backdrop-blur-md"
                        onClick={() => setPreviewId(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="w-[95%] h-[90vh] flex flex-col"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex justify-end pb-2">
                                <button onClick={() => setPreviewId(null)} className="bg-white text-black rounded-full w-8 h-8 font-bold hover:bg-slate-200 transition-colors flex items-center justify-center shadow-lg">✕</button>
                            </div>
                            <div className="flex-1 bg-slate-800 rounded-lg overflow-hidden border border-slate-700 shadow-2xl relative">
                                {previewId.startsWith('blob:') ? (
                                    <iframe src={previewId} className="w-full h-full border-0" />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-white">
                                        <p>Preview not available for this type (Email/ID only)</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Confirmation Modal */}
            <AnimatePresence>
                {confirmation && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-950/80 z-[1200] flex items-center justify-center backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        >
                            <Card className="p-8 max-w-[400px] w-[90%] border border-slate-100 bg-white shadow-2xl relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500/20">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: "100%" }}
                                        className="h-full bg-emerald-500"
                                    />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 mt-0 mb-2">{confirmation.title}</h3>
                                <p className="text-slate-500 mb-6 text-sm leading-relaxed">{confirmation.message}</p>
                                <div className="flex gap-3 justify-end">
                                    <Button variant="secondary" onClick={cancelAction} className="border-slate-200">Cancel</Button>
                                    <Button variant="primary" className="bg-red-500 hover:bg-red-600 border-0 shadow-lg shadow-red-500/20 rounded-xl" onClick={confirmAction}>Confirm</Button>
                                </div>
                            </Card>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {showShareModal && (
                <ShareModal
                    isOpen={showShareModal}
                    onClose={() => setShowShareModal(false)}
                />
            )}

            {showTeamModal && (
                <TeamSettingsModal
                    isOpen={showTeamModal}
                    onClose={() => setShowTeamModal(false)}
                />
            )}
        </motion.div>
    );
};
