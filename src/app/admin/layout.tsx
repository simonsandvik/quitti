import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getServerSession(authOptions);

    // 1. Must be logged in
    if (!session?.user?.email) {
        redirect("/");
    }

    // 2. Must be in Allowlist
    const adminEmails = (process.env.ADMIN_EMAILS || "").split(",");
    if (!adminEmails.includes(session.user.email)) {
        console.log(`[Admin Access Denied] User: ${session.user.email}`);
        redirect("/");
    }

    return (
        <div className="min-h-screen bg-slate-50 pl-64">
            <AdminSidebar />
            <main className="p-8 max-w-6xl mx-auto">
                {children}
            </main>
        </div>
    );
}
