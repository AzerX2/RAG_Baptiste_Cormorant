import type { ConversationRow, MessageRow, ChunkRow } from './entities.js'

export interface ConversationRepository {
  create(title: string): Promise<ConversationRow>
  list(): Promise<ConversationRow[]>
  get(id: number): Promise<ConversationRow | undefined>
  delete(id: number): Promise<number>
  getMessages(conversationId: number): Promise<MessageRow[]>
  addMessage(conversationId: number, role: string, content: string): Promise<MessageRow>
}

export interface ChunkRepository {
  insert(source: string, section: string, position: number, content: string, embedding: string): Promise<unknown>
  getAll(): Promise<ChunkRow[]>
  count(): Promise<number>
}
