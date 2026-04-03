'use client';

import { useState } from 'react';
import { useConversations } from '@/hooks/useConversations';
import { ConversationsList } from './components/ConversationsList';
import { ChatWindow } from './components/ChatWindow';
import { AISuggestions } from './components/AISuggestions';

export default function InboxCommandCenter() {
  const {
      accounts,
      activeSessionId,
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
        <ConversationsList 
            conversations={conversations}
            loading={convsLoading}
            accounts={accounts}
            activeSessionId={activeSessionId}
            activeConversation={activeConversation}
            onSelect={setActiveConversation}
        />

        {/* ── Pane 2: WhatsApp Chat Execution (Center) ── */}
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
        />

        {/* ── Pane 3: AI Copilot (Right) ── */}
        <AISuggestions 
            activeConversation={activeConversation}
            messages={messages}
            onSelectSuggestion={handleAiSuggestionSelect}
        />
    </div>
  );
}
