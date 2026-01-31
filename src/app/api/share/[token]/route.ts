import { getSupabaseAdmin, createSignedUrl } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function GET(req: Request, props: { params: Promise<{ token: string }> }) {
    const params = await props.params;
    const admin = getSupabaseAdmin();
    const token = params.token;

    try {
        // 1. Validate Token & Fetch Share Record
        const { data: share, error: shareError } = await admin
            .from("report_shares")
            .select("*")
            .eq("token", token)
            .single();

        if (shareError || !share) {
            return NextResponse.json({ error: "Report not found" }, { status: 404 });
        }

        // Check expiry
        if (new Date(share.expires_at) < new Date()) {
            return NextResponse.json({ error: "Report link expired" }, { status: 410 });
        }

        // 2. Increment View Count (Fire & Forget)
        await admin
            .from("report_shares")
            .update({ views: (share.views || 0) + 1 })
            .eq("id", share.id);

        // 3. Fetch User Info
        // Note: accessing "next_auth.users" via schema helper
        const { data: user } = await admin
            .schema('next_auth')
            .from("users")
            .select("name, email, image")
            .eq("id", share.user_id)
            .single();

        // 4. Fetch Receipts
        let query = admin
            .from("receipt_requests")
            .select(`
            *,
            matched_receipts (*)
        `);

        if (share.batch_id) {
            // Specific batch
            query = query.eq("batch_id", share.batch_id);
        } else {
            // All active batches for user
            const { data: userBatches } = await admin
                .from("batches")
                .select("id")
                .eq("created_by", share.user_id)
                .eq("status", "active");

            const batchIds = userBatches?.map(b => b.id) || [];
            if (batchIds.length === 0) {
                return NextResponse.json({
                    share,
                    user,
                    receipts: []
                });
            }

            query = query.in("batch_id", batchIds);
        }

        const { data: receipts, error: receiptsError } = await query;

        if (receiptsError) throw receiptsError;

        // 5. Enrich with Signed URLs (Cloud Persistence)
        const enrichedReceipts = await Promise.all(receipts.map(async (r: any) => {
            const match = r.matched_receipts?.[0];
            let downloadUrl = null;

            if (match?.file_url && match.file_url !== 'N/A') {
                try {
                    // Generate a signed URL for the user to download
                    downloadUrl = await createSignedUrl(match.file_url);
                } catch (e) {
                    console.warn(`Failed to sign URL for ${match.file_url}`, e);
                }
            }

            return {
                ...r,
                downloadUrl
            };
        }));

        return NextResponse.json({
            share,
            user,
            receipts: enrichedReceipts
        });

    } catch (err) {
        console.error("Public report fetch failed:", err);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
