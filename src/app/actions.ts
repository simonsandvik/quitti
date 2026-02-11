'use server'

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export async function uploadReceiptServerAction(formData: FormData) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        throw new Error("Unauthorized");
    }

    const file = formData.get("file") as File;
    const receiptId = formData.get("receiptId") as string;
    const userId = (session.user as any).id;

    if (!file || !receiptId || !userId) {
        throw new Error("Missing required fields");
    }

    console.log(`[Upload Action] Received file: ${file.name}, Size: ${file.size} bytes, Type: ${file.type}`);

    if (file.size < 1000) {
        console.error(`[Upload Action] CRITICAL: File is suspiciously small (${file.size} bytes)!`);
    }

    const ext = file.name.split('.').pop();
    const path = `${userId}/${receiptId}.${ext}`;

    const supabaseAdmin = getSupabaseAdmin();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`[Upload Action] Buffer size: ${buffer.length} bytes`);

    const { data, error } = await supabaseAdmin.storage
        .from('receipts')
        .upload(path, buffer, {
            contentType: file.type || 'application/pdf',
            upsert: true
        });

    if (error) {
        console.error("[Upload Action] Upload Error:", error);
        throw new Error(error.message);
    }

    console.log(`[Upload Action] Success: ${path}`);
    return path;
}

export async function updateMatchResultServerAction(
    requestId: string,
    match: any, // Using any for simplicity in action transition, ideally duplicate MatchResult type
    storagePath?: string
) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        throw new Error("Unauthorized");
    }
    const userId = (session.user as any).id;

    console.log(`[Action] Saving match result: RequestID=${requestId}, UserID=${userId}, Path=${storagePath}`);
    if (match.matchedHtml) console.log(`[Action] Persisting matched HTML (${match.matchedHtml.length} chars)`);
    if (match.matchedData) console.log(`[Action] Persisting matched data object`);

    const supabaseAdmin = getSupabaseAdmin();

    // Delete any existing match for this request (avoids unique constraint issues)
    await supabaseAdmin
        .from('matched_receipts')
        .delete()
        .eq('request_id', requestId);

    const { error } = await supabaseAdmin
        .from('matched_receipts')
        .insert({
            request_id: requestId,
            file_url: storagePath || 'N/A',
            matched_by: userId,
            confidence: match.confidence,
            details: match.details,
            matched_html: match.matchedHtml,
            matched_data: match.matchedData
        });

    if (error) {
        console.error("Server Action DB Error:", JSON.stringify(error), "Payload:", { requestId, userId, storagePath });
        throw error;
    }

    // Also update the request status
    await supabaseAdmin
        .from('receipt_requests')
        .update({ status: match.status.toLowerCase() === 'found' ? 'found' : 'pending' })
        .eq('id', requestId);

    return true;
}

export async function getSignedUrlServerAction(path: string) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        throw new Error("Unauthorized");
    }
    const userId = (session.user as any).id;

    // Security check: Ensure the path belongs to the logged-in user
    if (!path.startsWith(`${userId}/`)) {
        throw new Error("Forbidden: You do not have access to this file.");
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Create signed URL for INLINE viewing (no download header)
    const { data, error } = await supabaseAdmin.storage
        .from('receipts')
        .createSignedUrl(path, 300);

    if (error) {
        console.error("Failed to create signed URL:", error);
        throw error;
    }

    return data.signedUrl;
}

export async function deleteBatchServerAction(batchId: string) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        throw new Error("Unauthorized");
    }
    const userId = (session.user as any).id;

    const supabaseAdmin = getSupabaseAdmin();

    // Verify ownership
    const { data: batch, error: fetchError } = await supabaseAdmin
        .from('batches')
        .select('created_by')
        .eq('id', batchId)
        .single();

    if (fetchError || batch?.created_by !== userId) {
        throw new Error("Unauthorized access to batch");
    }

    // Delete in order to satisfy FK constraints if not cascading
    // First matched_receipts
    const { data: requests } = await supabaseAdmin
        .from('receipt_requests')
        .select('id')
        .eq('batch_id', batchId);

    if (requests && requests.length > 0) {
        const requestIds = requests.map(r => r.id);
        await supabaseAdmin
            .from('matched_receipts')
            .delete()
            .in('request_id', requestIds);

        await supabaseAdmin
            .from('receipt_requests')
            .delete()
            .in('id', requestIds);
    }

    // Finally delete the batch
    const { error: deleteError } = await supabaseAdmin
        .from('batches')
        .delete()
        .eq('id', batchId);

    if (deleteError) {
        console.error("Delete Batch Error:", deleteError);
        throw deleteError;
    }

    return true;
}

export async function uploadExportZipServerAction(formData: FormData) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        throw new Error("Unauthorized");
    }
    const userId = (session.user as any).id;
    const file = formData.get("file") as File;

    if (!file) throw new Error("No file uploaded");

    const supabaseAdmin = getSupabaseAdmin();
    // Use a temp path
    const path = `exports/${userId}/receipts_hunted_${Date.now()}.zip`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error } = await supabaseAdmin.storage
        .from('receipts') // Re-using receipts bucket
        .upload(path, buffer, {
            contentType: 'application/zip',
            upsert: true
        });

    if (error) {
        console.error("Zip Upload Error:", error);
        throw error;
    }

    return path;
}

export async function getDownloadUrlServerAction(path: string, filename: string) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        throw new Error("Unauthorized");
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin.storage
        .from('receipts')
        .createSignedUrl(path, 60, { // 60 seconds valid is enough
            download: filename // THIS forces the filename header
        });

    if (error) {
        console.error("Signed URL Error:", error);
        throw error;
    }

    return data.signedUrl;
}

export async function checkLLMAvailableAction(): Promise<boolean> {
    return !!process.env.ANTHROPIC_API_KEY;
}

export async function verifyReceiptWithLLMAction(
    pdfText: string,
    candidates: { id: string; amount: number; date: string; merchant: string; currency: string }[],
    emailMeta?: { subject: string; sender: string; filename: string }
): Promise<{ matchId: string | null; confidence: number; reasoning: string }> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return { matchId: null, confidence: 0, reasoning: "No ANTHROPIC_API_KEY configured" };
    }

    const text = pdfText.slice(0, 4000);

    const candidateList = candidates.map((c, i) =>
        `${i + 1}. Amount: ${c.amount} ${c.currency}, Date: ${c.date}, Merchant: "${c.merchant}"`
    ).join('\n');

    const emailMetaSection = emailMeta
        ? `\nEmail metadata (the email this PDF was attached to):
- Subject: "${emailMeta.subject}"
- Sender: ${emailMeta.sender}
- Filename: ${emailMeta.filename}\n`
        : '';

    const prompt = `You are a receipt-matching assistant. Given text extracted from a PDF document, determine if it is a receipt or invoice for any of the listed credit card transactions.

Consider:
- Amounts may appear in different formats (123.45 or 123,45 or 1 234,56)
- Dates can be in any format and may differ by up to 5 days from the transaction date
- Merchant/company names on receipts often differ from credit card statement names (e.g. "Finnair OYJ" on receipt vs "FINNAIR, Helsinki" on statement, or "Stape Ltd" vs "STAPE OY")
- The PDF might be a receipt, invoice, booking confirmation, e-ticket, or similar proof of purchase
- The email metadata (subject, sender) can help identify the merchant
${emailMetaSection}
IMPORTANT: If this PDF is clearly NOT a receipt, invoice, or proof of purchase (e.g., it's a report, contract, newsletter, presentation, or marketing material), reply with match: null regardless of any amount matches.

PDF Text:
"""
${text}
"""

Transactions to match against:
${candidateList}

Reply ONLY with JSON (no markdown, no code blocks):
{"match": 1, "confidence": 85, "reasoning": "Brief explanation"}

If no transaction matches, reply:
{"match": null, "confidence": 0, "reasoning": "Brief explanation of what the PDF is"}`;

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 300,
                messages: [{ role: 'user', content: prompt }]
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`[LLM] API error ${response.status}: ${errText}`);
            return { matchId: null, confidence: 0, reasoning: `API error: ${response.status}` };
        }

        const data = await response.json();
        const content = data.content?.[0]?.text || '';

        // Parse JSON from response (handle potential markdown wrapping)
        const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const result = JSON.parse(jsonStr);

        if (result.match !== null && result.match >= 1 && result.match <= candidates.length) {
            const matchedCandidate = candidates[result.match - 1];
            return {
                matchId: matchedCandidate.id,
                confidence: result.confidence || 80,
                reasoning: result.reasoning || 'LLM match'
            };
        }

        return { matchId: null, confidence: 0, reasoning: result.reasoning || 'No match' };
    } catch (e) {
        console.error('[LLM] Verification failed:', e);
        return { matchId: null, confidence: 0, reasoning: `Error: ${e}` };
    }
}

export async function verifyMatchGroupAction(
    matchGroup: {
        receiptId: string;
        merchant: string;
        amount: number;
        date: string;
        currency: string;
        pdfText: string;
        emailSubject?: string;
    }[]
): Promise<{
    verified: boolean;
    reassignments: { receiptId: string; shouldMatchTo: string }[];
    reasoning: string;
}> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return { verified: true, reassignments: [], reasoning: "No API key, skipping verification" };
    }

    // Build the verification prompt
    const items = matchGroup.map((m, i) =>
        `${i + 1}. Transaction "${m.receiptId}": ${m.amount} ${m.currency}, Date: ${m.date}\n   Receipt text (first 1500 chars): "${m.pdfText.slice(0, 1500)}"\n   Email subject: "${m.emailSubject || 'N/A'}"`
    ).join('\n\n');

    const prompt = `You are verifying that receipts are correctly paired with their transactions.
All ${matchGroup.length} items below are from the same merchant "${matchGroup[0].merchant}".
Each has a transaction (amount + date) and the matched receipt text.

Verify that each receipt is paired with the CORRECT transaction based on:
- The amount in the receipt text should match the transaction amount
- The date in the receipt text should be close to the transaction date
- Invoice numbers, order IDs, etc. should be consistent

Items:
${items}

Reply ONLY with JSON (no markdown, no code blocks):
If all pairings are correct:
{"verified": true, "reassignments": [], "reasoning": "Brief explanation"}

If any are swapped (receipt A matched to transaction B when it should be transaction C):
{"verified": false, "reassignments": [{"receiptId": "current_receipt_id", "shouldMatchTo": "correct_receipt_id"}], "reasoning": "Brief explanation of what's wrong"}`;

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 500,
                messages: [{ role: 'user', content: prompt }]
            })
        });

        if (!response.ok) {
            console.error(`[LLM Verify] API error ${response.status}`);
            return { verified: true, reassignments: [], reasoning: `API error: ${response.status}` };
        }

        const data = await response.json();
        const content = data.content?.[0]?.text || '';
        const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const result = JSON.parse(jsonStr);

        return {
            verified: result.verified ?? true,
            reassignments: result.reassignments || [],
            reasoning: result.reasoning || 'Verified'
        };
    } catch (e) {
        console.error('[LLM Verify] Verification failed:', e);
        return { verified: true, reassignments: [], reasoning: `Error: ${e}` };
    }
}

// --- DATA LOADING (replaces anon-key client reads) ---

export async function loadLatestBatchAction() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return null;
    const userId = (session.user as any).id;

    const supabaseAdmin = getSupabaseAdmin();
    const { data: batches } = await supabaseAdmin
        .from('batches')
        .select('*')
        .eq('created_by', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);

    if (!batches || batches.length === 0) return null;
    return batches[0];
}

export async function loadBatchRequestsAction(batchId: string) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) throw new Error("Unauthorized");

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
        .from('receipt_requests')
        .select(`
            *,
            matched_receipts (*)
        `)
        .eq('batch_id', batchId);

    if (error) throw error;
    return data || [];
}

export async function createBatchAction(name: string, organizationId?: string) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) throw new Error("Unauthorized");
    const userId = (session.user as any).id;

    const supabaseAdmin = getSupabaseAdmin();
    let targetOrgId = organizationId;

    if (!targetOrgId) {
        const { data: members } = await supabaseAdmin
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', userId)
            .limit(1);

        if (members && members.length > 0) {
            targetOrgId = members[0].organization_id;
        } else {
            const { data: newOrg, error: orgError } = await supabaseAdmin
                .from('organizations')
                .insert({ name: 'My Personal Team' })
                .select()
                .single();

            if (newOrg && !orgError) {
                targetOrgId = newOrg.id;
                await supabaseAdmin.from('organization_members').insert({
                    organization_id: newOrg.id,
                    user_id: userId,
                    role: 'admin'
                });
            }
        }
    }

    const { data, error } = await supabaseAdmin
        .from('batches')
        .insert({
            created_by: userId,
            name,
            organization_id: targetOrgId,
            status: 'active'
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function saveReceiptRequestsAction(
    batchId: string,
    requests: { id: string; merchant: string; amount: number; currency: string; date: string; status?: string }[]
) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) throw new Error("Unauthorized");

    const supabaseAdmin = getSupabaseAdmin();
    const rows = requests.map(r => ({
        id: r.id,
        batch_id: batchId,
        merchant: r.merchant,
        amount: r.amount,
        currency: r.currency || 'EUR',
        date: r.date,
        status: r.status || 'pending',
    }));

    const { error } = await supabaseAdmin
        .from('receipt_requests')
        .upsert(rows);

    if (error) throw error;
}

export async function removeMatchResultAction(requestId: string) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) throw new Error("Unauthorized");

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin
        .from('matched_receipts')
        .delete()
        .eq('request_id', requestId);

    if (error) throw error;

    await supabaseAdmin
        .from('receipt_requests')
        .update({ status: 'pending' })
        .eq('id', requestId);
}

export async function uploadAndSaveReceiptAction(formData: FormData) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) throw new Error("Unauthorized");
    const userId = (session.user as any).id;

    const file = formData.get("file") as File;
    const receiptId = formData.get("receiptId") as string;
    if (!file || !receiptId) throw new Error("Missing required fields");

    const supabaseAdmin = getSupabaseAdmin();

    // Upload file
    const ext = file.name.split('.').pop();
    const path = `${userId}/${receiptId}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabaseAdmin.storage
        .from('receipts')
        .upload(path, buffer, {
            contentType: file.type || 'application/pdf',
            upsert: true
        });
    if (uploadError) throw uploadError;

    // Save match result
    await supabaseAdmin
        .from('matched_receipts')
        .delete()
        .eq('request_id', receiptId);

    const { error: matchError } = await supabaseAdmin
        .from('matched_receipts')
        .insert({
            request_id: receiptId,
            file_url: path,
            matched_by: userId,
            confidence: 100,
            details: `Manual Upload (Drag & Drop) - ${file.name}`
        });
    if (matchError) throw matchError;

    await supabaseAdmin
        .from('receipt_requests')
        .update({ status: 'found' })
        .eq('id', receiptId);

    return path;
}

export async function markAsTrulyMissingServerAction(requestId: string, reason: string) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        throw new Error("Unauthorized");
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { error } = await supabaseAdmin
        .from('receipt_requests')
        .update({
            is_truly_missing: true,
            missing_reason: reason,
            status: 'missing' // Ensure status is synced
        })
        .eq('id', requestId);

    if (error) {
        console.error("[Action] Mark Truly Missing Error:", error);
        throw error;
    }

    revalidatePath("/");
}
