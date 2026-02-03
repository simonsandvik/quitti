import { createClient } from '@supabase/supabase-js';
import { ReceiptRequest } from './parser';
import { MatchResult } from './matcher';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Basic client for client-side queries (honors RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper for server-side / admin tasks if needed (using service role)
export const getSupabaseAdmin = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );
};

/**
 * DATABASE PERSISTENCE HELPERS
 */

/**
 * STORAGE HELPERS
 */

export async function uploadReceiptFile(userId: string, receiptId: string, file: File) {
    const ext = file.name.split('.').pop();
    const path = `${userId}/${receiptId}.${ext}`;

    console.log(`[Upload Debug] Starting upload: ${file.name}, Size: ${file.size} bytes, Type: ${file.type}`);

    if (file.size === 0) {
        console.error(`[Upload Debug] CRITICAL: File is empty! Not uploading.`);
        throw new Error("Cannot upload empty file");
    }

    const { data, error } = await supabase.storage
        .from('receipts')
        .upload(path, file, {
            upsert: true,
            contentType: file.type || 'application/pdf' // Ensure MIME type is set
        });

    if (error) {
        console.error(`[Upload Debug] Upload failed:`, error);
        throw error;
    }

    console.log(`[Upload Debug] Upload successful: ${path}`);
    return path;
}

export async function createSignedUrl(path: string) {
    // Generate a signed URL valid for 1 hour
    const { data, error } = await supabase.storage
        .from('receipts')
        .createSignedUrl(path, 3600);

    if (error) throw error;
    return data.signedUrl;
}

/**
 * DATABASE PERSISTENCE HELPERS
 */

export async function createBatch(userId: string, name: string, organizationId?: string) {
    let targetOrgId = organizationId;

    // 1. If no Org ID provided, find the user's primary organization
    if (!targetOrgId) {
        const { data: members } = await supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', userId)
            .limit(1);

        if (members && members.length > 0) {
            targetOrgId = members[0].organization_id;
        } else {
            // 2. If user has NO organization, create a "Personal Team" strictly for them
            // This happens on first run for new users
            const { data: newOrg, error: orgError } = await supabase
                .from('organizations')
                .insert({ name: 'My Personal Team' })
                .select()
                .single();

            if (newOrg && !orgError) {
                targetOrgId = newOrg.id;
                // Add them as Admin
                await supabase.from('organization_members').insert({
                    organization_id: newOrg.id,
                    user_id: userId,
                    role: 'admin'
                });
            }
        }
    }

    const { data, error } = await supabase
        .from('batches')
        .insert({
            created_by: userId,
            name: name,
            organization_id: targetOrgId, // Link batch to Org
            status: 'active'
        })
        .select()
        .single();

    if (error) {
        console.error("[Supabase] createBatch Error:", error);
        throw error;
    }
    console.log(`[Supabase] Created batch ${data.id} for user ${userId}`);
    return data;
}

export async function saveReceiptRequests(batchId: string, requests: ReceiptRequest[]) {
    const rows = requests.map(r => ({
        id: r.id, // Use the client-side UUID
        batch_id: batchId,
        merchant: r.merchant,
        amount: r.amount,
        currency: r.currency || 'EUR',
        date: r.date,
        status: r.status || 'pending',
    }));

    console.log(`[Supabase] Upserting ${rows.length} receipts for batch ${batchId}. First ID: ${rows[0]?.id}`);
    const { error } = await supabase
        .from('receipt_requests')
        .upsert(rows);

    if (error) {
        console.error("[Supabase] Upsert Error:", error);
        throw error;
    }
}

export async function updateMatchResult(requestId: string, match: MatchResult, userId: string, storagePath?: string) {
    const { error } = await supabase
        .from('matched_receipts')
        .insert({
            request_id: requestId,
            file_url: storagePath || 'N/A', // Store path if available
            matched_by: userId,
            confidence: match.confidence,
            details: match.details
        });

    if (error) throw error;

    // Also update the request status
    await supabase
        .from('receipt_requests')
        .update({ status: match.status.toLowerCase() === 'found' ? 'found' : 'pending' })
        .eq('id', requestId);
}

export async function getUserBatches(userId: string) {
    const { data, error } = await supabase
        .from('batches')
        .select('*')
        .eq('created_by', userId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
}

export async function getBatchResults(batchId: string) {
    const { data, error } = await supabase
        .from('receipt_requests')
        .select(`
            *,
            matched_receipts (*)
        `)
        .eq('batch_id', batchId);

    if (error) throw error;
    return data;
}

/**
 * ADMIN FUNCTIONS
 */

export async function getAllUsers() {
    const adminClient = getSupabaseAdmin();
    // next_auth schema is tricky with RLS, so we use service role to read next_auth.users
    const { data, error } = await adminClient
        .schema('next_auth')
        .from('users')
        .select('*')
        .order('name', { ascending: true });

    if (error) throw error;
    return data;
}

export async function getAdminStats() {
    const adminClient = getSupabaseAdmin();

    const { count: usersCount } = await adminClient.schema('next_auth').from('users').select('*', { count: 'exact', head: true });
    const { count: batchCount } = await adminClient.from('batches').select('*', { count: 'exact', head: true });
    const { count: receiptsCount } = await adminClient.from('receipt_requests').select('*', { count: 'exact', head: true });
    const { count: foundCount } = await adminClient.from('receipt_requests').select('*', { count: 'exact', head: true }).eq('status', 'found');

    return {
        users: usersCount || 0,
        batches: batchCount || 0,
        receipts: receiptsCount || 0,
        found: foundCount || 0
    };
}

export async function getRecentBatches() {
    const adminClient = getSupabaseAdmin();
    const { data, error } = await adminClient
        .from('batches')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) throw error;
    return data;
}
