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
    candidates: { id: string; amount: number; date: string; merchant: string; currency: string }[]
): Promise<{ matchId: string | null; confidence: number; reasoning: string }> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return { matchId: null, confidence: 0, reasoning: "No ANTHROPIC_API_KEY configured" };
    }

    const text = pdfText.slice(0, 4000);

    const candidateList = candidates.map((c, i) =>
        `${i + 1}. Amount: ${c.amount} ${c.currency}, Date: ${c.date}, Merchant: "${c.merchant}"`
    ).join('\n');

    const prompt = `You are a receipt-matching assistant. Given text extracted from a PDF document, determine if it is a receipt or invoice for any of the listed credit card transactions.

Consider:
- Amounts may appear in different formats (123.45 or 123,45 or 1 234,56)
- Dates can be in any format and may differ by up to 5 days from the transaction date
- Merchant/company names on receipts often differ from credit card statement names (e.g. "Finnair OYJ" on receipt vs "FINNAIR, Helsinki" on statement, or "Stape Ltd" vs "STAPE OY")
- The PDF might be a receipt, invoice, booking confirmation, e-ticket, or similar proof of purchase

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
                max_tokens: 200,
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
