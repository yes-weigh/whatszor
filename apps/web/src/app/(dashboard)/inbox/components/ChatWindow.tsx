'use client';

import Link from 'next/link';

import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { 
  Send, CheckCheck, Check, Sparkles, Loader2, 
  Download, FileText, Paperclip, Search, MessageSquare, X, ChevronLeft
} from 'lucide-react';
import { Conversation, Message } from '@/hooks/useConversations';
import { ContactAvatar, getDisplayName } from './ConversationsList';
import api from '@/lib/api';

// ── Helpers ──────────────────────────────────────────────────

function formatFileSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function useBlobUrl(messageId: string | null, hasLocalPath: boolean) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [triggered, setTriggered] = useState(false);

  useEffect(() => {
      if (!messageId || !hasLocalPath) return;
      let objectUrl: string | null = null;
      let cancelled = false;
      setLoading(true);
      api.get(`/media/${messageId}`, { responseType: 'blob' })
          .then(r => {
              if (cancelled) return;
              objectUrl = URL.createObjectURL(r.data as Blob);
              setBlobUrl(objectUrl);
          })
          .catch(() => { if (!cancelled) setFailed(true); })
          .finally(() => { if (!cancelled) setLoading(false); });
      return () => {
          cancelled = true;
          if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
  }, [messageId, hasLocalPath]);

  useEffect(() => {
      if (!messageId || !triggered || hasLocalPath) return;
      let objectUrl: string | null = null;
      let cancelled = false;
      setLoading(true);
      setFailed(false);
      api.post(`/media/${messageId}/download`, {}, { responseType: 'blob' })
          .then(r => {
              if (cancelled) return;
              objectUrl = URL.createObjectURL(r.data as Blob);
              setBlobUrl(objectUrl);
          })
          .catch(() => { if (!cancelled) setFailed(true); })
          .finally(() => { if (!cancelled) setLoading(false); });
      return () => {
          cancelled = true;
          if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
  }, [messageId, triggered, hasLocalPath]);

  const triggerDownload = () => setTriggered(true);

  return { blobUrl, loading, failed, triggerDownload };
}

// ── Components ───────────────────────────────────────────────

function StatusIcon({ status, isOut }: { status: string, isOut?: boolean }) {
  const defaultColor = isOut ? "text-white/50" : "text-muted";
  if (status === 'READ') return <CheckCheck size={14} className="text-blue-500" />;
  if (status === 'PLAYED') return <CheckCheck size={14} className="text-blue-500" />;
  if (status === 'DELIVERED') return <CheckCheck size={14} className={defaultColor} />;
  if (status === 'SENT') return <Check size={14} className={defaultColor} />;
  if (status === 'SUGGESTED') return <Sparkles size={12} className="text-accent-ai animate-pulse" />;
  return null;
}

function MessageBubble({ msg, onUseSuggestion }: { msg: Message, onUseSuggestion?: (content: string) => void }) {
  const isOut = msg.direction === 'OUTBOUND';
  const isMediaType = ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER'].includes(msg.type);
  const hasLocalPath = !!msg.mediaData?.localPath;
  const { blobUrl, loading, failed, triggerDownload } = useBlobUrl(
      isMediaType ? msg.id : null,
      hasLocalPath
  );

  function renderContent() {
      if (blobUrl) {
          if (msg.type === 'IMAGE' || msg.type === 'STICKER') {
              return <img src={blobUrl} alt="Media" className="max-w-[260px] max-h-[260px] rounded-lg object-contain" />;
          }
          if (msg.type === 'VIDEO') {
              return <video src={blobUrl} controls className="max-w-[280px] rounded-lg" />;
          }
          if (msg.type === 'AUDIO') {
              return <audio src={blobUrl} controls className="w-[240px] h-10" />;
          }
          if (msg.type === 'DOCUMENT') {
              const fileName = msg.mediaData?.fileName || msg.content || 'Document';
              return (
                  <a href={blobUrl} download={fileName} className="flex items-center gap-2 text-sm underline underline-offset-2">
                      <FileText size={16} />
                      <span>{fileName}</span>
                      <span className="text-xs opacity-60">{formatFileSize(msg.mediaData?.fileSize)}</span>
                      <Download size={14} />
                  </a>
              );
          }
      }

      if (loading) return <Loader2 size={18} className="animate-spin opacity-50" />;
      if (msg.content && !isMediaType) return <span className="whitespace-pre-wrap">{msg.content}</span>;

      if (isMediaType && !blobUrl) {
          const label = { IMAGE: '🖼️ Image', VIDEO: '🎬 Video', AUDIO: '🎙️ Voice', DOCUMENT: '📄 Doc', STICKER: '😄 Sticker' }[msg.type] ?? 'Media';
          if (failed) return <span className="italic text-xs opacity-50">{label} · Expired</span>;
          return (
              <button onClick={triggerDownload} className="flex items-center gap-2 text-xs opacity-75 hover:opacity-100 transition-opacity">
                  <Download size={14} /><span>{label}</span><span className="underline">Load</span>
              </button>
          );
      }
      if (msg.content) return <span className="whitespace-pre-wrap">{msg.content}</span>;
      return <span className="italic text-xs opacity-50">Empty message</span>;
  }

  return (
      <div className={`flex ${isOut ? 'justify-end' : 'justify-start'} group w-full mb-3`}>
          <div className={`max-w-[80%] lg:max-w-[70%] flex flex-col gap-1 ${isOut ? 'items-end' : 'items-start'}`}>
              <div className={`px-4 py-2 text-[14px] leading-relaxed relative transition-colors ${
                  msg.status === 'SUGGESTED'
                      ? 'bg-[rgba(34,197,94,0.06)] hover:bg-[rgba(34,197,94,0.1)] border border-[rgba(34,197,94,0.2)] text-primary rounded-[12px_4px_12px_12px] cursor-pointer group/suggestion transition-colors'
                      : isOut
                          ? 'bg-[hsl(235,70%,50%)] text-white rounded-[12px_4px_12px_12px] font-semibold shadow-[0_4px_14px_rgba(0,0,0,0.2)]'
                          : 'bg-elevated text-primary border border-theme rounded-[4px_12px_12px_12px] shadow-sm'
              }`}
               onClick={() => {
                   if (msg.status === 'SUGGESTED' && msg.content && onUseSuggestion) {
                       onUseSuggestion(msg.content);
                   }
               }}
              >
                  {renderContent()}

                  {msg.status === 'SUGGESTED' && (
                      <div className="absolute -top-2.5 right-4 bg-accent text-[9px] text-white font-bold uppercase tracking-wider px-2 py-0.5 rounded shadow-sm">
                          Suggestion
                      </div>
                  )}

                  {msg.status === 'SUGGESTED' && (
                      <div className="mt-2 pt-2 border-t border-[rgba(34,197,94,0.1)] flex justify-end opacity-60 group-hover/suggestion:opacity-100 transition-opacity">
                          <span className="text-[10px] font-bold text-accent uppercase tracking-wider flex items-center gap-1">
                              Click to use <Sparkles size={10} />
                          </span>
                      </div>
                  )}
                  
                  {/* Inline Time & Tick */}
                  <div className={`flex items-center gap-1 justify-end ml-4 -mb-0.5 mt-1 float-right ${isOut ? 'text-white/60' : 'text-muted'}`}>
                      <span className="text-[10px] uppercase font-bold tracking-wider">
                          {format(new Date(msg.createdAt), 'HH:mm')}
                      </span>
                      {isOut && <StatusIcon status={msg.status} isOut={isOut} />}
                  </div>
              </div>
          </div>
      </div>
  );
}

// ── Main Chat Window ─────────────────────────────────────────

interface ChatWindowProps {
  activeConversation: Conversation | null;
  messages: Message[];
  loading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  onSendMessage: (text: string) => void;
  inputValue: string;
  setInputValue: (val: string) => void;
  onBack?: () => void;
}

// eslint-disable-next-line @next/next/no-duplicate-head -- function props are intentional; component is always rendered inside a client tree
export function ChatWindow({
  activeConversation,
  messages,
  loading,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  onSendMessage,
  inputValue,
  setInputValue,
  onBack
}: ChatWindowProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll logic: only when close to bottom
  const prevMsgCountRef = useRef(0);
  const prevTopMsgIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!scrollContainerRef.current) return;
    
    // Jump to bottom if switching conversations
    messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
    prevMsgCountRef.current = 0;
    prevTopMsgIdRef.current = null;
  }, [activeConversation?.id]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const isNewMessageArrival = messages.length > prevMsgCountRef.current;
    const isPrependingHistory = isNewMessageArrival && prevMsgCountRef.current > 0 && messages[0]?.id !== prevTopMsgIdRef.current;

    if (isPrependingHistory) {
      // Logic handled via react query usually, but DOM manipulation might be needed here to preserve scroll
    } else if (isNewMessageArrival || messages.length !== prevMsgCountRef.current) {
        if (prevMsgCountRef.current === 0) {
            // First load of messages complete, snap to bottom immediately
            requestAnimationFrame(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
                // Fallback in case of layout shift from images
                setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'instant' }), 50);
            });
        } else if (isNewMessageArrival) {
            // Auto scroll smoothly if user is near bottom
            const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
            if (distanceFromBottom < 300) {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }
        }
    }

    prevMsgCountRef.current = messages.length;
    prevTopMsgIdRef.current = messages.length > 0 ? messages[0].id : null;
  }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    onSendMessage(inputValue);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
  };

  if (!activeConversation) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center p-8 bg-base">
            <div className="w-20 h-20 rounded-full bg-surface border border-theme flex flex-col items-center justify-center relative shadow-sm">
                <Sparkles size={28} className="text-accent-ai absolute -top-2 -right-3" />
                <MessageSquare size={28} className="text-muted" />
            </div>
            <div>
                <h2 className="text-lg font-semibold text-primary tracking-tight">WhatsApp Command Center</h2>
                <p className="text-[13px] text-muted mt-2 max-w-xs mx-auto">Select a conversation to start messaging, use AI suggestions, and manage leads in real-time.</p>
            </div>
            <Link href="/campaigns/new" className="mt-4 px-5 py-2 rounded-md bg-accent text-black font-semibold text-[13px] hover:bg-accent/90 transition-colors inline-block">
               Start New Campaign
            </Link>
        </div>
    );
  }

  return (
    <div className="flex-1 w-full flex flex-col overflow-hidden relative chat-window-bg">
      {/* ── Chat Header ── */}
      <div className="px-5 py-3 border-b border-theme flex items-center justify-between bg-surface z-10 shrink-0 shadow-sm relative">
          <div className="flex items-center gap-4">
              {onBack && (
                  <button 
                      onClick={onBack}
                      className="md:hidden interactive-press p-2 -ml-2 text-muted hover:text-primary transition-colors"
                      aria-label="Back to conversations"
                  >
                      <ChevronLeft size={24} />
                  </button>
              )}
              <ContactAvatar jid={activeConversation.providerId} name={getDisplayName(activeConversation)} sizeClass="w-10 h-10 text-sm" />
              <div>
                  <h2 className="font-semibold text-base text-primary">
                      {getDisplayName(activeConversation)}
                  </h2>
                  
                  <div className="flex items-center mt-0.5 gap-1.5 overflow-x-auto hide-scrollbar max-w-[240px] sm:max-w-sm pb-0.5">
                      {activeConversation.contact?.contactProducts?.length ? (
                          activeConversation.contact.contactProducts.map((cp, idx) => (
                              <div key={idx} className={`shrink-0 flex items-center gap-1.5 text-[9px] uppercase font-bold pl-1.5 pr-1 py-0.5 rounded border whitespace-nowrap group ${
                                  cp.relationType === 'OWNED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                  cp.relationType === 'CART' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 
                                  'bg-blue-500/10 text-blue-400 border-blue-500/20'
                              }`}>
                                  {cp.source === 'AI' && (
                                      <span title="Tagged autonomously by AI. Manually changing relations will drop this identifier.">
                                          <Sparkles size={10} className="text-accent" />
                                      </span>
                                  )}
                                  <span>{cp.relationType}: {cp.product.name}</span>
                                  <button
                                      onClick={() => {
                                          if (confirm(`Remove '${cp.relationType}' association with '${cp.product.name}'?`)) {
                                              api.delete(`/contacts/${activeConversation.contact?.id}/products/${cp.product.id}?relationType=${cp.relationType}`)
                                                 .then(() => fetchNextPage?.()); // Naively force re-fetch
                                          }
                                      }}
                                      title="Remove mapped state"
                                      className="ml-1 opacity-0 group-hover:opacity-100 hover:text-primary transition-opacity"
                                  >
                                      <X size={10} />
                                  </button>
                              </div>
                          ))
                      ) : (
                          <p className="text-[13px] text-muted font-medium">
                              Last seen 12 min ago
                          </p>
                      )}
                  </div>
              </div>
          </div>
          <div className="flex items-center gap-2">
              <button className="interactive-press px-3 py-1.5 flex items-center gap-1.5 rounded-md bg-surface border border-theme text-[12px] font-medium text-primary hover:bg-hover transition-colors">
                  <Sparkles size={12} className="text-accent-ai" />
                  Similar Leads
              </button>
              <div className="w-px h-4 bg-theme mx-2" />
              <button className="interactive-press p-1.5 text-muted hover:text-primary transition-colors" title="Search" aria-label="Search">
                  <Search size={16} />
              </button>
          </div>
      </div>

      {/* ── Messages Area ── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-[8%] py-5 flex flex-col gap-1 relative z-0">
          {/* Load older messages */}
          {!loading && hasNextPage && (
              <div className="flex justify-center py-6">
                  <button
                      onClick={() => fetchNextPage()}
                      disabled={isFetchingNextPage}
                      className="interactive-press glass-card flex items-center gap-2 text-xs font-semibold text-muted hover:text-primary px-4 py-2 rounded-full transition-all disabled:opacity-50 border border-theme"
                  >
                      {isFetchingNextPage ? <Loader2 size={12} className="animate-spin" /> : 'Load previous messages'}
                  </button>
              </div>
          )}

          {loading && (
              <div className="flex-1 flex items-center justify-center">
                  <Loader2 size={24} className="animate-spin text-accent" />
              </div>
          )}

          {!loading && messages.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
                  <div className="px-4 py-2 rounded-lg bg-surface border border-theme text-xs text-muted">
                    This is the beginning of your conversation with {getDisplayName(activeConversation)}
                  </div>
              </div>
          )}

          {messages.map((msg) => (
              <MessageBubble 
                  key={msg.id} 
                  msg={msg} 
                  onUseSuggestion={(content) => {
                      setInputValue(content);
                      setTimeout(() => textareaRef.current?.focus(), 50);
                  }}
              />
          ))}
          <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* ── Chat Input ── */}
      <div className="shrink-0 p-4 bg-surface border-t border-theme relative z-10">
          <div className="flex items-end gap-2 max-w-4xl mx-auto relative">
              
              <button className="interactive-press p-2.5 text-muted hover:text-primary transition-colors shrink-0 mb-0.5" title="Attach media" aria-label="Attach media">
                  <Paperclip size={18} />
              </button>
              
              <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => {
                      setInputValue(e.target.value);
                      if (textareaRef.current) {
                          textareaRef.current.style.height = 'auto';
                          textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
                      }
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  rows={1}
                  className="flex-1 bg-elevated rounded-lg px-4 py-2.5 text-[14px] text-primary placeholder:text-muted outline-none min-h-[44px] max-h-32 resize-none leading-relaxed transition-all duration-[120ms] border border-transparent focus:border-[rgba(34,197,94,0.45)] focus:ring-2 focus:ring-[rgba(34,197,94,0.15)] focus:bg-surface focus:shadow-sm"
              />
              
              {inputValue.trim() ? (
                <button
                    onClick={handleSend}
                    title="Send"
                    aria-label="Send message"
                    className="interactive-press w-11 h-11 rounded-md bg-accent hover:bg-accent-hover flex items-center justify-center transition-colors shrink-0 mb-0.5 shadow-sm"
                >
                    <Send size={16} className="text-white ml-0.5" />
                </button>
              ) : (
                <button className="interactive-press p-2.5 text-muted hover:text-primary transition-colors shrink-0 mb-0.5" title="Acknowledge" aria-label="Acknowledge">
                    <CheckCheck size={18} />
                </button>
              )}
          </div>
      </div>
    </div>
  );
}
