"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";

interface HeaderProps {
    onReset?: () => void;
}

export const Header = ({ onReset }: HeaderProps) => {
    const { data: session } = useSession();

    return (
        <header className="fixed top-0 left-0 right-0 z-50 bg-white/70 backdrop-blur-xl border-b border-slate-200/50">
            <div className="max-w-6xl mx-auto px-6">
                <div className="flex items-center justify-between h-16">
                    {/* Logo */}
                    <Link
                        href="/"
                        onClick={(e: React.MouseEvent) => {
                            if (onReset) {
                                e.preventDefault();
                                onReset();
                            }
                        }}
                        className="flex items-center gap-3 hover:opacity-80 transition-opacity group"
                    >
                        <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-110 transition-transform duration-300">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 10h.01M15 10h.01M12 12h.01" />
                            </svg>
                        </div>
                        <span className="text-2xl font-black bg-gradient-to-r from-emerald-600 to-cyan-600 bg-clip-text text-transparent tracking-tighter">
                            Quitti
                        </span>
                    </Link>

                    {/* Navigation */}
                    <nav className="hidden md:flex items-center gap-8">
                        <a
                            href="#how-it-works"
                            className="text-slate-600 hover:text-slate-900 transition-colors text-sm font-medium"
                        >
                            How it Works
                        </a>
                        <a
                            href="#features"
                            className="text-slate-600 hover:text-slate-900 transition-colors text-sm font-medium"
                        >
                            Features
                        </a>
                        <a
                            href="#pricing"
                            className="text-slate-600 hover:text-slate-900 transition-colors text-sm font-medium"
                        >
                            Pricing
                        </a>
                    </nav>

                    {/* CTA / Session */}
                    <div className="flex items-center gap-4">
                        {session ? (
                            <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
                                <span className="text-xs font-medium text-slate-500 hidden sm:inline-block">
                                    {session.user?.email}
                                </span>
                                <button
                                    onClick={() => onReset ? onReset() : window.location.reload()}
                                    className="px-4 py-2 bg-emerald-500 text-white text-sm font-bold rounded-lg shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-all"
                                >
                                    Dashboard
                                </button>
                            </div>
                        ) : (
                            <a href="#pricing" className="px-5 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 text-sm font-semibold rounded-lg border border-emerald-500/20 transition-all">
                                Get Started
                            </a>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
};
