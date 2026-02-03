"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, CheckCircle2 } from "lucide-react";
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
import { MissingReceiptModal } from "./MissingReceiptModal";
import { markAsTrulyMissingServerAction } from "@/app/actions";

interface ResultsTableProps {
    receipts: ReceiptRequest[];
    matches: MatchResult[];
    autoFoundFiles?: Record<string, File>;
    activeBatchId?: string | null;
    onExport: (manualFiles: Record<string, File>, useFolders: boolean) => void;
    onRestart: () => void;
    onPreview: (url: string, type: 'pdf' | 'image' | 'html') => void;
    onAddInbox?: () => void;
    isPaid?: boolean;
    onPaymentRequired?: () => void;
}

export const ResultsTable = ({
    receipts,
    matches,
    autoFoundFiles,
    activeBatchId,
    onExport,
    onRestart,
    onPreview,
    onAddInbox,
    isPaid = false,
    onPaymentRequired
}: ResultsTableProps) => {
    const { data: session } = useSession();
    const [manualFiles, setManualFiles] = React.useState<Record<string, File>>({});
    const [previewData, setPreviewData] = React.useState<{ url: string; type: 'pdf' | 'image' | 'html' } | null>(null);
    const [showShareModal, setShowShareModal] = React.useState(false);
    const [showTeamModal, setShowTeamModal] = React.useState(false);
    const [showExportMenu, setShowExportMenu] = React.useState(false);

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
    const [declaringReceipt, setDeclaringReceipt] = React.useState<ReceiptRequest | null>(null);
    const [confirmation, setConfirmation] = React.useState<{
        type: 'MISSING' | 'REMOVE' | 'MISMATCH',
        id: string,
        title: string,
        message: string,
        file?: File,
        mismatchDetails?: { expected: number; found: number; currency: string },
        matchFlags?: { amount: boolean; merchant: boolean; date: boolean }
    } | null>(null);

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
        } else if (type === 'MISMATCH' && confirmation.file) {
            setManualFiles(prev => ({ ...prev, [id]: confirmation.file! }));
            uploadAndSave(id, confirmation.file!);
        }
        setConfirmation(null);
    };

    const cancelAction = () => {
        setConfirmation(null);
    };

    const toggleMissing = (id: string) => requestToggleMissing(id); /* Wrapper to keep prop name same */

    const handleTrulyMissing = async (reason: string) => {
        if (!declaringReceipt) return;
        try {
            await markAsTrulyMissingServerAction(declaringReceipt.id, reason);
            // Updating local state (assuming revalidatePath handles the rest, 
            // but for immediate UI feedback we might want to update local state too)
            // For now, let's trust the server action and refresh
            window.location.reload();
        } catch (e) {
            console.error("Failed to mark as truly missing", e);
            alert("Failed to save declaration. Please try again.");
        }
    };
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

    const handleFileChange = async (receiptId: string, file: File | null) => {
        if (file) {
            // VALIDATION STEP: Check if the manually uploaded file matches the receipt request
            const req = receipts.find(r => r.id === receiptId);
            if (req) {
                try {
                    const isPdf = file.name.toLowerCase().endsWith('.pdf');
                    // Only validate PDFs for now (images require OCR which is heavier/slower)
                    if (isPdf) {
                        const { extractTextFromPdf } = await import("@/lib/pdf-reader");
                        const { matchReceiptByContent } = await import("@/lib/matcher");

                        const text = await extractTextFromPdf(file);
                        // TypeScript will pick up new interface
                        const { score, details, foundAmount, matches } = matchReceiptByContent(text, req);

                        // Check Mismatch
                        // Note: We access the new 'matches' object from matcher.ts
                        const isMismatch = score < 45 || (matches && !matches.amount);

                        if (isMismatch) {
                            console.warn(`[Manual Validation] Mismatch detected for ${req.merchant}. Score: ${score}`, details);
                            setConfirmation({
                                type: 'MISMATCH',
                                id: receiptId,
                                title: '⚠️ Mismatch Detected',
                                message: `This file might be incorrect. We verified the content against the receipt details:`,
                                file: file,
                                mismatchDetails: {
                                    expected: req.amount,
                                    found: foundAmount || 0,
                                    currency: req.currency
                                },
                                matchFlags: matches
                            });
                            return; // Stop here, wait for confirmation
                        }
                    }
                } catch (e) {
                    console.error("Validation failed", e);
                    // If validation errors (e.g. password protected PDF), we verify let it pass but maybe warn?
                    // For now, let it pass to avoid blocking user.
                }
            }

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
        let successCount = 0;

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
                successCount++;
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

        // BULK REPORT
        const unmatchedCount = newUnmatched.length;
        if (successCount > 0 || unmatchedCount > 0) {
            alert(`Bulk Scan Complete:\n\n✅ Matched: ${successCount} files\n⚠️ Unmatched: ${unmatchedCount} files\n\nUnmatched files are listed at the top for manual review.`);
        }
    };
    // Active receipts are those NOT marked missing
    // Active receipts are those NOT marked missing (either locally or persisted)
    const activeReceipts = receipts.filter(r => !missingIds.has(r.id) && !r.is_truly_missing);
    const missingReceiptsList = receipts.filter(r => missingIds.has(r.id) || r.is_truly_missing);

    const foundCount = activeReceipts.filter(r => {
        const status = manualFiles[r.id] ? "FOUND" : (matches.find(m => m.receiptId === r.id)?.status || "NOT_FOUND");
        return status === "FOUND";
    }).length;

    // "Missing" count for header logic refers to items NOT found yet
    const pendingCount = activeReceipts.length - foundCount;

    // Merchants based on ACTIVE only
    const merchants = Array.from(new Set(activeReceipts.map(r => r.merchant))).sort();

    const [bulkUploading, setBulkUploading] = React.useState(false);
    const [showDeleteModal, setShowDeleteModal] = React.useState(false);

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

    const executeDelete = async () => {
        try {
            if (activeBatchId) {
                const { deleteBatchServerAction } = await import("@/app/actions");
                await deleteBatchServerAction(activeBatchId);
            }

            // Nuclear wipe of all potential session data
            localStorage.removeItem("quitti-active-batch");
            localStorage.removeItem("quitti-matches");
            localStorage.removeItem("quitti-queue");
            localStorage.removeItem("quitti-receipts");
            localStorage.removeItem("quitti-sessions");
            sessionStorage.removeItem("quitti-active-tab");
            sessionStorage.removeItem("quitti-is-connecting");

            // Force return to front page
            window.location.href = "/";
        } catch (err) {
            console.error("Failed to delete project", err);
            alert("Failed to delete project. Please try again.");
            setShowDeleteModal(false);
        }
    };

    const [viewMode, setViewMode] = React.useState<'grouped' | 'list'>('grouped');
    const [sortConfig, setSortConfig] = React.useState<{ field: 'date' | 'merchant' | 'amount' | 'status', direction: 'asc' | 'desc' }>({
        field: 'date',
        direction: 'desc'
    });

    const handleSort = (field: 'date' | 'merchant' | 'amount' | 'status') => {
        setSortConfig(current => ({
            field,
            direction: current.field === field && current.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    const getSortedReceipts = () => {
        return [...activeReceipts].sort((a, b) => {
            const modifier = sortConfig.direction === 'asc' ? 1 : -1;

            if (sortConfig.field === 'date') {
                return (new Date(a.date).getTime() - new Date(b.date).getTime()) * modifier;
            }
            if (sortConfig.field === 'amount') {
                return (a.amount - b.amount) * modifier;
            }
            if (sortConfig.field === 'merchant') {
                return a.merchant.localeCompare(b.merchant) * modifier;
            }
            if (sortConfig.field === 'status') {
                const getStatus = (r: ReceiptRequest) => {
                    const match = matches.find(m => m.receiptId === r.id);
                    const manualFile = manualFiles[r.id];
                    const isFound = match?.status === "FOUND" || !!manualFile;
                    const isMissing = missingIds.has(r.id);
                    if (isMissing) return 0; // MISSING
                    if (isFound) return 2;   // FOUND
                    return 1;                // PENDING
                };
                return (getStatus(a) - getStatus(b)) * modifier;
            }
            return 0;
        });
    };

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
                <div className="flex flex-col items-end gap-3">
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        <button
                            onClick={() => setViewMode('grouped')}
                            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${viewMode === 'grouped' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Grouped
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${viewMode === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            List View
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-3 items-center relative">
                        {isScanning && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="animate-pulse text-xs text-emerald-500 font-bold">Scanning content...</motion.span>}

                        {/* Bulk Upload */}
                        <div className="relative">
                            <Button variant="secondary" disabled={isScanning} size="sm" className="px-4 py-2 border-slate-200">Bulk Upload</Button>
                            <input
                                type="file"
                                multiple
                                accept="image/*,.pdf"
                                onChange={(e) => handleBulkUpload(e.target.files)}
                                disabled={isScanning}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                        </div>

                        {/* Delete Project */}
                        <Button variant="secondary" onClick={() => setShowDeleteModal(true)} className="bg-white hover:bg-red-50 text-red-500 border-red-100 shadow-sm px-4 py-2 h-auto rounded-xl">
                            Delete Project
                        </Button>

                        {/* Share (Team) - Renamed from Team */}
                        <Button variant="secondary" onClick={() => setShowTeamModal(true)} className="bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 shadow-sm px-4 py-2 h-auto rounded-xl">
                            Share
                        </Button>

                        {/* EXPORT DROPDOWN */}
                        <div className="relative">
                            <Button
                                variant="primary"
                                onClick={() => setShowExportMenu(!showExportMenu)}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-xl shadow-emerald-500/20 px-6 py-2 h-auto border-0 rounded-xl flex items-center gap-2"
                            >
                                Export / Download
                                <span className="text-xs opacity-70">▼</span>
                            </Button>

                            {/* Menu */}
                            <AnimatePresence>
                                {showExportMenu && (
                                    <>
                                        {/* Backdrop to close */}
                                        <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />

                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 10 }}
                                            className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-100 z-20 overflow-hidden flex flex-col p-1"
                                        >
                                            <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Download</div>
                                            <button
                                                onClick={() => {
                                                    onExport(manualFiles, true); // Folders
                                                    setShowExportMenu(false);
                                                }}
                                                className="text-left px-3 py-2 text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 rounded-lg transition-colors flex items-center justify-between group"
                                            >
                                                <span>Download ZIP (Folders)</span>
                                                <span className="text-emerald-500 opacity-0 group-hover:opacity-100">↓</span>
                                            </button>
                                            <button
                                                onClick={() => {
                                                    onExport(manualFiles, false); // Flat
                                                    setShowExportMenu(false);
                                                }}
                                                className="text-left px-3 py-2 text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 rounded-lg transition-colors flex items-center justify-between group"
                                            >
                                                <span>Download ZIP (Flat)</span>
                                                <span className="text-emerald-500 opacity-0 group-hover:opacity-100">↓</span>
                                            </button>

                                            <div className="h-px bg-slate-100 my-1"></div>

                                            <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Share</div>
                                            <button
                                                onClick={() => {
                                                    if (isPaid) {
                                                        setShowShareModal(true);
                                                    } else if (onPaymentRequired) {
                                                        onPaymentRequired();
                                                    }
                                                    setShowExportMenu(false);
                                                }}
                                                className="text-left px-3 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 rounded-lg transition-colors flex items-center justify-between group"
                                            >
                                                <span>Share w/ Bookkeeper</span>
                                                <span className="text-blue-500 opacity-0 group-hover:opacity-100">↗</span>
                                            </button>
                                        </motion.div>
                                    </>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
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
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={onAddInbox}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 border-0 text-xs px-6 py-2 h-auto rounded-xl"
                            >
                                Connect another inbox
                            </Button>
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
                                                onClick={() => {
                                                    const type = file.type.includes('pdf') ? 'pdf' : 'image';
                                                    setPreviewData({ url: URL.createObjectURL(file), type });
                                                }}
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

            {viewMode === 'list' ? (
                // LIST VIEW
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200 select-none">
                            <tr>
                                <th onClick={() => handleSort('date')} className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider text-xs cursor-pointer hover:bg-slate-100 transition-colors group">
                                    Date <span className="invisible group-hover:visible">{sortConfig.field === 'date' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                                    {sortConfig.field === 'date' && <span className="ml-1 text-slate-900">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                                </th>
                                <th onClick={() => handleSort('merchant')} className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider text-xs cursor-pointer hover:bg-slate-100 transition-colors group">
                                    Merchant <span className="invisible group-hover:visible">{sortConfig.field === 'merchant' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                                    {sortConfig.field === 'merchant' && <span className="ml-1 text-slate-900">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                                </th>
                                <th onClick={() => handleSort('amount')} className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider text-xs cursor-pointer hover:bg-slate-100 transition-colors group">
                                    Amount <span className="invisible group-hover:visible">{sortConfig.field === 'amount' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                                    {sortConfig.field === 'amount' && <span className="ml-1 text-slate-900">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                                </th>
                                <th onClick={() => handleSort('status')} className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider text-xs cursor-pointer hover:bg-slate-100 transition-colors group">
                                    Status <span className="invisible group-hover:visible">{sortConfig.field === 'status' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                                    {sortConfig.field === 'status' && <span className="ml-1 text-slate-900">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                                </th>
                                <th className="px-4 py-3 text-right font-bold text-slate-400 uppercase tracking-wider text-xs">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {getSortedReceipts().map(r => {
                                const match = matches.find(m => m.receiptId === r.id);
                                const manualFile = manualFiles[r.id];
                                const isFound = match?.status === "FOUND" || !!manualFile;
                                const isMissing = missingIds.has(r.id);
                                const rowDate = new Date(r.date).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' });

                                return (
                                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 font-mono text-slate-500">{rowDate}</td>
                                        <td className="px-4 py-3 font-bold text-slate-800">{r.merchant}</td>
                                        <td className="px-4 py-3 font-mono font-bold text-slate-900">
                                            {r.amount.toFixed(2)} <span className="text-slate-400 text-xs">{r.currency}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={isMissing ? "MISSING" : (isFound ? "FOUND" : "MISSING")} />
                                        </td>
                                        <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                                            {isFound ? (
                                                <Button size="sm" variant="secondary" className="h-8 px-3 text-xs" onClick={() => {
                                                    if (manualFile) {
                                                        const type = manualFile.name.endsWith('.pdf') ? 'pdf' : 'image';
                                                        setPreviewData({ url: URL.createObjectURL(manualFile), type });
                                                    } else if (match?.storagePath) {
                                                        onPreview(match.storagePath, 'pdf');
                                                    }
                                                }}>
                                                    Preview
                                                </Button>
                                            ) : (
                                                <div className="relative inline-block">
                                                    <Button size="sm" variant="secondary" className="h-8 px-3 text-xs">Upload</Button>
                                                    <input
                                                        type="file"
                                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                                        onChange={(e) => handleFileChange(r.id, e.target.files?.[0] || null)}
                                                    />
                                                </div>
                                            )}
                                            <button
                                                onClick={() => toggleMissing(r.id)}
                                                className={`p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-red-500 transition-colors ${isMissing ? 'text-red-500' : ''}`}
                                                title={isMissing ? "Restore" : "Mark as Missing"}
                                            >
                                                ✕
                                            </button>
                                            {isMissing && !r.is_truly_missing && (
                                                <button
                                                    onClick={() => setDeclaringReceipt(r)}
                                                    className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 bg-indigo-50 px-2 py-1 rounded transition-colors"
                                                >
                                                    Formal Declaration
                                                </button>
                                            )}
                                            {r.is_truly_missing && (
                                                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded flex items-center gap-1 border border-amber-100">
                                                    <CheckCircle2 className="w-3 h-3" />
                                                    Truly Missing
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                // GROUPED VIEW (Existing)
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
                                                            onToggleMissing={toggleMissing}
                                                            onRemoveFile={onRemoveFile}
                                                            onPreview={(url, type) => setPreviewData({ url, type })}
                                                            onDeclare={setDeclaringReceipt}
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
            )
            }

            {/* MISSING RECEIPTS CARD */}
            {
                missingReceiptsList.length > 0 && (
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
                                merchant="Matching Invoices"
                                receipts={missingReceiptsList}
                                matches={matches}
                                manualFiles={manualFiles}
                                missingIds={missingIds}
                                onFileChange={handleFileChange}
                                onPreview={(url, type) => setPreviewData({ url, type })}
                                onToggleMissing={toggleMissing}
                                onRemoveFile={onRemoveFile}
                                onDeclare={setDeclaringReceipt}
                            />
                        </div>
                    </motion.div>
                )
            }

            {/* REAL PDF Preview Modal */}
            <AnimatePresence>
                {previewData && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/90 z-[1100] flex flex-col p-6 animate-in fade-in duration-300"
                    >
                        <div className="flex justify-end pb-4">
                            <button
                                onClick={() => setPreviewData(null)}
                                className="bg-white/10 hover:bg-white/20 text-white rounded-full w-10 h-10 font-bold transition-all flex items-center justify-center shadow-xl backdrop-blur-md border border-white/20"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="flex-1 bg-white rounded-2xl overflow-hidden shadow-2xl relative border-4 border-white/5">
                            {previewData.type === 'image' ? (
                                <div className="w-full h-full flex items-center justify-center bg-slate-100/50">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={previewData.url}
                                        alt="Receipt Preview"
                                        className="max-w-full max-h-full object-contain animate-in zoom-in-95 duration-300"
                                    />
                                </div>
                            ) : previewData.type === 'pdf' ? (
                                <iframe src={previewData.url} className="w-full h-full border-0" />
                            ) : (
                                <div className="w-full h-full bg-white p-8 overflow-auto">
                                    <div dangerouslySetInnerHTML={{ __html: previewData.url }} />
                                </div>
                            )}
                        </div>
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
                            <Card className="p-8 max-w-[420px] w-[90%] border border-slate-100 bg-white shadow-2xl relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500/20">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: "100%" }}
                                        className={`h-full ${confirmation.type === 'MISMATCH' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                    />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 mt-0 mb-2">{confirmation.title}</h3>
                                <p className="text-slate-500 mb-6 text-sm leading-relaxed">{confirmation.message}</p>

                                {confirmation.mismatchDetails && (
                                    <div className="mb-6 bg-slate-50 rounded-lg p-4 border border-slate-100 flex items-center justify-between gap-4">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] uppercase font-bold text-slate-400">Expected</span>
                                            <span className="text-lg font-bold text-slate-700">
                                                {confirmation.mismatchDetails.expected.toFixed(2)} <span className="text-xs">{confirmation.mismatchDetails.currency}</span>
                                            </span>
                                        </div>
                                        <div className="flex flex-col text-right">
                                            <span className="text-[10px] uppercase font-bold text-slate-400">Found</span>
                                            <span className="text-lg font-bold text-amber-600">
                                                {confirmation.mismatchDetails.found.toFixed(2)} <span className="text-xs">{confirmation.mismatchDetails.currency}</span>
                                            </span>
                                        </div>
                                    </div>
                                )}

                                <div className="flex justify-end gap-3">
                                    <Button variant="secondary" onClick={cancelAction} className="border-slate-200">
                                        Cancel
                                    </Button>
                                    <Button
                                        variant="primary"
                                        onClick={confirmAction}
                                        className={`${confirmation.type === 'REMOVE' ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20'} text-white border-0`}
                                    >
                                        {confirmation.type === 'REMOVE' ? 'Remove' : 'Confirm'}
                                    </Button>
                                </div>
                            </Card>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Delete Confirmation Modal */}
            <AnimatePresence>
                {showDeleteModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="w-full max-w-md"
                        >
                            <Card className="p-8 bg-white shadow-2xl border-0 ring-1 ring-slate-200 text-center">
                                <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <Trash2 className="w-10 h-10 text-red-500" />
                                </div>
                                <h3 className="text-2xl font-black text-slate-900 mb-2">Delete Project?</h3>
                                <p className="text-slate-500 mb-8 leading-relaxed">
                                    This will permanently delete all identified receipts, matches, and uploaded files for this hunt. This action cannot be undone.
                                </p>
                                <div className="grid grid-cols-2 gap-4">
                                    <Button
                                        variant="secondary"
                                        onClick={() => setShowDeleteModal(false)}
                                        className="py-4 rounded-xl font-bold border-slate-200"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        variant="primary"
                                        onClick={executeDelete}
                                        className="bg-red-500 hover:bg-red-600 text-white py-4 rounded-xl font-bold shadow-xl shadow-red-500/20 border-0"
                                    >
                                        Delete Everything
                                    </Button>
                                </div>
                            </Card>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Share & Team Modals */}
            <ShareModal
                isOpen={showShareModal}
                onClose={() => setShowShareModal(false)}
                batchId={activeBatchId || undefined}
            />
            <TeamSettingsModal
                isOpen={showTeamModal}
                onClose={() => setShowTeamModal(false)}
            />

            <MissingReceiptModal
                isOpen={!!declaringReceipt}
                onClose={() => setDeclaringReceipt(null)}
                onConfirm={handleTrulyMissing}
                merchant={declaringReceipt?.merchant || ""}
                amount={declaringReceipt?.amount || 0}
                currency={declaringReceipt?.currency || "EUR"}
            />
        </motion.div >
    );
};
