'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Loader2, QrCode, CheckCircle2, Clock, XCircle, ArrowRight, KeyRound, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import QRCode from 'react-qr-code';

// Must match API (broadcast limits from pricing.ts)
const PLAN_LIMITS = {
    FREE:    { name: 'Free Tier',    price: 0,    maxBroadcastMessagesPerMonth: 500 },
    STARTER: { name: 'Starter Plan', price: 999,  maxBroadcastMessagesPerMonth: 10000 },
    PRO:     { name: 'Pro Plan',     price: 2499, maxBroadcastMessagesPerMonth: 50000 },
    AGENCY:  { name: 'Agency Plan',  price: 5999, maxBroadcastMessagesPerMonth: 500000 },
} as const;

export function BillingTab() {
    const qc = useQueryClient();
    const [utr, setUtr] = useState('');
    const [selectedTier, setSelectedTier] = useState<keyof typeof PLAN_LIMITS>('PRO');
    const [months, setMonths] = useState(1);
    // Map month selections to exact day counts (12 months = 365 days, not 360)
    const MONTH_TO_DAYS: Record<number, number> = { 1: 30, 3: 90, 6: 180, 12: 365 };
    const [licenseKey, setLicenseKey] = useState('');
    const [redeemSuccess, setRedeemSuccess] = useState(false);

    const { data: workspace, isLoading: wsLoading } = useQuery({
        queryKey: ['workspace-current'],
        queryFn: () => api.get('/workspaces/me').then(r => r.data)
    });

    const { data: paymentRequests, isLoading: reqsLoading } = useQuery({
        queryKey: ['payment-requests'],
        queryFn: () => api.get('/billing/payment-requests').then(r => r.data)
    });

    const { data: systemConfig, isLoading: configLoading } = useQuery({
        queryKey: ['billing-config'],
        queryFn: () => api.get('/billing/config').then(r => r.data)
    });

    const submitMutation = useMutation({
        mutationFn: (payload: any) => api.post('/billing/payment-requests', payload),
        onSuccess: () => {
            setUtr('');
            qc.invalidateQueries({ queryKey: ['payment-requests'] });
        }
    });

    const redeemMutation = useMutation({
        mutationFn: (key: string) => api.post('/licenses/redeem', { key }),
        onSuccess: () => {
            setRedeemSuccess(true);
            setLicenseKey('');
            qc.invalidateQueries({ queryKey: ['workspace-current'] });
        }
    });

    if (wsLoading || reqsLoading || configLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="animate-spin text-muted h-8 w-8" />
            </div>
        );
    }

    const activeTier = workspace?.planTier !== 'FREE' ? workspace?.planTier : (workspace?.plan?.toUpperCase() || 'FREE');
    const tierName = PLAN_LIMITS[activeTier as keyof typeof PLAN_LIMITS]?.name || activeTier || 'Free Tier';
    const amountToPay = PLAN_LIMITS[selectedTier].price * months;

    const upgradingTierName = PLAN_LIMITS[selectedTier]?.name || selectedTier;
    const merchantVpa = systemConfig?.UPI_VPA || 'whatsvue@upi';
    const merchantName = systemConfig?.UPI_MERCHANT_NAME || 'WhatsVue Software';
    const transactionNote = encodeURIComponent(`WhatsVue ${upgradingTierName} - ${months} Months`);
    const upiUri = amountToPay > 0 && merchantVpa
        ? `upi://pay?pa=${merchantVpa}&pn=${encodeURIComponent(merchantName)}&am=${amountToPay.toFixed(2)}&cu=INR&tn=${transactionNote}`
        : '';

    const handleSubmitData = (e: React.FormEvent) => {
        e.preventDefault();
        if (!utr.trim()) return;
        submitMutation.mutate({
            transactionRef: utr.trim(),
            planTier: selectedTier,
            durationDays: MONTH_TO_DAYS[months] ?? months * 30,
            amountPaid: amountToPay.toString()
        });
    };

    return (
        <div className="flex flex-col gap-8 max-w-4xl mx-auto md:mx-0">
            {/* Active Subscription Summary */}
            <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1 card bg-surface border-theme p-6 rounded-2xl flex flex-col gap-2 relative overflow-hidden group">
                    <div className="absolute -right-12 -top-12 w-40 h-40 bg-accent/10 rounded-full blur-3xl opacity-50 group-hover:opacity-100 transition-opacity"></div>
                    <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">Current Plan</h3>
                    <div className="text-3xl font-bold tracking-tight text-primary flex items-center gap-3">
                        {tierName}
                        {workspace?.planTier !== 'FREE' && (
                            <Badge variant="success" className="text-xs">Active</Badge>
                        )}
                    </div>
                    {workspace?.expiresAt ? (
                        <p className="text-sm text-secondary mt-1">
                            Expires on {new Date(workspace.expiresAt).toLocaleDateString()}
                        </p>
                    ) : (
                        <p className="text-sm text-secondary mt-1">Forever free limits applied.</p>
                    )}
                </div>

                <div className="flex-1 card bg-surface border-theme p-6 rounded-2xl flex flex-col gap-2">
                    <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">Usage Details</h3>
                    <div className="flex justify-between items-center mt-2">
                        <span className="text-sm font-medium text-secondary">Broadcasts this month</span>
                        <span className="text-sm font-bold text-primary">
                            {workspace?.broadcastUsageCurrentMonth || 0}
                            <span className="text-muted font-normal"> / {PLAN_LIMITS[workspace?.planTier as keyof typeof PLAN_LIMITS]?.maxBroadcastMessagesPerMonth ?? '—'}</span>
                        </span>
                    </div>
                    <div className="w-full bg-surface border border-theme rounded-full h-1.5 mt-1 overflow-hidden">
                        {(() => {
                            const used = workspace?.broadcastUsageCurrentMonth || 0;
                            const max = PLAN_LIMITS[workspace?.planTier as keyof typeof PLAN_LIMITS]?.maxBroadcastMessagesPerMonth ?? 1;
                            const pct = Math.min(Math.round((used / max) * 100), 100);
                            const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-accent';
                            return <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />;
                        })()}
                    </div>
                </div>
            </div>

            {/* Manual UPI Upgrade Section */}
            <div>
                <h2 className="text-xl font-bold tracking-tight text-primary mb-4">Upgrade Subscription</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    
                    {/* Payment Step */}
                    <div className="card bg-surface border-theme p-6 rounded-2xl flex flex-col gap-6">
                        <div className="flex items-center gap-3 border-b border-theme/50 pb-4">
                            <div className="w-10 h-10 rounded-xl bg-accent/10 flex flex-center items-center justify-center text-accent">
                                <QrCode size={20} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-primary">1. Scan & Pay via UPI</h3>
                                <p className="text-xs text-muted">Use any UPI app (GPay, PhonePe, Paytm)</p>
                            </div>
                        </div>

                        <div className="flex flex-col items-center justify-center py-6 bg-surface rounded-xl border border-theme/50 border-dashed">
                            {amountToPay > 0 ? (
                                <div className="p-3 bg-white rounded-xl shadow-md border border-zinc-200 hover:scale-105 transition-transform duration-300">
                                    <QRCode 
                                        value={upiUri} 
                                        size={180} 
                                        level="M" 
                                    />
                                </div>
                            ) : (
                                <div className="w-[180px] h-[180px] bg-white rounded-lg p-3 shadow-sm border border-zinc-200 flex flex-col items-center justify-center text-center px-4">
                                    <div className="w-12 h-12 rounded-full bg-green-500/10 flex flex-center items-center justify-center mb-2">
                                        <CheckCircle2 className="text-green-500" size={24} />
                                    </div>
                                    <span className="font-semibold text-zinc-800 text-sm">Free Tier</span>
                                    <span className="text-xs text-zinc-500 mt-1">No payment required.</span>
                                </div>
                            )}
                            <div className="mt-5 text-center flex flex-col gap-1 w-full px-6">
                                <div className="text-sm font-semibold text-primary bg-surface py-2 rounded-lg border border-theme w-full flex justify-between items-center px-3">
                                    <span className="text-muted font-normal">UPI ID</span>
                                    <span className="font-mono tracking-tight">{merchantVpa}</span>
                                </div>
                                <div className="text-xs text-muted mt-2">
                                    Paying <span className="font-semibold text-primary">₹{amountToPay.toLocaleString()}</span> to <span className="text-primary font-medium">{merchantName}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Submission Step */}
                    <div className="card bg-surface border-theme p-6 rounded-2xl flex flex-col gap-4">
                        <div className="flex items-center gap-3 border-b border-theme/50 pb-4">
                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex flex-center items-center justify-center text-blue-500">
                                <Clock size={20} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-primary">2. Submit Reference No.</h3>
                                <p className="text-xs text-muted">Admin approval takes ~10 minutes</p>
                            </div>
                        </div>

                        <form className="flex flex-col gap-4 mt-2" onSubmit={handleSubmitData}>
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-secondary">Select Plan</label>
                                <select 
                                    className="input text-sm"
                                    title="Select Subscription Plan"
                                    value={selectedTier}
                                    onChange={(e) => setSelectedTier(e.target.value as any)}
                                >
                                    <option value="STARTER">Starter Plan (₹999/mo)</option>
                                    <option value="PRO">Pro Plan (₹2,499/mo)</option>
                                    <option value="AGENCY">Agency Plan (₹5,999/mo)</option>
                                </select>
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-secondary">Duration (Months)</label>
                                <div className="flex items-center gap-2">
                                    {[1, 3, 6, 12].map(m => (
                                        <button 
                                            key={m} type="button"
                                            onClick={() => setMonths(m)}
                                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${months === m ? 'bg-accent text-white dark:text-zinc-950 border-accent' : 'bg-surface border-theme text-secondary hover:text-primary'} `}
                                        >
                                            {m}m
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex flex-col gap-1 border-t border-theme/50 pt-4 mt-2">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm font-medium text-secondary">Amount to Pay</span>
                                    <span className="text-xl font-bold text-primary">₹ {amountToPay.toLocaleString()}</span>
                                </div>
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-secondary">12-Digit UTR Number <span className="text-red-500">*</span></label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. 312345678901" 
                                    className="input font-mono text-sm"
                                    value={utr}
                                    onChange={e => setUtr(e.target.value)}
                                    maxLength={20}
                                    required
                                />
                            </div>

                            <Button type="submit" variant="accent" disabled={!utr.trim() || submitMutation.isPending} className="mt-2 w-full gap-2">
                                {submitMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <span>Submit for Activation</span>}
                                {!submitMutation.isPending && <ArrowRight size={16} />}
                            </Button>
                        </form>
                    </div>
                </div>
            </div>

            {/* License Key Redemption */}
            <div className="card bg-surface border-theme p-6 rounded-2xl flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent shrink-0">
                        <KeyRound size={20} />
                    </div>
                    <div>
                        <h3 className="font-semibold text-primary">Redeem a License Key</h3>
                        <p className="text-xs text-muted">Have a key from our sales team? Enter it below to activate instantly.</p>
                    </div>
                </div>

                {redeemSuccess ? (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20">
                        <CheckCircle2 size={18} className="text-green-500 shrink-0" />
                        <div>
                            <p className="text-sm font-semibold text-green-400">License Activated!</p>
                            <p className="text-xs text-green-500/70">Your plan has been upgraded. Enjoy the new features.</p>
                        </div>
                        <button
                            onClick={() => setRedeemSuccess(false)}
                            className="ml-auto text-xs text-muted hover:text-primary transition-colors"
                        >
                            Redeem another
                        </button>
                    </div>
                ) : (
                    <form
                        onSubmit={(e) => { e.preventDefault(); if (licenseKey.trim()) redeemMutation.mutate(licenseKey.trim()); }}
                        className="flex flex-col gap-3"
                    >
                        {redeemMutation.isError && (
                            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs">
                                <XCircle size={14} className="shrink-0" />
                                {(redeemMutation.error as any)?.response?.data?.message || 'Invalid or already redeemed key. Please check and try again.'}
                            </div>
                        )}
                        <div className="flex gap-2">
                            <input
                                type="text"
                                className="input font-mono text-sm flex-1 tracking-wider"
                                placeholder="WZOR-PRO-XXXX-XXXX-XXXX"
                                value={licenseKey}
                                onChange={e => { setLicenseKey(e.target.value); redeemMutation.reset(); }}
                                required
                            />
                            <button
                                type="submit"
                                disabled={!licenseKey.trim() || redeemMutation.isPending}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-black text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                            >
                                {redeemMutation.isPending
                                    ? <Loader2 size={15} className="animate-spin" />
                                    : <><Sparkles size={15} /> Activate</>}
                            </button>
                        </div>
                        <p className="text-[11px] text-muted">
                            Keys are single-use and tied to your organisation. Contact{' '}
                            <a href="mailto:support@whatsvue.com" className="text-accent hover:underline">support@whatsvue.com</a>{' '}
                            if you have issues.
                        </p>
                    </form>
                )}
            </div>

            {/* Past Requests */}
            {paymentRequests && paymentRequests.length > 0 && (
                <div className="mt-4">
                    <h3 className="text-sm font-bold text-primary uppercase tracking-wider mb-4">Payment History</h3>
                    <div className="flex flex-col gap-3">
                        {paymentRequests.map((req: any) => (
                            <div key={req.id} className="flex items-center justify-between p-4 rounded-xl border border-theme bg-surface hover:bg-elevated transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className={`p-2 rounded-lg flex items-center justify-center ${req.status === 'APPROVED' ? 'bg-green-500/10 text-green-500' : req.status === 'REJECTED' ? 'bg-red-500/10 text-red-500' : 'bg-yellow-500/10 text-yellow-500'}`}>
                                        {req.status === 'APPROVED' ? <CheckCircle2 size={16} /> : req.status === 'REJECTED' ? <XCircle size={16} /> : <Clock size={16} />}
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-primary">{PLAN_LIMITS[req.planTier as keyof typeof PLAN_LIMITS]?.name || req.planTier}</span>
                                            <span className="text-xs text-secondary">• {req.durationDays / 30} Months</span>
                                        </div>
                                        <span className="text-xs text-muted font-mono mt-0.5">UTR: {req.transactionRef}</span>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="font-bold text-primary">₹ {parseInt(req.amountPaid).toLocaleString()}</span>
                                    <span className="text-xs text-muted">{new Date(req.createdAt).toLocaleDateString()}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

        </div>
    );
}
