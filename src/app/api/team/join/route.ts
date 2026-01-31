import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { token } = await req.json();
        const userId = (session.user as any).id;
        const admin = getSupabaseAdmin();

        // 1. Verify Token
        const { data: invite, error } = await admin
            .from("invitations")
            .select("*")
            .eq("token", token)
            .single();

        if (error || !invite) {
            return NextResponse.json({ error: "Invalid or expired invite" }, { status: 404 });
        }

        if (new Date(invite.expires_at) < new Date()) {
            return NextResponse.json({ error: "Invite expired" }, { status: 410 });
        }

        // 2. Add Member to Org
        // Check if already member
        const { data: existing } = await admin
            .from("organization_members")
            .select("*")
            .eq("organization_id", invite.organization_id)
            .eq("user_id", userId)
            .single();

        if (existing) {
            return NextResponse.json({ success: true, message: "Already a member" });
        }

        // Add
        await admin
            .from("organization_members")
            .insert({
                organization_id: invite.organization_id,
                user_id: userId,
                role: invite.role || 'contributor'
            });

        return NextResponse.json({ success: true, organizationId: invite.organization_id });

    } catch (err: any) {
        console.error("Join team failed:", err);
        return NextResponse.json({ error: "Failed to join team" }, { status: 500 });
    }
}
