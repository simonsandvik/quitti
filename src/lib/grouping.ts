export interface MerchantHierarchy {
    main: string;
    sub: string;
}

export function getMerchantHierarchy(merchant: string): MerchantHierarchy {
    const m = merchant.toLowerCase();

    // Define common parent brands
    const brands: Record<string, string[]> = {
        'Google': ['google', 'google ads', 'gsuite', 'youtube'],
        'Facebook': ['facebook', 'facebk', 'meta platforms', 'instagram'],
        'Amazon': ['amazon', 'amzn', 'aws'],
        'Microsoft': ['microsoft', 'msft', 'azure', 'xbox'],
        'Apple': ['apple', 'itunes', 'apple.com/bill'],
        'Uber': ['uber', 'uber trip', 'uber eats'],
        'LinkedIn': ['linkedin'],
        'Adobe': ['adobe'],
        'DigitalOcean': ['digitalocean'],
        'Heroku': ['heroku'],
        'GitHub': ['github'],
        'Stripe': ['stripe'],
        'Bolt': ['bolt.eu'],
        'Finnair': ['finnair']
    };

    for (const [main, keywords] of Object.entries(brands)) {
        if (keywords.some(k => m.includes(k))) {
            // Found a match!
            // If the merchant name IS just the brand (e.g. "Google"), allow it to be top level or same sub

            // Refine sub: if key logic is to split by "tier", usually "sub" is the full merchant string
            // unless we want to normalize that too. User said "bundled per how they are formed".
            // So "Google ADS 123" -> Main: Google, Sub: Google ADS 123
            return { main, sub: merchant };
        }
    }

    // Generic Fallback: Try to infer a parent group
    // 1. Split by comma (e.g. "650 INDUSTRIES (EXPO), USD 19..") -> "650 INDUSTRIES (EXPO)"
    let candidate = merchant.split(',')[0].trim();

    // 2. Remove common noise like "Kurssi", "Rate", "USD" if they appear at start (rare) or end
    // Also remove "Ab", "Oy", "Inc", "Ltd" for cleaner grouping? Maybe too aggressive.

    // 3. If candidate is still very long, it might be unique garbage, but usually comma helps.
    // Clean up trailing numbers or weird symbols
    candidate = candidate.replace(/\s+\d+.*$/, ''); // "Merchant 12345" -> "Merchant"

    if (candidate.length > 2 && candidate.length < merchant.length) {
        return { main: toTitleCase(candidate), sub: merchant };
    }

    return { main: merchant, sub: merchant };
}

function toTitleCase(str: string) {
    return str.replace(
        /\w\S*/g,
        text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
    );
}
