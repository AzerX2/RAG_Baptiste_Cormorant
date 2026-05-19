export function createRepositories(stmts: any, db: any) {
  const conversationRepo = {
    async create(title: string) {
      return Promise.resolve(stmts.createConv.get(title))
    },
    async list() {
      return Promise.resolve(stmts.listConvs.all())
    },
    async get(id: number) {
      return Promise.resolve(stmts.getConv.get(id))
    },
    async delete(id: number) {
      const res = stmts.deleteConv.run(id)
      return Promise.resolve(res.changes)
    },
    async getMessages(conversationId: number) {
      return Promise.resolve(stmts.getMessages.all(conversationId))
    },
    async addMessage(conversationId: number, role: string, content: string) {
      return Promise.resolve(stmts.addMessage.get(conversationId, role, content))
    }
  }

  const chunkRepo = {
    async insert(source: string, section: string, position: number, content: string, embedding: string) {
      return Promise.resolve(stmts.insertChunk.run(source, section, position, content, embedding))
    },
    async getAll() {
      return Promise.resolve(stmts.getAllChunks.all())
    },
    async count() {
      const r = stmts.countChunks.get()
      return Promise.resolve(r?.count ?? 0)
    }
  }

  return { conversations: conversationRepo, chunks: chunkRepo }
}
