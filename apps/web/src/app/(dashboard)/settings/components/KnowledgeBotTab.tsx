'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Plus, Trash2, Shield, Loader2, Phone, Info } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface AllowedNumber {
    id: string;
    phoneNumber: string;
    label: string | null;
    isActive: boolean;
    createdAt: string;
}

export function KnowledgeBotTab() {
    const qc = useQueryClient();
    const [newPhone, setNewPhone] = useState('');
    const [newLabel, setNewLabel] = useState('');

    const { data: numbers = [], isLoading } = useQuery<AllowedNumber[]>({
        queryKey: ['allowed-numbers'],
        queryFn: () => api.get('/products/allowed-numbers').then(r => r.data)
    });

    const createMutation = useMutation({
        mutationFn: (data: { phoneNumber: string; label?: string }) =>
            api.post('/products/allowed-numbers', data),
        onSuccess: () => {
            setNewPhone('');
            setNewLabel('');
            qc.invalidateQueries({ queryKey: ['allowed-numbers'] });
        },
        onError: (e: any) => alert(e.response?.data?.message || 'Failed to add number'),
    });

    const toggleMutation = useMutation({
        mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
            api.patch(`/products/allowed-numbers/${id}`, { isActive }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['allowed-numbers'] }),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/products/allowed-numbers/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['allowed-numbers'] }),
    });

    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPhone.trim()) return;
        createMutation.mutate({ phoneNumber: newPhone.trim(), label: newLabel.trim() || undefined });
    };

    return (
        <div className="flex flex-col gap-6">
            {/* Header */}
            <div>
                <h2 className="text-base font-semibold text-primary">Knowledge Bot Access</h2>
                <p className="text-sm text-secondary mt-0.5">
                    Manage which WhatsApp numbers are trusted to submit product knowledge updates to the AI bot.
                </p>
            </div>

            {/* Info banner */}
            <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-sm text-orange-300">
                <Info size={16} className="mt-0.5 shrink-0" />
                <p>
                    If no numbers are added, the Knowledge Bot will <strong>block all inbound updates</strong>.
                    Only messages from numbers in this list will be accepted.
                </p>
            </div>

            {/* Add form */}
            <div className="border border-theme rounded-xl p-5 flex flex-col gap-4">
                <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                    <Shield size={15} className="text-orange-400" />
                    Add Trusted Number
                </h3>
                <form onSubmit={handleAdd} className="flex items-end gap-3 flex-wrap sm:flex-nowrap">
                    <div className="flex-1 min-w-[200px]">
                        <label className="text-xs font-medium text-secondary mb-1.5 flex justify-between">
                            <span>Phone Number</span>
                            <span className="text-muted font-normal">Include country code, no + or spaces</span>
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                                <Phone size={14} />
                            </span>
                            <input
                                type="text"
                                className="input pl-9 font-mono text-sm w-full"
                                placeholder="e.g. 919876543210"
                                value={newPhone}
                                onChange={e => setNewPhone(e.target.value.replace(/\D/g, ''))}
                                required
                            />
                        </div>
                    </div>
                    <div className="flex-1 min-w-[160px]">
                        <label className="text-xs font-medium text-secondary mb-1.5 block">
                            Label <span className="text-muted font-normal">(Optional)</span>
                        </label>
                        <input
                            type="text"
                            className="input w-full"
                            placeholder="e.g. John's Phone"
                            value={newLabel}
                            onChange={e => setNewLabel(e.target.value)}
                        />
                    </div>
                    <button
                        type="submit"
                        className="btn btn-primary h-10 px-5 whitespace-nowrap shrink-0"
                        disabled={createMutation.isPending || !newPhone.trim()}
                    >
                        {createMutation.isPending
                            ? <Loader2 size={16} className="animate-spin" />
                            : <><Plus size={16} /> Add Number</>
                        }
                    </button>
                </form>
            </div>

            {/* Numbers table */}
            {isLoading ? (
                <div className="flex justify-center py-12">
                    <Loader2 size={28} className="animate-spin text-muted" />
                </div>
            ) : (
                <div className="border border-theme rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="text-xs text-secondary border-b border-theme bg-surface-elevated/50">
                            <tr>
                                <th className="px-5 py-3 font-medium">Phone Number</th>
                                <th className="px-5 py-3 font-medium">Label</th>
                                <th className="px-5 py-3 font-medium">Added</th>
                                <th className="px-5 py-3 font-medium text-center">Active</th>
                                <th className="px-5 py-3 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-theme">
                            {numbers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-5 py-10 text-center text-muted text-sm">
                                        No trusted numbers yet. The Knowledge Bot will block all inbound updates.
                                    </td>
                                </tr>
                            ) : numbers.map(num => (
                                <tr key={num.id} className="group hover:bg-hover/30 transition-colors">
                                    <td className="px-5 py-3.5 font-mono font-medium text-primary">
                                        +{num.phoneNumber}
                                    </td>
                                    <td className="px-5 py-3.5 text-secondary">
                                        {num.label || <span className="text-muted italic">No label</span>}
                                    </td>
                                    <td className="px-5 py-3.5 text-secondary text-xs">
                                        {formatDistanceToNow(new Date(num.createdAt), { addSuffix: true })}
                                    </td>
                                    <td className="px-5 py-3.5 text-center">
                                        <label
                                            className="inline-flex relative items-center cursor-pointer"
                                            aria-label={`Toggle access for ${num.phoneNumber}`}
                                        >
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={num.isActive}
                                                onChange={e =>
                                                    toggleMutation.mutate({ id: num.id, isActive: e.target.checked })
                                                }
                                                aria-label={`Toggle active for ${num.phoneNumber}`}
                                            />
                                            <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500" />
                                        </label>
                                    </td>
                                    <td className="px-5 py-3.5 text-right">
                                        <button
                                            onClick={() => {
                                                if (confirm(`Remove access for +${num.phoneNumber}?`)) {
                                                    deleteMutation.mutate(num.id);
                                                }
                                            }}
                                            className="p-1.5 text-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                            title="Remove number"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
