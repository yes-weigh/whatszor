'use client';

import { useState } from 'react';
import { useConversations } from '@/hooks/useConversations';
import { ConversationsList } from './components/ConversationsList';
import { ChatWindow } from './components/ChatWindow';
import { AISuggestions } from './components/AISuggestions';

export default function InboxCommandCenter() {
  const {
      accounts,
      connectedAccounts,
      activeSessionId,
      setActiveSessionId,
      conversations,
      convsLoading,
      activeConversation,
      setActiveConversation,
      messages,
      msgsLoading,
      hasNextPage,
      isFetchingNextPage,
      fetchNextPage,
      sendMessage
  } = useConversations();

  const [chatInputValue, setChatInputValue] = useState('');

  // When AI Suggestion is clicked, it populates the Chat Input box
  const handleAiSuggestionSelect = (text: string) => {
      setChatInputValue(text);
  };

  const handleSendMessage = (text: string) => {
      sendMessage.mutate({ type: 'TEXT', content: text });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-app">
        {/* ── Pane 1: Conversations List (Left) ── */}
        <div className={`shrink-0 h-full w-full md:w-auto ${activeConversation ? 'hidden md:flex' : 'flex'}`}>
            <ConversationsList 
                conversations={conversations}
                loading={convsLoading}
                accounts={accounts}
                connectedAccounts={connectedAccounts}
                activeSessionId={activeSessionId}
                setActiveSessionId={setActiveSessionId}
                activeConversation={activeConversation}
                onSelect={setActiveConversation}
            />
        </div>

        {/* ── Pane 2: WhatsApp Chat Execution (Center) ── */}
        <div className={`flex-1 h-full w-full ${!activeConversation ? 'hidden md:flex' : 'flex'}`}>
            <ChatWindow 
                activeConversation={activeConversation}
                messages={messages}
                loading={msgsLoading}
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                fetchNextPage={fetchNextPage}
                inputValue={chatInputValue}
                setInputValue={setChatInputValue}
                onSendMessage={handleSendMessage}
                onBack={() => setActiveConversation(null)}
            />
        </div>

        {/* ── Pane 3: AI Copilot (Right) ── */}
        <div className="hidden lg:flex w-[300px] xl:w-[350px] h-full shrink-0">
            <AISuggestions 
                activeConversation={activeConversation}
                messages={messages}
                onSelectSuggestion={handleAiSuggestionSelect}
            />
        </div>
    </div>
  );
}
