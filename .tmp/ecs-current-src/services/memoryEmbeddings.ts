import type { CollectedItem } from '../types.js';
import {
  deleteItemMemoryEmbedding,
  getItemMemoryEmbeddingsByUser,
  upsertItemMemoryEmbedding,
} from './database.ts';

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || process.env.BAILIAN_API_KEY || '';
const DASHSCOPE_EMBEDDING_MODEL = process.env.DASHSCOPE_EMBEDDING_MODEL || 'text-embedding-v4';
const DASHSCOPE_EMBEDDING_URL =
  process.env.DASHSCOPE_EMBEDDING_URL ||
  'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding';
const DASHSCOPE_EMBEDDING_DIMENSION = Number(process.env.DASHSCOPE_EMBEDDING_DIMENSION || 1024);

type EmbeddingTextType = 'query' | 'document';

type MemoryIndexableItem = Pick<
  CollectedItem,
  'id' | 'name' | 'hallId' | 'category' | 'material' | 'dateCollected' | 'story' | 'tags'
>;

interface DashScopeEmbeddingResponse {
  output?: {
    embeddings?: Array<{
      embedding?: number[];
      text_index?: number;
    }>;
  };
  code?: string;
  message?: string;
}

export function buildMemoryDocument(item: MemoryIndexableItem) {
  const tags = Array.isArray(item.tags) && item.tags.length > 0 ? item.tags.join(' / ') : 'none';

  return [
    `item_name: ${item.name || ''}`,
    `hall_name: ${item.category || item.hallId || ''}`,
    `material: ${item.material || ''}`,
    `tags: ${tags}`,
    `date_collected: ${item.dateCollected || ''}`,
    `memory_story: ${(item.story || '').trim()}`,
  ]
    .join('\n')
    .trim();
}

export async function indexItemMemory(item: MemoryIndexableItem, userId: string) {
  const memoryText = buildMemoryDocument(item);
  if (!shouldIndexMemory(item, memoryText)) {
    deleteItemMemoryEmbedding(item.id, userId);
    return;
  }

  const embedding = await generateEmbedding(memoryText, 'document');
  upsertItemMemoryEmbedding({
    item_id: item.id,
    user_id: userId,
    memory_text: memoryText,
    embedding,
    dimensions: embedding.length,
  });
}

export async function syncUserMemoryEmbeddings(userId: string, items: MemoryIndexableItem[]) {
  const existingRows = new Map(
    getItemMemoryEmbeddingsByUser(userId).map((row) => [row.itemId, row.memoryText]),
  );

  for (const item of items) {
    const nextMemoryText = buildMemoryDocument(item);
    if (!shouldIndexMemory(item, nextMemoryText)) {
      if (existingRows.has(item.id)) {
        deleteItemMemoryEmbedding(item.id, userId);
      }
      continue;
    }

    if (existingRows.get(item.id) === nextMemoryText) {
      continue;
    }

    await indexItemMemory(item, userId);
  }
}

export function deleteItemMemoryIndex(itemId: string, userId: string) {
  deleteItemMemoryEmbedding(itemId, userId);
}

export async function searchMemoryVectors(userId: string, query: string, limit = 8) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [];
  }

  const rows = getItemMemoryEmbeddingsByUser(userId).filter(
    (row) => Array.isArray(row.embedding) && row.embedding.length > 0,
  );
  if (rows.length === 0) {
    return [];
  }

  const queryEmbedding = await generateEmbedding(normalizedQuery, 'query');
  const scored = rows
    .map((row) => ({
      itemId: row.itemId,
      score: cosineSimilarity(queryEmbedding, row.embedding),
    }))
    .filter((row) => Number.isFinite(row.score) && row.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  return scored;
}

async function generateEmbedding(text: string, textType: EmbeddingTextType) {
  if (!DASHSCOPE_API_KEY) {
    throw new Error('DASHSCOPE_API_KEY is not configured.');
  }

  const response = await fetch(DASHSCOPE_EMBEDDING_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DASHSCOPE_EMBEDDING_MODEL,
      input: {
        texts: [text],
      },
      parameters: {
        text_type: textType,
        dimension: DASHSCOPE_EMBEDDING_DIMENSION,
        output_type: 'dense',
      },
    }),
  });

  const payload = (await response.json()) as DashScopeEmbeddingResponse;
  if (!response.ok) {
    throw new Error(payload.message || payload.code || `DashScope embedding failed with ${response.status}`);
  }

  const vector = payload.output?.embeddings?.[0]?.embedding;
  if (!vector || vector.length === 0) {
    throw new Error('DashScope embedding response did not include a dense vector.');
  }

  return vector;
}

function shouldIndexMemory(item: MemoryIndexableItem, memoryText: string) {
  if ((item.story || '').trim().length >= 8) {
    return true;
  }

  return memoryText.replace(/\s+/g, '').length >= 24;
}

function cosineSimilarity(left: number[], right: number[]) {
  const size = Math.min(left.length, right.length);
  if (size === 0) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < size; index += 1) {
    const leftValue = left[index] || 0;
    const rightValue = right[index] || 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}
