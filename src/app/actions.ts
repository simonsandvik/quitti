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

    const { error } = await supabaseAdmin
        .from('matched_receipts')
        .insert({
            request_id: requestId,
            file_url: storagePath || 'N/A', // Store path if available
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
