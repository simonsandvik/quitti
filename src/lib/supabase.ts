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

export async function createBatch(userId: string, name: string) {
    const { data, error } = await supabase
        .from('batches')
        .insert({
            created_by: userId,
            name: name,
            status: 'active'
        })
        .select()
        .single();

    if (error) throw error;
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

    const { error } = await supabase
        .from('receipt_requests')
        .insert(rows);

    if (error) throw error;
}

export async function updateMatchResult(requestId: string, match: MatchResult, userId: string) {
    const { error } = await supabase
        .from('matched_receipts')
        .insert({
            request_id: requestId,
            file_url: 'N/A', // Placeholder until file storage is added
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
