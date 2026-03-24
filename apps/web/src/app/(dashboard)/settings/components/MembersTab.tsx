'use client';

import api from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { useState } from 'react';
import {
    Users, Loader2, Crown, ShieldCheck, Eye, User,
    Trash2, ChevronDown, UserPlus, Mail, CheckCircle2, XCircle, Info, Shield
} from 'lucide-react';

const rolesConfig = [
    {
        name: 'Owner',
        icon: Crown,
        color: 'text-purple-600',
        bgColor: 'bg-purple-100',
        description: 'Highest level of access. Complete control over the workspace, billing, and all features.',
        capabilities: [
            { name: 'Delete Workspace & Manage Billing', allowed: true },
            { name: 'Transfer Ownership', allowed: true },
            { name: 'Create & Delete Audiences Globally', allowed: true },
            { name: 'Manage Webhooks & Integrations', allowed: true },
        ]
    },
    {
        name: 'Admin',
        icon: ShieldCheck,
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        description: 'Management level. Can configure integrations, manage team members, and build workflows.',
        capabilities: [
            { name: 'Connect WhatsApp Sessions', allowed: true },
            { name: 'Manage Team Members (Roles)', allowed: true },
            { name: 'Create Global Automations', allowed: true },
            { name: 'Delete Workspace & Manage Billing', allowed: false },
        ]
    },
    {
        name: 'Member',
        icon: User,
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        description: 'Core daily operations. Handles CRM, replies to Inbox, and launches Campaigns.',
        capabilities: [
            { name: 'Chat & Reply in Inbox', allowed: true },
            { name: 'Create/Edit CRM Contacts', allowed: true },
            { name: 'Launch Campaigns (Approved Templates)', allowed: true },
            { name: 'Connect WhatsApp Sessions', allowed: false },
        ]
    },
    {
        name: 'Viewer',
        icon: Eye,
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
        description: 'Read-only observation. Can view metrics and CRM data but cannot modify or send messages.',
        capabilities: [
            { name: 'View Dashboards & Metrics', allowed: true },
            { name: 'View CRM Contacts', allowed: true },
            { name: 'Send Messages / Launch Campaigns', allowed: false },
            { name: 'Edit Any Settings', allowed: false },
        ]
    }
];

const ROLE_LABELS: Record<string, { label: string; icon: any; cls: string }> = {
    OWNER:  { label: 'Owner',  icon: Crown,        cls: 'badge-yellow' },
    ADMIN:  { label: 'Admin',  icon: ShieldCheck,  cls: 'badge-blue'   },
    MEMBER: { label: 'Member', icon: User,         cls: 'badge-gray'   },
    VIEWER: { label: 'Viewer', icon: Eye,          cls: 'badge-gray'   },
};

export function MembersTab() {
    const qc = useQueryClient();
    const hasPermission = useAuthStore(s => s.hasPermission);
    const currentUser = useAuthStore(s => s.user);
    const canManage = hasPermission('members:manage');

    const [inviteModal, setInviteModal] = useState(false);
    const [rolesModal, setRolesModal] = useState(false);
    const [inviteForm, setInviteForm] = useState({ email: '', password: '', role: 'MEMBER' });
    const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

    const { data: members = [], isLoading } = useQuery({
        queryKey: ['workspace-members'],
        queryFn: () => api.get('/workspaces/me/members').then(r => r.data?.data ?? []),
    });

    const inviteMutation = useMutation({
        mutationFn: (payload: { email: string; password?: string; role: string }) =>
            api.post('/workspaces/me/members', payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['workspace-members'] });
            setInviteModal(false);
            setInviteForm({ email: '', password: '', role: 'MEMBER' });
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
        <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto">
            {/* Toolbar */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted">
                    <Users size={15} />
                    <span>{(members as any[]).length} member{(members as any[]).length !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        className="btn bg-elevated text-secondary hover:text-primary flex items-center gap-2"
                        onClick={() => setRolesModal(true)}
                    >
                        <Shield size={15} /> Roles Matrix
                    </button>
                    {canManage && (
                        <button
                            className="btn btn-primary flex items-center gap-2"
                            onClick={() => setInviteModal(true)}
                        >
                            <UserPlus size={15} /> Add Member
                        </button>
                    )}
                </div>
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

            {/* Roles Explainer Modal */}
            {rolesModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="card w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-start justify-between mb-6">
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">Roles & Privileges Matrix</h2>
                                <p className="text-gray-500 text-sm mt-1">
                                    Understand the capability boundaries assigned to each role within your workspace.
                                </p>
                            </div>
                            <button
                                className="btn bg-elevated text-secondary px-3 py-1.5"
                                onClick={() => setRolesModal(false)}
                            >
                                Close
                            </button>
                        </div>

                        <div className="grid gap-6 md:grid-cols-2">
                            {rolesConfig.map((role) => {
                                const Icon = role.icon;
                                return (
                                    <div key={role.name} className="flex flex-col rounded-2xl border border-theme bg-surface p-6 shadow-sm transition-all hover:shadow-md">
                                        <div className="flex items-center space-x-3 mb-4">
                                            <div className={`p-3 rounded-xl ${role.bgColor} ${role.color}`}>
                                                <Icon className="w-6 h-6" />
                                            </div>
                                            <h2 className="text-xl font-semibold text-primary">{role.name}</h2>
                                        </div>
                                        
                                        <p className="text-sm text-secondary mb-6 flex-grow">{role.description}</p>
                                        
                                        <div className="space-y-3 pt-4 border-t border-theme">
                                            {role.capabilities.map((cap, i) => (
                                                <div key={i} className="flex items-start space-x-3">
                                                    {cap.allowed ? (
                                                        <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                                                    ) : (
                                                        <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                                                    )}
                                                    <span className={`text-sm ${cap.allowed ? 'text-primary font-medium' : 'text-muted line-through decoration-red-200'}`}>
                                                        {cap.name}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        
                        <div className="mt-8 p-6 bg-blue-50/50 border border-blue-100 rounded-xl">
                            <h3 className="text-blue-900 font-semibold flex items-center mb-2 text-sm">
                                <Shield className="w-4 h-4 mr-2 text-blue-600" />
                                Security Best Practices
                            </h3>
                            <p className="text-xs text-blue-800">
                                Always apply the Principle of Least Privilege. Restrict technical users to Admin, and restrict standard operators to Member. Owners should be exclusively reserved for stakeholders making billing and destructive structural decisions.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Member Modal */}
            {inviteModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="card w-full max-w-md">
                        <h2 className="text-lg font-bold text-primary mb-4 flex items-center gap-2">
                            <UserPlus size={18} /> Add Team Member
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
                                <label className="text-xs font-medium text-secondary">Password</label>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="Enter user's password"
                                    required
                                    value={inviteForm.password}
                                    onChange={e => setInviteForm(f => ({ ...f, password: e.target.value }))}
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-medium text-secondary">Role</label>
                                    <button 
                                        type="button" 
                                        onClick={() => setRolesModal(true)}
                                        className="text-xs text-accent hover:underline flex items-center gap-1"
                                    >
                                        <Info size={12} /> Compare Roles
                                    </button>
                                </div>
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
                                    Add Member
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
