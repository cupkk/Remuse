// ============================================================
// Data service: frontend persistence API wrappers.
// ============================================================

import { apiFetch } from './apiClient';
import { imageUrlToBase64 } from './imageUtils';
import { CollectedItem, ExhibitionHall, SavedTransformationGuide, Sticker, TransformationGuideSourceItem } from '../types';

// ---- Items ----

export async function fetchItems(): Promise<CollectedItem[]> {
  const data = await apiFetch<{ items: CollectedItem[] }>('/api/items');
  return data.items;
}

export async function createItemOnServer(item: {
  name: string;
  hallId: string;
  category: string;
  material: string;
  description?: string;
  imageBase64?: string;
  imageUrl?: string;
  coverImageBase64?: string;
  coverImageUrl?: string;
  audioBase64?: string;
  story?: string;
  tags?: string[];
  status?: string;
  dateCollected?: string;
}): Promise<CollectedItem> {
  const imageBase64 = await resolveImageBase64(item.imageBase64, item.imageUrl);
  const coverImageBase64 = await resolveImageBase64(item.coverImageBase64, item.coverImageUrl);
  const data = await apiFetch<{ item: CollectedItem }>('/api/items', {
    method: 'POST',
    body: JSON.stringify({
      ...item,
      imageBase64,
      coverImageBase64,
    }),
  });
  return data.item;
}

export async function updateItemOnServer(
  id: string,
  updates: Partial<{
    name: string;
    hallId: string;
    category: string;
    material: string;
    description: string;
    imageBase64: string;
    imageUrl: string;
    coverImageBase64: string;
    coverImageUrl: string;
    audioBase64: string;
    story: string;
    tags: string[];
    status: string;
    clearAudio: boolean;
  }>,
): Promise<CollectedItem> {
  const imageBase64 = await resolveImageBase64(updates.imageBase64, updates.imageUrl);
  const coverImageBase64 = await resolveImageBase64(updates.coverImageBase64, updates.coverImageUrl);
  const data = await apiFetch<{ item: CollectedItem }>(`/api/items/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...updates,
      imageBase64,
      coverImageBase64,
    }),
  });
  return data.item;
}

export async function deleteItemOnServer(id: string): Promise<void> {
  await apiFetch(`/api/items/${id}`, { method: 'DELETE' });
}

// ---- Stickers ----

export async function fetchStickers(): Promise<Sticker[]> {
  const data = await apiFetch<{ stickers: Sticker[] }>('/api/stickers');
  return data.stickers;
}

export async function createStickerOnServer(sticker: {
  originalItemId?: string;
  imageBase64?: string;
  imageUrl?: string;
  dramaText?: string;
  category?: string;
  dateCreated?: string;
}): Promise<Sticker> {
  const imageBase64 = await resolveImageBase64(sticker.imageBase64, sticker.imageUrl);
  const data = await apiFetch<{ sticker: Sticker }>('/api/stickers', {
    method: 'POST',
    body: JSON.stringify({
      ...sticker,
      imageBase64,
    }),
  });
  return data.sticker;
}

export async function deleteStickerOnServer(id: string): Promise<void> {
  await apiFetch(`/api/stickers/${id}`, { method: 'DELETE' });
}

// ---- Transformation guides ----

export async function fetchTransformationGuides(): Promise<SavedTransformationGuide[]> {
  const data = await apiFetch<{ guides: SavedTransformationGuide[] }>('/api/transformation-guides');
  return data.guides;
}

export async function createTransformationGuideOnServer(guide: {
  title: string;
  summary: string;
  concept: string;
  materials: string[];
  steps: string[];
  tips?: string[];
  imageBase64?: string;
  imageUrl?: string;
  itemIds: string[];
  sourceItems: TransformationGuideSourceItem[];
  dateCreated?: string;
}): Promise<SavedTransformationGuide> {
  const imageBase64 = await resolveImageBase64(guide.imageBase64, guide.imageUrl);
  const data = await apiFetch<{ guide: SavedTransformationGuide }>('/api/transformation-guides', {
    method: 'POST',
    body: JSON.stringify({
      ...guide,
      imageBase64,
    }),
  });
  return data.guide;
}

// ---- Halls ----

export async function fetchHalls(): Promise<ExhibitionHall[]> {
  const data = await apiFetch<{ halls: ExhibitionHall[] }>('/api/halls');
  return data.halls;
}

export async function createHallOnServer(hall: {
  id?: string;
  name: string;
  imageBase64?: string;
  imageUrl?: string;
}): Promise<ExhibitionHall> {
  const imageBase64 = await resolveImageBase64(hall.imageBase64, hall.imageUrl);
  const data = await apiFetch<{ hall: ExhibitionHall }>('/api/halls', {
    method: 'POST',
    body: JSON.stringify({
      ...hall,
      imageBase64,
    }),
  });
  return data.hall;
}

export async function updateHallOnServer(
  id: string,
  updates: Partial<{
    name: string;
    imageBase64: string;
    imageUrl: string;
  }>,
): Promise<ExhibitionHall> {
  const imageBase64 = await resolveImageBase64(updates.imageBase64, updates.imageUrl);
  const data = await apiFetch<{ hall: ExhibitionHall }>(`/api/halls/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...updates,
      imageBase64,
    }),
  });
  return data.hall;
}

export async function deleteHallOnServer(id: string): Promise<void> {
  await apiFetch(`/api/halls/${id}`, { method: 'DELETE' });
}

async function resolveImageBase64(imageBase64?: string, imageUrl?: string): Promise<string | undefined> {
  if (typeof imageBase64 === 'string' && imageBase64.trim()) {
    return imageBase64;
  }

  if (typeof imageUrl === 'string' && imageUrl.trim()) {
    return imageUrlToBase64(imageUrl);
  }

  return undefined;
}
