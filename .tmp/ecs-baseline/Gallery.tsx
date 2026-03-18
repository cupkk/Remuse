import React, { useEffect, useRef, useState } from 'react';
import { CollectedItem, ExhibitionHall, ItemCategory } from '../types';
import {
  ArrowLeft,
  Box,
  Check,
  Image as ImageIcon,
  Mic,
  Pencil,
  Plus,
  Recycle,
  Save,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { compressImageFile } from '../services/imageUtils';
import { isSpeechRecognitionSupported, SpeechCaptureSession, startSpeechCapture } from '../services/speechRecognition';

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
}

const Gallery: React.FC<GalleryProps> = ({
  items = [],
  halls = [],
  onSelectItem,
  onAddHall,
  onUpdateHall,
  onDeleteHall,
  onUpdateItem,
  onDeleteItem,
  initialHallId,
}) => {
  const safeItems = Array.isArray(items) ? items : [];
  const safeHalls = Array.isArray(halls) ? halls : [];

  const [selectedHallId, setSelectedHallId] = useState<string | null>(initialHallId ?? null);
  const [animatingHallId, setAnimatingHallId] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newHallName, setNewHallName] = useState('');
  const [newHallImage, setNewHallImage] = useState('');
  const [newHallImageDirty, setNewHallImageDirty] = useState(false);

  const [editingHall, setEditingHall] = useState<ExhibitionHall | null>(null);
  const [deletingHall, setDeletingHall] = useState<ExhibitionHall | null>(null);
  const [editHallName, setEditHallName] = useState('');
  const [editHallImage, setEditHallImage] = useState('');
  const [editHallImageDirty, setEditHallImageDirty] = useState(false);

  const [editingItem, setEditingItem] = useState<CollectedItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<CollectedItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editMaterial, setEditMaterial] = useState('');
  const [editHallId, setEditHallId] = useState('');
  const [editStory, setEditStory] = useState('');
  const [storyVoiceError, setStoryVoiceError] = useState<string | null>(null);
  const [isRecordingStory, setIsRecordingStory] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const createHallFileInputRef = useRef<HTMLInputElement>(null);
  const editHallFileInputRef = useRef<HTMLInputElement>(null);
  const storyRecognitionRef = useRef<SpeechCaptureSession | null>(null);
  const storyDraftBaseRef = useRef('');

  useEffect(() => {
    if (initialHallId) {
      setSelectedHallId(initialHallId);
    }
  }, [initialHallId]);

  useEffect(() => {
    if (selectedHallId && !safeHalls.some((hall) => hall.id === selectedHallId)) {
      setSelectedHallId(null);
    }
  }, [safeHalls, selectedHallId]);

  useEffect(() => {
    return () => {
      if (newHallImageDirty && newHallImage.startsWith('blob:')) {
        URL.revokeObjectURL(newHallImage);
      }
      if (editHallImageDirty && editHallImage.startsWith('blob:')) {
        URL.revokeObjectURL(editHallImage);
      }
      storyRecognitionRef.current?.stop();
      storyRecognitionRef.current = null;
    };
  }, [editHallImage, editHallImageDirty, newHallImage, newHallImageDirty]);

  const categoryCounts = safeItems.reduce((acc, item) => {
    acc[item.hallId] = (acc[item.hallId] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleHallClick = (hallId: string) => {
    setAnimatingHallId(hallId);
    window.setTimeout(() => {
      setSelectedHallId(hallId);
      setAnimatingHallId(null);
    }, 400);
  };

  const createPreviewUrl = async (file: File) => {
    const compressed = await compressImageFile(file, {
      maxWidth: 800,
      maxHeight: 800,
      quality: 0.75,
    });
    return URL.createObjectURL(compressed);
  };

  const closeAddModal = (revokePreview: boolean) => {
    if (revokePreview && newHallImageDirty && newHallImage.startsWith('blob:')) {
      URL.revokeObjectURL(newHallImage);
    }
    setShowAddModal(false);
    setNewHallName('');
    setNewHallImage('');
    setNewHallImageDirty(false);
    setIsSubmitting(false);
  };

  const closeEditHallModal = (revokePreview: boolean) => {
    if (revokePreview && editHallImageDirty && editHallImage.startsWith('blob:')) {
      URL.revokeObjectURL(editHallImage);
    }
    setEditingHall(null);
    setEditHallName('');
    setEditHallImage('');
    setEditHallImageDirty(false);
    setIsSubmitting(false);
  };

  const handleCreateHall = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newHallName.trim() || !newHallImage) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onAddHall(newHallName.trim(), newHallImage);
      closeAddModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewHallImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (newHallImageDirty && newHallImage.startsWith('blob:')) {
      URL.revokeObjectURL(newHallImage);
    }

    const previewUrl = await createPreviewUrl(file);
    setNewHallImage(previewUrl);
    setNewHallImageDirty(true);
    event.target.value = '';
  };

  const openEditHallModal = (hall: ExhibitionHall) => {
    setEditingHall(hall);
    setEditHallName(hall.name);
    setEditHallImage(hall.imageUrl);
    setEditHallImageDirty(false);
  };

  const handleEditHallImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (editHallImageDirty && editHallImage.startsWith('blob:')) {
      URL.revokeObjectURL(editHallImage);
    }

    const previewUrl = await createPreviewUrl(file);
    setEditHallImage(previewUrl);
    setEditHallImageDirty(true);
    event.target.value = '';
  };

  const handleSaveHall = async () => {
    if (!editingHall || !onUpdateHall || !editHallName.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onUpdateHall(editingHall.id, {
        name: editHallName.trim(),
        imageUrl: editHallImageDirty ? editHallImage : undefined,
      });
      closeEditHallModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteHallConfirm = async () => {
    if (!deletingHall || !onDeleteHall) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onDeleteHall(deletingHall.id);
      setDeletingHall(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditItemModal = (item: CollectedItem) => {
    setStoryVoiceError(null);
    setIsRecordingStory(false);
    setEditingItem(item);
    setEditName(item.name);
    setEditMaterial(item.material);
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

  if (selectedHallId) {
    const currentHall = safeHalls.find((hall) => hall.id === selectedHallId);
    const filteredItems = safeItems.filter((item) => item.hallId === selectedHallId);

    return (
      <div className="h-full overflow-y-auto bg-remuse-dark p-4 pb-24 md:p-8">
        <div className="mb-8 flex items-center gap-4">
          <button
            type="button"
            onClick={() => setSelectedHallId(null)}
            className="rounded-full bg-neutral-800 p-2 transition-colors hover:bg-white hover:text-black"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-white">
              {currentHall?.name || selectedHallId}
              <span className="text-remuse-accent">展厅</span>
            </h2>
            <p className="font-mono text-xs text-neutral-500">
              收录: {filteredItems.length.toString().padStart(2, '0')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 animate-fade-in sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 lg:gap-6 xl:grid-cols-4">
          {filteredItems.map((item) => (
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
              aria-label={`查看藏品: ${item.name}`}
              className="group relative flex min-w-0 cursor-pointer flex-col overflow-hidden border border-remuse-border bg-remuse-panel transition-all hover:border-remuse-accent focus:outline-none focus:ring-2 focus:ring-remuse-accent"
            >
              {(onUpdateItem || onDeleteItem) && (
                <div className="absolute right-2 top-2 z-20 flex items-center gap-1 rounded-full border border-white/10 bg-black/45 p-1 text-neutral-300 shadow-[0_10px_30px_rgba(0,0,0,0.22)] backdrop-blur-md transition-all duration-200 opacity-100 md:pointer-events-none md:translate-y-1 md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-within:pointer-events-auto md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100">
                  {onUpdateItem && (
                    <button
                      type="button"
                      aria-label={`修改藏品: ${item.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        openEditItemModal(item);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10 hover:text-remuse-accent"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  {onDeleteItem && (
                    <button
                      type="button"
                      aria-label={`删除藏品: ${item.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeletingItem(item);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-red-500/12 hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )}

              <div className="relative aspect-[4/5] overflow-hidden bg-black/50 sm:aspect-square">
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="h-full w-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-110 group-hover:opacity-100"
                />
                <div className="absolute right-2 top-2">
                  {item.status === 'remused' && (
                    <div className="bg-remuse-accent p-1 text-black">
                      <Recycle size={14} />
                    </div>
                  )}
                </div>
                <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black to-transparent p-2.5 pt-10 sm:p-3">
                  <p className="mb-0.5 font-mono text-[10px] text-remuse-accent sm:text-xs">
                    {item.material}
                  </p>
                  <h3 className="line-clamp-2 font-display text-sm font-bold leading-tight text-white sm:text-lg">
                    {item.name}
                  </h3>
                </div>
              </div>

              <div className="border-t border-remuse-border bg-neutral-900/50 p-2.5 sm:p-3">
                <p className="line-clamp-2 font-mono text-[11px] text-neutral-400 max-sm:hidden">
                  "{item.story}"
                </p>
                <p className="font-mono text-[10px] text-neutral-500 sm:hidden">点击查看藏品档案</p>
              </div>
            </div>
          ))}

          {filteredItems.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center rounded border border-dashed border-neutral-800 py-20 text-neutral-500">
              <Box size={48} strokeWidth={1} />
              <p className="mt-4 font-mono">展厅筹备中...</p>
              <p className="mt-2 text-xs text-neutral-400">请在扫描或编辑时选择这个展馆</p>
            </div>
          )}
        </div>

        {editingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="clip-corner w-full max-w-lg border border-remuse-border bg-remuse-panel p-6">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h3 className="font-display text-xl font-bold text-white">修改藏品</h3>
                  <p className="mt-1 font-mono text-xs text-neutral-500">编辑当前展厅中的藏品信息</p>
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
                      placeholder="例如: 陶瓷 / 玻璃 / 纸张"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block font-mono text-xs text-neutral-500">所属展馆</label>
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
                  <label className="mb-2 block font-mono text-xs text-neutral-500">藏品故事</label>
                  <textarea
                    value={editStory}
                    onChange={(event) => setEditStory(event.target.value)}
                    rows={4}
                    className="w-full resize-none border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm leading-relaxed text-white outline-none transition-colors focus:border-remuse-accent"
                    placeholder="补充这件藏品的来源、回忆或故事"
                  />
                </div>
                {storyVoiceError && <p className="text-xs text-red-300">{storyVoiceError}</p>}
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
        )}

        {deletingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="clip-corner w-full max-w-md border border-red-900/60 bg-remuse-panel p-6">
              <h3 className="font-display text-xl font-bold text-white">删除藏品</h3>
              <p className="mt-3 text-sm leading-relaxed text-neutral-400">
                确定要删除「{deletingItem.name}」吗？删除后将无法恢复。
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
        )}
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-y-auto p-6 pb-32 md:p-12">
      <div className="mb-12 animate-fade-in text-center">
        <h1 className="mb-2 text-xl font-display tracking-wide text-white md:text-2xl">
          <span className="text-neutral-500">::</span> 馆长，日安
          <span className="text-neutral-500"> ::</span>
        </h1>
        <p className="text-[10px] uppercase tracking-widest text-neutral-400">Select Exhibition Hall</p>
      </div>

      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-8 md:gap-y-12 lg:grid-cols-3">
        {safeHalls.map((hall, index) => {
          const count = categoryCounts[hall.id] || 0;
          const isAnimating = animatingHallId === hall.id;
          const canDeleteHall = hall.id !== ItemCategory.OTHER;

          return (
            <div
              key={hall.id}
              onClick={() => handleHallClick(hall.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleHallClick(hall.id);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`进入${hall.name}展厅，已收录 ${count} 件藏品`}
              className={`group flex cursor-pointer flex-col items-center rounded-lg focus:outline-none focus:ring-2 focus:ring-remuse-accent ${
                isAnimating ? 'z-50' : 'z-10'
              }`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div
                className={`relative aspect-[4/5] w-full drop-shadow-[0_0_1px_rgba(255,255,255,0.3)] transition-all duration-300 group-hover:drop-shadow-[0_0_8px_rgba(204,255,0,0.5)] ${
                  isAnimating ? 'animate-expand-hall' : 'hover:-translate-y-2'
                }`}
              >
                {(onUpdateHall || onDeleteHall) && (
                  <div className="absolute right-3 top-3 z-30 flex items-center gap-1 rounded-full border border-white/10 bg-black/45 p-1 text-neutral-300 shadow-[0_10px_30px_rgba(0,0,0,0.22)] backdrop-blur-md transition-all duration-200 opacity-100 md:pointer-events-none md:translate-y-1 md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-within:pointer-events-auto md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100">
                    {onUpdateHall && (
                      <button
                        type="button"
                        aria-label={`修改展馆: ${hall.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          openEditHallModal(hall);
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10 hover:text-remuse-accent"
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                    {onDeleteHall && (
                      <button
                        type="button"
                        aria-label={`删除展馆: ${hall.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (canDeleteHall) {
                            setDeletingHall(hall);
                          }
                        }}
                        disabled={!canDeleteHall}
                        title={canDeleteHall ? '删除展馆' : '“其他”是系统兜底展馆，不能删除'}
                        className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                          canDeleteHall
                            ? 'text-neutral-300 hover:bg-red-500/12 hover:text-red-400'
                            : 'cursor-not-allowed text-neutral-500 opacity-70'
                        }`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}

                <div className="clip-house relative h-full w-full overflow-hidden bg-white">
                  <div className="absolute left-0 top-0 h-[75%] w-full overflow-hidden bg-neutral-200">
                    <img
                      src={hall.imageUrl}
                      alt={hall.name}
                      className="h-full w-full object-cover saturate-100 transition-transform duration-700 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent to-white/30 opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>

                  <div className="absolute bottom-0 left-0 z-20 flex h-[25%] w-full flex-col items-center justify-center bg-white px-2">
                    <h3 className="w-full truncate text-center font-display text-sm font-bold leading-tight text-black md:text-base">
                      {hall.name}
                    </h3>
                    <span className="mt-0.5 font-mono text-[10px] text-neutral-400">
                      No.{count.toString().padStart(3, '0')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div
          onClick={() => setShowAddModal(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setShowAddModal(true);
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="创建新展馆"
          className="group z-10 flex cursor-pointer flex-col items-center rounded-lg focus:outline-none focus:ring-2 focus:ring-remuse-accent"
        >
          <div className="relative aspect-[4/5] w-full transition-all duration-300 hover:-translate-y-2">
            <div className="clip-house relative h-full w-full overflow-hidden border border-neutral-800 bg-transparent transition-colors group-hover:border-remuse-accent/70">
              <div className="absolute inset-[10%] flex flex-col items-center justify-center gap-4 border-2 border-dashed border-neutral-700 transition-colors group-hover:border-remuse-accent">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800 transition-colors group-hover:bg-remuse-accent group-hover:text-black">
                  <Plus size={24} />
                </div>
                <span className="font-display text-xs text-neutral-400 group-hover:text-remuse-accent">
                  创建新展馆
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in">
          <div className="clip-corner relative w-full max-w-sm border border-remuse-border bg-remuse-panel p-6">
            <button
              type="button"
              onClick={() => closeAddModal(true)}
              className="absolute right-4 top-4 text-neutral-500 transition-colors hover:text-white"
            >
              <X size={20} />
            </button>

            <h2 className="mb-6 font-display text-xl font-bold text-white">新增展馆档案</h2>

            <form onSubmit={handleCreateHall} className="space-y-4">
              <div>
                <label className="mb-2 block font-mono text-xs text-neutral-500">展馆名称</label>
                <input
                  type="text"
                  value={newHallName}
                  onChange={(event) => setNewHallName(event.target.value)}
                  placeholder="例如: 我的旅行收藏"
                  className="w-full border border-neutral-700 bg-neutral-900 p-3 font-mono text-sm text-white outline-none focus:border-remuse-accent"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-2 block font-mono text-xs text-neutral-500">封面图片</label>
                <div
                  onClick={() => createHallFileInputRef.current?.click()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      createHallFileInputRef.current?.click();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label="点击上传封面图"
                  className="relative flex h-32 w-full cursor-pointer flex-col items-center justify-center overflow-hidden border-2 border-dashed border-neutral-700 bg-neutral-900 transition-colors hover:border-remuse-accent focus:outline-none focus:ring-2 focus:ring-remuse-accent"
                >
                  {newHallImage ? (
                    <img src={newHallImage} alt="新展馆封面预览" className="h-full w-full object-cover" />
                  ) : (
                    <div className="text-center text-neutral-500">
                      <ImageIcon size={24} className="mx-auto mb-2" />
                      <span className="text-[10px]">点击上传封面图</span>
                    </div>
                  )}
                  <input
                    ref={createHallFileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleNewHallImageUpload}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !newHallName.trim() || !newHallImage}
                className={`mt-4 flex w-full items-center justify-center gap-2 py-3 font-display font-bold transition-colors ${
                  isSubmitting || !newHallName.trim() || !newHallImage
                    ? 'cursor-not-allowed bg-neutral-800 text-neutral-500'
                    : 'bg-remuse-accent text-black hover:bg-white'
                }`}
              >
                <Check size={18} />
                确认创建
              </button>
            </form>
          </div>
        </div>
      )}

      {editingHall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="clip-corner relative w-full max-w-sm border border-remuse-border bg-remuse-panel p-6">
            <button
              type="button"
              onClick={() => closeEditHallModal(true)}
              className="absolute right-4 top-4 text-neutral-500 transition-colors hover:text-white"
            >
              <X size={20} />
            </button>

            <h2 className="mb-6 font-display text-xl font-bold text-white">修改展馆</h2>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block font-mono text-xs text-neutral-500">展馆名称</label>
                <input
                  type="text"
                  value={editHallName}
                  onChange={(event) => setEditHallName(event.target.value)}
                  placeholder="请输入展馆名称"
                  className="w-full border border-neutral-700 bg-neutral-900 p-3 font-mono text-sm text-white outline-none focus:border-remuse-accent"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-2 block font-mono text-xs text-neutral-500">封面图片</label>
                <div
                  onClick={() => editHallFileInputRef.current?.click()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      editHallFileInputRef.current?.click();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label="点击更换封面图"
                  className="relative flex h-32 w-full cursor-pointer flex-col items-center justify-center overflow-hidden border-2 border-dashed border-neutral-700 bg-neutral-900 transition-colors hover:border-remuse-accent focus:outline-none focus:ring-2 focus:ring-remuse-accent"
                >
                  {editHallImage ? (
                    <img src={editHallImage} alt="展馆封面预览" className="h-full w-full object-cover" />
                  ) : (
                    <div className="text-center text-neutral-500">
                      <ImageIcon size={24} className="mx-auto mb-2" />
                      <span className="text-[10px]">点击上传封面图</span>
                    </div>
                  )}
                  <input
                    ref={editHallFileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleEditHallImageUpload}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => closeEditHallModal(true)}
                  disabled={isSubmitting}
                  className="flex h-11 items-center justify-center rounded-full border border-neutral-700 px-5 font-display text-sm text-neutral-300 transition-colors hover:border-white hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSaveHall}
                  disabled={isSubmitting || !editHallName.trim()}
                  className="flex h-11 items-center justify-center gap-2 rounded-full bg-remuse-accent px-5 font-display text-sm font-bold text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                >
                  <Save size={16} />
                  保存修改
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deletingHall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="clip-corner w-full max-w-md border border-red-900/60 bg-remuse-panel p-6">
            <h3 className="font-display text-xl font-bold text-white">删除展馆</h3>
            <p className="mt-3 text-sm leading-relaxed text-neutral-400">
              确定要删除「{deletingHall.name}」吗？该展馆中的藏品会自动移入「其他」。
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeletingHall(null)}
                disabled={isSubmitting}
                className="flex h-11 items-center justify-center rounded-full border border-neutral-700 px-5 font-display text-sm text-neutral-300 transition-colors hover:border-white hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDeleteHallConfirm}
                disabled={isSubmitting}
                className="flex h-11 items-center justify-center gap-2 rounded-full bg-red-600 px-5 font-display text-sm font-bold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={16} />
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Gallery;
