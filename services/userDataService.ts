import { CollectedItem, ExhibitionHall, SavedTransformationGuide, Sticker, User } from '../types';
import { fetchHalls, fetchItems, fetchStickers, fetchTransformationGuides } from './dataService';

export interface LoadedUserWorkspace {
  items: CollectedItem[];
  stickers: Sticker[];
  guides: SavedTransformationGuide[];
  halls: ExhibitionHall[];
  user: User | null;
}

export async function loadUserWorkspace(currentUser: User | null): Promise<LoadedUserWorkspace> {
  const [fetchedItems, fetchedStickers, fetchedGuides, fetchedHalls] = await Promise.all([
    fetchItems(),
    fetchStickers(),
    fetchTransformationGuides(),
    fetchHalls(),
  ]);

  const safeItems = Array.isArray(fetchedItems) ? fetchedItems : [];
  const safeStickers = Array.isArray(fetchedStickers) ? fetchedStickers : [];
  const safeGuides = Array.isArray(fetchedGuides) ? fetchedGuides : [];
  const safeHalls = Array.isArray(fetchedHalls) ? fetchedHalls : [];

  return {
    items: safeItems,
    stickers: safeStickers,
    guides: safeGuides,
    halls: safeHalls,
    user: currentUser,
  };
}
