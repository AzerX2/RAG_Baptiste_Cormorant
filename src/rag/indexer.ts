import { readFile, readdir } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { chunkMarkdown } from './chunker.js'
import type { AppStatements } from '../app-types.js'

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434'
const EMBED_MODEL = process.env.EMBED_MODEL ?? 'nomic-embed-text'
const DOCS_DIR = join(process.cwd(), 'docs')

// Appelle Ollama pour obtenir un embedding pour un texte
export async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text })
  })

  if (!res.ok) throw new Error(`Ollama embeddings error: ${res.status}`)

  const data = (await res.json()) as { embedding: number[] }
  return data.embedding
}

// Parcourt le dossier docs/, decoupe markdown, calcule embedding et inseres en base
export async function indexDocs(db: any, stmts: AppStatements): Promise<{ files: number; chunks: number }> {
  const files = (await readdir(DOCS_DIR, { recursive: true })) as string[]
  const markdownFiles = files.filter((file: string) => extname(file) === '.md')

  let totalChunks = 0

  db.prepare('DELETE FROM chunks').run()

  for (const file of markdownFiles) {
    const fullPath = join(DOCS_DIR, file)
    const content = await readFile(fullPath, 'utf8')
    const chunks = chunkMarkdown(content, file)

    // Pour chaque chunk, on calcule l'embedding et on l'insère
    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk.content)
      stmts.insertChunk.run(
        chunk.source,
        chunk.section,
        chunk.position,
        chunk.content,
        JSON.stringify(embedding)
      )
      totalChunks++
    }
  }

  return { files: markdownFiles.length, chunks: totalChunks }
}