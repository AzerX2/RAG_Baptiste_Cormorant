import type { AppStatements } from './app-types.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: any
    stmts: AppStatements
  }
}