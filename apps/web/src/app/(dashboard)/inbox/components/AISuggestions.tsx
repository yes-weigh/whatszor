'use client';

import { useState, useEffect, useRef } from 'react';
import { Sparkles, ArrowRight, Activity, Loader2 } from 'lucide-react';
import { Conversation, Message } from '@/hooks/useConversations';
import api from '@/lib/api';

interface AISuggestionsProps {
  activeConversation: Conversation | null;
  messages: Message[];
  onSelectSuggestion: (text: string) => void;
}

interface SuggestionData {
  intent: string;
  confidence: number;
  suggestions: string[];
}

export function AISuggestions({ activeConversation, messages, onSelectSuggestion }: AISuggestionsProps) {
  const [cache, setCache] = useState<Record<string, SuggestionData>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-fetch suggestions when conversation or messages change
  useEffect(() => {
    if (!activeConversation) return;

    // Use only the last 10 messages for context
    const recentMessages = messages.slice(-10).map(m => ({
      role: m.direction === 'INBOUND' ? 'user' : 'agent',
      content: m.content || '[Media]'
    }));

    // If there are no messages, no need to suggest
    if (recentMessages.length === 0) return;

    const cacheKey = activeConversation.id + "_" + messages.length;

    // If already cached, don't refetch
    if (cache[cacheKey]) return;

    setLoading(true);
    setError(null);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const payload = {
          messages: recentMessages,
          contact: {
            name: activeConversation.contactName || 'Unknown',
            tags: [] // Future-proof for CRM tags
          }
        };
        const res = await api.post('/ai/suggest', payload);
        
        if (res.data?.success) {
          const newData = {
            intent: res.data.intent,
            confidence: res.data.confidence,
            suggestions: res.data.suggestions,
          };
          setCache(prev => ({
            ...prev,
            [cacheKey]: newData
          }));
        }
      } catch (err: any) {
        console.error("Failed to fetch AI suggestions", err);
        const msg = err?.response?.data?.error || err?.message || 'AI suggestions unavailable';
        setError(msg);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [activeConversation?.id, messages.length]); // Depend on length to refetch on new incoming message

  // If no conversation is selected, show empty state
  if (!activeConversation) {
    return (
      <div className="w-80 border-l border-theme bg-secondary h-full flex flex-col items-center justify-center p-6 text-center opacity-50">
        <Sparkles size={32} className="text-muted mb-3 opacity-30" />
        <p className="text-sm font-medium text-primary">AI Copilot</p>
        <p className="text-xs text-muted mt-1">Select a chat to generate Smart Replies and Intent Analysis</p>
      </div>
    );
  }

  const currentCacheKey = activeConversation.id + "_" + messages.length;
  const currentData = cache[currentCacheKey] || cache[Object.keys(cache).find(k => k.startsWith(activeConversation.id)) || ''];

  function renderIntent(intent: string, confidence: number) {
    if (confidence >= 0.8) {
      return (
        <div className="flex bg-rose-500/10 text-rose-400 border border-rose-500/20 px-3 py-1.5 rounded flex-col mt-2">
            <span className="text-[12px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
               🔥 High Intent
            </span>
            <span className="text-[14px] font-medium text-primary">{intent}</span>
        </div>
      );
    }
    if (confidence >= 0.5) {
      return (
        <div className="flex bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1.5 rounded flex-col mt-2">
            <span className="text-[12px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
               🟡 Medium Intent
            </span>
            <span className="text-[14px] font-medium text-primary">{intent}</span>
        </div>
      );
    }
    return (
      <div className="flex bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1.5 rounded flex-col mt-2">
          <span className="text-[12px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
             ❄️ Low Intent
          </span>
          <span className="text-[14px] font-medium text-primary">{intent}</span>
      </div>
    );
  }

  return (
    <div className="w-[340px] border-l border-theme bg-secondary h-full flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="px-5 py-4 border-b border-theme/50 sticky top-0 bg-secondary/80 backdrop-blur-md z-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
            <Sparkles size={12} className="text-emerald-400" />
          </div>
          <span className="text-sm font-semibold text-primary">AI Copilot</span>
        </div>
        {loading && <Loader2 size={14} className="text-accent animate-spin" />}
      </div>

      <div className="p-5 flex flex-col gap-6">
        {/* Intent Analysis Block */}
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Activity size={14} className="text-emerald-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Customer Intent</span>
          </div>
          
          {loading && !currentData ? (
             <div className="animate-pulse h-12 bg-[#2a3942] rounded mt-2"></div>
          ) : error ? (
             <div className="flex flex-col gap-1 mt-2 px-3 py-2 rounded bg-red-500/10 border border-red-500/20">
               <span className="text-xs font-bold text-red-400 uppercase tracking-wider">AI Unavailable</span>
               <span className="text-xs text-muted">{error}</span>
             </div>
          ) : currentData ? (
             renderIntent(currentData.intent, currentData.confidence)
          ) : (
             <p className="text-sm text-muted mt-2">Waiting for enough context...</p>
          )}
        </div>

        {/* Smart Replies Block */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 mt-2">
             <span className="text-xs font-bold uppercase tracking-wider text-muted">Suggested Replies</span>
          </div>
          
          {loading && !currentData ? (
            <div className="flex flex-col gap-3">
              <div className="animate-pulse h-16 bg-[#2a3942] rounded-lg"></div>
              <div className="animate-pulse h-16 bg-[#2a3942] rounded-lg"></div>
              <div className="animate-pulse h-16 bg-[#2a3942] rounded-lg"></div>
            </div>
          ) : currentData?.suggestions.map((reply, idx) => (
            <button
              key={idx}
              onClick={() => onSelectSuggestion(reply)}
              className="glass-card-interactive group text-left px-4 py-3 border border-theme/50 flex flex-col gap-2 relative overflow-hidden"
            >
              {/* Subtle hover gradient */}
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/0 to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              
              <p className="text-sm text-primary/90 leading-relaxed relative z-10">
                &quot;{reply}&quot;
              </p>
              
              <div className="flex items-center justify-end w-full mt-1 relative z-10">
                <span className="flex items-center gap-1 text-[11px] font-bold text-accent opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-wider">
                  Insert <ArrowRight size={10} />
                </span>
              </div>
            </button>
          ))}
          
          {!loading && !currentData && (
             <div className="text-center py-4 text-xs text-muted">
               AI needs more messages to generate suggestions.
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
