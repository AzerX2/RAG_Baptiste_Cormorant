const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434'
const MODEL = process.env.OLLAMA_MODEL ?? 'llama3.2'

const chatBodySchema = {
  type: 'object',
  required: ['message'],
  properties: {
    message: { type: 'string', minLength: 1, maxLength: 4096 }
  },
  additionalProperties: false
}

type ChatBody = {
  message: string
}

type StreamEvent = {
  type: string
  value?: string
  message?: string
}

export async function chatRoute(app: import('fastify').FastifyInstance) {
  app.post(
    '/chat',
    {
      schema: {
        body: chatBodySchema,
        response: {
          200: {
            type: 'object',
            properties: { response: { type: 'string' } }
          },
          502: {
            type: 'object',
            properties: { error: { type: 'string' } }
          }
        }
      }
    },
    async (request, reply) => {
      const { message } = request.body as ChatBody

      const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'user', content: message }],
          stream: false
        })
      })

      if (!res.ok) {
        const text = await res.text()
        request.log.error({ status: res.status, body: text }, 'Ollama error')
        return reply.status(502).send({ error: 'Ollama request failed' })
      }

      const data = (await res.json()) as { message: { content: string } }
      return { response: data.message.content }
    }
  )

  app.post(
    '/chat/stream',
    {
      schema: { body: chatBodySchema }
    },
    async (request, reply) => {
      const { message } = request.body as ChatBody
      const controller = new AbortController()

      const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'user', content: message }],
          stream: true
        })
      })

      if (!res.ok) {
        const text = await res.text()
        request.log.error({ status: res.status, body: text }, 'Ollama error')
        return reply.status(502).send({ error: 'Ollama request failed' })
      }

      request.raw.once('close', () => {
        request.log.info('Client disconnected — aborting Ollama stream')
        controller.abort()
      })

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      })

      const sendEvent = (payload: StreamEvent) => reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`)

      try {
        for await (const chunk of res.body) {
          const lines = Buffer.from(chunk).toString('utf8').split('\n').filter(Boolean)
          for (const line of lines) {
            const parsed = JSON.parse(line) as { message?: { content?: string }; done?: boolean }
            if (parsed.message?.content) {
              sendEvent({ type: 'token', value: parsed.message.content })
            }
            if (parsed.done) {
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