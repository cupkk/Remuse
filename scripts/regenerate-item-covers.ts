import { promises as fs } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { composeCollectionCoverDataUrl } from '../services/collectionCoverComposer.ts';
import { deleteManagedUpload, getManagedUploadInfo, saveBase64Image } from '../services/storage.ts';

interface ItemRow {
  id: string;
  user_id: string;
  hall_id: string;
  category: string;
  name: string;
  image_path: string;
  cover_image_path: string;
}

const APP_ROOT = process.env.APP_ROOT ? path.resolve(process.env.APP_ROOT) : process.cwd();
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(APP_ROOT, 'data', 'remuse.db'));

async function main() {
  const db = new Database(DB_PATH, { readonly: false });
  const items = db.prepare(`
    SELECT id, user_id, hall_id, category, name, image_path, cover_image_path
    FROM collected_items
    WHERE image_path IS NOT NULL AND image_path != ''
    ORDER BY created_at ASC
  `).all() as ItemRow[];

  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    const sourceInfo = getManagedUploadInfo(item.image_path || '');
    if (!sourceInfo) {
      skipped += 1;
      continue;
    }

    const sourceBuffer = await fs.readFile(sourceInfo.absolutePath);
    const sourceMimeType = inferMimeType(sourceInfo.fileName);
    const sourceDataUrl = `data:${sourceMimeType};base64,${sourceBuffer.toString('base64')}`;

    const nextCoverDataUrl = await composeCollectionCoverDataUrl({
      hallId: item.hall_id || item.category || '其他',
      subjectDataUrl: sourceDataUrl,
      useCutoutLayout: false,
    });

    const nextCoverPath = await saveBase64Image(nextCoverDataUrl, 'item-covers', item.user_id, item.id);

    db.prepare(`
      UPDATE collected_items
      SET cover_image_path = ?
      WHERE id = ?
    `).run(nextCoverPath, item.id);

    if (item.cover_image_path && item.cover_image_path !== nextCoverPath) {
      deleteManagedUpload(item.cover_image_path);
    }

    updated += 1;
    console.log(`[cover] regenerated ${item.id} ${item.name}`);
  }

  console.log(`[cover] done. updated=${updated} skipped=${skipped}`);
}

function inferMimeType(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  switch (extension) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
    default:
      return 'image/webp';
  }
}

main().catch((error) => {
  console.error('[cover] regeneration failed', error);
  process.exitCode = 1;
});
