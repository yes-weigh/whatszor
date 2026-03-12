'use client';

import { Header } from '@/components/layout/Header';
import api from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { useState } from 'react';
import {
    Users, Loader2, Crown, ShieldCheck, Eye, User,
    Trash2, ChevronDown, UserPlus, Mail
} from 'lucide-react';
import { useRouter } from 'next/navigation';

const ROLE_LABELS: Record<string, { label: string; icon: any; cls: string }> = {
    OWNER:  { label: 'Owner',  icon: Crown,        cls: 'badge-yellow' },
    ADMIN:  { label: 'Admin',  icon: ShieldCheck,  cls: 'badge-blue'   },
    MEMBER: { label: 'Member', icon: User,         cls: 'badge-gray'   },
    VIEWER: { label: 'Viewer', icon: Eye,          cls: 'badge-gray'   },
};

export default function MembersPage() {
    const qc = useQueryClient();
    const router = useRouter();
    const hasPermission = useAuthStore(s => s.hasPermission);
    const currentUser = useAuthStore(s => s.user);
    const canManage = hasPermission('members:manage');

    const [inviteModal, setInviteModal] = useState(false);
    const [inviteForm, setInviteForm] = useState({ email: '', role: 'MEMBER' });
    const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

    const { data: members = [], isLoading } = useQuery({
        queryKey: ['workspace-members'],
        queryFn: () => api.get('/workspaces/me/members').then(r => r.data?.data ?? []),
    });

    const inviteMutation = useMutation({
        mutationFn: (payload: { email: string; role: string }) =>
            api.post('/workspaces/me/members', payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['workspace-members'] });
            setInviteModal(false);
            setInviteForm({ email: '', role: 'MEMBER' });
        },
        onError: (err: any) => {
            alert(err.response?.data?.message || 'Failed to invite member');
        }
    });

    const changeRoleMutation = useMutation({
        mutationFn: ({ id, role }: { id: string; role: string }) =>
            api.patch(`/workspaces/me/members/${id}`, { role }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-members'] }),
    });

    const removeMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/workspaces/me/members/${id}`),
        onSuccess: () => {
            setConfirmRemoveId(null);
            qc.invalidateQueries({ queryKey: ['workspace-members'] });
        },
        onError: (err: any) => {
            alert(err.response?.data?.message || 'Failed to remove member');
            setConfirmRemoveId(null);
        }
    });

    return (
        <div className="flex flex-col h-full bg-body">
            <Header title="Team Members" subtitle="Manage workspace access and roles" />
            <div className="p-6 max-w-4xl mx-auto w-full flex flex-col gap-6">

                {/* Toolbar */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted">
                        <Users size={15} />
                        <span>{(members as any[]).length} member{(members as any[]).length !== 1 ? 's' : ''}</span>
                    </div>
                    {canManage && (
                        <button
                            className="btn btn-primary flex items-center gap-2"
                            onClick={() => setInviteModal(true)}
                        >
                            <UserPlus size={15} /> Invite Member
                        </button>
                    )}
                </div>

                {/* Member List */}
                <div className="card p-0 overflow-hidden">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 size={24} className="animate-spin text-muted" />
                        </div>
                    ) : (members as any[]).length === 0 ? (
                        <div className="flex flex-col items-center gap-3 py-16 text-muted">
                            <Users size={36} className="text-strong" />
                            <p className="text-sm">No members yet</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-theme">
                                    {['Member', 'Role', 'Actions'].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {(members as any[]).map((m: any) => {
                                    const roleInfo = ROLE_LABELS[m.role] ?? ROLE_LABELS.MEMBER;
                                    const RoleIcon = roleInfo.icon;
                                    const isSelf = m.userId === currentUser?.id;
                                    const isOwner = m.role === 'OWNER';
                                    return (
                                        <tr key={m.id} className="border-b border-theme last:border-0 hover:bg-hover transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-full bg-accent/20 text-accent flex items-center justify-center font-bold text-sm shrink-0">
                                                        {m.user?.name?.charAt(0)?.toUpperCase() ?? '?'}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium text-primary">
                                                            {m.user?.name ?? 'Unknown'}
                                                            {isSelf && <span className="ml-2 text-xs text-muted">(you)</span>}
                                                        </p>
                                                        <p className="text-xs text-muted flex items-center gap-1">
                                                            <Mail size={10} /> {m.user?.email}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                {canManage && !isSelf && !isOwner ? (
                                                    <div className="relative inline-block">
                                                        <select
                                                            title="Change member role"
                                                            className="appearance-none pl-2 pr-6 py-1 rounded-md border border-theme bg-elevated text-sm text-primary cursor-pointer focus:outline-none focus:border-accent"
                                                            value={m.role}
                                                            onChange={e => changeRoleMutation.mutate({ id: m.id, role: e.target.value })}
                                                        >
                                                            {Object.entries(ROLE_LABELS).map(([r, info]) => (
                                                                <option key={r} value={r}>{info.label}</option>
                                                            ))}
                                                        </select>
                                                        <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                                                    </div>
                                                ) : (
                                                    <span className={`badge ${roleInfo.cls} flex items-center gap-1 w-fit`}>
                                                        <RoleIcon size={11} /> {roleInfo.label}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {canManage && !isSelf && !isOwner && (
                                                    confirmRemoveId === m.id ? (
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                className="btn bg-danger text-white text-xs px-2 py-1 flex items-center gap-1"
                                                                onClick={() => removeMutation.mutate(m.id)}
                                                                disabled={removeMutation.isPending}
                                                            >
                                                                {removeMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                                                Confirm
                                                            </button>
                                                            <button
                                                                className="btn bg-elevated text-secondary text-xs px-2 py-1"
                                                                onClick={() => setConfirmRemoveId(null)}
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            className="btn bg-danger/10 text-danger hover:bg-danger/20 text-xs px-3 py-1.5 flex items-center gap-1.5"
                                                            onClick={() => setConfirmRemoveId(m.id)}
                                                        >
                                                            <Trash2 size={12} /> Remove
                                                        </button>
                                                    )
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Back link */}
                <button
                    className="text-sm text-muted hover:text-primary transition-colors self-start"
                    onClick={() => router.push('/settings')}
                >
                    ← Back to Settings
                </button>
            </div>

            {/* Invite Modal */}
            {inviteModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="card w-full max-w-md">
                        <h2 className="text-lg font-bold text-primary mb-4 flex items-center gap-2">
                            <UserPlus size={18} /> Invite Team Member
                        </h2>
                        <form
                            onSubmit={e => { e.preventDefault(); inviteMutation.mutate(inviteForm); }}
                            className="flex flex-col gap-4"
                        >
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-secondary">Email Address</label>
                                <input
                                    type="email"
                                    className="input"
                                    placeholder="team@example.com"
                                    required
                                    value={inviteForm.email}
                                    onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-secondary">Role</label>
                                <select
                                    title="Select role"
                                    className="input"
                                    value={inviteForm.role}
                                    onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))}
                                >
                                    <option value="ADMIN">Admin — full access except billing</option>
                                    <option value="MEMBER">Member — standard access</option>
                                    <option value="VIEWER">Viewer — read-only</option>
                                </select>
                            </div>
                            <div className="flex justify-end gap-2 mt-2">
                                <button
                                    type="button"
                                    className="btn bg-elevated text-secondary"
                                    onClick={() => setInviteModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary flex items-center gap-2"
                                    disabled={inviteMutation.isPending}
                                >
                                    {inviteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                                    Send Invite
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
