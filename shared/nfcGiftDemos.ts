import rawGiftDemos from './nfcGiftDemos.generated.json';

export interface NfcGiftProcessStep {
  id: string;
  label: string;
  title: string;
  description: string;
}

export interface NfcGiftPalette {
  glow: string;
  spotlight: string;
  panelTint: string;
}

export interface NfcGiftDemo {
  slug: string;
  capsuleLabel: string;
  archiveCode: string;
  publicUrl: string;
  title: string;
  subtitle: string;
  originalImageUrl: string;
  coverImageUrl: string;
  stickerImageUrl: string;
  imageAlt: string;
  coverAlt: string;
  stickerAlt: string;
  stickerCaption: string;
  sourceItemName: string;
  sourceCategory: string;
  sourceMaterial: string;
  sourceStory: string;
  analyzedName: string;
  analyzedCategory: string;
  analyzedMaterial: string;
  analyzedStory: string;
  tags: string[];
  highlights: string[];
  processTimeline: NfcGiftProcessStep[];
  palette: NfcGiftPalette;
  generatedAt: string;
  generatedAtLabel: string;
  coverProvider: 'rembg' | 'gemini' | 'fallback';
  coverUsedFallback: boolean;
}

export const NFC_GIFT_DEMOS = rawGiftDemos as NfcGiftDemo[];

export function getNfcGiftDemo(slug: string | null | undefined) {
  if (!slug) {
    return null;
  }

  return NFC_GIFT_DEMOS.find((gift) => gift.slug === slug) || null;
}
