export interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: number;
  attachments?: Attachment[];
}

export interface Attachment {
  name: string;
  type: string;
  url: string;
  content?: string; // For extracted text from TXT/PDF
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}
