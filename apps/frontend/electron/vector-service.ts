import { QdrantClient } from '@qdrant/js-client-rest';

const DOCUMENTATION_COLLECTION = 'documentation_collection';
const CONVERSATION_COLLECTION = 'conversation_collection';
const VECTOR_SIZE = 1024;

interface VectorPayload {
  [key: string]: unknown;
}

class VectorService {
  private client: QdrantClient;

  constructor(url: string, apiKey?: string) {
    this.client = new QdrantClient({
      url,
      ...(apiKey ? { apiKey } : {}),
    });
  }

  async initialize(): Promise<void> {
    await this.ensureCollection(DOCUMENTATION_COLLECTION, ['content_type', 'source', 'timestamp']);
    await this.ensureCollection(CONVERSATION_COLLECTION, [
      'content_type',
      'user_id',
      'conversation_id',
      'message_id',
      'role',
      'timestamp',
    ]);
    console.log('Vector service initialized');
  }

  private async ensureCollection(name: string, indexFields: string[]): Promise<void> {
    try {
      await this.client.getCollection(name);
    } catch {
      await this.client.createCollection(name, {
        vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
      });
      for (const field of indexFields) {
        await this.client.createPayloadIndex(name, {
          field_name: field,
          field_schema: 'keyword',
        });
      }
    }
  }

  async upsertVector(
    collection: string,
    id: string,
    vector: number[],
    payload: VectorPayload,
  ): Promise<void> {
    await this.client.upsert(collection, {
      points: [{ id, vector, payload }],
    });
  }

  async upsertVectors(
    collection: string,
    points: { id: string; vector: number[]; payload: VectorPayload }[],
  ): Promise<void> {
    if (points.length === 0) return;
    await this.client.upsert(collection, { points });
  }

  async search(
    collection: string,
    vector: number[],
    limit: number = 5,
    filter?: Record<string, unknown>,
  ): Promise<Array<{ id: string | number; score: number; payload: VectorPayload }>> {
    const result = await this.client.search(collection, {
      vector,
      limit,
      with_payload: true,
      ...(filter ? { filter } : {}),
    });

    return result.map((r) => ({
      id: r.id,
      score: r.score,
      payload: (r.payload as VectorPayload) || {},
    }));
  }

  async deleteVectors(collection: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.client.delete(collection, {
      points: ids,
    });
  }

  async getCollSectionInfo(collection: string) {
    return this.client.getCollection(collection);
  }
}

let vectorService: VectorService | null = null;

export function initializeVectorService(url: string, apiKey?: string): VectorService {
  vectorService = new VectorService(url, apiKey);
  return vectorService;
}

export function getVectorService(): VectorService | null {
  return vectorService;
}

export async function initializeVectorCollections(): Promise<void> {
  if (!vectorService) throw new Error('Vector service not initialized');
  await vectorService.initialize();
}

export { DOCUMENTATION_COLLECTION, CONVERSATION_COLLECTION };
