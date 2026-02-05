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

    // --- Group requests by overlapping date ranges to minimize API calls ---
    // Instead of 1 API call per merchant (N calls), merge overlapping ±5 day
    // windows into groups and fetch once per group (typically 3-5 calls).
    interface DateGroup {
        start: Date;
        end: Date;
        requests: ReceiptRequest[];
    }

    const sorted = [...requests].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const groups: DateGroup[] = [];

    for (const req of sorted) {
        const date = new Date(req.date);
        const start = new Date(date); start.setDate(date.getDate() - 5);
        const end = new Date(date); end.setDate(date.getDate() + 5);

        const lastGroup = groups[groups.length - 1];
        if (lastGroup && start.getTime() <= lastGroup.end.getTime()) {
            // Overlapping window — merge into existing group
            if (end.getTime() > lastGroup.end.getTime()) {
                lastGroup.end = end;
            }
            lastGroup.requests.push(req);
        } else {
            groups.push({ start, end, requests: [req] });
        }
    }

    console.log(`[Outlook] Grouped ${requests.length} requests into ${groups.length} date-range queries`);

    const requiredKeywords = [
        "receipt", "invoice", "order", "payment", "transaction", "billing",
        "charge", "subscription", "purchase", "confirmation", "statement",
        "kuitti", "lasku", "tilaus", "maksu", "tilausvahvistus",
        "kvitto", "faktura", "beställning", "betalning",
        "kvittering", "betaling", "bestilling"
    ];

    const banned = new Set(["inc", "ltd", "gmbh", "usd", "eur", "the", "and", "for", "receipt", "payment", "subscription", "labs", "com", "www"]);

    const processGroup = async (group: DateGroup, groupIndex: number) => {
        const filter = `receivedDateTime ge ${group.start.toISOString()} and receivedDateTime le ${group.end.toISOString()}`;

        try {
            const url = `${GRAPH_API_BASE}/messages?$filter=${encodeURIComponent(filter)}&$top=200&$select=id,subject,from,receivedDateTime,bodyPreview,hasAttachments,body`;

            const res = await fetchWithTimeout(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            }, 10000);

            if (!res.ok) {
                console.log(`[Outlook] Group ${groupIndex + 1} error: ${res.status}`);
                return;
            }

            const data: GraphMessageList = await res.json();
            const messages = data.value || [];
            console.log(`[Outlook] Group ${groupIndex + 1}: ${messages.length} emails, ${group.requests.length} merchants`);

            // Match each message against ALL merchants in this group
            for (const msg of messages) {
                const subject = (msg.subject || "").toLowerCase();
                const sender = (msg.from?.emailAddress?.address || "").toLowerCase();
                const senderName = (msg.from?.emailAddress?.name || "").toLowerCase();
                const bodyText = (msg.bodyPreview || "").toLowerCase();

                // Find which requests this message matches
                for (const req of group.requests) {
                    const merchantLower = req.merchant.toLowerCase();
                    const tokens = merchantLower.split(/[^a-z0-9]+/g).filter(t => t.length > 2 && !banned.has(t));

                    const merchantMatch = tokens.some(token =>
                        subject.includes(token) || sender.includes(token) || senderName.includes(token)
                    );
                    if (!merchantMatch) continue;

                    const hasKeyword = requiredKeywords.some(k =>
                        subject.includes(k) || bodyText.includes(k)
                    );
                    if (!hasKeyword && !msg.hasAttachments) continue;

                    // This message matches this merchant — fetch attachments and emit
                    let attachments: { name: string; type: string; size: number; id: string }[] = [];
                    if (msg.hasAttachments) {
                        try {
                            attachments = await fetchAttachments(msg.id);
                        } catch (err) {
                            console.log(`[Outlook] Failed to fetch attachments for ${msg.id}`, err);
                        }
                    }

                    const candidate: EmailCandidate = {
                        id: msg.id,
                        subject: msg.subject,
                        sender: msg.from?.emailAddress?.address || "",
                        date: new Date(msg.receivedDateTime),
                        snippet: msg.bodyPreview,
                        bodyHtml: msg.body?.content,
                        hasAttachments: msg.hasAttachments,
                        attachments
                    };

                    batchedResults.push(candidate);

                    if (onResult) {
                        await onResult(candidate, req);
                    }
                }
            }
        } catch (e) {
            console.log(`[Outlook] Group ${groupIndex + 1} CRITICAL ERROR:`, e);
        }
    };

    // Process groups in parallel batches of 4
    const groupBatchSize = 4;
    for (let i = 0; i < groups.length; i += groupBatchSize) {
        const batch = groups.slice(i, i + groupBatchSize);
        onProgress?.(`Check ${Math.min(i + groupBatchSize, groups.length)}/${groups.length} date ranges...`);
        await Promise.all(batch.map((g, j) => processGroup(g, i + j)));
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
