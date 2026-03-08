import { CollectedItem, ExhibitionHall, Sticker, User } from '../types';
import * as authService from './authService';
import { fetchHalls, fetchItems, fetchStickers } from './dataService';
import { loadSampleData } from './sampleData';

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

  let resolvedItems = safeItems;
  let resolvedUser = currentUser;

  if (safeItems.length === 0 && currentUser && !currentUser.sampleSeeded) {
    const sampleItems = await loadSampleData();
    if (sampleItems.length > 0) {
      resolvedItems = sampleItems;
      resolvedUser = await authService.updatePreferences({ sampleSeeded: true });
    }
  }

  return {
    items: resolvedItems,
    stickers: safeStickers,
    halls: safeHalls,
    user: resolvedUser,
  };
}
