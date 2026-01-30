import { getAdminStats } from "@/lib/supabase";
import { Card } from "@/components/ui/Card";

export const dynamic = 'force-dynamic'; // Always fetch fresh data

export default async function AdminDashboard() {
    const stats = await getAdminStats();

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <header className="mb-8">
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">Mission Control</h1>
                <p className="text-slate-500 text-lg">System status and key metrics.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Users"
                    value={stats.users}
                    icon="👥"
                    color="bg-blue-500"
                />
                <StatCard
                    title="Batches Created"
                    value={stats.batches}
                    icon="📁"
                    color="bg-purple-500"
                />
                <StatCard
                    title="Receipts Uploaded"
                    value={stats.receipts}
                    icon="🧾"
                    color="bg-slate-500"
                />
                <StatCard
                    title="Receipts Found"
                    value={stats.found}
                    icon="✅"
                    color="bg-green-500"
                />
            </div>

            <Card className="p-8 border border-slate-200 bg-white rounded-2xl shadow-sm">
                <h2 className="text-xl font-bold mb-4 text-slate-900">Recent System Logs</h2>
                <div className="text-sm text-slate-500 italic">
                    No logs available yet. (This is a placeholder for future activity tracking)
                </div>
            </Card>
        </div>
    );
}

function StatCard({ title, value, icon, color }: any) {
    return (
        <Card className="p-6 border border-slate-100 bg-white rounded-2xl shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
            <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-6xl select-none grayscale group-hover:grayscale-0`}>
                {icon}
            </div>
            <div className="relative z-10">
                <div className={`w-12 h-12 rounded-xl ${color} text-white flex items-center justify-center text-2xl shadow-lg mb-4`}>
                    {icon}
                </div>
                <p className="text-slate-500 font-medium text-sm mb-1 uppercase tracking-wider">{title}</p>
                <p className="text-4xl font-black text-slate-900 tracking-tight">{value}</p>
            </div>
        </Card>
    );
}
