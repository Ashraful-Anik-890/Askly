import { GoogleGenAI, Type } from "@google/genai";
import { Message, Memory, TopicDetectionResult, MemoryExtractionItem } from '../types';
import { MODEL_NAME, REASONING_MODEL, SYSTEM_INSTRUCTION, TOPIC_DETECTION_PROMPT, MEMORY_EXTRACTION_PROMPT } from '../constants';

const apiKey = process.env.API_KEY || ''; 
// In a real app, we would handle missing API key gracefully, but per instructions we assume it exists.
const ai = new GoogleGenAI({ apiKey });

export const streamChatResponse = async (
  currentHistory: Message[],
  memories: Memory[],
  currentTopic: string | null,
  onChunk: (text: string) => void
): Promise<string> => {
  
  // Construct a context-rich system instruction
  const memoryContext = memories.map(m => `- [${m.type.toUpperCase()}] ${m.content}`).join('\n');
  const contextString = `
  Current Topic: ${currentTopic || 'General'}
  Relevant Memories:
  ${memoryContext}
  `;

  const finalSystemInstruction = `${SYSTEM_INSTRUCTION}\n\n${contextString}`;

  // Format history for Gemini
  // Note: We only send the last 20 messages to keep context window clean and efficient
  const contents = currentHistory.slice(-20).map(msg => ({
    role: msg.role,
    parts: [{ text: msg.content }]
  }));

  try {
    const chat = ai.chats.create({
      model: MODEL_NAME,
      config: {
        systemInstruction: finalSystemInstruction,
      },
      history: contents.slice(0, -1), // Everything but the last user message
    });

    const lastMessage = contents[contents.length - 1].parts[0].text;
    
    const result = await chat.sendMessageStream({
        message: lastMessage
    });

    let fullText = '';
    for await (const chunk of result) {
      const text = chunk.text;
      if (text) {
        fullText += text;
        onChunk(text);
      }
    }
    return fullText;

  } catch (error) {
    console.error("Gemini Chat Error:", error);
    throw error;
  }
};

export const detectTopicChange = async (
  recentHistory: Message[],
  currentTopic: string | null
): Promise<TopicDetectionResult | null> => {
  if (recentHistory.length < 2) return null;

  const historyText = recentHistory.map(m => `${m.role}: ${m.content}`).join('\n');
  const prompt = `${TOPIC_DETECTION_PROMPT}\n\nCurrent Topic: ${currentTopic}\n\nRecent History:\n${historyText}`;

  try {
    const response = await ai.models.generateContent({
      model: REASONING_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                topic_changed: { type: Type.BOOLEAN },
                new_topic: { type: Type.STRING, nullable: true }
            }
        }
      }
    });

    const text = response.text;
    if (!text) return null;
    return JSON.parse(text) as TopicDetectionResult;
  } catch (error) {
    console.warn("Topic detection failed silently:", error);
    return null;
  }
};

export const extractMemories = async (
  userMessage: string,
  aiResponse: string
): Promise<MemoryExtractionItem[]> => {
  const prompt = `${MEMORY_EXTRACTION_PROMPT}\n\nUser: ${userMessage}\nAssistant: ${aiResponse}`;

  try {
    const response = await ai.models.generateContent({
      model: REASONING_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
         responseSchema: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    type: { type: Type.STRING, enum: ['preference', 'personal', 'fact', 'goal', 'context'] },
                    content: { type: Type.STRING },
                    importance: { type: Type.NUMBER }
                }
            }
        }
      }
    });

    const text = response.text;
    if (!text) return [];
    return JSON.parse(text) as MemoryExtractionItem[];
  } catch (error) {
    console.warn("Memory extraction failed silently:", error);
    return [];
  }
};

export const generateSessionTitle = async (history: Message[]): Promise<string> => {
  // Use the first few messages to generate a title
  const sample = history.slice(0, 4).map(m => `${m.role}: ${m.content}`).join('\n');
  const prompt = `Based on the following conversation start, generate a very short, concise title (3-6 words maximum). Do not use quotes. Conversation:\n${sample}`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
    });
    return response.text?.trim() || "New Conversation";
  } catch (error) {
    console.warn("Title generation failed:", error);
    return "New Conversation";
  }
};