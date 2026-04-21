'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import api from '@/lib/api';
import { Bot, Send, ArrowRight, Loader2, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ChatMessage {
    id: string;
    role: 'user' | 'model';
    text: string;
}

export default function OnboardingPage() {
    const router = useRouter();
    const { user } = useAuthStore();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(true); // true initially to fetch the first message
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Initial load: Fetch the AI greeting
    useEffect(() => {
        const fetchInitialGreeting = async () => {
            try {
                // Send an empty history to trigger the dynamic greeting
                const { data } = await api.post('/ai/onboarding', { messages: [] });
                setMessages([{ id: Date.now().toString(), role: 'model', text: data.text }]);
            } catch (err) {
                console.error('Failed to start onboarding chat', err);
                // Fallback greeting if API fails
                setMessages([{ 
                    id: Date.now().toString(), 
                    role: 'model', 
                    text: "Hi there! I'm the WhatsVue AI assistant. To help tailor your experience, could you tell me a little bit about what your business does?" 
                }]);
            } finally {
                setLoading(false);
            }
        };

        if (user) {
            fetchInitialGreeting();
        }
    }, [user]);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!input.trim() || loading) return;

        const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: input.trim() };
        const newHistory = [...messages, userMsg];
        
        setMessages(newHistory);
        setInput('');
        setLoading(true);

        try {
            // Map our local state format to what the Gemini API expects
            const apiHistory = newHistory.map(m => ({
                role: m.role,
                parts: [{ text: m.text }]
            }));

            const { data } = await api.post('/ai/onboarding', { messages: apiHistory });
            
            setMessages(prev => [...prev, { 
                id: Date.now().toString(), 
                role: 'model', 
                text: data.text 
            }]);
        } catch (err) {
            console.error('Failed to send message', err);
            setMessages(prev => [...prev, { 
                id: Date.now().toString(), 
                role: 'model', 
                text: "I'm having a little trouble connecting right now, but we can catch up later!" 
            }]);
        } finally {
            setLoading(false);
        }
    };

    const handleSkip = () => {
        router.push('/inbox');
    };

    return (
        <div className="flex flex-col h-[calc(100vh-2rem)] md:h-full bg-body overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-theme bg-surface shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
                        <Bot size={20} className="text-black" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-primary leading-tight">AI Assistant</h1>
                        <p className="text-xs text-secondary">Gathering context for a tailored experience</p>
                    </div>
                </div>
                <button 
                    onClick={handleSkip}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-secondary hover:text-primary hover:bg-elevated rounded-lg transition-colors"
                >
                    <span>Skip to Inbox</span>
                    <ArrowRight size={16} />
                </button>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
                {messages.length === 0 && loading && (
                    <div className="flex justify-center items-center h-full">
                        <Loader2 size={24} className="text-accent animate-spin" />
                    </div>
                )}
                
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex gap-4 max-w-3xl mx-auto ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        {/* Avatar */}
                        <div className="shrink-0 pt-1">
                            {msg.role === 'model' ? (
                                <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center border border-accent/30">
                                    <Bot size={16} className="text-accent" />
                                </div>
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-elevated border border-theme flex items-center justify-center">
                                    <User size={16} className="text-secondary" />
                                </div>
                            )}
                        </div>

                        {/* Message Bubble */}
                        <div className={`px-5 py-3.5 rounded-2xl ${
                            msg.role === 'user' 
                            ? 'bg-accent text-accent-fg rounded-tr-sm' 
                            : 'bg-surface border border-theme text-primary rounded-tl-sm'
                        }`}>
                            {msg.role === 'model' ? (
                                <div className="prose prose-sm prose-invert max-w-none text-secondary">
                                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                                </div>
                            ) : (
                                <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                            )}
                        </div>
                    </div>
                ))}
                
                {/* Typing Indicator */}
                {loading && messages.length > 0 && (
                    <div className="flex gap-4 max-w-3xl mx-auto">
                        <div className="shrink-0 pt-1">
                            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center border border-accent/30">
                                <Bot size={16} className="text-accent" />
                            </div>
                        </div>
                        <div className="px-5 py-4 rounded-2xl bg-surface border border-theme rounded-tl-sm flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-secondary/50 animate-bounce [animation-delay:0ms]" />
                            <div className="w-1.5 h-1.5 rounded-full bg-secondary/50 animate-bounce [animation-delay:150ms]" />
                            <div className="w-1.5 h-1.5 rounded-full bg-secondary/50 animate-bounce [animation-delay:300ms]" />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-surface border-t border-theme shrink-0">
                <form onSubmit={handleSend} className="max-w-3xl mx-auto relative flex items-end gap-2">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder="Type your message..."
                        className="w-full h-auto bg-elevated border border-theme rounded-2xl px-4 py-3 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-none min-h-[50px] max-h-[150px] scrollbar-thin"
                        rows={1}
                        disabled={loading}
                        onInput={(e) => {
                            const target = e.target as HTMLTextAreaElement;
                            target.style.height = 'auto';
                            target.style.height = Math.min(target.scrollHeight, 150) + 'px';
                        }}
                    />
                    <button
                        type="submit"
                        aria-label="Send message"
                        disabled={!input.trim() || loading}
                        className="shrink-0 w-12 h-12 rounded-xl bg-accent text-accent-fg flex items-center justify-center hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        <Send size={18} className="translate-x-[-1px] translate-y-[1px]" />
                    </button>
                </form>
                <div className="max-w-3xl mx-auto mt-2 text-center">
                    <p className="text-[11px] text-muted">
                        You can stop providing info at any time. Click &quot;Skip to Inbox&quot; when you&apos;re done.
                    </p>
                </div>
            </div>
        </div>
    );
}
