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
    
    // Debug: Log available environment variable keys (not values)
    console.log("[Chat API] Available env keys:", Object.keys(process.env).filter(k => k.includes('API') || k.includes('KEY') || k.includes('GEMINI') || k.includes('AI')));

    // Get API Key from environment variables
    const rawApiKey = process.env.Intelegent_AI || "";
    const apiKey = rawApiKey.trim();
    
    // Check if API Key is valid
    if (!apiKey || apiKey.length < 10) {
      console.error("[Chat API] Error: Invalid or missing API Key.");
      return res.status(500).json({ 
        error: "API Key is missing or invalid. Please ensure 'Intelegent_AI' is set correctly in your environment settings." 
      });
    }

    console.log(`[Chat API] Request received. Using key: ${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)} (Total length: ${apiKey.length})`);
    
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
      model: "gemini-2.0-flash",
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
    
    let errorMessage = "Internal Server Error";
    let statusCode = 500;

    if (error.message) {
      try {
        // Try to parse nested JSON error from Google SDK
        const parsedError = JSON.parse(error.message);
        if (parsedError.error) {
          if (parsedError.error.code === 429) {
            statusCode = 429;
            errorMessage = "AI Quota Exceeded: You have reached the limit for your free Gemini API key. Please wait a few minutes or try again tomorrow. You can also check your limits at https://aistudio.google.com/";
          } else {
            errorMessage = parsedError.error.message || errorMessage;
            statusCode = parsedError.error.code || statusCode;
          }
        }
      } catch (e) {
        // Not JSON, use raw message
        errorMessage = error.message;
        if (errorMessage.includes("429") || errorMessage.toLowerCase().includes("quota")) {
          statusCode = 429;
          errorMessage = "AI Quota Exceeded: You have reached the limit for your free Gemini API key. Please wait a few minutes or try again tomorrow.";
        }
      }
    }

    res.status(statusCode).json({ error: errorMessage });
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
