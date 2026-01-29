"use client";

import { Header } from "@/components/Header";
import { motion } from "framer-motion";

export default function TermsPage() {
    return (
        <>
            <Header onReset={() => window.location.href = '/'} />
            <main className="min-h-screen bg-white pt-32 pb-24">
                <div className="container max-w-4xl mx-auto px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-8 tracking-tight">Terms of Service</h1>
                        <p className="text-slate-500 mb-12 text-lg font-medium">Last Updated: January 29, 2026</p>

                        <div className="prose prose-slate max-w-none text-slate-600 space-y-8 font-medium leading-relaxed">
                            <section>
                                <h2 className="text-2xl font-bold text-slate-900 mb-4">1. Acceptance of Terms</h2>
                                <p>
                                    By accessing or using Quitti, you agree to be bound by these Terms of Service. If you do not agree, please do not use our service.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-2xl font-bold text-slate-900 mb-4">2. Description of Service</h2>
                                <p>
                                    Quitti provides an automated tool to scan your connected email accounts for specific receipts based on data you provide (merchant, date, amount). We facilitate the retrieval and organization of these documents for accounting purposes.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-2xl font-bold text-slate-900 mb-4">3. User Responsibilities</h2>
                                <p>
                                    You are responsible for:
                                </p>
                                <ul className="list-disc pl-6 space-y-2 mt-4">
                                    <li>Providing accurate data list for matching.</li>
                                    <li>Ensuring you have the right to access the email accounts you connect.</li>
                                    <li>Maintaining the security of your account and connected sessions.</li>
                                </ul>
                            </section>

                            <section>
                                <h2 className="text-2xl font-bold text-slate-900 mb-4">4. Limitations of Liability</h2>
                                <p>
                                    Quitti is provided "as is" without warranties of any kind. We are not liable for any delays in receipt finding, missing documents, or issues arising from third-party API (Google/Microsoft) downtime. We do not guarantee 100% accuracy in automated matching.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-2xl font-bold text-slate-900 mb-4">5. "Bounty" Payment Model</h2>
                                <p>
                                    Quitti operates on a "Bounty" model. Scanning and previewing results is free. Payment is required only when you choose to export your recovered documents. Once an export is initiated and payment is processed, we do not typically offer refunds due to the immediate digital delivery of the service.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-2xl font-bold text-slate-900 mb-4">6. Changes to Terms</h2>
                                <p>
                                    We reserve the right to modify these terms at any time. We will notify users of any significant changes by updating the "Last Updated" date at the top of this page.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-2xl font-bold text-slate-900 mb-4">7. Governing Law</h2>
                                <p>
                                    These terms shall be governed by and construed in accordance with the laws of the jurisdiction in which Quitti operates.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-2xl font-bold text-slate-900 mb-4">8. Contact Us</h2>
                                <p>
                                    If you have any questions about these Terms, please contact us at **hello@quitti.app**.
                                </p>
                            </section>
                        </div>
                    </motion.div>
                </div>
            </main>
        </>
    );
}
