import { ReceiptRequest } from "../parser";
import { EmailCandidate } from "../matcher";

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0/me";

interface GraphMessage {
    id: string;
    subject: string;
    from: { emailAddress: { name: string; address: string } };
    receivedDateTime: string;
    bodyPreview: string;
    hasAttachments: boolean;
    body?: { contentType: string; content: string };
}

interface GraphAttachment {
    id: string;
    "@odata.type": string;
    name: string;
    contentType: string;
    size: number;
    contentBytes?: string; // base64
}

interface GraphMessageList {
    value?: GraphMessage[];
}

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

export const searchOutlook = async (
    accessToken: string,
    requests: ReceiptRequest[],
    onProgress?: (msg: string) => void,
    onResult?: (candidate: EmailCandidate, req: ReceiptRequest) => Promise<void>
): Promise<EmailCandidate[]> => {
    const batchedResults: EmailCandidate[] = [];

    const fetchAttachments = async (id: string): Promise<{ name: string; type: string; size: number; id: string }[]> => {
        try {
            const res = await fetchWithTimeout(`${GRAPH_API_BASE}/messages/${id}/attachments?$select=id,name,contentType,size`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            if (!res.ok) {
                console.log(`[Outlook Debug] Failed to fetch attachments for ${id}: ${res.status}`);
                return [];
            }

            const data = await res.json();
            const atts = (data.value || []).map((a: any) => ({
                name: a.name,
                type: a.contentType,
                size: a.size,
                id: a.id
            }));
            console.log(`[Outlook Debug] Message ${id} has ${atts.length} attachments.`);
            return atts;
        } catch (e) {
            console.error("Outlook attachment list error", e);
            return [];
        }
    };

    const processRequest = async (req: ReceiptRequest) => {
        const date = new Date(req.date);
        const start = new Date(date); start.setDate(date.getDate() - 5);
        const end = new Date(date); end.setDate(date.getDate() + 5);

        const startStr = start.toISOString();
        const endStr = end.toISOString();

        // Date-only filter (server-side). Client-side will filter by merchant.
        // Note: `contains` filter fails with complex merchant names like "GOOGLE*ADS..."
        const filter = `receivedDateTime ge ${startStr} and receivedDateTime le ${endStr}`;

        try {
            const url = `${GRAPH_API_BASE}/messages?$filter=${encodeURIComponent(filter)}&$top=500&$select=id,subject,from,receivedDateTime,bodyPreview,hasAttachments,body`;

            const res = await fetchWithTimeout(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            }, 8000); // 8s timeout for search

            if (!res.ok) {
                console.log(`[Outlook Debug] Error ${res.status}: ${res.statusText}`);
                const errText = await res.text();
                console.log(`[Outlook Debug] Response Body: ${errText}`);
                return;
            }

            const data: GraphMessageList = await res.json();
            console.log(`[Outlook Debug] Found ${data.value?.length || 0} messages in date range for ${req.merchant}`);

            if (data.value) {
                // Client-side filtering
                const merchantLower = req.merchant.toLowerCase();
                const banned = new Set(["inc", "ltd", "gmbh", "usd", "eur", "the", "and", "for", "receipt", "payment", "subscription", "labs", "com", "www"]);
                const tokens = merchantLower.split(/[^a-z0-9]+/g).filter(t => t.length > 2 && !banned.has(t));
                const requiredKeywords = ["receipt", "kuitti", "kvitto", "invoice", "lasku", "order", "tilaus"];

                const relevantMessages = data.value.filter(msg => {
                    const subject = (msg.subject || "").toLowerCase();
                    const sender = (msg.from?.emailAddress?.address || "").toLowerCase();
                    const senderName = (msg.from?.emailAddress?.name || "").toLowerCase();
                    const bodyText = (msg.bodyPreview || "").toLowerCase();

                    // STRICTER MATCHING:
                    // 1. Merchant name MUST appear in Sender OR Subject.
                    // 2. We do NOT match purely on body content anymore (too many false positives like "Microsoft" in a reseller email).
                    const merchantMatch = tokens.some(token =>
                        subject.includes(token) || sender.includes(token) || senderName.includes(token)
                    );

                    if (!merchantMatch) return false;

                    const hasKeyword = requiredKeywords.some(k =>
                        subject.includes(k) || bodyText.includes(k)
                    );

                    return merchantMatch && hasKeyword;
                });

                console.log(`[Outlook Debug] ${relevantMessages.length} messages passed client-side filter for "${req.merchant}"`);

                for (const msg of relevantMessages) {
                    await new Promise(r => setTimeout(r, 100)); // Faster 100ms delay

                    let attachments: { name: string; type: string; size: number; id: string }[] = [];
                    if (msg.hasAttachments) {
                        try {
                            attachments = await fetchAttachments(msg.id);
                        } catch (err) {
                            console.log(`[Outlook Debug] Failed to fetch attachments for ${msg.id}`, err);
                        }
                    }

                    const candidate = {
                        id: msg.id,
                        subject: msg.subject,
                        sender: msg.from?.emailAddress?.address || "",
                        date: new Date(msg.receivedDateTime),
                        snippet: msg.bodyPreview,
                        bodyHtml: msg.body?.content,
                        hasAttachments: msg.hasAttachments,
                        attachments: attachments
                    };

                    batchedResults.push(candidate);

                    if (onResult) {
                        await onResult(candidate, req);
                    }
                }
            }

        } catch (e) {
            console.log("[Outlook Debug] CRITICAL SEARCH ERROR:", e);
        }
    };

    for (const [index, req] of requests.entries()) {
        onProgress?.(`Check ${index + 1}/${requests.length}: ${req.merchant}`);
        await processRequest(req);
        await new Promise(r => setTimeout(r, 200)); // Reduced delay
    }

    const unique = new Map();
    batchedResults.forEach(r => unique.set(r.id, r));
    const finalResults = Array.from(unique.values());
    console.log(`[Outlook Debug] Search complete. Returning ${finalResults.length} unique candidates.`);
    return finalResults;
};

export const getOutlookAttachment = async (accessToken: string, messageId: string, attachmentId: string): Promise<Blob | null> => {
    try {
        const res = await fetch(`${GRAPH_API_BASE}/messages/${messageId}/attachments/${attachmentId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!res.ok) return null;

        const data: GraphAttachment = await res.json();
        if (!data.contentBytes) return null;

        const base64 = data.contentBytes;
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray]);
    } catch (e) {
        console.error("Outlook attachment fetch failed", e);
        return null;
    }
};
