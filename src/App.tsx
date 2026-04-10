import { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  MessageSquare, 
  Trash2, 
  Send, 
  Paperclip, 
  X, 
  Copy, 
  Check, 
  Menu,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  User,
  Bot,
  Loader2,
  FileText,
  Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { format } from 'date-fns';
import { cn } from './lib/utils';
import { ChatSession, Message, Attachment } from './types';
import { streamChatResponse } from './lib/gemini';

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load sessions from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('maksud_ai_chats');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSessions(parsed);
        if (parsed.length > 0) {
          setCurrentSessionId(parsed[0].id);
        }
      } catch (e) {
        console.error('Failed to parse saved chats', e);
      }
    }
    
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Save sessions to localStorage
  useEffect(() => {
    localStorage.setItem('maksud_ai_chats', JSON.stringify(sessions));
  }, [sessions]);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessions, currentSessionId, isTyping]);

  const currentSession = sessions.find(s => s.id === currentSessionId);

  const createNewChat = () => {
    const newSession: ChatSession = {
      id: crypto.randomUUID(),
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setSessions([newSession, ...sessions]);
    setCurrentSessionId(newSession.id);
    if (isMobile) setIsSidebarOpen(false);
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    if (currentSessionId === id) {
      setCurrentSessionId(updated.length > 0 ? updated[0].id : null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const reader = new FileReader();
      
      if (file.type.startsWith('image/')) {
        reader.onload = (event) => {
          const url = event.target?.result as string;
          setAttachments(prev => [...prev, { name: file.name, type: file.type, url }]);
        };
        reader.readAsDataURL(file);
      } else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        reader.onload = (event) => {
          const content = event.target?.result as string;
          setAttachments(prev => [...prev, { name: file.name, type: file.type, url: '', content }]);
        };
        reader.readAsText(file);
      } else if (file.type === 'application/pdf') {
        // For PDF, in a real app we'd use a library like pdf.js
        // Here we'll just show it as an attachment placeholder
        setAttachments(prev => [...prev, { name: file.name, type: file.type, url: '', content: '[PDF Content Placeholder]' }]);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (!input.trim() && attachments.length === 0) return;
    
    let activeId = currentSessionId;
    let isNewSession = false;
    let newSession: ChatSession | null = null;
    
    if (!activeId) {
      isNewSession = true;
      activeId = crypto.randomUUID();
      newSession = {
        id: activeId,
        title: input.slice(0, 30) || 'New Chat',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
      attachments: attachments.length > 0 ? [...attachments] : undefined,
    };

    // Update sessions state with user message
    setSessions(prev => {
      let updated = [...prev];
      if (isNewSession && newSession) {
        updated = [newSession, ...updated];
      }
      return updated.map(s => {
        if (s.id === activeId) {
          return {
            ...s,
            messages: [...s.messages, userMessage],
            title: s.messages.length === 0 ? (input.slice(0, 30) || 'New Chat') : s.title,
            updatedAt: Date.now(),
          };
        }
        return s;
      });
    });

    if (isNewSession) {
      setCurrentSessionId(activeId);
    }

    const currentHistory = currentSession?.messages || [];
    const messagesToStream = [...currentHistory, userMessage];

    setInput('');
    setAttachments([]);
    setIsTyping(true);

    try {
      const aiMessage: Message = {
        id: crypto.randomUUID(),
        role: 'ai',
        content: '',
        timestamp: Date.now(),
      };

      // Add empty AI message first
      setSessions(prev => prev.map(s => {
        if (s.id === activeId) {
          return { ...s, messages: [...s.messages, aiMessage] };
        }
        return s;
      }));

      let fullContent = '';
      const stream = streamChatResponse(messagesToStream);
      
      for await (const chunk of stream) {
        fullContent += chunk;
        setSessions(prev => prev.map(s => {
          if (s.id === activeId) {
            const lastMsg = { ...s.messages[s.messages.length - 1], content: fullContent };
            return { ...s, messages: [...s.messages.slice(0, -1), lastMsg] };
          }
          return s;
        }));
      }
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsTyping(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white overflow-hidden">
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
            className={cn(
              "fixed inset-y-0 left-0 z-50 w-72 bg-[#111] border-r border-[#222] flex flex-col",
              "md:relative md:translate-x-0"
            )}
          >
            <div className="p-4">
              <button
                type="button"
                onClick={createNewChat}
                className="w-full flex items-center gap-3 px-4 py-3 bg-[#1e1e1e] hover:bg-[#2a2a2a] border border-[#333] rounded-lg transition-all text-sm font-medium"
              >
                <Plus size={18} />
                New Chat
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 space-y-1">
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Recent Chats
              </div>
              {sessions.map(session => (
                <div
                  key={session.id}
                  onClick={() => {
                    setCurrentSessionId(session.id);
                    if (isMobile) setIsSidebarOpen(false);
                  }}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-sm",
                    currentSessionId === session.id ? "bg-[#222] text-white" : "text-gray-400 hover:bg-[#1a1a1a] hover:text-gray-200"
                  )}
                >
                  <MessageSquare size={16} className="shrink-0" />
                  <span className="flex-1 truncate">{session.title}</span>
                  <button
                    type="button"
                    onClick={(e) => deleteChat(session.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-[#222]">
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#1a1a1a]">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center font-bold text-xs">
                  M
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">Maksud User</p>
                  <p className="text-xs text-gray-500 truncate">Free Plan</p>
                </div>
                <MoreVertical size={16} className="text-gray-500" />
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-[#222] flex items-center justify-between px-4 bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-[#1a1a1a] rounded-lg transition-colors"
            >
              <Menu size={20} />
            </button>
            <h1 className="font-semibold text-lg tracking-tight">
              Maksud <span className="text-blue-500">Intelligent AI</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {!currentSession || currentSession.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-2xl shadow-blue-500/20"
              >
                <Bot size={32} className="text-white" />
              </motion.div>
              <h2 className="text-2xl font-bold mb-2">How can I help you today?</h2>
              <p className="text-gray-500 max-w-md mb-8">
                Maksud Intelligent AI can help you with writing, coding, learning, or just having a friendly conversation.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full">
                {[
                  "Write a professional email",
                  "Explain quantum physics",
                  "Help me with a React bug",
                  "Create a workout plan"
                ].map((suggestion, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setInput(suggestion)}
                    className="p-4 bg-[#111] hover:bg-[#1a1a1a] border border-[#222] rounded-xl text-sm text-left transition-all"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto py-8 px-4 space-y-8">
              {currentSession.messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-4 group",
                    message.role === 'user' ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1",
                    message.role === 'user' ? "bg-blue-600" : "bg-[#1a1a1a] border border-[#333]"
                  )}>
                    {message.role === 'user' ? <User size={16} /> : <Bot size={16} className="text-blue-500" />}
                  </div>
                  
                  <div className={cn(
                    "flex flex-col max-w-[85%]",
                    message.role === 'user' ? "items-end" : "items-start"
                  )}>
                    <div className={cn(
                      "px-4 py-3 rounded-2xl text-sm leading-relaxed",
                      message.role === 'user' 
                        ? "bg-[#1e1e1e] text-white rounded-tr-none" 
                        : "bg-transparent text-gray-200"
                    )}>
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {message.attachments.map((att, i) => (
                            <div key={i} className="relative group/att">
                              {att.type.startsWith('image/') ? (
                                <img 
                                  src={att.url} 
                                  alt={att.name} 
                                  className="max-w-[200px] max-h-[200px] rounded-lg border border-[#333] object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="flex items-center gap-2 px-3 py-2 bg-[#2a2a2a] rounded-lg border border-[#333] text-xs">
                                  <FileText size={14} className="text-blue-400" />
                                  <span className="truncate max-w-[120px]">{att.name}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="markdown-body">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-[10px] text-gray-600">
                        {format(message.timestamp, 'h:mm a')}
                      </span>
                      <button 
                        type="button"
                        onClick={() => copyToClipboard(message.content, message.id)}
                        className="p-1 hover:text-blue-400 transition-colors"
                      >
                        {copiedId === message.id ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-[#1a1a1a] border border-[#333] flex items-center justify-center shrink-0">
                    <Bot size={16} className="text-blue-500" />
                  </div>
                  <div className="flex items-center gap-1 px-4 py-3 bg-[#1a1a1a] rounded-2xl rounded-tl-none">
                    <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 md:p-6 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a] to-transparent">
          <div className="max-w-3xl mx-auto">
            {/* Attachment Previews */}
            <AnimatePresence>
              {attachments.length > 0 && (
                <motion.div 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 20, opacity: 0 }}
                  className="flex flex-wrap gap-2 mb-3"
                >
                  {attachments.map((att, i) => (
                    <div key={i} className="relative group">
                      {att.type.startsWith('image/') ? (
                        <div className="w-16 h-16 rounded-lg overflow-hidden border border-[#333]">
                          <img src={att.url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] rounded-lg border border-[#333] text-xs">
                          <FileText size={14} className="text-blue-400" />
                          <span className="truncate max-w-[100px]">{att.name}</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeAttachment(i)}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative flex items-end gap-2 bg-[#1a1a1a] border border-[#333] rounded-2xl p-2 focus-within:border-blue-500/50 transition-colors shadow-xl">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                multiple
                className="hidden"
                accept="image/*,.txt,.pdf"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 text-gray-400 hover:text-white hover:bg-[#222] rounded-xl transition-all"
              >
                <Paperclip size={20} />
              </button>
              
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Message Maksud AI..."
                className="flex-1 bg-transparent border-none focus:ring-0 resize-none py-2.5 px-2 text-sm max-h-40 min-h-[40px]"
                rows={1}
                style={{ height: 'auto' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${target.scrollHeight}px`;
                }}
              />

              <button
                type="button"
                onClick={handleSend}
                disabled={(!input.trim() && attachments.length === 0) || isTyping}
                className={cn(
                  "p-2.5 rounded-xl transition-all",
                  input.trim() || attachments.length > 0
                    ? "bg-blue-600 text-white hover:bg-blue-500"
                    : "bg-[#222] text-gray-600 cursor-not-allowed"
                )}
              >
                {isTyping ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
              </button>
            </div>
            <p className="text-[10px] text-center text-gray-600 mt-3">
              Maksud Intelligent AI can make mistakes. Check important info.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
