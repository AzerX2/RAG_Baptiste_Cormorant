import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import { join, resolve, normalize, relative, isAbsolute } from 'node:path'

const DOCS_DIR = resolve(process.cwd(), 'docs')

export const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Retourne la météo actuelle pour une ville. Utilise une API publique.',
      parameters: {
        type: 'object',
        required: ['city'],
        properties: {
          city: { type: 'string', description: 'Nom de la ville (ex: Paris, Lyon, Bordeaux)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calculator',
      description: 'Évalue une expression mathématique simple (ex: "2 + 3 * 4", "sqrt(16)").',
      parameters: {
        type: 'object',
        required: ['expression'],
        properties: {
          expression: { type: 'string', description: 'Expression mathématique à évaluer' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_datetime',
      description: 'Retourne la date et l\'heure actuelle.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_local_file',
      description: 'Lit le contenu d\'un fichier dans le dossier ./docs du projet.',
      parameters: {
        type: 'object',
        required: ['filename'],
        properties: {
          filename: { type: 'string', description: 'Nom du fichier dans ./docs (ex: "notes.md")' }
        }
      }
    }
  }
]

const argSchemas: Record<string, z.ZodTypeAny> = {
  get_weather: z.object({ city: z.string().min(1) }),
  calculator: z.object({ expression: z.string().min(1) }),
  get_datetime: z.object({}).passthrough(),
  read_local_file: z.object({ filename: z.string().min(1) })
}

async function get_weather({ city }: { city: string }) {
  const url = `https://wttr.in/${encodeURIComponent(city)}?format=%C+%t+%h+humidité`
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`Météo indisponible pour ${city}`)
  return await res.text()
}

function calculator({ expression }: { expression: string }) {
  const safe = /^[\d\s+\-*/().^%,a-z]+$/i
  if (!safe.test(expression)) throw new Error(`Expression non autorisée: ${expression}`)

  const mathFn = new Function(
    'Math',
    `"use strict"; return (${expression
      .replace(/\^/g, '**')
      .replace(/sqrt/g, 'Math.sqrt')
      .replace(/abs/g, 'Math.abs')
      .replace(/floor/g, 'Math.floor')
      .replace(/ceil/g, 'Math.ceil')
      .replace(/round/g, 'Math.round')
      .replace(/pi/gi, 'Math.PI')
    })`
  ) as (math: Math) => number

  const result = mathFn(Math)
  if (typeof result !== 'number' || !isFinite(result)) throw new Error('Résultat invalide')
  return String(result)
}

function get_datetime() {
  return new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
}

async function read_local_file({ filename }: { filename: string }) {
  const target = normalize(join(DOCS_DIR, filename))
  const relativePath = relative(DOCS_DIR, target)

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`Accès refusé : ${filename} est en dehors de ./docs`)
  }

  const content = await readFile(target, 'utf8')
  return content.slice(0, 4000)
}

const implementations: Record<string, (args: any) => Promise<string> | string> = {
  get_weather,
  calculator,
  get_datetime,
  read_local_file
}

export async function executeTool(name: string, rawArgs: unknown) {
  const schema = argSchemas[name]
  if (!schema) throw new Error(`Tool inconnu: ${name}`)

  let candidateArgs = rawArgs
  if (typeof rawArgs === 'string') {
    try {
      candidateArgs = JSON.parse(rawArgs)
    } catch {
      throw new Error(`Arguments JSON invalides pour ${name}`)
    }
  }

  const parsed = schema.safeParse(candidateArgs)
  if (!parsed.success) {
    throw new Error(`Arguments invalides pour ${name}: ${parsed.error.message}`)
  }

  return implementations[name](parsed.data)
}