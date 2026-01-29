"use client";

import Link from "next/link";

export const Footer = () => {
    return (
        <footer className="bg-slate-50 border-t border-slate-200 pt-20 pb-12">
            <div className="container mx-auto px-6 max-w-6xl">
                <div className="flex flex-col md:flex-row justify-between items-center gap-8 mb-12">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-lg flex items-center justify-center text-white shadow-lg shadow-emerald-500/10">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 10h.01M15 10h.01M12 12h.01" />
                            </svg>
                        </div>
                        <span className="text-xl font-black text-slate-900 tracking-tighter">
                            Quitti
                        </span>
                    </div>

                    <div className="flex gap-8">
                        <Link href="/privacy" className="text-sm font-medium text-slate-500 hover:text-emerald-600 transition-colors">
                            Privacy Policy
                        </Link>
                        <Link href="/terms" className="text-sm font-medium text-slate-500 hover:text-emerald-600 transition-colors">
                            Terms of Service
                        </Link>
                        <a href="mailto:hello@quitti.app" className="text-sm font-medium text-slate-500 hover:text-emerald-600 transition-colors">
                            Contact
                        </a>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-400 font-medium">
                    <p>© 2026 Quitti. All rights reserved.</p>
                    <p>Designed for busy executives who value their time.</p>
                </div>
            </div>
        </footer>
    );
};
