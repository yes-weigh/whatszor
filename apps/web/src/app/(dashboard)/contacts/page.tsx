'use client';

import { Header } from '@/components/layout/Header';
import api from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { useRouter } from 'next/navigation';
import { Users, Search, Phone, Mail, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function ContactsPage() {
    const [search, setSearch] = useState('');
    const hasPermission = useAuthStore(s => s.hasPermission);
    const router = useRouter();

    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => { setIsMounted(true); }, []);

    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(contacts.map(c => c.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectOne = (id: string, e: React.ChangeEvent<HTMLInputElement> | React.MouseEvent) => {
        e.stopPropagation();
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const handleDeleteSelected = async () => {
        if (!confirm(`Are you sure you want to delete ${selectedIds.length} contacts?`)) return;
        try {
            await api.delete('/crm/contacts/bulk', { data: { ids: selectedIds } });
            setSelectedIds([]);
            refetch();
        } catch (error) {
            console.error(error);
        }
    };

    const [addModal, setAddModal] = useState(false);
    const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '' });

    const { data: contactsData, refetch } = useQuery({
        queryKey: ['contacts', search],
        queryFn: () => api.get(`/crm/contacts?search=${search}`).then(r => r.data?.data ?? []),
        enabled: isMounted,
    });

    const handleAddContact = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/crm/contacts', form);
            setAddModal(false);
            setForm({ firstName: '', lastName: '', phone: '', email: '' });
            refetch();
        } catch (error) {
            console.error(error);
        }
    };

    const contacts: any[] = contactsData ?? [];

    return (
        <div>
            <Header title="Contacts" subtitle="Your CRM database" />
            <div className="p-6">
                {/* Toolbar */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-theme bg-elevated w-64">
                        <Search size={13} className="text-muted" />
                        <input className="bg-transparent text-sm outline-none flex-1 text-primary placeholder:text-muted"
                            placeholder="Search contacts..."
                            value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <div className="flex items-center gap-2">
                        {selectedIds.length > 0 && isMounted && hasPermission('contacts:delete') && (
                            <button className="btn btn-outline text-red-500 border-red-500/20 hover:bg-red-500/10" onClick={handleDeleteSelected}>
                                <Trash2 size={16} /> Delete Selected ({selectedIds.length})
                            </button>
                        )}
                        {isMounted && hasPermission('contacts:create') && (
                            <button className="btn btn-primary" onClick={() => setAddModal(true)}>+ Add Contact</button>
                        )}
                    </div>
                </div>

                {addModal && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="card w-full max-w-md">
                            <h2 className="text-lg font-bold text-primary mb-4">Add New Contact</h2>
                            <form onSubmit={handleAddContact} className="flex flex-col gap-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs font-medium text-secondary">First Name</label>
                                        <input type="text" className="input" placeholder="John" required
                                            value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs font-medium text-secondary">Last Name</label>
                                        <input type="text" className="input" placeholder="Doe"
                                            value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-medium text-secondary">Phone Number</label>
                                    <input type="text" className="input" placeholder="+1234567890" required
                                        value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-medium text-secondary">Email Address</label>
                                    <input type="email" className="input" placeholder="john@example.com"
                                        value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                                </div>
                                <div className="flex justify-end gap-2 mt-2">
                                    <button type="button" className="btn bg-elevated text-secondary" onClick={() => setAddModal(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary">Save Contact</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Table */}
                <div className="card p-0 overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-theme">
                                <th className="px-4 py-3 text-left w-10">
                                    <input type="checkbox"
                                        className="rounded bg-elevated border-theme text-primary focus:ring-primary focus:ring-offset-background"
                                        checked={contacts.length > 0 && selectedIds.length === contacts.length}
                                        onChange={handleSelectAll}
                                        aria-label="Select all contacts"
                                        title="Select all contacts"
                                    />
                                </th>
                                {['Name', 'Phone', 'Email', 'Pipeline', 'Tags'].map(h => (
                                    <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {contacts.length === 0 && (
                                <tr><td colSpan={6} className="px-4 py-12 text-center">
                                    <div className="flex flex-col items-center gap-2">
                                        <Users size={32} className="text-strong" />
                                        <p className="text-sm text-muted">No contacts yet</p>
                                    </div>
                                </td></tr>
                            )}
                            {contacts.map((c: any) => (
                                <tr key={c.id}
                                    onClick={() => router.push(`/contacts/${c.id}`)}
                                    className="border-b border-theme transition-colors hover:bg-hover cursor-pointer">
                                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                        <input type="checkbox"
                                            className="rounded bg-elevated border-theme text-primary focus:ring-primary focus:ring-offset-background"
                                            checked={selectedIds.includes(c.id)}
                                            onChange={(e) => handleSelectOne(c.id, e)}
                                            aria-label={`Select contact ${c.firstName} ${c.lastName || ''}`.trim()}
                                            title={`Select contact ${c.firstName} ${c.lastName || ''}`.trim()}
                                        />
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-accent text-white">
                                                {c.firstName?.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="text-sm font-medium text-primary">
                                                {c.firstName} {c.lastName}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1.5 text-sm text-secondary">
                                            <Phone size={12} />{c.phone || '—'}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1.5 text-sm text-secondary">
                                            <Mail size={12} />{c.email || '—'}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="badge badge-blue">{c.pipeline?.name || 'No Pipeline'}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-1 flex-wrap">
                                            {(c.tags ?? []).map((t: string) => (
                                                <span key={t} className="badge badge-gray">{t}</span>
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
