import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { batchId } = await req.json();
        const userId = (session.user as any).id;

        // Generate a secure, URL-friendly token
        const token = nanoid(12); // e.g., "V1StGXR8_Z5jd"

        // Create the share record
        // We link it to the user_id (sharing their data) and optionally a specific batch
        const admin = getSupabaseAdmin();
        const { data, error } = await admin
            .from("report_shares")
            .insert({
                user_id: userId,
                batch_id: batchId || null, // Optional, can be specific batch or "all active"
                token: token,
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({
            success: true,
            token: data.token,
            url: `${process.env.NEXTAUTH_URL}/report/${data.token}`
        });

    } catch (err) {
        console.error("Share creation failed:", err);
        return NextResponse.json({ error: "Failed to create share link" }, { status: 500 });
    }
}
