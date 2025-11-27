import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MessageSquare, 
  Menu, 
  Plus, 
  BrainCircuit, 
  Trash2, 
  Send, 
  X,
  History,
  Layout,
  User,
  Heart,
  Target,
  Lightbulb
} from 'lucide-react';
import { ConversationSession, Message, Memory } from './types';
import * as Storage from './services/storageService';
import * as GeminiService from './services/geminiService';
import MarkdownRenderer from './components/MarkdownRenderer';
import { INITIAL_GREETING } from './constants';

const App: React.FC = () => {
  // --- State ---
  const [sessions, setSessions] = useState<Record<string, ConversationSession>>({});
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  
  const [showSidebar, setShowSidebar] = useState(true);
  const [showContextPanel, setShowContextPanel] = useState(true);

  // --- Refs ---
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Initialization ---
  useEffect(() => {
    const loadedSessions = Storage.getSessions();
    const loadedMemories = Storage.getMemories();
    
    setSessions(loadedSessions);
    setMemories(loadedMemories);

    // Load most recent session or create new
    const sessionIds = Object.keys(loadedSessions).sort((a, b) => loadedSessions[b].lastUpdated - loadedSessions[a].lastUpdated);
    
    if (sessionIds.length > 0) {
      setCurrentSessionId(sessionIds[0]);
    } else {
      createNewSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Derived State ---
  const currentSession = currentSessionId ? sessions[currentSessionId] : null;

  // --- Effects ---
  useEffect(() => {
    scrollToBottom();
  }, [currentSession?.messages, isStreaming]);

  // --- Helpers ---
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const createNewSession = () => {
    const newSession = Storage.createNewSession();
    // Add initial greeting
    newSession.messages.push({
      id: 'init',
      role: 'model',
      content: INITIAL_GREETING,
      timestamp: Date.now()
    });
    
    Storage.saveSession(newSession);
    setSessions(prev => ({ ...prev, [newSession.id]: newSession }));
    setCurrentSessionId(newSession.id);
    if (window.innerWidth < 768) setShowSidebar(false);
  };

  const handleDeleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    Storage.deleteSession(id);
    setSessions(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    
    if (currentSessionId === id) {
      setCurrentSessionId(null);
      // Determine next session to show or create new
      const remainingIds = Object.keys(sessions).filter(k => k !== id);
      if (remainingIds.length > 0) {
        setCurrentSessionId(remainingIds[0]);
      } else {
        createNewSession();
      }
    }
  };

  const handleClearMemories = () => {
    if (window.confirm("Are you sure you want to clear all learned memories? Askly will forget everything about you.")) {
      Storage.clearAllData(); // This clears everything, maybe we just want to clear memories?
      // Re-implement just clearing memories for this button to be safe
      localStorage.removeItem('askly_memories');
      setMemories([]);
    }
  };

  // --- Core Logic ---
  const handleSendMessage = async () => {
    if (!input.trim() || !currentSessionId || isStreaming) return;

    const userMsgContent = input;
    setInput('');

    // 1. Optimistically update UI
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userMsgContent,
      timestamp: Date.now()
    };

    const session = sessions[currentSessionId];
    const updatedMessages = [...session.messages, userMsg];
    
    const updatedSession = {
      ...session,
      messages: updatedMessages,
      lastUpdated: Date.now()
    };

    setSessions(prev => ({ ...prev, [currentSessionId]: updatedSession }));
    Storage.saveSession(updatedSession);

    // 2. Prepare Model Placeholder
    const modelMsgId = (Date.now() + 1).toString();
    setIsStreaming(true);

    let streamBuffer = '';
    
    try {
      // 3. Call Gemini
      await GeminiService.streamChatResponse(
        updatedMessages,
        memories,
        session.topic,
        (chunk) => {
          streamBuffer += chunk;
          
          setSessions(prev => {
            const activeSession = prev[currentSessionId];
            if (!activeSession) return prev;

            const msgs = [...activeSession.messages];
            // Check if model message exists, if not add it, else update it
            const existingIdx = msgs.findIndex(m => m.id === modelMsgId);
            
            if (existingIdx === -1) {
              msgs.push({
                id: modelMsgId,
                role: 'model',
                content: streamBuffer,
                timestamp: Date.now()
              });
            } else {
              msgs[existingIdx] = {
                ...msgs[existingIdx],
                content: streamBuffer
              };
            }

            return {
              ...prev,
              [currentSessionId]: {
                ...activeSession,
                messages: msgs
              }
            };
          });
        }
      );

      // 4. Post-Processing (Background Tasks)
      // Save final state
      const finalSessionState = Storage.getSessions()[currentSessionId]; // Refetch recent state
      Storage.saveSession(finalSessionState);

      // Trigger Context Updates (Topic & Memory) without blocking UI
      performContextAnalysis(currentSessionId, updatedMessages, streamBuffer, session.topic);

      // Trigger Title Generation if it's still default
      if (session.title === 'New Conversation' && updatedMessages.length >= 2) {
        // We include the assistant response in the history passed to title generator
        const historyForTitle = [...updatedMessages, { role: 'model', content: streamBuffer, id: modelMsgId, timestamp: Date.now() } as Message];
        const newTitle = await GeminiService.generateSessionTitle(historyForTitle);
        setSessions(prev => {
          const s = prev[currentSessionId];
          if (!s) return prev;
          const updated = { ...s, title: newTitle };
          Storage.saveSession(updated);
          return { ...prev, [currentSessionId]: updated };
        });
      }

    } catch (error) {
      console.error("Chat error", error);
      // Add error message to chat
      setSessions(prev => {
        const s = prev[currentSessionId];
        return {
           ...prev,
           [currentSessionId]: {
             ...s,
             messages: [...s.messages, {
               id: Date.now().toString(),
               role: 'model',
               content: "I encountered an error connecting to my brain. Please try again.",
               timestamp: Date.now()
             }]
           }
        }
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const performContextAnalysis = async (
    sessionId: string, 
    history: Message[], 
    lastResponse: string,
    currentTopic: string | null
  ) => {
    const recentMsgs = [...history, { role: 'model', content: lastResponse, id: 'temp', timestamp: Date.now() } as Message].slice(-4);
    const lastUserMsg = history[history.length - 1].content;

    // Parallel execution for speed
    const [topicResult, memoryResult] = await Promise.all([
      GeminiService.detectTopicChange(recentMsgs, currentTopic),
      GeminiService.extractMemories(lastUserMsg, lastResponse)
    ]);

    // Update Topic
    if (topicResult && topicResult.topic_changed && topicResult.new_topic) {
      setSessions(prev => {
        const s = prev[sessionId];
        if (!s) return prev;
        const updated = { ...s, topic: topicResult.new_topic };
        Storage.saveSession(updated);
        return { ...prev, [sessionId]: updated };
      });
    }

    // Update Memories
    if (memoryResult.length > 0) {
      const newMemories: Memory[] = memoryResult.map(m => ({
        id: Math.random().toString(36).substring(7),
        type: m.type,
        content: m.content,
        importance: m.importance,
        createdAt: new Date().toISOString()
      }));

      newMemories.forEach(m => Storage.saveMemory(m));
      setMemories(Storage.getMemories()); // Reload
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // --- Render Helpers ---
  const renderMemoryGroup = (type: string, icon: React.ReactNode, label: string) => {
    const groupMemories = memories.filter(m => m.type === type).sort((a, b) => b.importance - a.importance);
    if (groupMemories.length === 0) return null;

    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
          {icon} {label}
        </div>
        <div className="space-y-2">
          {groupMemories.map(memory => (
             <div key={memory.id} className="bg-white border border-gray-100 p-2.5 rounded-lg shadow-sm hover:shadow-md transition-all group">
                <div className="flex justify-between items-start">
                   <p className="text-xs text-gray-700 leading-relaxed font-medium">
                     {memory.content}
                   </p>
                   <div className="flex gap-0.5 ml-2 mt-0.5 opacity-50 group-hover:opacity-100 transition-opacity">
                      {/* SAFEGUARD: prevent RangeError by ensuring positive integer */}
                      {Array.from({ length: Math.max(0, Math.ceil((memory.importance || 0) * 3)) || 0 }).map((_, i) => (
                         <div key={i} className="w-1 h-1 bg-blue-400 rounded-full"></div>
                      ))}
                   </div>
                </div>
             </div>
          ))}
        </div>
      </div>
    );
  };

  // --- Render ---
  return (
    <div className="flex h-screen bg-white overflow-hidden">
      
      {/* Sidebar - Sessions */}
      <div 
        className={`${showSidebar ? 'translate-x-0' : '-translate-x-full'} 
        absolute md:relative z-30 w-72 h-full bg-slate-900 text-slate-100 flex flex-col transition-transform duration-300 shadow-xl md:shadow-none`}
      >
        <div className="p-4 border-b border-slate-700 flex justify-between items-center">
          <div className="flex items-center gap-2 font-bold text-xl">
            <BrainCircuit className="text-blue-400" />
            <span>Askly</span>
          </div>
          <button onClick={() => setShowSidebar(false)} className="md:hidden p-1 hover:bg-slate-700 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="p-3">
          <button 
            onClick={createNewSession}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-lg transition-colors font-medium shadow-sm"
          >
            <Plus size={18} />
            <span>New Chat</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">History</div>
          {(Object.values(sessions) as ConversationSession[])
            .sort((a, b) => b.lastUpdated - a.lastUpdated)
            .map(session => (
            <div 
              key={session.id}
              onClick={() => {
                setCurrentSessionId(session.id);
                if (window.innerWidth < 768) setShowSidebar(false);
              }}
              className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all border border-transparent
                ${currentSessionId === session.id 
                  ? 'bg-slate-800 border-slate-700 text-blue-100 shadow-sm' 
                  : 'hover:bg-slate-800/50 text-slate-400 hover:text-slate-200'
                }`}
            >
              <div className="flex flex-col overflow-hidden w-full">
                <span className="truncate font-medium text-sm">
                  {session.title === "New Conversation" && session.messages.length > 2 
                    ? "Generating Title..." 
                    : session.title}
                </span>
                <span className="truncate text-xs text-slate-500 flex justify-between w-full mt-1">
                  <span>{new Date(session.lastUpdated).toLocaleDateString()}</span>
                  {session.topic && <span className="text-slate-600">{session.topic}</span>}
                </span>
              </div>
              <button 
                onClick={(e) => handleDeleteSession(e, session.id)}
                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-900/50 hover:text-red-400 rounded transition-opacity absolute right-2"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-700 text-xs text-slate-500 text-center">
          Powered by Gemini 2.5 Flash
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full relative min-w-0 bg-slate-50">
        
        {/* Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 shadow-sm z-10">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-600"
            >
              <Menu size={20} />
            </button>
            <div className="flex flex-col">
              <h1 className="font-semibold text-gray-800 truncate max-w-[200px] sm:max-w-md">
                {currentSession?.title || "New Conversation"}
              </h1>
              {currentSession?.topic && (
                <span className="text-xs text-blue-600 font-medium">Topic: {currentSession.topic}</span>
              )}
            </div>
          </div>
          
          <button 
            onClick={() => setShowContextPanel(!showContextPanel)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
              ${showContextPanel 
                ? 'bg-blue-50 border-blue-200 text-blue-700' 
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            <Layout size={18} />
            <span className="hidden sm:inline">Context Memory</span>
          </button>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {currentSession?.messages.map((msg, idx) => (
            <div 
              key={msg.id} 
              className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`flex max-w-[85%] sm:max-w-[75%] rounded-2xl px-5 py-4 shadow-sm ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-none' 
                    : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                }`}
              >
                <div className="text-sm sm:text-base leading-relaxed">
                  {msg.role === 'user' 
                    ? <div className="whitespace-pre-wrap">{msg.content}</div>
                    : <MarkdownRenderer content={msg.content} />
                  }
                </div>
              </div>
            </div>
          ))}
          {isStreaming && !currentSession?.messages.some(m => m.id.length > 13) && (
             // Simple loader if buffer hasn't flushed yet
             <div className="flex justify-start">
               <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-gray-100 shadow-sm flex items-center gap-2">
                 <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                 <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                 <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
               </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-gray-200">
          <div className="max-w-4xl mx-auto relative flex items-end gap-2">
             <div className="relative flex-1 bg-gray-50 border border-gray-300 rounded-2xl focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400 transition-all shadow-inner">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  className="w-full bg-transparent border-none focus:ring-0 p-4 min-h-[56px] max-h-32 resize-none text-gray-800 placeholder-gray-400"
                  rows={1}
                />
             </div>
             <button
              onClick={handleSendMessage}
              disabled={!input.trim() || isStreaming}
              className="p-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-full shadow-md transition-all flex-shrink-0"
             >
               <Send size={20} className={input.trim() ? "ml-0.5" : ""} />
             </button>
          </div>
          <div className="text-center mt-2">
            <span className="text-[10px] text-gray-400">Askly generates text using Gemini 2.5 Flash. Check important info.</span>
          </div>
        </div>
      </div>

      {/* Context Panel (Right Sidebar) */}
      <div 
        className={`${showContextPanel ? 'translate-x-0 w-80' : 'translate-x-full w-0'} 
        hidden lg:flex flex-col bg-white border-l border-gray-200 transition-all duration-300 ease-in-out overflow-hidden shadow-lg`}
      >
        <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
          <div>
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <BrainCircuit size={18} className="text-purple-600" />
              Context Memory
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              What I've learned about you
            </p>
          </div>
          {memories.length > 0 && (
            <button 
              onClick={handleClearMemories} 
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
              title="Forget all memories"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
          
          {memories.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center p-4 border-2 border-dashed border-gray-100 rounded-xl bg-gray-50/50">
              <BrainCircuit size={32} className="text-gray-200 mb-2" />
              <p className="text-sm font-medium text-gray-500">No memories yet</p>
              <p className="text-xs text-gray-400 mt-1">
                Chat with me and I'll start remembering your preferences and facts.
              </p>
            </div>
          ) : (
            <>
              {renderMemoryGroup('personal', <User size={12}/>, 'Personal Details')}
              {renderMemoryGroup('preference', <Heart size={12}/>, 'Preferences')}
              {renderMemoryGroup('goal', <Target size={12}/>, 'Goals')}
              {renderMemoryGroup('fact', <Lightbulb size={12}/>, 'Facts')}
              {renderMemoryGroup('context', <Layout size={12}/>, 'Other Context')}
            </>
          )}
        </div>
      </div>

    </div>
  );
};

export default App;