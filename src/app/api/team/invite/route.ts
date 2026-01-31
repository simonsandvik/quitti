import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabaseAdmin, supabase } from "@/lib/supabase";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const userId = (session.user as any).id;

        // 1. Get User's Organization (For MVP, pick the first one they own/admin)
        // In future, UI pass organizationId
        const { data: members, error: memError } = await supabase
            .from("organization_members")
            .select("organization_id, role")
            .eq("user_id", userId)
            .eq("role", "admin") // Only admins can invite
            .limit(1);

        let orgId = members?.[0]?.organization_id;

        // If no org found, maybe they haven't set one up?
        if (!orgId) {
            // Check if they have ANY org
            const { data: anyOrg } = await supabase
                .from("organization_members")
                .select("organization_id")
                .eq("user_id", userId)
                .limit(1);

            if (anyOrg && anyOrg.length > 0) {
                return NextResponse.json({ error: "Only Admins can invite users." }, { status: 403 });
            } else {
                // Create a Personal Org for them instantly
                const admin = getSupabaseAdmin();
                const { data: newOrg } = await admin.from("organizations").insert({ name: `${session.user.name}'s Team` }).select().single();
                await admin.from("organization_members").insert({ organization_id: newOrg.id, user_id: userId, role: 'admin' });
                orgId = newOrg.id;
            }
        }

        // 2. Generate Invite Token
        const token = nanoid(10); // e.g. "xYz123AbCd"

        const { data: invite, error: invError } = await supabase
            .from("invitations")
            .insert({
                organization_id: orgId,
                token: token,
                role: 'contributor', // Default role
                created_by: userId
            })
            .select()
            .single();

        if (invError) throw invError;

        return NextResponse.json({
            success: true,
            token: invite.token,
            url: `${process.env.NEXTAUTH_URL}/join/${invite.token}`
        });

    } catch (err: any) {
        console.error("Invite creation failed:", err);
        return NextResponse.json({ error: err.message || "Failed to create invite" }, { status: 500 });
    }
}
