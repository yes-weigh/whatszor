import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

interface AutomationModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function AutomationModal({ isOpen, onClose }: AutomationModalProps) {
    const qc = useQueryClient();
    const [name, setName] = useState('');
    const [triggerType, setTriggerType] = useState('CONTACT_CREATED');
    const [actionType, setActionType] = useState('ADD_TAG');
    const [tagValue, setTagValue] = useState('new-lead');

    const mutation = useMutation({
        mutationFn: async () => {
            const payload = {
                name,
                description: `Trigger: ${triggerType} -> Action: ${actionType}`,
                trigger: { type: triggerType },
                actions: [
                    {
                        type: actionType,
                        payload: actionType === 'ADD_TAG' ? { tag: tagValue } : { url: 'https://example.com/webhook' }
                    }
                ]
            };
            return api.post('/automations', payload);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['automations'] });
            onClose();
            setName('');
        },
        onError: (err: any) => {
            alert(err.response?.data?.message || 'Failed to create automation rule');
        }
    });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-surface border border-theme rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-theme">
                    <h3 className="font-bold text-lg text-primary">New Automation Rule</h3>
                    <button onClick={onClose} 
                                    className="p-2 text-secondary hover:text-white transition-colors"
                                    title="Close Automation Rule Modal">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="p-4 flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-secondary">Rule Name</label>
                        <input
                            type="text"
                            placeholder="e.g. Tag New Contacts"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="input-field"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="block text-sm font-medium text-secondary mb-2">Trigger Event</label>
                        <select 
                            title="Trigger Event Selection"
                            value={triggerType} 
                            onChange={(e) => setTriggerType(e.target.value)}
                            className="input-field bg-body"
                        >
                            <option value="CONTACT_CREATED">Contact is created</option>
                            <option value="CONTACT_UPDATED">Contact is updated</option>
                            <option value="MESSAGE_RECEIVED">Message is received</option>
                            <option value="TAG_ADDED">Tag is added</option>
                        </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="block text-sm font-medium text-secondary mb-2">First Action</label>
                        <select 
                            title="First Action Selection"
                            value={actionType} 
                            onChange={(e) => setActionType(e.target.value)}
                            className="input-field bg-body"
                        >
                            <option value="ADD_TAG">Add a Tag</option>
                            <option value="WEBHOOK">Trigger Webhook</option>
                        </select>
                    </div>

                    {actionType === 'ADD_TAG' && (
                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-medium text-secondary">Tag to add</label>
                            <input
                                type="text"
                                placeholder="e.g. new-lead"
                                value={tagValue}
                                onChange={(e) => setTagValue(e.target.value)}
                                className="input-field"
                            />
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-theme bg-body flex justify-end gap-3 rounded-b-2xl">
                    <button onClick={onClose} className="btn bg-surface border border-theme text-secondary hover:text-primary">
                        Cancel
                    </button>
                    <button 
                        onClick={() => mutation.mutate()} 
                        disabled={!name || mutation.isPending} 
                        className="btn btn-primary"
                    >
                        {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : 'Create Rule'}
                    </button>
                </div>
            </div>
        </div>
    );
}
