import { NFC_GIFT_SHOWCASE_BLUEPRINT } from './nfcGiftShowcaseBlueprint.ts';

export type NfcGiftCoverProvider = 'rembg' | 'gemini' | 'fallback';

export interface NfcGiftShowcaseProcessStep {
  id: string;
  label: string;
  title: string;
  description: string;
}

export interface NfcGiftShowcaseRecord {
  slug: string;
  title: string;
  subtitle: string;
  imageAlt: string;
  coverAlt: string;
  stickerAlt: string;
  stickerCaption: string;
  sourceCategory: string;
  tags: string[];
  highlights: string[];
  processTimeline: NfcGiftShowcaseProcessStep[];
  publicUrl: string;
  coverProvider: NfcGiftCoverProvider;
  coverUsedFallback: boolean;
}

const blueprintBySlug = new Map(NFC_GIFT_SHOWCASE_BLUEPRINT.map((entry) => [entry.slug, entry]));

export function formatShowcaseCoverProvider(provider: NfcGiftCoverProvider) {
  switch (provider) {
    case 'rembg':
      return 'Rembg 本地抠图';
    case 'gemini':
      return 'Gemini 图像生成';
    default:
      return '本地保底封面';
  }
}

export function buildShowcaseHighlights() {
  return [
    '首屏展示真实原图，不再用占位插画充当结果页。',
    '封面与贴纸已经固化成公开静态资源，扫码现场打开更稳定。',
    'NFC 标签只写固定 URL，用户轻触即可直达，不依赖登录或后台接口。',
  ];
}

export function buildShowcaseProcessTimeline({
  slug,
  title,
  category,
  publicUrl,
  coverProvider,
  coverUsedFallback,
}: {
  slug: string;
  title: string;
  category: string;
  publicUrl: string;
  coverProvider: NfcGiftCoverProvider;
  coverUsedFallback: boolean;
}) {
  const providerLabel = formatShowcaseCoverProvider(coverProvider);

  return [
    {
      id: `${slug}-step-1`,
      label: '01',
      title: '选取真实原图',
      description: '从项目已有上传记录里提取真实照片，并导出为可公开访问的静态展示资源。',
    },
    {
      id: `${slug}-step-2`,
      label: '02',
      title: '整理展台档案',
      description: `把这件物件整理成展台标题“${title}”，并归入“${category || '其他'}”这一页公开档案。`,
    },
    {
      id: `${slug}-step-3`,
      label: '03',
      title: '生成封面主视觉',
      description: coverUsedFallback
        ? `当前封面由 ${providerLabel} 输出，本次同时保留了保底排版。`
        : `当前封面由 ${providerLabel} 输出，作为扫码后第一眼看到的展台主视觉。`,
    },
    {
      id: `${slug}-step-4`,
      label: '04',
      title: '输出贴纸结果',
      description: '同步保留 AI 贴纸图和一句短文案，让现场体验更像一份可以被带走的礼物。',
    },
    {
      id: `${slug}-step-5`,
      label: '05',
      title: '固定公开链接',
      description: `最终页面发布到 ${publicUrl}，NFC 贴纸只需写入这个固定地址即可直接展示。`,
    },
  ];
}

export function applyCuratedGiftCopy<T extends NfcGiftShowcaseRecord>(gift: T): T {
  const blueprint = blueprintBySlug.get(gift.slug);
  if (!blueprint) {
    return gift;
  }

  const copy = blueprint.copy;
  const title = copy.title;
  const subtitle = copy.subtitle;
  const tags = uniqueStrings([
    ...copy.tags,
    gift.sourceCategory && gift.sourceCategory !== '其他' ? gift.sourceCategory : undefined,
  ]).slice(0, 5);

  return {
    ...gift,
    title,
    subtitle,
    imageAlt: `${title} 的真实原图`,
    coverAlt: `${title} 的 AI 展示封面`,
    stickerAlt: `${title} 的 AI 贴纸图`,
    stickerCaption: copy.stickerCaption,
    tags,
    highlights: buildShowcaseHighlights(),
    processTimeline: buildShowcaseProcessTimeline({
      slug: gift.slug,
      title,
      category: gift.sourceCategory,
      publicUrl: gift.publicUrl,
      coverProvider: gift.coverProvider,
      coverUsedFallback: gift.coverUsedFallback,
    }),
  };
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = `${value || ''}`.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}
