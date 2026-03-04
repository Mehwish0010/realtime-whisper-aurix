# AURIX Voice Assistant — RAG Pipeline

Embedding pipeline and semantic retrieval system integrated into the AURIX voice assistant. Uses Cohere for embeddings, Qdrant for vector storage, and Groq for LLM chat responses.

---

## Architecture Overview

```
User message
  → Embed query (Cohere, search_query)
  → Search Qdrant (top 5 results, filtered by user_id for conversations)
  → Build context prompt
  → Prepend context to message → Send to Groq LLM
  → Get AI response
  → Index user message + AI response in Qdrant (Cohere, search_document)
  → Save to Firestore (existing flow)
```

---

## Prerequisites

- **Node.js** v18+
- **Docker** (for Qdrant)
- **Cohere API Key** — https://dashboard.cohere.com/api-keys
- **Groq API Key** — https://console.groq.com/keys
- **Deepgram API Key** — https://console.deepgram.com/

---

## Setup

### 1. Install Dependencies

```bash
npm install
```

Key RAG dependencies:
- `cohere-ai` — Cohere SDK for text embeddings
- `@qdrant/js-client-rest` — Qdrant vector database client

### 2. Start Qdrant

```bash
docker run -p 6333:6333 qdrant/qdrant
```

This starts Qdrant on `http://localhost:6333`. No API key needed for local usage.

### 3. Configure Environment Variables

Add the following to your `.env` file:

```env
DEEPGRAM_API_KEY=<your-deepgram-key>
GROQ_API_KEY=<your-groq-key>
COHERE_API_KEY=<your-cohere-key>
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=                        # optional, only for Qdrant Cloud
```

### 4. Run the App

```bash
npm run dev
```

Check the console for:
- `Embedding service initialized`
- `Vector service initialized`
- `Retrieval service initialized`
- `RAG pipeline initialized successfully`

---

## Files — Step by Step

---

### Step 1: `vite.config.ts`

**Purpose:** Vite build configuration for the Electron app.

**What was updated:**
- Added `'cohere-ai'` and `'@qdrant/js-client-rest'` to `rollupOptions.external` array.

**Why:** These are Node.js packages that should not be bundled by Vite. Electron loads them at runtime from `node_modules` instead.

**Location of change:** Lines 19–32, inside `rollupOptions.external`.

```ts
external: [
  'ws',
  'bufferutil',
  'utf-8-validate',
  'groq-sdk',
  '@deepgram/sdk',
  'firebase-admin',
  'firebase-admin/app',
  'firebase-admin/firestore',
  'cohere-ai',              // NEW
  '@qdrant/js-client-rest',  // NEW
],
```

---

### Step 2: `electron/embedding-service.ts` (NEW FILE)

**Purpose:** Singleton service that wraps the Cohere SDK to generate text embeddings.

**Model:** `embed-english-v3.0` (1024 dimensions)

**Exports:**

| Function | Description |
|---|---|
| `initializeEmbeddingService(apiKey)` | Creates the singleton with the Cohere API key |
| `getEmbeddingService()` | Returns the singleton instance (or null) |
| `embedText(text, inputType)` | Embeds a single text string, returns `number[]` |
| `embedTexts(texts, inputType)` | Embeds a batch of texts, returns `number[][]` |

**Input Types:**
- `'search_document'` — used when **indexing** content into Qdrant
- `'search_query'` — used when **searching** for relevant content

**How it works:**
1. Takes a text string (or batch)
2. Sends it to Cohere's embed API
3. Returns a 1024-dimension float vector representing the text's meaning

---

### Step 3: `electron/vector-service.ts` (NEW FILE)

**Purpose:** Singleton service that wraps the Qdrant client. Manages two vector collections for storing and searching embeddings.

**Collections:**

#### `documentation_collection`
Stores documentation/knowledge base embeddings.

| Payload Field | Type | Description |
|---|---|---|
| `content` | string | The document text |
| `content_type` | keyword | Always `"documentation"` |
| `source` | keyword | Where the document came from |
| `title` | keyword | Document title |
| `timestamp` | keyword | Unix timestamp of indexing |

#### `conversation_collection`
Stores conversation message embeddings.

| Payload Field | Type | Description |
|---|---|---|
| `content` | string | The message text |
| `content_type` | keyword | Always `"conversation"` |
| `user_id` | keyword | User identifier |
| `conversation_id` | keyword | Conversation identifier |
| `message_id` | keyword | Unique message identifier |
| `role` | keyword | `"user"` or `"aurix"` |
| `timestamp` | keyword | Unix timestamp of indexing |

**Both collections:** Cosine similarity, 1024 dimensions.

**Exports:**

| Function | Description |
|---|---|
| `initializeVectorService(url, apiKey?)` | Creates the Qdrant client singleton |
| `getVectorService()` | Returns the singleton instance (or null) |
| `initializeVectorCollections()` | Creates collections and payload indexes if they don't exist |
| `DOCUMENTATION_COLLECTION` | Collection name constant |
| `CONVERSATION_COLLECTION` | Collection name constant |

**Methods on VectorService class:**

| Method | Description |
|---|---|
| `upsertVector(collection, id, vector, payload)` | Insert/update a single vector |
| `upsertVectors(collection, points[])` | Insert/update multiple vectors |
| `search(collection, vector, limit, filter?)` | Search for similar vectors |
| `deleteVectors(collection, ids[])` | Delete vectors by ID |
| `getCollectionInfo(collection)` | Get collection metadata |

**How it works:**
1. On initialization, connects to Qdrant at the configured URL
2. Creates both collections with Cosine distance if they don't already exist
3. Creates payload indexes on all filterable fields for fast queries

---

### Step 4: `electron/retrieval-service.ts` (NEW FILE)

**Purpose:** Orchestration layer that combines the embedding service and vector service to provide high-level RAG operations.

**Exports:**

| Function | Description |
|---|---|
| `initializeRetrievalService()` | Marks the service as ready |
| `isRetrievalReady()` | Returns `true` if both embedding and vector services are available |
| `indexDocument(params)` | Embed and store a documentation entry |
| `indexDocuments(params[])` | Batch embed and store multiple documentation entries |
| `indexConversationMessage(params)` | Embed and store a conversation message |
| `searchDocumentation(query, limit?)` | Search the documentation collection |
| `searchConversations(query, userId, limit?)` | Search conversations filtered by user_id |
| `search(query, userId, limit?)` | Combined search across both collections, merged by score |
| `buildContextPrompt(results)` | Format search results into a context block for LLM injection |

**`indexDocument(params)` params:**
```ts
{ content: string, source: string, title: string }
```

**`indexConversationMessage(params)` params:**
```ts
{ content: string, userId: string, conversationId: string, messageId: string, role: string }
```

**`buildContextPrompt(results)` output example:**
```
Use the following context to help answer the user's question:

[1] (source: docs): How to reset your password...

[2] [user]: I asked about password reset yesterday...

---
```

---

### Step 5: `electron/main.ts`

**Purpose:** Main Electron process. Handles app lifecycle, window creation, and all IPC handlers.

**What was updated:**

#### 5a. Imports (top of file)
Added imports for all three new services:
- `embedding-service.js` — `initializeEmbeddingService`, `getEmbeddingService`
- `vector-service.js` — `initializeVectorService`, `initializeVectorCollections`, `getVectorService`
- `retrieval-service.js` — `initializeRetrievalService`, `isRetrievalReady`, `indexConversationMessage`, `indexDocument`, `indexDocuments`, `search`, `searchDocumentation`, `buildContextPrompt`

#### 5b. RAG Initialization (after Groq init, before `createWindow()`)
```
1. Read COHERE_API_KEY and QDRANT_URL from environment
2. If COHERE_API_KEY exists:
   a. Initialize embedding service with Cohere key
   b. Initialize vector service with Qdrant URL
   c. Create/verify vector collections
   d. Initialize retrieval service
3. If key is missing: log warning, RAG is disabled
4. All wrapped in try/catch — failure is non-fatal
```

#### 5c. Modified `chat-send-message` handler
The chat handler now has three phases:

**Before sending to Groq:**
1. If RAG is ready, embed the user's message as a search query
2. Search Qdrant for top 5 relevant results
3. Build a context prompt and prepend it to the message
4. Send the augmented message to Groq

**After getting response:**
1. Index the user's original message in the conversation collection
2. Index the AI response in the conversation collection
3. Both indexing operations run in parallel

**Error handling:** All RAG operations are wrapped in try/catch. If RAG fails, the chat still works normally without context augmentation.

#### 5d. New IPC Handlers

| Channel | Parameters | Description |
|---|---|---|
| `retrieval-search` | `query, userId?, limit?` | Combined search across docs + conversations |
| `retrieval-search-docs` | `query, limit?` | Search documentation only |
| `retrieval-index-document` | `{content, source, title}` | Index a single document |
| `retrieval-index-documents` | `[{content, source, title}]` | Batch index documents |
| `retrieval-status` | none | Check if RAG services are available |

---

### Step 6: `electron/preload.ts`

**Purpose:** Electron preload script that bridges IPC channels to the renderer process via `contextBridge`.

**What was updated:** Added 5 new methods after the chat methods block:

```ts
retrievalSearch(query, userId?, limit?)      // → 'retrieval-search'
retrievalSearchDocs(query, limit?)           // → 'retrieval-search-docs'
retrievalIndexDocument(params)               // → 'retrieval-index-document'
retrievalIndexDocuments(paramsList)          // → 'retrieval-index-documents'
retrievalStatus()                            // → 'retrieval-status'
```

These are exposed on `window.electronAPI` in the renderer process.

---

### Step 7: `src/electron.d.ts`

**Purpose:** TypeScript type declarations for the Electron API exposed to the renderer.

**What was updated:** Added type declarations for the 5 new retrieval methods:

```ts
retrievalSearch(query: string, userId?: string, limit?: number)
  → Promise<{ success: boolean; results?: any[]; error?: string }>

retrievalSearchDocs(query: string, limit?: number)
  → Promise<{ success: boolean; results?: any[]; error?: string }>

retrievalIndexDocument(params: { content: string; source: string; title: string })
  → Promise<{ success: boolean; error?: string }>

retrievalIndexDocuments(paramsList: { content: string; source: string; title: string }[])
  → Promise<{ success: boolean; error?: string }>

retrievalStatus()
  → Promise<{ success: boolean; available?: boolean; embeddingService?: boolean; vectorService?: boolean }>
```

---

## Verification Checklist

1. Qdrant is running: `docker run -p 6333:6333 qdrant/qdrant`
2. `.env` has `COHERE_API_KEY` and `QDRANT_URL` set
3. `npm run dev` — console shows all services initialized
4. Send a chat message — logs show retrieval attempt (empty results initially) and indexing
5. Send a second message — should retrieve the first message as context
6. Call `window.electronAPI.retrievalStatus()` in DevTools — returns `{ success: true, available: true }`

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `RAG pipeline disabled` in console | Set `COHERE_API_KEY` in `.env` |
| `Failed to initialize RAG pipeline` | Ensure Qdrant is running on port 6333 |
| Chat works but no RAG context | Check both services are initialized; send 2+ messages |
| `Rollup failed to resolve import` | Ensure `cohere-ai` and `@qdrant/js-client-rest` are in `rollupOptions.external` in `vite.config.ts` |
