import React, { useEffect, useRef, useState } from 'react';
import { CollectedItem, ExhibitionHall, ItemCategory } from '../types';
import {
  Box,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Mic,
  Pause,
  Pencil,
  Recycle,
  Save,
  Square,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { getCollectionCoverTheme } from '../shared/collectionCoverThemes';
import {
  isSpeechRecognitionSupported,
  SpeechCaptureSession,
  startSpeechCapture,
} from '../services/speechRecognition';

interface GalleryProps {
  items: CollectedItem[];
  halls: ExhibitionHall[];
  onSelectItem: (item: CollectedItem) => void;
  onAddHall: (name: string, imageUrl: string) => Promise<void> | void;
  onUpdateHall?: (
    hallId: string,
    updates: {
      name: string;
      imageUrl?: string;
    },
  ) => Promise<void> | void;
  onDeleteHall?: (hallId: string) => Promise<void> | void;
  onUpdateItem?: (item: CollectedItem) => Promise<void> | void;
  onDeleteItem?: (itemId: string) => Promise<void> | void;
  initialHallId?: string | null;
  onConsumeInitialHallId?: () => void;
}

const collectionDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
});

function formatCollectionDate(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }
  return collectionDateFormatter.format(new Date(timestamp));
}

function normalizeStoryPreview(story?: string, description?: string) {
  const text = story?.trim() || description?.trim();
  return text || '点击查看藏品档案。';
}

function normalizeTagPreview(tags?: string[]) {
  if (!Array.isArray(tags) || tags.length === 0) {
    return '等待补充标签';
  }
  return tags.slice(0, 2).join(' · ');
}

const ITEMS_PER_PAGE = 8;

const Gallery: React.FC<GalleryProps> = ({
  items = [],
  halls = [],
  onSelectItem,
  onUpdateItem,
  onDeleteItem,
  initialHallId,
  onConsumeInitialHallId,
}) => {
  const safeItems = Array.isArray(items) ? items : [];
  const safeHalls = Array.isArray(halls) ? halls : [];

  const [selectedHallId, setSelectedHallId] = useState<string | null>(initialHallId ?? null);
  const [editingItem, setEditingItem] = useState<CollectedItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<CollectedItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editMaterial, setEditMaterial] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editHallId, setEditHallId] = useState('');
  const [editStory, setEditStory] = useState('');
  const [storyVoiceError, setStoryVoiceError] = useState<string | null>(null);
  const [isRecordingStory, setIsRecordingStory] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [playingItemId, setPlayingItemId] = useState<string | null>(null);

  const storyRecognitionRef = useRef<SpeechCaptureSession | null>(null);
  const storyDraftBaseRef = useRef('');
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Consume scanner/category jump once, then fall back to the default "all items" view.
    if (!initialHallId) {
      return;
    }

    setSelectedHallId(safeHalls.some((hall) => hall.id === initialHallId) ? initialHallId : null);
    onConsumeInitialHallId?.();
  }, [initialHallId, onConsumeInitialHallId, safeHalls]);

  useEffect(() => {
    if (selectedHallId && !safeHalls.some((hall) => hall.id === selectedHallId)) {
      setSelectedHallId(null);
    }
  }, [safeHalls, selectedHallId]);

  useEffect(() => {
    return () => {
      storyRecognitionRef.current?.stop();
      storyRecognitionRef.current = null;
      previewAudioRef.current?.pause();
      previewAudioRef.current = null;
    };
  }, []);

  const categoryCounts = safeItems.reduce((acc, item) => {
    acc[item.hallId] = (acc[item.hallId] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const sortedItems = safeItems.slice().sort((left, right) => {
    const leftTime = Date.parse(left.dateCollected) || 0;
    const rightTime = Date.parse(right.dateCollected) || 0;
    return rightTime - leftTime;
  });

  const filteredItems = selectedHallId
    ? sortedItems.filter((item) => item.hallId === selectedHallId)
    : sortedItems;

  const filterOptions = [
    {
      id: null as string | null,
      label: '全部',
      count: safeItems.length,
    },
    ...safeHalls.map((hall) => ({
      id: hall.id,
      label: hall.name,
      count: categoryCounts[hall.id] || 0,
    })),
  ];

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedHallId]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const pageItems = buildPageItems(currentPage, totalPages);

  const openEditItemModal = (item: CollectedItem) => {
    setStoryVoiceError(null);
    setIsRecordingStory(false);
    setEditingItem(item);
    setEditName(item.name);
    setEditMaterial(item.material);
    setEditDescription(item.description || '');
    setEditHallId(item.hallId);
    setEditStory(item.story || '');
  };

  const closeEditItemModal = () => {
    storyRecognitionRef.current?.stop();
    storyRecognitionRef.current = null;
    setStoryVoiceError(null);
    setIsRecordingStory(false);
    setEditingItem(null);
    setEditName('');
    setEditMaterial('');
    setEditDescription('');
    setEditHallId('');
    setEditStory('');
    setIsSubmitting(false);
  };

  const handleSaveItem = async () => {
    if (!editingItem || !onUpdateItem || !editName.trim() || !editHallId) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onUpdateItem({
        ...editingItem,
        name: editName.trim(),
        material: editMaterial.trim() || editingItem.material,
        description: editDescription.trim() || '',
        hallId: editHallId,
        category: safeHalls.find((hall) => hall.id === editHallId)?.name || editingItem.category,
        story: editStory.trim() || undefined,
      });
      closeEditItemModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleStoryVoiceInput = () => {
    if (isRecordingStory) {
      storyRecognitionRef.current?.stop();
      storyRecognitionRef.current = null;
      setIsRecordingStory(false);
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      setStoryVoiceError('当前浏览器不支持语音输入，建议使用 Chrome 或 Edge。');
      return;
    }

    storyDraftBaseRef.current = editStory.trim() ? `${editStory.trim()} ` : '';
    setStoryVoiceError(null);
    setIsRecordingStory(true);

    try {
      storyRecognitionRef.current = startSpeechCapture({
        onTranscript: (transcript) => {
          setEditStory(`${storyDraftBaseRef.current}${transcript}`.trim());
        },
        onError: (message) => {
          setStoryVoiceError(message);
          setIsRecordingStory(false);
          storyRecognitionRef.current = null;
        },
        onEnd: () => {
          setIsRecordingStory(false);
          storyRecognitionRef.current = null;
        },
      });
    } catch (error) {
      setStoryVoiceError(error instanceof Error ? error.message : '语音输入启动失败');
      setIsRecordingStory(false);
      storyRecognitionRef.current = null;
    }
  };

  const handleDeleteItemConfirm = async () => {
    if (!deletingItem || !onDeleteItem) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onDeleteItem(deletingItem.id);
      setDeletingItem(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleCardAudio = async (item: CollectedItem) => {
    if (!item.audioUrl) {
      return;
    }

    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio(item.audioUrl);
      previewAudioRef.current.addEventListener('ended', () => setPlayingItemId(null));
      previewAudioRef.current.addEventListener('pause', () => setPlayingItemId(null));
    }

    if (previewAudioRef.current.src !== item.audioUrl) {
      previewAudioRef.current.pause();
      previewAudioRef.current = new Audio(item.audioUrl);
      previewAudioRef.current.addEventListener('ended', () => setPlayingItemId(null));
      previewAudioRef.current.addEventListener('pause', () => setPlayingItemId(null));
    }

    if (playingItemId === item.id) {
      previewAudioRef.current.pause();
      setPlayingItemId(null);
      return;
    }

    await previewAudioRef.current.play();
    setPlayingItemId(item.id);
  };

  return (
    <div data-testid="museum-gallery" className="h-full overflow-y-auto bg-remuse-dark p-4 pb-24 md:p-8">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6">
        <section className="overflow-hidden rounded-[32px] border border-remuse-border bg-[radial-gradient(circle_at_top_left,rgba(204,255,0,0.15),transparent_38%),linear-gradient(180deg,rgba(19,22,27,0.98),rgba(10,11,15,0.98))] shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
          <div className="p-5 md:p-7">
            <div>
              <h1 className="font-display text-3xl font-black tracking-[-0.04em] text-white md:text-4xl">
                藏品馆
              </h1>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-remuse-border bg-remuse-panel/80 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.2)] md:p-5">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="space-y-1">
              <h2 className="font-display text-lg font-bold text-white">分类筛选</h2>
            </div>
            {selectedHallId ? (
              <button
                type="button"
                onClick={() => setSelectedHallId(null)}
                className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-neutral-700 px-4 text-sm text-neutral-200 transition-colors hover:border-white hover:text-white"
              >
                查看全部
              </button>
            ) : null}
          </div>

          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-full gap-2 md:flex-wrap">
              {filterOptions.map((option) => {
                const active = option.id === selectedHallId || (option.id === null && selectedHallId === null);
                return (
                  <button
                    key={option.id || 'all'}
                    type="button"
                    onClick={() => setSelectedHallId(option.id)}
                    className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2 text-sm transition-all ${
                      active
                        ? 'border-remuse-accent bg-remuse-accent text-black shadow-[0_0_0_1px_rgba(204,255,0,0.18)]'
                        : 'border-neutral-700 bg-black/20 text-neutral-300 hover:border-white/30 hover:text-white'
                    }`}
                  >
                    <span className="whitespace-nowrap">{option.label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-mono ${active ? 'bg-black/15' : 'bg-white/5 text-neutral-400'}`}>
                      {option.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {filteredItems.length > 0 ? (
          <>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {paginatedItems.map((item) => {
              const theme = getCollectionCoverTheme(item.hallId);
              const displayCoverUrl = item.coverImageUrl || item.imageUrl;
              const hallLabel = safeHalls.find((hall) => hall.id === item.hallId)?.name || item.category || ItemCategory.OTHER;
              const storyPreview = normalizeStoryPreview(item.story, item.description);
              const tagPreview = normalizeTagPreview(item.tags);

              return (
                <div
                  key={item.id}
                  onClick={() => onSelectItem(item)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectItem(item);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`查看藏品：${item.name}`}
                  className="group relative flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-[28px] border border-remuse-border bg-remuse-panel transition-all duration-300 hover:-translate-y-1.5 hover:border-remuse-accent focus:outline-none focus:ring-2 focus:ring-remuse-accent"
                  style={{
                    boxShadow: `0 18px 44px rgba(0, 0, 0, 0.28), 0 0 0 1px ${theme.lineColor}`,
                  }}
                >
                  {(onUpdateItem || onDeleteItem) ? (
                    <div className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-full border border-white/10 bg-black/45 p-1 text-neutral-300 shadow-[0_10px_30px_rgba(0,0,0,0.22)] backdrop-blur-md transition-all duration-200 opacity-100 md:pointer-events-none md:translate-y-1 md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-within:pointer-events-auto md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100">
                      {onUpdateItem ? (
                        <button
                          type="button"
                          aria-label={`编辑藏品：${item.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditItemModal(item);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10 hover:text-remuse-accent"
                        >
                          <Pencil size={14} />
                        </button>
                      ) : null}
                      {onDeleteItem ? (
                        <button
                          type="button"
                          aria-label={`删除藏品：${item.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeletingItem(item);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-red-500/12 hover:text-red-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  <div
                    className="relative aspect-[4/5] overflow-hidden p-3"
                    style={{
                      background: `radial-gradient(circle at 18% 12%, ${theme.spotlight}18 0%, transparent 34%), linear-gradient(160deg, ${theme.backgroundStart} 0%, ${theme.backgroundEnd} 100%)`,
                    }}
                  >
                    <div
                      className="absolute inset-0 opacity-40"
                      style={{
                        backgroundImage: `linear-gradient(${theme.lineColor} 1px, transparent 1px), linear-gradient(90deg, ${theme.lineColor} 1px, transparent 1px)`,
                        backgroundSize: '38px 38px',
                      }}
                    />

                    <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
                      <span
                        className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em]"
                        style={{
                          borderColor: theme.lineColor,
                          color: theme.accentSoft,
                          background: 'rgba(7, 8, 11, 0.42)',
                        }}
                      >
                        {hallLabel}
                      </span>
                      {item.status === 'remused' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-remuse-accent px-3 py-1 text-[10px] font-mono uppercase tracking-[0.24em] text-black">
                          <Recycle size={12} />
                          已再生
                        </span>
                      ) : null}
                    </div>

                    {item.audioUrl ? (
                      <button
                        type="button"
                        aria-label={playingItemId === item.id ? `暂停录音：${item.name}` : `播放录音：${item.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void toggleCardAudio(item);
                        }}
                        className="absolute bottom-4 right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/55 text-white shadow-[0_12px_28px_rgba(0,0,0,0.24)] backdrop-blur transition-colors hover:bg-remuse-accent hover:text-black"
                      >
                        {playingItemId === item.id ? <Pause size={16} /> : <Volume2 size={16} />}
                      </button>
                    ) : null}

                    <div
                      className="relative h-full overflow-hidden rounded-[24px] border p-2 shadow-[0_22px_40px_rgba(0,0,0,0.35)] transition-transform duration-500 group-hover:scale-[1.02]"
                      style={{
                        borderColor: theme.frameEdge,
                        background: `linear-gradient(180deg, ${theme.frameFill} 0%, rgba(8, 10, 16, 0.88) 100%)`,
                      }}
                    >
                      <div className="absolute inset-x-5 top-3 h-16 rounded-full blur-2xl" style={{ background: `${theme.glow}33` }} />
                      {displayCoverUrl ? (
                        <img
                          src={displayCoverUrl}
                          alt={item.name}
                          className="relative z-10 h-full w-full rounded-[18px] object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        />
                      ) : (
                        <div className="relative z-10 flex h-full w-full items-center justify-center rounded-[18px] bg-black/30 text-neutral-500">
                          <ImageIcon size={30} />
                        </div>
                      )}
                      <div className="pointer-events-none absolute inset-0 rounded-[24px] bg-[linear-gradient(132deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0.06)_24%,rgba(255,255,255,0)_46%)] opacity-80" />
                    </div>

                    <div className="absolute bottom-0 left-0 w-full p-4">
                      <div
                        className="rounded-2xl border px-3 py-3 backdrop-blur-md"
                        style={{
                          borderColor: theme.lineColor,
                          background: 'linear-gradient(180deg, rgba(4,5,8,0.2) 0%, rgba(4,5,8,0.72) 100%)',
                        }}
                      >
                        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.32em]" style={{ color: theme.accentSoft }}>
                          {item.material || '未记录材质'}
                        </p>
                        <h3 className="line-clamp-2 font-display text-lg font-bold leading-tight text-white">
                          {item.name}
                        </h3>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-neutral-200/88">
                          {storyPreview}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-remuse-border bg-neutral-950/65 px-4 py-3 text-xs text-neutral-400">
                    <span className="font-mono uppercase tracking-[0.24em]">{formatCollectionDate(item.dateCollected)}</span>
                    <span className="line-clamp-1 text-right">{tagPreview}</span>
                  </div>
                </div>
              );
              })}
            </section>

            {totalPages > 1 ? (
              <section className="rounded-[24px] border border-remuse-border bg-remuse-panel/70 px-4 py-4 shadow-[0_16px_48px_rgba(0,0,0,0.18)]">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-neutral-400">
                    第 <span className="font-mono text-white">{currentPage}</span> / <span className="font-mono text-white">{totalPages}</span> 页
                    ，当前筛选下共 <span className="font-mono text-remuse-accent">{filteredItems.length}</span> 件藏品。
                  </p>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-neutral-700 px-4 text-sm text-neutral-200 transition-colors hover:border-white hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft size={16} />
                      上一页
                    </button>

                    {pageItems.map((pageItem, index) => (
                      typeof pageItem === 'number' ? (
                        <button
                          key={pageItem}
                          type="button"
                          onClick={() => setCurrentPage(pageItem)}
                          aria-current={pageItem === currentPage ? 'page' : undefined}
                          className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border px-3 text-sm transition-colors ${
                            pageItem === currentPage
                              ? 'border-remuse-accent bg-remuse-accent text-black'
                              : 'border-neutral-700 text-neutral-300 hover:border-white hover:text-white'
                          }`}
                        >
                          {pageItem}
                        </button>
                      ) : (
                        <span
                          key={`${pageItem}-${index}`}
                          className="inline-flex min-h-[44px] min-w-[32px] items-center justify-center text-sm text-neutral-500"
                        >
                          ...
                        </span>
                      )
                    ))}

                    <button
                      type="button"
                      onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-neutral-700 px-4 text-sm text-neutral-200 transition-colors hover:border-white hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      下一页
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <section className="flex min-h-[320px] flex-col items-center justify-center rounded-[32px] border border-dashed border-neutral-800 bg-remuse-panel/55 px-6 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-neutral-700 bg-black/20 text-neutral-500">
              <Box size={28} strokeWidth={1.6} />
            </div>
            <h2 className="mt-5 font-display text-2xl font-bold text-white">
              {selectedHallId ? '当前分类还没有藏品' : '还没有归档藏品'}
            </h2>
            <p className="mt-3 max-w-md text-sm leading-7 text-neutral-400">
              {selectedHallId
                ? '试试切换到其他标签，或者回到“全部”查看完整馆藏。'
                : '先去扫描页归档第一件物品，新的藏品会直接出现在这里。'}
            </p>
            {selectedHallId ? (
              <button
                type="button"
                onClick={() => setSelectedHallId(null)}
                className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-full bg-remuse-accent px-5 text-sm font-display font-bold text-black transition-colors hover:bg-white"
              >
                返回全部藏品
              </button>
            ) : null}
          </section>
        )}

        {editingItem ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="clip-corner w-full max-w-lg border border-remuse-border bg-remuse-panel p-6">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h3 className="font-display text-xl font-bold text-white">编辑藏品</h3>
                  <p className="mt-1 font-mono text-xs text-neutral-500">修改名称、分类和故事内容</p>
                </div>
                <button
                  type="button"
                  aria-label="关闭编辑"
                  onClick={closeEditItemModal}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-700 text-neutral-400 transition-colors hover:border-white hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="grid gap-4">
                <div>
                  <label className="mb-2 block font-mono text-xs text-neutral-500">藏品名称</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    className="w-full border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm text-white outline-none transition-colors focus:border-remuse-accent"
                    placeholder="请输入藏品名称"
                    autoFocus
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block font-mono text-xs text-neutral-500">材质</label>
                    <input
                      type="text"
                      value={editMaterial}
                      onChange={(event) => setEditMaterial(event.target.value)}
                      className="w-full border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm text-white outline-none transition-colors focus:border-remuse-accent"
                      placeholder="例如：纸张 / 玻璃 / 塑料"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block font-mono text-xs text-neutral-500">分类标签</label>
                    <select
                      value={editHallId}
                      onChange={(event) => setEditHallId(event.target.value)}
                      className="w-full border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm text-white outline-none transition-colors focus:border-remuse-accent"
                    >
                      {safeHalls.map((hall) => (
                        <option key={hall.id} value={hall.id}>
                          {hall.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={toggleStoryVoiceInput}
                    className={`inline-flex min-h-[36px] items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
                      isRecordingStory
                        ? 'border-red-500/60 bg-red-500/10 text-red-300'
                        : 'border-neutral-700 bg-black/20 text-neutral-300 hover:border-remuse-secondary hover:text-white'
                    }`}
                  >
                    {isRecordingStory ? <Square size={12} /> : <Mic size={12} />}
                    {isRecordingStory ? '停止录音' : '语音补充'}
                  </button>
                </div>

                <div>
                  <label className="mb-2 block font-mono text-xs text-neutral-500">物品描述</label>
                  <textarea
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                    rows={4}
                    className="w-full resize-none border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm leading-relaxed text-white outline-none transition-colors focus:border-remuse-accent"
                    placeholder="补充这件藏品的客观描述、结构和特征"
                  />
                </div>

                <div>
                  <label className="mb-2 block font-mono text-xs text-neutral-500">藏品故事</label>
                  <textarea
                    value={editStory}
                    onChange={(event) => setEditStory(event.target.value)}
                    rows={4}
                    className="w-full resize-none border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm leading-relaxed text-white outline-none transition-colors focus:border-remuse-accent"
                    placeholder="补充这件藏品的来源、回忆或使用情境"
                  />
                </div>
                {storyVoiceError ? <p className="text-xs text-red-300">{storyVoiceError}</p> : null}
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeEditItemModal}
                  disabled={isSubmitting}
                  className="flex h-11 items-center justify-center rounded-full border border-neutral-700 px-5 font-display text-sm text-neutral-300 transition-colors hover:border-white hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSaveItem}
                  disabled={isSubmitting || !editName.trim() || !editHallId}
                  className="flex h-11 items-center justify-center gap-2 rounded-full bg-remuse-accent px-5 font-display text-sm font-bold text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                >
                  <Save size={16} />
                  保存修改
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {deletingItem ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="clip-corner w-full max-w-md border border-red-900/60 bg-remuse-panel p-6">
              <h3 className="font-display text-xl font-bold text-white">删除藏品</h3>
              <p className="mt-3 text-sm leading-relaxed text-neutral-400">
                确定要删除《{deletingItem.name}》吗？删除后将无法恢复。
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setDeletingItem(null)}
                  disabled={isSubmitting}
                  className="flex h-11 items-center justify-center rounded-full border border-neutral-700 px-5 font-display text-sm text-neutral-300 transition-colors hover:border-white hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleDeleteItemConfirm}
                  disabled={isSubmitting}
                  className="flex h-11 items-center justify-center gap-2 rounded-full bg-red-600 px-5 font-display text-sm font-bold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 size={16} />
                  确认删除
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

function buildPageItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1) as Array<number | 'ellipsis'>;
  }

  const items: Array<number | 'ellipsis'> = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) {
    items.push('ellipsis');
  }

  for (let page = start; page <= end; page += 1) {
    items.push(page);
  }

  if (end < totalPages - 1) {
    items.push('ellipsis');
  }

  items.push(totalPages);
  return items;
}

export default Gallery;
