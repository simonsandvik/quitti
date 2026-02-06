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

    const requiredKeywords = [
        // English
        "receipt", "invoice", "order", "payment", "transaction", "billing",
        "charge", "subscription", "purchase", "confirmation", "statement",
        "booking", "ticket", "usage", "renewal", "summary", "alert",
        // Finnish
        "kuitti", "lasku", "tilaus", "maksu", "tilausvahvistus", "varaus", "lippu",
        // Swedish
        "kvitto", "faktura", "beställning", "betalning", "bokning", "biljett",
        // Norwegian/Danish
        "kvittering", "betaling", "bestilling"
    ];

    const banned = new Set(["inc", "ltd", "gmbh", "usd", "eur", "the", "and", "for", "receipt", "payment", "subscription", "labs", "com", "www"]);

    // --- Per-merchant parallel queries (like Gmail) ---
    // Each request gets its own focused API call with ±5 day date window.
    // This avoids the mega-group problem where overlapping windows chain
    // into year-spanning queries that exceed $top limits.

    const processRequest = async (req: ReceiptRequest) => {
        const date = new Date(req.date);
        const start = new Date(date); start.setDate(date.getDate() - 5);
        const end = new Date(date); end.setDate(date.getDate() + 5);

        const merchantLower = req.merchant.toLowerCase();
        // Allow 2-char tokens like "VR" but require word boundaries for matching
        const tokens = merchantLower.split(/[^a-z0-9]+/g).filter(t => t.length >= 2 && !banned.has(t));

        const filter = `receivedDateTime ge ${start.toISOString()} and receivedDateTime le ${end.toISOString()}`;

        try {
            // Microsoft Graph API often returns 400 when combining $search + $filter
            // Use $filter only (date range) and do merchant matching client-side
            // This is more reliable across all tenant configurations
            const url = `${GRAPH_API_BASE}/messages?$filter=${encodeURIComponent(filter)}&$top=200&$select=id,subject,from,receivedDateTime,bodyPreview,hasAttachments,body`;

            let res = await fetchWithTimeout(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            }, 15000);

            // Retry on 429 (rate limit) with exponential backoff
            if (res.status === 429) {
                const retryAfter = parseInt(res.headers.get('Retry-After') || '2', 10);
                console.log(`[Outlook] Rate limited for ${req.merchant}, waiting ${retryAfter}s...`);
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                res = await fetchWithTimeout(url, {
                    headers: { Authorization: `Bearer ${accessToken}` }
                }, 15000);
            }

            if (!res.ok) {
                console.log(`[Outlook] Search error for ${req.merchant}: ${res.status}`);
                return;
            }

            const data: GraphMessageList = await res.json();
            const messages = data.value || [];

            console.log(`[Outlook] ${req.merchant}: API returned ${messages.length} emails (tokens: ${tokens.join(", ")})`);

            for (const msg of messages) {
                const subject = (msg.subject || "").toLowerCase();
                const sender = (msg.from?.emailAddress?.address || "").toLowerCase();
                const senderName = (msg.from?.emailAddress?.name || "").toLowerCase();
                const bodyText = (msg.bodyPreview || "").toLowerCase();

                // Client-side merchant matching (check subject, sender, senderName, AND bodyPreview)
                const merchantMatch = tokens.some(token => {
                    if (token.length < 4) {
                        // Short tokens like "vr" need word boundary to avoid matching "over", "every"
                        const regex = new RegExp(`\\b${token}\\b`, 'i');
                        return regex.test(subject) || regex.test(sender) || regex.test(senderName) || regex.test(bodyText);
                    }
                    return subject.includes(token) || sender.includes(token) || senderName.includes(token) || bodyText.includes(token);
                });
                if (!merchantMatch) continue;

                // Keyword filter (bypass if email has attachments)
                const hasKeyword = requiredKeywords.some(k =>
                    subject.includes(k) || bodyText.includes(k)
                );
                if (!hasKeyword && !msg.hasAttachments) continue;

                // Fetch attachments
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
        } catch (e) {
            console.log(`[Outlook] Error searching for ${req.merchant}:`, e);
        }
    };

    // Process in parallel batches of 4 with delay to avoid 429 rate limiting
    const batchSize = 4;
    for (let i = 0; i < requests.length; i += batchSize) {
        const batch = requests.slice(i, i + batchSize);
        onProgress?.(`Check ${i + 1}-${Math.min(i + batchSize, requests.length)}/${requests.length}: ${batch[0].merchant}...`);
        await Promise.all(batch.map(req => processRequest(req)));

        // Small delay between batches to avoid rate limiting
        if (i + batchSize < requests.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }

    const unique = new Map();
    batchedResults.forEach(r => unique.set(r.id, r));
    const finalResults = Array.from(unique.values());
    console.log(`[Outlook Debug] Search complete. Returning ${finalResults.length} unique candidates.`);
    return finalResults;
};

export interface PdfAttachmentInfo {
    messageId: string;
    attachmentId: string;
    attachmentName: string;
    emailDate: Date;
}

export const searchOutlookForPdfs = async (
    accessToken: string,
    startDate: Date,
    endDate: Date,
    onProgress?: (msg: string) => void
): Promise<PdfAttachmentInfo[]> => {
    const results: PdfAttachmentInfo[] = [];

    // Build filter: hasAttachments AND date range
    const filter = `hasAttachments eq true and receivedDateTime ge ${startDate.toISOString()} and receivedDateTime le ${endDate.toISOString()}`;
    console.log(`[Outlook PDF Search] Filter: ${filter}`);

    onProgress?.(`Searching Outlook for PDFs...`);

    try {
        let nextLink: string | undefined = `${GRAPH_API_BASE}/messages?$filter=${encodeURIComponent(filter)}&$top=100&$select=id,receivedDateTime,hasAttachments`;

        let totalMessages = 0;

        while (nextLink) {
            const res = await fetchWithTimeout(nextLink, {
                headers: { Authorization: `Bearer ${accessToken}` }
            }, 15000);

            // Handle rate limiting
            if (res.status === 429) {
                const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
                console.log(`[Outlook PDF Search] Rate limited, waiting ${retryAfter}s...`);
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                continue;
            }

            if (!res.ok) {
                console.error(`[Outlook PDF Search] List failed: ${res.status}`);
                break;
            }

            const data = await res.json();
            const messages = data.value || [];
            totalMessages += messages.length;
            nextLink = data['@odata.nextLink'];

            console.log(`[Outlook PDF Search] Found ${messages.length} messages with attachments (total: ${totalMessages})`);

            // For each message, fetch attachments and filter for PDFs
            for (const msg of messages) {
                try {
                    const attRes = await fetchWithTimeout(
                        `${GRAPH_API_BASE}/messages/${msg.id}/attachments?$select=id,name,contentType,size`,
                        { headers: { Authorization: `Bearer ${accessToken}` } }
                    );

                    if (!attRes.ok) continue;

                    const attData = await attRes.json();
                    const attachments = attData.value || [];

                    for (const att of attachments) {
                        const isPdf = att.contentType?.toLowerCase().includes('pdf') ||
                            att.name?.toLowerCase().endsWith('.pdf');

                        if (isPdf) {
                            results.push({
                                messageId: msg.id,
                                attachmentId: att.id,
                                attachmentName: att.name,
                                emailDate: new Date(msg.receivedDateTime)
                            });
                        }
                    }
                } catch (e) {
                    console.error(`[Outlook PDF Search] Error fetching attachments for ${msg.id}`, e);
                }
            }

            onProgress?.(`Found ${results.length} PDFs...`);

            // Small delay to avoid rate limiting
            if (nextLink) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

    } catch (e) {
        console.error("[Outlook PDF Search] Search failed", e);
    }

    console.log(`[Outlook PDF Search] Complete. Found ${results.length} PDF attachments.`);
    return results;
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
