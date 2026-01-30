import { getAllUsers } from "@/lib/supabase";
import { UserList } from "@/components/admin/UserList";

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
    const users = await getAllUsers();

    return (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">User Management</h1>
                    <p className="text-slate-500 text-lg">View and manage registered accounts.</p>
                </div>
                <div className="bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm font-mono text-sm font-bold text-slate-600">
                    Total: {users?.length || 0}
                </div>
            </header>

            <UserList users={users || []} />
        </div>
    );
}
