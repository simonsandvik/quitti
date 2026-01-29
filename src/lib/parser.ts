import Papa from "papaparse";
import { v4 as uuidv4 } from "uuid";

export interface ReceiptRequest {
    id: string;
    date: string; // YYYY-MM-DD
    merchant: string;
    amount: number;
    currency: string;
    status: "pending" | "found" | "possible" | "not_found";
}

// Helper to normalize amount
const parseAmount = (val: string): number => {
    if (!val) return 0;
    // Replace comma with dot for European formats
    let clean = val.replace(/[^0-9.,-]/g, "");

    // Heuristic: If there is a comma and no dot, or if comma comes after dot
    if (clean.includes(",") && (!clean.includes(".") || clean.lastIndexOf(",") > clean.lastIndexOf("."))) {
        // Remove existing dots (thousands separators) and replace comma with dot
        clean = clean.replace(/\./g, "").replace(",", ".");
    } else {
        // Standard US format: remove commas (thousands)
        clean = clean.replace(/,/g, "");
    }

    return parseFloat(clean) || 0;
};

// Helper to normalize date to YYYY-MM-DD
const parseDate = (val: string): string => {
    if (!val) return "";

    // Handle D.M.YYYY or DD.MM.YYYY
    const euroMatch = val.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (euroMatch) {
        const [_, d, m, y] = euroMatch;
        return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }

    const d = new Date(val);
    if (isNaN(d.getTime())) return ""; // Return empty if not a valid date string
    return d.toISOString().split("T")[0];
};

// Helper to normalize merchant names for grouping
const normalizeMerchant = (val: string): string => {
    if (!val) return "Unknown Merchant";

    // 1. Clean up common bank/payment noise
    let normalized = val
        .replace(/[0-9]{8,}/g, "") // remove long numeric IDs 
        .replace(/\*[A-Z0-9]{4,}/g, "") // remove Stripe/Bank suffixes like *UG3V
        .replace(/\/[A-Z]\/[0-9]+/g, "") // remove Bolt-style slash suffixes
        .replace(/BUS\s+[0-9]+/gi, "") // remove business IDs
        .replace(/Kortköp\s+[0-9]*/gi, "") // remove Swedish "Kortköp"
        .replace(/Helsinki/gi, "") // remove location noise (often found in bank rows)
        .replace(/\s+/g, " ") // collapse spaces
        .trim();

    // 2. Title Case for consistency
    normalized = normalized.toLowerCase().split(" ").map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(" ");

    // 3. Known unified names (Common in bank exports)
    const low = normalized.toLowerCase();
    if (low.includes("google ads") || low.includes("google *ads")) return "Google Ads";
    if (low.includes("facebook") || low.includes("facebk")) return "Facebook";
    if (low.includes("linkedin")) return "LinkedIn";
    if (low.includes("bolt")) return "Bolt";
    if (low.includes("wolt")) return "Wolt";
    if (low.includes("spotify")) return "Spotify";
    if (low.includes("adobe")) return "Adobe";
    if (low.includes("chatgpt") || low.includes("openai")) return "OpenAI";
    if (low.includes("finnair")) return "Finnair";
    if (low.includes("uber")) return "Uber";
    if (low.includes("ryanair")) return "Ryanair";

    return normalized.replace(/[^a-zA-Z0-9. ]/g, "").trim() || "Unknown Merchant";
};

export const parseReceipts = (input: string): ReceiptRequest[] => {
    // PRE-CHECK: Detect Delimiter
    const firstLines = input.split("\n").slice(0, 10);
    const semiCount = (firstLines.join("").match(/;/g) || []).length;
    const commaCount = (firstLines.join("").match(/,/g) || []).length;
    const pipeCount = (firstLines.join("").match(/\|/g) || []).length;

    let forcedDelimiter = "";
    if (semiCount > commaCount && semiCount > pipeCount) forcedDelimiter = ";";
    else if (pipeCount > semiCount) forcedDelimiter = "|";

    const results = Papa.parse(input, {
        header: true,
        skipEmptyLines: true,
        delimiter: forcedDelimiter, // Use detected or let it auto-detect
    });

    let data = results.data as any[];
    const fields = results.meta.fields || [];
    const hasHeaders = fields.some(f =>
        ["date", "merchant", "vendor", "amount", "total", "sum"].includes(f.toLowerCase().trim())
    );

    if (!hasHeaders) {
        const rawResults = Papa.parse(input, {
            header: false,
            skipEmptyLines: true,
            delimiter: forcedDelimiter,
        });
        data = rawResults.data as any[];
    }

    const parsed: ReceiptRequest[] = [];

    data.forEach((row: any) => {
        let date = "";
        let amount = 0;
        let merchant = "";
        let currency = "EUR";

        if (hasHeaders) {
            Object.keys(row).forEach(key => {
                const k = key.toLowerCase().trim();
                const val = String(row[key]).trim();
                if (k === "date") date = parseDate(val);
                else if (k === "merchant" || k === "vendor" || k === "description") merchant = normalizeMerchant(val);
                else if (k === "amount" || k === "total" || k === "sum") amount = parseAmount(val);
                else if (k === "currency") currency = val;
            });
        } else if (Array.isArray(row)) {
            const parts = row.map(c => String(c).trim()).filter(p => p !== "");

            // 1. Specific Bookkeeping Pattern Detection
            const description = parts.find(p => p.includes("Saaja:") || p.includes("Kortkop") || p.includes("Kortk\u02c6p") || p.includes("Kortk\ufffdp"));

            if (description) {
                const merchantMatch = description.match(/Saaja:\s*([^,*]+)/i);
                if (merchantMatch) merchant = normalizeMerchant(merchantMatch[1]);

                const dateMatch = description.match(/(\d{1,2}\.\d{1,2}\.\d{4})/);
                if (dateMatch) date = parseDate(dateMatch[1]);

                if (parts.length >= 2) {
                    amount = parseAmount(parts[parts.length - 1]);
                }
            }

            // 2. Generic Heuristics
            if (!date || !merchant || amount === 0) {
                parts.forEach(p => {
                    const dCandidate = parseDate(p);
                    if (!date && dCandidate) {
                        date = dCandidate;
                    } else if (amount === 0 && p.match(/^-?[0-9]+[,.][0-9]{2}$/)) {
                        amount = parseAmount(p);
                    } else if (!merchant && p.length > 3 && !p.includes("721") && !p.includes("Saaja:") && isNaN(Number(p)) && !parseDate(p)) {
                        merchant = normalizeMerchant(p);
                    }
                });
            }

            // 3. Fallback to columns
            if (!date && parts[0]) date = parseDate(parts[0]);
            if (!merchant && parts[1]) merchant = normalizeMerchant(parts[1]);
            if (amount === 0 && parts[parts.length - 1]) amount = parseAmount(parts[parts.length - 1]);
        }

        if (date && amount > 0) {
            parsed.push({
                id: uuidv4(),
                date,
                merchant: merchant || "Unknown Merchant",
                amount,
                currency,
                status: "pending"
            });
        }
    });

    return parsed;
};
