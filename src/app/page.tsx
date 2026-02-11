"use client";

import { signIn, signOut, useSession, getSession } from "next-auth/react";
import { ArrowRight, Mail, Megaphone, Shield, Upload } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { UploadZone } from "@/components/UploadZone";
import { ResultsTable } from "@/components/ResultsTable";
import { PaymentModal } from "@/components/PaymentModal";
import { ThankYouModal } from "@/components/ThankYouModal";
import { Header } from "@/components/Header";
import { LandingHero } from "@/components/LandingHero";
import { ValueProps } from "@/components/ValueProps";
import { ProcessVertical } from "@/components/ProcessVertical";
import { PricingSimple } from "@/components/PricingSimple";
import { Footer } from "@/components/Footer";
import { ReceiptRequest } from "@/lib/parser";
import { scanEmails } from "@/lib/scanner";
import { MatchResult } from "@/lib/matcher";
import { generateMissingReceiptDeclaration } from "@/lib/declaration-generator";
import { exportReceipts } from "@/lib/export";
import { loadLatestBatchAction, loadBatchRequestsAction, createBatchAction, saveReceiptRequestsAction } from "@/app/actions";

export default function Home() {
  const { data: session, status } = useSession();
  const [step, setStep] = useState<"hero" | "upload" | "connect" | "searching" | "results">("hero");
  const [receipts, setReceipts] = useState<ReceiptRequest[]>([]);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [sessions, setSessions] = useState<any[]>([]);
  const [isPaid, setIsPaid] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);

  const [isDemo, setIsDemo] = useState(false);
  const [isManualMode, setIsManualMode] = useState(false);
  const [autoFoundFiles, setAutoFoundFiles] = useState<Record<string, File>>({});

  const [searchStatus, setSearchStatus] = useState<string>("Initializing...");
  const [searchProgress, setSearchProgress] = useState<number>(0);
  const [foundCount, setFoundCount] = useState<number>(0);
  const [pdfCount, setPdfCount] = useState<number>(0);

  // Ref to track previous session count for detecting new OAuth sessions
  const prevSessionCount = useRef<number>(0);
  // Ref to track if we are actively searching to prevent cloud sync from overwriting state
  const isSearchingRef = useRef<boolean>(false);
  const [pendingAutoSearch, setPendingAutoSearch] = useState<boolean>(false);

  // Load receipts & sessions from localStorage on mount
  useEffect(() => {
    // Receipts
    const savedReceipts = localStorage.getItem("quitti-queue");
    if (savedReceipts) {
      try {
        const parsed = JSON.parse(savedReceipts);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // WARN: Deduplicate by ID to prevent UI bugs
          const unique = Array.from(new Map((parsed as ReceiptRequest[]).map(item => [item.id, item])).values());
          setReceipts(unique);
          setStep("connect");
        }
      } catch (e) {
        console.error("Failed to load saved receipts", e);
      }
    }

    // Sessions — filter out stale entries without email
    const savedSessions = localStorage.getItem("quitti-sessions");
    if (savedSessions) {
      try {
        const parsed = JSON.parse(savedSessions);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((s: any) => s?.user?.email);
          setSessions(valid);
        }
      } catch (e) {
        console.error("Failed to load saved sessions", e);
      }
    }
    // Matches
    const savedMatches = localStorage.getItem("quitti-matches");
    if (savedMatches) {
      try {
        const parsed = JSON.parse(savedMatches);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMatches(parsed);
          const isConnecting = sessionStorage.getItem("quitti-is-connecting") === "true";
          if (!isConnecting) {
            setStep("results"); // Restore results view
          } else {
            setStep("connect");
          }
        }
      } catch (e) {
        console.error("Failed to load saved matches", e);
      }
    }
    // Batch
    const savedBatch = localStorage.getItem("quitti-active-batch");
    if (savedBatch) {
      setActiveBatchId(savedBatch);
    }
  }, []);

  // Sync with Supabase for authenticated users
  useEffect(() => {
    if (status === "authenticated" && (session?.user as any)?.id && !isDemo) {
      const loadCloudData = async () => {
        // Skip cloud loading during OAuth connect flow — we want a fresh scan, not stale data
        const isConnecting = sessionStorage.getItem("quitti-is-connecting") === "true";
        if (isConnecting) {
          console.log("[Cloud] Skipping cloud load - OAuth connecting flow active");
          return;
        }

        try {
          const batch = await loadLatestBatchAction();

          if (batch) {
            const batchId = batch.id;

            // RACE CONDITION FIX: check ref instead of state
            if (isSearchingRef.current) {
              console.log("[Cloud] Skipping cloud load - active search in progress (Locked)");
              return;
            }

            // If we already have a batch ID from triggerSearch, don't overwrite if it's different and we are in active scan
            if (activeBatchId && activeBatchId !== batchId && (step === "searching" || step === "results")) {
              console.log("[Cloud] Skipping cloud load to avoid overwriting active scan results");
              return;
            }

            setActiveBatchId(batchId);
            localStorage.setItem("quitti-active-batch", batchId);

            const requests = await loadBatchRequestsAction(batchId);

            if (requests && requests.length > 0) {
              const mappedReceipts: ReceiptRequest[] = requests.map((r: any) => ({
                id: r.id,
                date: r.date,
                merchant: r.merchant,
                amount: Number(r.amount),
                currency: r.currency,
                status: r.status as any
              }));

              const mappedMatches: MatchResult[] = [];
              requests.forEach((r: any) => {
                if (r.matched_receipts && r.matched_receipts.length > 0) {
                  r.matched_receipts.forEach((m: any) => {
                    mappedMatches.push({
                      receiptId: r.id,
                      emailId: 'CLOUD', // Placeholder
                      status: r.status === 'found' ? 'FOUND' : 'POSSIBLE',
                      confidence: m.confidence,
                      details: m.details,
                      storagePath: m.file_url // Load the PDF path from DB!
                    });
                  });
                }
              });

              // WARN: Deduplicate by ID
              const uniqueMapped = Array.from(new Map(mappedReceipts.map(item => [item.id, item])).values());
              setReceipts(uniqueMapped);

              // Only upgrade step to "results" if we have matches — never downgrade step
              if (mappedMatches.length > 0) {
                setMatches(mappedMatches);
                const isConnecting = sessionStorage.getItem("quitti-is-connecting") === "true";
                if (!isConnecting && step !== "searching") {
                  setStep("results");
                }
              }
              // Never set step to "connect" from cloud sync — that's handled by initial load and handleStartHunt
            }
          }
        } catch (error) {
          console.error("Failed to load cloud data:", error);
        }
      };

      loadCloudData();

      // If user is on hero but authenticated, move them to upload step
      if (step === "hero") {
        setStep("upload");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session, step === "searching", activeBatchId]); // Added activeBatchId to deps

  // Added triggerSearch to deps of this effect
  // But wait, triggerSearch changes if receipts change? Yes.
  /* eslint-enable react-hooks/exhaustive-deps */

  // Save receipts to localStorage
  useEffect(() => {
    if (receipts.length > 0) {
      localStorage.setItem("quitti-queue", JSON.stringify(receipts));
    }
  }, [receipts]);

  // Save matches to localStorage
  useEffect(() => {
    if (matches.length > 0) {
      localStorage.setItem("quitti-matches", JSON.stringify(matches));
    }
  }, [matches]);

  // Save sessions to localStorage
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem("quitti-sessions", JSON.stringify(sessions));
    }
  }, [sessions]);

  // duplicate removed here


  const loading = status === "loading";
  const isAuthenticated = status === "authenticated" || sessions.length > 0 || isDemo || isManualMode;
  // Use email from session (App Login), or any connected session (Scanner), or fallback
  const userEmail =
    session?.user?.email ||
    sessions.find(s => s.user?.email)?.user?.email ||
    (isDemo ? "demo@quittiapp.com" : isManualMode ? "Manual Upload Mode" : "Guest User");

  useEffect(() => {
    if (session && !isDemo) {
      // Check if this is an OAuth callback (user was connecting)
      const isConnecting = sessionStorage.getItem("quitti-is-connecting") === "true";

      console.log(`[OAuth Sync] Detected session for ${session.user?.email} (${(session as any).provider}). isConnecting: ${isConnecting}`);

      setSessions((prev) => {
        // Deduplicate by BOTH email and provider
        const exists = prev.find(s => s.user?.email === session.user?.email && s.provider === (session as any).provider);
        if (exists) {
          console.log(`[OAuth Sync] Session for ${session.user?.email} already exists in state.`);
          return prev;
        }
        console.log(`[OAuth Sync] Adding new session for ${session.user?.email} to state.`);
        return [...prev, session];
      });

      // Only trigger if we have receipts to search for
      if (isConnecting && receipts.length > 0) {
        console.log("[OAuth Sync] Setting pendingAutoSearch to true.");
        setPendingAutoSearch(true);
      }
    }
  }, [session, isDemo, receipts.length]);

  /* eslint-enable react-hooks/exhaustive-deps */

  const handleStartHunt = async (data: ReceiptRequest[]) => {
    setReceipts(data);
    setStep("connect");

    // If authenticated, create a batch in the cloud
    if (status === "authenticated" && (session?.user as any)?.id) {
      try {
        setIsSaving(true);
        const batchName = `Batch ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
        const newBatch = await createBatchAction(batchName);
        await saveReceiptRequestsAction(newBatch.id, data);
        setActiveBatchId(newBatch.id);
        localStorage.setItem("quitti-active-batch", newBatch.id);
      } catch (error) {
        console.error("Failed to save batch to cloud:", error);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleConnect = async (provider: "google" | "azure-ad" | "facebook" = "google") => {
    if (isDemo) {
      setSessions(prev => [...prev, { provider, user: { email: `demo-${prev.length}@example.com` } }]);
    } else {
      sessionStorage.setItem("quitti-is-connecting", "true");
      // Force account selection to allow adding multiple accounts
      signIn(provider, { prompt: "select_account" });
    }
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  const triggerSearch = useCallback(async () => {
    sessionStorage.removeItem("quitti-is-connecting");
    console.log(`[Diagnostic] triggerSearch called. Sessions: ${sessions.length}, Receipts: ${receipts.length}`);
    sessions.forEach((s, i) => console.log(`  Session ${i}: ${s.user?.email} (${(s as any).provider})`));

    // LOCK: Prevent cloud sync from interfering
    isSearchingRef.current = true;

    setStep("searching");
    setSearchStatus("Starting scan...");
    setSearchProgress(0);
    setFoundCount(0);
    setPdfCount(0);
    if (receipts.length === 0) {
      console.error("[Diagnostic] TriggerSearch: receipts array is empty!");
      setStep("results");
      isSearchingRef.current = false; // Unlock
      return;
    }
    try {
      console.log(`[Diagnostic] triggerSearch starting with ${receipts.length} receipts. IDs:`, receipts.map(r => r.id));
      const { matches: scanMatches, files: scanFiles } = await scanEmails(
        sessions,
        receipts,
        (status, pct, found, pdfs) => {
          setSearchStatus(status);
          setSearchProgress(pct);
          if (found !== undefined) setFoundCount(found);
          if (pdfs !== undefined) setPdfCount(pdfs);
        },
        undefined,
        async () => {
          const s = await getSession();
          return (s as any)?.accessToken || null;
        }
      );
      console.log(`[Diagnostic] scanEmails finished. Matches: ${scanMatches.length}. IDs:`, scanMatches.map(m => m.receiptId));
      if (scanFiles) {
        console.log(`[Diagnostic] scanEmails returned files for:`, Object.keys(scanFiles));
      } else {
        console.log(`[Diagnostic] scanEmails returned NO files object.`);
      }
      setMatches(scanMatches);
      setAutoFoundFiles(scanFiles || {});

      // Use the NextAuth status for cloud saving
      if (status === "authenticated" && (session?.user as any)?.id) {
        setSearchStatus("Syncing results to cloud...");
        // Upload any generated files FIRST
        const userId = (session.user as any).id;

        // Create or get batch
        let currentBatchId = activeBatchId;
        try {
          if (!currentBatchId) {
            const batchName = `Batch ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
            const newBatch = await createBatchAction(batchName);
            currentBatchId = newBatch.id;
            setActiveBatchId(newBatch.id);
            localStorage.setItem("quitti-active-batch", newBatch.id);
            console.log(`[Cloud] Created new batch: ${currentBatchId}`);
          }

          // ALWAYS upsert receipts to this batch to ensure they exist in DB (handles refresh/stale state)
          if (currentBatchId) {
            console.log(`[Diagnostic] Syncing ${receipts.length} receipts to batch ${currentBatchId}...`);
            await saveReceiptRequestsAction(currentBatchId, receipts);
            console.log(`[Diagnostic] Synced receipts to batch ${currentBatchId}`);
          } else {
            throw new Error("Failed to resolve currentBatchId");
          }
        } catch (e) {
          console.error("[Cloud] Failed to sync batch/requests - matches won't be saved to cloud", e);
          setStep("results");
          isSearchingRef.current = false; // Unlock
          return;
        }

        const foundWithFiles = scanMatches.filter(m => (m.status === "FOUND" || m.status === "POSSIBLE") && scanFiles?.[m.receiptId]);
        let uploadIndex = 0;

        for (const match of scanMatches) {
          if (match.status === "FOUND" || match.status === "POSSIBLE") {
            let storagePath = match.storagePath;

            // If we have a local generated file for this match, upload it!
            if (scanFiles && scanFiles[match.receiptId]) {
              uploadIndex++;
              setSearchStatus(`Syncing to Cloud (${uploadIndex}/${foundWithFiles.length})...`);
              try {
                const file = scanFiles[match.receiptId];
                const formData = new FormData();
                // @ts-ignore
                formData.append("file", file);
                formData.append("receiptId", match.receiptId);

                // Server Action Import
                const { uploadReceiptServerAction, updateMatchResultServerAction } = await import("./actions");
                const path = await uploadReceiptServerAction(formData);

                if (path) {
                  storagePath = path;
                  console.log(`[Cloud] Uploaded generated file for ${match.receiptId} to ${path}`);
                }

                // Use Server Action for DB write
                await updateMatchResultServerAction(match.receiptId, match, storagePath);
              } catch (e) {
                console.error(`[Cloud] Failed to upload generated file for ${match.receiptId}`, e);
              }
            } else {
              // No local file, just save result (server action)
              try {
                console.log(`[Diagnostic] Attempting to save match for ${match.receiptId} (No File)...`);
                const { updateMatchResultServerAction } = await import("./actions");
                await updateMatchResultServerAction(match.receiptId, match, storagePath);
                console.log(`[Diagnostic] Successfully saved match for ${match.receiptId}`);
              } catch (e) {
                console.error(`[Diagnostic] Failed to save match result for ${match.receiptId}`, e);
              }
            }
          }
        }
      }

      setSearchStatus("Finalizing results...");
      setStep("results");
      // Unlock happens implicitly as we leave searching state, but good practice to reset
      isSearchingRef.current = false;
    } catch (err: any) {
      console.error("[TriggerSearch] Error:", err?.message || err?.code || err);
      setStep("results");
      isSearchingRef.current = false;
    }
  }, [sessions, receipts, status, session, activeBatchId]);

  // Effect to handle auto-triggering search when pending
  useEffect(() => {
    if (pendingAutoSearch && receipts.length > 0 && step === "connect") {
      // CRITICAL: We need to make sure the session that was just added is actually in the 'sessions' array
      // before we call triggerSearch, because triggerSearch uses the 'sessions' state.
      const lastSessionProvider = (session as any)?.provider;
      const lastSessionEmail = session?.user?.email;
      const isSynced = sessions.some(s => s.user?.email === lastSessionEmail && s.provider === lastSessionProvider);

      if (isSynced) {
        console.log("[OAuth Sync] Session is synchronized. Triggering search now.");
        setPendingAutoSearch(false);
        triggerSearch();
      } else {
        console.log("[OAuth Sync] Waiting for sessions state to synchronize...");
      }
    }
  }, [pendingAutoSearch, receipts.length, sessions, step, triggerSearch, session]);

  const performExport = async (filesToExport: Record<string, File>, useFolders: boolean) => {
    // 1. Merge Local Files
    const allFiles = { ...autoFoundFiles, ...filesToExport };

    // 2. Pre-sign URLs for Cloud Files (Standardizing with Shared Portal logic)
    try {
      const { getSignedUrlServerAction } = await import("./actions");

      // Create a copy of matches with downloadUrls populated
      const enrichedMatches = await Promise.all(matches.map(async (m) => {
        // If we already have a local file, no need to fetch from cloud
        if (allFiles[m.receiptId]) return m;

        // If we have a storage path but no local file, generate a signed URL
        if (m.storagePath) {
          try {
            const signedUrl = await getSignedUrlServerAction(m.storagePath);
            return { ...m, downloadUrl: signedUrl };
          } catch (e) {
            console.error(`[Page Export] Failed to sign URL for ${m.receiptId}`, e);
            return m;
          }
        }
        return m;
      }));

      // 3. Generate missing declaration PDF if needed
      const trulyMissing = receipts.filter(r => r.is_truly_missing);
      let declarationBlob = null;
      if (trulyMissing.length > 0) {
        console.log(`[Page Export] Generating declaration for ${trulyMissing.length} missing receipts`);
        declarationBlob = await generateMissingReceiptDeclaration({
          companyName: "Company Name", // TODO: Fetch from org if available
          representativeName: session?.user?.name || session?.user?.email || "Representative",
          missingReceipts: trulyMissing,
          date: new Date()
        });
      }

      await exportReceipts(receipts, enrichedMatches, allFiles, useFolders, declarationBlob);
    } catch (err) {
      console.error("[Page Export] Error in performExport:", err);
      alert("Export failed. Please try again.");
    }
  };

  const [pendingExportConfig, setPendingExportConfig] = useState<{ files: Record<string, File>, useFolders: boolean } | null>(null);

  const handleExportClick = async (manualFiles: Record<string, File>, useFolders: boolean) => {
    try {
      if (isPaid) {
        await performExport(manualFiles, useFolders);
      } else {
        setPendingExportConfig({ files: manualFiles, useFolders });
        setShowPayment(true);
      }
    } catch (e) {
      console.error("Export failed:", e);
      alert("Failed to export files. Please try again.");
    }
  };

  const handlePaymentSuccess = async () => {
    setIsPaid(true);
    setShowPayment(false);
    if (pendingExportConfig) {
      try {
        await performExport(pendingExportConfig.files, pendingExportConfig.useFolders);
        setPendingExportConfig(null);
      } catch (e) {
        console.error("Export failed:", e);
        alert("Failed to export files. Please try again.");
      }
    }
  };

  const [showRestartConfirm, setShowRestartConfirm] = useState(false);

  const handleRestart = () => {
    setShowRestartConfirm(true);
  };

  const executeRestart = () => {
    localStorage.removeItem("quitti-queue");
    localStorage.removeItem("quitti-sessions");
    localStorage.removeItem("quitti-matches");
    setStep("hero");
    setReceipts([]);
    setMatches([]);
    setIsDemo(false);
    setIsManualMode(false);
    setAutoFoundFiles({});
    setSessions([]);
    setShowRestartConfirm(false);
    signOut({ redirect: false });
  };

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p>Loading...</p>
      </main>
    );
  }

  // APP VIEW (Authentication State)
  if (isAuthenticated && (step === "searching" || step === "results")) {
    return (
      <main className="container" style={{ paddingTop: "128px", paddingBottom: "80px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px" }}>
          <h1 className="text-2xl font-black bg-gradient-to-r from-emerald-600 to-cyan-600 bg-clip-text text-transparent tracking-tighter">Quitti</h1>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span className="text-slate-500" style={{ fontSize: "14px" }}>{userEmail}</span>
          </div>
        </div>

        {step === "searching" && (
          <Card glass>
            <div style={{ textAlign: "center", padding: "60px" }}>
              <h2 style={{ fontSize: "24px", marginBottom: "16px", color: "var(--text-primary)" }}>Hunting for {receipts.length} receipts...</h2>
              <p className="text-slate-500">Scanning your email for matches. This usually takes a while. Go grab a coffee, we do the work for you.</p>

              <div style={{ marginTop: "24px", width: "100%", maxWidth: "350px", display: "inline-block" }}>
                <div style={{ fontSize: "32px", fontWeight: "bold", marginBottom: "12px", color: "var(--accent-primary)" }}>
                  {searchProgress}%
                </div>
                <div style={{
                  width: "100%",
                  height: "8px",
                  background: "rgba(255,255,255,0.1)",
                  borderRadius: "4px",
                  overflow: "hidden",
                  marginBottom: "16px"
                }}>
                  <div style={{
                    width: `${searchProgress}%`,
                    height: "100%",
                    background: "var(--accent-primary)",
                    transition: "width 0.3s ease"
                  }} />
                </div>
                <div style={{
                  padding: "8px 16px",
                  background: "rgba(255,255,255,0.1)",
                  borderRadius: "20px",
                  fontSize: "14px",
                  color: "var(--text-secondary)",
                  marginBottom: "12px"
                }}>
                  {searchStatus}
                </div>
                {foundCount > 0 && (
                  <div style={{ fontSize: "16px", color: "var(--success)", fontWeight: "500", display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span>✓ Found {foundCount} matching email{foundCount !== 1 ? 's' : ''}</span>
                    {pdfCount > 0 && (
                      <span style={{ fontSize: "0.85em", opacity: 0.8 }}>({pdfCount} PDF{pdfCount !== 1 ? 's' : ''} downloaded)</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {step === "results" && (
          <>
            <ResultsTable
              receipts={receipts}
              matches={matches}
              autoFoundFiles={autoFoundFiles}
              activeBatchId={activeBatchId}
              onExport={handleExportClick}
              onRestart={handleRestart}
              onAddInbox={() => setStep("connect")}
              isPaid={isPaid}
              onPaymentRequired={() => setShowPayment(true)}
              onPreview={(file) => {
                // Open file preview
                if (typeof file === 'string') {
                  window.open(file, '_blank');
                } else {
                  const url = URL.createObjectURL(file);
                  window.open(url, '_blank');
                }
              }}
            />
            <PaymentModal
              isOpen={showPayment}
              onClose={() => setShowPayment(false)}
              onSuccess={() => {
                setIsPaid(true);
                setShowPayment(false);
                setShowThankYou(true);
                handlePaymentSuccess();
              }}
            />
            <ThankYouModal
              isOpen={showThankYou}
              onClose={() => setShowThankYou(false)}
            />
          </>
        )}

        {/* Restart Confirmation Modal (Authenticated View) */}
        {showRestartConfirm && (
          <div className="fixed inset-0 bg-slate-900/40 z-[1200] flex items-center justify-center backdrop-blur-md animate-in fade-in duration-200">
            <Card className="p-10 max-w-[440px] w-[90%] border border-slate-200 bg-white shadow-3xl rounded-[2rem] relative overflow-hidden">
              <h3 className="text-xl font-black text-slate-900 mt-0 mb-3 tracking-tight">Start Over?</h3>
              <p className="text-slate-500 mb-8 text-base leading-relaxed font-medium">
                Are you sure you want to delete everything and start over? This action cannot be undone.
              </p>
              <div className="flex gap-4 justify-end">
                <Button variant="secondary" onClick={() => setShowRestartConfirm(false)} className="rounded-xl px-6 border-slate-200 font-bold">Cancel</Button>
                <Button variant="primary" className="bg-red-500 hover:bg-red-600 border-0 shadow-xl shadow-red-500/20 rounded-xl px-6 font-bold" onClick={executeRestart}>Yes, Start Over</Button>
              </div>
            </Card>
          </div>
        )}
      </main>
    );
  }

  // LANDING / UPLOAD / CONNECT STAGES
  return (
    <>
      <Header onReset={handleRestart} />
      <main className="min-h-screen pt-16">

        {step === "hero" && (
          <div className="w-full relative bg-white">
            <LandingHero
              onStart={() => setStep("upload")}
              onDemo={() => { setIsDemo(true); setStep("upload"); }}
            />
            <ValueProps />
            <ProcessVertical />
            <PricingSimple
              onStart={() => setStep("upload")}
            />
          </div>
        )}

        {(step === "upload" || step === "connect") && (
          <div className="container pt-8 pb-24 md:pt-12 md:pb-32">
            {step === "upload" && (
              <div className="animate-enter max-w-4xl mx-auto">
                <div className="text-center mb-8">
                  <h2 className="text-3xl md:text-5xl font-extrabold mb-4 text-slate-900">1. What are we looking for?</h2>
                  <p className="text-slate-500 text-lg">Paste your list of missing receipts below.</p>
                </div>
                <UploadZone onConfirm={handleStartHunt} />
              </div>
            )}

            {step === "connect" && (
              <div className="animate-enter max-w-4xl mx-auto">
                <div className="text-center mb-12">
                  <h2 className="text-3xl md:text-5xl font-extrabold mb-4 text-slate-900 tracking-tight">2. Where should we hunt?</h2>
                  <p className="text-slate-500 text-lg max-w-lg mx-auto leading-relaxed">
                    Connect your email to auto-scan for receipts, or upload files manually.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                  {/* Google Card */}
                  <Card
                    className="p-6 md:p-8 group cursor-pointer hover:shadow-xl transition-all duration-300 border-2 border-transparent hover:border-blue-100 relative overflow-hidden bg-white"
                    onClick={() => handleConnect("google")}
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-50 group-hover:opacity-100 transition-opacity">
                      <ArrowRight className="text-blue-500 w-6 h-6 -translate-x-2 group-hover:translate-x-0 transition-transform" />
                    </div>
                    <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 overflow-hidden bg-white border border-slate-100 group-hover:scale-110 transition-transform duration-300">
                      <img src="https://www.google.com/favicon.ico" alt="Google" className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">Gmail & Ads</h3>
                    <p className="text-slate-500 text-sm leading-relaxed mb-4">
                      Connect your Google account. We'll scan for receipts in Gmail.
                    </p>
                    <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full w-fit">
                      <Shield className="w-3 h-3" />
                      Read-only
                    </div>
                  </Card>

                  {/* Outlook Card */}
                  <Card
                    className="p-6 md:p-8 group cursor-pointer hover:shadow-xl transition-all duration-300 border-2 border-transparent hover:border-sky-100 relative overflow-hidden bg-white"
                    onClick={() => handleConnect("azure-ad")}
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-50 group-hover:opacity-100 transition-opacity">
                      <ArrowRight className="text-sky-500 w-6 h-6 -translate-x-2 group-hover:translate-x-0 transition-transform" />
                    </div>
                    <div className="w-12 h-12 bg-sky-50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                      <Mail className="w-6 h-6 text-sky-600" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">Outlook & 365</h3>
                    <p className="text-slate-500 text-sm leading-relaxed mb-4">
                      Connect your Microsoft account. Supports Outlook and 365.
                    </p>
                    <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full w-fit">
                      <Shield className="w-3 h-3" />
                      Read-only
                    </div>
                  </Card>

                  {/* Meta Ads Card */}
                  <Card
                    className="p-6 md:p-8 group cursor-pointer hover:shadow-xl transition-all duration-300 border-2 border-transparent hover:border-indigo-100 relative overflow-hidden bg-white"
                    onClick={() => handleConnect("facebook")}
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-50 group-hover:opacity-100 transition-opacity">
                      <ArrowRight className="text-indigo-500 w-6 h-6 -translate-x-2 group-hover:translate-x-0 transition-transform" />
                    </div>
                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                      <Megaphone className="w-6 h-6 text-indigo-600" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">Meta Ads</h3>
                    <p className="text-slate-500 text-sm leading-relaxed mb-4">
                      Connect your Facebook/Meta account to find ad receipts.
                    </p>
                    <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full w-fit">
                      <Shield className="w-3 h-3" />
                      Read-only
                    </div>
                  </Card>
                </div>

                {/* Manual Upload Section */}
                <div className="relative flex items-center justify-center mb-12">
                  <div className="h-px bg-slate-200 w-full absolute"></div>
                  <span className="bg-white px-4 text-slate-400 text-sm font-medium relative z-10 uppercase tracking-widest">Or upload directly</span>
                </div>

                <Card
                  className="p-8 border-2 border-dashed border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all cursor-pointer flex flex-col items-center justify-center group"
                  onClick={() => {
                    setIsManualMode(true);
                    setStep("results");
                  }}
                >
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-white group-hover:shadow-sm transition-all">
                    <Upload className="w-8 h-8 text-slate-400 group-hover:text-slate-600" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-700 mb-1">Upload Files Manually</h3>
                  <p className="text-slate-400 text-sm">Drag & drop receipts or select files from your computer</p>
                </Card>

                <div className="mt-12 text-center">
                  <p className="text-slate-400 text-xs flex items-center justify-center gap-2">
                    <Shield className="w-3 h-3" />
                    We do not store your emails. Data is processed in-memory.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </main >

      {/* Restart Confirmation Modal */}
      {
        showRestartConfirm && (
          <div className="fixed inset-0 bg-slate-900/40 z-[1200] flex items-center justify-center backdrop-blur-md animate-in fade-in duration-200">
            <Card className="p-10 max-w-[440px] w-[90%] border border-slate-200 bg-white shadow-3xl rounded-[2rem] relative overflow-hidden">
              <h3 className="text-xl font-black text-slate-900 mt-0 mb-3 tracking-tight">Start Over?</h3>
              <p className="text-slate-500 mb-8 text-base leading-relaxed font-medium">
                Are you sure you want to delete everything and start over? This action cannot be undone.
              </p>
              <div className="flex gap-4 justify-end">
                <Button variant="secondary" onClick={() => setShowRestartConfirm(false)} className="rounded-xl px-6 border-slate-200 font-bold">Cancel</Button>
                <Button variant="primary" className="bg-red-500 hover:bg-red-600 border-0 shadow-xl shadow-red-500/20 rounded-xl px-6 font-bold" onClick={executeRestart}>Yes, Start Over</Button>
              </div>
            </Card>
          </div>
        )
      }

      {step === "hero" && <Footer />}
    </>
  );
}
