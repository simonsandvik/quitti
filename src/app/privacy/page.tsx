"use client";

import { Header } from "@/components/Header";
import { motion } from "framer-motion";

export default function PrivacyPage() {
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
                        <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-8 tracking-tight">Privacy Policy</h1>
                        <p className="text-slate-500 mb-12 text-lg font-medium">Last Updated: January 29, 2026</p>

                        <div className="prose prose-slate max-w-none text-slate-600 space-y-8 font-medium leading-relaxed">
                            <section>
                                <h2 className="text-2xl font-bold text-slate-900 mb-4">1. Introduction</h2>
                                <p>
                                    Quitti ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our service, particularly regarding our integration with Google Gmail and Microsoft Outlook APIs.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-2xl font-bold text-slate-900 mb-4">2. Data We Access (OAuth)</h2>
                                <p>
                                    Quitti requests **read-only access** to your email messages specifically to identify and retrieve receipt documents.
                                </p>
                                <ul className="list-disc pl-6 space-y-2 mt-4">
                                    <li><strong>Gmail API:</strong> We use the `https://www.googleapis.com/auth/gmail.readonly` scope.</li>
                                    <li><strong>Microsoft Graph API:</strong> We use the `Mail.Read` scope.</li>
                                </ul>
                                <p className="mt-4">
                                    We only scan for emails containing receipt-like data (amounts, dates, merchant names) that match the list you provide. We **never** read your personal correspondence, delete emails, or send emails on your behalf.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-2xl font-bold text-slate-900 mb-4">3. How We Use Information</h2>
                                <p>
                                    The data retrieved is used solely to:
                                </p>
                                <ul className="list-disc pl-6 space-y-2 mt-4">
                                    <li>Identify matching receipts for your missing transaction list.</li>
                                    <li>Enable you to download these receipts in a consolidated ZIP file.</li>
                                    <li>Automate the renaming of files for accounting purposes.</li>
                                </ul>
                            </section>

                            <section>
                                <h2 className="text-2xl font-bold text-slate-900 mb-4">4. Data Storage & Security</h2>
                                <p>
                                    Quitti is designed with a "Privacy First" approach. We do not store your email content on our servers permanently. Your OAuth tokens are encrypted and handled securely. You can revoke access at any time through your Google or Microsoft account settings.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-2xl font-bold text-slate-900 mb-4">5. Third-Party Sharing</h2>
                                <p>
                                    We **do not sell, trade, or otherwise transfer** your personally identifiable information or email data to outside parties. Your data is used exclusively to provide the receipt-finding service to you.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-2xl font-bold text-slate-900 mb-4">6. Your Rights</h2>
                                <p>
                                    You have the right to access, correct, or delete any data we have processed. Since we primarily offer a "scan-and-export" tool, most data is ephemeral. For any concerns, please contact us at hello@quitti.app.
                                </p>
                            </section>
                        </div>
                    </motion.div>
                </div>
            </main>
        </>
    );
}
