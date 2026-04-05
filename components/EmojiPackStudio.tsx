import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, Loader2, Mic, MicOff, Plus, Smile, Sparkles } from 'lucide-react';
import { CollectedItem, EMOJI_STYLE_PRESETS, EmojiStylePreset, Sticker } from '../types';
import { generateEmojiPack, StickerInput } from '../services/geminiService';
import { fetchImageAsset, imageUrlToBase64 } from '../services/imageUtils';
import logger from '../services/logger';
import { EMOJI_PACK_CATEGORY } from '../shared/stickerCategories';

interface EmojiPackStudioProps {
  sourceItems: CollectedItem[];
  onSaveResult?: (sticker: Sticker) => Promise<void> | void;
  onBack: () => void;
  onTaskNotice?: (
    tone: 'success' | 'error' | 'info',
    title: string,
    message: string,
  ) => void;
}

const EMOJI_QUICK_PRESETS = [1, 4, 6, 9, 12];
const EMOJI_STYLE_META: Record<EmojiStylePreset, { icon: string; accent: string }> = {
  有梗有趣: { icon: '😜', accent: 'from-yellow-400/20 to-orange-400/10' },
  可爱软萌: { icon: '🥹', accent: 'from-pink-400/20 to-yellow-300/10' },
  治愈手绘: { icon: '🎨', accent: 'from-emerald-400/18 to-cyan-300/10' },
  国潮中式: { icon: '🧧', accent: 'from-red-400/18 to-amber-300/10' },
  复古涂鸦: { icon: '🪩', accent: 'from-fuchsia-400/18 to-sky-400/10' },
  艺术油画: { icon: '🖼️', accent: 'from-violet-400/18 to-amber-300/10' },
};
const EMPTY_RESULT_EMOJIS = ['😄', '😂', '🥹', '😎'];

type EmojiGenerationRequest = {
  count: number;
  stylePreset: EmojiStylePreset;
  moodText: string;
};

function getPreferredGenerationImage(item: CollectedItem) {
  return item.imageUrl?.trim() || item.coverImageUrl?.trim() || '';
}

function getPreviewImage(item: CollectedItem) {
  return item.coverImageUrl?.trim() || item.imageUrl?.trim() || '';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function buildStickerInputFromItem(item: CollectedItem): Promise<StickerInput> {
  const imageUrl = getPreferredGenerationImage(item);
  if (!imageUrl) {
    throw new Error(`藏品“${item.name}”缺少可用图片`);
  }

  if (imageUrl.startsWith('data:')) {
    const [meta, payload = ''] = imageUrl.split(',');
    const mimeType = meta.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64$/)?.[1] || 'image/png';
    return {
      base64: payload,
      mimeType,
      name: item.name,
    };
  }

  const response = await fetchImageAsset(imageUrl);
  if (!response.ok) {
    throw new Error(`读取藏品图片失败: ${response.status}`);
  }

  const blob = await response.blob();
  const dataUrl = await blobToDataUrl(blob);
  return {
    base64: dataUrl.split(',')[1] || '',
    mimeType: blob.type || 'image/png',
    name: item.name,
  };
}

async function buildFastStickerInputFromItem(item: CollectedItem): Promise<StickerInput> {
  const imageUrl = getPreferredGenerationImage(item);
  if (!imageUrl) {
    throw new Error('表情包来源藏品缺少可用图片。');
  }

  return {
    base64: await imageUrlToBase64(imageUrl, {
      compress: true,
      maxWidth: 896,
      maxHeight: 896,
      quality: 0.7,
      outputType: 'image/jpeg',
    }),
    mimeType: imageUrl.startsWith('data:')
      ? imageUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)?.[1] || 'image/jpeg'
      : 'image/jpeg',
    name: item.name,
  };
}

async function downloadImageAsset(imageUrl: string, filename: string) {
  if (!imageUrl) {
    return;
  }

  if (imageUrl.startsWith('data:')) {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = filename;
    link.click();
    return;
  }

  const response = await fetchImageAsset(imageUrl);
  if (!response.ok) {
    throw new Error(`下载图片失败: ${response.status}`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

const EmojiPackStudio: React.FC<EmojiPackStudioProps> = ({
  sourceItems,
  onSaveResult,
  onBack,
  onTaskNotice,
}) => {
  const recognitionRef = useRef<any>(null);
  const [emojiCount, setEmojiCount] = useState(6);
  const [stylePreset, setStylePreset] = useState<EmojiStylePreset>('可爱软萌');
  const [emojiMoodText, setEmojiMoodText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [emojiSheetUrl, setEmojiSheetUrl] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [hasSavedCurrentResult, setHasSavedCurrentResult] = useState(false);
  const [lastRequest, setLastRequest] = useState<EmojiGenerationRequest | null>(null);

  const availableItems = useMemo(
    () => sourceItems.filter((item) => !!getPreferredGenerationImage(item)),
    [sourceItems],
  );

  const buildResultSticker = (imageUrl: string, moodText = emojiMoodText.trim()): Sticker => {
    const primaryItemId = availableItems[0]?.id || sourceItems[0]?.id || '';
    const sourceNames = availableItems
      .map((item) => item.name.trim())
      .filter(Boolean)
      .join('、');

    return {
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      originalItemId: primaryItemId,
      stickerImageUrl: imageUrl,
      dramaText: moodText || sourceNames || '藏品表情包',
      category: EMOJI_PACK_CATEGORY,
      dateCreated: new Date().toISOString(),
    };
  };

  const saveResultToLibrary = async (imageUrl: string, moodText = emojiMoodText.trim()) => {
    if (!imageUrl || !onSaveResult || isSaving || hasSavedCurrentResult) {
      return false;
    }

    setIsSaving(true);
    setSaveMessage('');

    try {
      await onSaveResult(buildResultSticker(imageUrl, moodText));
      setHasSavedCurrentResult(true);
      setSaveMessage('已自动存入表情包库，现在可以在再生成果库里查看。');
      return true;
    } catch (error) {
      logger.error('Save direct emoji pack result failed:', error);
      setSaveMessage('存入表情包库失败，请稍后重试。');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const handleGenerate = async () => {
    if (availableItems.length === 0 || isGenerating) {
      return;
    }

    const requestedMoodText = emojiMoodText.trim();
    const requestedStylePreset = stylePreset;
    const requestedCount = emojiCount;

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    }

    setLastRequest({
      count: requestedCount,
      stylePreset: requestedStylePreset,
      moodText: requestedMoodText,
    });

    onTaskNotice?.(
      'info',
      '已开始生成表情包',
      '你现在可以切换到其他界面继续浏览，表情包会在后台继续生成并自动存入表情包库。',
    );
    setIsGenerating(true);
    setEmojiSheetUrl('');
    setSaveMessage('');
    setHasSavedCurrentResult(false);
    setStatusMessage(`正在整理 ${availableItems.length} 件藏品图片...`);

    try {
      const canUseDirectItemIds = availableItems.every((item) => item.id && !getPreferredGenerationImage(item).startsWith('data:'));
      const stickerInputs = canUseDirectItemIds
        ? []
        : await Promise.all(availableItems.map((item) => buildFastStickerInputFromItem(item)));
      setStatusMessage(`正在按「${requestedStylePreset}」生成 ${requestedCount} 格表情包，请稍候...`);

      const items = await generateEmojiPack(
        canUseDirectItemIds
          ? {
            itemIds: availableItems.map((item) => item.id),
            count: requestedCount,
            userMood: requestedMoodText,
            stylePreset: requestedStylePreset,
          }
          : stickerInputs,
        requestedCount,
        requestedMoodText,
        requestedStylePreset,
      );
      const nextImageUrl = items[0]?.imageUrl || '';
      setEmojiSheetUrl(nextImageUrl);
      if (!nextImageUrl) {
        onTaskNotice?.('error', '表情包生成失败', '这次没有成功生成结果，请稍后重试。');
        return;
      }

      const saved = await saveResultToLibrary(nextImageUrl, requestedMoodText);
      setStatusMessage(saved ? '表情包已生成并自动存入表情包库。' : '');
      onTaskNotice?.(
        saved ? 'success' : 'error',
        saved ? '表情包已生成' : '表情包生成成功但保存失败',
        saved
          ? '新的表情包已经自动存入表情包库，可以随时去再生成果库查看。'
          : '表情包已经生成，但自动保存失败了，请回到工坊后重试保存。',
      );
      setStatusMessage(items[0]?.imageUrl ? '' : '这次没有成功生成结果，请重试。');
    } catch (error) {
      logger.error('Direct emoji pack generation failed:', error);
      onTaskNotice?.(
        'error',
        '表情包生成失败',
        error instanceof Error ? error.message : '表情包生成失败，请稍后重试。',
      );
      setStatusMessage(error instanceof Error ? error.message : '表情包生成失败，请稍后重试。');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveToResultLibrary = async () => {
    if (!emojiSheetUrl || !onSaveResult || isSaving || hasSavedCurrentResult) {
      return;
    }

    setIsSaving(true);
    setSaveMessage('');
    const effectiveMoodText = lastRequest?.moodText?.trim() || emojiMoodText.trim();

    const primaryItemId = availableItems[0]?.id || sourceItems[0]?.id || '';
    const sourceNames = availableItems
      .map((item) => item.name.trim())
      .filter(Boolean)
      .join('、');

    const newSticker: Sticker = {
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      originalItemId: primaryItemId,
      stickerImageUrl: emojiSheetUrl,
      dramaText: effectiveMoodText || sourceNames || '藏品表情包',
      category: EMOJI_PACK_CATEGORY,
      dateCreated: new Date().toISOString(),
    };

    try {
      await onSaveResult(newSticker);
      setHasSavedCurrentResult(true);
      setSaveMessage('已存入表情包库，现在可以在再生成果库里查看。');
    } catch (error) {
      logger.error('Save direct emoji pack result failed:', error);
      setSaveMessage('存入表情包库失败，请稍后重试。');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleVoiceInput = () => {
    if (isGenerating) {
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatusMessage('当前浏览器不支持语音输入，请直接输入表情包语气。');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript;
      }
      setEmojiMoodText(transcript);
    };

    recognition.onerror = (event: any) => {
      logger.warn('Emoji studio speech recognition error:', event?.error);
      setIsRecording(false);
      if (event?.error === 'not-allowed') {
        setStatusMessage('麦克风权限被拒绝，请允许后再试。');
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setStatusMessage('');
    setIsRecording(true);
  };

  return (
    <div className="h-full overflow-y-auto bg-remuse-dark p-4 pb-24 md:p-8">
      <div className="mx-auto max-w-[1480px] space-y-6">
        <section className="rounded-[32px] border border-remuse-border bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.14),transparent_30%),radial-gradient(circle_at_top_right,rgba(244,114,182,0.12),transparent_34%),linear-gradient(180deg,rgba(18,20,25,0.98),rgba(9,11,15,0.98))] p-6 shadow-[0_24px_72px_rgba(0,0,0,0.3)] md:p-8">
          <div className="flex flex-col gap-5">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-[44px] w-fit items-center gap-2 rounded-full border border-neutral-700 px-4 text-sm text-neutral-300 transition-colors hover:border-white hover:text-white"
            >
              <ArrowLeft size={16} />
              返回再生工坊
            </button>

            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-yellow-400/20 bg-yellow-400/10 text-yellow-300 shadow-[0_10px_30px_rgba(250,204,21,0.12)]">
                  <Smile size={26} />
                </div>
                <h1 className="font-display text-3xl font-black tracking-[-0.04em] text-white md:text-5xl">
                  表情包工坊
                </h1>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-[28px] border border-remuse-border bg-remuse-panel/85 p-5 shadow-[0_18px_48px_rgba(0,0,0,0.2)] md:p-6">
            <div>
              <div>
                <p className="text-xs font-mono uppercase tracking-[0.28em] text-neutral-500">Source Items</p>
                <h2 className="mt-2 font-display text-2xl font-bold text-white">本次参与生成的藏品</h2>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {sourceItems.map((item) => {
                const previewImageUrl = getPreviewImage(item);
                const hasGenerationImage = !!getPreferredGenerationImage(item);

                return (
                  <div
                    key={item.id}
                    className={`overflow-hidden rounded-[24px] border ${
                      hasGenerationImage
                        ? 'border-remuse-border bg-black/15'
                        : 'border-red-500/30 bg-red-950/10'
                    }`}
                  >
                    <div className="aspect-[4/3] overflow-hidden bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_46%),linear-gradient(180deg,rgba(10,12,16,0.95),rgba(5,6,8,1))]">
                      {previewImageUrl ? (
                        <img
                          src={previewImageUrl}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                          无可预览图片
                        </div>
                      )}
                    </div>
                    <div className="space-y-3 p-4">
                      <div>
                        <h3 className="font-display text-lg font-bold text-white">{item.name}</h3>
                        <p className="mt-1 text-xs text-neutral-500">{item.hallId || item.category}</p>
                      </div>
                      {!hasGenerationImage ? (
                        <div className="inline-flex items-center rounded-full border border-red-400/25 bg-red-400/10 px-3 py-1 text-[11px] text-red-200">
                          暂无可用图片
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="rounded-[28px] border border-remuse-border bg-remuse-panel/85 p-5 shadow-[0_18px_48px_rgba(0,0,0,0.2)] md:p-6">
            <p className="text-xs font-mono uppercase tracking-[0.28em] text-neutral-500">Generator</p>
            <h2 className="mt-2 font-display text-2xl font-bold text-white">表情包设置</h2>

            <div className="mt-5 space-y-5">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-medium text-neutral-200">表情数量</label>
                  <span className="font-mono text-2xl font-bold text-yellow-300">{emojiCount}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={12}
                  step={1}
                  value={emojiCount}
                  onChange={(event) => setEmojiCount(Number(event.target.value))}
                  disabled={isGenerating}
                  className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-neutral-800 accent-yellow-400"
                />
                <div className="mt-2 flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.22em] text-neutral-500">
                  <span>1</span>
                  <span>12</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {EMOJI_QUICK_PRESETS.map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setEmojiCount(count)}
                      disabled={isGenerating}
                      className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                        emojiCount === count
                          ? 'border-yellow-400 bg-yellow-400 text-black'
                          : 'border-neutral-700 bg-black/20 text-neutral-300 hover:border-white/30 hover:text-white'
                      }`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-neutral-200">表情包主题</label>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {EMOJI_STYLE_PRESETS.map((preset) => {
                    const meta = EMOJI_STYLE_META[preset];
                    const isActive = stylePreset === preset;

                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setStylePreset(preset)}
                        disabled={isGenerating}
                        className={`rounded-[18px] border px-3 py-3 text-left transition-all ${
                          isActive
                            ? `border-yellow-300/50 bg-gradient-to-br ${meta.accent} text-white shadow-[0_10px_30px_rgba(250,204,21,0.12)]`
                            : 'border-neutral-800 bg-black/20 text-neutral-300 hover:border-white/20 hover:text-white'
                        }`}
                      >
                        <div className="text-lg leading-none">{meta.icon}</div>
                        <div className="mt-2 text-sm font-medium">{preset}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="emoji-mood-input" className="text-sm font-medium text-neutral-200">
                    情绪/语气补充
                  </label>
                  <button
                    type="button"
                    onClick={toggleVoiceInput}
                    disabled={isGenerating}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      isRecording
                        ? 'border-red-400/40 bg-red-400/10 text-red-200'
                        : 'border-neutral-700 bg-black/20 text-neutral-300 hover:border-white/30 hover:text-white'
                    }`}
                  >
                    {isRecording ? <MicOff size={14} /> : <Mic size={14} />}
                    {isRecording ? '停止录音' : '语音输入'}
                  </button>
                </div>
                <textarea
                  id="emoji-mood-input"
                  rows={4}
                  value={emojiMoodText}
                  onChange={(event) => setEmojiMoodText(event.target.value)}
                  disabled={isGenerating}
                  placeholder="比如：嘴硬但可爱、适合朋友聊天、带一点懒洋洋的吐槽感"
                  className="mt-3 w-full rounded-[22px] border border-neutral-800 bg-black/20 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-500 focus:border-yellow-400/40"
                />
              </div>

              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={availableItems.length === 0 || isGenerating}
                className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-yellow-400 to-orange-400 px-5 text-sm font-display font-bold text-black transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    正在生成...
                  </>
                ) : (
                  <>
                    <Smile size={16} />
                    开始生成表情包
                  </>
                )}
              </button>

              {statusMessage ? (
                <div className="rounded-[22px] border border-neutral-800 bg-black/20 px-4 py-3 text-sm leading-7 text-neutral-300">
                  {statusMessage}
                </div>
              ) : null}
            </div>
          </article>
        </section>

        <section className="rounded-[28px] border border-remuse-border bg-remuse-panel/85 p-5 shadow-[0_18px_48px_rgba(0,0,0,0.2)] md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-mono uppercase tracking-[0.28em] text-neutral-500">Result</p>
              <h2 className="mt-2 font-display text-2xl font-bold text-white">生成结果</h2>
            </div>

            {emojiSheetUrl ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                {onSaveResult ? (
                  <button
                    type="button"
                    onClick={() => void handleSaveToResultLibrary()}
                    disabled={isSaving || hasSavedCurrentResult}
                    className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full border border-yellow-400/40 bg-yellow-400/10 px-5 text-sm font-medium text-yellow-100 transition-colors hover:border-yellow-300 hover:text-white disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-500"
                  >
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    {hasSavedCurrentResult ? '已存入表情包库' : '存入表情包库'}
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => void downloadImageAsset(emojiSheetUrl, `remuse-emoji-pack-${Date.now()}.png`)}
                  className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full border border-green-400/40 bg-green-400/10 px-5 text-sm font-medium text-green-200 transition-colors hover:border-green-300 hover:text-white"
                >
                  <Download size={16} />
                  保存到本地
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-5 rounded-[24px] border border-neutral-800 bg-black/20 p-4">
            {emojiSheetUrl ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 rounded-[18px] border border-yellow-400/12 bg-gradient-to-r from-yellow-400/10 via-orange-400/8 to-pink-400/10 px-4 py-3 text-sm text-neutral-200">
                  <Sparkles size={15} className="text-yellow-300" />
                  <span>本次生成 {lastRequest?.count ?? emojiCount} 格表情包，主题为「{lastRequest?.stylePreset ?? stylePreset}」。</span>
                </div>
                <img
                  src={emojiSheetUrl}
                  alt="生成出的表情包整图"
                  className="mx-auto h-auto max-h-[70dvh] w-full rounded-[18px] object-contain"
                />
              </div>
            ) : (
              <div className="flex min-h-[18rem] flex-col items-center justify-center gap-4 text-center text-sm leading-7 text-neutral-500">
                <div className="flex flex-wrap justify-center gap-5">
                  {EMPTY_RESULT_EMOJIS.map((emoji) => (
                    <div
                      key={emoji}
                      className="flex h-20 w-20 items-center justify-center rounded-full border border-yellow-400/12 bg-gradient-to-br from-yellow-400/10 via-orange-400/8 to-fuchsia-400/10 text-[2.6rem] shadow-[0_16px_40px_rgba(250,204,21,0.08)]"
                    >
                      <span className="translate-y-[-1px]">{emoji}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-xl font-display font-bold text-neutral-100">输入你的心情，点击「开始生成」</p>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-neutral-500">
                    AI 会基于物品角色和你的心情，生成一整张更可爱的拟人态表情包贴纸。
                  </p>
                </div>
              </div>
            )}
          </div>

          {saveMessage ? (
            <div className="mt-4 rounded-[22px] border border-neutral-800 bg-black/20 px-4 py-3 text-sm leading-7 text-neutral-300">
              {saveMessage}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
};

export default EmojiPackStudio;
