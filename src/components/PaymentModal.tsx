import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handlePay = () => {
        setLoading(true);
        // Simulate Stripe
        setTimeout(() => {
            setLoading(false);
            onSuccess();
        }, 1500);
    };

    return (
        <div className="fixed inset-0 bg-slate-900/40 z-[1200] flex items-center justify-center backdrop-blur-md animate-in fade-in duration-200">
            <div
                className="w-[95%] p-4 animate-in zoom-in-95 duration-300 mx-auto"
                style={{ maxWidth: '500px' }}
            >
                <Card glass className="relative overflow-hidden border border-slate-200 shadow-3xl bg-white p-0 rounded-[2.5rem]">
                    {/* Decorative glow */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-emerald-500/5 blur-[80px] rounded-full pointer-events-none" />

                    <div className="p-10 text-center relative z-10">
                        <div className="text-6xl mb-8 transform hover:scale-110 transition-transform duration-300 cursor-default">
                            🎯
                        </div>

                        <h2 className="text-3xl font-black mb-4 bg-gradient-to-br from-slate-900 to-slate-700 bg-clip-text text-transparent tracking-tight">
                            Secure Your Catch
                        </h2>

                        <p className="text-slate-500 mb-10 text-base leading-relaxed max-w-[85%] mx-auto font-medium">
                            The hunt was successful! You've found your missing receipts. Organise them for your audit now.
                        </p>

                        <div className="bg-slate-50 border border-slate-100 rounded-3xl p-8 mb-10 text-left shadow-sm">
                            <div className="flex justify-between items-center mb-6">
                                <div className="flex flex-col">
                                    <span className="font-extrabold text-slate-900 text-lg">One-time Hunt</span>
                                    <span className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Full Batch Results</span>
                                </div>
                                <span className="text-3xl font-black text-emerald-600">€49</span>
                            </div>
                            <ul className="space-y-4">
                                {[
                                    'All matched PDFs downloaded',
                                    'HTML-to-PDF conversion included',
                                    'Audit-ready folder naming (Date_Vendor)'
                                ].map((item, i) => (
                                    <li key={i} className="flex items-start text-sm text-slate-600 font-semibold">
                                        <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center mr-4 flex-shrink-0 mt-0.5">
                                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <Button
                            variant="primary"
                            size="lg"
                            className="w-full mb-6 bg-emerald-500 hover:bg-emerald-600 border-0 shadow-xl shadow-emerald-500/20 h-16 text-lg font-black rounded-2xl active:scale-[0.98] transition-all"
                            onClick={handlePay}
                            isLoading={loading}
                        >
                            {loading ? 'Processing...' : 'Unlock & Download'}
                        </Button>

                        <button
                            onClick={onClose}
                            className="text-sm text-slate-400 hover:text-slate-900 font-bold transition-colors py-2 px-4 rounded-xl hover:bg-slate-100"
                            disabled={loading}
                        >
                            Maybe later
                        </button>
                    </div>
                </Card>
            </div>
        </div>
    );
};
