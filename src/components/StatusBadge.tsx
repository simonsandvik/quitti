"use client";

import React from "react";
import { MatchStatus } from "@/lib/matcher";

export const StatusBadge = ({ status }: { status: MatchStatus }) => {
    let styles = "bg-slate-100 text-slate-500 border-slate-200";

    if (status === "FOUND") {
        styles = "bg-emerald-100 text-emerald-700 border-emerald-200 shadow-sm";
    } else if (status === "POSSIBLE") {
        styles = "bg-amber-100 text-amber-700 border-amber-200";
    } else if (status === "MISSING") {
        styles = "bg-cyan-50 text-cyan-700 border-cyan-200";
    } else {
        styles = "bg-red-100 text-red-700 border-red-200";
    }

    return (
        <span className={`px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider border ${styles}`}>
            {status}
        </span>
    );
};
