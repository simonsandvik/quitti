"use client";

const steps = [
    {
        number: 1,
        title: "Upload Your List",
        description: "Export missing receipts from your accounting system. Paste or upload CSV/Excel with dates, merchants, and amounts.",
        icon: "📋",
        gradient: "from-violet-500 to-purple-500"
    },
    {
        number: 2,
        title: "Connect Your Email",
        description: "Securely connect Gmail or Outlook. We scan for matching receipts with read-only access.",
        icon: "🔍",
        gradient: "from-teal-500 to-cyan-500"
    },
    {
        number: 3,
        title: "Export & Done",
        description: "Download a ready-made folder with sorted, properly named receipts. Hours saved!",
        icon: "📂",
        gradient: "from-orange-500 to-amber-500"
    }
];

export const HowItWorks = () => {
    return (
        <section id="how-it-works" className="relative py-32 overflow-hidden bg-white">
            {/* Subtle Orb */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-500/[0.03] rounded-full blur-[150px] pointer-events-none"></div>

            <div className="relative z-10 max-w-6xl mx-auto px-6">
                {/* Section Header */}
                <div className="text-center mb-20">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-sm font-bold mb-6 backdrop-blur-sm uppercase tracking-wider">
                        Simple Process
                    </div>

                    <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 mb-6 tracking-tight">
                        Easy as{' '}
                        <span className="bg-gradient-to-r from-emerald-600 to-cyan-600 bg-clip-text text-transparent">
                            1, 2, 3
                        </span>
                    </h2>

                    <p className="text-xl text-slate-500 max-w-2xl mx-auto font-medium">
                        Stop wasting hours searching for receipts. Let Quitti do the heavy lifting.
                    </p>
                </div>

                {/* Steps Grid */}
                <div className="grid md:grid-cols-3 gap-10">
                    {steps.map((step, index) => (
                        <div
                            key={step.number}
                            className="group relative"
                            style={{ animationDelay: `${index * 0.1}s` }}
                        >
                            {/* Card */}
                            <div className="relative h-full bg-white rounded-[2.5rem] border border-slate-200 p-10 hover:border-emerald-500/30 transition-all duration-500 hover:-translate-y-2 hover:shadow-3xl hover:shadow-emerald-500/10">
                                {/* Number Badge */}
                                <div className={`w-16 h-16 rounded-[1.25rem] bg-gradient-to-br ${step.gradient} flex items-center justify-center text-white text-3xl font-black mb-8 shadow-xl shadow-emerald-500/20`}>
                                    {step.number}
                                </div>

                                {/* Icon */}
                                <div className="text-5xl mb-6 transform group-hover:scale-110 transition-transform duration-300 inline-block">{step.icon}</div>

                                {/* Content */}
                                <h3 className="text-2xl font-black text-slate-900 mb-4 tracking-tight">{step.title}</h3>
                                <p className="text-slate-600 leading-relaxed font-medium">{step.description}</p>

                                {/* Hover Glow */}
                                <div className={`absolute inset-0 rounded-[2.5rem] bg-gradient-to-br ${step.gradient} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-500`}></div>
                            </div>

                            {/* Connector Line (not on last item) */}
                            {index < steps.length - 1 && (
                                <div className="hidden lg:block absolute top-[4.5rem] -right-5 w-10 h-[2px] bg-slate-100"></div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Bottom CTA */}
                <div className="mt-20 text-center">
                    <div className="inline-flex items-center gap-4 px-8 py-4 rounded-3xl bg-emerald-50 border border-emerald-100 text-emerald-700 shadow-sm">
                        <span className="text-2xl">💡</span>
                        <span className="font-bold text-lg">Saves hours of manual work every audit period</span>
                    </div>
                </div>
            </div>
        </section>
    );
};
