import React, { useEffect, useMemo, useState } from 'react';
import { CollectedItem, Sticker } from '../types';
import { preparePerlerSourceImage } from '../services/geminiService';
import logger from '../services/logger';
import PerlerPatternStudio from './PerlerPatternStudio';

interface PerlerPatternItemStudioProps {
  sourceItem: CollectedItem | null;
  onBack: () => void;
  onPatternSaved?: (patternSticker: Sticker) => Promise<void> | void;
  onTaskNotice?: (
    tone: 'success' | 'error' | 'info',
    title: string,
    message: string,
  ) => void;
}

function getPreferredSourceImage(item: CollectedItem) {
  return item.imageUrl?.trim() || item.coverImageUrl?.trim() || '';
}

function buildOriginalSourceSticker(sourceItem: CollectedItem, sourceImageUrl: string): Sticker {
  return {
    id: `perler-source-original-${sourceItem.id}`,
    originalItemId: sourceItem.id,
    stickerImageUrl: sourceImageUrl,
    dramaText: sourceItem.name,
    category: '__perler_source_original__',
    dateCreated: new Date().toISOString(),
  };
}

const PerlerPatternItemStudio: React.FC<PerlerPatternItemStudioProps> = ({
  sourceItem,
  onBack,
  onPatternSaved,
  onTaskNotice,
}) => {
  const [preparedSticker, setPreparedSticker] = useState<Sticker | null>(null);
  const [prepareError, setPrepareError] = useState('');
  const sourceImageUrl = sourceItem ? getPreferredSourceImage(sourceItem) : '';

  const originalSourceSticker = useMemo(() => {
    if (!sourceItem || !sourceImageUrl) {
      return null;
    }

    return buildOriginalSourceSticker(sourceItem, sourceImageUrl);
  }, [sourceImageUrl, sourceItem]);

  useEffect(() => {
    let cancelled = false;

    if (!sourceItem || !sourceImageUrl) {
      setPreparedSticker(null);
      setPrepareError('');
      return undefined;
    }

    setPreparedSticker(null);
    setPrepareError('');
    onTaskNotice?.(
      'info',
      '拼豆图纸已切换为原图直转',
      '现在会优先直接使用原图生成拼豆图纸，预处理图会在后台准备，作为可选对照模式。',
    );

    void (async () => {
      try {
        const result = await preparePerlerSourceImage(
          sourceItem.id && !sourceImageUrl.startsWith('data:')
            ? { itemId: sourceItem.id, itemName: sourceItem.name }
            : { base64Image: sourceImageUrl, itemName: sourceItem.name },
        );

        if (cancelled) {
          return;
        }

        setPreparedSticker({
          id: `perler-source-prepared-${sourceItem.id}`,
          originalItemId: sourceItem.id,
          stickerImageUrl: result.preparedImageUrl,
          dramaText: sourceItem.name,
          category: '__perler_source_prepared__',
          dateCreated: new Date().toISOString(),
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        logger.warn('Prepare perler source fallback failed:', error);
        setPrepareError(error instanceof Error ? error.message : '预处理拼豆源图失败。');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onTaskNotice, sourceImageUrl, sourceItem]);

  if (!sourceItem || !originalSourceSticker) {
    return (
      <div className="h-full overflow-y-auto bg-remuse-dark p-6">
        <div className="mx-auto max-w-3xl rounded-3xl border border-neutral-800 bg-remuse-panel p-6 text-sm text-neutral-300">
          当前没有可用于生成拼豆图纸的源素材。
        </div>
      </div>
    );
  }

  return (
    <PerlerPatternStudio
      sourceStickers={[originalSourceSticker]}
      preparedSourceSticker={preparedSticker}
      prepareSourceError={prepareError || null}
      onBack={onBack}
      onPatternSaved={onPatternSaved}
      onTaskNotice={onTaskNotice}
    />
  );
};

export default PerlerPatternItemStudio;
