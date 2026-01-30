"use client";

import { Card } from "@/components/ui/Card";

interface UserListProps {
    users: any[];
}

export function UserList({ users }: UserListProps) {
    return (
        <Card className="overflow-hidden border border-slate-200 bg-white rounded-2xl shadow-sm">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-4 font-bold text-slate-900">Name</th>
                            <th className="px-6 py-4 font-bold text-slate-900">Email</th>
                            <th className="px-6 py-4 font-bold text-slate-900">Joined</th>
                            <th className="px-6 py-4 font-bold text-slate-900">ID</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {users.map((user) => (
                            <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 font-medium text-slate-900 flex items-center gap-3">
                                    {user.image ? (
                                        <img src={user.image} alt="" className="w-8 h-8 rounded-full bg-slate-200" />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
                                            {user.name?.[0] || "?"}
                                        </div>
                                    )}
                                    {user.name || "Unknown"}
                                </td>
                                <td className="px-6 py-4">{user.email}</td>
                                <td className="px-6 py-4 font-mono text-xs text-slate-400">
                                    {/* Accessing a timestamp if available, NextAuth schema usually doesn't have createdAt on user by default unless added, but lets assume ID might tell us or its null */}
                                    {user.emailVerified ? new Date(user.emailVerified).toLocaleDateString() : "N/A"}
                                </td>
                                <td className="px-6 py-4 font-mono text-xs text-slate-400">{user.id}</td>
                            </tr>
                        ))}
                        {users.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No users found.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}
