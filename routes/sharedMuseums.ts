import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import {
  addItemToSharedMuseum,
  createSharedMuseum,
  getItemById,
  getSharedMuseumItemById,
  getSharedMuseumById,
  getSharedMuseumByInviteCode,
  getSharedMuseumsByUser,
  joinSharedMuseumByInviteCode,
  removeSharedMuseumMember,
  removeSharedMuseumItem,
  touchSharedMuseumActivity,
  updateSharedMuseum,
  updateSharedMuseumItem,
  upsertSharedMuseumMonthlyReport,
} from '../services/database.ts';
import { toClientAssetUrl } from '../services/storage.ts';

const router = Router();

const SHARED_MUSEUM_MESSAGE_NAME_REQUIRED = '\u8bf7\u8f93\u5165\u5171\u5efa\u9986\u540d\u79f0\u3002';
const SHARED_MUSEUM_MESSAGE_INVALID_BODY = '\u8bf7\u6c42\u53c2\u6570\u65e0\u6548\u3002';
const SHARED_MUSEUM_MESSAGE_NOT_FOUND = '\u5171\u5efa\u9986\u4e0d\u5b58\u5728\u3002';
const SHARED_MUSEUM_MESSAGE_ID_REQUIRED = '\u5171\u5efa\u9986 ID \u4e0d\u80fd\u4e3a\u7a7a\u3002';
const SHARED_MUSEUM_MESSAGE_ONLY_CREATOR_UPDATE = '\u53ea\u6709\u521b\u5efa\u8005\u53ef\u4ee5\u4fee\u6539\u5171\u5efa\u9986\u8bbe\u7f6e\u3002';
const SHARED_MUSEUM_MESSAGE_ONLY_CREATOR_RESET = '\u53ea\u6709\u521b\u5efa\u8005\u53ef\u4ee5\u91cd\u7f6e\u9080\u8bf7\u7801\u3002';
const SHARED_MUSEUM_MESSAGE_ONLY_CREATOR_REVOKE = '\u53ea\u6709\u521b\u5efa\u8005\u53ef\u4ee5\u4f5c\u5e9f\u9080\u8bf7\u3002';
const SHARED_MUSEUM_MESSAGE_ONLY_CREATOR_STATUS = '\u53ea\u6709\u521b\u5efa\u8005\u53ef\u4ee5\u4fee\u6539\u5171\u5efa\u9986\u72b6\u6001\u3002';
const SHARED_MUSEUM_MESSAGE_NO_NEW_MEMBERS = '\u5f53\u524d\u5171\u5efa\u9986\u5df2\u5173\u95ed\u65b0\u6210\u5458\u52a0\u5165\u3002';
const SHARED_MUSEUM_MESSAGE_FULL = '\u5f53\u524d\u5171\u5efa\u9986\u5df2\u8fbe\u5230\u6210\u5458\u4e0a\u9650\u3002';
const SHARED_MUSEUM_MESSAGE_UPDATE_LOCKED = '\u5df2\u5f52\u6863\u6216\u5df2\u7ed3\u675f\u7684\u5171\u5efa\u9986\u4e0d\u80fd\u518d\u4fee\u6539\u8bbe\u7f6e\u3002';
const SHARED_MUSEUM_MESSAGE_INVITE_LOCKED = '\u5df2\u5f52\u6863\u6216\u5df2\u7ed3\u675f\u7684\u5171\u5efa\u9986\u4e0d\u80fd\u518d\u5f00\u653e\u9080\u8bf7\u3002';
const SHARED_MUSEUM_MESSAGE_MEMBER_NOT_FOUND = '\u5171\u5efa\u9986\u6210\u5458\u4e0d\u5b58\u5728\u3002';
const SHARED_MUSEUM_MESSAGE_CREATOR_CANNOT_LEAVE = '\u521b\u5efa\u8005\u4e0d\u80fd\u76f4\u63a5\u9000\u51fa\uff0c\u8bf7\u5148\u5f52\u6863\u6216\u7ed3\u675f\u5171\u5efa\u5173\u7cfb\u3002';
const SHARED_MUSEUM_MESSAGE_READ_ONLY = '\u5f53\u524d\u5171\u5efa\u9986\u5df2\u53d8\u4e3a\u53ea\u8bfb\u72b6\u6001\u3002';
const SHARED_MUSEUM_MESSAGE_SOURCE_ITEM_NOT_FOUND = '\u8981\u6dfb\u52a0\u7684\u85cf\u54c1\u4e0d\u5b58\u5728\u3002';
const SHARED_MUSEUM_MESSAGE_ITEM_NOT_FOUND = '\u5171\u5efa\u9986\u85cf\u54c1\u4e0d\u5b58\u5728\u3002';
const SHARED_MUSEUM_MESSAGE_LOAD_FAILED = '\u52a0\u8f7d\u5171\u5efa\u9986\u5217\u8868\u5931\u8d25\u3002';
const SHARED_MUSEUM_MESSAGE_CREATE_FAILED = '\u521b\u5efa\u5171\u5efa\u9986\u5931\u8d25\u3002';
const SHARED_MUSEUM_MESSAGE_JOIN_FAILED = '\u52a0\u5165\u5171\u5efa\u9986\u5931\u8d25\u3002';
const SHARED_MUSEUM_MESSAGE_DETAIL_FAILED = '\u52a0\u8f7d\u5171\u5efa\u9986\u8be6\u60c5\u5931\u8d25\u3002';
const SHARED_MUSEUM_MESSAGE_UPDATE_FAILED = '\u66f4\u65b0\u5171\u5efa\u9986\u5931\u8d25\u3002';
const SHARED_MUSEUM_MESSAGE_RESET_INVITE_FAILED = '\u91cd\u7f6e\u5171\u5efa\u9986\u9080\u8bf7\u7801\u5931\u8d25\u3002';
const SHARED_MUSEUM_MESSAGE_REVOKE_INVITE_FAILED = '\u4f5c\u5e9f\u5171\u5efa\u9986\u9080\u8bf7\u7801\u5931\u8d25\u3002';
const SHARED_MUSEUM_MESSAGE_LEAVE_FAILED = '\u9000\u51fa\u5171\u5efa\u9986\u5931\u8d25\u3002';
const SHARED_MUSEUM_MESSAGE_STATUS_FAILED = '\u66f4\u65b0\u5171\u5efa\u9986\u72b6\u6001\u5931\u8d25\u3002';
const SHARED_MUSEUM_MESSAGE_REPORT_FAILED = '\u4fdd\u5b58\u5171\u5efa\u9986\u62a5\u544a\u5931\u8d25\u3002';
const SHARED_MUSEUM_MESSAGE_ADD_ITEM_FAILED = '\u6dfb\u52a0\u85cf\u54c1\u5230\u5171\u5efa\u9986\u5931\u8d25\u3002';
const SHARED_MUSEUM_MESSAGE_UPDATE_ITEM_FAILED = '\u66f4\u65b0\u5171\u5efa\u9986\u85cf\u54c1\u5931\u8d25\u3002';
const SHARED_MUSEUM_MESSAGE_REMOVE_ITEM_FAILED = '\u79fb\u9664\u5171\u5efa\u9986\u85cf\u54c1\u5931\u8d25\u3002';
const createSharedMuseumSchema = z.object({
  name: z.string().trim().min(1, SHARED_MUSEUM_MESSAGE_NAME_REQUIRED).max(80),
  description: z.string().trim().max(280).optional(),
  anniversaryDate: z.string().trim().max(80).optional(),
  theme: z.string().trim().max(80).optional(),
});

const joinSharedMuseumSchema = z.object({
  inviteCode: z.string().trim().min(4).max(32),
});

const addSharedMuseumItemSchema = z.object({
  sourceItemId: z.string().trim().min(1).max(120),
  sharedNote: z.string().trim().max(1000).optional(),
  relationLabel: z.string().trim().max(120).optional(),
});

const updateSharedMuseumSchema = z.object({
  anniversaryDate: z.string().trim().max(80).optional(),
  quietMode: z.boolean().optional(),
});

const updateSharedMuseumStatusSchema = z.object({
  status: z.enum(['archived', 'ended']),
});

const updateSharedMuseumItemSchema = z.object({
  sharedNote: z.string().trim().max(1000).optional(),
  relationLabel: z.string().trim().max(120).optional(),
});

const sharedMuseumReportTimelineItemSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(160),
  dateLabel: z.string().trim().max(80),
  sharedNote: z.string().trim().max(1000),
  relationLabel: z.string().trim().max(120),
  coverImageUrl: z.string().trim().max(2000).optional(),
  imageUrl: z.string().trim().max(2000).optional(),
});

const saveSharedMuseumReportSchema = z.object({
  monthKey: z.string().trim().min(1).max(20),
  monthLabel: z.string().trim().min(1).max(80),
  itemCount: z.number().int().min(0).max(999),
  categoryCount: z.number().int().min(0).max(999),
  topCategories: z.array(z.string().trim().min(1).max(80)).max(12),
  topTags: z.array(z.string().trim().min(1).max(80)).max(12),
  relationLabels: z.array(z.string().trim().min(1).max(120)).max(12),
  highlights: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
  narrative: z.string().trim().min(1).max(4000),
  timeline: z.array(sharedMuseumReportTimelineItemSchema).max(60),
  milestoneMessage: z.string().trim().max(600).nullable().optional(),
});

router.get('/', (req: Request, res: Response) => {
  try {
    const museums = getSharedMuseumsByUser(req.userId!);
    res.json({
      museums: museums.map(resolveSharedMuseumAssets),
    });
  } catch (error) {
    console.error('\u52a0\u8f7d\u5171\u5efa\u9986\u5217\u8868\u5931\u8d25\uff1a', error);
    res.status(500).json({ error: SHARED_MUSEUM_MESSAGE_LOAD_FAILED });
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const parsed = createSharedMuseumSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || SHARED_MUSEUM_MESSAGE_INVALID_BODY });
      return;
    }

    const museum = createSharedMuseum({
      id: uuidv4(),
      owner_user_id: req.userId!,
      owner_member_id: uuidv4(),
      name: parsed.data.name,
      description: parsed.data.description || '',
      anniversary_date: parsed.data.anniversaryDate || '',
      theme: parsed.data.theme || 'shared-memory',
      invite_code: generateInviteCode(),
      status: 'active',
      quiet_mode: false,
    });

    res.json({
      museum: resolveSharedMuseumAssets(museum),
    });
  } catch (error) {
    console.error('\u521b\u5efa\u5171\u5efa\u9986\u5931\u8d25\uff1a', error);
    res.status(500).json({ error: SHARED_MUSEUM_MESSAGE_CREATE_FAILED });
  }
});

router.post('/join', (req: Request, res: Response) => {
  try {
    const parsed = joinSharedMuseumSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || SHARED_MUSEUM_MESSAGE_INVALID_BODY });
      return;
    }

    const existing = getSharedMuseumByInviteCode(parsed.data.inviteCode);
    if (!existing) {
      res.status(404).json({ error: SHARED_MUSEUM_MESSAGE_NOT_FOUND });
      return;
    }

    if (!existing.inviteEnabled || ['archived', 'ended'].includes(existing.status)) {
      res.status(409).json({ error: SHARED_MUSEUM_MESSAGE_NO_NEW_MEMBERS });
      return;
    }

    const alreadyJoined = existing.members.some((member) => member.userId === req.userId);
    if (alreadyJoined) {
      res.json({
        museum: resolveSharedMuseumAssets(existing),
        alreadyJoined: true,
      });
      return;
    }

    if (existing.members.length >= 2) {
      res.status(409).json({ error: SHARED_MUSEUM_MESSAGE_FULL });
      return;
    }

    const museum = joinSharedMuseumByInviteCode({
      museum_id: existing.id,
      user_id: req.userId!,
      member_id: uuidv4(),
    });

    res.json({
      museum: resolveSharedMuseumAssets(museum),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'SHARED_MUSEUM_FULL') {
      res.status(409).json({ error: SHARED_MUSEUM_MESSAGE_FULL });
      return;
    }
    console.error('\u52a0\u5165\u5171\u5efa\u9986\u5931\u8d25\uff1a', error);
    res.status(500).json({ error: SHARED_MUSEUM_MESSAGE_JOIN_FAILED });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const museum = getSharedMuseumById(String(req.params.id || ''), req.userId!);
    if (!museum) {
      res.status(404).json({ error: SHARED_MUSEUM_MESSAGE_NOT_FOUND });
      return;
    }

    res.json({
      museum: resolveSharedMuseumAssets(museum),
    });
  } catch (error) {
    console.error('\u52a0\u8f7d\u5171\u5efa\u9986\u8be6\u60c5\u5931\u8d25\uff1a', error);
    res.status(500).json({ error: SHARED_MUSEUM_MESSAGE_DETAIL_FAILED });
  }
});

router.patch('/:id', (req: Request, res: Response) => {
  try {
    const museumId = String(req.params.id || '').trim();
    if (!museumId) {
      res.status(400).json({ error: SHARED_MUSEUM_MESSAGE_ID_REQUIRED });
      return;
    }

    const museum = getSharedMuseumById(museumId, req.userId!);
    if (!museum) {
      res.status(404).json({ error: SHARED_MUSEUM_MESSAGE_NOT_FOUND });
      return;
    }

    const parsed = updateSharedMuseumSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || SHARED_MUSEUM_MESSAGE_INVALID_BODY });
      return;
    }

    const currentUserMember = museum.members.find((member) => member.userId === req.userId);
    if (!currentUserMember || currentUserMember.role !== 'creator') {
      res.status(403).json({ error: SHARED_MUSEUM_MESSAGE_ONLY_CREATOR_UPDATE });
      return;
    }

    if (['archived', 'ended'].includes(museum.status)) {
      res.status(409).json({ error: SHARED_MUSEUM_MESSAGE_UPDATE_LOCKED });
      return;
    }

    const nextQuietMode = parsed.data.quietMode ?? museum.quietMode ?? false;
    const nextStatus = nextQuietMode ? 'quiet' : 'active';

    const updatedMuseum = updateSharedMuseum({
      id: museum.id,
      owner_user_id: req.userId!,
      name: museum.name,
      description: museum.description || '',
      invite_code: museum.inviteCode,
      invite_enabled: museum.inviteEnabled,
      status: nextStatus,
      anniversary_date: parsed.data.anniversaryDate ?? museum.anniversaryDate ?? '',
      theme: museum.theme || 'shared-memory',
      quiet_mode: nextQuietMode,
      cover_image_path: getStoredMuseumCoverPath(museum),
    });

    res.json({
      museum: resolveSharedMuseumAssets(updatedMuseum),
    });
  } catch (error) {
    console.error('\u66f4\u65b0\u5171\u5efa\u9986\u5931\u8d25\uff1a', error);
    res.status(500).json({ error: SHARED_MUSEUM_MESSAGE_UPDATE_FAILED });
  }
});

router.post('/:id/invite/reset', (req: Request, res: Response) => {
  try {
    const museumId = String(req.params.id || '').trim();
    if (!museumId) {
      res.status(400).json({ error: SHARED_MUSEUM_MESSAGE_ID_REQUIRED });
      return;
    }

    const museum = getSharedMuseumById(museumId, req.userId!);
    if (!museum) {
      res.status(404).json({ error: SHARED_MUSEUM_MESSAGE_NOT_FOUND });
      return;
    }

    const currentUserMember = museum.members.find((member) => member.userId === req.userId);
    if (!currentUserMember || currentUserMember.role !== 'creator') {
      res.status(403).json({ error: SHARED_MUSEUM_MESSAGE_ONLY_CREATOR_RESET });
      return;
    }

    if (['archived', 'ended'].includes(museum.status)) {
      res.status(409).json({ error: SHARED_MUSEUM_MESSAGE_INVITE_LOCKED });
      return;
    }

    const updatedMuseum = updateSharedMuseum({
      id: museum.id,
      owner_user_id: req.userId!,
      name: museum.name,
      description: museum.description || '',
      invite_code: generateInviteCode(),
      invite_enabled: true,
      status: museum.status,
      anniversary_date: museum.anniversaryDate || '',
      theme: museum.theme || 'shared-memory',
      quiet_mode: museum.quietMode ?? false,
      cover_image_path: getStoredMuseumCoverPath(museum),
    });

    res.json({
      museum: resolveSharedMuseumAssets(updatedMuseum),
    });
  } catch (error) {
    console.error('\u91cd\u7f6e\u5171\u5efa\u9986\u9080\u8bf7\u7801\u5931\u8d25\uff1a', error);
    res.status(500).json({ error: SHARED_MUSEUM_MESSAGE_RESET_INVITE_FAILED });
  }
});

router.post('/:id/invite/revoke', (req: Request, res: Response) => {
  try {
    const museumId = String(req.params.id || '').trim();
    if (!museumId) {
      res.status(400).json({ error: SHARED_MUSEUM_MESSAGE_ID_REQUIRED });
      return;
    }

    const museum = getSharedMuseumById(museumId, req.userId!);
    if (!museum) {
      res.status(404).json({ error: SHARED_MUSEUM_MESSAGE_NOT_FOUND });
      return;
    }

    const currentUserMember = museum.members.find((member) => member.userId === req.userId);
    if (!currentUserMember || currentUserMember.role !== 'creator') {
      res.status(403).json({ error: SHARED_MUSEUM_MESSAGE_ONLY_CREATOR_REVOKE });
      return;
    }

    const updatedMuseum = updateSharedMuseum({
      id: museum.id,
      owner_user_id: req.userId!,
      name: museum.name,
      description: museum.description || '',
      invite_code: museum.inviteCode,
      invite_enabled: false,
      status: museum.status,
      anniversary_date: museum.anniversaryDate || '',
      theme: museum.theme || 'shared-memory',
      quiet_mode: museum.quietMode ?? false,
      cover_image_path: getStoredMuseumCoverPath(museum),
    });

    res.json({
      museum: resolveSharedMuseumAssets(updatedMuseum),
    });
  } catch (error) {
    console.error('\u4f5c\u5e9f\u5171\u5efa\u9986\u9080\u8bf7\u7801\u5931\u8d25\uff1a', error);
    res.status(500).json({ error: SHARED_MUSEUM_MESSAGE_REVOKE_INVITE_FAILED });
  }
});

router.post('/:id/leave', (req: Request, res: Response) => {
  try {
    const museumId = String(req.params.id || '').trim();
    if (!museumId) {
      res.status(400).json({ error: SHARED_MUSEUM_MESSAGE_ID_REQUIRED });
      return;
    }

    const museum = getSharedMuseumById(museumId, req.userId!);
    if (!museum) {
      res.status(404).json({ error: SHARED_MUSEUM_MESSAGE_NOT_FOUND });
      return;
    }

    const currentUserMember = museum.members.find((member) => member.userId === req.userId);
    if (!currentUserMember) {
      res.status(404).json({ error: SHARED_MUSEUM_MESSAGE_MEMBER_NOT_FOUND });
      return;
    }

    if (currentUserMember.role === 'creator') {
      res.status(409).json({ error: SHARED_MUSEUM_MESSAGE_CREATOR_CANNOT_LEAVE });
      return;
    }

    const result = removeSharedMuseumMember(museumId, req.userId!);
    if (result.changes === 0) {
      res.status(404).json({ error: SHARED_MUSEUM_MESSAGE_MEMBER_NOT_FOUND });
      return;
    }

    touchSharedMuseumActivity(museumId);
    res.json({ success: true });
  } catch (error) {
    console.error('\u9000\u51fa\u5171\u5efa\u9986\u5931\u8d25\uff1a', error);
    res.status(500).json({ error: SHARED_MUSEUM_MESSAGE_LEAVE_FAILED });
  }
});

router.post('/:id/status', (req: Request, res: Response) => {
  try {
    const museumId = String(req.params.id || '').trim();
    if (!museumId) {
      res.status(400).json({ error: SHARED_MUSEUM_MESSAGE_ID_REQUIRED });
      return;
    }

    const museum = getSharedMuseumById(museumId, req.userId!);
    if (!museum) {
      res.status(404).json({ error: SHARED_MUSEUM_MESSAGE_NOT_FOUND });
      return;
    }

    const currentUserMember = museum.members.find((member) => member.userId === req.userId);
    if (!currentUserMember || currentUserMember.role !== 'creator') {
      res.status(403).json({ error: SHARED_MUSEUM_MESSAGE_ONLY_CREATOR_STATUS });
      return;
    }

    const parsed = updateSharedMuseumStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || SHARED_MUSEUM_MESSAGE_INVALID_BODY });
      return;
    }

    const nextStatus = parsed.data.status;
    const updatedMuseum = updateSharedMuseum({
      id: museum.id,
      owner_user_id: req.userId!,
      name: museum.name,
      description: museum.description || '',
      invite_code: museum.inviteCode,
      invite_enabled: false,
      status: nextStatus,
      anniversary_date: museum.anniversaryDate || '',
      theme: museum.theme || 'shared-memory',
      quiet_mode: true,
      cover_image_path: getStoredMuseumCoverPath(museum),
    });

    res.json({
      museum: resolveSharedMuseumAssets(updatedMuseum),
    });
  } catch (error) {
    console.error('\u66f4\u65b0\u5171\u5efa\u9986\u72b6\u6001\u5931\u8d25\uff1a', error);
    res.status(500).json({ error: SHARED_MUSEUM_MESSAGE_STATUS_FAILED });
  }
});

router.post('/:id/reports', (req: Request, res: Response) => {
  try {
    const museumId = String(req.params.id || '').trim();
    if (!museumId) {
      res.status(400).json({ error: SHARED_MUSEUM_MESSAGE_ID_REQUIRED });
      return;
    }

    const museum = getSharedMuseumById(museumId, req.userId!);
    if (!museum) {
      res.status(404).json({ error: SHARED_MUSEUM_MESSAGE_NOT_FOUND });
      return;
    }

    const parsed = saveSharedMuseumReportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || SHARED_MUSEUM_MESSAGE_INVALID_BODY });
      return;
    }

    const report = upsertSharedMuseumMonthlyReport({
      id: uuidv4(),
      museum_id: museumId,
      month_key: parsed.data.monthKey,
      month_label: parsed.data.monthLabel,
      snapshot_json: JSON.stringify({
        monthKey: parsed.data.monthKey,
        monthLabel: parsed.data.monthLabel,
        itemCount: parsed.data.itemCount,
        categoryCount: parsed.data.categoryCount,
        topCategories: parsed.data.topCategories,
        topTags: parsed.data.topTags,
        relationLabels: parsed.data.relationLabels,
        highlights: parsed.data.highlights,
        narrative: parsed.data.narrative,
        timeline: parsed.data.timeline.map((item) => ({
          ...item,
          coverImageUrl: item.coverImageUrl || '',
          imageUrl: item.imageUrl || '',
        })),
        milestoneMessage: parsed.data.milestoneMessage || null,
      }),
    });

    res.json({
      museum: resolveSharedMuseumAssets(report),
    });
  } catch (error) {
    console.error('\u4fdd\u5b58\u5171\u5efa\u9986\u62a5\u544a\u5931\u8d25\uff1a', error);
    res.status(500).json({ error: SHARED_MUSEUM_MESSAGE_REPORT_FAILED });
  }
});

router.post('/:id/items', (req: Request, res: Response) => {
  try {
    const museumId = String(req.params.id || '').trim();
    if (!museumId) {
      res.status(400).json({ error: SHARED_MUSEUM_MESSAGE_ID_REQUIRED });
      return;
    }

    const museum = getSharedMuseumById(museumId, req.userId!);
    if (!museum) {
      res.status(404).json({ error: SHARED_MUSEUM_MESSAGE_NOT_FOUND });
      return;
    }

    if (['archived', 'ended'].includes(museum.status)) {
      res.status(409).json({ error: SHARED_MUSEUM_MESSAGE_READ_ONLY });
      return;
    }

    const parsed = addSharedMuseumItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || SHARED_MUSEUM_MESSAGE_INVALID_BODY });
      return;
    }

    const sourceItem = getItemById(parsed.data.sourceItemId, req.userId!);
    if (!sourceItem) {
      res.status(404).json({ error: SHARED_MUSEUM_MESSAGE_SOURCE_ITEM_NOT_FOUND });
      return;
    }

    const sharedItem = addItemToSharedMuseum({
      id: uuidv4(),
      museum_id: museumId,
      source_item_id: sourceItem.id,
      source_user_id: req.userId!,
      shared_by_user_id: req.userId!,
      name: sourceItem.name,
      hall_id: sourceItem.hallId,
      category: sourceItem.category,
      material: sourceItem.material,
      description: sourceItem.description || '',
      image_path: normalizeStoredUploadPath(sourceItem.imageUrl || ''),
      cover_image_path: normalizeStoredUploadPath(sourceItem.coverImageUrl || ''),
      audio_path: normalizeStoredUploadPath(sourceItem.audioUrl || ''),
      story: sourceItem.story || '',
      tags: sourceItem.tags || [],
      shared_note: parsed.data.sharedNote || '',
      relation_label: parsed.data.relationLabel || '',
      date_collected: sourceItem.dateCollected,
      date_shared: new Date().toISOString(),
    });

    touchSharedMuseumActivity(
      museumId,
      normalizeStoredUploadPath(sourceItem.coverImageUrl || sourceItem.imageUrl || ''),
    );

    const latestMuseum = getSharedMuseumById(museumId, req.userId!);

    res.json({
      item: resolveSharedMuseumItemAssets(sharedItem),
      museum: resolveSharedMuseumAssets(latestMuseum),
    });
  } catch (error) {
    console.error('\u6dfb\u52a0\u85cf\u54c1\u5230\u5171\u5efa\u9986\u5931\u8d25\uff1a', error);
    res.status(500).json({ error: SHARED_MUSEUM_MESSAGE_ADD_ITEM_FAILED });
  }
});

router.patch('/:id/items/:itemId', (req: Request, res: Response) => {
  try {
    const museumId = String(req.params.id || '').trim();
    const itemId = String(req.params.itemId || '').trim();
    if (!museumId || !itemId) {
      res.status(400).json({ error: '\u5171\u5efa\u9986\u85cf\u54c1 ID \u4e0d\u80fd\u4e3a\u7a7a\u3002' });
      return;
    }

    const museum = getSharedMuseumById(museumId, req.userId!);
    if (!museum) {
      res.status(404).json({ error: SHARED_MUSEUM_MESSAGE_NOT_FOUND });
      return;
    }

    if (['archived', 'ended'].includes(museum.status)) {
      res.status(409).json({ error: SHARED_MUSEUM_MESSAGE_READ_ONLY });
      return;
    }

    const existing = getSharedMuseumItemById(itemId, museumId);
    if (!existing) {
      res.status(404).json({ error: SHARED_MUSEUM_MESSAGE_ITEM_NOT_FOUND });
      return;
    }

    const parsed = updateSharedMuseumItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || SHARED_MUSEUM_MESSAGE_INVALID_BODY });
      return;
    }

    const updatedItem = updateSharedMuseumItem({
      id: itemId,
      museum_id: museumId,
      shared_note: parsed.data.sharedNote ?? existing.sharedNote ?? '',
      relation_label: parsed.data.relationLabel ?? existing.relationLabel ?? '',
    });

    touchSharedMuseumActivity(
      museumId,
      normalizeStoredUploadPath(existing.coverImageUrl || existing.imageUrl || ''),
    );

    const latestMuseum = getSharedMuseumById(museumId, req.userId!);

    res.json({
      item: resolveSharedMuseumItemAssets(updatedItem),
      museum: resolveSharedMuseumAssets(latestMuseum),
    });
  } catch (error) {
    console.error('\u66f4\u65b0\u5171\u5efa\u9986\u85cf\u54c1\u5931\u8d25\uff1a', error);
    res.status(500).json({ error: SHARED_MUSEUM_MESSAGE_UPDATE_ITEM_FAILED });
  }
});

router.delete('/:id/items/:itemId', (req: Request, res: Response) => {
  try {
    const museumId = String(req.params.id || '').trim();
    const itemId = String(req.params.itemId || '').trim();
    if (!museumId || !itemId) {
      res.status(400).json({ error: '\u5171\u5efa\u9986\u85cf\u54c1 ID \u4e0d\u80fd\u4e3a\u7a7a\u3002' });
      return;
    }

    const museum = getSharedMuseumById(museumId, req.userId!);
    if (!museum) {
      res.status(404).json({ error: SHARED_MUSEUM_MESSAGE_NOT_FOUND });
      return;
    }

    if (['archived', 'ended'].includes(museum.status)) {
      res.status(409).json({ error: SHARED_MUSEUM_MESSAGE_READ_ONLY });
      return;
    }

    const existing = getSharedMuseumItemById(itemId, museumId);
    if (!existing) {
      res.status(404).json({ error: SHARED_MUSEUM_MESSAGE_ITEM_NOT_FOUND });
      return;
    }

    const result = removeSharedMuseumItem(itemId, museumId);
    if (result.changes === 0) {
      res.status(404).json({ error: SHARED_MUSEUM_MESSAGE_ITEM_NOT_FOUND });
      return;
    }

    touchSharedMuseumActivity(museumId);
    const latestMuseum = getSharedMuseumById(museumId, req.userId!);

    res.json({
      success: true,
      museum: resolveSharedMuseumAssets(latestMuseum),
    });
  } catch (error) {
    console.error('\u79fb\u9664\u5171\u5efa\u9986\u85cf\u54c1\u5931\u8d25\uff1a', error);
    res.status(500).json({ error: SHARED_MUSEUM_MESSAGE_REMOVE_ITEM_FAILED });
  }
});

function resolveSharedMuseumAssets<T extends {
  coverImageUrl?: string;
  cover_image_path?: string;
  items?: Array<Record<string, unknown>>;
} | null>(museum: T) {
  if (!museum) {
    return museum;
  }

  const coverImageUrl = toClientAssetUrl(String(museum.cover_image_path || museum.coverImageUrl || ''));
  const resolvedItems = Array.isArray(museum.items)
    ? museum.items.map((item) => resolveSharedMuseumItemAssets(item))
    : undefined;

  return {
    ...museum,
    coverImageUrl,
    ...(resolvedItems ? { items: resolvedItems } : {}),
  };
}

function getStoredMuseumCoverPath(museum: Record<string, unknown>) {
  return String(museum.cover_image_path || museum.coverImageUrl || '');
}

function resolveSharedMuseumItemAssets<T extends Record<string, unknown> | null>(item: T) {
  if (!item) {
    return item;
  }

  return {
    ...item,
    imageUrl: toClientAssetUrl(String(item.image_path || item.imageUrl || '')),
    coverImageUrl: toClientAssetUrl(String(item.cover_image_path || item.coverImageUrl || '')),
    audioUrl: toClientAssetUrl(String(item.audio_path || item.audioUrl || '')),
  };
}

function normalizeStoredUploadPath(uploadPath: string) {
  const trimmed = uploadPath.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.startsWith('/api/uploads/') ? trimmed.slice('/api'.length) : trimmed;
}

function generateInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';

  do {
    code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  } while (getSharedMuseumByInviteCode(code));

  return code;
}

export default router;
