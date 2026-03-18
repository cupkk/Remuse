
export enum ItemCategory {
  PACKAGING = '奶茶周边',
  CONTAINER = '瓶瓶罐罐',
  PAPER = '手办玩偶',
  ELECTRONIC = '徽章冰箱贴',
  TEXTILE = '纪念票根',
  OTHER = '其他'
}

export enum Difficulty {
  EASY = '简单',
  MEDIUM = '中等',
  HARD = '困难'
}

export interface RemuseIdea {
  title: string;
  description: string;
  difficulty: Difficulty;
  materials: string[];
  steps: string[];
}

export interface ExhibitionHall {
  id: string;
  name: string;
  imageUrl: string;
  isCustom?: boolean;
  systemHallId?: string;
  isHidden?: boolean;
}

export interface CollectedItem {
  id: string;
  name: string;
  hallId: string;
  category: string;
  material: string;
  imageUrl: string;
  dateCollected: string;
  story?: string;
  tags: string[];
  ideas: RemuseIdea[];
  status: 'raw' | 'in-progress' | 'remused';
  isSample?: boolean;
}

export interface Sticker {
  id: string;
  originalItemId: string;
  stickerImageUrl: string;
  dramaText: string;
  category: string;
  dateCreated: string;
}

export interface InspirationPost {
  id: string;
  author: string;
  avatar: string;
  image: string;
  title: string;
  tags: string[];
  likes: number;
  comments: number;
  isLiked?: boolean;
  imageAspect?: string;
}

export interface Tool {
  id: string;
  name: string;
  iconType: 'scissors' | 'tape' | 'glue' | 'screwdriver' | 'brush' | 'ruler' | 'knife' | 'other';
  color: string;
}

export interface MemoryAssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface MemoryAssistantMatch {
  itemId: string;
  itemName: string;
  imageUrl: string;
  hallName: string;
  material: string;
  dateCollected: string;
  storySnippet: string;
  tags: string[];
  score: number;
}

export interface MemoryAssistantResponse {
  answer: string;
  matches: MemoryAssistantMatch[];
  suggestions: string[];
  retrievalSummary: string;
  sourceCount: number;
  usedFallback: boolean;
}

export interface MemoryConversationSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: MemoryAssistantMessage[];
  matches: MemoryAssistantMatch[];
  suggestions: string[];
  retrievalSummary: string;
  sourceCount: number;
  usedFallback: boolean;
}

export type ViewState = 'MUSEUM' | 'SCANNER' | 'ITEM_DETAIL' | 'PROFILE' | 'STICKER_LIBRARY' | 'INSPIRATION' | 'MEMORY_RAG' | 'LOGIN';

/** 用户模型 */
export interface User {
  id: string;
  email: string | null;
  emailVerified: boolean;
  nickname: string;
  avatarUrl: string | null;
  isGuest: boolean;
  createdAt: string;
  onboardingSeen: boolean;
  sampleSeeded: boolean;
  toolbox: Tool[];
}
