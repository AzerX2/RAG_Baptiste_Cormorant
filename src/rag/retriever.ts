import { getEmbedding } from './indexer.js'
import type { ChunkRow } from '../domain/entities.js'

const MIN_SIMILARITY = 0.65

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// Recupere les chunks les plus proches d'une requete.
// Filtre par similarite pour reduire le bruit
export async function retrieve(
  stmts: any,
  query: string,
  k = 4
): Promise<Array<Pick<ChunkRow, 'source' | 'section' | 'content'> & { similarity: number }>> {
  // Embedding de la requete
  const queryEmbedding = await getEmbedding(query)
  const chunks = stmts.getAllChunks.all()

  const ranked = chunks
    .map((chunk: ChunkRow) => {
      const embedding = JSON.parse(chunk.embedding) as number[]
      const similarity = cosineSimilarity(queryEmbedding, embedding)
      return { ...chunk, similarity }
    })
    // On retire les items en dessous du seuil pour garder la qualite
    .filter((chunk) => chunk.similarity >= MIN_SIMILARITY)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k)

  return ranked
}