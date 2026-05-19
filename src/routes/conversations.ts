const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434'
const MODEL = process.env.OLLAMA_MODEL ?? 'llama3.2'

const messageSchema = {
  $id: 'Message',
  type: 'object',
  properties: {
    id: { type: 'integer' },
    conversationId: { type: 'integer' },
    role: { type: 'string' },
    content: { type: 'string' },
    createdAt: { type: 'string' }
  }
}

const conversationSchema = {
  $id: 'Conversation',
  type: 'object',
  properties: {
    id: { type: 'integer' },
    title: { type: 'string' },
    createdAt: { type: 'string' },
    messageCount: { type: 'integer' }
  }
}

type ConversationParams = {
  id: number
}

type ConversationMessageBody = {
  message: string
}

export async function conversationsRoute(app: import('fastify').FastifyInstance) {
  app.addSchema(messageSchema)
  app.addSchema(conversationSchema)

  app.post(
    '/conversations',
    {
      schema: {
        response: { 201: { $ref: 'Conversation#' } }
      }
    },
    async (request, reply) => {
      const conv = await app.repos.conversations.create('Nouvelle conversation')
      return reply.status(201).send(conv)
    }
  )

  app.get(
    '/conversations',
    {
      schema: {
        response: { 200: { type: 'array', items: { $ref: 'Conversation#' } } }
      }
    },
    async () => {
      return app.repos.conversations.list()
    }
  )

  app.get(
    '/conversations/:id',
    {
      schema: {
        params: { type: 'object', properties: { id: { type: 'integer' } } },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              title: { type: 'string' },
              createdAt: { type: 'string' },
              messages: { type: 'array', items: { $ref: 'Message#' } }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const { id } = request.params as ConversationParams
      const conv = await app.repos.conversations.get(id)
      if (!conv) return reply.notFound(`Conversation ${id} introuvable`)
      const messages = await app.repos.conversations.getMessages(conv.id)
      return { ...conv, messages }
    }
  )

  app.delete(
    '/conversations/:id',
    {
      schema: {
        params: { type: 'object', properties: { id: { type: 'integer' } } }
      }
    },
    async (request, reply) => {
      const { id } = request.params as ConversationParams
      const changes = await app.repos.conversations.delete(id)
      if (changes === 0) return reply.notFound(`Conversation ${id} introuvable`)
      return reply.status(204).send()
    }
  )

  app.post(
    '/conversations/:id/messages',
    {
      schema: {
        params: { type: 'object', properties: { id: { type: 'integer' } } },
        body: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string', minLength: 1, maxLength: 4096 }
          },
          additionalProperties: false
        }
      }
    },
    async (request, reply) => {
      const { id } = request.params as ConversationParams
      const conv = await app.repos.conversations.get(id)
      if (!conv) return reply.notFound(`Conversation ${id} introuvable`)

      const { message } = request.body as ConversationMessageBody

      const history = await app.repos.conversations.getMessages(id)
      if (history.length === 0) {
        app.db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(message.slice(0, 60), id)
      }

      await app.repos.conversations.addMessage(id, 'user', message)

      const updatedHistory = await app.repos.conversations.getMessages(id)
      const ollamaMessages = updatedHistory.map((entry) => ({ role: entry.role, content: entry.content }))

      const controller = new AbortController()
      const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ model: MODEL, messages: ollamaMessages, stream: true })
      })

      if (!res.ok) {
        const text = await res.text()
        request.log.error({ status: res.status, body: text }, 'Ollama error')
        return reply.status(502).send({ error: 'Ollama request failed' })
      }

      request.raw.once('close', () => controller.abort())

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      })

      const sendEvent = (payload: { type: string; value?: string; message?: string }) => {
        reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`)
      }

      let fullResponse = ''
      try {
        for await (const chunk of res.body) {
          const lines = Buffer.from(chunk).toString('utf8').split('\n').filter(Boolean)
          for (const line of lines) {
            const parsed = JSON.parse(line) as { message?: { content?: string }; done?: boolean }
            if (parsed.message?.content) {
              fullResponse += parsed.message.content
              sendEvent({ type: 'token', value: parsed.message.content })
            }
            if (parsed.done) {
              await app.repos.conversations.addMessage(id, 'assistant', fullResponse)
              sendEvent({ type: 'done' })
            }
          }
        }
      } catch (error) {
        if (!(error instanceof Error) || error.name !== 'AbortError') {
          const message = error instanceof Error ? error.message : String(error)
          request.log.error(error, 'Streaming error')
          sendEvent({ type: 'error', message })
        }
      } finally {
        reply.raw.end()
      }
    }
  )
}