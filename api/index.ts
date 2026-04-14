import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// API Route for Chat
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, systemInstruction } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ 
        error: "GEMINI_API_KEY is missing. Please set it in your environment variables (e.g., in Vercel settings)." 
      });
    }

    const client = new GoogleGenAI({ apiKey });

    const history = messages.slice(0, -1).map((msg: any) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    const lastMessage = messages[messages.length - 1];
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
          parts[0].text += `\n\n[File Content from ${attachment.name}]:\n${attachment.content}`;
        }
      }
    }

    const result = await client.models.generateContentStream({
      model: "gemini-1.5-flash",
      contents: [...history, { role: 'user', parts }],
      config: {
        systemInstruction: systemInstruction || "You are Maksud Intelligent AI, a helpful and friendly AI assistant. You were invented by Maksudur Rahman, Director: Maksud Computer, Narundi, Jamalpur Sadar, Jamalpur. Provide clear, concise, and accurate information."
      }
    });

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    for await (const chunk of result) {
      const chunkText = chunk.text;
      if (chunkText) {
        res.write(chunkText);
      }
    }

    res.end();
  } catch (error: any) {
    console.error("Chat API Error:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

async function startServer() {
  const PORT = 3000;

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();

export default app;
