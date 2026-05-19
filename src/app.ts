import fastify from 'fastify'
import sensible from '@fastify/sensible'
import { healthRoute } from './adapters/http/health.js'
import { chatRoute } from './adapters/http/chat.js'
import { conversationsRoute } from './adapters/http/conversations.js'
import { agentRoute } from './adapters/http/agent.js'
import { ragRoute } from './adapters/http/rag.js'
import dbPlugin from './infrastructure/dbPlugin.js'

// Construis l'app Fastify et enregistre les routes/plugins.
// je mets ici des options par défaut
// et je conserve opts pour pouvoir surcharger en tests.
export async function buildApp(opts: Record<string, unknown> = {}) {
  // Instance Fastify principale utilisee partout
  const app = fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
        : undefined
    },
    ...opts
  })

  // Plugins : sensible aide à renvoyer des erreurs HTTP propres
  await app.register(sensible)
  // Plugin DB : wrapper sur better-sqlite3 et indexation RAG
  await app.register(dbPlugin)

  // on separe par modules
  await app.register(healthRoute)
  await app.register(chatRoute)
  await app.register(conversationsRoute)
  await app.register(agentRoute)
  await app.register(ragRoute)

  // Retourne l'app ready a etre ecoutee par `server.ts`
  return app
}