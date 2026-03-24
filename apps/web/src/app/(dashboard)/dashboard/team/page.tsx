'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Plus, Trash2, Shield, Loader2, Phone } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface AllowedNumber {
    id: string;
    phoneNumber: string;
    label: string | null;
    isActive: boolean;
    createdAt: string;
}

export default function TeamAccessPage() {
    const qc = useQueryClient();
    const [newPhone, setNewPhone] = useState('');
    const [newLabel, setNewLabel] = useState('');

    const { data: numbers = [], isLoading } = useQuery<AllowedNumber[]>({
        queryKey: ['allowed-numbers'],
        queryFn: () => api.get('/products/allowed-numbers').then(r => r.data.data)
    });

    const createMutation = useMutation({
        mutationFn: (data: { phoneNumber: string, label?: string }) => api.post('/products/allowed-numbers', data),
        onSuccess: () => {
            setNewPhone('');
            setNewLabel('');
            qc.invalidateQueries({ queryKey: ['allowed-numbers'] });
        },
        onError: (e: any) => {
            alert(e.response?.data?.message || 'Failed to add number');
        }
    });

    const toggleMutation = useMutation({
        mutationFn: ({ id, isActive }: { id: string, isActive: boolean }) => api.patch(`/products/allowed-numbers/${id}`, { isActive }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['allowed-numbers'] })
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/products/allowed-numbers/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['allowed-numbers'] })
    });

    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPhone.trim()) return;
        createMutation.mutate({ phoneNumber: newPhone.trim(), label: newLabel.trim() || undefined });
    };

    return (
        <div className="max-w-4xl mx-auto py-8 px-4 flex flex-col gap-8">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                    <Shield size={20} />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-primary">Team Access</h1>
                    <p className="text-secondary text-sm">Manage which phone numbers are allowed to submit product knowledge updates.</p>
                </div>
            </div>

            <div className="card p-6 flex flex-col gap-6">
                <h3 className="font-semibold text-primary">Add Trusted Number</h3>
                <form onSubmit={handleAdd} className="flex items-start gap-4 flex-wrap sm:flex-nowrap">
                    <div className="flex-1 min-w-[200px]">
                        <label className="text-xs font-medium text-secondary mb-1.5 flex justify-between">
                            <span>Phone Number</span>
                            <span className="text-muted font-normal">Include country code</span>
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"><Phone size={14} /></span>
                            <input 
                                type="text" 
                                className="input pl-9 font-mono text-sm" 
                                placeholder="e.g. 919876543210 (No +, spaces, or dashes)" 
                                value={newPhone} 
                                onChange={e => setNewPhone(e.target.value.replace(/\D/g, ''))} 
                                required 
                            />
                        </div>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="text-xs font-medium text-secondary mb-1.5 block">Label (Optional)</label>
                        <input 
                            type="text" 
                            className="input" 
                            placeholder="e.g. John's Phone" 
                            value={newLabel} 
                            onChange={e => setNewLabel(e.target.value)} 
                        />
                    </div>
                    <div className="pt-[22px]">
                        <button 
                            type="submit" 
                            className="btn btn-primary h-10 px-6 whitespace-nowrap"
                            disabled={createMutation.isPending || !newPhone.trim()}
                        >
                            {createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <><Plus size={16} /> Add Number</>}
                        </button>
                    </div>
                </form>
            </div>

            {isLoading ? (
                <div className="flex justify-center p-12">
                    <Loader2 size={32} className="animate-spin text-muted" />
                </div>
            ) : (
                <div className="card overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-surface-elevated/50 text-secondary border-b border-theme">
                            <tr>
                                <th className="px-6 py-4 font-medium">Phone Number</th>
                                <th className="px-6 py-4 font-medium">Label</th>
                                <th className="px-6 py-4 font-medium">Added</th>
                                <th className="px-6 py-4 font-medium text-center">Active</th>
                                <th className="px-6 py-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-theme">
                            {numbers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-muted">
                                        No authorized numbers yet. The Knowledge Bot will block ALL inbound updates.
                                    </td>
                                </tr>
                            ) : numbers.map(num => (
                                <tr key={num.id} className="group hover:bg-hover/30 transition-colors">
                                    <td className="px-6 py-4 font-medium text-primary">
                                        +{num.phoneNumber}
                                    </td>
                                    <td className="px-6 py-4 text-secondary">
                                        {num.label || <span className="text-muted italic">No label</span>}
                                    </td>
                                    <td className="px-6 py-4 text-secondary text-xs">
                                        {formatDistanceToNow(new Date(num.createdAt), { addSuffix: true })}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <label className="inline-flex relative items-center cursor-pointer" aria-label={`Toggle access for ${num.phoneNumber}`} title={`Toggle access for ${num.phoneNumber}`}>
                                            <input 
                                                type="checkbox" 
                                                className="sr-only peer" 
                                                checked={num.isActive} 
                                                onChange={(e) => toggleMutation.mutate({ id: num.id, isActive: e.target.checked })}
                                                aria-label={`Toggle active state for ${num.phoneNumber}`}
                                                title={`Toggle active state for ${num.phoneNumber}`}
                                            />
                                            <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div>
                                        </label>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button 
                                            onClick={() => {
                                                if (confirm(`Remove access for +${num.phoneNumber}?`)) {
                                                    deleteMutation.mutate(num.id);
                                                }
                                            }}
                                            className="p-2 text-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                            title="Remove number"
                                        >
                                            <Trash2 size={16} />
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
