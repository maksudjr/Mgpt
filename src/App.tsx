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
  Image as ImageIcon,
  Mic,
  MicOff,
  Sun,
  Moon
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load sessions from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('maksud_ai_theme') as 'dark' | 'light';
    if (savedTheme) setTheme(savedTheme);

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
    try {
      localStorage.setItem('maksud_ai_chats', JSON.stringify(sessions));
    } catch (e) {
      console.error('LocalStorage quota exceeded, clearing old chats');
      if (sessions.length > 10) {
        setSessions(prev => prev.slice(0, 10));
      }
    }
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem('maksud_ai_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Speech Recognition Setup
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        
        if (finalTranscript) {
          setInput(prev => prev + (prev ? ' ' : '') + finalTranscript);
        }
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (e) {
        console.error('Failed to start speech recognition', e);
      }
    }
  };

  // Auto-scroll to bottom with debounce/throttle or just simpler logic
  useEffect(() => {
    if (chatEndRef.current) {
      const scrollOptions: ScrollIntoViewOptions = { behavior: 'auto' }; // 'auto' is faster than 'smooth'
      chatEndRef.current.scrollIntoView(scrollOptions);
    }
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
    e.preventDefault();
    const files = e.target.files;
    if (!files) return;

    const newAttachments: Attachment[] = [];
    
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      
      const promise = new Promise<void>((resolve) => {
        if (file.type.startsWith('image/')) {
          reader.onload = (event) => {
            const url = event.target?.result as string;
            newAttachments.push({ name: file.name, type: file.type, url });
            resolve();
          };
          reader.readAsDataURL(file);
        } else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
          reader.onload = (event) => {
            const content = event.target?.result as string;
            newAttachments.push({ name: file.name, type: file.type, url: '', content });
            resolve();
          };
          reader.readAsText(file);
        } else {
          newAttachments.push({ name: file.name, type: file.type, url: '', content: `[${file.type} Placeholder]` });
          resolve();
        }
      });
      await promise;
    }
    
    setAttachments(prev => [...prev, ...newAttachments]);
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
    <div className={cn(
      "flex h-screen overflow-hidden transition-colors duration-300",
      theme === 'dark' ? "bg-[#0a0a0a] text-white" : "bg-white text-gray-900"
    )}>
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
            className={cn(
              "fixed inset-y-0 left-0 z-50 w-72 flex flex-col shadow-2xl transition-colors duration-300",
              theme === 'dark' ? "bg-[#111] border-r border-[#222]" : "bg-gray-50 border-r border-gray-200",
              "md:relative md:translate-x-0",
              !isSidebarOpen && "hidden md:hidden"
            )}
          >
            <div className="p-4">
              <button
                type="button"
                onClick={createNewChat}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 border rounded-lg transition-all text-sm font-medium",
                  theme === 'dark' 
                    ? "bg-[#1e1e1e] hover:bg-[#2a2a2a] border-[#333]" 
                    : "bg-white hover:bg-gray-100 border-gray-200 shadow-sm"
                )}
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
                    currentSessionId === session.id 
                      ? (theme === 'dark' ? "bg-[#222] text-white" : "bg-gray-200 text-gray-900")
                      : (theme === 'dark' ? "text-gray-400 hover:bg-[#1a1a1a] hover:text-gray-200" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900")
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

            <div className={cn("p-4 border-t", theme === 'dark' ? "border-[#222]" : "border-gray-200")}>
              <div className={cn("flex items-center gap-3 px-3 py-2 rounded-lg", theme === 'dark' ? "bg-[#1a1a1a]" : "bg-gray-100")}>
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center font-bold text-xs text-white">
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
        <header className={cn(
          "h-14 border-b flex items-center justify-between px-4 backdrop-blur-md sticky top-0 z-40 transition-colors duration-300",
          theme === 'dark' ? "bg-[#0a0a0a]/80 border-[#222]" : "bg-white/80 border-gray-200"
        )}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={cn(
                "p-2 rounded-lg transition-colors",
                theme === 'dark' ? "hover:bg-[#1a1a1a]" : "hover:bg-gray-100"
              )}
            >
              <MoreVertical size={20} />
            </button>
            <h1 className="font-semibold text-lg tracking-tight">
              Maksud <span className="text-blue-500">Intelligent AI</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className={cn(
                "p-2 rounded-lg transition-all",
                theme === 'dark' ? "hover:bg-[#1a1a1a] text-yellow-400" : "hover:bg-gray-100 text-blue-600"
              )}
              title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {!currentSession || currentSession.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
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
                    message.role === 'user' 
                      ? "bg-blue-600 text-white" 
                      : (theme === 'dark' ? "bg-[#1a1a1a] border border-[#333]" : "bg-gray-100 border border-gray-200")
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
                        ? (theme === 'dark' ? "bg-[#1e1e1e] text-white rounded-tr-none" : "bg-blue-50 text-gray-900 rounded-tr-none border border-blue-100")
                        : "bg-transparent"
                    )}>
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {message.attachments.map((att, i) => (
                            <div key={i} className="relative group/att">
                              {att.type.startsWith('image/') ? (
                                <img 
                                  src={att.url} 
                                  alt={att.name} 
                                  className={cn(
                                    "max-w-[200px] max-h-[200px] rounded-lg border object-cover",
                                    theme === 'dark' ? "border-[#333]" : "border-gray-200"
                                  )}
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className={cn(
                                  "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs",
                                  theme === 'dark' ? "bg-[#2a2a2a] border-[#333]" : "bg-gray-50 border-gray-200"
                                )}>
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
        <div className={cn(
          "p-4 md:p-6 transition-colors duration-300",
          theme === 'dark' 
            ? "bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a] to-transparent" 
            : "bg-gradient-to-t from-white via-white to-transparent"
        )}>
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
                        <div className={cn("w-16 h-16 rounded-lg overflow-hidden border", theme === 'dark' ? "border-[#333]" : "border-gray-200")}>
                          <img src={att.url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                      ) : (
                        <div className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs",
                          theme === 'dark' ? "bg-[#1a1a1a] border-[#333]" : "bg-gray-50 border-gray-200"
                        )}>
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

            <div className={cn(
              "relative flex items-end gap-2 border rounded-2xl p-2 focus-within:border-blue-500/50 transition-all shadow-xl",
              theme === 'dark' ? "bg-[#1a1a1a] border-[#333]" : "bg-white border-gray-200"
            )}>
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
                onClick={(e) => {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }}
                className={cn(
                  "p-2.5 rounded-xl transition-all",
                  theme === 'dark' ? "text-gray-400 hover:text-white hover:bg-[#222]" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                )}
              >
                <Paperclip size={20} />
              </button>

              <button
                type="button"
                onClick={toggleListening}
                className={cn(
                  "p-2.5 rounded-xl transition-all",
                  isListening 
                    ? "bg-red-500 text-white animate-pulse" 
                    : (theme === 'dark' ? "text-gray-400 hover:text-white hover:bg-[#222]" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100")
                )}
                title={isListening ? "Stop Listening" : "Start Voice Typing"}
              >
                {isListening ? <MicOff size={20} /> : <Mic size={20} />}
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
                className={cn(
                  "flex-1 bg-transparent border-none focus:ring-0 resize-none py-2.5 px-2 text-sm max-h-40 min-h-[40px]",
                  theme === 'dark' ? "text-white placeholder-gray-500" : "text-gray-900 placeholder-gray-400"
                )}
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
                    : (theme === 'dark' ? "bg-[#222] text-gray-600 cursor-not-allowed" : "bg-gray-100 text-gray-400 cursor-not-allowed")
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
