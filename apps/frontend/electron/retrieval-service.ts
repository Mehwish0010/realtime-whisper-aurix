import { embedText, embedTexts } from './embedding-service.js';
import {
  getVectorService,
  DOCUMENTATION_COLLECTION,
  CONVERSATION_COLLECTION,
} from './vector-service.js';
import { randomUUID } from 'crypto';

interface DocumentParams {
  content: string;
  source: string;
  title: string;
}

interface ConversationMessageParams {
  content: string;
  userId: string;
  conversationId: string;
  messageId: string;
  role: string;
}

interface SearchResult {
  id: string | number;
  score: number;
  content: string;
  contentType: string;
  source?: string;
  role?: string;
  [key: string]: unknown;
}

let initialized = false;

export function initializeRetrievalService(): void {
  initialized = true;
  console.log('Retrieval service initialized');
}

export function isRetrievalReady(): boolean {
  return initialized && getVectorService() !== null;
}

export async function indexDocument(params: DocumentParams): Promise<void> {
  const vectorService = getVectorService();
  if (!vectorService) throw new Error('Vector service not available');

  const vector = await embedText(params.content, 'search_document');
  const id = randomUUID();

  await vectorService.upsertVector(DOCUMENTATION_COLLECTION, id, vector, {
    content: params.content,
    content_type: 'documentation',
    source: params.source,
    title: params.title,
    timestamp: Date.now(),
  });
}

export async function indexDocuments(paramsList: DocumentParams[]): Promise<void> {
  if (paramsList.length === 0) return;

  const vectorService = getVectorService();
  if (!vectorService) throw new Error('Vector service not available');

  const texts = paramsList.map((p) => p.content);
  const vectors = await embedTexts(texts, 'search_document');

  const points = paramsList.map((params, i) => ({
    id: randomUUID(),
    vector: vectors[i],
    payload: {
      content: params.content,
      content_type: 'documentation' as const,
      source: params.source,
      title: params.title,
      timestamp: Date.now(),
    },
  }));

  await vectorService.upsertVectors(DOCUMENTATION_COLLECTION, points);
}

export async function indexConversationMessage(params: ConversationMessageParams): Promise<void> {
  const vectorService = getVectorService();
  if (!vectorService) throw new Error('Vector service not available');

  const vector = await embedText(params.content, 'search_document');
  const id = randomUUID();

  await vectorService.upsertVector(CONVERSATION_COLLECTION, id, vector, {
    content: params.content,
    content_type: 'conversation',
    user_id: params.userId,
    conversation_id: params.conversationId,
    message_id: params.messageId,
    role: params.role,
    timestamp: Date.now(),
  });
}

export async function searchDocumentation(
  query: string,
  limit: number = 5,
): Promise<SearchResult[]> {
  const vectorService = getVectorService();
  if (!vectorService) throw new Error('Vector service not available');

  const queryVector = await embedText(query, 'search_query');
  const results = await vectorService.search(DOCUMENTATION_COLLECTION, queryVector, limit);

  return results.map((r) => ({
    id: r.id,
    score: r.score,
    content: r.payload.content as string,
    contentType: r.payload.content_type as string,
    source: r.payload.source as string,
    title: r.payload.title as string,
  }));
}

export async function searchConversations(
  query: string,
  userId: string,
  limit: number = 5,
): Promise<SearchResult[]> {
  const vectorService = getVectorService();
  if (!vectorService) throw new Error('Vector service not available');

  const queryVector = await embedText(query, 'search_query');
  const results = await vectorService.search(CONVERSATION_COLLECTION, queryVector, limit, {
    must: [{ key: 'user_id', match: { value: userId } }],
  });

  return results.map((r) => ({
    id: r.id,
    score: r.score,
    content: r.payload.content as string,
    contentType: r.payload.content_type as string,
    role: r.payload.role as string,
    conversationId: r.payload.conversation_id as string,
  }));
}

export async function search(
  query: string,
  userId: string,
  limit: number = 5,
): Promise<SearchResult[]> {
  const [docResults, convResults] = await Promise.all([
    searchDocumentation(query, limit),
    searchConversations(query, userId, limit),
  ]);

  const combined = [...docResults, ...convResults];
  combined.sort((a, b) => b.score - a.score);
  return combined.slice(0, limit);
}

export function buildContextPrompt(results: SearchResult[]): string {
  if (results.length === 0) return '';

  const contextBlocks = results.map((r, i) => {
    const source = r.source ? ` (source: ${r.source})` : '';
    const role = r.role ? ` [${r.role}]` : '';
    return `[${i + 1}]${source}${role}: ${r.content}`;
  });

  return (
    "Use the following context to help answer the user's question:\n\n" +
    contextBlocks.join('\n\n') +
    '\n\n---\n\n'
  );
}
