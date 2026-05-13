import { buildApp } from './app.js'

// Point d'entree du serveur. Simple et lisible.
// Note: garder la logique minimale pour reutiliser buildApp() en tests
const app = await buildApp()

try {
  // Ecoute sur le port configurable, host fixe pour docker/WSL
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' })
} catch (error) {
  // Si on ne peut pas demarrer le serveur, on loggue et on quitte proprement
  app.log.error(error)
  process.exit(1)
}