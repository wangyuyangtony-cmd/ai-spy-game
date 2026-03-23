import React, { useState, useEffect } from 'react';

interface SpeechBubbleProps {
  avatar: string;
  nickname: string;
  content: string;
  isCurrentUser: boolean;
  isStreaming?: boolean;
  animateTyping?: boolean;
}

export default function SpeechBubble({
  avatar,
  nickname,
  content,
  isCurrentUser,
  isStreaming = false,
  animateTyping = false,
}: SpeechBubbleProps) {
  const [displayedText, setDisplayedText] = useState(animateTyping ? '' : content);
  const [isTyping, setIsTyping] = useState(animateTyping);

  useEffect(() => {
    if (!animateTyping) {
      setDisplayedText(content);
      return;
    }

    let index = 0;
    setDisplayedText('');
    setIsTyping(true);

    const interval = setInterval(() => {
      if (index < content.length) {
        setDisplayedText(content.slice(0, index + 1));
        index++;
      } else {
        clearInterval(interval);
        setIsTyping(false);
      }
    }, 40);

    return () => clearInterval(interval);
  }, [content, animateTyping]);

  // For streaming, always show latest content
  useEffect(() => {
    if (isStreaming) {
      setDisplayedText(content);
      setIsTyping(true);
    }
  }, [content, isStreaming]);

  return (
    <div
      className={`flex gap-3 animate-fade-in ${isCurrentUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div
        className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-lg border ${
          isCurrentUser
            ? 'bg-primary/20 border-primary/30'
            : 'bg-dark border-white/10'
        }`}
      >
        {avatar || '🤖'}
      </div>

      {/* Content */}
      <div className={`flex flex-col gap-1 max-w-[75%] ${isCurrentUser ? 'items-end' : 'items-start'}`}>
        <span className="text-xs text-gray-500">{nickname}</span>
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isCurrentUser
              ? 'bg-primary/20 text-white rounded-tr-md'
              : 'bg-dark/80 text-gray-200 border border-white/5 rounded-tl-md'
          }`}
        >
          {displayedText}
          {(isTyping || isStreaming) && (
            <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-blink align-middle" />
          )}
        </div>
      </div>
    </div>
  );
}
