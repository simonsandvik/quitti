import { ReceiptRequest } from "./parser";

export interface HtmlReceiptAnalysis {
    isReceipt: boolean;
    confidence: number;
    extractedAmount?: number;
    extractedDate?: string;
}

/**
 * Analyze email HTML body to determine if it IS a receipt (not just a notification).
 * Returns a confidence score; 50+ means it's likely a receipt.
 */
export function analyzeHtmlReceipt(html: string, request: ReceiptRequest): HtmlReceiptAnalysis {
    if (!html || html.length < 50) {
        return { isReceipt: false, confidence: 0 };
    }

    let score = 0;
    let extractedAmount: number | undefined;
    let extractedDate: string | undefined;

    // Strip HTML tags for text analysis
    const textContent = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#?\w+;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // --- 1. Amount matching (max +40) ---
    const amountStr = request.amount.toFixed(2);
    const amountInt = Math.floor(request.amount).toString();
    const amountEuropean = amountStr.replace('.', ','); // e.g. "12,50"

    // Check for exact amount in text
    if (textContent.includes(amountStr) || textContent.includes(amountEuropean)) {
        score += 40;
        extractedAmount = request.amount;
    } else {
        // Fuzzy amount: parse all monetary values and check within ±5%
        const amountRegex = /(?:[\$€£¥]|USD|EUR|GBP|SEK|NOK|DKK)?\s*(\d{1,3}(?:[\s.,]\d{3})*(?:[.,]\d{2}))(?![0-9])/gi;
        const amounts = textContent.matchAll(amountRegex);
        for (const match of amounts) {
            const raw = match[1]
                .replace(/\s/g, '')
                .replace(/,(\d{2})$/, '.$1')
                .replace(/,/g, '');
            const parsed = parseFloat(raw);
            if (!isNaN(parsed) && parsed > 0) {
                const diff = Math.abs(parsed - request.amount) / request.amount;
                if (diff <= 0.05) {
                    score += 30;
                    extractedAmount = parsed;
                    break;
                }
            }
        }
    }

    // --- 2. Date matching (max +15) ---
    if (request.date) {
        const reqDate = new Date(request.date);
        const day = reqDate.getDate();
        const month = reqDate.getMonth() + 1;
        const year = reqDate.getFullYear();
        const dateFormats = [
            `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
            `${day}.${month}.${year}`,
            `${day.toString().padStart(2, '0')}.${month.toString().padStart(2, '0')}.${year}`,
            `${day}/${month}/${year}`,
            `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`,
            `${month}/${day}/${year}`,
        ];

        if (dateFormats.some(d => textContent.includes(d))) {
            score += 15;
            extractedDate = request.date;
        }
    }

    // --- 3. Receipt keywords (max +10) ---
    const receiptKeywords = [
        "total", "amount", "sum", "subtotal", "grand total", "amount due", "amount paid",
        "yhteensä", "summa", "loppusumma",
        "totalt", "belopp", "summa",
        "i alt", "beløp",
    ];
    const textLower = textContent.toLowerCase();
    if (receiptKeywords.some(k => textLower.includes(k))) {
        score += 10;
    }

    // --- 4. Table structure / line items (max +10) ---
    const hasTable = /<table[\s>]/i.test(html);
    const hasTr = (html.match(/<tr[\s>]/gi) || []).length >= 2;
    if (hasTable && hasTr) {
        score += 10;
    }

    // --- 5. Receipt/invoice classification keywords (max +10) ---
    const classificationKeywords = [
        "receipt", "invoice", "order confirmation", "payment confirmation",
        "kuitti", "lasku", "tilausvahvistus", "maksuvahvistus",
        "kvitto", "faktura", "orderbekräftelse", "betalningsbekräftelse",
        "kvittering", "betalingsbekreftelse",
    ];
    if (classificationKeywords.some(k => textLower.includes(k))) {
        score += 10;
    }

    return {
        isReceipt: score >= 50,
        confidence: score,
        extractedAmount,
        extractedDate,
    };
}

/**
 * Clean email HTML for PDF conversion: remove tracking, scripts, and problematic elements.
 */
export function cleanEmailHtml(html: string, merchant: string): string {
    let cleaned = html;

    // Remove <script> tags
    cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

    // Remove event handlers
    cleaned = cleaned.replace(/\s+on\w+="[^"]*"/gi, '');
    cleaned = cleaned.replace(/\s+on\w+='[^']*'/gi, '');

    // Remove tracking pixels (1x1 images)
    cleaned = cleaned.replace(/<img[^>]*(?:width\s*=\s*["']?1["']?\s*height\s*=\s*["']?1["']?|height\s*=\s*["']?1["']?\s*width\s*=\s*["']?1["']?)[^>]*\/?>/gi, '');

    // Remove images with common tracking domains
    const trackingDomains = ['tracking', 'pixel', 'beacon', 'analytics', 'mailtrack', 'sendgrid', 'mailchimp', 'campaign-archive'];
    for (const domain of trackingDomains) {
        const regex = new RegExp(`<img[^>]*src="[^"]*${domain}[^"]*"[^>]*/?>`, 'gi');
        cleaned = regex.source ? cleaned.replace(regex, '') : cleaned;
    }

    // Remove style tags that might break rendering
    cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Add a receipt header
    const header = `
        <div style="border-bottom: 2px solid #e5e7eb; padding-bottom: 12px; margin-bottom: 16px; font-family: sans-serif;">
            <strong style="color: #6366f1;">Quitti</strong>
            <span style="color: #6b7280; font-size: 13px;"> — Receipt from ${merchant} (extracted from email)</span>
        </div>
    `;

    // Wrap in a container with basic styling
    return `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 800px; padding: 24px;">
            ${header}
            ${cleaned}
        </div>
    `;
}
