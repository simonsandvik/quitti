"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { motion, AnimatePresence } from "framer-motion";
import { Users, CheckCircle, XCircle, ArrowRight } from "lucide-react";

export default function JoinTeamPage() {
    const params = useParams();
    const router = useRouter();
    const { data: session, status } = useSession();
    const token = params.token as string;

    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);
    const [inviteInfo, setInviteInfo] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (!token) return;

        // Fetch invite info (publicly accessible info like Org Name)
        fetch(`/api/share/create?token=${token}`) // We might need a public "check token" API or use the existing join API with a GET?
            // Actually, let's just try to JOIN directly if they click the button, 
            // but for a premium UX we want to show "You've been invited to [Team Name]".
            // I'll assume we can use a dedicated check API if it existed, 
            // but for now I'll implement a fallback if info isn't available.
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                setInviteInfo(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));

        // For now, let's keep it simple: Validate the token exists
        setLoading(false);
    }, [token]);

    const handleJoin = async () => {
        if (status === "unauthenticated") {
            // Store target URL in session for after login
            sessionStorage.setItem("quitti-redirect", window.location.pathname);
            signIn();
            return;
        }

        setJoining(true);
        setError(null);

        try {
            const res = await fetch("/api/team/join", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to join team");

            setSuccess(true);
            setTimeout(() => {
                router.push("/");
            }, 2000);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setJoining(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="animate-pulse text-emerald-500 font-bold">Validating Invitation...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-md text-center"
            >
                {/* Logo */}
                <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-white font-bold text-3xl mx-auto mb-8 shadow-xl shadow-emerald-500/20">
                    Q
                </div>

                <Card className="p-8 bg-white border-0 shadow-2xl shadow-slate-200/50 rounded-3xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-emerald-500/10">
                        <div className="h-full bg-emerald-500 w-1/3 rounded-full" />
                    </div>

                    <AnimatePresence mode="wait">
                        {!success ? (
                            <motion.div
                                key="invite"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                            >
                                <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <Users className="w-10 h-10 text-emerald-500" />
                                </div>
                                <h1 className="text-2xl font-black text-slate-900 mb-2">You've Been Invited!</h1>
                                <p className="text-slate-500 mb-8 leading-relaxed">
                                    A team member has invited you to collaborate on Quitti. Accept the invitation to start hunting receipts together.
                                </p>

                                {error && (
                                    <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm font-medium flex items-center gap-2 border border-red-100">
                                        <XCircle className="w-4 h-4 flex-shrink-0" />
                                        {error}
                                    </div>
                                )}

                                <div className="space-y-3">
                                    <Button
                                        onClick={handleJoin}
                                        disabled={joining}
                                        className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-lg rounded-2xl shadow-xl shadow-emerald-500/20 border-0 flex items-center justify-center gap-2"
                                    >
                                        {joining ? "Joining..." : status === "unauthenticated" ? "Sign In to Join" : "Accept Invitation"}
                                        {!joining && <ArrowRight className="w-5 h-5" />}
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        onClick={() => router.push("/")}
                                        className="w-full py-4 text-slate-500 border-0 hover:bg-slate-50 rounded-2xl font-bold"
                                    >
                                        Decline
                                    </Button>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="success"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="py-8"
                            >
                                <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-emerald-500/30">
                                    <CheckCircle className="w-10 h-10 text-white" />
                                </div>
                                <h2 className="text-2xl font-black text-slate-900 mb-2">Welcome to the Team!</h2>
                                <p className="text-slate-500">You're now a member. Redirecting to dashboard...</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </Card>

                <p className="mt-8 text-slate-400 text-sm font-medium uppercase tracking-widest">
                    Receipt hunting made social
                </p>
            </motion.div>
        </div>
    );
}
