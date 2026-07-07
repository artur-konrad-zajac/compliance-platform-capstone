import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, Sparkles } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';

import type { ChatMessage } from '../context/AppContext';

const formatRelativeTime = (timestamp: number) => {
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const diffInMs = timestamp - Date.now();
  const diffInSeconds = Math.round(diffInMs / 1000);
  const diffInMinutes = Math.round(diffInSeconds / 60);
  const diffInHours = Math.round(diffInMinutes / 60);
  const diffInDays = Math.round(diffInHours / 24);
  const diffInWeeks = Math.round(diffInDays / 7);
  const diffInMonths = Math.round(diffInDays / 30);
  const diffInYears = Math.round(diffInDays / 365);

  if (Math.abs(diffInSeconds) < 60) return 'just now';
  if (Math.abs(diffInMinutes) < 60) return rtf.format(diffInMinutes, 'minute');
  if (Math.abs(diffInHours) < 24) return rtf.format(diffInHours, 'hour');
  if (Math.abs(diffInDays) < 7) return rtf.format(diffInDays, 'day');
  if (Math.abs(diffInWeeks) < 4) return rtf.format(diffInWeeks, 'week');
  if (Math.abs(diffInMonths) < 12) return rtf.format(diffInMonths, 'month');
  return rtf.format(diffInYears, 'year');
};

const formatWarsawTime = (timestamp: number) => {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
};

interface Props {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onSendAI?: (text: string) => void;
  onUpdateDraft?: (messageId: string, text: string, isDraft: boolean) => void;
  onDeleteDraft?: (messageId: string) => void;
  allowAskAI?: boolean;
  isReadOnly?: boolean;
  hasUnread?: boolean;
  onOpen?: () => void;
  title?: string;
}

export const QuestionChat: React.FC<Props> = ({ 
  messages, 
  onSend, 
  onSendAI, 
  onUpdateDraft, 
  onDeleteDraft,
  allowAskAI, 
  isReadOnly, 
  hasUnread, 
  onOpen, 
  title 
}) => {
  const { role } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text]);
  
  // We need a dummy state to force re-renders for relative time
  const [, setTick] = useState(0);

  useEffect(() => {
    if (isOpen) {
      const interval = setInterval(() => setTick(t => t + 1), 60000); // tick every minute
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [isOpen, messages]);

  const handleToggle = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState && onOpen) {
      onOpen();
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      if (allowAskAI && onSendAI) {
        onSendAI(text.trim());
      } else {
        onSend(text.trim());
      }
      setText('');
    }
  };

  const handleSendAI = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim() && onSendAI) {
      onSendAI(text.trim());
      setText('');
    }
  };

  return (
    <div className="mt-4">
      <button 
        onClick={handleToggle}
        className="flex items-center space-x-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 transition-colors relative"
      >
        <MessageSquare className="w-4 h-4" />
        <span>{title ? `${title} (${messages.length})` : `${messages.length} Comments`}</span>
        {hasUnread && (
          <span className="absolute -top-1 -right-3 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-3 -mx-4 bg-white dark:bg-[#1C1C1E] rounded-xl border border-gray-200 dark:border-[#27272A] overflow-hidden shadow-sm"
          >
            <div ref={scrollContainerRef} className="p-4 max-h-60 overflow-y-auto space-y-3 bg-[#F3F4F6]/50 dark:bg-[#0A0A0B]/50">
              {messages.length === 0 ? (
                <p className="text-center text-sm text-gray-500 py-4">No comments yet. Start a discussion!</p>
              ) : (
                messages.map((msg) => {
                  const isDraft = msg.isDraft;
                  const isAI = msg.isAI;
                  const isOwn = msg.role === role || isDraft;

                  if (isDraft && onUpdateDraft) {
                    return (
                      <div key={msg.id} className="flex flex-col items-end w-full">
                        <div className="draft-card-container bg-violet-50/50 dark:bg-violet-950/20 border border-violet-200/60 dark:border-violet-800/40 p-3 rounded-xl w-full max-w-[95%]">
                          <div className="flex items-center gap-2 text-violet-750 dark:text-violet-400 mb-2 text-xs font-bold uppercase tracking-wider">
                            <Sparkles className="w-3 h-3 text-violet-600 dark:text-violet-400" />
                            AI Draft for Compliance Reviewer
                          </div>
                          <textarea 
                            defaultValue={msg.text}
                            onBlur={(e) => onUpdateDraft(msg.id, e.target.value, true)}
                            className="w-full bg-white dark:bg-[#1C1C1E] border border-violet-200 dark:border-violet-800/60 rounded-lg p-2 text-sm focus:ring-2 focus:ring-violet-500 mb-2 text-gray-800 dark:text-gray-200"
                            rows={3}
                          />
                          <div className="mb-3 pt-2 border-t border-violet-200/50 dark:border-violet-800/50 text-[10px] text-violet-700 dark:text-violet-400 italic">
                            Disclaimer: This is an AI-generated response. It may contain inaccuracies.
                          </div>
                          <div className="flex justify-end gap-2">
                            {onDeleteDraft && (
                              <button 
                                onClick={() => onDeleteDraft(msg.id)}
                                className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold transition-colors"
                              >
                                Cancel
                              </button>
                            )}
                            <button 
                              onClick={(e) => {
                                const container = (e.target as any).closest('.draft-card-container');
                                const val = container ? container.querySelector('textarea').value : '';
                                onUpdateDraft(msg.id, val, false);
                              }}
                              className="px-3 py-1.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shadow-sm shadow-violet-500/20"
                            >
                              <Send className="w-3 h-3" /> Publish to Applicant
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div 
                      key={msg.id} 
                      className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                    >
                      <span className={`text-[10px] uppercase tracking-wider text-gray-400 mb-1 px-1 flex items-center gap-1.5 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                        <span className="font-bold">
                          {isAI ? (
                            <span className="flex items-center gap-1 text-violet-600 dark:text-violet-400">
                              <Sparkles className="w-3 h-3"/> AI Assistant
                            </span>
                          ) : msg.role === 'customer' ? 'Applicant' : msg.role === 'validator' ? 'Compliance Reviewer' : msg.role.charAt(0).toUpperCase() + msg.role.slice(1)}
                        </span>
                        <span className="normal-case opacity-70 tracking-normal text-[9px]">
                          {formatWarsawTime(msg.timestamp)} ({formatRelativeTime(msg.timestamp)})
                        </span>
                      </span>
                      <div className={`px-3 py-2 rounded-2xl max-w-[95%] text-sm ${
                        isAI 
                          ? 'bg-violet-50/50 dark:bg-violet-950/20 text-slate-800 dark:text-slate-200 border border-violet-100 dark:border-violet-900/30 rounded-tl-sm'
                          : isOwn 
                            ? 'bg-primary-500 text-white rounded-tr-sm' 
                            : 'bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-200 border border-slate-100 dark:border-slate-600 rounded-tl-sm'
                      }`}>
                        <ReactMarkdown 
                          components={{
                            strong: ({node, ...props}) => <strong className="font-bold" {...props} />,
                            p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                            a: ({node, ...props}) => <a className="underline text-blue-600 dark:text-blue-400" {...props} />,
                            ul: ({node, ...props}) => <ul className="list-disc ml-4 mb-2" {...props} />,
                            ol: ({node, ...props}) => <ol className="list-decimal ml-4 mb-2" {...props} />,
                            li: ({node, ...props}) => <li className="mb-1" {...props} />
                          }}
                        >
                          {msg.text}
                        </ReactMarkdown>
                        {isAI && (
                          <div className="mt-2 pt-2 border-t border-violet-200/50 dark:border-violet-800/50 text-[10px] text-violet-700 dark:text-violet-400 italic">
                            Disclaimer: This is an AI-generated response. It may contain inaccuracies.
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={endRef} />
            </div>
            
            {!isReadOnly && (
              <div className="p-3 border-t border-gray-200 dark:border-[#27272A] bg-white dark:bg-[#1C1C1E]">
                <form onSubmit={handleSend} className="flex flex-col gap-2 md:flex-row md:items-center">
                  <div className="flex flex-1 gap-2 items-center">
                    <textarea
                      ref={textareaRef}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (text.trim()) {
                            if (allowAskAI && onSendAI) {
                              onSendAI(text.trim());
                            } else {
                              onSend(text.trim());
                            }
                            setText('');
                          }
                        }
                      }}
                      placeholder="Type a message..."
                      rows={1}
                      className="flex-1 bg-slate-100 dark:bg-[#0A0A0B] border-none rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-primary-500 dark:text-gray-200 placeholder-slate-400 resize-none min-h-[38px] py-2"
                    />
                    {!allowAskAI && (
                      <button
                        type="submit"
                        disabled={!text.trim()}
                        className="p-2 shrink-0 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {allowAskAI && (
                    <div className="flex gap-2 w-full md:w-auto">
                      <button
                        type="submit"
                        disabled={!text.trim()}
                        className="flex-1 md:flex-none px-3 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-semibold whitespace-nowrap"
                      >
                        Ask Human
                      </button>
                      <button
                        type="button"
                        onClick={handleSendAI}
                        disabled={!text.trim()}
                        className="flex-1 md:flex-none px-3 py-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all text-xs font-semibold whitespace-nowrap flex items-center justify-center gap-1 shadow-sm shadow-violet-500/20"
                      >
                        <Sparkles className="w-3 h-3" /> Ask AI
                      </button>
                    </div>
                  )}
                </form>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
