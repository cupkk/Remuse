import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Box,
  FileAudio,
  Heart,
  Loader2,
  Mic,
  Pause,
  Pencil,
  Save,
  Sparkles,
  Square,
  Sticker as StickerIcon,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { CollectedItem, ExhibitionHall, SharedMuseumSummary } from '../types';
import { getHallNameById } from '../services/halls';
import { AudioRecordingSession, isAudioRecordingSupported, startAudioRecording } from '../services/audioRecorder';

interface ItemArchiveDetailProps {
  item: CollectedItem;
  halls?: ExhibitionHall[];
  sharedMuseums?: SharedMuseumSummary[];
  onBack: () => void;
  onUpdateItem?: (updatedItem: CollectedItem) => Promise<CollectedItem | void> | CollectedItem | void;
  onDeleteItem?: (itemId: string) => Promise<void> | void;
  onGenerateStickerRequest?: (item: CollectedItem) => void;
  onAddToSharedMuseum?: (
    museumId: string,
    item: CollectedItem,
    extras?: { sharedNote?: string; relationLabel?: string },
  ) => Promise<void> | void;
  onOpenSharedMuseums?: () => void;
  hasExistingSticker?: boolean;
  isGeneratingStickerGlobal?: boolean;
}

const ItemArchiveDetail: React.FC<ItemArchiveDetailProps> = ({
  item,
  halls = [],
  sharedMuseums = [],
  onBack,
  onUpdateItem,
  onDeleteItem,
  onGenerateStickerRequest,
  onAddToSharedMuseum,
  onOpenSharedMuseums,
  hasExistingSticker = false,
  isGeneratingStickerGlobal = false,
}) => {
  const safeHalls = Array.isArray(halls) ? halls : [];
  const safeSharedMuseums = Array.isArray(sharedMuseums) ? sharedMuseums : [];
  const addableSharedMuseums = safeSharedMuseums.filter((museum) => museum.status === 'active' || museum.status === 'quiet');
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const recordingRef = useRef<AudioRecordingSession | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAddingToSharedMuseum, setIsAddingToSharedMuseum] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [sharedMuseumError, setSharedMuseumError] = useState<string | null>(null);
  const [showSharedMuseumPicker, setShowSharedMuseumPicker] = useState(false);
  const [selectedSharedMuseumId, setSelectedSharedMuseumId] = useState('');
  const [sharedNote, setSharedNote] = useState('');
  const [relationLabel, setRelationLabel] = useState('');

  const [draftName, setDraftName] = useState(item.name);
  const [draftHallId, setDraftHallId] = useState(item.hallId);
  const [draftMaterial, setDraftMaterial] = useState(item.material || '');
  const [draftDescription, setDraftDescription] = useState(item.description || '');
  const [draftStory, setDraftStory] = useState(item.story || '');
  const [draftAudioUrl, setDraftAudioUrl] = useState(item.audioUrl || '');

  useEffect(() => {
    setDraftName(item.name);
    setDraftHallId(item.hallId);
    setDraftMaterial(item.material || '');
    setDraftDescription(item.description || '');
    setDraftStory(item.story || '');
    setDraftAudioUrl(item.audioUrl || '');
    setIsEditing(false);
    setAudioError(null);
    setSharedMuseumError(null);
    setShowSharedMuseumPicker(false);
    setSelectedSharedMuseumId('');
    setSharedNote('');
    setRelationLabel('');
  }, [item]);

  useEffect(() => () => {
    recordingRef.current?.cancel();
    recordingRef.current = null;
    audioPlayerRef.current?.pause();
  }, []);

  const hallLabel = useMemo(
    () => getHallNameById(safeHalls, item.hallId, item.category),
    [item.category, item.hallId, safeHalls],
  );
  const audioPreviewUrl = draftAudioUrl || item.audioUrl || '';
  const displayImageUrl = item.coverImageUrl || item.imageUrl;

  useEffect(() => {
    if (!showSharedMuseumPicker) {
      return;
    }

    if (!selectedSharedMuseumId && addableSharedMuseums[0]?.id) {
      setSelectedSharedMuseumId(addableSharedMuseums[0].id);
    }
  }, [addableSharedMuseums, selectedSharedMuseumId, showSharedMuseumPicker]);

  const handleToggleAudioPlayback = async () => {
    if (!audioPreviewUrl) {
      return;
    }

    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new Audio(audioPreviewUrl);
      audioPlayerRef.current.addEventListener('ended', () => setIsPlayingAudio(false));
      audioPlayerRef.current.addEventListener('pause', () => setIsPlayingAudio(false));
      audioPlayerRef.current.addEventListener('play', () => setIsPlayingAudio(true));
    }

    if (audioPlayerRef.current.src !== audioPreviewUrl) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = new Audio(audioPreviewUrl);
      audioPlayerRef.current.addEventListener('ended', () => setIsPlayingAudio(false));
      audioPlayerRef.current.addEventListener('pause', () => setIsPlayingAudio(false));
      audioPlayerRef.current.addEventListener('play', () => setIsPlayingAudio(true));
    }

    if (isPlayingAudio) {
      audioPlayerRef.current.pause();
      return;
    }

    await audioPlayerRef.current.play();
  };

  const handleStartRecording = async () => {
    setAudioError(null);
    if (!isAudioRecordingSupported()) {
      setAudioError('当前浏览器不支持录音，请使用 Chrome 或 Edge。');
      return;
    }

    try {
      recordingRef.current = await startAudioRecording();
      setIsRecordingAudio(true);
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : '录音启动失败。');
    }
  };

  const handleStopRecording = async () => {
    if (!recordingRef.current) {
      return;
    }

    try {
      const recorded = await recordingRef.current.stop();
      setDraftAudioUrl(recorded.dataUrl);
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : '录音保存失败。');
    } finally {
      recordingRef.current = null;
      setIsRecordingAudio(false);
    }
  };

  const handleSave = async () => {
    if (!onUpdateItem || !draftName.trim() || !draftHallId) {
      return;
    }

    setIsSaving(true);
    try {
      const nextItem: CollectedItem = {
        ...item,
        name: draftName.trim(),
        hallId: draftHallId,
        category: getHallNameById(safeHalls, draftHallId, item.category),
        material: draftMaterial.trim(),
        description: draftDescription.trim(),
        story: draftStory.trim(),
        audioUrl: draftAudioUrl,
      };
      const persisted = await onUpdateItem(nextItem);
      const resolved = (persisted || nextItem) as CollectedItem;
      setDraftName(resolved.name);
      setDraftHallId(resolved.hallId);
      setDraftMaterial(resolved.material || '');
      setDraftDescription(resolved.description || '');
      setDraftStory(resolved.story || '');
      setDraftAudioUrl(resolved.audioUrl || '');
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDeleteItem) {
      return;
    }

    setIsDeleting(true);
    try {
      await onDeleteItem(item.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddSharedMuseumItem = async () => {
    if (!onAddToSharedMuseum || !selectedSharedMuseumId) {
      return;
    }

    setSharedMuseumError(null);
    setIsAddingToSharedMuseum(true);
    try {
      await onAddToSharedMuseum(selectedSharedMuseumId, item, {
        sharedNote: sharedNote.trim(),
        relationLabel: relationLabel.trim(),
      });
      setShowSharedMuseumPicker(false);
      setSharedNote('');
      setRelationLabel('');
    } catch (error) {
      setSharedMuseumError(error instanceof Error ? error.message : '加入共建藏馆失败。');
    } finally {
      setIsAddingToSharedMuseum(false);
    }
  };

  return (
    <div data-testid="item-archive-detail" className="h-full overflow-y-auto bg-remuse-dark px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6">
        <section className="rounded-[32px] border border-remuse-border bg-[radial-gradient(circle_at_top_left,rgba(204,255,0,0.14),transparent_30%),linear-gradient(180deg,rgba(18,22,26,0.98),rgba(8,10,13,0.98))] p-5 shadow-[0_24px_72px_rgba(0,0,0,0.3)] md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-neutral-700 px-4 text-sm text-neutral-300 transition-colors hover:border-white hover:text-white"
              >
                <ArrowLeft size={16} />
                返回藏品馆
              </button>
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-remuse-accent/20 bg-remuse-accent/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.28em] text-remuse-accent">
                  <Box size={14} />
                  藏品档案
                </div>
                <h1 className="font-display text-3xl font-black tracking-[-0.04em] text-white md:text-4xl">{item.name}</h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {onGenerateStickerRequest ? (
                <button
                  type="button"
                  disabled={hasExistingSticker || isGeneratingStickerGlobal}
                  onClick={() => onGenerateStickerRequest(item)}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-remuse-accent px-5 text-sm font-display font-bold text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                >
                  {isGeneratingStickerGlobal ? <Loader2 size={16} className="animate-spin" /> : <StickerIcon size={16} />}
                  {hasExistingSticker ? '贴纸已生成' : isGeneratingStickerGlobal ? '生成贴纸中...' : '生成贴纸'}
                </button>
              ) : null}

              {onAddToSharedMuseum ? (
                <button
                  type="button"
                  onClick={() => {
                    if (addableSharedMuseums.length === 0) {
                      onOpenSharedMuseums?.();
                      return;
                    }
                    setShowSharedMuseumPicker((value) => !value);
                  }}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-emerald-300/30 px-4 text-sm text-emerald-200 transition-colors hover:border-emerald-200 hover:bg-emerald-300/10"
                >
                  <Heart size={16} />
                  {safeSharedMuseums.length === 0
                    ? '创建共建藏馆'
                    : addableSharedMuseums.length === 0
                      ? '查看共建馆'
                      : '加入共建藏馆'}
                </button>
              ) : null}

              {onUpdateItem ? (
                <button
                  type="button"
                  onClick={() => setIsEditing((value) => !value)}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-neutral-700 px-4 text-sm text-neutral-200 transition-colors hover:border-white hover:text-white"
                >
                  {isEditing ? <X size={16} /> : <Pencil size={16} />}
                  {isEditing ? '取消编辑' : '编辑档案'}
                </button>
              ) : null}

              {onDeleteItem ? (
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDelete}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-red-500/40 px-4 text-sm text-red-200 transition-colors hover:border-red-400 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 size={16} />
                  删除藏品
                </button>
              ) : null}
            </div>
          </div>
        </section>

        {showSharedMuseumPicker ? (
          <section className="rounded-[28px] border border-emerald-300/15 bg-remuse-panel p-5 shadow-[0_20px_56px_rgba(0,0,0,0.18)] md:p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-2xl space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.28em] text-emerald-200">
                  <Heart size={14} />
                  共建藏馆
                </div>
                <h2 className="font-display text-2xl font-black text-white">把这件藏品加入共享记忆空间</h2>
                <p className="text-sm leading-7 text-neutral-300">
                  这里生成的是一份共享副本，不会修改你的原始藏品。后续双方都能在共建馆里继续补充故事与纪念节点。
                </p>
              </div>

              <button
                type="button"
                onClick={onOpenSharedMuseums}
                className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/10 px-4 text-sm text-neutral-300 transition hover:border-white hover:text-white"
              >
                进入共建藏馆
              </button>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
              <div className="grid gap-4 md:grid-cols-2">
                {addableSharedMuseums.map((museum) => {
                  const active = selectedSharedMuseumId === museum.id;
                  return (
                    <button
                      key={museum.id}
                      type="button"
                      onClick={() => setSelectedSharedMuseumId(museum.id)}
                      className={`overflow-hidden rounded-[24px] border text-left transition ${
                        active
                          ? 'border-remuse-accent bg-remuse-accent/10'
                          : 'border-white/8 bg-black/10 hover:border-white/20'
                      }`}
                    >
                      <div className="aspect-[16/10] overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(88,255,188,0.16),transparent_30%),linear-gradient(180deg,rgba(17,21,26,1),rgba(9,11,15,1))]">
                        {museum.coverImageUrl ? (
                          <img src={museum.coverImageUrl} alt={museum.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-emerald-200/70">
                            <Heart size={34} />
                          </div>
                        )}
                      </div>
                      <div className="space-y-2 p-4">
                        <h3 className="font-display text-xl font-bold text-white">{museum.name}</h3>
                        <p className="line-clamp-2 text-sm text-neutral-400">
                          {museum.description || '把共同经历和物件汇聚到一座共享记忆馆。'}
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs text-neutral-400">
                          <span className="rounded-full bg-white/8 px-2 py-1">{museum.members.length} 位成员</span>
                          <span className="rounded-full bg-white/8 px-2 py-1">{museum.itemCount} 件藏品</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-[24px] border border-white/8 bg-black/10 p-5">
                <div className="space-y-4">
                  <label className="block space-y-2">
                    <span className="text-sm text-neutral-300">共同标签</span>
                    <input
                      value={relationLabel}
                      onChange={(event) => setRelationLabel(event.target.value)}
                      placeholder="比如：第一次一起旅行 / 纪念日 / 我送你的礼物"
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-remuse-accent"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm text-neutral-300">共享备注</span>
                    <textarea
                      value={sharedNote}
                      onChange={(event) => setSharedNote(event.target.value)}
                      rows={5}
                      placeholder="给这件共享藏品补一句两个人都看得懂的备注。"
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-remuse-accent"
                    />
                  </label>
                  {sharedMuseumError ? (
                    <div className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                      {sharedMuseumError}
                    </div>
                  ) : null}
                  {addableSharedMuseums.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-neutral-400">
                      当前没有可继续加入藏品的共建馆。已归档或已结束的共建馆会自动变成只读。
                    </div>
                  ) : null}
                  <button
                    type="button"
                    disabled={!selectedSharedMuseumId || isAddingToSharedMuseum}
                    onClick={handleAddSharedMuseumItem}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-remuse-accent px-5 font-display text-black transition hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                  >
                    {isAddingToSharedMuseum ? '加入中...' : '确认加入这座共建馆'}
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[minmax(360px,0.88fr)_minmax(0,1.12fr)]">
          <article className="overflow-hidden rounded-[30px] border border-remuse-border bg-remuse-panel shadow-[0_20px_56px_rgba(0,0,0,0.22)]">
            <div className="relative aspect-[4/5] overflow-hidden bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_44%),linear-gradient(180deg,rgba(18,21,26,1),rgba(8,10,12,1))] p-4">
              {displayImageUrl ? (
                <img
                  src={displayImageUrl}
                  alt={item.name}
                  className="h-full w-full rounded-[24px] object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-[24px] border border-dashed border-neutral-700 text-neutral-500">
                  <Box size={36} />
                </div>
              )}

              {audioPreviewUrl ? (
                <button
                  type="button"
                  onClick={() => void handleToggleAudioPlayback()}
                  className="absolute right-7 top-7 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/65 text-white backdrop-blur transition-colors hover:bg-remuse-accent hover:text-black"
                  aria-label={isPlayingAudio ? '暂停录音' : '播放录音'}
                >
                  {isPlayingAudio ? <Pause size={18} /> : <Volume2 size={18} />}
                </button>
              ) : null}

              <div className="absolute bottom-7 left-7 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-black/55 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.24em] text-neutral-200">
                  {hallLabel}
                </span>
                <span className="rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[11px] text-neutral-300">
                  {item.material || '未记录材质'}
                </span>
              </div>
            </div>
          </article>

          <div className="grid gap-6">
            <article className="rounded-[30px] border border-remuse-border bg-remuse-panel p-5 shadow-[0_18px_48px_rgba(0,0,0,0.2)] md:p-6">
              <div className="flex flex-col gap-5">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-remuse-accent/20 bg-remuse-accent/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.24em] text-remuse-accent">
                    <Box size={14} />
                    物品详情
                  </div>
                  <h2 className="mt-3 font-display text-2xl font-bold text-white">物品详情</h2>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div className="rounded-[24px] border border-neutral-800 bg-black/20 p-4">
                    <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-remuse-accent">物品描述</p>
                    {isEditing ? (
                      <textarea
                        value={draftDescription}
                        onChange={(event) => setDraftDescription(event.target.value)}
                        rows={5}
                        className="mt-3 w-full resize-none rounded-[18px] border border-neutral-800 bg-black/40 px-4 py-3 text-sm leading-7 text-neutral-100 outline-none transition-colors focus:border-remuse-accent/50"
                      />
                    ) : (
                      <p className="mt-3 text-sm leading-7 text-neutral-200">{item.description || '暂未生成物品描述。'}</p>
                    )}
                  </div>

                  <div className="rounded-[24px] border border-neutral-800 bg-black/20 p-4">
                    <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-remuse-accent">物品材质</p>
                    {isEditing ? (
                      <input
                        value={draftMaterial}
                        onChange={(event) => setDraftMaterial(event.target.value)}
                        className="mt-3 w-full rounded-[18px] border border-neutral-800 bg-black/40 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-remuse-accent/50"
                      />
                    ) : (
                      <p className="mt-3 text-sm leading-7 text-neutral-200">{item.material || '暂未记录材质。'}</p>
                    )}

                    <div className="mt-5">
                      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-remuse-accent">分类标签</p>
                      {isEditing ? (
                        <select
                          value={draftHallId}
                          onChange={(event) => setDraftHallId(event.target.value)}
                          className="mt-3 w-full rounded-[18px] border border-neutral-800 bg-black/40 px-4 py-3 text-sm text-neutral-100 outline-none transition-colors focus:border-remuse-accent/50"
                        >
                          {safeHalls.map((hall) => (
                            <option key={hall.id} value={hall.id}>{hall.name}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(item.tags || []).map((tag) => (
                            <span key={tag} className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-neutral-300">
                              {tag}
                            </span>
                          ))}
                          {(item.tags || []).length === 0 ? (
                            <span className="rounded-full border border-neutral-800 bg-black/25 px-3 py-1 text-xs text-neutral-500">
                              暂无标签
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </article>

            <article className="rounded-[30px] border border-remuse-border bg-remuse-panel p-5 shadow-[0_18px_48px_rgba(0,0,0,0.2)] md:p-6">
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-remuse-secondary/20 bg-remuse-secondary/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.24em] text-remuse-secondary">
                      <Sparkles size={14} />
                      故事与录音
                    </div>
                    <h2 className="mt-3 font-display text-2xl font-bold text-white">用户故事与录音</h2>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={isRecordingAudio ? () => void handleStopRecording() : () => void handleStartRecording()}
                          className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm transition-colors ${
                            isRecordingAudio
                              ? 'bg-red-500/12 text-red-200 border border-red-500/40'
                              : 'border border-neutral-700 text-neutral-200 hover:border-white hover:text-white'
                          }`}
                        >
                          {isRecordingAudio ? <Square size={16} /> : <Mic size={16} />}
                          {isRecordingAudio ? '停止录音' : '录一段声音'}
                        </button>

                        {audioPreviewUrl ? (
                          <button
                            type="button"
                            onClick={() => setDraftAudioUrl('')}
                            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-neutral-700 px-4 text-sm text-neutral-300 transition-colors hover:border-white hover:text-white"
                          >
                            <X size={16} />
                            删除录音
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>

                {isEditing ? (
                  <textarea
                    value={draftStory}
                    onChange={(event) => setDraftStory(event.target.value)}
                    rows={6}
                    className="w-full resize-none rounded-[24px] border border-neutral-800 bg-black/30 px-5 py-4 text-sm leading-7 text-neutral-100 outline-none transition-colors focus:border-remuse-accent/50"
                    placeholder="补充这件藏品背后的故事、场景和人物。"
                  />
                ) : (
                  <div className="rounded-[24px] border border-neutral-800 bg-black/20 p-5">
                    <p className="text-sm leading-8 text-neutral-200">{item.story || '暂时还没有补充这件藏品的故事。'}</p>
                  </div>
                )}

                <div className="rounded-[24px] border border-neutral-800 bg-black/20 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-remuse-accent/12 text-remuse-accent">
                      <FileAudio size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{audioPreviewUrl ? '已保存一段录音' : '尚未保存录音'}</p>
                      <p className="text-xs text-neutral-500">录音会和藏品档案一起保留，封面上的扬声器可以直接播放。</p>
                    </div>
                  </div>

                  {audioPreviewUrl ? (
                    <audio controls src={audioPreviewUrl} className="mt-4 w-full" />
                  ) : null}

                  {audioError ? <p className="mt-3 text-sm text-red-300">{audioError}</p> : null}
                </div>

                {isEditing && onUpdateItem ? (
                  <div className="flex flex-wrap justify-end gap-3">
                    <button
                      type="button"
                      disabled={isSaving || !draftName.trim()}
                      onClick={() => void handleSave()}
                      className="inline-flex min-h-[46px] items-center gap-2 rounded-full bg-remuse-accent px-5 text-sm font-display font-bold text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                    >
                      {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      保存档案
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          </div>
        </section>
      </div>
    </div>
  );
};

export default ItemArchiveDetail;
