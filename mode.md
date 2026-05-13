## Étape 5 — RAG (Retrieval-Augmented Generation)

**Objectif :** Le LLM répond à partir de documents locaux Markdown via des embeddings.

### Démarrage

```bash

npm install

# S'assurer que nomic-embed-text est disponible
ollama pull nomic-embed-text

npm run dev
```

L'indexation des documents `docs/` se fait **automatiquement** au démarrage si la base est vide.

### Tests

```bash
# Forcer une réindexation manuelle
curl -s -X POST http://localhost:3000/rag/reindex | jq .
# Attendu : {"status":"ok","files":3,"chunks":N}

# Recherche sémantique brute
curl -s -X POST http://localhost:3000/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "histoire de Node.js", "k": 3}' | jq .

# Chat avec RAG (les sources sont injectées automatiquement)
curl -s -N -X POST http://localhost:3000/chat/rag \
  -H "Content-Type: application/json" \
  -d '{"message": "Quand Node.js a-t-il été créé ?"}' 

# Question hors documents (doit indiquer qu'aucune info n'est disponible)
curl -s -N -X POST http://localhost:3000/chat/rag \
  -H "Content-Type: application/json" \
  -d '{"message": "Qui a inventé Python ?"}' 
```

### Ce qu'il faut constater

- L'événement SSE **`sources`** arrive en premier, avant les tokens :
  ```
  data: {"type":"sources","sources":[{"source":"node-history.md","section":"...","similarity":0.87}]}
  data: {"type":"token","value":"Node.js a été créé..."}
  ```
- Le score de similarité (`similarity`) est entre 0 et 1 — plus c'est proche de 1, plus le chunk est pertinent
- Une question hors sujet retourne peu ou pas de sources (seuil de similarité : 0.65)
- Les documents `docs/` sont rechargés à chaque redémarrage si la table est vide

### Ajouter un document

```bash
# Créer un fichier Markdown dans docs/
cat > docs/mon-sujet.md << 'EOF'
---
title: Mon sujet
---

# Mon sujet

Contenu de mon document...
EOF

# Réindexer
curl -s -X POST http://localhost:3000/rag/reindex | jq .

# Interroger
curl -s -N -X POST http://localhost:3000/chat/rag \
  -H "Content-Type: application/json" \
  -d '{"message": "Que dit le document sur mon sujet ?"}' 
```

---