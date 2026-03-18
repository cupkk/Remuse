export enum ItemCategory {
  PACKAGING = '奶茶周边',
  CONTAINER = '瓶瓶罐罐',
  PAPER = '手办玩偶',
  ELECTRONIC = '徽章冰箱贴',
  TEXTILE = '纪念票根',
  OTHER = '其他',
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
  description?: string;
  imageUrl: string;
  coverImageUrl?: string;
  audioUrl?: string;
  dateCollected: string;
  story?: string;
  tags: string[];
  status: 'raw' | 'in-progress' | 'remused';
}

export interface TransformationGuide {
  title: string;
  summary: string;
  concept: string;
  materials: string[];
  steps: string[];
  tips: string[];
  imageUrl: string;
}

export interface TransformationGuideSourceItem {
  id: string;
  name: string;
  category: string;
  material: string;
  description?: string;
  story?: string;
  tags: string[];
  imageUrl?: string;
  coverImageUrl?: string;
}

export interface SavedTransformationGuide extends TransformationGuide {
  id: string;
  itemIds: string[];
  sourceItems: TransformationGuideSourceItem[];
  dateCreated: string;
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

export interface MemoryThreadSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessage: string;
  sourceCount: number;
  usedFallback: boolean;
}

export interface UsageSnapshot {
  scope: 'gemini-proxy' | 'memory-query';
  used: number;
  limit: number;
  remaining: number;
}

export interface UserAgreementSnapshot {
  termsVersionAccepted: string | null;
  privacyVersionAccepted: string | null;
  aiNoticeVersionAccepted: string | null;
  consentAcceptedAt: string | null;
  currentTermsVersion: string;
  currentPrivacyVersion: string;
  currentAiNoticeVersion: string;
}

export interface FeedbackSubmission {
  id: string;
  userId: string;
  email: string;
  nickname: string;
  type: 'bug' | 'feature' | 'support' | 'other';
  message: string;
  status: 'open' | 'in_review' | 'closed';
  createdAt: string;
  updatedAt: string;
}

export interface AdminUsageSummary {
  windowDays: number;
  totalEvents: number;
  totalAiCalls: number;
  totalProductEvents: number;
  successRate: number;
  avgDurationMs: number | null;
  activeUsers: number;
}

export interface AdminAiScopeSummary {
  scope: string;
  calls: number;
  successCount: number;
  avgDurationMs: number | null;
}

export interface AdminProductEventSummary {
  eventType: string;
  count: number;
}

export type AdminUserFlagStatus = 'watch' | 'restricted' | 'cleared';

export interface AdminConversionSummary {
  windowDays: number;
  registrations: number;
  verifiedUsers: number;
  loginUsers: number;
  scanUsers: number;
  stickerUsers: number;
  memoryUsers: number;
  d1Retention: number;
  d7Retention: number;
}

export interface AdminTrendPoint {
  dayKey: string;
  totalEvents: number;
  aiCalls: number;
  productEvents: number;
  activeUsers: number;
  avgDurationMs: number | null;
}

export interface AdminUserActivity {
  userId: string;
  email: string | null;
  nickname: string;
  isGuest: boolean;
  totalEvents: number;
  aiCalls: number;
  geminiCalls: number;
  memoryAiCalls: number;
  loginCount: number;
  refreshCount: number;
  scanCount: number;
  stickerCount: number;
  memoryQueryCount: number;
  lastSeen: string | null;
  flagStatus: AdminUserFlagStatus | null;
  flagNote: string | null;
  flagUpdatedAt: string | null;
}

export interface AdminUserEvent {
  id: string;
  source: 'ai' | 'product';
  name: string;
  createdAt: string;
  success: boolean | null;
  durationMs: number | null;
  model: string | null;
  details: Record<string, unknown>;
}

export interface AdminUserDetail {
  user: AdminUserActivity;
  trends14d: AdminTrendPoint[];
  recentEvents: AdminUserEvent[];
}

export interface AdminFeedbackSummary {
  open: number;
  inReview: number;
  closed: number;
}

export interface AdminOverview {
  summary7d: AdminUsageSummary;
  summary30d: AdminUsageSummary;
  conversion7d: AdminConversionSummary;
  conversion30d: AdminConversionSummary;
  aiScopes7d: AdminAiScopeSummary[];
  productEvents7d: AdminProductEventSummary[];
  trends7d: AdminTrendPoint[];
  trends30d: AdminTrendPoint[];
  topUsers: AdminUserActivity[];
  recentUsers: AdminUserActivity[];
  flaggedUsers: AdminUserActivity[];
  feedbackSummary: AdminFeedbackSummary;
  feedback: FeedbackSubmission[];
}

export type ViewState =
  | 'ADMIN'
  | 'MUSEUM'
  | 'SCANNER'
  | 'ITEM_DETAIL'
  | 'PROFILE'
  | 'STICKER_LIBRARY'
  | 'INSPIRATION'
  | 'MEMORY_RAG'
  | 'LOGIN';

export interface User {
  id: string;
  email: string | null;
  emailVerified: boolean;
  nickname: string;
  avatarUrl: string | null;
  isGuest: boolean;
  createdAt: string;
  onboardingSeen: boolean;
  toolbox: Tool[];
  role: 'admin' | 'user';
  isAdmin: boolean;
  agreements: UserAgreementSnapshot;
  usage: UsageSnapshot[];
}
