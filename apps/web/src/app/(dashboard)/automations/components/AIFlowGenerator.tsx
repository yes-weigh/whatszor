'use client';

import React, { useState } from 'react';
import { Sparkles, X, Loader2, Zap, Send, RefreshCw } from 'lucide-react';
import api from '@/lib/api';

const EXAMPLE_PROMPTS = [
    'When someone asks about price, send the catalog and notify sales',
    'When a new contact is created, send a welcome message after 5 minutes',
    'When a dealer tag is added, welcome them and follow up in 24 hours',
    'When a message is received, use AI to auto-reply and log the intent',
    'When an appointment is booked, confirm it and send a reminder the day before',
];

interface AIFlowGeneratorProps {
    onClose: () => void;
    onFlowGenerated: (name: string, nodes: any[], edges: any[]) => void;
}

export function AIFlowGenerator({ onClose, onFlowGenerated }: AIFlowGeneratorProps) {
    const [description, setDescription] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState('');
    const [exampleIdx, setExampleIdx] = useState(0);

    const handleGenerate = async () => {
        if (!description.trim() || description.trim().length < 10) {
            setError('Please describe your automation in at least 10 characters.');
            return;
        }

        setError('');
        setIsGenerating(true);

        try {
            const res = await api.post('/ai/generate-flow', { description: description.trim() });
            const { name, nodes, edges } = res.data || {};

            if (!nodes || nodes.length === 0) {
                setError('AI could not generate a valid flow. Try rephrasing your description.');
                return;
            }

            onFlowGenerated(name, nodes, edges);
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.error?.message || 'Generation failed. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleExampleClick = () => {
        setDescription(EXAMPLE_PROMPTS[exampleIdx]);
        setExampleIdx((prev) => (prev + 1) % EXAMPLE_PROMPTS.length);
    };

    return (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
            <div className="bg-surface border border-theme rounded-2xl shadow-2xl w-full max-w-lg flex flex-col gap-0 overflow-hidden">
                {/* Header */}
                <div className="px-6 py-5 border-b border-theme flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center">
                        <Sparkles size={18} className="text-blue-400" />
                    </div>
                    <div className="flex flex-col flex-1">
                        <h2 className="font-bold text-primary text-base">AI Flow Generator</h2>
                        <p className="text-xs text-muted">Describe your automation in plain English</p>
                    </div>
                    <button aria-label="Close AI generator" onClick={onClose} className="p-2 hover:bg-elevated rounded-lg text-muted hover:text-primary transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 flex flex-col gap-4">
                    <div className="relative">
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="e.g. When someone asks for the price, send the catalog and notify the sales team…"
                            className="input w-full min-h-[120px] resize-none text-sm leading-relaxed pr-10"
                            onKeyDown={e => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleGenerate();
                            }}
                        />
                        {description && (
                            <button
                                onClick={() => setDescription('')}
                                aria-label="Clear input"
                                className="absolute top-3 right-3 text-muted hover:text-primary"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Example button */}
                    <button
                        onClick={handleExampleClick}
                        className="flex items-center gap-2 text-xs text-muted hover:text-primary transition-colors self-start"
                    >
                        <RefreshCw size={12} />
                        Try an example
                    </button>

                    {/* Examples preview */}
                    <div className="grid grid-cols-1 gap-2">
                        {EXAMPLE_PROMPTS.slice(0, 3).map((p, i) => (
                            <button
                                key={i}
                                onClick={() => setDescription(p)}
                                className="text-left text-xs p-3 bg-elevated border border-theme rounded-lg hover:border-blue-500/30 hover:bg-blue-500/5 transition-all text-secondary hover:text-primary"
                            >
                                <Zap size={10} className="inline mr-1.5 text-yellow-400 mb-0.5" />
                                {p}
                            </button>
                        ))}
                    </div>

                    {error && (
                        <div className="text-xs text-red-400 bg-red-400/10 border border-red-500/20 px-3 py-2 rounded-lg">
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-theme flex items-center justify-between gap-3">
                    <p className="text-[11px] text-muted">
                        Powered by Gemini · <kbd className="px-1.5 py-0.5 bg-elevated border border-theme rounded text-[10px] font-mono">Ctrl+Enter</kbd> to generate
                    </p>
                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating || description.trim().length < 10}
                        className="btn btn-primary flex items-center gap-2 text-sm"
                    >
                        {isGenerating ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                        Generate Flow
                    </button>
                </div>
            </div>
        </div>
    );
}
