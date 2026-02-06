"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession, signOut, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

interface HeaderProps {
    onReset?: () => void;
}

export const Header = ({ onReset }: HeaderProps) => {
    const { data: session } = useSession();
    const router = useRouter();

    const handleDashboardClick = () => {
        // Navigate to "/" and scroll to top
        router.push("/");
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

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
                        <div className="w-10 h-10 relative group-hover:scale-110 transition-transform duration-300">
                            <Image
                                src="/logo.png"
                                alt="Quitti Logo"
                                fill
                                className="object-contain rounded-xl shadow-lg shadow-emerald-500/20"
                            />
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
                                    onClick={handleDashboardClick}
                                    className="px-4 py-2 bg-emerald-500 text-white text-sm font-bold rounded-lg shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-all"
                                >
                                    Dashboard
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-4">
                                <Link
                                    href="/login"
                                    className="text-slate-600 hover:text-slate-900 font-semibold text-sm transition-colors"
                                >
                                    Sign In
                                </Link>
                                <a href="#pricing" className="px-5 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 text-sm font-semibold rounded-lg border border-emerald-500/20 transition-all">
                                    Get Started
                                </a>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
};
