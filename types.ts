export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

export interface Memory {
  id: string;
  type: 'preference' | 'personal' | 'fact' | 'goal' | 'context';
  content: string;
  importance: number;
  createdAt: string;
}

export interface ConversationSession {
  id: string;
  title: string;
  messages: Message[];
  topic: string | null;
  lastUpdated: number;
}

export interface AppState {
  currentSessionId: string | null;
  sessions: Record<string, ConversationSession>;
  memories: Memory[];
  isSidebarOpen: boolean;
  isContextPanelOpen: boolean;
}

export interface TopicDetectionResult {
  topic_changed: boolean;
  new_topic: string | null;
}

export interface MemoryExtractionItem {
  type: 'preference' | 'personal' | 'fact' | 'goal' | 'context';
  content: string;
  importance: number;
}