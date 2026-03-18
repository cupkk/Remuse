import { Sticker } from '../types';

export const EMOJI_PACK_CATEGORY = '__emoji_pack__';
export const PERLER_PATTERN_CATEGORY = '__perler_pattern__';

export function isSourceSticker(sticker: Sticker) {
  return ![EMOJI_PACK_CATEGORY, PERLER_PATTERN_CATEGORY].includes(sticker.category);
}
