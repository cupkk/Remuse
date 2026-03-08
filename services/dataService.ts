// ============================================================
// Data Service — 前端数据持久化 API 封装
// ============================================================

import { apiFetch } from './apiClient';
import { imageUrlToBase64 } from './imageUtils';
import { CollectedItem, Sticker, ExhibitionHall } from '../types';

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
  imageBase64?: string;
  imageUrl?: string;
  story?: string;
  tags?: string[];
  ideas?: any[];
  status?: string;
  isSample?: boolean;
  dateCollected?: string;
}): Promise<CollectedItem> {
  const imageBase64 = await resolveImageBase64(item.imageBase64, item.imageUrl);
  const data = await apiFetch<{ item: CollectedItem }>('/api/items', {
    method: 'POST',
    body: JSON.stringify({
      ...item,
      imageBase64,
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
    imageBase64: string;
    imageUrl: string;
    story: string;
    tags: string[];
    ideas: any[];
    status: string;
    isSample: boolean;
  }>,
): Promise<CollectedItem> {
  const imageBase64 = await resolveImageBase64(updates.imageBase64, updates.imageUrl);
  const data = await apiFetch<{ item: CollectedItem }>(`/api/items/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...updates,
      imageBase64,
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
