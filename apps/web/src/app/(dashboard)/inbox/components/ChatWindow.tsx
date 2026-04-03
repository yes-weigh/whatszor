'use client';

import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { 
  Send, CheckCheck, Check, Sparkles, Loader2, 
  Download, FileText, Paperclip, Search, MessageSquare
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

function StatusIcon({ status }: { status: string }) {
  if (status === 'READ') return <CheckCheck size={14} className="text-blue-400" />;
  if (status === 'PLAYED') return <CheckCheck size={14} className="text-blue-400" />;
  if (status === 'DELIVERED') return <CheckCheck size={14} className="text-white/60" />;
  if (status === 'SENT') return <Check size={14} className="text-white/60" />;
  if (status === 'SUGGESTED') return <Sparkles size={12} className="text-emerald-400 animate-pulse" />;
  return null;
}

function MessageBubble({ msg }: { msg: Message }) {
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
      <div className={`flex ${isOut ? 'justify-end' : 'justify-start'} group w-full mb-2`}>
          <div className={`max-w-[75%] flex flex-col gap-1 ${isOut ? 'items-end' : 'items-start'}`}>
              <div className={`px-4 py-2.5 text-[15px] leading-relaxed shadow-sm relative ${
                  isOut
                      ? 'bg-accent text-white rounded-[20px_4px_20px_20px] font-medium'
                      : 'bg-[#202c33] text-[#e9edef] rounded-[4px_20px_20px_20px]'
              }`}>
                  {renderContent()}
                  
                  {/* Inline Time & Tick */}
                  <div className={`flex items-center gap-1 justify-end ml-4 -mb-1 mt-1 float-right ${isOut ? 'text-white/70' : 'text-white/60'}`}>
                      <span className="text-[10px] uppercase font-bold tracking-wider">
                          {format(new Date(msg.createdAt), 'HH:mm')}
                      </span>
                      {isOut && <StatusIcon status={msg.status} />}
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
}

export function ChatWindow({
  activeConversation,
  messages,
  loading,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  onSendMessage,
  inputValue,
  setInputValue
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
  }, [activeConversation?.id]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const isNewMessageArrival = messages.length > prevMsgCountRef.current;
    const isPrependingHistory = isNewMessageArrival && messages[0]?.id !== prevTopMsgIdRef.current;

    if (isPrependingHistory) {
      // Logic handled via react query usually, but DOM manipulation might be needed here to preserve scroll
    } else if (isNewMessageArrival) {
        // Auto scroll if user is near bottom
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (distanceFromBottom < 300) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
        <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center p-8 bg-[#0b141a]">
            <div className="w-24 h-24 rounded-full bg-accent/10 border border-accent/20 flex flex-col items-center justify-center relative shadow-[0_0_40px_rgba(16,185,129,0.1)]">
                <Sparkles size={40} className="text-accent absolute -top-2 -right-4" />
                <MessageSquare size={32} className="text-muted" />
            </div>
            <div>
                <h2 className="text-xl font-bold text-primary tracking-tight">WhatsApp Command Center</h2>
                <p className="text-sm text-muted mt-2 max-w-sm">Select a conversation to start messaging, use AI suggestions, and manage leads in real-time.</p>
            </div>
            <button className="mt-4 px-6 py-2.5 rounded-full bg-accent text-black font-bold text-sm shadow-[0_0_15px_rgba(16,185,129,0.4)] hover:shadow-[0_0_25px_rgba(16,185,129,0.6)] transition-all">
               Start New Campaign
            </button>
        </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0b141a] relative">
      {/* Background Whatsapp-style Doodle pattern */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://web.whatsapp.com/img/bg-chat-tile-dark_a4be512e7195b6b733d9110b408f075d.png')]" />

      {/* ── Chat Header ── */}
      <div className="px-5 py-3 border-b border-theme/50 flex items-center justify-between glass-card rounded-none z-10 shrink-0">
          <div className="flex items-center gap-4">
              <ContactAvatar jid={activeConversation.providerId} name={getDisplayName(activeConversation)} sizeClass="w-10 h-10 text-sm" />
              <div>
                  <h2 className="font-semibold text-base text-primary">
                      {getDisplayName(activeConversation)}
                  </h2>
                  <p className="text-[13px] text-accent font-medium mt-0.5">
                      Last seen 12 min ago
                  </p>
              </div>
          </div>
          <div className="flex items-center gap-3">
              <button className="px-4 py-2 rounded-lg bg-surface border border-theme text-xs font-semibold text-primary hover:bg-hover transition-colors">
                  Send Campaign to Similar Leads
              </button>
              <div className="w-px h-6 bg-theme mx-1" />
              <button className="p-2 text-muted hover:text-primary transition-colors" title="Search" aria-label="Search">
                  <Search size={18} />
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
                      className="glass-card flex items-center gap-2 text-xs font-semibold text-muted hover:text-primary px-4 py-2 rounded-full transition-all disabled:opacity-50 border border-theme/50"
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
              />
          ))}
          <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* ── Chat Input ── */}
      <div className="shrink-0 p-4 bg-[#202c33] border-t border-theme/50 relative z-10">
          <div className="flex items-end gap-3 max-w-[90%] mx-auto relative">
              
              <button className="p-3 text-muted hover:text-primary transition-colors shrink-0" title="Attach media" aria-label="Attach media">
                  <Paperclip size={20} />
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
                  placeholder="Type a message or use an AI suggestion..."
                  rows={1}
                  className="flex-1 bg-[#2a3942] rounded-xl px-4 py-3.5 text-[15px] text-[#d1d7db] placeholder:text-[#8696a0] outline-none min-h-[50px] max-h-32 resize-none leading-relaxed transition-all focus:border-accent/30 border border-transparent"
              />
              
              {inputValue.trim() ? (
                <button
                    onClick={handleSend}
                    title="Send"
                    aria-label="Send message"
                    className="w-12 h-12 rounded-full bg-accent hover:bg-accent/90 flex flex-col items-center justify-center transition-all shrink-0 shadow-[0_0_15px_rgba(16,185,129,0.3)] mb-0.5"
                >
                    <Send size={18} className="text-black ml-1" />
                </button>
              ) : (
                <button className="p-3 text-muted hover:text-primary transition-colors shrink-0 mb-0.5" title="Acknowledge" aria-label="Acknowledge">
                    <CheckCheck size={20} />
                </button>
              )}
          </div>
      </div>
    </div>
  );
}
