import { ExhibitionHall, ItemCategory } from '../types.js';

const DEFAULT_COVERS: Record<string, string> = {
  [ItemCategory.PACKAGING]: 'https://images.unsplash.com/photo-1525803377221-4f6ccdaa5133?auto=format&fit=crop&q=80&w=400',
  [ItemCategory.CONTAINER]: 'https://images.unsplash.com/photo-1709346727368-dc3e2b8c6124?auto=format&fit=crop&q=80&w=400',
  [ItemCategory.PAPER]: 'https://images.unsplash.com/photo-1692935318316-8315eb21761e?auto=format&fit=crop&q=80&w=400',
  [ItemCategory.ELECTRONIC]: 'https://images.unsplash.com/photo-1597502321303-ac7965ad7e8e?auto=format&fit=crop&q=80&w=400',
  [ItemCategory.TEXTILE]: 'https://images.unsplash.com/photo-1611550082883-a65b37a8ea89?auto=format&fit=crop&q=80&w=400',
  [ItemCategory.OTHER]: 'https://images.unsplash.com/photo-1609338177258-4ce9fafc513e?auto=format&fit=crop&q=80&w=400',
};

const HALL_CATEGORIES = Object.values(ItemCategory) as ItemCategory[];

export const DEFAULT_HALLS: ExhibitionHall[] = HALL_CATEGORIES.map((category) => ({
  id: category,
  name: category,
  imageUrl: DEFAULT_COVERS[category] || DEFAULT_COVERS[ItemCategory.OTHER],
  isCustom: false,
}));

export function getDefaultHallById(hallId: string | null | undefined): ExhibitionHall | undefined {
  if (!hallId) return undefined;
  return DEFAULT_HALLS.find((hall) => hall.id === hallId);
}

export function mergeHalls(hallRecords: ExhibitionHall[] = []): ExhibitionHall[] {
  const overrides = new Map<string, ExhibitionHall>();
  const customHalls: ExhibitionHall[] = [];

  for (const hall of hallRecords) {
    if (hall.systemHallId) {
      overrides.set(hall.systemHallId, hall);
      continue;
    }

    if (!hall.isHidden) {
      customHalls.push({
        ...hall,
        isCustom: true,
      });
    }
  }

  const mergedDefaults = DEFAULT_HALLS.flatMap((defaultHall) => {
    const override = overrides.get(defaultHall.id);
    if (override?.isHidden) {
      return [];
    }

    if (!override) {
      return [defaultHall];
    }

    return [{
      ...defaultHall,
      name: override.name || defaultHall.name,
      imageUrl: override.imageUrl || defaultHall.imageUrl,
      isCustom: false,
      systemHallId: defaultHall.id,
    }];
  });

  return [...mergedDefaults, ...customHalls];
}

export function getHallById(halls: ExhibitionHall[], hallId: string | null | undefined): ExhibitionHall | undefined {
  if (!hallId) return undefined;
  return halls.find((hall) => hall.id === hallId);
}

export function getHallNameById(
  halls: ExhibitionHall[],
  hallId: string | null | undefined,
  fallback: string = ItemCategory.OTHER,
): string {
  return getHallById(halls, hallId)?.name || hallId || fallback;
}
