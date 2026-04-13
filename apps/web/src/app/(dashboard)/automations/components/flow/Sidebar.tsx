import React from 'react';
import { Play, Clock, Split, Bot, Globe, UserPlus, Tag, MessageSquare, UserCheck, Megaphone, Zap } from 'lucide-react';

export function Sidebar() {
    const onDragStart = (event: React.DragEvent, nodeType: string, actionType: string, label: string) => {
        event.dataTransfer.setData('application/reactflow/type', nodeType);
        event.dataTransfer.setData('application/reactflow/actionType', actionType);
        event.dataTransfer.setData('application/reactflow/label', label);
        event.dataTransfer.effectAllowed = 'move';
    };

    const triggerTypes = [
        { type: 'trigger', actionType: 'MESSAGE_RECEIVED', label: 'Message Received', icon: <MessageSquare size={16} className="text-blue-600 dark:text-blue-400" /> },
        { type: 'trigger', actionType: 'CONTACT_CREATED', label: 'Contact Created', icon: <UserCheck size={16} className="text-green-400" /> },
        { type: 'trigger', actionType: 'CONTACT_UPDATED', label: 'Contact Updated', icon: <UserCheck size={16} className="text-yellow-400" /> },
        { type: 'trigger', actionType: 'CAMPAIGN_SENT', label: 'Campaign Sent', icon: <Megaphone size={16} className="text-pink-600 dark:text-pink-400" /> },
    ];

    const nodeTypes = [
        { type: 'action', actionType: 'SEND_WHATSAPP', label: 'Send WhatsApp', icon: <Play size={16} className="text-green-400" /> },
        { type: 'action', actionType: 'ADD_TAG', label: 'Add Tag', icon: <Tag size={16} className="text-purple-600 dark:text-purple-400" /> },
        { type: 'condition', actionType: 'CONDITION', label: 'Condition', icon: <Split size={16} className="text-pink-600 dark:text-pink-400" /> },
        { type: 'delay', actionType: 'DELAY', label: 'Delay', icon: <Clock size={16} className="text-orange-600 dark:text-orange-400" /> },
        { type: 'ai', actionType: 'AI_REPLY', label: 'AI Reply', icon: <Bot size={16} className="text-emerald-600 dark:text-emerald-400" /> },
        { type: 'integration', actionType: 'HTTP_REQUEST', label: 'HTTP Request', icon: <Globe size={16} className="text-cyan-400" /> },
        { type: 'handoff', actionType: 'HUMAN_HANDOFF', label: 'Human Handoff', icon: <UserPlus size={16} className="text-indigo-400" /> },
    ];

    const nodeItem = (node: typeof nodeTypes[0], i: number) => (
        <div
            key={i}
            className="bg-body border border-theme rounded-lg p-3 flex items-center gap-3 cursor-grab hover:border-primary transition-colors text-primary text-sm font-medium shadow-sm hover:shadow-primary/10"
            onDragStart={(event) => onDragStart(event, node.type, node.actionType, node.label)}
            draggable
        >
            {node.icon}
            {node.label}
        </div>
    );

    return (
        <aside className="w-64 bg-surface border-r border-theme flex flex-col h-full overflow-y-auto z-10 p-4 shrink-0">
            <div className="flex flex-col gap-3">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <Zap size={12} className="text-yellow-400" />
                        <h3 className="text-secondary font-bold uppercase text-xs tracking-wider">Triggers</h3>
                    </div>
                    <p className="text-muted text-xs mb-3">Drag a trigger to replace the current one.</p>
                    <div className="flex flex-col gap-2">
                        {triggerTypes.map((node, i) => nodeItem(node, i))}
                    </div>
                </div>

                <div className="border-t border-theme pt-3">
                    <div className="flex items-center gap-2 mb-2">
                        <Play size={12} className="text-green-400" />
                        <h3 className="text-secondary font-bold uppercase text-xs tracking-wider">Actions</h3>
                    </div>
                    <div className="flex flex-col gap-2">
                        {nodeTypes.map((node, i) => nodeItem(node, i))}
                    </div>
                </div>
            </div>
        </aside>
    );
}
