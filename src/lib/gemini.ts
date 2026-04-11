import { Message } from "../types";

export async function* streamChatResponse(messages: Message[], systemInstruction?: string) {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages, systemInstruction }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to fetch from server");
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No reader available");

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value, { stream: true });
    }
  } catch (error) {
    console.error("Stream error:", error);
    yield "Error: " + (error instanceof Error ? error.message : "Failed to connect to AI server. Please make sure GEMINI_API_KEY is set in your environment variables.");
  }
}
