
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
}

export interface CollectedItem {
  id: string;
  name: string;
  category: string; // Changed from ItemCategory to string to support custom halls
  material: string;
  imageUrl: string;
  dateCollected: string;
  story?: string;
  tags: string[];
  ideas: RemuseIdea[];
  status: 'raw' | 'in-progress' | 'remused';
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

export type ViewState = 'MUSEUM' | 'SCANNER' | 'ITEM_DETAIL' | 'PROFILE' | 'STICKER_LIBRARY' | 'INSPIRATION';
