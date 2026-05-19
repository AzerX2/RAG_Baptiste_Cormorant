import 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    db: any
    stmts: any
    repos?: any
  }
}