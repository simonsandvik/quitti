"use client";

import { motion, useScroll, useSpring } from "framer-motion";
import { useRef } from "react";

const steps = [
    {
        number: "01",
        title: "Link Your Email",
        description: "Securely connect your Gmail or Outlook. We use official APIs and OAuth2, so we never see your password."
    },
    {
        number: "02",
        title: "We Scan",
        description: "Our system scans your inbox for receipts and matches them to your bank transactions with high accuracy."
    },
    {
        number: "03",
        title: "Add Non-Email Receipts",
        description: "Easily bulk-upload paper receipts or invoices from other sources to complete your monthly documentation."
    },
    {
        number: "04",
        title: "Audit-Ready Export",
        description: "Get a tidy ZIP file with all your receipts renamed (Date_Merchant_Amount) and ready for your accountant."
    }
];

export const ProcessVertical = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start center", "end center"]
    });

    const scaleY = useSpring(scrollYProgress, {
        stiffness: 100,
        damping: 30,
        restDelta: 0.001
    });

    return (
        <section ref={containerRef} id="how-it-works" className="relative bg-white overflow-hidden" style={{ paddingTop: '8rem', paddingBottom: '8rem' }}>
            {/* Subtle decorative arc */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/5 blur-[120px] rounded-full -z-10 pointer-events-none"></div>

            <div className="container px-6 mx-auto max-w-4xl">
                <div className="text-center mb-20">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-6"
                    >
                        How It Works
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="text-slate-600 text-lg"
                    >
                        Four simple steps to a clean audit.
                    </motion.p>
                </div>

                <div className="relative">
                    {/* Vertical Line Base */}
                    <div className="absolute left-[31px] md:left-1/2 top-0 bottom-0 w-px bg-slate-100 md:-translate-x-1/2"></div>

                    {/* Animated Progress Line */}
                    <motion.div
                        className="absolute left-[31px] md:left-1/2 top-0 bottom-0 w-px bg-emerald-500 origin-top md:-translate-x-1/2"
                        style={{ scaleY }}
                    />

                    <div className="space-y-24">
                        {steps.map((step, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 50 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-50px" }}
                                transition={{ duration: 0.5, delay: i * 0.1 }}
                                className={`relative flex flex-col md:flex-row items-center gap-12 ${i % 2 === 1 ? 'md:flex-row-reverse' : ''}`}
                            >

                                {/* Icon Circle - Centered on Mobile and Desktop */}
                                <div className="absolute left-0 md:left-1/2 w-16 h-16 bg-white border border-emerald-500/30 rounded-full flex items-center justify-center text-emerald-600 z-10 md:-translate-x-1/2 shadow-[0_0_0_8px_white]">
                                    <span className="font-bold text-lg">{step.number}</span>
                                </div>

                                {/* Content Block - Pushed away from center to avoid overlap */}
                                <div className={`ml-24 md:ml-0 w-full md:w-1/2 ${i % 2 === 1 ? 'md:pl-24 text-left' : 'md:pr-24 md:text-right text-left'}`}>
                                    <div className="relative group p-6 rounded-3xl border border-transparent hover:border-emerald-500/10 transition-colors duration-300">
                                        <h3 className="text-2xl font-bold text-slate-900 mb-4 transition-colors group-hover:text-emerald-600">{step.title}</h3>
                                        <p className="text-slate-600 leading-relaxed group-hover:text-slate-700 transition-colors">
                                            {step.description}
                                        </p>
                                    </div>
                                </div>

                                {/* Empty block for spacing in grid */}
                                <div className="hidden md:block w-1/2"></div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};
