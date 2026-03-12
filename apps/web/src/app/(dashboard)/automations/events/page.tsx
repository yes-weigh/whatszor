'use client';

import { Header } from '@/components/layout/Header';
import api from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { Activity, MessageSquare, Webhook, Zap, AlertTriangle, PlayCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';
import { ExecutionTraceDrawer } from './ExecutionTraceDrawer';

const EventIconMap: Record<string, any> = {
    message_received: MessageSquare,
    message_sent: MessageSquare,
    webhook_received: Webhook,
    automation_triggered: Zap,
    node_executed: PlayCircle,
    node_failed: AlertTriangle,
    contact_created: Activity,
    contact_updated: Activity,
    campaign_sent: Activity,
};

const EventColorMap: Record<string, string> = {
    message_received: 'text-blue-500 bg-blue-500/10',
    message_sent: 'text-blue-400 bg-blue-400/10',
    webhook_received: 'text-purple-500 bg-purple-500/10',
    automation_triggered: 'text-yellow-500 bg-yellow-500/10',
    node_executed: 'text-green-500 bg-green-500/10',
    node_failed: 'text-red-500 bg-red-500/10',
    contact_created: 'text-emerald-500 bg-emerald-500/10',
    contact_updated: 'text-emerald-400 bg-emerald-400/10',
    campaign_sent: 'text-indigo-500 bg-indigo-500/10',
};

export default function EventsTimelinePage() {
    const [eventTypeFilter, setEventTypeFilter] = useState<string>('');
    const [page, setPage] = useState(0);
    const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
    const take = 50;

    const { data, isLoading } = useQuery({
        queryKey: ['events', eventTypeFilter, page],
        queryFn: async () => {
            const params = new URLSearchParams({
                skip: (page * take).toString(),
                take: take.toString(),
            });
            if (eventTypeFilter) params.append('eventType', eventTypeFilter);
            
            const res = await api.get(`/observability/events?${params.toString()}`);
            return res.data?.data; // { events: [], total: number }
        },
    });

    const events = data?.events || [];
    const total = data?.total || 0;

    return (
        <div className="flex flex-col h-full">
            <Header title="Event Timeline" subtitle="Global observability and execution tracing" />
            
            <div className="p-6 flex flex-col gap-4 flex-1 overflow-y-auto">
                {/* Filters */}
                <div className="flex items-center gap-4 bg-elevated p-4 rounded-xl border border-divider">
                    <div className="flex flex-col gap-1">
                        <label htmlFor="eventTypeSelect" className="text-xs text-muted font-medium">Event Type</label>
                        <select 
                            id="eventTypeSelect"
                            aria-label="Filter by event type"
                            className="input w-48"
                            value={eventTypeFilter}
                            onChange={(e) => {
                                setEventTypeFilter(e.target.value);
                                setPage(0);
                            }}
                        >
                            <option value="">All Events</option>
                            <option value="message_received">Message Received</option>
                            <option value="message_sent">Message Sent</option>
                            <option value="webhook_received">Webhook Received</option>
                            <option value="automation_triggered">Automation Triggered</option>
                            <option value="node_executed">Node Executed</option>
                            <option value="node_failed">Node Failed</option>
                            <option value="contact_created">Contact Created</option>
                            <option value="campaign_sent">Campaign Sent</option>
                        </select>
                    </div>
                </div>

                {/* Timeline */}
                <div className="card p-0 overflow-hidden relative">
                    {isLoading && (
                        <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-10">
                            <Loader2 className="animate-spin text-primary" size={24} />
                        </div>
                    )}
                    
                    {events.length === 0 && !isLoading ? (
                        <div className="p-12 text-center text-muted flex flex-col items-center gap-2">
                            <Activity size={32} />
                            <p>No events found for this filter.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col divide-y divide-divider/50">
                            {events.map((event: any) => {
                                const IconContainer = EventIconMap[event.eventType] || Activity;
                                const colorClass = EventColorMap[event.eventType] || 'text-gray-400 bg-gray-400/10';

                                return (
                                    <div 
                                        key={event.id} 
                                        className="p-4 hover:bg-elevated/50 transition-colors flex gap-4 cursor-pointer"
                                        onClick={() => setSelectedEvent(event)}
                                    >
                                        <div className="flex flex-col items-center gap-2 pt-1">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${colorClass}`}>
                                                <IconContainer size={14} />
                                            </div>
                                            <div className="w-px h-full bg-divider/50 min-h-[20px]"></div>
                                        </div>
                                        
                                        <div className="flex-1 min-w-0 pb-2">
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="font-medium text-sm text-primary flex items-center gap-2">
                                                    {event.eventType}
                                                    <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-divider text-muted">
                                                        {event.sourceModule}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-muted tabular-nums">
                                                    {format(new Date(event.createdAt), 'MMM d, HH:mm:ss.SSS')}
                                                </div>
                                            </div>
                                            
                                            <div className="mt-2 bg-background rounded border border-divider/50 p-2.5 overflow-x-auto text-xs text-secondary font-mono leading-relaxed max-h-32">
                                                <pre>
                                                    {JSON.stringify(event.payloadMetadata, null, 2)}
                                                </pre>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {total > take && (
                    <div className="flex items-center justify-between mt-2">
                        <span className="text-sm text-muted">
                            Showing {page * take + 1} - {Math.min((page + 1) * take, total)} of {total} events
                        </span>
                        <div className="flex gap-2">
                            <button 
                                className="btn btn-ghost disabled:opacity-50" 
                                disabled={page === 0}
                                onClick={() => setPage(p => p - 1)}
                            >
                                Previous
                            </button>
                            <button 
                                className="btn btn-ghost disabled:opacity-50"
                                disabled={(page + 1) * take >= total}
                                onClick={() => setPage(p => p + 1)}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Side Drawer Component */}
            {selectedEvent && (
                <ExecutionTraceDrawer 
                    event={selectedEvent} 
                    onClose={() => setSelectedEvent(null)}
                    onReplay={(executionId, ruleId) => {
                        window.location.href = `/automations/create?ruleId=${ruleId}&replayExecutionId=${executionId}`;
                    }}
                />
            )}
        </div>
    );
}
