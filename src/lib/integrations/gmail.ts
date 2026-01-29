import { ReceiptRequest } from "../parser";
import { EmailCandidate } from "../matcher";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

interface GmailMessageList {
    messages?: { id: string; threadId: string }[];
    resultSizeEstimate: number;
}

interface GmailHeader {
    name: string;
    value: string;
}

interface GmailMessagePart {
    partId: string;
    mimeType: string;
    filename: string;
    headers: GmailHeader[];
    body: { size: number; attachmentId?: string; data?: string };
    parts?: GmailMessagePart[];
}

interface GmailMessage {
    id: string;
    threadId: string;
    labelIds: string[];
    snippet: string;
    payload: GmailMessagePart;
    internalDate: string;
}

// Helper to find headers like Subject, From
const getHeader = (headers: GmailHeader[], name: string): string => {
    return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";
};

// Recursive function to find parts with attachments or body
const extractAttachments = (parts: GmailMessagePart[]): { name: string; type: string; size: number; id: string }[] => {
    let attachments: { name: string; type: string; size: number; id?: string }[] = [];

    parts.forEach(part => {
        if (part.filename && part.body.attachmentId) {
            attachments.push({
                name: part.filename,
                type: part.mimeType,
                size: part.body.size,
                id: part.body.attachmentId
            });
        }
        if (part.parts) {
            const nested = extractAttachments(part.parts);
            attachments = attachments.concat(nested.filter(a => a.id));
        }
    });

    return attachments as { name: string; type: string; size: number; id: string }[];
};

// Minimal types for error handling
class GmailError extends Error {
    constructor(message: string, public code: number) {
        super(message);
    }
}

// Reusable base64url decoder
const decodeBase64Url = (str: string): string => {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    try {
        return atob(base64);
    } catch (e) {
        return "";
    }
};

const extractHtmlBody = (payload: GmailMessagePart): string => {
    if (payload.mimeType === "text/html" && payload.body.data) {
        const text = decodeBase64Url(payload.body.data);
        const bytes = new Uint8Array(text.length);
        for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    }
    if (payload.parts) {
        for (const part of payload.parts) {
            const found = extractHtmlBody(part);
            if (found) return found;
        }
    }
    return "";
};

const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 10000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
};

export const searchGmail = async (
    accessToken: string,
    requests: ReceiptRequest[],
    onProgress?: (msg: string) => void,
    onResult?: (candidate: EmailCandidate, req: ReceiptRequest) => Promise<void>
): Promise<EmailCandidate[]> => {
    const batchedResults: EmailCandidate[] = [];

    const fetchMessageDetails = async (id: string): Promise<EmailCandidate | null> => {
        try {
            const res = await fetchWithTimeout(`${GMAIL_API_BASE}/messages/${id}?format=full`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            if (!res.ok) return null;

            const msg: GmailMessage = await res.json();
            const subject = getHeader(msg.payload.headers, "Subject");
            const from = getHeader(msg.payload.headers, "From");
            const dateStr = getHeader(msg.payload.headers, "Date");
            const date = new Date(parseInt(msg.internalDate));

            const attachments = msg.payload.parts ? extractAttachments(msg.payload.parts) : [];
            if (msg.payload.filename && msg.payload.body.attachmentId) {
                attachments.push({
                    name: msg.payload.filename,
                    type: msg.payload.mimeType,
                    size: msg.payload.body.size,
                    id: msg.payload.body.attachmentId
                });
            }

            const bodyHtml = extractHtmlBody(msg.payload);

            return {
                id: msg.id,
                subject,
                sender: from,
                date,
                snippet: msg.snippet,
                bodyHtml: bodyHtml,
                hasAttachments: attachments.length > 0,
                attachments: attachments
            };
        } catch (e) {
            console.error("Gmail detail fetch error", e);
            return null;
        }
    };

    const processRequest = async (req: ReceiptRequest) => {
        const date = new Date(req.date);
        const start = new Date(date); start.setDate(date.getDate() - 5);
        const end = new Date(date); end.setDate(date.getDate() + 5);

        const after = start.toISOString().split("T")[0].replace(/-/g, "/");
        const before = end.toISOString().split("T")[0].replace(/-/g, "/");

        const q = `after:${after} before:${before} "${req.merchant}"`;
        console.log(`[Gmail] 🔍 Searching: ${req.merchant} (${after} - ${before})`);

        try {
            const listRes = await fetchWithTimeout(`${GMAIL_API_BASE}/messages?q=${encodeURIComponent(q)}&maxResults=50`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            }, 8000);

            if (!listRes.ok) return;

            const listData: GmailMessageList = await listRes.json();

            if (listData.messages) {
                const details = await Promise.all(listData.messages.map(m => fetchMessageDetails(m.id)));

                // Client-side Keyword Filter
                const requiredKeywords = ["receipt", "kuitti", "kvitto", "invoice", "lasku", "order", "tilaus"];

                for (const d of details) {
                    if (!d) continue;
                    const textToCheck = (d.subject + " " + d.snippet + " " + (d.bodyHtml || "")).toLowerCase();
                    const hasKeyword = requiredKeywords.some(k => textToCheck.includes(k));

                    if (hasKeyword) {
                        batchedResults.push(d);
                        if (onResult) {
                            await onResult(d, req);
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Gmail search error", e);
        }
    };

    const chunk = 5;
    for (let i = 0; i < requests.length; i += chunk) {
        const slice = requests.slice(i, i + chunk);
        if (onProgress && slice.length > 0) {
            onProgress(`Check ${i + 1}-${Math.min(i + chunk, requests.length)}/${requests.length}: ${slice[0].merchant}...`);
        }
        await Promise.all(slice.map(req => processRequest(req)));
    }

    const unique = new Map();
    batchedResults.forEach(r => unique.set(r.id, r));
    return Array.from(unique.values());
};

export const getGmailAttachment = async (accessToken: string, messageId: string, attachmentId: string): Promise<Blob | null> => {
    try {
        const res = await fetch(`${GMAIL_API_BASE}/messages/${messageId}/attachments/${attachmentId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!res.ok) return null;

        const data = await res.json();

        if (!data.data) {
            console.warn("Gmail attachment has no data field", data);
            return null;
        }

        // data.data is base64url encoded
        const base64 = data.data.replace(/-/g, '+').replace(/_/g, '/');

        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray]);
    } catch (e) {
        console.error("Attachment fetch failed", e);
        return null;
    }
};
