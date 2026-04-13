'use client';
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import {
    Sparkles, CheckCircle2, X, TrendingUp, MessageSquare,
    Loader2, RefreshCw, Brain, ChevronDown, ChevronUp,
    BarChart3, Clock
} from 'lucide-react';
import toast from 'react-hot-toast';

interface AutomationInsight {
    id: string;
    keyword: string;
    intent: string;
    frequency: number;
    suggestedReply: string;
    exampleMessages: string[];
    status: string;
    scannedAt: string;
}

// ── Intent display config ─────────────────────────────────────────────────────
const INTENT_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
    pricing:        { label: 'Pricing Inquiry',   color: 'bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',  emoji: '💰' },
    demo_request:   { label: 'Demo Request',      color: 'bg-blue-500/10 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300',        emoji: '🎯' },
    purchase_intent:{ label: 'Purchase Intent',   color: 'bg-purple-500/10 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300',    emoji: '🛒' },
    delivery_inquiry:{ label: 'Delivery Inquiry', color: 'bg-orange-500/10 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300',    emoji: '🚚' },
    availability:   { label: 'Stock Check',       color: 'bg-yellow-500/15 text-yellow-300',    emoji: '📦' },
    discount:       { label: 'Discount Inquiry',  color: 'bg-pink-500/10 dark:bg-pink-500/15 text-pink-700 dark:text-pink-300',        emoji: '🏷️' },
    support:        { label: 'Support Request',   color: 'bg-red-500/10 dark:bg-red-500/15 text-red-700 dark:text-red-300',          emoji: '🆘' },
    refund:         { label: 'Refund Request',    color: 'bg-red-500/10 dark:bg-red-500/15 text-red-700 dark:text-red-300',          emoji: '↩️' },
    contact_info:   { label: 'Contact Info',      color: 'bg-zinc-500/15 text-zinc-300',        emoji: '📞' },
    business_hours: { label: 'Business Hours',    color: 'bg-indigo-500/15 text-indigo-300',    emoji: '🕐' },
    general_inquiry:{ label: 'General Inquiry',   color: 'bg-zinc-500/15 text-muted',        emoji: '💬' },
};

function InsightCard({ insight, onAccept, onDismiss, isAccepting, isDismissing }: {
    insight: AutomationInsight;
    onAccept: () => void;
    onDismiss: () => void;
    isAccepting: boolean;
    isDismissing: boolean;
}) {
    const [showExamples, setShowExamples] = useState(false);
    const [showReply, setShowReply] = useState(false);

    const intentCfg = INTENT_CONFIG[insight.intent] ?? INTENT_CONFIG.general_inquiry;
    const examples: string[] = Array.isArray(insight.exampleMessages) ? insight.exampleMessages : [];

    return (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/[0.03] p-5 transition-all duration-200 hover:border-yellow-500/35">
            <div className="flex items-start gap-4">
                {/* Icon + freq badge */}
                <div className="shrink-0 flex flex-col items-center gap-1.5">
                    <div className="w-10 h-10 rounded-xl bg-yellow-500/15 flex items-center justify-center text-lg">
                        {intentCfg.emoji}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-yellow-400 font-semibold bg-yellow-500/15 px-2 py-0.5 rounded-full whitespace-nowrap">
                        <BarChart3 size={9} />
                        {insight.frequency}×
                    </div>
                </div>

                <div className="flex-1 min-w-0">
                    {/* Top row */}
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                        <code className="text-sm font-mono font-bold text-yellow-300 bg-yellow-500/15 px-2 py-0.5 rounded-md">
                            {insight.keyword}
                        </code>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${intentCfg.color}`}>
                            {intentCfg.label}
                        </span>
                    </div>

                    {/* Stats */}
                    <p className="text-xs text-secondary mb-3">
                        <TrendingUp size={10} className="inline mr-1 text-yellow-500" />
                        Detected <strong className="text-yellow-400">{insight.frequency} times</strong> in the last 3 days —
                        this keyword has no automation yet.
                    </p>

                    {/* AI suggested reply */}
                    <div className="rounded-lg border border-theme bg-white/[0.02] p-3 mb-3">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                                <Brain size={10} />
                                AI Suggested Reply
                            </p>
                            <button
                                type="button"
                                title={showReply ? 'Collapse reply' : 'Expand reply'}
                                aria-label={showReply ? 'Collapse reply' : 'Expand reply'}
                                onClick={() => setShowReply(!showReply)}
                                className="text-zinc-600 hover:text-zinc-300 transition-colors"
                            >
                                {showReply ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                        </div>
                        <p className={`text-xs text-zinc-300 leading-relaxed ${showReply ? '' : 'line-clamp-2'}`}>
                            {insight.suggestedReply}
                        </p>
                    </div>

                    {/* Example messages */}
                    {examples.length > 0 && (
                        <div className="mb-3">
                            <button
                                type="button"
                                title="Toggle example messages"
                                aria-label="Toggle example messages"
                                onClick={() => setShowExamples(!showExamples)}
                                className="flex items-center gap-1 text-[10px] text-zinc-600 hover:text-muted transition-colors"
                            >
                                <MessageSquare size={9} />
                                {showExamples ? 'Hide' : 'Show'} {examples.length} example messages
                                {showExamples ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                            </button>
                            {showExamples && (
                                <div className="mt-2 space-y-1.5">
                                    {examples.slice(0, 4).map((ex, i) => (
                                        <div key={i} className="flex items-start gap-2">
                                            <span className="text-[10px] text-zinc-600 shrink-0 mt-0.5">#{i + 1}</span>
                                            <p className="text-[11px] text-secondary italic truncate">&quot;{ex}&quot;</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        <button
                            id={`insight-accept-${insight.id}`}
                            onClick={onAccept}
                            disabled={isAccepting || isDismissing}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-500 text-black text-xs font-bold hover:bg-emerald-400 transition-colors disabled:opacity-50"
                        >
                            {isAccepting
                                ? <Loader2 size={12} className="animate-spin" />
                                : <CheckCircle2 size={12} />}
                            Automate This
                        </button>
                        <button
                            id={`insight-dismiss-${insight.id}`}
                            onClick={onDismiss}
                            disabled={isAccepting || isDismissing}
                            title="Dismiss suggestion"
                            aria-label="Dismiss this insight"
                            className="px-3 py-2 rounded-lg bg-elevated text-xs text-secondary hover:text-zinc-300 hover:bg-elevated transition-colors disabled:opacity-50"
                        >
                            {isDismissing ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function AutomationInsightsSection() {
    const qc = useQueryClient();
    const [acceptingId, setAcceptingId] = useState<string | null>(null);
    const [dismissingId, setDismissingId] = useState<string | null>(null);

    const { data, isLoading, isFetching } = useQuery<AutomationInsight[]>({
        queryKey: ['automation-insights'],
        queryFn: () => api.get('/automation-insights').then(r => Array.isArray(r.data) ? r.data : (Array.isArray(r) ? r : [])),
        staleTime: 5 * 60 * 1000,
    });

    const scanMutation = useMutation({
        mutationFn: () => api.post('/automation-insights/scan'),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['automation-insights'] }),
    });

    const acceptMutation = useMutation({
        mutationFn: (id: string) => api.post(`/automation-insights/${id}/accept`),
        onSuccess: () => {
            setAcceptingId(null);
            qc.invalidateQueries({ queryKey: ['automation-insights'] });
            qc.invalidateQueries({ queryKey: ['keyword-automations'] });
            toast.success('Automation rule created!');
        },
        onError: (err: any) => {
            setAcceptingId(null);
            toast.error(err.response?.data?.error?.message || 'Failed to accept suggestion');
        },
    });

    const dismissMutation = useMutation({
        mutationFn: (id: string) => api.post(`/automation-insights/${id}/dismiss`),
        onSuccess: () => {
            setDismissingId(null);
            qc.invalidateQueries({ queryKey: ['automation-insights'] });
            toast.success('Suggestion dismissed');
        },
        onError: (err: any) => {
            setDismissingId(null);
            toast.error(err.response?.data?.error?.message || 'Failed to dismiss suggestion');
        },
    });

    const insights = Array.isArray(data) ? data : [];
    const pendingCount = insights.length;

    if (!isLoading && pendingCount === 0 && !scanMutation.isPending && !isFetching) {
        // Render a subtle collapsed state when no insights are ready yet
        return (
            <div className="rounded-xl border border-theme bg-white/[0.02] p-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                            <Sparkles size={14} className="text-yellow-400" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-zinc-300">AI Automation Suggestions</p>
                            <p className="text-xs text-zinc-600 mt-0.5 flex items-center gap-1">
                                <Clock size={9} />
                                System is watching conversations for patterns — suggestions appear here
                            </p>
                        </div>
                    </div>
                    <button
                        id="insight-scan-now"
                        onClick={() => scanMutation.mutate()}
                        disabled={scanMutation.isPending}
                        title="Scan conversations now"
                        aria-label="Scan conversations for patterns now"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-elevated text-xs text-secondary hover:text-zinc-300 hover:bg-elevated transition-colors disabled:opacity-50"
                    >
                        {scanMutation.isPending
                            ? <Loader2 size={12} className="animate-spin" />
                            : <RefreshCw size={12} />}
                        Scan Now
                    </button>
                </div>
                {scanMutation.isSuccess && (
                    <div className="mt-3 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 size={12} />
                        Scan complete — {(scanMutation.data as any)?.newInsights ?? 0} new insights found
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-yellow-500/15 flex items-center justify-center">
                        <Sparkles size={16} className="text-yellow-400" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-primary">AI Automation Suggestions</h3>
                            {pendingCount > 0 && (
                                <span className="text-[10px] font-bold bg-yellow-500 text-black px-1.5 py-0.5 rounded-full">
                                    {pendingCount}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-secondary mt-0.5">
                            Patterns detected from real conversations — click to automate instantly
                        </p>
                    </div>
                </div>
                <button
                    id="insight-scan-now"
                    onClick={() => scanMutation.mutate()}
                    disabled={scanMutation.isPending || isFetching}
                    title="Scan conversations now"
                    aria-label="Scan conversations for patterns now"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-elevated text-xs text-secondary hover:text-zinc-300 hover:bg-elevated transition-colors disabled:opacity-50"
                >
                    {(scanMutation.isPending || isFetching)
                        ? <Loader2 size={12} className="animate-spin text-yellow-400" />
                        : <RefreshCw size={12} />}
                    Rescan
                </button>
            </div>

            {/* Revenue framing banner */}
            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 flex items-center gap-3">
                <Brain size={16} className="text-yellow-400 shrink-0" />
                <p className="text-xs text-muted leading-relaxed">
                    <span className="text-yellow-300 font-medium">The system scanned your conversations</span> and
                    found keywords that repeat without an automation. Each one below is a revenue opportunity —
                    one click turns a manual response into instant automation.
                </p>
            </div>

            {/* Loading */}
            {isLoading && (
                <div className="flex items-center justify-center py-8">
                    <Loader2 size={18} className="animate-spin text-yellow-500" />
                </div>
            )}

            {/* Insight cards */}
            <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-2 custom-scrollbar">
                {insights.map(insight => (
                    <InsightCard
                        key={insight.id}
                        insight={insight}
                        isAccepting={acceptingId === insight.id}
                        isDismissing={dismissingId === insight.id}
                        onAccept={() => {
                            setAcceptingId(insight.id);
                            acceptMutation.mutate(insight.id);
                        }}
                        onDismiss={() => {
                            setDismissingId(insight.id);
                            dismissMutation.mutate(insight.id);
                        }}
                    />
                ))}
            </div>
        </div>
    );
}
