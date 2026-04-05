import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import sharp from 'sharp';

const APP_ROOT = process.env.APP_ROOT ? path.resolve(process.env.APP_ROOT) : process.cwd();
export const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(APP_ROOT, 'uploads'));
const RESOLVED_UPLOADS_DIR = path.resolve(UPLOADS_DIR);

const MAX_UPLOAD_BYTES = parseIntegerEnv(process.env.MAX_UPLOAD_BYTES, 6 * 1024 * 1024);
const MAX_IMAGE_DIMENSION = parseIntegerEnv(process.env.MAX_IMAGE_DIMENSION, 4096);
const MAX_INPUT_PIXELS = parseIntegerEnv(process.env.MAX_INPUT_PIXELS, 4096 * 4096);
const MAX_BASE64_LENGTH = Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 4096;
const MANAGED_UPLOAD_DELETE_GRACE_MS = parseNonNegativeIntegerEnv(
  process.env.MANAGED_UPLOAD_DELETE_GRACE_MS,
  60_000,
);
const pendingUploadDeletions = new Map<string, NodeJS.Timeout>();

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/x-m4a',
  'audio/mpeg',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
]);

export class ManagedUploadError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = 'UPLOAD_INVALID') {
    super(message);
    this.name = 'ManagedUploadError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

interface ManagedUploadInfo {
  absolutePath: string;
  fileName: string;
  relativePath: string;
  type: string;
  userId: string;
}

interface ParsedIncomingData {
  buffer: Buffer;
  mimeType: string | null;
}

export async function saveBase64Image(
  base64Data: string,
  type: string,
  userId: string,
  entityId: string,
): Promise<string> {
  const parsed = parseIncomingData(base64Data);
  const normalized = await normalizeImage(parsed.buffer, parsed.mimeType);

  const userDir = path.join(UPLOADS_DIR, type, userId);
  await fsPromises.mkdir(userDir, { recursive: true });

  const fileName = `${entityId}.webp`;
  const filePath = path.join(userDir, fileName);
  cancelPendingUploadDeletion(filePath);
  await fsPromises.writeFile(filePath, normalized.buffer);

  return `/uploads/${type}/${userId}/${fileName}`;
}

export async function saveBase64Audio(
  base64Data: string,
  type: string,
  userId: string,
  entityId: string,
): Promise<string> {
  const parsed = parseIncomingData(base64Data);
  const mimeType = normalizeAudioMimeType(parsed.mimeType);
  if (!mimeType || !ALLOWED_AUDIO_MIME_TYPES.has(mimeType)) {
    throw new ManagedUploadError('不支持的音频格式。仅支持 WEBM、OGG、M4A、MP3、WAV。');
  }

  const extension = extensionFromMimeType(mimeType);
  const userDir = path.join(UPLOADS_DIR, type, userId);
  await fsPromises.mkdir(userDir, { recursive: true });

  const fileName = `${entityId}.${extension}`;
  const filePath = path.join(userDir, fileName);
  cancelPendingUploadDeletion(filePath);
  await fsPromises.writeFile(filePath, parsed.buffer);

  return `/uploads/${type}/${userId}/${fileName}`;
}

export function toClientAssetUrl(uploadPath: string): string {
  const normalizedPath = normalizeManagedUploadPath(uploadPath);
  if (!isManagedUploadPath(normalizedPath)) {
    return normalizedPath;
  }

  return normalizedPath.startsWith('/api/uploads/') ? normalizedPath : `/api${normalizedPath}`;
}

export function isManagedUploadPath(uploadPath: string): boolean {
  return normalizeManagedUploadPath(uploadPath).startsWith('/uploads/');
}

export function getManagedUploadInfo(uploadPath: string): ManagedUploadInfo | null {
  const normalizedPath = normalizeManagedUploadPath(uploadPath);
  if (!isManagedUploadPath(normalizedPath)) {
    return null;
  }

  const relativeParts = normalizedPath
    .slice('/uploads/'.length)
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  if (relativeParts.length < 3) {
    return null;
  }

  const [type, userId, ...fileNameParts] = relativeParts;
  const fileName = fileNameParts.join('/');
  const absolutePath = path.resolve(RESOLVED_UPLOADS_DIR, ...relativeParts);

  if (absolutePath !== RESOLVED_UPLOADS_DIR && !absolutePath.startsWith(`${RESOLVED_UPLOADS_DIR}${path.sep}`)) {
    return null;
  }

  return {
    absolutePath,
    fileName,
    relativePath: relativeParts.join('/'),
    type,
    userId,
  };
}

export function deleteManagedUpload(uploadPath: string): boolean {
  const info = getManagedUploadInfo(uploadPath);
  if (!info || !fs.existsSync(info.absolutePath)) {
    return false;
  }

  cancelPendingUploadDeletion(info.absolutePath);
  if (MANAGED_UPLOAD_DELETE_GRACE_MS === 0) {
    return removeManagedUploadNow(info.absolutePath);
  }

  const deletionTimer = setTimeout(() => {
    pendingUploadDeletions.delete(info.absolutePath);
    removeManagedUploadNow(info.absolutePath);
  }, MANAGED_UPLOAD_DELETE_GRACE_MS);
  deletionTimer.unref?.();
  pendingUploadDeletions.set(info.absolutePath, deletionTimer);
  return true;
}

function normalizeManagedUploadPath(uploadPath: string): string {
  const trimmed = typeof uploadPath === 'string' ? uploadPath.trim() : '';
  if (!trimmed) {
    return '';
  }

  return trimmed.startsWith('/api/uploads/') ? trimmed.slice('/api'.length) : trimmed;
}

function cancelPendingUploadDeletion(absolutePath: string) {
  const existingTimer = pendingUploadDeletions.get(absolutePath);
  if (!existingTimer) {
    return;
  }

  clearTimeout(existingTimer);
  pendingUploadDeletions.delete(absolutePath);
}

function removeManagedUploadNow(absolutePath: string): boolean {
  if (!fs.existsSync(absolutePath)) {
    return false;
  }

  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) {
    return false;
  }

  fs.unlinkSync(absolutePath);
  removeEmptyParentDirs(path.dirname(absolutePath));
  return true;
}

function parseIncomingData(base64Data: string): ParsedIncomingData {
  const trimmed = base64Data.trim();
  if (!trimmed) {
    throw new ManagedUploadError('上传内容为空。');
  }

  let mimeType: string | null = null;
  let payload = trimmed;

  const match = trimmed.match(/^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (match) {
    mimeType = match[1].toLowerCase();
    payload = match[2];
  }

  if (payload.length > MAX_BASE64_LENGTH) {
    throw new ManagedUploadError(`上传内容过大，最大允许 ${MAX_UPLOAD_BYTES} 字节。`, 413, 'UPLOAD_TOO_LARGE');
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(payload, 'base64');
  } catch {
    throw new ManagedUploadError('上传内容不是合法的 base64 数据。');
  }

  if (!buffer.length) {
    throw new ManagedUploadError('上传内容解码后为空。');
  }

  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new ManagedUploadError(`解码后的上传内容过大，最大允许 ${MAX_UPLOAD_BYTES} 字节。`, 413, 'UPLOAD_TOO_LARGE');
  }

  return { buffer, mimeType };
}

async function normalizeImage(buffer: Buffer, mimeType: string | null): Promise<{ buffer: Buffer }> {
  const metadata = await sharp(buffer, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .metadata();

  const detectedMimeType = resolveMimeType(mimeType, metadata.format);
  if (!detectedMimeType || !ALLOWED_IMAGE_MIME_TYPES.has(detectedMimeType)) {
    throw new ManagedUploadError('不支持的图片格式。仅支持 JPEG、PNG、WEBP。');
  }

  if (!metadata.width || !metadata.height) {
    throw new ManagedUploadError('无法读取图片尺寸。');
  }

  const outputBuffer = await sharp(buffer, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({
      quality: 84,
      alphaQuality: 90,
      effort: 4,
      nearLossless: true,
    })
    .toBuffer();

  if (outputBuffer.length > MAX_UPLOAD_BYTES) {
    throw new ManagedUploadError(`处理后的图片过大，最大允许 ${MAX_UPLOAD_BYTES} 字节。`, 413, 'UPLOAD_TOO_LARGE');
  }

  return { buffer: outputBuffer };
}

function resolveMimeType(declaredMimeType: string | null, format: string | undefined): string | null {
  if (declaredMimeType && ALLOWED_IMAGE_MIME_TYPES.has(declaredMimeType)) {
    return declaredMimeType;
  }

  switch ((format || '').toLowerCase()) {
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return null;
  }
}

function normalizeAudioMimeType(mimeType: string | null) {
  if (!mimeType) {
    return null;
  }

  const normalized = mimeType.toLowerCase();
  if (normalized.startsWith('audio/webm')) return 'audio/webm';
  if (normalized.startsWith('audio/ogg')) return 'audio/ogg';
  if (normalized === 'audio/x-m4a') return 'audio/x-m4a';
  if (normalized === 'audio/mp4') return 'audio/mp4';
  if (normalized === 'audio/mpeg') return 'audio/mpeg';
  if (normalized === 'audio/wav' || normalized === 'audio/wave' || normalized === 'audio/x-wav') return 'audio/wav';
  return normalized;
}

function extensionFromMimeType(mimeType: string) {
  switch (mimeType) {
    case 'audio/webm':
      return 'webm';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/mp4':
    case 'audio/x-m4a':
      return 'm4a';
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/wav':
      return 'wav';
    default:
      return 'bin';
  }
}

function removeEmptyParentDirs(startDir: string) {
  let currentDir = startDir;

  while (currentDir.startsWith(`${RESOLVED_UPLOADS_DIR}${path.sep}`)) {
    if (!fs.existsSync(currentDir) || fs.readdirSync(currentDir).length > 0) {
      break;
    }

    fs.rmdirSync(currentDir);
    currentDir = path.dirname(currentDir);
  }
}

function parseIntegerEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeIntegerEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
