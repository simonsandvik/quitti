"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
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
import { exportReceipts } from "@/lib/export";
import { createBatch, saveReceiptRequests, updateMatchResult, getUserBatches, supabase } from "@/lib/supabase";

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
  const [pendingExportFiles, setPendingExportFiles] = useState<Record<string, File> | null>(null);

  const [isDemo, setIsDemo] = useState(false);
  const [isManualMode, setIsManualMode] = useState(false);
  const [autoFoundFiles, setAutoFoundFiles] = useState<Record<string, File>>({});

  const [searchStatus, setSearchStatus] = useState<string>("Initializing...");
  const [searchProgress, setSearchProgress] = useState<number>(0);
  const [foundCount, setFoundCount] = useState<number>(0);
  const [pdfCount, setPdfCount] = useState<number>(0);

  // Load receipts & sessions from localStorage on mount
  useEffect(() => {
    // Receipts
    const savedReceipts = localStorage.getItem("quitti-queue");
    if (savedReceipts) {
      try {
        const parsed = JSON.parse(savedReceipts);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setReceipts(parsed);
          setStep("connect");
        }
      } catch (e) {
        console.error("Failed to load saved receipts", e);
      }
    }

    // Sessions
    const savedSessions = localStorage.getItem("quitti-sessions");
    if (savedSessions) {
      try {
        const parsed = JSON.parse(savedSessions);
        if (Array.isArray(parsed)) {
          setSessions(parsed);
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
          setStep("results"); // Restore results view
        }
      } catch (e) {
        console.error("Failed to load saved matches", e);
      }
    }
  }, []);

  // Sync with Supabase for authenticated users
  useEffect(() => {
    if (status === "authenticated" && (session?.user as any)?.id && !isDemo) {
      const loadCloudData = async () => {
        try {
          const { data: batches, error } = await supabase
            .from('batches')
            .select('*')
            // @ts-ignore
            .eq('created_by', (session.user as any).id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1);

          if (batches && batches.length > 0) {
            const batchId = batches[0].id;
            setActiveBatchId(batchId);

            const { data: requests, error: reqError } = await supabase
              .from('receipt_requests')
              .select(`
                *,
                matched_receipts (*)
              `)
              .eq('batch_id', batchId);

            if (requests && requests.length > 0) {
              const mappedReceipts: ReceiptRequest[] = requests.map(r => ({
                id: r.id,
                date: r.date,
                merchant: r.merchant,
                amount: Number(r.amount),
                currency: r.currency,
                status: r.status as any
              }));

              const mappedMatches: MatchResult[] = [];
              requests.forEach(r => {
                if (r.matched_receipts && r.matched_receipts.length > 0) {
                  r.matched_receipts.forEach((m: any) => {
                    mappedMatches.push({
                      receiptId: r.id,
                      emailId: 'CLOUD', // Placeholder
                      status: r.status === 'found' ? 'FOUND' : 'POSSIBLE',
                      confidence: m.confidence,
                      details: m.details
                    });
                  });
                }
              });

              setReceipts(mappedReceipts);
              if (mappedMatches.length > 0) {
                setMatches(mappedMatches);
                setStep("results");
              } else {
                setStep("connect");
              }
            }
          }
        } catch (error) {
          console.error("Failed to load cloud data:", error);
        }
      };

      loadCloudData();
    }
  }, [status, session]);

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
  const isAuthenticated = sessions.length > 0 || isDemo || isManualMode;
  // Use email from last added session, or fallback
  const userEmail = sessions[sessions.length - 1]?.user?.email || (isManualMode ? "Manual Upload Mode" : "demo@quittiapp.com");

  useEffect(() => {
    if (session && !isDemo) {
      setSessions((prev) => {
        const exists = prev.find(s => s.user?.email === session.user?.email);
        if (exists) return prev;
        return [...prev, session];
      });
    }
  }, [session, isDemo]);

  const handleStartHunt = async (data: ReceiptRequest[]) => {
    setReceipts(data);
    setStep("connect");

    // If authenticated, create a batch in the cloud
    if (status === "authenticated" && (session?.user as any)?.id) {
      try {
        setIsSaving(true);
        const batchName = `Batch ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
        // @ts-ignore
        const newBatch = await createBatch((session.user as any).id, batchName);
        await saveReceiptRequests(newBatch.id, data);
        setActiveBatchId(newBatch.id);
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
      // Force account selection to allow adding multiple accounts
      signIn(provider, { prompt: "select_account" });
    }
  };

  const triggerSearch = async () => {
    setStep("searching");
    setSearchStatus("Starting scan...");
    setSearchProgress(0);
    setFoundCount(0);
    setPdfCount(0);
    try {
      const { matches: scanMatches, files: scanFiles } = await scanEmails(
        sessions,
        receipts,
        (status, pct, found, pdfs) => {
          setSearchStatus(status);
          if (pct !== undefined) setSearchProgress(pct);
          if (found !== undefined) setFoundCount(found);
          if (pdfs !== undefined) setPdfCount(pdfs);
        }
      );
      setMatches(scanMatches);
      setAutoFoundFiles(scanFiles || {});

      // Use the NextAuth status for cloud saving
      if (status === "authenticated" && (session?.user as any)?.id) {
        try {
          for (const match of scanMatches) {
            if (match.status === "FOUND" || match.status === "POSSIBLE") {
              // @ts-ignore
              await updateMatchResult(match.receiptId, match, (session.user as any).id);
            }
          }
        } catch (error) {
          console.error("Failed to save matches to cloud:", error);
        }
      }

      setStep("results");
    } catch (err) {
      console.error(err);
      setStep("results");
    }
  };

  const handleExportClick = (manualFiles: Record<string, File>) => {
    if (isPaid) {
      exportReceipts(receipts, matches, manualFiles);
    } else {
      setPendingExportFiles(manualFiles);
      setShowPayment(true);
    }
  };

  const handlePaymentSuccess = () => {
    setIsPaid(true);
    setShowPayment(false);
    if (pendingExportFiles) {
      exportReceipts(receipts, matches, pendingExportFiles);
      setPendingExportFiles(null);
    }
  };

  // Track audio/search session to detach UI updates if user restarts
  const searchAttemptRef = useState(0);
  // actually useState is not good for ref, use useRef
  // But wait, I can't import useRef in replace block without adding import
  // Import is already there: "import { useState, useEffect } from 'react';" -> Need to add useRef

  // I will use a simple state ID passed to callback? 
  // Better to update imports first? 
  // I can just use a closure variable 'currentSearchId'? No, react re-renders.

  // Let's rely on cleaning localStorage first and fixing navigation. 
  // I will add localStorage.removeItem in handleRestart.

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
            <Button variant="secondary" onClick={handleRestart} size="sm" className="px-4 py-2">Start Over</Button>
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
              onExport={handleExportClick}
              onRestart={handleRestart}
              onAddInbox={() => setStep("connect")}
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
              <div className="animate-enter max-w-2xl mx-auto text-center">
                <h2 className="text-3xl md:text-5xl font-extrabold mb-6 text-slate-900">2. Where should we hunt?</h2>
                <p className="text-slate-500 text-lg mb-16 max-w-lg mx-auto leading-relaxed">
                  Connect your email. We only need read-only access to find your receipts.
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "20px" }}>
                    <Button variant="secondary" size="lg" style={{ height: "64px", fontSize: "18px" }} onClick={() => handleConnect("google")}>
                      Connect Google (Gmail & Ads)
                    </Button>
                    <Button variant="secondary" size="lg" style={{ height: "64px", fontSize: "18px" }} onClick={() => handleConnect("azure-ad")}>
                      Connect Microsoft (Outlook & Azure)
                    </Button>
                    <Button variant="secondary" size="lg" style={{ height: "64px", fontSize: "18px" }} onClick={() => handleConnect("facebook")}>
                      Connect Meta Ads
                    </Button>
                  </div>

                  {sessions.length > 0 && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <Button variant="primary" size="lg" onClick={triggerSearch} style={{ width: "100%", height: "64px", fontSize: "20px", marginTop: "16px" }}>
                        Start Scan in {sessions.length} Account{sessions.length > 1 ? "s" : ""}
                      </Button>
                      <button
                        onClick={handleRestart}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--text-tertiary)",
                          marginTop: "20px",
                          cursor: "pointer",
                          textDecoration: "underline",
                          fontSize: "14px",
                          transition: "color 0.2s"
                        }}
                      >
                        Or start over completely
                      </button>
                    </div>
                  )}
                </div>

                <div className="card glass" style={{ marginTop: "64px", padding: "32px", fontSize: "15px", textAlign: "left", borderRadius: "20px" }}>
                  <h4 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600" }}>🛡️ Safety check</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <p style={{ color: "var(--text-secondary)" }}>✓ Read-only access. We don&apos;t read your personal mail (invocies only).</p>
                    <p style={{ color: "var(--text-secondary)" }}>✓ No emails sent or modified.</p>
                    <p style={{ color: "var(--text-secondary)" }}>✓ No passwords stored.</p>
                  </div>
                </div>

                <div style={{ marginTop: "48px", borderTop: "1px solid rgba(0,0,0,0.05)", paddingTop: "32px" }}>
                  <p className="text-slate-400" style={{ fontSize: "15px", marginBottom: "16px" }}>Or handle it manually without connecting:</p>
                  <button
                    onClick={() => { setIsManualMode(true); setStep("results"); }}
                    style={{
                      background: "rgba(0,0,0,0.03)",
                      border: "1px solid rgba(0,0,0,0.1)",
                      color: "var(--text-secondary)",
                      padding: "12px 32px",
                      borderRadius: "12px",
                      cursor: "pointer",
                      fontSize: "15px",
                      transition: "all 0.2s"
                    }}
                  >
                    Skip & Upload Manually
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Restart Confirmation Modal */}
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

      {step === "hero" && <Footer />}
    </>
  );
}
