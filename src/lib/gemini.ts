import { GoogleGenAI } from "@google/genai";
import { Message } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function* streamChatResponse(messages: Message[], systemInstruction?: string) {
  const model = "gemini-3-flash-preview";
  
  const history = messages.slice(0, -1).map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }]
  }));

  const lastMessage = messages[messages.length - 1];
  
  // Prepare parts for the last message (including attachments if any)
  const parts: any[] = [{ text: lastMessage.content }];
  
  if (lastMessage.attachments) {
    for (const attachment of lastMessage.attachments) {
      if (attachment.type.startsWith('image/')) {
        const base64Data = attachment.url.split(',')[1];
        parts.push({
          inlineData: {
            mimeType: attachment.type,
            data: base64Data
          }
        });
      } else if (attachment.content) {
        // For text-based files, we append the content to the text part
        parts[0].text += `\n\n[File Content from ${attachment.name}]:\n${attachment.content}`;
      }
    }
  }

  const responseStream = await ai.models.generateContentStream({
    model,
    contents: [
      ...history,
      { role: 'user', parts }
    ],
    config: {
      systemInstruction: systemInstruction || "You are Maksud Intelligent AI, a helpful and friendly AI assistant. Provide clear, concise, and accurate information.",
    }
  });

  for await (const chunk of responseStream) {
    if (chunk.text) {
      yield chunk.text;
    }
  }
}
