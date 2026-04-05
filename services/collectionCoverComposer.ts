import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { APP_CONFIG } from './appConfig.ts';
import { getCollectionCoverTheme } from '../shared/collectionCoverThemes.ts';

const COVER_WIDTH = 900;
const COVER_HEIGHT = 1260;
const templateCache = new Map<string, string>();
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

interface ComposeCollectionCoverOptions {
  hallId: string;
  subjectDataUrl: string;
  useCutoutLayout?: boolean;
}

interface DecodedDataUrl {
  mimeType: string;
  buffer: Buffer;
}

export async function composeCollectionCoverDataUrl({
  hallId,
  subjectDataUrl,
  useCutoutLayout = true,
}: ComposeCollectionCoverOptions) {
  const theme = getCollectionCoverTheme(hallId);
  const subjectData = decodeDataUrl(subjectDataUrl);
  const backgroundDataUrl = await loadTemplateDataUrl(theme.templateAsset);
  const subjectAsset = await prepareSubjectAsset(subjectData, theme.subjectBox, useCutoutLayout);
  const svg = renderCollectionCoverSvg({
    backgroundDataUrl,
    theme,
    subjectAsset,
    useCutoutLayout,
  });

  const buffer = await sharp(Buffer.from(svg))
    .webp({
      quality: 92,
      alphaQuality: 94,
      effort: 5,
      nearLossless: true,
    })
    .toBuffer();

  return `data:image/webp;base64,${buffer.toString('base64')}`;
}

async function loadTemplateDataUrl(templateAsset: string) {
  const cached = templateCache.get(templateAsset);
  if (cached) {
    return cached;
  }

  const templatePath = await resolveTemplatePath(templateAsset);
  const fileBuffer = await fs.readFile(templatePath);
  const mimeType = templateAsset.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
  const dataUrl = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
  templateCache.set(templateAsset, dataUrl);
  return dataUrl;
}

async function resolveTemplatePath(templateAsset: string) {
  const normalizedAsset = templateAsset.replace(/^\/+/, '');
  const candidates = [
    path.resolve(APP_CONFIG.appRoot, 'public', normalizedAsset),
    path.resolve(MODULE_DIR, '..', 'public', normalizedAsset),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next location.
    }
  }

  throw new Error(`缺少藏品封面模板资源：${templateAsset}`);
}

function renderCollectionCoverSvg(input: {
  backgroundDataUrl: string;
  theme: ReturnType<typeof getCollectionCoverTheme>;
  subjectAsset: Awaited<ReturnType<typeof prepareSubjectAsset>>;
  useCutoutLayout: boolean;
}) {
  return `
    <svg width="${COVER_WIDTH}" height="${COVER_HEIGHT}" viewBox="0 0 ${COVER_WIDTH} ${COVER_HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="subjectShadow" x="0" y="0" width="${COVER_WIDTH}" height="${COVER_HEIGHT}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
          <feDropShadow dx="0" dy="22" stdDeviation="24" flood-color="rgba(0,0,0,0.34)" />
        </filter>
      </defs>

      <image href="${input.backgroundDataUrl}" x="0" y="0" width="${COVER_WIDTH}" height="${COVER_HEIGHT}" preserveAspectRatio="none" />

      <ellipse cx="${input.subjectAsset.left + input.subjectAsset.width / 2}" cy="${input.subjectAsset.top + input.subjectAsset.height - 12}" rx="${Math.max(90, Math.round(input.subjectAsset.width * 0.32))}" ry="34" fill="rgba(0,0,0,0.22)" />

      ${input.useCutoutLayout ? `
        <g filter="url(#subjectShadow)">
          <image
            href="${input.subjectAsset.dataUrl}"
            x="${input.subjectAsset.left}"
            y="${input.subjectAsset.top}"
            width="${input.subjectAsset.width}"
            height="${input.subjectAsset.height}"
            preserveAspectRatio="xMidYMid meet"
          />
        </g>
      ` : `
        <image
          href="${input.subjectAsset.dataUrl}"
          x="${input.subjectAsset.left}"
          y="${input.subjectAsset.top}"
          width="${input.subjectAsset.width}"
          height="${input.subjectAsset.height}"
          preserveAspectRatio="xMidYMid slice"
        />
      `}

      <rect x="144" y="1040" width="612" height="118" rx="28" fill="rgba(6,8,12,0.08)" />
      <rect x="176" y="1080" width="198" height="10" rx="5" fill="${input.theme.accent}" fill-opacity="0.3" />
      <rect x="176" y="1104" width="132" height="6" rx="3" fill="${input.theme.accentSoft}" fill-opacity="0.22" />
    </svg>
  `;
}

async function prepareSubjectAsset(
  subject: DecodedDataUrl,
  box: { x: number; y: number; width: number; height: number },
  useCutoutLayout: boolean,
) {
  const pipeline = sharp(subject.buffer).rotate().ensureAlpha();
  const prepared = useCutoutLayout
    ? pipeline.trim({ threshold: 8 })
    : pipeline;

  const resizedBuffer = await prepared
    .resize({
      width: box.width,
      height: box.height,
      fit: 'inside',
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();

  const metadata = await sharp(resizedBuffer).metadata();
  const width = metadata.width || box.width;
  const height = metadata.height || box.height;

  return {
    dataUrl: `data:image/png;base64,${resizedBuffer.toString('base64')}`,
    width,
    height,
    left: Math.round(box.x + (box.width - width) / 2),
    top: Math.round(box.y + (box.height - height) / 2),
  };
}

function decodeDataUrl(dataUrl: string): DecodedDataUrl {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    throw new Error('藏品封面合成收到的图片数据无效。');
  }

  return {
    mimeType: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], 'base64'),
  };
}
