"use client";

export interface HeroProps {
    onStart: () => void;
    onDemo: () => void;
}

export const Hero = ({ onStart, onDemo }: HeroProps) => {
    return (
        <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
            {/* Animated Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"></div>

            {/* Animated Orbs */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-teal-500/20 rounded-full blur-[128px] animate-pulse"></div>
            <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-cyan-500/20 rounded-full blur-[128px] animate-pulse" style={{ animationDelay: '1s' }}></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[150px]"></div>

            {/* Grid Pattern Overlay */}
            <div
                className="absolute inset-0 opacity-[0.03]"
                style={{
                    backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                                      linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
                    backgroundSize: '50px 50px'
                }}
            ></div>

            {/* Content */}
            <div className="relative z-10 max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
                {/* Text Side */}
                <div className="text-center lg:text-left">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-sm font-medium mb-8 backdrop-blur-sm">
                        <span className="w-2 h-2 bg-teal-400 rounded-full animate-pulse"></span>
                        Now with Gmail & Outlook integration
                    </div>

                    {/* Headline */}
                    <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white leading-[1.1] tracking-tight mb-6">
                        Quit chasing
                        <br />
                        <span className="bg-gradient-to-r from-teal-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent">
                            receipts.
                        </span>
                    </h1>

                    {/* Subheadline */}
                    <p className="text-xl text-slate-400 leading-relaxed mb-10 max-w-lg mx-auto lg:mx-0">
                        Quitti helps you quit chasing missing receipts. Securely scan your Google and Microsoft inboxes. No more manual searching.
                    </p>

                    {/* CTAs */}
                    <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-8">
                        <button
                            onClick={onStart}
                            className="group relative px-8 py-4 bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-semibold rounded-xl shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40 transition-all duration-300 hover:-translate-y-0.5 overflow-hidden"
                        >
                            <span className="relative z-10">Find My Receipts</span>
                            <div className="absolute inset-0 bg-gradient-to-r from-teal-400 to-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        </button>

                        <button
                            onClick={onDemo}
                            className="px-8 py-4 text-slate-300 font-medium rounded-xl border border-slate-700 hover:border-slate-500 hover:bg-slate-800/50 transition-all duration-300"
                        >
                            Try Demo →
                        </button>
                    </div>

                    {/* Trust Badges */}
                    <div className="flex items-center gap-6 justify-center lg:justify-start text-sm text-slate-500">
                        <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Pay only for results
                        </div>
                        <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            Read-only access
                        </div>
                    </div>
                </div>

                {/* Visual Side */}
                <div className="relative hidden lg:block">
                    {/* Floating Card Effect */}
                    <div className="relative">
                        {/* Glow behind image */}
                        <div className="absolute inset-0 bg-gradient-to-r from-teal-500/20 to-cyan-500/20 rounded-3xl blur-2xl scale-110"></div>

                        {/* Main Image */}
                        <div className="relative bg-slate-800/50 backdrop-blur-sm rounded-3xl border border-slate-700/50 p-6 shadow-2xl">
                            <img
                                src="/images/hunter.png"
                                alt="Quitti"
                                className="w-full rounded-2xl"
                            />
                        </div>

                        {/* Floating Stats Card */}
                        <div className="absolute -bottom-6 -left-6 bg-slate-800/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 shadow-xl">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-xl flex items-center justify-center text-white text-xl">
                                    📧
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-white">€49</div>
                                    <div className="text-sm text-slate-400">per batch</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Scroll Indicator */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-slate-500">
                <span className="text-xs uppercase tracking-widest">Scroll</span>
                <div className="w-6 h-10 rounded-full border-2 border-slate-600 flex items-start justify-center p-2">
                    <div className="w-1.5 h-3 bg-teal-500 rounded-full animate-bounce"></div>
                </div>
            </div>
        </section>
    );
};
