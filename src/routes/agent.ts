import { toolDefinitions, executeTool } from '../tools/registry.js'

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434'
const MODEL = process.env.OLLAMA_MODEL ?? 'llama3.2'
const MAX_ITERATIONS = 5

const agentBodySchema = {
  type: 'object',
  required: ['message'],
  properties: {
    message: { type: 'string', minLength: 1, maxLength: 4096 }
  },
  additionalProperties: false
}

type AgentBody = {
  message: string
}

type AgentMessage = {
  role: string
  content: string
  tool_calls?: unknown[]
}

function makeAbortOnDisconnect(request: { socket: NodeJS.Socket }) {
  const controller = new AbortController()
  const onClose = () => controller.abort()
  request.socket.once('close', onClose)
  const cleanup = () => request.socket.removeListener('close', onClose)
  return { controller, cleanup }
}

export async function agentRoute(app: import('fastify').FastifyInstance) {
  app.post(
    '/chat/agent',
    {
      schema: { body: agentBodySchema }
    },
    async (request, reply) => {
      const { message } = request.body as AgentBody
      const messages: AgentMessage[] = [{ role: 'user', content: message }]

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      })

      const sendEvent = (payload: { type: string; name?: string; args?: unknown; result?: unknown; value?: string; message?: string }) => {
        reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`)
      }

      const { controller, cleanup } = makeAbortOnDisconnect(request)

      try {
        for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
          const res = await fetch(`${OLLAMA_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              model: MODEL,
              messages,
              tools: toolDefinitions,
              stream: true
            })
          })

          if (!res.ok) {
            const text = await res.text()
            request.log.error({ status: res.status, body: text }, 'Ollama error')
            sendEvent({ type: 'error', message: 'Ollama request failed' })
            break
          }

          let assistantContent = ''
          const toolCalls: Array<{ function: { name: string; arguments: unknown } }> = []

          for await (const chunk of res.body) {
            const lines = Buffer.from(chunk).toString('utf8').split('\n').filter(Boolean)
            for (const line of lines) {
              const parsed = JSON.parse(line) as { message?: { content?: string; tool_calls?: Array<{ function: { name: string; arguments: unknown } }> } }

              if (parsed.message?.content) {
                assistantContent += parsed.message.content
                sendEvent({ type: 'token', value: parsed.message.content })
              }

              if (parsed.message?.tool_calls?.length) {
                toolCalls.push(...parsed.message.tool_calls)
              }
            }
          }

          messages.push({
            role: 'assistant',
            content: assistantContent,
            ...(toolCalls.length ? { tool_calls: toolCalls } : {})
          })

          if (!toolCalls.length) {
            sendEvent({ type: 'done' })
            break
          }

          for (const toolCall of toolCalls) {
            const name = toolCall.function.name
            const rawArguments = toolCall.function.arguments

            request.log.info({ name, args: rawArguments }, 'Tool call')
            sendEvent({ type: 'tool_call', name, args: rawArguments })

            let result: unknown
            try {
              const parsedArguments = typeof rawArguments === 'string' ? JSON.parse(rawArguments) : rawArguments
              result = await executeTool(name, parsedArguments)
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error)
              result = `Erreur: ${message}`
              request.log.warn({ name, err: message }, 'Tool error')
            }

            request.log.info({ name, result }, 'Tool result')
            sendEvent({ type: 'tool_result', name, result })

            messages.push({ role: 'tool', content: String(result) })
          }
        }
      } catch (error) {
        if (!(error instanceof Error) || error.name !== 'AbortError') {
          const message = error instanceof Error ? error.message : String(error)
          request.log.error(error, 'Agent error')
          sendEvent({ type: 'error', message })
        }
      } finally {
        cleanup()
        reply.raw.end()
      }
    }
  )
}