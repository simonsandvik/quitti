"use client";

import { motion } from "framer-motion";

const props = [
    {
        title: "Instant Link",
        description: "Securely link your Gmail and Outlook accounts in seconds. We use standard OAuth2, so we never see your password.",
        icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
        ),
    },
    {
        title: "Precision Matching",
        description: "We match receipts by exact amount and date, even if the merchant name on your bank statement doesn't match perfectly.",
        icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ),
    },
    {
        title: "The Perfect Handover",
        description: "Download a ZIP file with all receipts named consistently (Date_Merchant_Amount). Your bookkeeper will love you.",
        icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
        ),
    },
];

export const ValueProps = () => {
    return (
        <section id="features" className="relative w-full bg-slate-50 block" style={{ paddingTop: '8rem', paddingBottom: '8rem' }}>
            <div className="container px-6 mx-auto">
                <div className="grid md:grid-cols-3" style={{ gap: '4rem' }}>
                    {props.map((prop, i) => (
                        <motion.div
                            key={i}
                            className="relative group"
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-100px" }}
                            transition={{ delay: i * 0.2, duration: 0.5 }}
                            whileHover={{ y: -5 }}
                        >
                            <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-600 mb-8 border border-emerald-500/20 shadow-lg shadow-emerald-500/5 group-hover:border-emerald-500/50 group-hover:shadow-emerald-500/20 transition-all duration-300">
                                {prop.icon}
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900 mb-4">
                                {prop.title}
                            </h3>
                            <p className="text-slate-600 leading-relaxed text-lg">
                                {prop.description}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};
