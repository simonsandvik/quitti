import { motion } from "framer-motion";
import { Button } from "./ui/Button";

interface PricingSimpleProps {
    onStart: () => void;
}

export const PricingSimple = ({ onStart }: PricingSimpleProps) => {
    return (
        <section id="pricing" className="bg-white" style={{ paddingTop: '6rem', paddingBottom: '6rem' }}>
            <div className="container px-6 mx-auto max-w-4xl">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    whileHover={{ scale: 1.01 }}
                    className="relative bg-white border border-slate-200 rounded-[2.5rem] p-8 md:p-16 overflow-hidden shadow-2xl transition-all duration-300 hover:shadow-emerald-500/10 hover:border-emerald-500/20"
                >

                    {/* Accent glow */}
                    <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none animate-pulse"></div>

                    <div className="relative z-10 text-center">
                        <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-6">The Bounty Model</h2>
                        <p className="text-slate-600 text-lg mb-12 max-w-2xl mx-auto leading-relaxed">
                            No monthly subscriptions. No hidden fees. Pay only when you are ready to export your missing documents.
                        </p>

                        <div className="inline-flex flex-col items-center bg-slate-50 backdrop-blur-md border border-slate-200 rounded-3xl p-10 mb-12 shadow-sm">
                            <div className="text-slate-500 text-sm font-bold uppercase tracking-widest mb-2">Per Successful Hunt</div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-6xl font-black text-slate-900">€49</span>
                                <span className="text-slate-500 font-medium">flat</span>
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-8 text-left max-w-2xl mx-auto mb-12">
                            <div className="flex items-start gap-4">
                                <div className="w-6 h-6 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shrink-0 mt-1">✓</div>
                                <p className="text-slate-700 text-sm">Unlimited email account connections during your hunt.</p>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="w-6 h-6 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shrink-0 mt-1">✓</div>
                                <p className="text-slate-700 text-sm">Automated PDF renaming and ZIP export included.</p>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="w-6 h-6 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shrink-0 mt-1">✓</div>
                                <p className="text-slate-700 text-sm">Full preview before you pay a single cent.</p>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="w-6 h-6 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shrink-0 mt-1">✓</div>
                                <p className="text-slate-700 text-sm">Saves on average 3-5 hours per export period.</p>
                            </div>
                        </div>

                        <Button
                            variant="primary"
                            size="lg"
                            className="px-12 py-8 text-xl rounded-2xl bg-emerald-500 hover:bg-emerald-600 shadow-xl shadow-emerald-500/20 active:scale-95 transition-all"
                            onClick={onStart}
                        >
                            Start Your Hunt for Free
                        </Button>

                        <p className="mt-8 text-slate-500 text-sm font-semibold italic">
                            Scan your emails and view results for free. Payment only required for batch export.
                        </p>
                    </div>
                </motion.div>
            </div>
        </section>
    );
};
