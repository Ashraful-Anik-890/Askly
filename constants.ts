export const APP_NAME = "Askly";

export const MODEL_NAME = "gemini-2.5-flash"; // Efficient for chat
export const REASONING_MODEL = "gemini-2.5-flash"; // Efficient for background tasks

export const INITIAL_GREETING = "Hello! I'm Askly. I can remember our context and conversations. What's on your mind?";

export const SYSTEM_INSTRUCTION = `
You are Askly, a highly capable, context-aware AI assistant.
Your goal is to provide helpful, natural, and accurate responses.
You have access to a "memory" of the user's preferences and past context, which will be provided in the prompt if available.
Always adapt to the user's tone. If the user asks about what you remember, refer to the provided context.
`;

export const TOPIC_DETECTION_PROMPT = `
Analyze if the conversation topic has changed based on the recent messages.
Respond ONLY with a JSON object:
{
    "topic_changed": true/false,
    "new_topic": "topic name or null"
}
`;

export const MEMORY_EXTRACTION_PROMPT = `
Analyze this conversation exchange and identify important information to remember about the user or the context.
Ignore trivial chit-chat. Focus on facts, preferences, goals, and names.
Respond ONLY with a JSON array:
[
    {
        "type": "preference|personal|fact|goal|context",
        "content": "information to remember",
        "importance": 0.0-1.0
    }
]
`;