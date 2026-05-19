import type { ConversationRepository } from '../domain/repositories.js'

export class ConversationService {
  constructor(private repo: ConversationRepository) {}

  async createConversation(title: string) {
    return this.repo.create(title)
  }

  async listConversations() {
    return this.repo.list()
  }

  async addMessage(conversationId: number, role: string, content: string) {
    return this.repo.addMessage(conversationId, role, content)
  }
}
