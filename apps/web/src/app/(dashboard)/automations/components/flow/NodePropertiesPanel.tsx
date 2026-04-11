import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Copy, Plus, Minus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

interface NodePropertiesPanelProps {
    selectedNode: any | null;
    onClose: () => void;
    onUpdateNodeData: (id: string, partialData: any) => void;
    onDelete?: (id: string) => void;
    onDuplicate?: (id: string) => void;
    sessions?: any[]; // Fetched once at FlowCanvas level
}

// ── Field presets for condition builder ──────────────────────
const FIELD_PRESETS = [
    { label: 'Contact: Name',         value: 'contact.name' },
    { label: 'Contact: Phone',        value: 'contact.phone' },
    { label: 'Contact: Email',        value: 'contact.email' },
    { label: 'Contact: Status',       value: 'contact.status' },
    { label: 'Contact: Tags',         value: 'contact.tags' },
    { label: 'Contact: Custom Data…', value: 'contact.customData.' },
    { label: 'Message: Body',         value: 'event.content' },
    { label: 'Message: Session ID',   value: 'event.sessionId' },
    { label: 'Custom Path…',          value: '_custom_' },
];

const OPERATORS = [
    { label: 'Equals',        value: 'eq' },
    { label: 'Not Equals',    value: 'neq' },
    { label: 'Contains',      value: 'contains' },
    { label: 'Not Contains',  value: 'not_contains' },
    { label: 'Starts With',   value: 'starts_with' },
    { label: 'Ends With',     value: 'ends_with' },
    { label: 'Greater Than',  value: 'gt' },
    { label: 'Less Than',     value: 'lt' },
    { label: 'Is Set',        value: 'is_set' },
    { label: 'Is Not Set',    value: 'is_not_set' },
];

const emptyCondition = () => ({ type: 'expression', field: 'contact.status', operator: 'eq', value: '' });

// ── Session Selector Component ────────────────────────────────
function SessionSelector({
    sessions = [], value, onChange, label, isMulti = false
}: {
    sessions: any[];
    value: string | string[];
    onChange: (v: string | string[]) => void;
    label: string;
    isMulti?: boolean;
}) {
    const inputClasses = "w-full bg-base border border-theme rounded-lg px-3 py-2 text-primary focus:outline-none focus:border-primary transition-colors text-sm";

    if (isMulti) {
        const selected: string[] = Array.isArray(value) ? value : [];
        const toggle = (id: string) => {
            const next = selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id];
            onChange(next);
        };
        return (
            <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-secondary">{label}</label>
                {sessions.length === 0 ? (
                    <p className="text-xs text-muted">No WhatsApp sessions connected yet.</p>
                ) : (
                    <div className="flex flex-col gap-1">
                        {sessions.map((s: any) => (
                            <label key={s.id} className="flex items-center gap-2 cursor-pointer text-sm text-primary py-1 px-2 rounded-lg bg-body border border-theme hover:border-primary transition-colors">
                                <input
                                    type="checkbox"
                                    checked={selected.includes(s.id)}
                                    onChange={() => toggle(s.id)}
                                    className="accent-primary"
                                />
                                <span className="flex-1">{s.name || s.phoneNumber || s.id}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ${s.status === 'CONNECTED' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                                    {s.status || 'Unknown'}
                                </span>
                            </label>
                        ))}
                        {selected.length === 0 && <p className="text-xs text-muted mt-1">All sessions will trigger this flow (no filter).</p>}
                    </div>
                )}
            </div>
        );
    }

    // Single select
    return (
        <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-secondary">{label}</label>
            <select
                title={label}
                value={typeof value === 'string' ? value : ''}
                onChange={e => onChange(e.target.value)}
                className={inputClasses}
            >
                <option value="">— Default / Any Session —</option>
                {sessions.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name || s.phoneNumber || s.id}</option>
                ))}
            </select>
        </div>
    );
}

// ── Condition Row ─────────────────────────────────────────────
function ConditionRow({ cond, index, onUpdate, onRemove, showRemove }: {
    cond: any; index: number;
    onUpdate: (i: number, field: string, val: string) => void;
    onRemove: (i: number) => void;
    showRemove: boolean;
}) {
    const inputClasses = "w-full bg-base border border-theme rounded-lg px-3 py-2 text-primary focus:outline-none focus:border-primary transition-colors text-sm";

    const noValueOps = ['is_set', 'is_not_set'];
    const isPresetMatch = FIELD_PRESETS.some(p => p.value === cond.field && !p.value.endsWith('.') && p.value !== '_custom_');
    const isCustomData = cond.field?.startsWith('contact.customData.');
    const showCustomInput = !isPresetMatch || isCustomData;

    const selectValue = isCustomData
        ? 'contact.customData.'
        : (isPresetMatch ? cond.field : '_custom_');

    const handleFieldPreset = (val: string) => {
        if (val === '_custom_') { onUpdate(index, 'field', ''); }
        else if (val.endsWith('.')) { onUpdate(index, 'field', val); }
        else { onUpdate(index, 'field', val); }
    };

    return (
        <div className="flex flex-col gap-2 bg-body border border-theme rounded-lg p-3">
            <div className="flex items-center justify-between">
                <span className="text-xs text-muted font-semibold uppercase">Condition {index + 1}</span>
                {showRemove && (
                    <button onClick={() => onRemove(index)} className="p-1 text-red-400 hover:text-red-300 transition-colors" title="Remove condition">
                        <Minus size={14} />
                    </button>
                )}
            </div>

            {/* Field preset picker */}
            <select
                title="Field"
                className={inputClasses}
                value={selectValue}
                onChange={e => handleFieldPreset(e.target.value)}
            >
                {FIELD_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>

            {/* Free-text field for custom / customData paths */}
            {showCustomInput && (
                <input
                    type="text"
                    className={inputClasses}
                    placeholder="e.g. contact.customData.tier"
                    value={cond.field}
                    onChange={e => onUpdate(index, 'field', e.target.value)}
                />
            )}

            {/* Operator */}
            <select
                title="Operator"
                className={inputClasses}
                value={cond.operator}
                onChange={e => onUpdate(index, 'operator', e.target.value)}
            >
                {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
            </select>

            {/* Value (hidden for is_set / is_not_set) */}
            {!noValueOps.includes(cond.operator) && (
                <input
                    type="text"
                    className={inputClasses}
                    placeholder="Value to compare"
                    value={cond.value || ''}
                    onChange={e => onUpdate(index, 'value', e.target.value)}
                />
            )}
        </div>
    );
}


// ── Main Panel ────────────────────────────────────────────────
export function NodePropertiesPanel({ selectedNode, onClose, onUpdateNodeData, onDelete, onDuplicate, sessions = [] }: NodePropertiesPanelProps) {
    const { data: q } = useQuery({
        queryKey: ['products-list'],
        queryFn: () => api.get('/products').then(r => r.data)
    });
    const products = q?.products || [];

    if (!selectedNode) return null;

    const data = selectedNode.data;
    const isTrigger = selectedNode.type === 'trigger';

    const inputClasses = "w-full bg-base border border-theme rounded-lg px-3 py-2 text-primary focus:outline-none focus:border-primary transition-colors text-sm";

    const handleUpdate = (key: string, value: any) => {
        onUpdateNodeData(selectedNode.id, { [key]: value });
    };

    // ── Condition helpers ──
    const conditions: any[] = data.conditions || [emptyCondition()];
    const conditionLogic: 'AND' | 'OR' = data.conditionLogic || 'AND';

    const updateCondition = (i: number, field: string, val: string) => {
        const next = conditions.map((c, idx) => idx === i ? { ...c, [field]: val } : c);
        handleUpdate('conditions', next);
    };
    const addCondition = () => handleUpdate('conditions', [...conditions, emptyCondition()]);
    const removeCondition = (i: number) => handleUpdate('conditions', conditions.filter((_, idx) => idx !== i));

    return (
        <AnimatePresence>
            <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="absolute top-0 right-0 h-full w-80 bg-surface border-l border-theme shadow-2xl z-50 flex flex-col"
            >
                <div className="p-4 border-b border-theme flex items-center justify-between">
                    <h3 className="font-bold text-primary">
                        {isTrigger ? 'Trigger Properties' : 'Node Properties'}
                    </h3>
                    <button onClick={onClose}
                            className="p-1 hover:bg-body rounded-md text-secondary hover:text-primary transition-colors"
                            title="Close Properties Panel">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-5 flex flex-col gap-5 overflow-y-auto w-full flex-1">

                    {/* ── TRIGGER CONFIG ── */}
                    {isTrigger && (
                        <>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-secondary">Trigger Event</label>
                                <select
                                    title="Trigger Event Selection"
                                    value={data.triggerType || 'MESSAGE_RECEIVED'}
                                    onChange={(e) => {
                                        const t = e.target.value;
                                        handleUpdate('triggerType', t);
                                        const labels: any = {
                                            'MESSAGE_RECEIVED': 'Message Received',
                                            'CONTACT_CREATED': 'Contact Created',
                                            'CONTACT_UPDATED': 'Contact Updated',
                                            'CAMPAIGN_SENT': 'Campaign Sent',
                                            'CAMPAIGN_REPLIED': 'Campaign Replied',
                                            'TAG_ADDED': 'Tag Added',
                                            'PRODUCT_INTEREST': 'Product Interest'
                                        };
                                        handleUpdate('label', labels[t] || 'Trigger');
                                    }}
                                    className={inputClasses}
                                >
                                    <option value="MESSAGE_RECEIVED">Message Received</option>
                                    <option value="CONTACT_CREATED">Contact Created</option>
                                    <option value="CONTACT_UPDATED">Contact Updated</option>
                                    <option value="CAMPAIGN_SENT">Campaign Sent</option>
                                    <option value="CAMPAIGN_REPLIED">Campaign Replied</option>
                                    <option value="TAG_ADDED">Tag Added</option>
                                    <option value="PRODUCT_INTEREST">Product Interest</option>
                                </select>
                            </div>

                            {/* Session filter — only for message triggers */}
                            {data.triggerType === 'MESSAGE_RECEIVED' && (
                                <>
                                    <SessionSelector
                                        sessions={sessions}
                                        label="Only from WhatsApp Accounts (optional)"
                                        value={data.sessionIds || []}
                                        onChange={(v) => handleUpdate('sessionIds', v)}
                                        isMulti
                                    />
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium text-secondary">Keyword Filter (optional)</label>
                                        <input
                                            type="text"
                                            className={inputClasses}
                                            placeholder="e.g. price, order, help"
                                            value={data.keywordFilter || ''}
                                            onChange={(e) => handleUpdate('keywordFilter', e.target.value)}
                                        />
                                        <p className="text-xs text-muted">Comma-separated. Leave blank to match any message.</p>
                                    </div>
                                </>
                            )}

                            {/* Tag filter for TAG_ADDED */}
                            {data.triggerType === 'TAG_ADDED' && (
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium text-secondary">Tag Name</label>
                                    <input
                                        type="text"
                                        className={inputClasses}
                                        placeholder="e.g. VIP"
                                        value={data.tagFilter || ''}
                                        onChange={(e) => handleUpdate('tagFilter', e.target.value)}
                                    />
                                </div>
                            )}

                            {/* Product selection for PRODUCT_INTEREST */}
                            {data.triggerType === 'PRODUCT_INTEREST' && (
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium text-secondary">Specific Product</label>
                                    <select
                                        title="Product Selection"
                                        className={inputClasses}
                                        value={data.productId || ''}
                                        onChange={(e) => handleUpdate('productId', e.target.value)}
                                    >
                                        <option value="">Any Product</option>
                                        {products.map((p: any) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                    <label className="text-sm font-medium text-secondary mt-2">Relation Type</label>
                                    <select
                                        title="Relation Type Selection"
                                        className={inputClasses}
                                        value={data.relationType || ''}
                                        onChange={(e) => handleUpdate('relationType', e.target.value)}
                                    >
                                        <option value="">Any Relation</option>
                                        <option value="INTERESTED">Interested</option>
                                        <option value="CART">Added to Cart</option>
                                        <option value="OWNED">Purchased / Owned</option>
                                    </select>
                                </div>
                            )}
                        </>
                    )}

                    {/* ── ACTION / NODE CONFIG ── */}
                    {!isTrigger && (
                        <>
                            {/* Action type selector for bare action nodes */}
                            {selectedNode.type === 'action' && (
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium text-secondary">Action Type</label>
                                    <select
                                        title="Action Type Selection"
                                        value={data.actionType || 'SEND_WHATSAPP'}
                                        onChange={(e) => {
                                            const a = e.target.value;
                                            handleUpdate('actionType', a);
                                            const labels: Record<string, string> = {
                                                'ADD_TAG': 'Add Tag',
                                                'SEND_WHATSAPP': 'Send WhatsApp Message'
                                            };
                                            handleUpdate('label', labels[a] || 'Action');
                                        }}
                                        className={inputClasses}
                                    >
                                        <option value="ADD_TAG">Add Tag</option>
                                        <option value="SEND_WHATSAPP">Send WhatsApp Message</option>
                                    </select>
                                </div>
                            )}

                            {/* ADD_TAG */}
                            {data.actionType === 'ADD_TAG' && (
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium text-secondary">Tag to Add</label>
                                    <input
                                        type="text"
                                        className={inputClasses}
                                        placeholder="e.g. VIP"
                                        value={data.tagValue || ''}
                                        onChange={(e) => handleUpdate('tagValue', e.target.value)}
                                    />
                                </div>
                            )}

                            {/* WEBHOOK / HTTP_REQUEST */}
                            {['WEBHOOK', 'HTTP_REQUEST'].includes(data.actionType) && (
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium text-secondary">Webhook URL</label>
                                    <input
                                        type="url"
                                        className={inputClasses}
                                        placeholder="https://your-server.com/hook"
                                        value={data.webhookUrl || ''}
                                        onChange={(e) => handleUpdate('webhookUrl', e.target.value)}
                                    />
                                </div>
                            )}

                            {/* DELAY */}
                            {data.actionType === 'DELAY' && (
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium text-secondary">Delay (minutes)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        className={inputClasses}
                                        placeholder="60"
                                        value={data.delayMinutes || ''}
                                        onChange={(e) => handleUpdate('delayMinutes', e.target.value)}
                                    />
                                </div>
                            )}

                            {/* SEND_WHATSAPP / AI_REPLY */}
                            {['SEND_WHATSAPP', 'AI_REPLY'].includes(data.actionType) && (
                                <>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium text-secondary">
                                            {data.actionType === 'AI_REPLY' ? 'AI System Prompt' : 'Message Content'}
                                        </label>
                                        <textarea
                                            className={`${inputClasses} min-h-[100px] resize-y`}
                                            placeholder={data.actionType === 'AI_REPLY' ? 'You are a helpful sales assistant for...' : 'Hello {{contact.name}}! 👋'}
                                            value={data.messageContent || ''}
                                            onChange={(e) => handleUpdate('messageContent', e.target.value)}
                                        />
                                        <p className="text-xs text-muted">Variables: {'{{contact.name}}'}, {'{{contact.phone}}'}, {'{{event.content}}'}</p>
                                    </div>

                                    {data.actionType === 'SEND_WHATSAPP' && (
                                        <SessionSelector
                                            sessions={sessions}
                                            label="Reply From (WhatsApp Account)"
                                            value={data.sessionId || ''}
                                            onChange={(v) => handleUpdate('sessionId', v)}
                                        />
                                    )}
                                </>
                            )}

                            {/* HUMAN_HANDOFF */}
                            {data.actionType === 'HUMAN_HANDOFF' && (
                                <>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium text-secondary">Agent / Team ID</label>
                                        <input
                                            type="text"
                                            className={inputClasses}
                                            placeholder="sales-team-1"
                                            value={data.teamId || ''}
                                            onChange={(e) => handleUpdate('teamId', e.target.value)}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium text-secondary">Handoff Message (optional)</label>
                                        <textarea
                                            className={`${inputClasses} min-h-[80px] resize-y`}
                                            placeholder="Connecting you to a human agent..."
                                            value={data.handoffMessage || ''}
                                            onChange={(e) => handleUpdate('handoffMessage', e.target.value)}
                                        />
                                    </div>
                                </>
                            )}

                            {/* CONDITION — full builder */}
                            {data.actionType === 'CONDITION' && (
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-semibold text-primary">Condition Rules</h4>
                                        <div className="flex items-center gap-1 bg-body border border-theme rounded-lg p-1">
                                            <button
                                                onClick={() => handleUpdate('conditionLogic', 'AND')}
                                                className={`text-xs px-2 py-1 rounded-md transition-colors font-medium ${conditionLogic === 'AND' ? 'bg-primary text-white' : 'text-secondary hover:text-primary'}`}
                                            >AND</button>
                                            <button
                                                onClick={() => handleUpdate('conditionLogic', 'OR')}
                                                className={`text-xs px-2 py-1 rounded-md transition-colors font-medium ${conditionLogic === 'OR' ? 'bg-blue-500 text-white' : 'text-secondary hover:text-primary'}`}
                                            >OR</button>
                                        </div>
                                    </div>
                                    <p className="text-xs text-muted -mt-2">
                                        {conditionLogic === 'AND' ? 'ALL conditions must match → True path' : 'ANY condition must match → True path'}
                                    </p>

                                    {conditions.map((cond, i) => (
                                        <ConditionRow
                                            key={i}
                                            cond={cond}
                                            index={i}
                                            onUpdate={updateCondition}
                                            onRemove={removeCondition}
                                            showRemove={conditions.length > 1}
                                        />
                                    ))}

                                    <button
                                        onClick={addCondition}
                                        className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors py-1"
                                    >
                                        <Plus size={14} />
                                        Add Condition
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    {/* ── NODE ACTIONS ── */}
                    {!isTrigger && (
                        <div className="mt-4 pt-4 border-t border-theme flex flex-col gap-2">
                            {onDuplicate && (
                                <button
                                    onClick={() => onDuplicate(selectedNode.id)}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-body text-secondary hover:text-primary transition-colors font-medium text-sm border border-theme"
                                >
                                    <Copy size={16} />
                                    Duplicate Node
                                </button>
                            )}
                            {onDelete && (
                                <button
                                    onClick={() => onDelete(selectedNode.id)}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors font-medium text-sm border border-red-500/20"
                                >
                                    <Trash2 size={16} />
                                    Delete Node
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
