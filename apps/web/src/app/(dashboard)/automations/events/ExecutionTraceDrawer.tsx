import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, Clock, Activity, PlayCircle } from 'lucide-react';
import api from '@/lib/api';
import { format } from 'date-fns';

interface TraceDrawerProps {
    event: any;
    onClose: () => void;
    onReplay?: (executionId: string, ruleId: string) => void;
}

export function ExecutionTraceDrawer({ event, onClose, onReplay }: TraceDrawerProps) {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (event?.payloadMetadata?.executionId) {
            fetchLogs(event.payloadMetadata.ruleId, event.payloadMetadata.executionId);
        }
    }, [event]);

    const fetchLogs = async (ruleId: string, executionId: string) => {
        setLoading(true);
        try {
            const { data } = await api.get(`/automations/${ruleId}/executions/${executionId}/logs`);
            setLogs(data.logs || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (!event) return null;

    const hasTrace = !!event.payloadMetadata?.executionId;

    return (
        <div className="absolute top-0 right-0 w-96 h-full bg-surface border-l border-theme shadow-2xl z-50 flex flex-col transform transition-transform duration-300">
            {/* Header */}
            <div className="h-16 flex items-center justify-between px-6 border-b border-theme shrink-0 bg-elevated/80 backdrop-blur">
                <h3 className="font-semibold text-primary flex items-center gap-2">
                    <Activity size={18} className="text-secondary" />
                    Event Inspection
                </h3>
                <button aria-label="Close drawer" onClick={onClose} className="p-2 hover:bg-elevated rounded-lg text-muted hover:text-primary transition-colors">
                    <X size={18} />
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto w-full flex flex-col">
                <div className="p-5 border-b border-theme bg-surface">
                    <div className="flex flex-col gap-1 mb-4">
                        <span className="text-sm font-medium text-primary">{event.eventType}</span>
                        <span className="text-xs text-muted">{format(new Date(event.createdAt), 'MMM d, yyyy HH:mm:ss.SSS')}</span>
                    </div>

                    <div className="bg-elevated rounded-xl border border-divider/50 p-4">
                        <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Payload Details</h4>
                        <pre className="text-xs text-secondary font-mono leading-relaxed overflow-x-auto">
                            {JSON.stringify(event.payloadMetadata, null, 2)}
                        </pre>
                    </div>
                </div>

                {hasTrace ? (
                    <div className="flex flex-col p-5 bg-elevated/30 flex-1">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="text-xs font-semibold text-muted uppercase tracking-wider">Execution Trace</h4>
                            {onReplay && event.payloadMetadata?.ruleId && event.payloadMetadata?.executionId && (
                                <button 
                                    onClick={() => onReplay(event.payloadMetadata.executionId, event.payloadMetadata.ruleId)}
                                    className="text-xs flex items-center gap-1.5 text-blue-500 hover:text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-1 rounded"
                                >
                                    <PlayCircle size={14} />
                                    Replay on Canvas
                                </button>
                            )}
                        </div>

                        {loading ? (
                            <div className="text-center text-sm text-muted py-8">Loading execution trace...</div>
                        ) : logs.length === 0 ? (
                            <div className="text-center text-sm text-muted py-8">No steps executed yet.</div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                {logs.map((log, i) => (
                                    <div key={log.id} className="relative pl-6">
                                        {/* Timeline Line */}
                                        {i !== logs.length - 1 && <div className="absolute left-[11px] top-6 bottom-[-24px] w-0.5 bg-theme" />}
                                        
                                        {/* Timeline Dot */}
                                        <div className={`absolute left-0 top-1 w-[24px] h-[24px] rounded-full flex items-center justify-center bg-surface border-2 ${
                                            log.status === 'FAILED' ? 'border-red-500/50 text-red-500 bg-red-500/10' :
                                            log.status === 'PAUSED' ? 'border-orange-500/50 text-orange-500 bg-orange-500/10' : 
                                            'border-success/50 text-success bg-success/10'
                                        }`}>
                                            {log.status === 'FAILED' ? <AlertCircle size={12} /> : 
                                             log.status === 'PAUSED' ? <Clock size={12} /> : 
                                             <CheckCircle2 size={12} />}
                                        </div>

                                        {/* Log Content */}
                                        <div className="bg-surface border border-theme rounded-xl p-3 shadow-sm hover:border-blue-500/30 transition-colors">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-sm font-semibold text-primary">{log.nodeType}</span>
                                                <span className="text-[10px] text-muted">{log.durationMs}ms</span>
                                            </div>
                                            
                                            {log.error && (
                                                <div className="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-400/10 p-2 rounded border border-red-500/20 break-words">
                                                    {log.error}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="p-8 text-center text-muted flex flex-col items-center gap-3">
                        <Activity size={32} className="opacity-50" />
                        <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium text-primary">No Trace Available</span>
                            <span className="text-xs">This event does not have an associated execution trace.</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
