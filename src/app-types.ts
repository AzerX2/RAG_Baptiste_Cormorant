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

export interface AppStatements {
  createConv: {
    get(title: string): ConversationRow
  }
  listConvs: {
    all(): ConversationRow[]
  }
  getConv: {
    get(id: number): ConversationRow | undefined
  }
  deleteConv: {
    run(id: number): { changes: number }
  }
  getMessages: {
    all(conversationId: number): MessageRow[]
  }
  addMessage: {
    get(conversationId: number, role: string, content: string): MessageRow
  }
  insertChunk: {
    run(source: string, section: string, position: number, content: string, embedding: string): unknown
  }
  getAllChunks: {
    all(): ChunkRow[]
  }
  countChunks: {
    get(): { count: number }
  }
}