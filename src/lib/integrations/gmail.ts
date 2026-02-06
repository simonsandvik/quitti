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
                const requiredKeywords = [
                    // English
                    "receipt", "invoice", "order", "payment", "transaction", "billing",
                    "charge", "subscription", "purchase", "confirmation", "statement",
                    // Finnish
                    "kuitti", "lasku", "tilaus", "maksu", "tilausvahvistus",
                    // Swedish
                    "kvitto", "faktura", "beställning", "betalning",
                    // Norwegian/Danish
                    "kvittering", "betaling", "bestilling"
                ];

                for (const d of details) {
                    if (!d) continue;
                    const textToCheck = (d.subject + " " + d.snippet + " " + (d.bodyHtml || "")).toLowerCase();
                    const hasKeyword = requiredKeywords.some(k => textToCheck.includes(k));

                    // Bypass keyword filter if email has a PDF attachment
                    const hasPdfAttachment = d.attachments?.some(a =>
                        a.type?.toLowerCase().includes("pdf") || a.name?.toLowerCase().endsWith(".pdf")
                    );

                    if (hasKeyword || hasPdfAttachment) {
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

    const chunk = 10;
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

export interface PdfAttachmentInfo {
    messageId: string;
    attachmentId: string;
    attachmentName: string;
    emailDate: Date;
}

export const searchGmailForPdfs = async (
    accessToken: string,
    startDate: Date,
    endDate: Date,
    onProgress?: (msg: string) => void
): Promise<PdfAttachmentInfo[]> => {
    const results: PdfAttachmentInfo[] = [];

    // Format dates for Gmail query
    const after = startDate.toISOString().split("T")[0].replace(/-/g, "/");
    const before = endDate.toISOString().split("T")[0].replace(/-/g, "/");

    // Search for emails with PDF attachments in date range
    const q = `has:attachment filename:pdf after:${after} before:${before}`;
    console.log(`[Gmail PDF Search] Query: ${q}`);

    onProgress?.(`Searching Gmail for PDFs...`);

    try {
        // Fetch message list (paginated)
        let pageToken: string | undefined;
        let totalMessages = 0;

        do {
            const url = `${GMAIL_API_BASE}/messages?q=${encodeURIComponent(q)}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ''}`;
            const listRes = await fetchWithTimeout(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            }, 15000);

            if (!listRes.ok) {
                console.error(`[Gmail PDF Search] List failed: ${listRes.status}`);
                break;
            }

            const listData = await listRes.json();
            const messages = listData.messages || [];
            totalMessages += messages.length;
            pageToken = listData.nextPageToken;

            console.log(`[Gmail PDF Search] Found ${messages.length} messages (total: ${totalMessages})`);

            // Fetch details for each message to get attachment info
            for (const msg of messages) {
                try {
                    const detailRes = await fetchWithTimeout(
                        `${GMAIL_API_BASE}/messages/${msg.id}?format=metadata&metadataHeaders=Date`,
                        { headers: { Authorization: `Bearer ${accessToken}` } }
                    );

                    if (!detailRes.ok) continue;

                    const detail = await detailRes.json();
                    const dateHeader = detail.payload?.headers?.find((h: any) => h.name === "Date")?.value;
                    const emailDate = dateHeader ? new Date(dateHeader) : new Date(parseInt(detail.internalDate));

                    // Fetch attachment list
                    const attRes = await fetchWithTimeout(
                        `${GMAIL_API_BASE}/messages/${msg.id}?format=full`,
                        { headers: { Authorization: `Bearer ${accessToken}` } }
                    );

                    if (!attRes.ok) continue;

                    const fullMsg = await attRes.json();
                    const attachments = extractAttachmentsFromPayload(fullMsg.payload);

                    for (const att of attachments) {
                        if (att.name.toLowerCase().endsWith('.pdf') || att.type.toLowerCase().includes('pdf')) {
                            results.push({
                                messageId: msg.id,
                                attachmentId: att.id,
                                attachmentName: att.name,
                                emailDate
                            });
                        }
                    }
                } catch (e) {
                    console.error(`[Gmail PDF Search] Error processing message ${msg.id}`, e);
                }
            }

            onProgress?.(`Found ${results.length} PDFs...`);
        } while (pageToken);

    } catch (e) {
        console.error("[Gmail PDF Search] Search failed", e);
    }

    console.log(`[Gmail PDF Search] Complete. Found ${results.length} PDF attachments.`);
    return results;
};

// Helper to extract attachments from Gmail payload (recursive)
const extractAttachmentsFromPayload = (payload: any): { name: string; type: string; id: string }[] => {
    const attachments: { name: string; type: string; id: string }[] = [];

    if (payload.filename && payload.body?.attachmentId) {
        attachments.push({
            name: payload.filename,
            type: payload.mimeType,
            id: payload.body.attachmentId
        });
    }

    if (payload.parts) {
        for (const part of payload.parts) {
            attachments.push(...extractAttachmentsFromPayload(part));
        }
    }

    return attachments;
};

export const getGmailAttachment = async (accessToken: string, messageId: string, attachmentId: string): Promise<Blob | null> => {
    try {
        console.log(`[Gmail Attach] Fetching attachment: ${attachmentId} from message: ${messageId}`);

        const res = await fetch(`${GMAIL_API_BASE}/messages/${messageId}/attachments/${attachmentId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!res.ok) {
            console.error(`[Gmail Attach] HTTP Error: ${res.status} ${res.statusText}`);
            return null;
        }

        const data = await res.json();

        if (!data.data) {
            console.warn("[Gmail Attach] Response has no 'data' field:", data);
            return null;
        }

        console.log(`[Gmail Attach] Raw base64url data length: ${data.data.length} chars`);

        if (data.data.length < 100) {
            console.error("[Gmail Attach] CRITICAL: Data too short, likely corrupt or empty");
            return null;
        }

        // Convert base64url to standard base64
        let base64 = data.data.replace(/-/g, '+').replace(/_/g, '/');

        // Add proper padding if needed
        while (base64.length % 4 !== 0) {
            base64 += '=';
        }

        // Use Uint8Array directly for binary data
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        console.log(`[Gmail Attach] Decoded to ${bytes.length} bytes`);

        if (bytes.length < 100) {
            console.error("[Gmail Attach] CRITICAL: Decoded bytes too small, file is likely corrupt");
            return null;
        }

        // Check for PDF magic bytes (optional validation)
        const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
        console.log(`[Gmail Attach] Is PDF: ${isPdf}`);

        const blob = new Blob([bytes], { type: isPdf ? 'application/pdf' : 'application/octet-stream' });
        console.log(`[Gmail Attach] Created Blob: ${blob.size} bytes, type: ${blob.type}`);

        return blob;
    } catch (e) {
        console.error("[Gmail Attach] Failed to fetch/decode attachment:", e);
        return null;
    }
};
