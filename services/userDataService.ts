import { CollectedItem, ExhibitionHall, SavedJournal, SavedTransformationGuide, SharedMuseumSummary, Sticker, User } from '../types';
import { fetchHalls, fetchItems, fetchJournals, fetchSharedMuseums, fetchStickers, fetchTransformationGuides } from './dataService';

export interface LoadedUserWorkspace {
  items: CollectedItem[];
  stickers: Sticker[];
  journals: SavedJournal[];
  guides: SavedTransformationGuide[];
  halls: ExhibitionHall[];
  sharedMuseums: SharedMuseumSummary[];
  user: User | null;
}

export async function loadUserWorkspace(currentUser: User | null): Promise<LoadedUserWorkspace> {
  const [fetchedItems, fetchedStickers, fetchedJournals, fetchedGuides, fetchedHalls, fetchedSharedMuseums] = await Promise.all([
    fetchItems(),
    fetchStickers(),
    fetchJournals(),
    fetchTransformationGuides(),
    fetchHalls(),
    fetchSharedMuseums(),
  ]);

  const safeItems = Array.isArray(fetchedItems) ? fetchedItems : [];
  const safeStickers = Array.isArray(fetchedStickers) ? fetchedStickers : [];
  const safeJournals = Array.isArray(fetchedJournals) ? fetchedJournals : [];
  const safeGuides = Array.isArray(fetchedGuides) ? fetchedGuides : [];
  const safeHalls = Array.isArray(fetchedHalls) ? fetchedHalls : [];
  const safeSharedMuseums = Array.isArray(fetchedSharedMuseums) ? fetchedSharedMuseums : [];

  return {
    items: safeItems,
    stickers: safeStickers,
    journals: safeJournals,
    guides: safeGuides,
    halls: safeHalls,
    sharedMuseums: safeSharedMuseums,
    user: currentUser,
  };
}
