import React from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface ThankYouModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ThankYouModal: React.FC<ThankYouModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

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
                        <div className="mb-8 transform hover:scale-105 transition-transform duration-300 cursor-default inline-block">
                            <img
                                src="/images/happy_hunter.png"
                                alt="Quitti Success"
                                className="w-48 h-48 object-contain drop-shadow-2xl mx-auto"
                            />
                        </div>

                        <h2 className="text-3xl font-black mb-4 bg-gradient-to-br from-slate-900 to-slate-700 bg-clip-text text-transparent tracking-tight">
                            Hunt Successful!
                        </h2>

                        <p className="text-slate-600 mb-2 font-bold text-lg">
                            Your organized receipts are ready.
                        </p>

                        <p className="text-slate-500 mb-10 text-sm leading-relaxed max-w-[90%] mx-auto font-medium">
                            "If you liked the experience, please leave a quick review. It helps us grow! 🙏"
                        </p>

                        <Button
                            variant="primary"
                            size="lg"
                            className="w-full mb-6 bg-[#00b67a] hover:bg-[#00a36d] border-0 shadow-xl shadow-[#00b67a]/20 h-16 text-lg font-black rounded-2xl active:scale-[0.98] transition-all"
                            onClick={() => window.open('https://www.trustpilot.com/review/quittiapp.com', '_blank')}
                        >
                            Review on Trustpilot
                        </Button>

                        <button
                            onClick={onClose}
                            className="text-sm text-slate-400 hover:text-slate-900 font-bold transition-colors py-2 px-4 rounded-xl hover:bg-slate-100"
                        >
                            Close
                        </button>
                    </div>
                </Card>
            </div>
        </div>
    );
};
