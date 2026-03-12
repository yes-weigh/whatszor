import { Handle, Position, NodeProps } from '@xyflow/react';
import { Zap, Play, Clock, Tag, Globe, MessageSquare, Split, Bot, UserPlus, FileJson, AlertCircle } from 'lucide-react';

const iconMap: Record<string, React.ReactNode> = {
    'CONTACT_CREATED': <Zap size={16} className="text-yellow-400" />,
    'CONTACT_UPDATED': <Zap size={16} className="text-yellow-400" />,
    'MESSAGE_RECEIVED': <MessageSquare size={16} className="text-blue-400" />,
    'TAG_ADDED': <Tag size={16} className="text-purple-400" />,
    'SEND_WHATSAPP': <MessageSquare size={16} className="text-green-400" />,
    'DELAY': <Clock size={16} className="text-orange-400" />,
    'ADD_TAG': <Tag size={16} className="text-purple-400" />,
    'WEBHOOK': <Globe size={16} className="text-blue-500" />,
    'CONDITION': <Split size={16} className="text-pink-400" />,
    'AI_REPLY': <Bot size={16} className="text-emerald-400" />,
    'AI_INTENT': <Bot size={16} className="text-emerald-400" />,
    'HUMAN_HANDOFF': <UserPlus size={16} className="text-indigo-400" />,
    'HTTP_REQUEST': <FileJson size={16} className="text-cyan-400" />
};

export function NodeStatusBadge({ status, error }: { status?: string, error?: string }) {
    if (!status) return null;
    
    const statusMap: Record<string, string> = {
        'PENDING': 'bg-slate-500/10 text-slate-500 border-slate-500',
        'RUNNING': 'bg-blue-500/10 text-blue-500 border-blue-500 animate-pulse',
        'COMPLETED': 'bg-green-500/10 text-green-500 border-green-500',
        'FAILED': 'bg-red-500/10 text-red-500 border-red-500',
        'PAUSED': 'bg-yellow-500/10 text-yellow-500 border-yellow-500',
    };
    
    const colorClass = statusMap[status.toUpperCase()] || 'bg-theme text-secondary border-theme';
    
    return (
        <div className="absolute -top-3 -right-3 flex items-center gap-1 z-50">
            {error && (
                <div className="group relative">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/10 text-red-500 border border-red-500/30 cursor-help shadow-sm">
                        <AlertCircle size={12} />
                    </div>
                    <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-red-500 text-white text-[10px] font-medium leading-tight rounded border border-red-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none break-words shadow-xl">
                        {error}
                        <div className="absolute top-full right-1.5 w-2 h-2 bg-red-500 border-r border-b border-red-400 transform rotate-45 -mt-1.5" />
                    </div>
                </div>
            )}
            <div className={`px-2 py-0.5 rounded-full border text-[10px] font-bold bg-surface shadow-sm ${colorClass}`}>
                {status.toUpperCase()}
            </div>
        </div>
    );
}

export function TriggerNode({ data, selected }: NodeProps) {
    const type = (data.triggerType as string) || 'CONTACT_CREATED';
    const label = (data.label as string) || 'When contact is created';
    
    return (
        <div className={`relative shadow-xl rounded-xl border-2 transition-colors bg-surface ${selected ? 'border-primary shadow-primary/20' : 'border-theme'}`}>
            <NodeStatusBadge status={data.executionStatus as string} error={data.executionError as string} />
            <div className="px-4 py-3 flex items-center gap-3 min-w-[220px]">
                <div className="w-8 h-8 rounded-lg bg-body flex items-center justify-center border border-theme">
                    {iconMap[type] || <Zap size={16} className="text-yellow-400" />}
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-secondary tracking-wider">Trigger</span>
                    <span className="text-sm font-medium text-primary">{label}</span>
                </div>
            </div>
            
            <Handle 
                type="source" 
                position={Position.Bottom} 
                className="w-3 h-3 bg-body border-2 border-primary" 
            />
        </div>
    );
}

export function ActionNode({ data, selected }: NodeProps) {
    const type = (data.actionType as string) || 'ADD_TAG';
    const label = (data.label as string) || 'Add Tag';

    return (
        <div className={`relative shadow-xl rounded-xl border-2 transition-colors bg-surface ${selected ? 'border-blue-500 shadow-blue-500/20' : 'border-theme'}`}>
            <NodeStatusBadge status={data.executionStatus as string} error={data.executionError as string} />
            <Handle 
                type="target" 
                position={Position.Top} 
                className="w-3 h-3 bg-body border-2 border-theme" 
            />
            
            <div className="px-4 py-3 flex items-center gap-3 min-w-[220px]">
                <div className="w-8 h-8 rounded-lg bg-body flex items-center justify-center border border-theme">
                    {iconMap[type] || <Play size={16} className="text-blue-400" />}
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-secondary tracking-wider">Action</span>
                    <span className="text-sm font-medium text-primary">{label}</span>
                </div>
            </div>
            
            <Handle 
                type="source" 
                position={Position.Bottom} 
                className="w-3 h-3 bg-body border-2 border-theme" 
            />
        </div>
    );
}

export function ConditionNode({ data, selected }: NodeProps) {
    const label = (data.label as string) || 'Condition';
    
    return (
        <div className={`relative shadow-xl rounded-xl border-2 transition-colors bg-surface ${selected ? 'border-pink-500 shadow-pink-500/20' : 'border-theme'}`}>
            <NodeStatusBadge status={data.executionStatus as string} error={data.executionError as string} />
            <Handle type="target" position={Position.Top} className="w-3 h-3 bg-body border-2 border-theme" />
            
            <div className="px-4 py-3 flex items-center gap-3 min-w-[220px]">
                <div className="w-8 h-8 rounded-lg bg-body flex items-center justify-center border border-theme">
                    <Split size={16} className="text-pink-400" />
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-secondary tracking-wider">Condition</span>
                    <span className="text-sm font-medium text-primary">{label}</span>
                </div>
            </div>
            
            <div className="flex justify-between px-4 pb-2">
                <span className="text-xs text-green-500 font-semibold">True</span>
                <span className="text-xs text-red-500 font-semibold">False</span>
            </div>

            <Handle type="source" id="true" position={Position.Bottom} style={{ left: '25%' }} className="w-3 h-3 bg-body border-2 border-green-500" />
            <Handle type="source" id="false" position={Position.Bottom} style={{ left: '75%' }} className="w-3 h-3 bg-body border-2 border-red-500" />
        </div>
    );
}

export function DelayNode({ data, selected }: NodeProps) {
    const label = (data.label as string) || 'Delay';
    
    return (
        <div className={`relative shadow-xl rounded-xl border-2 transition-colors bg-surface ${selected ? 'border-orange-500 shadow-orange-500/20' : 'border-theme'}`}>
            <NodeStatusBadge status={data.executionStatus as string} error={data.executionError as string} />
            <Handle type="target" position={Position.Top} className="w-3 h-3 bg-body border-2 border-theme" />
            <div className="px-4 py-3 flex items-center gap-3 min-w-[220px]">
                <div className="w-8 h-8 rounded-lg bg-body flex items-center justify-center border border-theme">
                    <Clock size={16} className="text-orange-400" />
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-secondary tracking-wider">Wait</span>
                    <span className="text-sm font-medium text-primary">{label}</span>
                </div>
            </div>
            <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-body border-2 border-theme" />
        </div>
    );
}

export function AINode({ data, selected }: NodeProps) {
    const label = (data.label as string) || 'AI Action';
    const type = (data.actionType as string) || 'AI_REPLY';
    
    return (
        <div className={`relative shadow-xl rounded-xl border-2 transition-colors bg-surface ${selected ? 'border-emerald-500 shadow-emerald-500/20' : 'border-theme'}`}>
            <NodeStatusBadge status={data.executionStatus as string} error={data.executionError as string} />
            <Handle type="target" position={Position.Top} className="w-3 h-3 bg-body border-2 border-theme" />
            <div className="px-4 py-3 flex items-center gap-3 min-w-[220px]">
                <div className="w-8 h-8 rounded-lg bg-body flex items-center justify-center border border-theme">
                    {iconMap[type] || <Bot size={16} className="text-emerald-400" />}
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-secondary tracking-wider">AI Model</span>
                    <span className="text-sm font-medium text-primary">{label}</span>
                </div>
            </div>
            <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-body border-2 border-theme" />
        </div>
    );
}

export function HandoffNode({ data, selected }: NodeProps) {
    const label = (data.label as string) || 'Human Handoff';
    
    return (
        <div className={`relative shadow-xl rounded-xl border-2 transition-colors bg-surface ${selected ? 'border-indigo-500 shadow-indigo-500/20' : 'border-theme'}`}>
            <NodeStatusBadge status={data.executionStatus as string} error={data.executionError as string} />
            <Handle type="target" position={Position.Top} className="w-3 h-3 bg-body border-2 border-theme" />
            <div className="px-4 py-3 flex items-center gap-3 min-w-[220px]">
                <div className="w-8 h-8 rounded-lg bg-body flex items-center justify-center border border-theme">
                    <UserPlus size={16} className="text-indigo-400" />
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-secondary tracking-wider">Agent Routing</span>
                    <span className="text-sm font-medium text-primary">{label}</span>
                </div>
            </div>
            <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-body border-2 border-theme" />
        </div>
    );
}

export function IntegrationNode({ data, selected }: NodeProps) {
    const label = (data.label as string) || 'API Request';
    const type = (data.actionType as string) || 'HTTP_REQUEST';
    
    return (
        <div className={`relative shadow-xl rounded-xl border-2 transition-colors bg-surface ${selected ? 'border-cyan-500 shadow-cyan-500/20' : 'border-theme'}`}>
            <NodeStatusBadge status={data.executionStatus as string} error={data.executionError as string} />
            <Handle type="target" position={Position.Top} className="w-3 h-3 bg-body border-2 border-theme" />
            <div className="px-4 py-3 flex items-center gap-3 min-w-[220px]">
                <div className="w-8 h-8 rounded-lg bg-body flex items-center justify-center border border-theme">
                    {iconMap[type] || <FileJson size={16} className="text-cyan-400" />}
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-secondary tracking-wider">Integration</span>
                    <span className="text-sm font-medium text-primary">{label}</span>
                </div>
            </div>
            <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-body border-2 border-theme" />
        </div>
    );
}
