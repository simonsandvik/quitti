"use client";

import { signIn } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";

export default function LoginPage() {
    return (
        <div className="relative min-h-screen flex items-center justify-center p-6 bg-slate-50">
            <AnimatedBackground />

            {/* Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg h-[400px] bg-emerald-500/10 blur-[120px] rounded-full -z-10 pointer-events-none"></div>

            <div className="w-full max-w-md bg-white/80 backdrop-blur-xl border border-white/50 shadow-2xl rounded-3xl p-8 md:p-12 relative animate-in fade-in zoom-in-95 duration-500">

                {/* Logo */}
                <div className="flex justify-center mb-8">
                    <Link href="/" className="group">
                        <div className="relative w-16 h-16 group-hover:scale-105 transition-transform duration-300">
                            <Image
                                src="/logo.png"
                                alt="Quitti Logo"
                                fill
                                className="object-contain drop-shadow-lg"
                            />
                        </div>
                    </Link>
                </div>

                <div className="text-center mb-10">
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-3">Welcome Back</h1>
                    <p className="text-slate-500">Sign in to continue hunting receipts.</p>
                </div>

                <div className="space-y-4">
                    <button
                        onClick={() => signIn("google", { callbackUrl: "/" })}
                        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm group"
                    >
                        <svg className="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        <span>Continue with Google</span>
                    </button>

                    <button
                        onClick={() => signIn("azure-ad", { callbackUrl: "/" })}
                        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-[#2F2F2F] text-white font-bold rounded-xl hover:bg-black transition-all shadow-lg shadow-gray-400/20 group"
                    >
                        <svg className="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 23 23">
                            <path fill="#f35325" d="M1 1h10v10H1z" />
                            <path fill="#81bc06" d="M12 1h10v10H12z" />
                            <path fill="#05a6f0" d="M1 12h10v10H1z" />
                            <path fill="#ffba08" d="M12 12h10v10H12z" />
                        </svg>
                        <span>Continue with Microsoft</span>
                    </button>
                </div>

                <div className="mt-10 text-center text-xs text-slate-400">
                    By signing in, you agree to our <Link href="#" className="underline hover:text-slate-600">Terms</Link> and <Link href="#" className="underline hover:text-slate-600">Privacy Policy</Link>.
                </div>
            </div>
        </div>
    );
}
