export async function healthRoute(app: import('fastify').FastifyInstance) {
  app.get(
    '/health',
    { schema: { response: { 200: { type: 'object', properties: { status: { type: 'string' } } } } } },
    async () => {
      return { status: 'ok' }
    }
  )
}