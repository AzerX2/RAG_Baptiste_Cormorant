import matter from 'gray-matter'

// Taille cible des chunks (approx tokens)
const CHUNK_SIZE = 500
// Recouvrement entre chunks pour garder le contexte
const OVERLAP = 50

// Represente un morceau de markdown pour indexation
export interface MarkdownChunk {
  source: string
  section: string
  position: number
  content: string
}

export function chunkMarkdown(content: string, source: string): MarkdownChunk[] {
  const { data: frontmatter, content: body } = matter(content)
  const title = (frontmatter.title as string | undefined) ?? source

  // On decoupe par paragraphes pour garder les phrases intactes
  const paragraphs = body.split(/\n\n+/).map((paragraph: string) => paragraph.trim()).filter(Boolean)

  const chunks: MarkdownChunk[] = []
  let currentChunk = ''
  let currentSection = title
  let position = 0

  // Ajoute le chunk courant s'il n'est pas vide
  const flush = () => {
    if (currentChunk.trim()) {
      chunks.push({
        source,
        section: currentSection,
        position: position++,
        content: currentChunk.trim()
      })
    }
  }

  for (const paragraph of paragraphs) {
    const headingMatch = paragraph.match(/^#{1,3}\s+(.+)/)
    if (headingMatch) {
      currentSection = headingMatch[1]
    }

    // Estimation simple du nombre de tokens basee sur la longueur
    const approxTokens = (currentChunk + paragraph).length / 4

    // Si on depassera la taille cible, on vide le chunk et on garde un overlap
    if (approxTokens > CHUNK_SIZE && currentChunk) {
      flush()
      const overlapChars = OVERLAP * 4
      currentChunk = currentChunk.slice(-overlapChars) + '\n\n' + paragraph
    } else {
      currentChunk = currentChunk ? currentChunk + '\n\n' + paragraph : paragraph
    }
  }

  flush()
  return chunks
}