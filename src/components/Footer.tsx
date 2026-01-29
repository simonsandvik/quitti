"use client";

import Link from "next/link";
import Image from "next/image";

export const Footer = () => {
    return (
        <footer className="bg-slate-50 border-t border-slate-200 pt-20 pb-12">
            <div className="container mx-auto px-6 max-w-6xl">
                <div className="flex flex-col md:flex-row justify-between items-center gap-8 mb-12">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 relative">
                            <Image
                                src="/logo.png"
                                alt="Quitti Logo"
                                fill
                                className="object-contain rounded-lg shadow-lg shadow-emerald-500/10"
                            />
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
