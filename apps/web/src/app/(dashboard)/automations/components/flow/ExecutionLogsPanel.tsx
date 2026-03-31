import React, { useState, useEffect } from 'react';
import { X, PlayCircle, Clock, ChevronRight, Activity, AlertCircle, CheckCircle2 } from 'lucide-react';
import api from '@/lib/api';

export function ExecutionLogsPanel({ ruleId, onClose, onLogsLoaded }: { ruleId: string, onClose: () => void, onLogsLoaded?: (logs: any[]) => void }) {
    const [executions, setExecutions] = useState<any[]>([]);
    const [selectedExecution, setSelectedExecution] = useState<any | null>(null);
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!ruleId) return;
        fetchExecutions();
    }, [ruleId]);

    const fetchExecutions = async () => {
        setLoading(true);
        try {
            const { data } = await api.get(`/automations/${ruleId}/executions`);
            setExecutions(data.executions || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchLogs = async (executionId: string) => {
        setSelectedExecution(executions.find(e => e.id === executionId));
        setLoading(true);
        try {
            const { data } = await api.get(`/automations/${ruleId}/executions/${executionId}/logs`);
            const loadedLogs = data.logs || [];
            setLogs(loadedLogs);
            if (onLogsLoaded) onLogsLoaded(loadedLogs);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="absolute top-0 right-0 w-96 h-full bg-surface border-l border-theme shadow-2xl z-50 flex flex-col transform transition-transform duration-300 translate-x-0">
            {/* Header */}
            <div className="h-16 flex items-center justify-between px-6 border-b border-theme shrink-0">
                <h3 className="font-semibold text-primary flex items-center gap-2">
                    <Activity size={18} className="text-secondary" />
                    Execution History
                </h3>
                <button aria-label="Close logs panel" onClick={onClose} className="p-2 hover:bg-elevated rounded-lg text-muted hover:text-primary transition-colors">
                    <X size={18} />
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto w-full flex flex-col relative">
                {selectedExecution ? (
                    <div className="flex flex-col h-full fade-in">
                        <div className="p-4 border-b border-theme bg-elevated/50 flex items-center gap-2 shrink-0">
                            <button aria-label="Back to executions list" onClick={() => {
                                setSelectedExecution(null);
                                if (onLogsLoaded) onLogsLoaded([]);
                            }} className="text-muted hover:text-primary p-1">
                                &larr;
                            </button>
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-primary">Run details</span>
                                <span className="text-xs text-muted">{new Date(selectedExecution.startedAt || selectedExecution.createdAt).toLocaleString()}</span>
                            </div>
                        </div>
                        
                        <div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto">
                            {loading ? (
                                <div className="text-center text-sm text-muted mt-8">Loading footprint...</div>
                            ) : logs.length === 0 ? (
                                <div className="text-center text-sm text-muted mt-8">No steps executed yet.</div>
                            ) : (
                                logs.map((log, i) => (
                                    <div key={log.id} className="relative pl-6">
                                        {/* Timeline Line */}
                                        {i !== logs.length - 1 && <div className="absolute left-[11px] top-6 bottom-[-24px] w-0.5 bg-theme" />}
                                        
                                        {/* Timeline Dot */}
                                        <div className={`absolute left-0 top-1 w-[24px] h-[24px] rounded-full flex items-center justify-center bg-surface border-2 ${
                                            log.status === 'FAILED' ? 'border-red-500/50 text-red-500' :
                                            log.status === 'PAUSED' ? 'border-orange-500/50 text-orange-500' : 
                                            'border-success/50 text-success'
                                        }`}>
                                            {log.status === 'FAILED' ? <AlertCircle size={12} /> : 
                                             log.status === 'PAUSED' ? <Clock size={12} /> : 
                                             <CheckCircle2 size={12} />}
                                        </div>

                                        {/* Log Content */}
                                        <div className="bg-elevated border border-theme rounded-xl p-3 shadow-sm">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-sm font-semibold text-primary">{log.nodeType}</span>
                                                <span className="text-[10px] text-muted">{log.durationMs}ms</span>
                                            </div>
                                            
                                            {log.error && (
                                                <div className="mt-2 text-xs text-red-400 bg-red-400/10 p-2 rounded border border-red-500/20 break-words">
                                                    {log.error}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="p-4 flex flex-col gap-2">
                        {loading && <div className="text-center text-sm text-muted">Loading...</div>}
                        {!loading && executions.length === 0 && (
                            <div className="text-center mt-10 text-muted">No runs found for this flow.</div>
                        )}
                        {executions.map(exec => (
                            <div 
                                key={exec.id} 
                                onClick={() => fetchLogs(exec.id)}
                                className="p-3 bg-elevated border border-theme rounded-xl hover:border-blue-500/30 cursor-pointer transition-all flex items-center justify-between"
                            >
                                <div className="flex flex-col gap-1">
                                    <span className="text-sm font-medium text-primary flex items-center gap-2">
                                        <PlayCircle size={14} className="text-secondary" />
                                        {new Date(exec.startedAt || exec.createdAt).toLocaleString()}
                                    </span>
                                    <span className={`text-xs w-fit px-1.5 rounded ${
                                        exec.status === 'FAILED' ? 'bg-red-500/10 text-red-500' : 
                                        exec.status === 'RUNNING' ? 'bg-blue-500/10 text-blue-500' : 
                                        'bg-success/10 text-success'
                                    }`}>
                                        {exec.status}
                                    </span>
                                </div>
                                <ChevronRight size={16} className="text-muted" />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
