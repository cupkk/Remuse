import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import {
  createHall,
  createSystemHallOverride,
  deleteHall,
  getHallsByUser,
  getHallRecordById,
  getHallRecordBySystemId,
  reassignItemsHall,
  updateHall,
} from '../services/database.ts';
import { getDefaultHallById, mergeHalls } from '../services/halls.ts';
import { deleteManagedUpload, ManagedUploadError, saveBase64Image, toClientAssetUrl } from '../services/storage.ts';

const router = Router();
const FALLBACK_HALL_ID = '其他';

const createHallSchema = z.object({
  id: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(1, 'Hall name is required').max(100),
  imageBase64: z.string().min(1).optional(),
});

const updateHallSchema = z.object({
  name: z.string().trim().min(1, 'Hall name is required').max(100),
  imageBase64: z.string().min(1).optional(),
});

router.get('/', (req: Request, res: Response) => {
  try {
    const halls = getResolvedHallsForUser(req.userId!);
    res.json({ halls: halls.map((hall) => resolveHallImage(hall)) });
  } catch (error) {
    console.error('\u52a0\u8f7d\u5c55\u9986\u5217\u8868\u5931\u8d25\uff1a', error);
    res.status(500).json({ error: '加载展馆失败。' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = createHallSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || '请求体参数无效。' });
      return;
    }

    const { id: requestedId, name, imageBase64 } = parsed.data;
    const id = requestedId?.trim() || uuidv4();

    const imagePath = imageBase64
      ? await saveBase64Image(imageBase64, 'halls', req.userId!, id)
      : '';

    const hall = createHall({
      id,
      user_id: req.userId!,
      name: name.trim(),
      image_path: imagePath,
    });

    res.json({ hall: resolveHallImage(hall) });
  } catch (error) {
    handleRouteError(res, error, '创建展馆失败。');
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const parsed = updateHallSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || '请求体参数无效。' });
      return;
    }

    const publicHallId = req.params.id as string;
    const defaultHall = getDefaultHallById(publicHallId);
    const customHallRecord = getHallRecordById(publicHallId, req.userId!);
    const overrideRecord = getHallRecordBySystemId(publicHallId, req.userId!);
    const name = parsed.data.name.trim();
    if (customHallRecord && !customHallRecord.system_hall_id) {
      let imagePath = customHallRecord.image_path || '';
      if (parsed.data.imageBase64) {
        imagePath = await saveBase64Image(parsed.data.imageBase64, 'halls', req.userId!, customHallRecord.id);
        if (customHallRecord.image_path && customHallRecord.image_path !== imagePath) {
          deleteManagedUpload(customHallRecord.image_path);
        }
      }

      const hall = updateHall({
        id: customHallRecord.id,
        user_id: req.userId!,
        name,
        image_path: imagePath,
      });

      if (!hall) {
        res.status(404).json({ error: '未找到该展馆。' });
        return;
      }

      reassignItemsHall(req.userId!, publicHallId, publicHallId, name);
      res.json({ hall: resolveHallImage(hall) });
      return;
    }

    if (!defaultHall) {
      res.status(404).json({ error: '未找到该展馆。' });
      return;
    }

    let imagePath = overrideRecord?.image_path || '';
    if (parsed.data.imageBase64) {
      const entityId = overrideRecord?.id || uuidv4();
      imagePath = await saveBase64Image(parsed.data.imageBase64, 'halls', req.userId!, entityId);
      if (overrideRecord?.image_path && overrideRecord.image_path !== imagePath) {
        deleteManagedUpload(overrideRecord.image_path);
      }
    }

    if (overrideRecord) {
      await updateHall({
        id: overrideRecord.id,
        user_id: req.userId!,
        name,
        image_path: imagePath,
        is_hidden: false,
      });
    } else {
      await createSystemHallOverride({
        id: uuidv4(),
        user_id: req.userId!,
        system_hall_id: publicHallId,
        name,
        image_path: imagePath,
      });
    }

    reassignItemsHall(req.userId!, publicHallId, publicHallId, name);

    const hall = getResolvedHallForUser(req.userId!, publicHallId);
    if (!hall) {
      res.status(404).json({ error: '未找到该展馆。' });
      return;
    }

    res.json({ hall: resolveHallImage(hall) });
  } catch (error) {
    handleRouteError(res, error, '更新展馆失败。');
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const publicHallId = req.params.id as string;
    if (publicHallId === FALLBACK_HALL_ID) {
      res.status(400).json({ error: 'Fallback hall cannot be deleted' });
      return;
    }

    const customHallRecord = getHallRecordById(publicHallId, req.userId!);
    if (customHallRecord && !customHallRecord.system_hall_id) {
      const result = deleteHall(customHallRecord.id, req.userId!);
      if (result.changes === 0) {
        res.status(404).json({ error: '未找到该展馆。' });
        return;
      }

      reassignItemsHall(req.userId!, publicHallId, FALLBACK_HALL_ID, getFallbackHallName(req.userId!));

      if (customHallRecord.image_path) {
        deleteManagedUpload(customHallRecord.image_path);
      }

      res.json({ success: true });
      return;
    }

    const defaultHall = getDefaultHallById(publicHallId);
    if (!defaultHall) {
      res.status(404).json({ error: '未找到该展馆。' });
      return;
    }

    const overrideRecord = getHallRecordBySystemId(publicHallId, req.userId!);
    if (overrideRecord) {
      updateHall({
        id: overrideRecord.id,
        user_id: req.userId!,
        name: overrideRecord.name,
        image_path: overrideRecord.image_path,
        is_hidden: true,
      });
    } else {
      createSystemHallOverride({
        id: uuidv4(),
        user_id: req.userId!,
        system_hall_id: publicHallId,
        name: defaultHall.name,
        image_path: '',
        is_hidden: true,
      });
    }

    reassignItemsHall(req.userId!, publicHallId, FALLBACK_HALL_ID, getFallbackHallName(req.userId!));

    res.json({ success: true });
  } catch (error) {
    console.error('\u5220\u9664\u5c55\u9986\u5931\u8d25\uff1a', error);
    res.status(500).json({ error: '删除展馆失败。' });
  }
});

function resolveHallImage<T extends { imageUrl?: string }>(hall: T) {
  return {
    ...hall,
    imageUrl: toClientAssetUrl(hall.imageUrl || ''),
  };
}

function getResolvedHallsForUser(userId: string) {
  return mergeHalls(getHallsByUser(userId));
}

function getResolvedHallForUser(userId: string, hallId: string) {
  return getResolvedHallsForUser(userId).find((hall) => hall.id === hallId) || null;
}

function getFallbackHallName(userId: string) {
  return getResolvedHallForUser(userId, FALLBACK_HALL_ID)?.name || FALLBACK_HALL_ID;
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
