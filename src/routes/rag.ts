import { retrieve } from '../rag/retriever.js'
import { indexDocs } from '../rag/indexer.js'

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434'
const MODEL = process.env.OLLAMA_MODEL ?? 'llama3.2'

// Prompt systeme injecte dans le LLM pour forcer la reponse basee
// uniquement sur le contexte recupere par RAG.
const RAG_SYSTEM_PROMPT = `Tu es un assistant qui répond UNIQUEMENT à partir du contexte ci-dessous.
Si le contexte ne contient pas la réponse, réponds exactement : "Je ne trouve pas l'information dans mes documents."
Cite tes sources entre crochets, format [fichier.md§section].`

type RagBody = {
  message: string
}

type RagSearchBody = {
  query: string
  k?: number
}

export async function ragRoute(app: import('fastify').FastifyInstance) {
  // Endpoint manuel pour forcer la reindexation des docs
  app.post('/rag/reindex', async (request) => {
    request.log.info('RAG: réindexation manuelle déclenchée')
    const { files, chunks } = await indexDocs(app.db, app.stmts)
    return { indexed: true, files, chunks }
  })

  app.post(
    '/rag/search',
    {
      schema: {
        body: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string', minLength: 1 },
            k: { type: 'integer', minimum: 1, maximum: 10, default: 4 }
          },
          additionalProperties: false
        }
      }
    },
    async (request) => {
      // Recherche simple : renvoie meilleurs chunks et similarite
      const { query, k = 4 } = request.body as RagSearchBody
      const results = await retrieve(app.stmts, query, k)
      return results.map((result) => ({
        source: result.source,
        section: result.section,
        content: result.content,
        similarity: Math.round(result.similarity * 1000) / 1000
      }))
    }
  )

  app.post(
    '/chat/rag',
    {
      schema: {
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
      const { message } = request.body as RagBody

      // RAG chat : on recupere d'abord les chunks pertinents
      const chunks = await retrieve(app.stmts, message)
      // Si rien n'est trouve, on renvoie la reponse standard definie
      // dans RAG_SYSTEM_PROMPT
      if (chunks.length === 0) {
        reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' })
        reply.raw.write(`data: ${JSON.stringify({ type: 'token', value: 'Je ne trouve pas l\'information dans mes documents.' })}\n\n`)
        reply.raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
        reply.raw.end()
        return
      }

      // On construit un bloc de contexte pour le modele
      const contextBlock = chunks.map((chunk) => `[${chunk.source}§${chunk.section}]\n${chunk.content}`).join('\n\n---\n\n')
      const systemMessage = `${RAG_SYSTEM_PROMPT}\n\nContexte :\n${contextBlock}`

      const controller = new AbortController()
      const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: message }
          ],
          stream: true
        })
      })

      if (!res.ok) {
        const text = await res.text()
        request.log.error({ status: res.status, body: text }, 'Ollama error')
        return reply.status(502).send({ error: 'Ollama request failed' })
      }

      request.socket.once('close', () => controller.abort())

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      })

      const sendEvent = (payload: { type: string; value?: string; message?: string; sources?: unknown[] }) => {
        reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`)
      }

      sendEvent({
        type: 'sources',
        sources: chunks.map((chunk) => ({
          source: chunk.source,
          section: chunk.section,
          similarity: Math.round((chunk as { similarity: number }).similarity * 1000) / 1000
        }))
      })

      try {
        for await (const chunk of res.body) {
          const lines = Buffer.from(chunk).toString('utf8').split('\n').filter(Boolean)
          for (const line of lines) {
            const parsed = JSON.parse(line) as { message?: { content?: string }; done?: boolean }
            if (parsed.message?.content) {
              sendEvent({ type: 'token', value: parsed.message.content })
            }
            if (parsed.done) sendEvent({ type: 'done' })
          }
        }
      } catch (error) {
        if (!(error instanceof Error) || error.name !== 'AbortError') {
          const message = error instanceof Error ? error.message : String(error)
          request.log.error(error, 'RAG streaming error')
          sendEvent({ type: 'error', message })
        }
      } finally {
        reply.raw.end()
      }
    }
  )
}