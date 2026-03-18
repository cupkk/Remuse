import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Box,
  CheckCircle2,
  Hammer,
  Heart,
  Image as ImageIcon,
  Scissors,
  Smile,
  Sparkles,
  Sticker as StickerIcon,
} from 'lucide-react';
import { CollectedItem, ExhibitionHall, Sticker } from '../types';
import { getHallNameById } from '../services/halls';
import { isSourceSticker } from '../shared/stickerCategories';

export type WorkshopToolId = 'EMOJI_PACK' | 'PERLER_PATTERN' | 'PRINT' | 'GUIDE';

export interface WorkshopLaunchRequest {
  tool: WorkshopToolId;
  items?: CollectedItem[];
  stickers?: Sticker[];
}

interface RegenerationWorkshopProps {
  items: CollectedItem[];
  stickers: Sticker[];
  halls: ExhibitionHall[];
  resultStats: {
    stickers: number;
    emojiPacks: number;
    perlerPatterns: number;
    guides: number;
  };
  onLaunchTool: (request: WorkshopLaunchRequest) => Promise<void> | void;
  onOpenLibrary: () => void;
}

type SelectionMode = 'ITEM' | 'STICKER';

interface WorkshopToolConfig {
  id: WorkshopToolId;
  lane: 'PLAYFUL' | 'HEART' | 'RENEWAL';
  title: string;
  subtitle: string;
  description: string;
  cta: string;
  selectionLimit: number;
  selectionMode: SelectionMode;
  selectionUnit: string;
  pickerTitle: string;
  pickerDescription: string;
  pickerHint: string;
  emptyTitle: string;
  emptyDescription: string;
  entryLabel: string;
  icon: React.ReactNode;
  accentClassName: string;
  panelClassName: string;
}

interface StickerCardRecord {
  id: string;
  sticker: Sticker;
  item: CollectedItem | null;
  hallId: string;
  hallLabel: string;
  title: string;
  description: string;
  material: string;
  imageUrl: string;
  dateLabel: string;
}

const collectionDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
});

const TOOL_CONFIGS: Record<WorkshopToolId, WorkshopToolConfig> = {
  EMOJI_PACK: {
    id: 'EMOJI_PACK',
    lane: 'PLAYFUL',
    title: '表情包',
    subtitle: '妙趣灵感社',
    description: '收集可爱与创意，把已经生成的贴纸继续整理成更适合分享和表达心情的表情包。',
    cta: '选贴纸做表情包',
    selectionLimit: 6,
    selectionMode: 'STICKER',
    selectionUnit: '张贴纸',
    pickerTitle: '选择想进入表情包的贴纸',
    pickerDescription: '只从已经生成好的贴纸里继续创作，让表情表达更直接。',
    pickerHint: '先去藏品档案生成贴纸，生成后的贴纸才会出现在这里可选。',
    emptyTitle: '还没有可用贴纸',
    emptyDescription: '先在藏品档案里生成贴纸，再回来继续做表情包。',
    entryLabel: '从贴纸进入',
    icon: <Smile size={18} />,
    accentClassName: 'text-amber-300',
    panelClassName:
      'border-amber-400/20 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.14),transparent_36%),linear-gradient(180deg,rgba(25,21,15,0.94),rgba(12,11,9,0.96))]',
  },
  PERLER_PATTERN: {
    id: 'PERLER_PATTERN',
    lane: 'PLAYFUL',
    title: '拼豆图纸',
    subtitle: '妙趣灵感社',
    description: '把喜欢的贴纸继续转成可制作、可导出的拼豆像素图纸。',
    cta: '选 1 张贴纸做拼豆图纸',
    selectionLimit: 1,
    selectionMode: 'STICKER',
    selectionUnit: '张贴纸',
    pickerTitle: '选择想进入拼豆图纸的贴纸',
    pickerDescription: '单张贴纸进入，继续转成更适合落地制作的拼豆图纸。',
    pickerHint: '只有已经生成好的贴纸会出现在这里，便于直接进入图纸工坊。',
    emptyTitle: '还没有可用贴纸',
    emptyDescription: '先在藏品档案里生成贴纸，再回来做拼豆图纸。',
    entryLabel: '从贴纸进入',
    icon: <Box size={18} />,
    accentClassName: 'text-cyan-300',
    panelClassName:
      'border-cyan-400/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.14),transparent_36%),linear-gradient(180deg,rgba(14,22,27,0.94),rgba(8,12,15,0.96))]',
  },
  PRINT: {
    id: 'PRINT',
    lane: 'HEART',
    title: '手账拼贴',
    subtitle: '心灵自留地',
    description: '安放情绪与温柔，把已经生成的贴纸整理成更适合排版与输出的手账页面。',
    cta: '选贴纸做手账拼贴',
    selectionLimit: 6,
    selectionMode: 'STICKER',
    selectionUnit: '张贴纸',
    pickerTitle: '选择想进入手账拼贴的贴纸',
    pickerDescription: '多张贴纸一起进入，更适合继续排版、拼贴和导出。',
    pickerHint: '这里显示的是已经生成好的贴纸，选中后会直接进入手账拼贴工坊。',
    emptyTitle: '还没有可用贴纸',
    emptyDescription: '先在藏品档案里生成贴纸，再回来做手账拼贴。',
    entryLabel: '从贴纸进入',
    icon: <Scissors size={18} />,
    accentClassName: 'text-sky-300',
    panelClassName:
      'border-sky-400/20 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.14),transparent_36%),linear-gradient(180deg,rgba(13,20,28,0.94),rgba(7,10,15,0.96))]',
  },
  GUIDE: {
    id: 'GUIDE',
    lane: 'RENEWAL',
    title: '改造指南',
    subtitle: '旧物新生局',
    description: '让旧物重获新生，换种形式陪伴你。',
    cta: '生成综合改造指南',
    selectionLimit: 4,
    selectionMode: 'ITEM',
    selectionUnit: '件藏品',
    pickerTitle: '选择 1-4 件想联合改造的藏品',
    pickerDescription: '这里会把多件藏品组合成一份综合改造指南，而不是重复生成单件协议。',
    pickerHint: '选中的藏品越明确，生成出来的综合方案和 AI 示意图就越直观。',
    emptyTitle: '当前还没有藏品',
    emptyDescription: '先去扫描仪或藏品馆补充内容，再回来继续推进改造指南。',
    entryLabel: '从藏品进入',
    icon: <Hammer size={18} />,
    accentClassName: 'text-remuse-accent',
    panelClassName:
      'border-remuse-accent/20 bg-[radial-gradient(circle_at_top_right,rgba(204,255,0,0.14),transparent_36%),linear-gradient(180deg,rgba(18,24,16,0.94),rgba(10,12,9,0.96))]',
  },
};

function formatCollectionDate(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  return collectionDateFormatter.format(new Date(timestamp));
}

const RegenerationWorkshop: React.FC<RegenerationWorkshopProps> = ({
  items = [],
  stickers = [],
  halls = [],
  resultStats,
  onLaunchTool,
  onOpenLibrary,
}) => {
  const safeItems = Array.isArray(items) ? items : [];
  const safeStickers = Array.isArray(stickers) ? stickers : [];
  const safeHalls = Array.isArray(halls) ? halls : [];

  const [activeToolId, setActiveToolId] = useState<WorkshopToolId | null>(null);
  const [selectedHallId, setSelectedHallId] = useState<string | null>(null);
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);

  const sortedItems = useMemo(
    () =>
      safeItems.slice().sort((left, right) => {
        const leftTime = Date.parse(left.dateCollected) || 0;
        const rightTime = Date.parse(right.dateCollected) || 0;
        return rightTime - leftTime;
      }),
    [safeItems],
  );

  const sourceStickers = useMemo(
    () =>
      safeStickers
        .filter((sticker) => isSourceSticker(sticker))
        .slice()
        .sort((left, right) => {
          const leftTime = Date.parse(left.dateCreated) || 0;
          const rightTime = Date.parse(right.dateCreated) || 0;
          return rightTime - leftTime;
        }),
    [safeStickers],
  );

  const itemMap = useMemo(
    () => new Map(sortedItems.map((item) => [item.id, item])),
    [sortedItems],
  );

  const stickerCards = useMemo<StickerCardRecord[]>(
    () =>
      sourceStickers.map((sticker) => {
        const linkedItem = itemMap.get(sticker.originalItemId) || null;
        const hallId = linkedItem?.hallId || linkedItem?.category || sticker.category;
        const hallLabel = getHallNameById(safeHalls, hallId, linkedItem?.category || sticker.category);

        return {
          id: sticker.id,
          sticker,
          item: linkedItem,
          hallId,
          hallLabel,
          title: linkedItem?.name || '未关联藏品',
          description:
            sticker.dramaText?.trim()
            || linkedItem?.story?.trim()
            || '这张贴纸已经可以继续进入新的再生主线。',
          material: linkedItem?.material || '未记录材质',
          imageUrl: sticker.stickerImageUrl,
          dateLabel: formatCollectionDate(sticker.dateCreated),
        };
      }),
    [itemMap, safeHalls, sourceStickers],
  );

  const activeTool = activeToolId ? TOOL_CONFIGS[activeToolId] : null;

  const filteredItems = useMemo(() => {
    if (!selectedHallId) {
      return sortedItems;
    }

    return sortedItems.filter((item) => item.hallId === selectedHallId);
  }, [selectedHallId, sortedItems]);

  const filteredStickerCards = useMemo(() => {
    if (!selectedHallId) {
      return stickerCards;
    }

    return stickerCards.filter((sticker) => sticker.hallId === selectedHallId);
  }, [selectedHallId, stickerCards]);

  const selectedItems = useMemo(() => {
    if (selectedEntryIds.length === 0) {
      return [];
    }

    const nextItemMap = new Map(sortedItems.map((item) => [item.id, item]));
    return selectedEntryIds
      .map((id) => nextItemMap.get(id))
      .filter(Boolean) as CollectedItem[];
  }, [selectedEntryIds, sortedItems]);

  const selectedStickers = useMemo(() => {
    if (selectedEntryIds.length === 0) {
      return [];
    }

    const nextStickerMap = new Map(sourceStickers.map((sticker) => [sticker.id, sticker]));
    return selectedEntryIds
      .map((id) => nextStickerMap.get(id))
      .filter(Boolean) as Sticker[];
  }, [selectedEntryIds, sourceStickers]);

  const filterOptions = useMemo(() => {
    const counts = new Map<string, number>();
    const records = activeTool?.selectionMode === 'STICKER'
      ? stickerCards.map((sticker) => ({ hallId: sticker.hallId }))
      : sortedItems.map((item) => ({ hallId: item.hallId }));

    records.forEach((record) => {
      counts.set(record.hallId, (counts.get(record.hallId) || 0) + 1);
    });

    return [
      {
        id: null as string | null,
        label: '全部',
        count: activeTool?.selectionMode === 'STICKER' ? stickerCards.length : sortedItems.length,
      },
      ...safeHalls.map((hall) => ({
        id: hall.id,
        label: hall.name,
        count: counts.get(hall.id) || 0,
      })),
    ];
  }, [activeTool?.selectionMode, safeHalls, sortedItems, stickerCards]);

  const openPicker = (toolId: WorkshopToolId) => {
    setActiveToolId(toolId);
    setSelectedHallId(null);
    setSelectedEntryIds([]);
    setLaunchError(null);
    setIsLaunching(false);
  };

  const closePicker = () => {
    setActiveToolId(null);
    setSelectedHallId(null);
    setSelectedEntryIds([]);
    setLaunchError(null);
    setIsLaunching(false);
  };

  const toggleEntrySelection = (entryId: string) => {
    if (!activeTool) {
      return;
    }

    setSelectedEntryIds((previous) => {
      if (previous.includes(entryId)) {
        return previous.filter((id) => id !== entryId);
      }

      if (activeTool.selectionLimit === 1) {
        return [entryId];
      }

      if (previous.length >= activeTool.selectionLimit) {
        return previous;
      }

      return [...previous, entryId];
    });
  };

  const handleLaunch = async () => {
    if (!activeTool) {
      return;
    }

    const selectionCount = activeTool.selectionMode === 'STICKER' ? selectedStickers.length : selectedItems.length;
    if (selectionCount === 0) {
      return;
    }

    setIsLaunching(true);
    setLaunchError(null);

    try {
      await onLaunchTool({
        tool: activeTool.id,
        items: activeTool.selectionMode === 'ITEM' ? selectedItems : undefined,
        stickers: activeTool.selectionMode === 'STICKER' ? selectedStickers : undefined,
      });
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : '再生流程启动失败，请稍后重试。');
      setIsLaunching(false);
    }
  };

  if (activeTool) {
    const isStickerMode = activeTool.selectionMode === 'STICKER';
    const visibleCount = isStickerMode ? filteredStickerCards.length : filteredItems.length;
    const selectionCount = isStickerMode ? selectedStickers.length : selectedItems.length;

    return (
      <div className="h-full overflow-y-auto bg-remuse-dark p-4 pb-28 md:p-8">
        <div className="mx-auto max-w-[1480px] space-y-6">
          <section className="rounded-[30px] border border-remuse-border bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.06),transparent_32%),linear-gradient(180deg,rgba(18,21,26,0.98),rgba(8,10,13,0.98))] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.26)] md:p-6">
            <div className="flex flex-col gap-4">
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={closePicker}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-neutral-700 px-4 text-sm text-neutral-300 transition-colors hover:border-white hover:text-white"
                >
                  <ArrowLeft size={16} />
                  返回再生工坊
                </button>
                <div className="space-y-3">
                  <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.28em] ${activeTool.accentClassName} border-current/20 bg-white/[0.02]`}>
                    {activeTool.icon}
                    {activeTool.subtitle}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-remuse-border bg-remuse-panel/85 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.2)] md:p-5">
            <div className="overflow-x-auto pb-2">
              <div className="flex min-w-full gap-2 md:flex-wrap">
                {filterOptions.map((option) => {
                  const isActive = option.id === selectedHallId || (option.id === null && selectedHallId === null);
                  return (
                    <button
                      key={option.id || 'all'}
                      type="button"
                      onClick={() => setSelectedHallId(option.id)}
                      className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2 text-sm transition-all ${
                        isActive
                          ? 'border-remuse-accent bg-remuse-accent text-black'
                          : 'border-neutral-700 bg-black/20 text-neutral-300 hover:border-white/30 hover:text-white'
                      }`}
                    >
                      <span className="whitespace-nowrap">{option.label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-mono ${isActive ? 'bg-black/10' : 'bg-white/5 text-neutral-400'}`}>
                        {option.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {visibleCount === 0 ? (
            <section className="flex min-h-[320px] flex-col items-center justify-center rounded-[28px] border border-dashed border-neutral-800 bg-remuse-panel/55 px-6 py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-neutral-700 bg-black/20 text-neutral-500">
                {isStickerMode ? <StickerIcon size={28} strokeWidth={1.6} /> : <Box size={28} strokeWidth={1.6} />}
              </div>
              <h2 className="mt-5 font-display text-2xl font-bold text-white">{activeTool.emptyTitle}</h2>
              <p className="mt-3 max-w-md text-sm leading-7 text-neutral-400">{activeTool.emptyDescription}</p>
            </section>
          ) : isStickerMode ? (
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredStickerCards.map((card) => {
                const selected = selectedEntryIds.includes(card.id);

                return (
                  <button
                    key={card.id}
                    type="button"
                    aria-label={`选择贴纸：${card.title}`}
                    onClick={() => toggleEntrySelection(card.id)}
                    className={`group relative flex min-h-[340px] flex-col overflow-hidden rounded-[28px] border text-left transition-all ${
                      selected
                        ? 'border-remuse-accent bg-remuse-panel shadow-[0_0_0_1px_rgba(204,255,0,0.18),0_16px_44px_rgba(0,0,0,0.24)]'
                        : 'border-remuse-border bg-remuse-panel hover:-translate-y-1 hover:border-white/30'
                    }`}
                  >
                    <div className="relative aspect-[4/3] overflow-hidden border-b border-white/5 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_48%),linear-gradient(180deg,rgba(10,12,16,0.95),rgba(5,6,8,1))]">
                      <img
                        src={card.imageUrl}
                        alt={card.title}
                        className="h-full w-full object-contain p-6 transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08),rgba(0,0,0,0.28))]" />
                      <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.22em] text-neutral-200">
                          {card.hallLabel}
                        </span>
                        <span className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[11px] text-neutral-300">
                          已生成贴纸
                        </span>
                      </div>
                      {selected ? (
                        <div className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-remuse-accent text-black shadow-[0_10px_30px_rgba(204,255,0,0.24)]">
                          <CheckCircle2 size={18} />
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-1 flex-col justify-between gap-4 p-4">
                      <div>
                        <p className="text-xs font-mono uppercase tracking-[0.24em] text-neutral-500">来自藏品</p>
                        <h3 className="mt-2 line-clamp-2 font-display text-xl font-bold text-white">{card.title}</h3>
                        <p className="mt-2 line-clamp-3 text-sm leading-6 text-neutral-400">{card.description}</p>
                      </div>

                      <div className="flex items-center justify-between gap-3 text-xs text-neutral-500">
                        <span className="font-mono uppercase tracking-[0.22em]">{card.dateLabel}</span>
                        <span className="line-clamp-1 text-right">{card.material}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </section>
          ) : (
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredItems.map((item) => {
                const selected = selectedEntryIds.includes(item.id);
                const displayCoverUrl = item.coverImageUrl || item.imageUrl;
                const hallLabel = getHallNameById(safeHalls, item.hallId, item.category);

                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={`选择藏品：${item.name}`}
                    onClick={() => toggleEntrySelection(item.id)}
                    className={`group relative flex min-h-[340px] flex-col overflow-hidden rounded-[28px] border text-left transition-all ${
                      selected
                        ? 'border-remuse-accent bg-remuse-panel shadow-[0_0_0_1px_rgba(204,255,0,0.18),0_16px_44px_rgba(0,0,0,0.24)]'
                        : 'border-remuse-border bg-remuse-panel hover:-translate-y-1 hover:border-white/30'
                    }`}
                  >
                    <div className="relative aspect-[4/3] overflow-hidden border-b border-white/5 bg-black/30">
                      {displayCoverUrl ? (
                        <img
                          src={displayCoverUrl}
                          alt={item.name}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-neutral-500">
                          <ImageIcon size={32} />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.04),rgba(0,0,0,0.36))]" />
                      <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.22em] text-neutral-200">
                          {hallLabel}
                        </span>
                        <span className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[11px] text-neutral-300">
                          可联合改造
                        </span>
                      </div>
                      {selected ? (
                        <div className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-remuse-accent text-black shadow-[0_10px_30px_rgba(204,255,0,0.24)]">
                          <CheckCircle2 size={18} />
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-1 flex-col justify-between gap-4 p-4">
                      <div>
                        <h3 className="line-clamp-2 font-display text-xl font-bold text-white">{item.name}</h3>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-neutral-400">
                          {item.story?.trim() || '已归档，等待进入新的再生主线。'}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-3 text-xs text-neutral-500">
                        <span className="font-mono uppercase tracking-[0.22em]">{formatCollectionDate(item.dateCollected)}</span>
                        <span className="line-clamp-1 text-right">{item.material || '未记录材质'}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </section>
          )}

          <section className="sticky bottom-0 z-20 pt-2">
            <div className="rounded-[26px] border border-remuse-border bg-neutral-950/92 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.28)] backdrop-blur-xl">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                {selectionCount > 0 ? (
                  <div className="inline-flex items-center justify-center rounded-full border border-white/10 bg-black/25 px-4 py-2 text-sm text-neutral-300">
                    已选 <span className="ml-1 font-mono text-white">{selectionCount}</span>
                  </div>
                ) : null}
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={closePicker}
                    className="inline-flex min-h-[46px] items-center justify-center rounded-full border border-neutral-700 px-5 text-sm text-neutral-300 transition-colors hover:border-white hover:text-white"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleLaunch}
                    disabled={selectionCount === 0 || isLaunching}
                    className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full bg-remuse-accent px-5 text-sm font-display font-bold text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                  >
                    {isLaunching ? '正在进入工坊...' : activeTool.cta}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
              {launchError ? <p className="mt-3 text-sm text-red-300">{launchError}</p> : null}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-remuse-dark p-4 pb-24 md:p-8">
      <div className="mx-auto max-w-[1480px] space-y-6">
        <section className="overflow-hidden rounded-[32px] border border-remuse-border bg-[radial-gradient(circle_at_top_left,rgba(204,255,0,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.14),transparent_28%),linear-gradient(180deg,rgba(18,20,25,0.98),rgba(9,11,15,0.98))] p-6 shadow-[0_24px_72px_rgba(0,0,0,0.3)] md:p-8">
          <div className="flex flex-col gap-4">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-remuse-accent/25 bg-remuse-accent/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.3em] text-remuse-accent">
                <Sparkles size={14} />
                Regeneration Workshop
              </div>
              <div>
                <h1 className="font-display text-3xl font-black tracking-[-0.04em] text-white md:text-5xl">
                  再生工坊
                </h1>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.2fr_1fr_1fr]">
          <article className={`rounded-[30px] border p-5 shadow-[0_18px_56px_rgba(0,0,0,0.24)] md:p-6 ${TOOL_CONFIGS.EMOJI_PACK.panelClassName}`}>
            <div className="flex h-full flex-col gap-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/15 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.26em] text-neutral-300">
                    <Sparkles size={14} />
                    妙趣灵感社
                  </span>
                  <div>
                    <h2 className="font-display text-3xl font-black tracking-[-0.04em] text-white">收集可爱与创意</h2>
                  </div>
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black/20 text-amber-300">
                  <Smile size={24} />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => openPicker('EMOJI_PACK')}
                  className="rounded-[24px] border border-white/10 bg-black/15 p-4 text-left transition-all hover:-translate-y-1 hover:border-amber-300/40 hover:bg-black/25"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400/18 text-amber-300">
                      <Smile size={20} />
                    </div>
                    <ArrowRight size={18} className="text-neutral-400" />
                  </div>
                  <h3 className="mt-4 font-display text-xl font-bold text-white">表情包</h3>
                </button>

                <button
                  type="button"
                  onClick={() => openPicker('PERLER_PATTERN')}
                  className="rounded-[24px] border border-white/10 bg-black/15 p-4 text-left transition-all hover:-translate-y-1 hover:border-cyan-300/40 hover:bg-black/25"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/18 text-cyan-300">
                      <Box size={20} />
                    </div>
                    <ArrowRight size={18} className="text-neutral-400" />
                  </div>
                  <h3 className="mt-4 font-display text-xl font-bold text-white">拼豆图纸</h3>
                </button>
              </div>
            </div>
          </article>

          <article className={`rounded-[30px] border p-5 shadow-[0_18px_56px_rgba(0,0,0,0.24)] md:p-6 ${TOOL_CONFIGS.PRINT.panelClassName}`}>
            <div className="flex h-full flex-col gap-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/15 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.26em] text-neutral-300">
                    <Heart size={14} />
                    心灵自留地
                  </span>
                  <div>
                    <h2 className="font-display text-3xl font-black tracking-[-0.04em] text-white">安放情绪与温柔</h2>
                  </div>
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black/20 text-sky-300">
                  <Scissors size={24} />
                </div>
              </div>

              <button
                type="button"
                onClick={() => openPicker('PRINT')}
                className="mt-auto rounded-[24px] border border-white/10 bg-black/15 p-4 text-left transition-all hover:-translate-y-1 hover:border-sky-300/40 hover:bg-black/25"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-400/18 text-sky-300">
                    <Scissors size={20} />
                  </div>
                  <ArrowRight size={18} className="text-neutral-400" />
                </div>
                <h3 className="mt-4 font-display text-xl font-bold text-white">手账拼贴</h3>
              </button>
            </div>
          </article>

          <article className={`rounded-[30px] border p-5 shadow-[0_18px_56px_rgba(0,0,0,0.24)] md:p-6 ${TOOL_CONFIGS.GUIDE.panelClassName}`}>
            <div className="flex h-full flex-col gap-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/15 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.26em] text-neutral-300">
                    <Hammer size={14} />
                    旧物新生局
                  </span>
                  <div>
                    <h2 className="font-display text-3xl font-black tracking-[-0.04em] text-white">让旧物继续陪伴你</h2>
                  </div>
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black/20 text-remuse-accent">
                  <Hammer size={24} />
                </div>
              </div>

              <button
                type="button"
                onClick={() => openPicker('GUIDE')}
                className="mt-auto rounded-[24px] border border-white/10 bg-black/15 p-4 text-left transition-all hover:-translate-y-1 hover:border-remuse-accent/40 hover:bg-black/25"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-remuse-accent/18 text-remuse-accent">
                    <Hammer size={20} />
                  </div>
                  <ArrowRight size={18} className="text-neutral-400" />
                </div>
                <h3 className="mt-4 font-display text-xl font-bold text-white">改造指南</h3>
              </button>
            </div>
          </article>
        </section>

        <section className="rounded-[28px] border border-remuse-border bg-remuse-panel/80 p-5 shadow-[0_18px_48px_rgba(0,0,0,0.2)] md:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-neutral-700 bg-black/20 px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.28em] text-neutral-400">
                <StickerIcon size={14} />
                再生成果库
              </div>
              <h2 className="mt-4 font-display text-2xl font-bold text-white">继续整理已经生成的成果</h2>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="rounded-[22px] border border-neutral-800 bg-black/25 px-4 py-4 text-sm text-neutral-300">
                贴纸 <span className="font-mono text-white">{resultStats.stickers}</span> · 表情包{' '}
                <span className="font-mono text-white">{resultStats.emojiPacks}</span> · 拼豆图纸{' '}
                <span className="font-mono text-white">{resultStats.perlerPatterns}</span> · 改造指南{' '}
                <span className="font-mono text-white">{resultStats.guides}</span>
              </div>
              <button
                type="button"
                onClick={onOpenLibrary}
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full border border-neutral-700 px-5 text-sm text-neutral-200 transition-colors hover:border-white hover:text-white"
              >
                打开成果库
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default RegenerationWorkshop;
