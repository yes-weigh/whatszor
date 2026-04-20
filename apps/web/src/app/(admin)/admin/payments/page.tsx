'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Loader2, CheckCircle2, XCircle, Clock, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function AdminPaymentsPage() {
    const qc = useQueryClient();
    // Track which row has the reject-note input open: { id, note }
    const [rejectTarget, setRejectTarget] = useState<{ id: string; note: string } | null>(null);

    const { data: requests, isLoading } = useQuery({
        queryKey: ['admin-payments'],
        queryFn: () => api.get('/billing/admin/payments').then(r => r.data)
    });

    const processMutation = useMutation({
        mutationFn: ({ id, action, adminNote }: { id: string; action: 'APPROVE' | 'REJECT'; adminNote?: string }) =>
            api.post(`/billing/admin/payments/${id}/process`, { action, adminNote }),
        onSuccess: () => {
            setRejectTarget(null);
            qc.invalidateQueries({ queryKey: ['admin-payments'] });
        }
    });

    if (isLoading) {
        return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-gray-500" /></div>;
    }

    return (
        <div className="p-8 max-w-6xl mx-auto w-full">
            <h1 className="text-2xl font-bold text-white mb-6">Payment Approvals</h1>

            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-lg">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-800/50 text-gray-400 text-sm border-b border-gray-800">
                            <th className="px-6 py-4 font-medium">Workspace</th>
                            <th className="px-6 py-4 font-medium">Plan &amp; Duration</th>
                            <th className="px-6 py-4 font-medium">UTR Reference</th>
                            <th className="px-6 py-4 font-medium">Amount</th>
                            <th className="px-6 py-4 font-medium">Status</th>
                            <th className="px-6 py-4 font-medium text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800 text-gray-300">
                        {requests?.map((req: any) => (
                            <>
                                <tr key={req.id} className="hover:bg-gray-800/30 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-white">{req.workspace.name}</div>
                                        <div className="text-xs text-gray-500 font-mono mt-1">{req.workspace.id}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <Badge variant="outline" className="bg-gray-800 border-gray-700 text-gray-200">
                                            {req.planTier}
                                        </Badge>
                                        <div className="text-xs text-gray-400 mt-2">{req.durationDays / 30} Months</div>
                                    </td>
                                    <td className="px-6 py-4 font-mono text-sm text-yellow-400/90">{req.transactionRef}</td>
                                    <td className="px-6 py-4 font-medium">₹ {parseInt(req.amountPaid || '0').toLocaleString()}</td>
                                    <td className="px-6 py-4">
                                        {req.status === 'PENDING'  && <Badge variant="warning"  className="flex items-center w-fit gap-1"><Clock size={12}/> PENDING</Badge>}
                                        {req.status === 'APPROVED' && <Badge variant="success"  className="flex items-center w-fit gap-1"><CheckCircle2 size={12}/> APPROVED</Badge>}
                                        {req.status === 'REJECTED' && <Badge variant="danger"   className="flex items-center w-fit gap-1 bg-red-900/50 text-red-500"><XCircle size={12}/> REJECTED</Badge>}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {req.status === 'PENDING' && (
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                                                    onClick={() => setRejectTarget(t => t?.id === req.id ? null : { id: req.id, note: '' })}
                                                    disabled={processMutation.isPending}
                                                >
                                                    Reject
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    className="bg-green-600 hover:bg-green-500 text-white border-none"
                                                    onClick={() => processMutation.mutate({ id: req.id, action: 'APPROVE' })}
                                                    disabled={processMutation.isPending}
                                                >
                                                    {processMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Approve'}
                                                </Button>
                                            </div>
                                        )}
                                        {req.status !== 'PENDING' && (
                                            <div className="text-xs text-gray-500 flex justify-end">
                                                Processed on {new Date(req.updatedAt).toLocaleDateString()}
                                            </div>
                                        )}
                                    </td>
                                </tr>

                                {/* Inline reject note row */}
                                {rejectTarget?.id === req.id && (
                                    <tr key={`${req.id}-reject`} className="bg-red-950/20 border-b border-red-900/30">
                                        <td colSpan={6} className="px-6 py-4">
                                            <div className="flex items-start gap-3">
                                                <MessageSquare size={16} className="text-red-400 mt-2.5 shrink-0" />
                                                <div className="flex-1 flex flex-col gap-2">
                                                    <label className="text-xs font-medium text-red-300">
                                                        Rejection reason <span className="text-gray-500">(optional — shown to workspace)</span>
                                                    </label>
                                                    <textarea
                                                        rows={2}
                                                        placeholder="e.g. UTR number not found in our records. Please resubmit with the correct reference."
                                                        className="w-full bg-gray-950 border border-red-900/50 text-white text-sm rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-red-500 resize-none"
                                                        value={rejectTarget?.note || ''}
                                                        onChange={e => setRejectTarget(t => t ? { ...t, note: e.target.value } : null)}
                                                    />
                                                </div>
                                                <div className="flex gap-2 mt-6">
                                                    <button
                                                        className="text-xs text-gray-500 hover:text-gray-300 px-3 py-1.5 transition-colors"
                                                        onClick={() => setRejectTarget(null)}
                                                    >
                                                        Cancel
                                                    </button>
                                                    <Button
                                                        size="sm"
                                                        className="bg-red-600 hover:bg-red-700 text-white border-none"
                                                        onClick={() => processMutation.mutate({ id: req.id, action: 'REJECT', adminNote: rejectTarget?.note || '' })}
                                                        disabled={processMutation.isPending}
                                                    >
                                                        {processMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Confirm Reject'}
                                                    </Button>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}

                                {/* Show rejection note if present */}
                                {req.status === 'REJECTED' && req.adminNote && (
                                    <tr key={`${req.id}-note`} className="bg-gray-800/20">
                                        <td colSpan={6} className="px-6 pb-3">
                                            <div className="flex items-start gap-2 text-xs text-gray-500">
                                                <MessageSquare size={12} className="mt-0.5 shrink-0" />
                                                <span>{req.adminNote}</span>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </>
                        ))}
                        {(!requests || requests.length === 0) && (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                    No payment requests found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
