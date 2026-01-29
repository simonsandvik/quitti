import { matchReceiptByContent } from "./src/lib/matcher";
import { ReceiptRequest } from "./src/lib/parser";

const vrRequest: ReceiptRequest = {
    id: "vr-req-sw",
    merchant: "VR",
    date: "2025-06-03",
    amount: 25.50,
    currency: "EUR",
    status: "pending"
};

console.log("--- TEST: VR Swedish Content Match ---");
// Simulating text from a Swedish VR ticket PDF
const contentText = "VR Biljett Bokning 12345 Resenär Simon 3.6.2025 Pris 25.50 EUR";

const result = matchReceiptByContent(contentText, vrRequest);

console.log(`Content Score: ${result.score}`);
console.log(`Content Details: ${result.details.join(", ")}`);

// We expect:
// 1. Exact Amount (50)
// 2. Date Found (10)
// 3. Merchant Name 'VR' Found (40) OR Keyword 'Biljett'/'Bokning' (25)
// Since 'VR' is in text, matchReceiptByContent logic finds "Merchant Name Found" (+40) if 2-letter logic holds.
// If not, it falls back to Keywords. Ideally we get max score.

if (result.score >= 50) {
    console.log("✅ Swedish Match Passed");
} else {
    console.error("❌ Swedish Match Failed");
}
