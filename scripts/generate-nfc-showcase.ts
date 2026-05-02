import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import { analyzeItemImageTask, generateCollectionCoverTask, generateStickerTask } from '../services/aiService.ts';
import { composeCollectionCoverDataUrl } from '../services/collectionCoverComposer.ts';
import { getManagedUploadInfo } from '../services/storage.ts';
import { applyCuratedGiftCopy } from '../shared/nfcGiftShowcaseCopy.ts';
import { NFC_GIFT_SHOWCASE_BLUEPRINT } from '../shared/nfcGiftShowcaseBlueprint.ts';

interface ItemRow {
  id: string;
  name: string;
  category: string;
  material: string;
  description: string | null;
  story: string | null;
  image_path: string;
  created_at: string;
}

interface GeneratedStickerPayload {
  stickerImageUrl: string;
  dramaText: string;
}

interface GeneratedCoverPayload {
  coverImageUrl: string;
  provider: 'rembg' | 'gemini' | 'fallback';
  usedFallback: boolean;
}

const APP_ROOT = process.env.APP_ROOT ? path.resolve(process.env.APP_ROOT) : process.cwd();
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(APP_ROOT, 'data', 'remuse.db'));
const PUBLIC_OUTPUT_DIR = path.join(APP_ROOT, 'public', 'nfc-showcase');
const OUTPUT_JSON_PATH = path.join(APP_ROOT, 'shared', 'nfcGiftDemos.generated.json');
const PUBLIC_BASE_URL = 'https://gift.remuse.top';
const MANUAL_STICKER_FALLBACKS: Record<string, { imagePath: string; dramaText: string }> = {
  'campus-cup': {
    imagePath: '/uploads/stickers/bd36466d-8936-400d-9eb9-709f3e692e4f/00f249aa-89df-4cc1-9f74-ad8d258f8f9a.webp',
    dramaText: '在冰块和奶茶的碰撞里跳支舞，把所有的摇晃都变成送你的 Q 弹惊喜。喝完这一杯记得把我留下呀，我想换个身份，在你的桌角继续装满明媚的阳光。',
  },
  'midnight-ticket': {
    imagePath: '/uploads/stickers/09fa25d4-13a4-40ed-9b93-9271ffbd62d6/6b6c852f-c26e-426f-b625-497c5daa5b9f.webp',
    dramaText: '我替你收好那些亮晶晶的心事保持缄默，就等着在某个转角被你再次发现，把积攒许久的阳光都变成送你的见面礼。',
  },
  'cassette-ribbon': {
    imagePath: '/uploads/stickers/5700fc67-01ce-4632-99df-2f86035893fa/682a88fe-80f1-4bb3-a7f3-816d02fae1a2.webp',
    dramaText: '别盯着看啦，真相已经被我喝掉，剩下的这一袋子可爱就留给你收藏吧。把那些关于侦探的奇思妙想，都悄悄折进这一阵扑鼻的咖啡香里。',
  },
  'paper-crane': {
    imagePath: '/uploads/stickers/5700fc67-01ce-4632-99df-2f86035893fa/fae4f6bf-d867-405e-bc81-cd137bd92d33.webp',
    dramaText: '我是从旧童话里偷偷溜出来的软绵绵，带了一小口袋的星星，来换你一个抱抱啦。',
  },
  'film-roll': {
    imagePath: '/uploads/stickers/09fa25d4-13a4-40ed-9b93-9271ffbd62d6/121c8dc2-d766-4c6f-9ce4-3f8cd0c7c39f.webp',
    dramaText: '我跨越了大半个地图才住进你的掌心，以后无论是盛满香醇的咖啡还是装下琐碎的小秘密，我都想陪你把平凡的日子过成一场永不落幕的旅行。',
  },
  'concert-band': {
    imagePath: '/uploads/stickers/09fa25d4-13a4-40ed-9b93-9271ffbd62d6/185c9df2-ea15-4501-8f8f-b5170773d4e7.webp',
    dramaText: '我是那一万分之一的勋章，也是你手边最温热的日常，比起安静地被收藏，我更期待和你一起装满生活里的奇思妙想。',
  },
};

async function main() {
  const db = new Database(DB_PATH, { readonly: true });
  const getItemById = db.prepare(`
    SELECT id, name, category, material, description, story, image_path, created_at
    FROM collected_items
    WHERE id = ?
  `);

  const batchTime = new Date();
  const generatedAt = batchTime.toISOString();
  const generatedAtLabel = formatBatchTime(batchTime);
  const requestedSlugs = getRequestedSlugs();
  const blueprints = getBlueprintsToGenerate(requestedSlugs);

  await fs.mkdir(PUBLIC_OUTPUT_DIR, { recursive: true });

  const demos = [];

  for (const blueprint of blueprints) {
    const item = getItemById.get(blueprint.sourceItemId) as ItemRow | undefined;
    if (!item) {
      throw new Error(`缺少 slug="${blueprint.slug}" 对应的藏品：${blueprint.sourceItemId}`);
    }

    const sourceBuffer = await loadImageBuffer(item.image_path);
    const normalized = await normalizeSourceImage(sourceBuffer);
    const sourceImageBase64 = normalized.jpegBuffer.toString('base64');

    const analysis = await analyzeWithFallback(sourceImageBase64, item);
    const cover = await generateCoverWithFallback(sourceImageBase64, analysis.name, analysis.category || item.category || '其他');
    const sticker = await generateStickerWithFallback(blueprint.slug, sourceImageBase64, analysis.name);

    const demoDir = path.join(PUBLIC_OUTPUT_DIR, blueprint.slug);
    await fs.rm(demoDir, { recursive: true, force: true });
    await fs.mkdir(demoDir, { recursive: true });

    const originalOutputPath = path.join(demoDir, 'original.webp');
    const coverOutputPath = path.join(demoDir, 'cover.webp');
    const stickerOutputPath = path.join(demoDir, 'sticker.webp');

    await fs.writeFile(originalOutputPath, normalized.webpBuffer);
    await writeDataUrlAsWebp(cover.coverImageUrl, coverOutputPath);
    await writeDataUrlAsWebp(sticker.stickerImageUrl, stickerOutputPath);

    const sourceStory = firstNonEmpty(item.story, item.description, analysis.story, '这件旧物被重新写进了一次可以公开展示的 NFC 好物体验。');
    const tags = uniqueStrings([
      ...analysis.tags,
      item.category,
      analysis.category,
      item.material,
    ]).slice(0, 5);
    const publicUrl = `${PUBLIC_BASE_URL}/${blueprint.slug}`;

    demos.push(applyCuratedGiftCopy({
      slug: blueprint.slug,
      capsuleLabel: blueprint.capsuleLabel,
      archiveCode: blueprint.archiveCode,
      publicUrl,
      title: analysis.name,
      subtitle: analysis.story,
      originalImageUrl: `/nfc-showcase/${blueprint.slug}/original.webp`,
      coverImageUrl: `/nfc-showcase/${blueprint.slug}/cover.webp`,
      stickerImageUrl: `/nfc-showcase/${blueprint.slug}/sticker.webp`,
      imageAlt: `${analysis.name} 的真实原图`,
      coverAlt: `${analysis.name} 的 AI 展示封面`,
      stickerAlt: `${analysis.name} 的 AI 贴纸图`,
      stickerCaption: sticker.dramaText,
      sourceItemName: item.name,
      sourceCategory: firstNonEmpty(item.category, analysis.category, '其他'),
      sourceMaterial: firstNonEmpty(item.material, analysis.material, '综合材质'),
      sourceStory,
      analyzedName: analysis.name,
      analyzedCategory: firstNonEmpty(analysis.category, item.category, '其他'),
      analyzedMaterial: firstNonEmpty(analysis.material, item.material, '综合材质'),
      analyzedStory: analysis.story,
      tags,
      highlights: [],
      processTimeline: [],
      palette: blueprint.palette,
      generatedAt,
      generatedAtLabel,
      coverProvider: cover.provider,
      coverUsedFallback: cover.usedFallback,
    }));

    console.log(`[nfc] 已导出 ${blueprint.slug} -> ${analysis.name}`);
  }

  const finalDemos = requestedSlugs.length > 0
    ? await mergeWithExistingDemos(demos)
    : demos;

  await fs.writeFile(OUTPUT_JSON_PATH, `${JSON.stringify(finalDemos, null, 2)}\n`, 'utf8');
  console.log(`[nfc] 展示数据已写入 ${path.relative(APP_ROOT, OUTPUT_JSON_PATH)}`);
}

function getRequestedSlugs() {
  return uniqueStrings(
    `${process.env.NFC_SHOWCASE_SLUGS || ''}`
      .split(',')
      .map((slug) => slug.trim()),
  );
}

function getBlueprintsToGenerate(requestedSlugs: string[]) {
  if (requestedSlugs.length === 0) {
    return NFC_GIFT_SHOWCASE_BLUEPRINT;
  }

  const selected = NFC_GIFT_SHOWCASE_BLUEPRINT.filter((blueprint) => requestedSlugs.includes(blueprint.slug));
  const missing = requestedSlugs.filter((slug) => !selected.some((blueprint) => blueprint.slug === slug));

  if (missing.length > 0) {
    throw new Error(`存在未知的展页 slug：${missing.join(', ')}`);
  }

  return selected;
}

async function mergeWithExistingDemos(generatedDemos: any[]) {
  let existingRaw = '';

  try {
    existingRaw = await fs.readFile(OUTPUT_JSON_PATH, 'utf8');
  } catch (error) {
    throw new Error(`执行局部展页生成前，必须先存在 ${path.relative(APP_ROOT, OUTPUT_JSON_PATH)}：${formatError(error)}`);
  }

  const existingDemos = JSON.parse(existingRaw) as any[];
  const mergedBySlug = new Map(existingDemos.map((demo) => [demo.slug, demo]));

  for (const demo of generatedDemos) {
    mergedBySlug.set(demo.slug, demo);
  }

  return NFC_GIFT_SHOWCASE_BLUEPRINT
    .map((blueprint) => mergedBySlug.get(blueprint.slug))
    .filter(Boolean);
}

async function loadImageBuffer(imagePath: string) {
  const managed = getManagedUploadInfo(imagePath);
  if (managed) {
    return fs.readFile(managed.absolutePath);
  }

  if (/^https?:\/\//i.test(imagePath)) {
    const response = await fetch(imagePath);
    if (!response.ok) {
      throw new Error(`拉取远程图片失败：${imagePath}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  throw new Error(`不支持的图片路径：${imagePath}`);
}

async function normalizeSourceImage(sourceBuffer: Buffer) {
  const base = sharp(sourceBuffer).rotate();
  const webpBuffer = await base
    .clone()
    .resize({
      width: 1440,
      height: 1440,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({
      quality: 88,
      alphaQuality: 92,
      effort: 4,
      nearLossless: true,
    })
    .toBuffer();

  const jpegBuffer = await base
    .clone()
    .resize({
      width: 1440,
      height: 1440,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  return {
    webpBuffer,
    jpegBuffer,
  };
}

async function analyzeWithFallback(base64Image: string, item: ItemRow) {
  try {
    return await analyzeItemImageTask(base64Image);
  } catch (error) {
    console.warn(`[nfc] 藏品分析降级回退 ${item.id}：${formatError(error)}`);
    return {
      name: item.name || '未命名藏品',
      category: item.category || '其他',
      material: item.material || '综合材质',
      story: firstNonEmpty(
        item.story,
        item.description,
        '这件旧物被重新整理成了一次可公开展示的 NFC 好物档案。',
      ),
      tags: uniqueStrings([item.category, item.material]).slice(0, 5),
    };
  }
}

async function generateCoverWithFallback(base64Image: string, itemName: string, hallId: string): Promise<GeneratedCoverPayload> {
  try {
    return await generateCollectionCoverTask(base64Image, itemName, hallId);
  } catch (error) {
    console.warn(`[nfc] 封面生成降级回退 ${itemName}：${formatError(error)}`);
    return {
      coverImageUrl: await composeCollectionCoverDataUrl({
        hallId,
        subjectDataUrl: `data:image/jpeg;base64,${base64Image}`,
        useCutoutLayout: false,
      }),
      provider: 'fallback',
      usedFallback: true,
    };
  }
}

async function generateStickerWithFallback(slug: string, base64Image: string, itemName: string): Promise<GeneratedStickerPayload> {
  try {
    return await generateStickerTask(base64Image, itemName);
  } catch (error) {
    console.warn(`[nfc] 贴纸生成降级回退 ${itemName}：${formatError(error)}`);
    const manualFallback = MANUAL_STICKER_FALLBACKS[slug];
    if (manualFallback) {
      const buffer = await loadImageBuffer(manualFallback.imagePath);
      return {
        stickerImageUrl: `data:image/webp;base64,${buffer.toString('base64')}`,
        dramaText: manualFallback.dramaText,
      };
    }

    return {
      stickerImageUrl: `data:image/jpeg;base64,${base64Image}`,
      dramaText: `${itemName} 已经被重新整理成了一张可随时打开的 NFC 好物贴纸。`,
    };
  }
}

async function writeDataUrlAsWebp(dataUrl: string, outputPath: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    throw new Error(`无效的 Data URL，无法写入 ${outputPath}`);
  }

  const buffer = Buffer.from(match[2], 'base64');
  await sharp(buffer)
    .rotate()
    .webp({
      quality: 90,
      alphaQuality: 92,
      effort: 4,
      nearLossless: true,
    })
    .toFile(outputPath);
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

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = `${value || ''}`.trim();
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

function formatBatchTime(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  }).format(date);
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error) => {
  console.error('[nfc] 生成 NFC 展示数据失败', error);
  process.exitCode = 1;
});
