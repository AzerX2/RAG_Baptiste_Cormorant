export interface ConversationRow {
  id: number
  title: string
  createdAt: string
  messageCount?: number
}

export interface MessageRow {
  id: number
  conversationId: number
  role: string
  content: string
  createdAt: string
}

export interface ChunkRow {
  id: number
  source: string
  section: string
  position: number
  content: string
  embedding: string
}
