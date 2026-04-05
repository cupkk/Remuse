import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import {
  createTransformationGuide,
  getTransformationGuideById,
  getTransformationGuidesByUser,
} from '../services/database.ts';
import {
  ManagedUploadError,
  saveBase64Image,
  toClientAssetUrl,
} from '../services/storage.ts';

const router = Router();

const guideSourceItemSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().max(120).optional(),
  material: z.string().trim().max(120).optional(),
  description: z.string().trim().max(600).optional(),
  story: z.string().trim().max(2000).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  imageUrl: z.string().trim().max(2048).optional(),
  coverImageUrl: z.string().trim().max(2048).optional(),
});

const createTransformationGuideSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(600),
  concept: z.string().trim().min(1).max(2000),
  materials: z.array(z.string().trim().min(1).max(160)).max(20),
  steps: z.array(z.string().trim().min(1).max(800)).min(1).max(20),
  tips: z.array(z.string().trim().min(1).max(400)).max(20).optional(),
  imageBase64: z.string().min(1, '\u8bf7\u4e0a\u4f20\u6539\u9020\u6307\u5357\u5c01\u9762\u56fe\u3002'),
  itemIds: z.array(z.string().trim().min(1).max(120)).min(1).max(24),
  sourceItems: z.array(guideSourceItemSchema).min(1).max(24),
  dateCreated: z.string().optional(),
});

router.get('/', (req: Request, res: Response) => {
  try {
    const guides = getTransformationGuidesByUser(req.userId!);
    res.json({
      guides: guides.map((guide) => resolveGuideImageUrl(guide)),
    });
  } catch (error) {
    console.error('\u52a0\u8f7d\u6539\u9020\u6307\u5357\u5217\u8868\u5931\u8d25\uff1a', error);
    res.status(500).json({ error: '\u52a0\u8f7d\u6539\u9020\u6307\u5357\u5217\u8868\u5931\u8d25\u3002' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = createTransformationGuideSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || '请求体参数无效。' });
      return;
    }

    const {
      title,
      summary,
      concept,
      materials,
      steps,
      tips,
      imageBase64,
      itemIds,
      sourceItems,
      dateCreated,
    } = parsed.data;

    const id = uuidv4();
    const imagePath = await saveBase64Image(imageBase64, 'transformation-guides', req.userId!, id);
    const guide = createTransformationGuide({
      id,
      user_id: req.userId!,
      title,
      summary,
      concept,
      materials,
      steps,
      tips: tips || [],
      itemIds,
      sourceItems: sourceItems.map((item) => ({
        ...item,
        category: item.category || '',
        material: item.material || '',
        description: item.description || '',
        story: item.story || '',
        tags: item.tags || [],
      })),
      image_path: imagePath,
      date_created: dateCreated || new Date().toISOString(),
    });

    if (!guide) {
      res.status(500).json({ error: '\u4fdd\u5b58\u6539\u9020\u6307\u5357\u5931\u8d25\u3002' });
      return;
    }

    const savedGuide = getTransformationGuideById(id, req.userId!);
    res.json({
      guide: resolveGuideImageUrl(savedGuide || guide),
    });
  } catch (error) {
    handleRouteError(res, error, '\u4fdd\u5b58\u6539\u9020\u6307\u5357\u5931\u8d25\u3002');
  }
});

function resolveGuideImageUrl<T extends { image_path?: string; imageUrl?: string }>(guide: T | null | undefined) {
  if (!guide) {
    return guide;
  }

  return {
    ...guide,
    imageUrl: toClientAssetUrl(guide.image_path || guide.imageUrl || ''),
  };
}

function handleRouteError(res: Response, error: unknown, fallbackMessage: string) {
  console.error(fallbackMessage, error);

  if (error instanceof ManagedUploadError) {
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }

  res.status(500).json({ error: fallbackMessage });
}

export default router;
