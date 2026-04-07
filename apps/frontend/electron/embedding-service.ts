import { CohereClient } from 'cohere-ai';

type InputType = 'search_document' | 'search_query';

class EmbeddingService {
  private client: CohereClient;
  private model = 'embed-english-v3.0';

  constructor(apiKey: string) {
    this.client = new CohereClient({ token: apiKey });
  }

  async embed(text: string, inputType: InputType): Promise<number[]> {
    const response = await this.client.embed({
      texts: [text],
      model: this.model,
      inputType,
      embeddingTypes: ['float'],
    });

    const embeddings = response.embeddings as { float?: number[][] };
    if (!embeddings.float || embeddings.float.length === 0) {
      throw new Error('No embeddings returned from Cohere');
    }
    return embeddings.float[0];
  }

  async embedBatch(texts: string[], inputType: InputType): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await this.client.embed({
      texts,
      model: this.model,
      inputType,
      embeddingTypes: ['float'],
    });

    const embeddings = response.embeddings as { float?: number[][] };
    if (!embeddings.float) {
      throw new Error('No embeddings returned from Cohere');
    }
    return embeddings.float;
  }
}

let embeddingService: EmbeddingService | null = null;

export function initializeEmbeddingService(apiKey: string): EmbeddingService {
  embeddingService = new EmbeddingService(apiKey);
  console.log('Embedding service initialized');
  return embeddingService;
}

export function getEmbeddingService(): EmbeddingService | null {
  return embeddingService;
}

export async function embedText(text: string, inputType: InputType): Promise<number[]> {
  if (!embeddingService) throw new Error('Embedding service not initialized');
  return embeddingService.embed(text, inputType);
}

export async function embedTexts(texts: string[], inputType: InputType): Promise<number[][]> {
  if (!embeddingService) throw new Error('Embedding service not initialized');
  return embeddingService.embedBatch(texts, inputType);
}
