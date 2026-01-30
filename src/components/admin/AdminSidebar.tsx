"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminSidebar() {
    const pathname = usePathname();

    const links = [
        { href: "/admin", label: "Dashboard", icon: "📊" },
        { href: "/admin/users", label: "Users", icon: "👥" },
        { href: "/", label: "Back to App", icon: "⬅️" },
    ];

    return (
        <aside className="w-64 bg-slate-900 text-white min-h-screen p-6 flex flex-col fixed left-0 top-0 border-r border-slate-800">
            <div className="mb-10 px-2">
                <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                    <span className="text-2xl">⚡️</span> Quitti<span className="text-slate-500">Admin</span>
                </h1>
            </div>

            <nav className="flex-1 space-y-2">
                {links.map((link) => {
                    const isActive = pathname === link.href;
                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${isActive
                                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                                }`}
                        >
                            <span>{link.icon}</span>
                            {link.label}
                        </Link>
                    );
                })}
            </nav>

            <div className="pt-6 border-t border-slate-800 text-xs text-slate-500 px-2">
                <p>Quitti Admin v1.0</p>
                <p>Protected System</p>
            </div>
        </aside>
    );
}
