"use client";

import { motion } from "framer-motion";

const props = [
    {
        title: "Collaborative Teams",
        description: "Invite your team members to sync their receipts into one unified dashboard. Perfect for growing companies and busy offices.",
        icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
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
        title: "Bookkeeper Portal",
        description: "Generate a secure, read-only link for your accountant. They get instant access to all receipts and audit-ready files.",
        icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 015.656 0l4 4a4 4 0 01-5.656 5.656l-1.101-1.101" />
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
