import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Gemini API Route
  app.post("/api/chat", async (req, res) => {
    const { messages, systemInstruction } = req.body;
    
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
    }

    try {
      const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
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

      const responseStream = await genAI.models.generateContentStream({
        model: "gemini-3-flash-preview",
        contents: [
          ...history,
          { role: 'user', parts }
        ],
        config: {
          systemInstruction: systemInstruction || "You are Maksud Intelligent AI, a helpful and friendly AI assistant. You were invented by Maksudur Rahman, Director: Maksud Computer, Narundi, Jamalpur Sadar, Jamalpur. Provide clear, concise, and accurate information.",
        }
      });

      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Transfer-Encoding", "chunked");

      for await (const chunk of responseStream) {
        if (chunk.text) {
          res.write(chunk.text);
        }
      }
      res.end();
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate response" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
