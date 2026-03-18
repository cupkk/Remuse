import { GoogleGenAI } from '@google/genai';
import type {
  CollectedItem,
  MemoryAssistantMatch,
  MemoryAssistantMessage,
  MemoryAssistantResponse,
} from '../types.js';
import { APP_CONFIG } from './appConfig.ts';
import { getItemsByUser } from './database.ts';
import { searchMemoryVectors, syncUserMemoryEmbeddings } from './memoryEmbeddings.ts';

const GEMINI_API_KEY = APP_CONFIG.geminiApiKey;
const GEMINI_BASE_URL = APP_CONFIG.geminiBaseUrl;
const GEMINI_MEMORY_MODEL = process.env.GEMINI_MEMORY_MODEL || process.env.GEMINI_TEXT_MODEL || 'gemini-3-pro-preview';

const GENERIC_QUERY_TOKENS = new Set([
  '回忆',
  '故事',
  '记忆',
  '藏品',
  '物品',
  '东西',
  '哪个',
  '哪些',
  '什么',
  '帮我',
  '找到',
  '看看',
  '有关',
  '相关',
  '以前',
  '之前',
  '曾经',
  '那件',
  '这件',
  '那个',
  '这个',
  '还有',
  'please',
  'with',
  'about',
]);

const THEMATIC_HINTS: Array<{ queryTerms: string[]; memoryTerms: string[]; boost: number }> = [
  {
    queryTerms: ['家人', '妈妈', '爸爸', '外婆', '奶奶', '礼物'],
    memoryTerms: ['妈妈', '爸爸', '家人', '外婆', '奶奶', '礼物', '送给', '送我'],
    boost: 8,
  },
  {
    queryTerms: ['朋友', '同学', '室友', '闺蜜'],
    memoryTerms: ['朋友', '同学', '室友', '闺蜜', '一起', '我们'],
    boost: 7,
  },
  {
    queryTerms: ['学校', '大学', '高中', '毕业', '校园'],
    memoryTerms: ['学校', '大学', '高中', '毕业', '宿舍', '教室', '校园'],
    boost: 8,
  },
  {
    queryTerms: ['旅行', '城市', '远方', '出游'],
    memoryTerms: ['旅行', '城市', '车站', '机场', '景点', '路上', '远方'],
    boost: 7,
  },
  {
    queryTerms: ['生日', '节日', '纪念日'],
    memoryTerms: ['生日', '节日', '纪念日', '那天', '庆祝'],
    boost: 7,
  },
];

interface MemoryAssistantQueryInput {
  userId: string;
  query: string;
  history?: MemoryAssistantMessage[];
}

interface RankedMemoryCandidate {
  item: CollectedItem;
  storySnippet: string;
  lexicalScore: number;
  vectorScore: number;
  score: number;
}

export async function queryUserMemories({
  userId,
  query,
  history = [],
}: MemoryAssistantQueryInput): Promise<MemoryAssistantResponse> {
  const items = (getItemsByUser(userId) as CollectedItem[]) || [];
  const sourceItems = items.filter(hasMemorySignal);
  const retrievalQuery = buildRetrievalQuery(query, history);

  try {
    await syncUserMemoryEmbeddings(userId, sourceItems);
  } catch (error) {
    console.error('Memory embedding sync failed before retrieval:', error);
  }

  let vectorHits: Array<{ itemId: string; score: number }> = [];
  try {
    vectorHits = await searchMemoryVectors(userId, retrievalQuery, 8);
  } catch (error) {
    console.error('Memory vector retrieval failed, falling back to lexical retrieval:', error);
  }

  const candidates = mergeRetrievalScores(sourceItems, retrievalQuery, vectorHits).slice(0, 4);
  const matches = candidates.map(candidateToMatch);
  const suggestions = buildMemorySuggestions(matches);

  if (matches.length === 0) {
    return {
      answer:
        '我暂时还没有在你的藏品故事里找到足够明确的线索。你可以换一种问法，比如加入时间、人物、地点或物品关键词，例如“和大学毕业有关的物件”或“妈妈送给我的东西”。',
      matches: [],
      suggestions,
      retrievalSummary: `已检查 ${sourceItems.length} 件带有记忆线索的藏品，但当前问题没有召回明显匹配项。`,
      sourceCount: sourceItems.length,
      usedFallback: true,
    };
  }

  if (APP_CONFIG.disableLiveAi || !GEMINI_API_KEY) {
    return {
      answer: buildFallbackAnswer(matches),
      matches,
      suggestions,
      retrievalSummary: buildRetrievalSummary(sourceItems.length, matches.length, vectorHits.length > 0),
      sourceCount: sourceItems.length,
      usedFallback: true,
    };
  }

  try {
    const answer = await generateGroundedMemoryAnswer({
      query,
      history,
      matches,
      sourceCount: sourceItems.length,
    });

    return {
      answer,
      matches,
      suggestions,
      retrievalSummary: buildRetrievalSummary(sourceItems.length, matches.length, vectorHits.length > 0),
      sourceCount: sourceItems.length,
      usedFallback: false,
    };
  } catch (error) {
    console.error('Memory assistant generation failed:', error);
    return {
      answer: buildFallbackAnswer(matches),
      matches,
      suggestions,
      retrievalSummary: buildRetrievalSummary(sourceItems.length, matches.length, vectorHits.length > 0),
      sourceCount: sourceItems.length,
      usedFallback: true,
    };
  }
}

function hasMemorySignal(item: CollectedItem) {
  return Boolean(
    item.name?.trim() ||
      item.description?.trim() ||
      item.story?.trim() ||
      item.tags?.length ||
      item.material?.trim() ||
      item.category?.trim(),
  );
}

function buildRetrievalQuery(query: string, history: MemoryAssistantMessage[]) {
  const normalized = normalizeText(query);
  const tokenCount = extractSearchTokens(normalized).length;
  if (tokenCount >= 2 || history.length === 0) {
    return normalized;
  }

  const previousUserQuestions = history
    .filter((message) => message.role === 'user')
    .slice(-2)
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join(' ');

  return normalizeText(`${previousUserQuestions} ${normalized}`);
}

function mergeRetrievalScores(
  items: CollectedItem[],
  query: string,
  vectorHits: Array<{ itemId: string; score: number }>,
) {
  const lexicalMatches = retrieveLexicalMatches(items, query);
  const lexicalMap = new Map(lexicalMatches.map((match) => [match.item.id, match]));
  const vectorMap = new Map(vectorHits.map((match) => [match.itemId, match.score]));
  const maxLexical = lexicalMatches[0]?.lexicalScore || 1;
  const maxVector = vectorHits[0]?.score || 1;

  return items
    .map((item) => {
      const lexical = lexicalMap.get(item.id);
      const rawVectorScore = vectorMap.get(item.id) || 0;
      const normalizedVector = rawVectorScore > 0 ? rawVectorScore / maxVector : 0;
      const normalizedLexical = lexical ? lexical.lexicalScore / maxLexical : 0;
      const hybridScore = normalizedVector * 0.72 + normalizedLexical * 0.28;

      if (!lexical && normalizedVector < 0.55) {
        return null;
      }

      if (lexical && normalizedVector === 0 && lexical.lexicalScore < 5.5) {
        return null;
      }

      if (hybridScore < 0.22) {
        return null;
      }

      return {
        item,
        storySnippet: lexical?.storySnippet || trimSnippet(item.story || `${item.name}，收录于 ${item.category || item.hallId}。`),
        lexicalScore: lexical?.lexicalScore || 0,
        vectorScore: rawVectorScore,
        score: Number((hybridScore * 100).toFixed(2)),
      } satisfies RankedMemoryCandidate;
    })
    .filter((candidate): candidate is RankedMemoryCandidate => candidate !== null)
    .sort((left, right) => right.score - left.score);
}

function retrieveLexicalMatches(items: CollectedItem[], query: string) {
  const queryTokens = extractSearchTokens(query);

  return items
    .map((item) => scoreMemoryItem(item, query, queryTokens))
    .filter((match): match is { item: CollectedItem; storySnippet: string; lexicalScore: number } => match !== null)
    .sort((left, right) => right.lexicalScore - left.lexicalScore);
}

function scoreMemoryItem(item: CollectedItem, query: string, queryTokens: string[]) {
  const story = item.story?.trim() || '';
  const description = item.description?.trim() || '';
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const hallName = item.category?.trim() || item.hallId || '其他';
  const dateLabel = formatItemDate(item.dateCollected);
  const documentText = normalizeText(
    [item.name, hallName, item.material, description, tags.join(' '), story, dateLabel].filter(Boolean).join(' '),
  );

  const topFragment = pickTopStoryFragment(story, query, queryTokens);

  let lexicalScore = 0;
  lexicalScore += scoreField(query, queryTokens, item.name, 4.4);
  lexicalScore += scoreField(query, queryTokens, hallName, 2.1);
  lexicalScore += scoreField(query, queryTokens, item.material, 1.7);
  lexicalScore += scoreField(query, queryTokens, description, 2.4);
  lexicalScore += scoreField(query, queryTokens, tags.join(' '), 2.8);
  lexicalScore += scoreField(query, queryTokens, story, 3.6);
  lexicalScore += topFragment.score * 1.35;
  lexicalScore += scoreField(query, queryTokens, dateLabel, 1.4);
  lexicalScore += scoreThematicHints(query, documentText);

  if (story) {
    lexicalScore += 1.2;
  }

  if (!story && lexicalScore < 6) {
    return null;
  }

  if (lexicalScore < 5.5) {
    return null;
  }

  return {
    item,
    storySnippet: topFragment.text || story || `${item.name}，收录于 ${hallName}。`,
    lexicalScore,
  };
}

function scoreField(query: string, tokens: string[], value: string | undefined, weight: number) {
  if (!value?.trim()) {
    return 0;
  }

  const normalized = normalizeText(value);
  let score = 0;

  if (query.length >= 2 && normalized.includes(query)) {
    score += 10 * weight;
  }

  for (const token of tokens) {
    if (normalized.includes(token)) {
      score += (token.length >= 3 ? 3.2 : 2.2) * weight;
    }
  }

  return score;
}

function scoreThematicHints(query: string, normalizedDocument: string) {
  let score = 0;

  for (const hint of THEMATIC_HINTS) {
    const matchesQuery = hint.queryTerms.some((term) => query.includes(term));
    const matchesDocument = hint.memoryTerms.some((term) => normalizedDocument.includes(term));
    if (matchesQuery && matchesDocument) {
      score += hint.boost;
    }
  }

  return score;
}

function pickTopStoryFragment(story: string, query: string, tokens: string[]) {
  const fragments = splitStoryFragments(story);
  let best = { text: trimSnippet(story), score: 0 };

  for (const fragment of fragments) {
    const fragmentScore = scoreField(query, tokens, fragment, 1.2) + Math.min(fragment.length, 48) / 48;
    if (fragmentScore > best.score) {
      best = {
        text: trimSnippet(fragment),
        score: fragmentScore,
      };
    }
  }

  return best;
}

function splitStoryFragments(story: string) {
  return story
    .split(/[。！？?!\n]/)
    .flatMap((part) => part.split(/[；;]/))
    .map((part) => part.trim())
    .filter((part) => part.length >= 4);
}

function extractSearchTokens(text: string) {
  const normalized = normalizeText(text);
  const tokens = new Set<string>();
  const latinMatches = normalized.match(/[a-z0-9]{2,}/g) || [];
  latinMatches.forEach((token) => {
    if (!GENERIC_QUERY_TOKENS.has(token)) {
      tokens.add(token);
    }
  });

  const chineseMatches = normalized.match(/[\u4e00-\u9fff]{2,}/g) || [];
  chineseMatches.forEach((segment) => {
    if (!GENERIC_QUERY_TOKENS.has(segment)) {
      tokens.add(segment);
    }

    for (let index = 0; index < segment.length - 1; index += 1) {
      const bigram = segment.slice(index, index + 2);
      if (!GENERIC_QUERY_TOKENS.has(bigram)) {
        tokens.add(bigram);
      }
    }
  });

  return Array.from(tokens);
}

function normalizeText(text: string) {
  return (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function trimSnippet(text: string) {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= 120) {
    return compact;
  }

  return `${compact.slice(0, 117)}...`;
}

function formatItemDate(value: string) {
  if (!value) {
    return '时间未记录';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function candidateToMatch(candidate: RankedMemoryCandidate): MemoryAssistantMatch {
  return {
    itemId: candidate.item.id,
    itemName: candidate.item.name,
    imageUrl: candidate.item.imageUrl,
    hallName: candidate.item.category?.trim() || candidate.item.hallId || '其他',
    material: candidate.item.material || '未记录',
    dateCollected: candidate.item.dateCollected,
    storySnippet: candidate.storySnippet,
    tags: Array.isArray(candidate.item.tags) ? candidate.item.tags : [],
    score: candidate.score,
  };
}

function buildMemorySuggestions(matches: MemoryAssistantMatch[]) {
  const suggestions = new Set<string>([
    '帮我找和学生时代有关的藏品',
    '有没有哪件物品让我想到家人',
    '我收藏过哪些最有纪念意义的东西',
  ]);

  const topMatch = matches[0];
  if (topMatch?.hallName) {
    suggestions.add(`再找找和“${topMatch.hallName}”有关的回忆`);
  }

  const firstTag = topMatch?.tags?.[0];
  if (firstTag) {
    suggestions.add(`还有哪些藏品和“${firstTag}”有关`);
  }

  return Array.from(suggestions).slice(0, 4);
}

function buildRetrievalSummary(sourceCount: number, matchCount: number, usedVectors: boolean) {
  return usedVectors
    ? `已从 ${sourceCount} 件带有记忆线索的藏品中，通过向量检索 + 关键词重排召回 ${matchCount} 条相关记忆。`
    : `已从 ${sourceCount} 件带有记忆线索的藏品中，通过关键词检索召回 ${matchCount} 条相关记忆。`;
}

async function generateGroundedMemoryAnswer({
  query,
  history,
  matches,
  sourceCount,
}: {
  query: string;
  history: MemoryAssistantMessage[];
  matches: MemoryAssistantMatch[];
  sourceCount: number;
}) {
  if (APP_CONFIG.disableLiveAi) {
    throw new Error('Live AI is disabled for memory answer generation.');
  }

  if (!GEMINI_API_KEY) {
    throw new Error('Missing GEMINI_API_KEY');
  }

  const ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY,
    httpOptions: GEMINI_BASE_URL ? { baseUrl: GEMINI_BASE_URL } : undefined,
  });

  const recentHistory = history.slice(-6).map((message) => {
    const speaker = message.role === 'user' ? '用户' : '助手';
    return `${speaker}: ${message.content}`;
  });

  const context = matches
    .map((match, index) => {
      return [
        `线索 ${index + 1}`,
        `藏品: ${match.itemName}`,
        `展馆: ${match.hallName}`,
        `材质: ${match.material}`,
        `日期: ${formatItemDate(match.dateCollected)}`,
        `标签: ${match.tags.length ? match.tags.join('、') : '无'}`,
        `故事片段: ${match.storySnippet}`,
      ].join('\n');
    })
    .join('\n\n');

  const response = await ai.models.generateContent({
    model: GEMINI_MEMORY_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: [
              '你是“再生博物馆”的记忆馆长。你的任务是根据用户自己录入的旧物故事，帮助用户回忆过去，而不是编造故事。',
              '回答要求：',
              '1. 只能基于给定线索回答，不要编造未出现的事实。',
              '2. 用中文回答，语气温柔、具体、有画面感，但不要过度煽情。',
              '3. 优先提到具体藏品名称，并说明为什么会联想到它。',
              '4. 如果线索不够充分，要明确说明“目前能确认的是……”。',
              '5. 输出 120 到 220 字，不要使用列表。',
              '',
              `当前用户问题：${query}`,
              `该用户目前共有 ${sourceCount} 件带有记忆线索的藏品，本次召回 ${matches.length} 条。`,
              recentHistory.length ? `最近对话：\n${recentHistory.join('\n')}` : '最近对话：无',
              '',
              `检索到的真实线索：\n${context}`,
            ].join('\n'),
          },
        ],
      },
    ],
    config: {
      temperature: 0.7,
      topP: 0.9,
    },
  });

  const answer = response.text?.trim();
  if (!answer) {
    throw new Error('No memory answer returned from Gemini');
  }

  return answer;
}

function buildFallbackAnswer(matches: MemoryAssistantMatch[]) {
  const names = matches.slice(0, 3).map((match) => `《${match.itemName}》`);
  const snippets = matches.slice(0, 2).map((match) => match.storySnippet);

  return [
    `我先从你的藏品记忆里找到了 ${names.join('、')} 这些线索。`,
    snippets[0] ? `其中最贴近这次提问的是：“${snippets[0]}”。` : '',
    snippets[1] ? `另外还有一段相关记忆：“${snippets[1]}”。` : '',
    '如果你愿意，可以继续追问得更具体一点，比如加入时间、人物或地点，我可以帮你把这段回忆再找得更准。',
  ]
    .filter(Boolean)
    .join('');
}
