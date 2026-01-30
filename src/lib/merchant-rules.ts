export interface MerchantRule {
    name: string;
    keywords: string[];
    domains?: string[];
    dateFormat?: string;
}

export const MERCHANT_RULES: Record<string, MerchantRule> = {
    "uber": {
        name: "Uber",
        keywords: ["Trip", "Ride", "Driver", "Uber One", "Uber Eats"],
        domains: ["uber.com", "uber.com.br"]
    },
    "finnair": {
        name: "Finnair",
        keywords: ["Flight", "Ticket", "Booking Ref", "Matkustaja", "Lento", "Varausvahvistus", "E-ticket", "Eticket", "Receipt", "Kuitti", "Bokning"],
        domains: ["finnair.com", "finnair.fi", "email.finnair.com"]
    },
    "github": {
        name: "GitHub",
        keywords: ["Repository", "Actions", "Copilot", "Sponsor", "Git"],
        domains: ["github.com"]
    },
    "openai": {
        name: "OpenAI",
        keywords: ["API", "ChatGPT", "Token", "Subscription", "DALL·E"],
        domains: ["openai.com"]
    },
    "bolt": {
        name: "Bolt",
        keywords: ["Ride", "Trip", "Scooter", "Food", "Delivery"],
        domains: ["bolt.eu"]
    },
    "wolt": {
        name: "Wolt",
        keywords: ["Delivery", "Order", "Courier", "Kuljetus"],
        domains: ["wolt.com"]
    },
    "spotify": {
        name: "Spotify",
        keywords: ["Premium", "Music", "Individual", "Duo", "Family"],
        domains: ["spotify.com"]
    },
    "adobe": {
        name: "Adobe",
        keywords: ["Creative Cloud", "Acrobat", "Photoshop", "Lightroom", "Substance"],
        domains: ["adobe.com"]
    },
    "apple": {
        name: "Apple",
        keywords: ["App Store", "iTunes", "iCloud", "Subscription", "Apple Music"],
        domains: ["apple.com", "email.apple.com"]
    },
    "amazon": {
        name: "Amazon",
        keywords: ["Order", "Shipment", "Delivered", "Prime", "Marketplace"],
        domains: ["amazon.com", "amazon.de", "amazon.co.uk", "amazon.fr", "amazon.it", "amazon.es"]
    },
    "google": {
        name: "Google",
        keywords: ["Google Ads", "Google Cloud", "Workspace", "G Suite", "Play Console"],
        domains: ["google.com"]
    },
    "meta": {
        name: "Meta",
        keywords: ["Facebook Ads", "Instagram Ads", "Meta Ads", "Meta for Business"],
        domains: ["facebook.com", "meta.com"]
    },
    "linkedin": {
        name: "LinkedIn",
        keywords: ["Premium", "Sales Navigator", "Recruiter", "Learning"],
        domains: ["linkedin.com"]
    },
    "microsoft": {
        name: "Microsoft",
        keywords: ["Azure", "Microsoft 365", "Office 365", "Xbox", "OneDrive"],
        domains: ["microsoft.com"]
    },
    "slack": {
        name: "Slack",
        keywords: ["Workspace", "Pro", "Business+", "Enterprise"],
        domains: ["slack.com"]
    },
    "zoom": {
        name: "Zoom",
        keywords: ["Meeting", "Webinar", "Recording", "Pro", "Business"],
        domains: ["zoom.us"]
    },
    "vr": {
        name: "VR",
        keywords: ["Matkustaja", "Lippu", "Varaus", "Juna", "Pendolino", "InterCity", "Resenär", "Biljett", "Bokning", "Tåg", "Plats", "Matkalippu", "Kiitos", "Tilausvahvistus"],
        domains: ["vr.fi", "shop.vr.fi"]
    }
};

export const getMerchantRule = (merchantName: string): MerchantRule | undefined => {
    const lower = merchantName.toLowerCase();

    // Direct lookup
    if (MERCHANT_RULES[lower]) return MERCHANT_RULES[lower];

    // Partial lookup
    return Object.values(MERCHANT_RULES).find(r => lower.includes(r.name.toLowerCase()));
};
