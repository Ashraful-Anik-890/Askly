import { ConversationSession, Memory, Message } from '../types';

const SESSIONS_KEY = 'askly_sessions';
const MEMORIES_KEY = 'askly_memories';

export const saveSession = (session: ConversationSession) => {
  const sessions = getSessions();
  sessions[session.id] = session;
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
};

export const getSessions = (): Record<string, ConversationSession> => {
  try {
    const data = localStorage.getItem(SESSIONS_KEY);
    return data ? JSON.parse(data) : {};
  } catch (e) {
    console.error("Failed to load sessions", e);
    return {};
  }
};

export const deleteSession = (id: string) => {
  const sessions = getSessions();
  delete sessions[id];
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
};

export const getMemories = (): Memory[] => {
  try {
    const data = localStorage.getItem(MEMORIES_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to load memories", e);
    return [];
  }
};

export const saveMemory = (memory: Memory) => {
  const memories = getMemories();
  // Simple duplicate check based on content
  if (!memories.some(m => m.content === memory.content)) {
    memories.push(memory);
    // Keep top 50 most important/recent
    const sorted = memories.sort((a, b) => b.importance - a.importance).slice(0, 50);
    localStorage.setItem(MEMORIES_KEY, JSON.stringify(sorted));
  }
};

export const clearAllData = () => {
  localStorage.removeItem(SESSIONS_KEY);
  localStorage.removeItem(MEMORIES_KEY);
};

export const createNewSession = (): ConversationSession => {
  const id = Date.now().toString();
  return {
    id,
    title: 'New Conversation',
    messages: [],
    topic: null,
    lastUpdated: Date.now(),
  };
};