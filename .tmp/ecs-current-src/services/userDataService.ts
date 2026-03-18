import { CollectedItem, ExhibitionHall, Sticker, User } from '../types';
import { fetchHalls, fetchItems, fetchStickers } from './dataService';

export interface LoadedUserWorkspace {
  items: CollectedItem[];
  stickers: Sticker[];
  halls: ExhibitionHall[];
  user: User | null;
}

export async function loadUserWorkspace(currentUser: User | null): Promise<LoadedUserWorkspace> {
  const [fetchedItems, fetchedStickers, fetchedHalls] = await Promise.all([
    fetchItems(),
    fetchStickers(),
    fetchHalls(),
  ]);

  const safeItems = Array.isArray(fetchedItems) ? fetchedItems : [];
  const safeStickers = Array.isArray(fetchedStickers) ? fetchedStickers : [];
  const safeHalls = Array.isArray(fetchedHalls) ? fetchedHalls : [];

  return {
    items: safeItems,
    stickers: safeStickers,
    halls: safeHalls,
    user: currentUser,
  };
}
