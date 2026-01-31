"use client";

import { motion } from "framer-motion";

import { Button } from "./ui/Button";
import { AnimatedBackground } from "./ui/AnimatedBackground";

interface LandingHeroProps {
    onStart: () => void;
    onDemo: () => void;
}

export const LandingHero = ({ onStart, onDemo }: LandingHeroProps) => {
    return (
        <section className="relative overflow-hidden bg-white pt-8 pb-20 lg:pt-16 lg:pb-32">
            <AnimatedBackground />

            {/* Decorative background glows */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-emerald-500/5 blur-[120px] rounded-full -z-10 pointer-events-none opacity-50"></div>
            <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-blue-500/5 blur-[100px] rounded-full -z-10 pointer-events-none opacity-30"></div>

            <div className="container px-6 mx-auto relative z-10 text-center lg:text-left">
                <div className="grid lg:grid-cols-2 gap-16 items-center">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="max-w-3xl mx-auto lg:mx-0"
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2, duration: 0.5 }}
                            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs font-semibold mb-6 tracking-wide uppercase"
                        >
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            Now with Team Collaboration
                        </motion.div>

                        <h1 className="text-5xl md:text-7xl font-extrabold text-slate-900 leading-[1.05] tracking-tight mb-8">
                            Quit Chasing <br />
                            <span className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-cyan-500 bg-clip-text text-transparent italic">
                                Missing Receipts.
                            </span>
                        </h1>

                        <p className="text-xl text-slate-600 mb-12 max-w-xl leading-relaxed lg:mx-0 mx-auto">
                            Quitti helps you and your team find every missing receipt. Securely scan inboxes, sync shared batches, and provide instant access to your bookkeeper.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-5 justify-center lg:justify-start">
                            <Button
                                variant="primary"
                                size="lg"
                                className="px-10 py-7 text-lg rounded-2xl bg-emerald-500 hover:bg-emerald-600 shadow-xl shadow-emerald-500/20 transition-all active:scale-95"
                                onClick={onStart}
                            >
                                Start Team Scan
                            </Button>
                            <button
                                className="px-10 py-7 text-lg font-bold text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-2 justify-center"
                                onClick={onDemo}
                            >
                                See how it works
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                            </button>
                        </div>

                        <div className="mt-10 flex items-center justify-center lg:justify-start gap-8 text-slate-400 text-sm">
                            <div className="flex items-center gap-2">
                                <span className="text-emerald-500">✓</span> Pay only for results
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-emerald-500">✓</span> Team & Accountant Ready
                            </div>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 20, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        transition={{ delay: 0.4, duration: 0.8 }}
                        className="relative lg:block hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/10 to-blue-500/10 blur-3xl opacity-30 animate-pulse"></div>
                        <motion.div
                            whileHover={{ rotate: 0, scale: 1.02 }}
                            transition={{ duration: 0.3 }}
                            className="relative bg-white/50 backdrop-blur-sm border border-slate-100 p-4 rounded-3xl shadow-2xl transform rotate-1 transition-transform duration-500"
                        >
                            <img
                                src="/images/happy_hunter.png"
                                alt="Quitti Character"
                                className="w-full rounded-2xl hover:scale-105 transition-all duration-300"
                            />

                            {/* Floating element */}
                            <motion.div
                                animate={{ y: [0, -10, 0] }}
                                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                                className="absolute -bottom-6 -left-6 bg-white border border-slate-100 p-4 rounded-2xl shadow-2xl"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-600 font-bold">
                                        ✓
                                    </div>
                                    <div>
                                        <div className="text-slate-900 font-bold">12 Match Found</div>
                                        <div className="text-slate-500 text-xs text-left">16.4s scan complete</div>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
};
