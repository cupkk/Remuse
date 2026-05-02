import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, Loader2, Sparkles, X, Box, Check, Sticker as StickerIcon, ArrowRight, AlertTriangle, RefreshCw, Wifi, WifiOff, ShieldAlert, ImageOff, Clock, Edit2, Mic, Square, Save, Volume2 } from 'lucide-react';
import { fileToGenerativePart, analyzeItemImage, generateSticker, AnalysisError } from '../services/geminiService';
import { imageUrlToBase64 } from '../services/imageUtils';
import { CollectedItem, ExhibitionHall, Sticker } from '../types';
import { getHallNameById } from '../services/halls';
import { isSpeechRecognitionSupported, startSpeechCapture, type SpeechCaptureSession } from '../services/speechRecognition';
import { AudioRecordingSession, isAudioRecordingSupported, startAudioRecording } from '../services/audioRecorder';

type BatchItemStatus = 'pending' | 'analyzing' | 'success' | 'error';
interface BatchItem {
  id: string; // generated
  file: File;
  previewUrl: string;
  status: BatchItemStatus;
  result?: CollectedItem;
  error?: AnalysisError;
  isGeneratingSticker?: boolean;
  generatedSticker?: Sticker;
}

interface ScannerProps {
  halls: ExhibitionHall[];
  onItemAdded: (item: CollectedItem) => Promise<CollectedItem> | CollectedItem;
  onStickerCreated: (sticker: Sticker) => Promise<void> | void;
  onCancel: () => void;
  onReset?: () => void;
  onViewDetail: (item: CollectedItem) => void;
  onCompleteItem?: (id: string) => void;
  onUpdateItem?: (item: CollectedItem) => Promise<CollectedItem> | CollectedItem | void;
  onDeleteItem?: (id: string) => void;
  existingStickers?: Sticker[];
  onGenerateStickerRequest?: (item: CollectedItem) => void;
  generatingStickersGlobal?: Record<string, boolean>;
  onNavigateToHall?: (hallId: string) => void;
  onNavigateToStickerLibrary?: () => void;
  onNavigateToWorkshop?: () => void;
}

const ScrambleButton: React.FC<{ 
    text: string; 
    onClick: () => void; 
    isActive?: boolean;
    subText?: string;
}> = ({ text, onClick, isActive, subText }) => {
    const [display, setDisplay] = useState(text);
    const [isHovering, setIsHovering] = useState(false);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';

    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined;
        if (isHovering) {
            let iteration = 0;
            interval = setInterval(() => {
                setDisplay(text.split("").map((char, index) => {
                    if (index < iteration) return text[index];
                    return chars[Math.floor(Math.random() * chars.length)];
                }).join(""));

                if (iteration >= text.length) clearInterval(interval);
                iteration += 1 / 2;
            }, 30);
        } else {
            setDisplay(text);
        }
        return () => clearInterval(interval);
    }, [isHovering, text]);

    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            className={`
                group relative px-6 py-3 border transition-all duration-300 w-full md:w-auto
                ${isActive 
                    ? 'border-remuse-accent bg-remuse-accent/10' 
                    : 'border-neutral-700 bg-neutral-900/50 hover:border-remuse-secondary'}
            `}
        >
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <Box size={16} className={`${isActive ? 'text-remuse-accent' : 'text-neutral-500 group-hover:text-remuse-secondary'}`} />
                    <span className={`font-display text-sm tracking-wide ${isActive ? 'text-white' : 'text-neutral-300'}`}>
                        {display}
                    </span>
                </div>
                {subText && (
                    <span className="text-[10px] font-mono text-remuse-accent bg-remuse-accent/10 px-2 py-0.5 rounded">
                        {subText}
                    </span>
                )}
            </div>
            {/* Corner Accents */}
            <div className={`absolute top-0 right-0 w-2 h-2 border-t border-r ${isActive ? 'border-remuse-accent' : 'border-neutral-500 group-hover:border-remuse-secondary'}`}></div>
            <div className={`absolute bottom-0 left-0 w-2 h-2 border-b border-l ${isActive ? 'border-remuse-accent' : 'border-neutral-500 group-hover:border-remuse-secondary'}`}></div>
        </button>
    );
};

const Scanner: React.FC<ScannerProps> = ({ halls = [], onItemAdded, onStickerCreated, onCancel, onReset, onViewDetail, onCompleteItem, onUpdateItem, onDeleteItem, existingStickers, onGenerateStickerRequest, generatingStickersGlobal = {}, onNavigateToHall, onNavigateToStickerLibrary, onNavigateToWorkshop }) => { 
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingStickerLocal, setIsGeneratingSticker] = useState(false);
  
  // Analysis Result
  const [analysisResult, setAnalysisResult] = useState<CollectedItem | null>(null);
  const [analysisSourceImageUrl, setAnalysisSourceImageUrl] = useState<string | null>(null);

  // Use global generation state if available for single-item scan mode
  const isGeneratingSticker = (analysisResult && generatingStickersGlobal[analysisResult.id]) ?? isGeneratingStickerLocal;

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("准备归档");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  
  // Hall Selection State
  const [selectedHallId, setSelectedHallId] = useState<string | null>(null);
  const [showHallSelector, setShowHallSelector] = useState(false);
  const [editingResultHall, setEditingResultHall] = useState(false);
  const [aiDetectedCategory, setAiDetectedCategory] = useState<string>('');
  
  // Batch Mode State
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);

  const [generatedSticker, setGeneratedSticker] = useState<Sticker | null>(null);
  const [errorInfo, setErrorInfo] = useState<AnalysisError | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [memoryDraft, setMemoryDraft] = useState('');
  const [memoryVoiceError, setMemoryVoiceError] = useState<string | null>(null);
  const [isRecordingMemoryDraft, setIsRecordingMemoryDraft] = useState(false);
  const [isSavingMemoryDraft, setIsSavingMemoryDraft] = useState(false);
  const [memorySaveState, setMemorySaveState] = useState<string | null>(null);
  const [audioDraftUrl, setAudioDraftUrl] = useState('');
  const [audioRecordError, setAudioRecordError] = useState<string | null>(null);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);

  const hallsSafe = Array.isArray(halls) ? halls : [];
  const selectedHallName = hallsSafe.find(h => h.id === selectedHallId)?.name;
  const isVoiceArchiveCapturing = isRecordingMemoryDraft || isRecordingAudio;
  const isExpandedScannerLayout = isBatchMode || isAnalyzing || isGeneratingSticker || !!analysisResult;
  const memoryDraftDirty = Boolean(analysisResult && memoryDraft.trim() !== (analysisResult.story || '').trim());
  const audioDraftDirty = Boolean(analysisResult && audioDraftUrl !== (analysisResult.audioUrl || ''));
  const archiveDraftDirty = memoryDraftDirty || audioDraftDirty;

  // Track blob URLs for cleanup on unmount to avoid revoking on state updates
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const memoryDraftRef = useRef('');
  const audioDraftRef = useRef('');
  const memoryCaptureRef = useRef<SpeechCaptureSession | null>(null);
  const audioRecordingRef = useRef<AudioRecordingSession | null>(null);
  const analyzingLeftRef = useRef<HTMLDivElement>(null);
  const [analyzingPanelHeight, setAnalyzingPanelHeight] = useState<number | null>(null);

  useEffect(() => {
    memoryDraftRef.current = memoryDraft;
  }, [memoryDraft]);

  useEffect(() => {
    audioDraftRef.current = audioDraftUrl;
  }, [audioDraftUrl]);

  useEffect(() => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      blobUrlsRef.current.add(previewUrl);
    }
    batchItems.forEach(item => {
      if (item.previewUrl && item.previewUrl.startsWith('blob:')) {
        blobUrlsRef.current.add(item.previewUrl);
      }
    });
  }, [previewUrl, batchItems]);

  // Cleanup Blob URLs only on unmount
  useEffect(() => {
    return () => {
      memoryCaptureRef.current?.stop();
      audioRecordingRef.current?.cancel();
      blobUrlsRef.current.forEach(url => {
        URL.revokeObjectURL(url);
      });
    };
  }, []);

  // Sync single-scan success UI when sticker is generated in global background task
  useEffect(() => {
    if (!analysisResult || !existingStickers?.length) return;
    const matchedSticker = existingStickers.find(s => s.originalItemId === analysisResult.id);
    if (matchedSticker) {
      setGeneratedSticker(matchedSticker);
    }
  }, [analysisResult, existingStickers]);

  useEffect(() => {
    setAudioDraftUrl(analysisResult?.audioUrl || '');
    setAudioRecordError(null);
    setIsRecordingAudio(false);
  }, [analysisResult]);

  useEffect(() => {
    if (isGeneratingSticker) {
      setStatusText('正在生成专属贴纸与藏品物语');
    }
  }, [isGeneratingSticker]);

  useEffect(() => {
    if (!isAnalyzing && !isGeneratingSticker) {
      setAnalyzingPanelHeight(null);
      return;
    }

    const node = analyzingLeftRef.current;
    if (!node || typeof window === 'undefined') {
      return;
    }

    const updateHeight = () => {
      if (window.innerWidth < 1280) {
        setAnalyzingPanelHeight(null);
        return;
      }
      setAnalyzingPanelHeight(Math.ceil(node.getBoundingClientRect().height));
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    window.addEventListener('resize', updateHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, [isAnalyzing, isGeneratingSticker, previewUrl, statusText]);

  // Sync batch mode UI with global generation state
  useEffect(() => {
    if (!existingStickers) return;
    setBatchItems(prev => {
      let changed = false;
      const next = prev.map(item => {
        if (!item.result) return item;

        const globalGenerating = !!generatingStickersGlobal[item.result.id];
        const matchedSticker = existingStickers.find(s => s.originalItemId === item.result!.id);

        const shouldUpdateGenerating = item.isGeneratingSticker !== globalGenerating;
        const shouldUpdateSticker = !!matchedSticker && item.generatedSticker?.id !== matchedSticker.id;

        if (!shouldUpdateGenerating && !shouldUpdateSticker) return item;

        changed = true;
        return {
          ...item,
          isGeneratingSticker: globalGenerating,
          generatedSticker: matchedSticker ?? item.generatedSticker,
        };
      });

      return changed ? next : prev;
    });
  }, [generatingStickersGlobal, existingStickers]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    // Abort any in-flight analysis
    if (abortRef.current) {
      abortRef.current.abort();
    }

    setErrorInfo(null);
    setAnalysisSourceImageUrl(null);
    setGeneratedSticker(null);
    setMemoryDraft('');
    setMemoryVoiceError(null);
    setMemorySaveState(null);
    setAudioDraftUrl('');
    setAudioRecordError(null);
    setAnalysisSourceImageUrl(null);
    memoryCaptureRef.current?.stop();
    memoryCaptureRef.current = null;
    audioRecordingRef.current?.cancel();
    audioRecordingRef.current = null;
    setIsRecordingMemoryDraft(false);
    setIsRecordingAudio(false);

    // Single file flow (camera / album single)
    if (files.length === 1) {
      setIsBatchMode(false);
      const file = files[0];

      // Revoke previous Blob URL
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }

      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setLastFile(file);

      // Auto start analysis, pass url directly to avoid stale state
      await processImage(file, url);
      e.target.value = '';
      return;
    }

    // Batch flow (album multi-select)
    setIsBatchMode(true);
    setStatusText(`检测到 ${files.length} 张图片，开始批量分析...`);
    
    // Revoke old batch URLs
    batchItems.forEach(item => {
      if (item.previewUrl && item.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });

    const newBatchItems: BatchItem[] = files.map(file => ({
      id: self.crypto?.randomUUID?.() ?? (`${Date.now()}-${Math.random().toString(36).slice(2, 11)}`),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'pending'
    }));

    setBatchItems(newBatchItems);
    e.target.value = '';

    // Create a new abort controller for the batch process if none exists or it is aborted
    const controller = new AbortController();
    abortRef.current = controller;

    for (const item of newBatchItems) {
      if (controller.signal.aborted) break;
      await processBatchItem(item.id, item.file, item.previewUrl);
    }
  };

  const stopMemoryCapture = () => {
    memoryCaptureRef.current?.stop();
    memoryCaptureRef.current = null;
    setIsRecordingMemoryDraft(false);
  };

  const stopAudioDraftCapture = async () => {
    const session = audioRecordingRef.current;
    if (!session) {
      setIsRecordingAudio(false);
      return;
    }

    audioRecordingRef.current = null;

    try {
      const recorded = await session.stop();
      setAudioDraftUrl(recorded.dataUrl);
      setAudioRecordError(null);
      setMemorySaveState(null);
    } catch (error) {
      setAudioRecordError(error instanceof Error ? error.message : '录音保存失败。');
    } finally {
      setIsRecordingAudio(false);
    }
  };

  const handleSaveMemoryDraft = async () => {
    if (!analysisResult || !archiveDraftDirty || !onUpdateItem) {
      return;
    }

    setIsSavingMemoryDraft(true);
    setMemorySaveState(null);

    try {
      const updatedItem = {
        ...analysisResult,
        story: memoryDraft.trim(),
        audioUrl: audioDraftUrl,
      };
      setAnalysisResult(updatedItem);
      const persistedItem = await onUpdateItem(updatedItem);
      if (persistedItem) {
        setAnalysisResult(persistedItem);
      }
      setMemorySaveState('记忆内容已更新到藏品档案。');
    } catch (error) {
      console.error('\u4fdd\u5b58\u626b\u63cf\u7ed3\u679c\u7684\u8bb0\u5fc6\u8349\u7a3f\u5931\u8d25\uff1a', error);
      setMemorySaveState('保存失败，请稍后重试。');
    } finally {
      setIsSavingMemoryDraft(false);
    }
  };

  const handleToggleMemoryCapture = () => {
    if (isRecordingMemoryDraft) {
      stopMemoryCapture();
      return;
    }

    setMemoryVoiceError(null);
    if (!isSpeechRecognitionSupported()) {
      setMemoryVoiceError('当前浏览器不支持语音输入，请改用 Chrome 或 Edge。');
      return;
    }

    let committed = memoryDraftRef.current.trim();
    setIsRecordingMemoryDraft(true);
    memoryCaptureRef.current = startSpeechCapture({
      lang: 'zh-CN',
      continuous: true,
      interimResults: true,
      onTranscript: (transcript, isFinal) => {
        const spoken = transcript.trim();
        const next = [committed, spoken].filter(Boolean).join(committed && spoken ? '\n' : '');
        setMemoryDraft(next);
        setMemorySaveState(null);

        if (isFinal) {
          committed = next;
          memoryDraftRef.current = next;
        }
      },
      onError: (message) => {
        setMemoryVoiceError(message);
        setIsRecordingMemoryDraft(false);
      },
      onEnd: () => {
        memoryCaptureRef.current = null;
        setIsRecordingMemoryDraft(false);
      },
    });
  };

  const handleToggleVoiceArchiveCapture = async () => {
    if (isRecordingMemoryDraft || isRecordingAudio) {
      stopMemoryCapture();
      await stopAudioDraftCapture();
      return;
    }

    setMemoryVoiceError(null);
    setAudioRecordError(null);
    setMemorySaveState(null);

    const speechSupported = isSpeechRecognitionSupported();
    const audioSupported = isAudioRecordingSupported();

    if (!speechSupported && !audioSupported) {
      setMemoryVoiceError('当前浏览器不支持语音补录，请改用 Chrome 或 Edge。');
      return;
    }

    if (audioSupported) {
      try {
        audioRecordingRef.current = await startAudioRecording();
        setIsRecordingAudio(true);
      } catch (error) {
        setAudioRecordError(error instanceof Error ? error.message : '录音启动失败。');
        setIsRecordingAudio(false);
      }
    } else {
      setAudioRecordError('当前浏览器不支持录音原声保存，本次只会保留转写文字。');
    }

    if (!speechSupported) {
      setMemoryVoiceError('当前浏览器不支持语音转文字，本次会只保存录音原声。');
      return;
    }

    let committed = memoryDraftRef.current.trim();
    setIsRecordingMemoryDraft(true);
    memoryCaptureRef.current = startSpeechCapture({
      lang: 'zh-CN',
      continuous: true,
      interimResults: true,
      onTranscript: (transcript, isFinal) => {
        const spoken = transcript.trim();
        const next = [committed, spoken].filter(Boolean).join(committed && spoken ? '\n' : '');
        setMemoryDraft(next);
        setMemorySaveState(null);

        if (isFinal) {
          committed = next;
          memoryDraftRef.current = next;
        }
      },
      onError: (message) => {
        setMemoryVoiceError(message);
        memoryCaptureRef.current = null;
        setIsRecordingMemoryDraft(false);
        if (audioRecordingRef.current) {
          void stopAudioDraftCapture();
        }
      },
      onEnd: () => {
        memoryCaptureRef.current = null;
        setIsRecordingMemoryDraft(false);
        if (audioRecordingRef.current) {
          void stopAudioDraftCapture();
        }
      },
    });
  };

  const buildArchivedStory = (userMemory: string, aiStory: string) => {
    const manualStory = userMemory.trim();
    const generatedStory = aiStory.trim();

    if (manualStory && generatedStory) {
      return `${manualStory}\n\nAI档案注记：${generatedStory}`;
    }

    return manualStory || generatedStory;
  };

  const handleToggleAudioRecording = async () => {
    if (isRecordingAudio) {
      if (!audioRecordingRef.current) {
        return;
      }

      try {
        const recorded = await audioRecordingRef.current.stop();
        audioRecordingRef.current = null;
        setAudioDraftUrl(recorded.dataUrl);
        setAudioRecordError(null);
      } catch (error) {
        setAudioRecordError(error instanceof Error ? error.message : '录音保存失败。');
      } finally {
        setIsRecordingAudio(false);
      }
      return;
    }

    if (!isAudioRecordingSupported()) {
      setAudioRecordError('当前浏览器不支持录音，请使用 Chrome 或 Edge。');
      return;
    }

    try {
      audioRecordingRef.current = await startAudioRecording();
      setIsRecordingAudio(true);
      setAudioRecordError(null);
      setMemorySaveState(null);
    } catch (error) {
      setAudioRecordError(error instanceof Error ? error.message : '录音启动失败。');
    }
  };

  const handleClearAudioDraft = () => {
    setAudioDraftUrl('');
    setAudioRecordError(null);
    setMemorySaveState(null);
  };

  const processBatchItem = async (itemId: string, file: File, directUrl: string) => {
    if (abortRef.current?.signal.aborted) return;
    
    setBatchItems(prev => prev.map(item => item.id === itemId ? { ...item, status: 'analyzing' } : item));
    
    try {
      const base64 = await fileToGenerativePart(file);
      if (abortRef.current?.signal.aborted) return;
      
      const analysis = await analyzeItemImage(base64);
      if (abortRef.current?.signal.aborted) return;

      const hallId = selectedHallId || analysis.category;

      const newItem: CollectedItem = {
        id: self.crypto?.randomUUID?.() ?? (`${Date.now()}-${Math.random().toString(36).slice(2,11)}`),
        name: analysis.name,
        hallId,
        category: getHallNameById(hallsSafe, hallId, analysis.category),
        material: analysis.material,
        description: analysis.description || analysis.story || '',
        story: memoryDraftRef.current.trim(),
        tags: analysis.tags,
        imageUrl: `data:${file.type || 'image/jpeg'};base64,${base64}`,
        dateCollected: new Date().toISOString(),
        status: 'raw',
        audioUrl: audioDraftRef.current || undefined,
      };

      const persistedItem = await onItemAdded(newItem);
      setBatchItems(prev => prev.map(item => item.id === itemId ? { ...item, status: 'success', result: persistedItem } : item));
      
    } catch (err: unknown) {
      if (abortRef.current?.signal.aborted) return;
      const error = err as Record<string, unknown>;
      let errorInfo: AnalysisError;
      
      if (error && error.category && error.title && error.suggestion) {
        errorInfo = error as unknown as AnalysisError;
      } else {
        errorInfo = {
          category: 'UNKNOWN',
          title: '分析失败',
          message: (error?.message as string) || '未知错误',
          suggestion: '请重试。如果问题持续出现，尝试更换图片。',
        };
      }
      setBatchItems(prev => prev.map(item => item.id === itemId ? { ...item, status: 'error', error: errorInfo } : item));
    }
  };

  const handleGenerateBatchSticker = async (itemId: string) => {
    const item = batchItems.find(i => i.id === itemId);
    if (!item || !item.result) return;
    
    if (onGenerateStickerRequest) {
      onGenerateStickerRequest(item.result);
      // We don't track the result locally in batch mode if it goes global, 
      // but to keep UI simple, let's mark it as generating locally just for visuals 
      // or rely on global state. Since batch mode doesn't easily read from global state
      // without more mapping, we can set it to generating locally and let them switch away.
      setBatchItems(prev => prev.map(i => i.id === itemId ? { ...i, isGeneratingSticker: true } : i));
      return;
    }

    setBatchItems(prev => prev.map(i => i.id === itemId ? { ...i, isGeneratingSticker: true } : i));

    try {
      const base64 = await imageUrlToBase64(item.result.imageUrl, {
        compress: true,
        maxWidth: 1024,
        maxHeight: 1024,
        quality: 0.74,
        outputType: 'image/jpeg',
      });
      const { stickerImageUrl, dramaText } = await generateSticker(base64, item.result.name);

      const newSticker: Sticker = {
        id: self.crypto?.randomUUID?.() ?? (`${Date.now()}-${Math.random().toString(36).slice(2, 11)}`),
        originalItemId: item.result.id,
        stickerImageUrl: stickerImageUrl,
        dramaText: dramaText,
        category: item.result.category,
        dateCreated: new Date().toISOString()
      };

      setBatchItems(prev => prev.map(i => 
        i.id === itemId ? { ...i, isGeneratingSticker: false, generatedSticker: newSticker } : i
      ));
      await onStickerCreated(newSticker);
    } catch (e: unknown) {
      console.error("\u6279\u91cf\u751f\u6210\u8d34\u7eb8\u5931\u8d25\uff1a", e);
      setBatchItems(prev => prev.map(i => i.id === itemId ? { ...i, isGeneratingSticker: false } : i));
    }
  };

  const processImage = async (file: File, directUrl?: string) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setIsAnalyzing(true);
    setStatusText('\u6b63\u5728\u538b\u7f29\u56fe\u7247...');
    setAnalysisResult(null);
    setGeneratedSticker(null);
    setErrorInfo(null);

    const effectiveImageUrl = directUrl || previewUrl || '';

    try {
      const base64 = await fileToGenerativePart(file);
      if (controller.signal.aborted) return;

      setStatusText('\u89c6\u89c9\u8bc6\u522b\u4e2d...');
      const analysis = await analyzeItemImage(base64);
      if (controller.signal.aborted) return;

      setStatusText('\u6b63\u5728\u6574\u7406\u85cf\u54c1\u4fe1\u606f...');
      const hallId = selectedHallId || analysis.category;
      const initialStory = buildArchivedStory(memoryDraftRef.current, analysis.story || '');

      const newItem: CollectedItem = {
        id: self.crypto?.randomUUID?.() ?? (`${Date.now()}-${Math.random().toString(36).slice(2,11)}`),
        name: analysis.name,
        hallId,
        category: getHallNameById(hallsSafe, hallId, analysis.category),
        material: analysis.material,
        description: analysis.description || analysis.story || '',
        story: initialStory,
        tags: analysis.tags,
        imageUrl: `data:${file.type || 'image/jpeg'};base64,${base64}`,
        dateCollected: new Date().toISOString(),
        status: 'raw',
      };

      setStatusText('\u6b63\u5728\u4fdd\u5b58\u5230\u85cf\u54c1\u9986...');
      let nextAnalysisResult = await onItemAdded(newItem);
      const latestDraftStory = memoryDraftRef.current.trim();
      const latestAudioDraft = audioDraftRef.current;
      const latestStory = buildArchivedStory(latestDraftStory, analysis.story || '');

      nextAnalysisResult = {
        ...nextAnalysisResult,
        story: nextAnalysisResult.story || newItem.story,
        audioUrl: nextAnalysisResult.audioUrl || newItem.audioUrl,
      };

      const shouldSyncLatestDraft =
        latestStory !== (nextAnalysisResult.story || '').trim()
        || latestAudioDraft !== (nextAnalysisResult.audioUrl || '');

      if (shouldSyncLatestDraft && onUpdateItem) {
        const latestDraftItem: CollectedItem = {
          ...nextAnalysisResult,
          story: latestStory,
          audioUrl: latestAudioDraft,
        };

        setAnalysisResult(latestDraftItem);

        try {
          const persistedLatestDraft = await onUpdateItem(latestDraftItem);
          if (persistedLatestDraft) {
            nextAnalysisResult = {
              ...latestDraftItem,
              ...persistedLatestDraft,
              story: persistedLatestDraft.story ?? latestDraftItem.story,
              audioUrl: persistedLatestDraft.audioUrl ?? latestDraftItem.audioUrl,
            };
          } else {
            nextAnalysisResult = latestDraftItem;
          }
          setMemorySaveState('\u7b49\u5f85\u5f52\u6863\u65f6\u8865\u5145\u7684\u6545\u4e8b\u5df2\u81ea\u52a8\u4fdd\u5b58\u3002');
        } catch (saveError) {
          console.error('\u540c\u6b65\u6700\u65b0\u6545\u4e8b\u8349\u7a3f\u5931\u8d25\uff1a', saveError);
          setMemorySaveState('\u6700\u65b0\u8f93\u5165\u5df2\u4fdd\u7559\u5728\u5f53\u524d\u754c\u9762\uff0c\u53ef\u7ee7\u7eed\u8865\u5145\u540e\u518d\u4fdd\u5b58\u3002');
        }
      } else {
        setMemorySaveState(null);
      }

      setAiDetectedCategory(analysis.category);
      setAnalysisSourceImageUrl(newItem.imageUrl);
      setAnalysisResult(nextAnalysisResult);
      stopMemoryCapture();
      setIsAnalyzing(false);
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      const error = err as Record<string, unknown>;
      if (error && error.category && error.title && error.suggestion) {
        setErrorInfo(error as unknown as AnalysisError);
      } else {
        setErrorInfo({
          category: 'UNKNOWN',
          title: '\u5206\u6790\u5931\u8d25',
          message: (error?.message as string) || '\u672a\u77e5\u9519\u8bef',
          suggestion: '\u8bf7\u91cd\u8bd5\u3002\u5982\u679c\u95ee\u9898\u6301\u7eed\u51fa\u73b0\uff0c\u5c1d\u8bd5\u66f4\u6362\u56fe\u7247\u3002',
        });
      }
      stopMemoryCapture();
      setIsAnalyzing(false);
    }
  };

  const handleGenerateSticker = async () => {
    if (!analysisResult) return;
    
    if (onGenerateStickerRequest) {
      setStatusText('\u6b63\u5728\u751f\u6210\u4e13\u5c5e\u8d34\u7eb8...');
      onGenerateStickerRequest({
        ...analysisResult,
        imageUrl: analysisSourceImageUrl || analysisResult.imageUrl,
      });
      return;
    }

    setIsGeneratingSticker(true);
    setStatusText('\u6b63\u5728\u751f\u6210\u4e13\u5c5e\u8d34\u7eb8...');

    try {
        const base64 = await imageUrlToBase64(analysisSourceImageUrl || analysisResult.imageUrl, {
          compress: true,
          maxWidth: 1024,
          maxHeight: 1024,
          quality: 0.74,
          outputType: 'image/jpeg',
        });

        const { stickerImageUrl, dramaText } = await generateSticker(base64, analysisResult.name);
        
        const newSticker: Sticker = {
            id: self.crypto?.randomUUID?.() ?? (`${Date.now()}-${Math.random().toString(36).slice(2,11)}`),
            originalItemId: analysisResult.id,
            stickerImageUrl: stickerImageUrl,
            dramaText: dramaText,
            category: analysisResult.category,
            dateCreated: new Date().toISOString()
        };

        setGeneratedSticker(newSticker);
        await onStickerCreated(newSticker);
    } catch (e: unknown) {
        const error = e as Record<string, unknown>;
        if (error && error.category && error.title && error.suggestion) {
          setErrorInfo(error as unknown as AnalysisError);
        } else {
          setErrorInfo({
            category: 'UNKNOWN',
            title: '贴纸生成失败',
            message: (error?.message as string) || '未知错误',
            suggestion: '请重试。如果问题持续，尝试重新拍摄图片。',
          });
        }
    } finally {
        setIsGeneratingSticker(false);
    }
  };

  const triggerInput = () => fileInputRef.current?.click();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const triggerCamera = () => cameraInputRef.current?.click();

  return (
    <div className="h-full flex flex-col items-center justify-start pt-12 md:justify-center p-4 md:p-6 relative bg-remuse-dark overflow-y-auto">
      <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none"></div>

      <button 
        onClick={onCancel}
        aria-label="关闭扫描仪"
        className="absolute top-4 right-4 text-neutral-400 hover:text-white"
      >
        <X size={24} />
      </button>

      <div className={`${isExpandedScannerLayout ? 'max-w-6xl' : 'max-w-md'} w-full relative z-10`}>
        
        {/* Header (Only show if not in result view) */}
        {!isBatchMode && !analysisResult && !isAnalyzing && !errorInfo && (
            <div className="text-center mb-10">
                <h2 className="text-4xl font-display font-bold tracking-tight mb-2 text-white">
                    ARCHIVE <span className="text-remuse-accent">ENTITY</span>
                </h2>
                <p className="text-neutral-400 text-sm">
                    将实体物品数字化以进行再生。
                </p>
            </div>
        )}

        {/* --- STATE BATCH: BATCH MODE --- */}
        {isBatchMode && (
          <div className="bg-remuse-panel border border-remuse-border p-4 md:p-6 clip-corner shadow-2xl animate-fade-in w-full max-w-xl mx-auto">
            <div className="flex items-center justify-between mb-4 border-b border-neutral-800 pb-4">
              <h3 className="text-xl font-bold font-display text-white flex items-center gap-2">
                <Box size={20} className="text-remuse-accent" />
                批量归档 {batchItems.filter(i => i.status === 'success').length}/{batchItems.length}
              </h3>
            </div>
            
            <div className="max-h-[50vh] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
              {batchItems.map((item) => (
                <div key={item.id} className="bg-neutral-900 border border-neutral-800 p-3 flex gap-4 items-center rounded-lg">
                  <div className="relative w-16 h-16 shrink-0">
                    <img src={item.previewUrl} alt="Preview" className="w-full h-full object-cover rounded opacity-80" />
                    {item.status === 'analyzing' && (
                      <div className="absolute inset-0 bg-black/60 flex flex-col justify-center items-center rounded">
                        <Loader2 size={16} className="text-remuse-accent animate-spin mb-1" />
                        <span className="text-[10px] font-mono text-remuse-accent">读取中</span>
                      </div>
                    )}
                    {item.status === 'success' && (
                      <div className="absolute -top-2 -right-2 bg-remuse-secondary text-black rounded-full p-1 border-2 border-neutral-900">
                        <Check size={12} strokeWidth={3} />
                      </div>
                    )}
                    {item.status === 'error' && (
                      <div className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 border-2 border-neutral-900">
                        <AlertTriangle size={12} strokeWidth={3} />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    {item.status === 'pending' && <p className="text-neutral-500 text-sm font-mono">等待接入神经元网络...</p>}
                    {item.status === 'analyzing' && <p className="text-remuse-secondary text-sm font-mono animate-pulse">正在处理视觉数据包...</p>}
                    {item.status === 'success' && item.result && (
                      <>
                        <p className="text-white font-bold truncate">{item.result.name}</p>
                        <p className="text-neutral-400 font-mono text-xs mt-1">
                          <span className="text-remuse-accent">{item.result.category}</span> · {item.result.material}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <button
                            onClick={() => onViewDetail(item.result!)}
                            className="flex items-center gap-1.5 text-xs font-mono bg-remuse-accent/10 hover:bg-remuse-accent/20 text-remuse-accent px-2 py-1 rounded border border-remuse-accent/20 transition-colors shrink-0"
                          >
                            <Box size={12} className="shrink-0" /> 查看藏品档案
                          </button>
                        </div>
                      </>
                    )}
                    {item.status === 'error' && item.error && (
                      <>
                        <p className="text-red-400 font-bold text-sm">未能处理</p>
                        <p className="text-red-900 font-mono text-xs mt-1 truncate">{item.error.title}: {item.error.message}</p>
                      </>
                    )}
                  </div>

                  {item.status === 'error' && (
                    <button 
                      onClick={() => processBatchItem(item.id, item.file, item.previewUrl)}
                      className="shrink-0 p-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded transition-colors"
                      title="重试"
                    >
                      <RefreshCw size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={onReset || onCancel}
                className="flex-1 py-3 border border-neutral-700 text-neutral-400 hover:text-white hover:border-white transition-colors font-display text-sm"
              >
                结束批量归档
              </button>
            </div>
          </div>
        )}

        {/* --- STATE 1: ANALYZING / GENERATING STICKER --- */}
        {!isBatchMode && (isAnalyzing || isGeneratingSticker) && (
          <div className="bg-remuse-panel border border-remuse-border p-6 md:p-8 rounded-none clip-corner animate-fade-in grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)] items-start">
            <div ref={analyzingLeftRef} className="rounded-[28px] border border-neutral-800 bg-neutral-950/70 px-6 py-8 flex min-h-[360px] xl:min-h-[430px] flex-col items-center justify-center text-center">
            <div className="relative w-32 h-32 mb-6">
                 {/* 底部脉冲光圈 */}
                 <div className="absolute inset-[-10px] border-2 border-remuse-accent rounded-full animate-ping opacity-20"></div>
                 <div className="absolute inset-[-20px] border border-remuse-secondary rounded-full animate-ping opacity-10" style={{ animationDelay: '0.5s' }}></div>
                 
                 {/* 蓝边动态闭环 / 扫描环 */}
                 <div className="absolute inset-0 z-10">
                   <svg className="w-full h-full animate-spin" viewBox="0 0 120 120" style={{ animationDuration: '3s' }}>
                     <defs>
                       <linearGradient id="scan-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                         <stop offset="0%" stopColor="#00ffff" stopOpacity="1" />
                         <stop offset="50%" stopColor="#00ffff" stopOpacity="0.5" />
                         <stop offset="100%" stopColor="#ccff00" stopOpacity="0" />
                       </linearGradient>
                     </defs>
                     <circle cx="60" cy="60" r="58" stroke="url(#scan-gradient)" strokeWidth="3" fill="none" strokeDasharray="360" strokeDashoffset="60" className="opacity-80" />
                   </svg>
                 </div>
                 
                 {/* 扫描线上下移动特效 */}
                 <div className="absolute inset-0 z-20 overflow-hidden rounded-full">
                     <div className="w-full h-[2px] bg-remuse-secondary opacity-70 shadow-[0_0_8px_2px_#00ffff] animate-[pulse_2s_ease-in-out_infinite]" style={{
                         animation: 'scan-line 2s ease-in-out infinite alternate',
                     }}></div>
                     <style>{`
                         @keyframes scan-line {
                             0% { transform: translateY(0); }
                             100% { transform: translateY(128px); }
                         }
                     `}</style>
                 </div>

                 {previewUrl && (
                   <img src={previewUrl} alt="Scanning" className="w-full h-full object-cover rounded-full opacity-60 mix-blend-luminosity grayscale" />
               )}
            </div>
            <h3 className="text-xl font-display text-remuse-accent animate-pulse text-center">{statusText}</h3>
            {isGeneratingSticker ? (
                <p className="text-xs text-neutral-400 mt-2 font-mono">正在绘制贴纸轮廓...</p>
            ) : (
                <p className="text-xs text-neutral-500 mt-3 leading-6">在识别结束前，你可以同步补充这件物品和你的记忆。</p>
            )}
            </div>

            <div
              className="rounded-[28px] border border-neutral-800 bg-neutral-950/70 p-5 md:p-6 min-w-0 flex flex-col overflow-hidden"
              style={analyzingPanelHeight ? { height: `${analyzingPanelHeight}px` } : undefined}
            >
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <p className="text-[11px] font-mono tracking-[0.28em] text-remuse-accent uppercase">故事草稿</p>
                    <h4 className="mt-2 text-xl font-display text-white">先把你此刻想到的故事记下来</h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleToggleVoiceArchiveCapture()}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-display transition-colors ${
                      isRecordingMemoryDraft
                        ? 'border-red-500/60 bg-red-500/10 text-red-200'
                        : 'border-remuse-secondary/40 bg-remuse-secondary/10 text-remuse-secondary hover:border-remuse-secondary'
                    }`}
                  >
                    {isRecordingMemoryDraft ? <Square size={14} /> : <Mic size={14} />}
                    {isRecordingMemoryDraft ? '停止记录' : '语音记录'}
                  </button>
                </div>

                <textarea
                  value={memoryDraft}
                  onChange={(event) => {
                    setMemoryDraft(event.target.value);
                    setMemorySaveState(null);
                  }}
                  placeholder="写下你和这件物品的故事。"
                  className="w-full min-h-[220px] resize-none rounded-[24px] border border-neutral-800 bg-black/60 px-5 py-4 text-sm leading-7 text-neutral-100 outline-none transition-colors placeholder:text-neutral-500 focus:border-remuse-accent/60 xl:min-h-0 xl:flex-1"
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-400">
                  {audioDraftUrl ? '已附带一段语音记录' : '可附带一段语音记录'}
                </span>
              </div>

              {memoryVoiceError && (
                <p className="mt-3 text-sm text-red-300">{memoryVoiceError}</p>
              )}
              {audioRecordError && (
                <p className="mt-3 text-sm text-amber-300">{audioRecordError}</p>
              )}
            </div>
          </div>
        )}

        {/* --- STATE ERROR: 差异化错误面板 --- */}
        {!isBatchMode && !isAnalyzing && !isGeneratingSticker && errorInfo && (
          <div className="bg-remuse-panel border border-red-900/60 p-6 clip-corner shadow-2xl animate-fade-in">
            {/* Error Header */}
            <div className="flex items-center gap-3 mb-5 border-b border-neutral-800 pb-4">
              <div className={`p-2 rounded-lg ${
                errorInfo.category === 'NETWORK' ? 'bg-orange-500/10 text-orange-400' :
                errorInfo.category === 'IMAGE_QUALITY' ? 'bg-yellow-500/10 text-yellow-400' :
                errorInfo.category === 'RATE_LIMIT' ? 'bg-blue-500/10 text-blue-400' :
                errorInfo.category === 'SAFETY' ? 'bg-red-500/10 text-red-400' :
                'bg-neutral-500/10 text-neutral-400'
              }`}>
                {errorInfo.category === 'NETWORK' && <WifiOff size={22} />}
                {errorInfo.category === 'IMAGE_QUALITY' && <ImageOff size={22} />}
                {errorInfo.category === 'RATE_LIMIT' && <Clock size={22} />}
                {errorInfo.category === 'SAFETY' && <ShieldAlert size={22} />}
                {(errorInfo.category === 'PARSE_ERROR' || errorInfo.category === 'UNKNOWN') && <AlertTriangle size={22} />}
              </div>
              <div>
                <h3 className="text-lg font-bold font-display text-white">{errorInfo.title}</h3>
                <span className="text-[10px] font-mono text-neutral-400 uppercase">
                  ERR_{errorInfo.category}
                </span>
              </div>
            </div>

            {/* Error Detail */}
            <div className="mb-5 bg-neutral-900 p-4 border-l-2 border-red-500/60 rounded-r">
              <p className="text-sm text-neutral-300 mb-2">{errorInfo.message}</p>
            </div>

            {/* Suggestion */}
            <div className="mb-6 bg-remuse-accent/5 border border-remuse-accent/20 p-4 rounded">
              <p className="text-xs font-display text-remuse-accent font-bold mb-1">建议操作</p>
              <p className="text-sm text-neutral-300">{errorInfo.suggestion}</p>
            </div>

            {/* Preview thumbnail if available */}
            {previewUrl && (
              <div className="mb-5 flex items-center gap-3">
                <img src={previewUrl} alt="Preview" className="w-16 h-16 object-cover rounded border border-neutral-700" />
                <span className="text-xs text-neutral-400 font-mono">当前图片</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setErrorInfo(null);
                  setPreviewUrl(null);
                  setLastFile(null);
                }}
                className="py-3 border border-neutral-700 text-neutral-400 hover:text-white hover:border-white transition-colors font-display text-sm"
              >
                重新拍摄
              </button>
              <button
                onClick={async () => {
                  if (lastFile && previewUrl) {
                    setErrorInfo(null);
                    await processImage(lastFile, previewUrl);
                  } else {
                    setErrorInfo(null);
                    setPreviewUrl(null);
                  }
                }}
                className="py-3 bg-remuse-accent text-black font-bold hover:bg-white transition-colors font-display text-sm flex items-center justify-center gap-2"
              >
                <RefreshCw size={16} /> 立即重试
              </button>
            </div>
          </div>
        )}

        {/* --- STATE 2: INITIAL UPLOAD --- */}
        {!isBatchMode && !isAnalyzing && !analysisResult && !isGeneratingSticker && !errorInfo && (
          <div className="space-y-6">
            <div className="flex justify-center">
                <ScrambleButton 
                  text="选择展馆类型" 
                    onClick={() => setShowHallSelector(true)} 
                    isActive={!!selectedHallId}
                    subText={selectedHallName}
                />
            </div>
            <div 
              className="group border-2 border-dashed border-neutral-700 bg-remuse-panel/50 p-6 md:p-8 flex flex-col items-center justify-center min-h-[240px] md:min-h-[300px] clip-corner"
            >
              {/* Hidden file inputs */}
              <input 
                type="file" 
                accept="image/*" 
                multiple
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileChange}
                data-testid="scanner-upload-input"
              />
              <input 
                type="file" 
                accept="image/*" 
                capture="environment"
                className="hidden" 
                ref={cameraInputRef}
                onChange={handleFileChange}
              />

              <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mb-4">
                <Camera size={32} className="text-neutral-400" />
              </div>
              <span className="font-display text-lg text-neutral-300 mb-1">归档你的物品</span>
              <span className="text-xs text-neutral-400 font-mono text-center mb-6">
                支持 JPG, PNG · 相册可多选批量分析
              </span>

              {/* Two action buttons */}
              <div className="flex gap-3 w-full max-w-xs">
                <button
                  onClick={triggerCamera}
                  aria-label="使用相机拍照"
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-remuse-accent text-black font-bold font-display text-sm hover:bg-white transition-colors clip-corner focus:outline-none focus:ring-2 focus:ring-remuse-accent"
                >
                  <Camera size={18} /> 拍照
                </button>
                <button
                  onClick={triggerInput}
                  aria-label="从相册选择图片（支持多选）"
                  className="flex-1 flex items-center justify-center gap-2 py-3 border border-neutral-600 text-neutral-300 font-display text-sm hover:border-white hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-remuse-secondary"
                  data-testid="scanner-open-upload"
                >
                  <Upload size={18} /> 相册
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- STATE 3: RESULT & ACTIONS --- */}
        {!isBatchMode && !isAnalyzing && analysisResult && !isGeneratingSticker && (
            <div className="bg-remuse-panel border border-remuse-border p-4 md:p-6 clip-corner shadow-2xl animate-fade-in max-h-[calc(100dvh-8rem)] overflow-y-auto">
                <div className="flex items-center justify-between mb-4 md:mb-6 border-b border-neutral-800 pb-4">
                    <h3 className="text-xl font-bold font-display text-white flex items-center gap-2">
                        <Check size={20} className="text-remuse-accent" />
                        归档成功
                    </h3>
                    <div className="bg-neutral-900 px-2 py-1 rounded text-xs text-neutral-400 font-mono">
                        ID: {analysisResult.id.slice(0,6)}
                    </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(380px,1.05fr)] items-start">
                <div className="min-w-0 flex flex-col">
                <div className="flex flex-col gap-4 mb-6 rounded-[28px] border border-neutral-800 bg-neutral-950/70 p-4 md:p-5 sm:flex-row">
                    <img src={analysisSourceImageUrl || analysisResult.imageUrl} alt="Result" className="h-28 w-28 shrink-0 rounded-2xl object-cover border border-neutral-700 bg-neutral-900" />
                    <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-white text-2xl leading-tight">{analysisResult.name}</h4>
                        <button
                            onClick={() => { setEditingResultHall(true); setShowHallSelector(true); }}
                            className="mt-1 inline-flex max-w-full items-center gap-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs px-3 py-1.5 rounded-full mb-2 transition-colors group"
                            title="点击修改所属馆"
                        >
                            <Box size={10} className="text-remuse-accent shrink-0" />
                            <span>已归入：<span className="text-remuse-secondary font-bold">{getHallNameById(hallsSafe, analysisResult.hallId, analysisResult.category)}</span></span>
                            <Edit2 size={10} className="text-neutral-600 group-hover:text-remuse-accent transition-colors ml-0.5 shrink-0" />
                        </button>
                        <p className="text-neutral-400 text-sm leading-7 line-clamp-4">{analysisResult.description || memoryDraft.trim() || analysisResult.story || '还没有生成这件藏品的档案说明。'}</p>
                    </div>
                </div>
                
                <button
                    onClick={async () => {
                      if (archiveDraftDirty) {
                        await handleSaveMemoryDraft();
                      }
                      onNavigateToWorkshop?.();
                    }}
                    className="w-full mb-4 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-white py-3 font-display text-sm flex items-center justify-center gap-2 transition-colors group rounded-[20px]"
                    data-testid="scanner-open-workshop"
                >
                    <Box size={16} className="text-remuse-secondary shrink-0" />
                    前往再生工坊
                </button>

                <div className="grid gap-3 sm:grid-cols-2">
                    <button
                        onClick={async () => {
                          if (archiveDraftDirty) {
                            await handleSaveMemoryDraft();
                          }
                          (onReset || onCancel)?.();
                        }}
                        className="py-3 border border-neutral-700 text-neutral-300 hover:text-white hover:border-white transition-colors font-display text-sm rounded-[20px]"
                        data-testid="scanner-continue-archive"
                    >
                        继续归档
                    </button>
                    <button
                        onClick={async () => {
                          if (archiveDraftDirty) {
                            await handleSaveMemoryDraft();
                          }
                          if (analysisResult) {
                            onViewDetail({
                              ...analysisResult,
                              story: memoryDraft.trim() || analysisResult.story,
                              audioUrl: audioDraftUrl || analysisResult.audioUrl,
                            });
                          }
                        }}
                        className="py-3 bg-remuse-accent text-black font-bold hover:bg-white transition-colors font-display text-sm flex items-center justify-center gap-2 rounded-[20px]"
                        data-testid="scanner-view-archive"
                    >
                        查看藏品档案 <ArrowRight size={16} />
                    </button>
                </div>

                {/* 前往所属展馆快捷入口 */}
                {onNavigateToHall && analysisResult && (
                    <button
                        onClick={async () => {
                          if (archiveDraftDirty) {
                            await handleSaveMemoryDraft();
                          }
                          onNavigateToHall(analysisResult.hallId);
                        }}
                        className="w-full mt-3 py-2.5 bg-neutral-800/60 hover:bg-neutral-700 border border-neutral-700 hover:border-remuse-secondary text-neutral-300 hover:text-white transition-all font-display text-xs flex items-center justify-center gap-2 rounded-[18px] group"
                        data-testid="scanner-go-to-hall"
                    >
                        <Box size={14} className="text-remuse-secondary" />
                        前往「{getHallNameById(hallsSafe, analysisResult.hallId, analysisResult.category)}」展馆查看
                        <ArrowRight size={14} className="text-neutral-600 group-hover:text-remuse-secondary transition-colors" />
                    </button>
                )}

                </div>

                <div className="rounded-[28px] border border-neutral-800 bg-neutral-950/70 p-5 md:p-6 min-w-0 flex flex-col">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div>
                            <p className="text-[11px] font-mono tracking-[0.28em] text-remuse-accent uppercase">故事档案</p>
                            <h4 className="mt-2 text-xl font-display text-white">归档后继续补充这件藏品的故事</h4>
                        </div>
                        <button
                            type="button"
                            onClick={() => void handleToggleVoiceArchiveCapture()}
                            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-display transition-colors ${
                              isRecordingMemoryDraft
                                ? 'border-red-500/60 bg-red-500/10 text-red-200'
                                : 'border-remuse-secondary/40 bg-remuse-secondary/10 text-remuse-secondary hover:border-remuse-secondary'
                            }`}
                        >
                            {isRecordingMemoryDraft ? <Square size={14} /> : <Mic size={14} />}
                            {isRecordingMemoryDraft ? '停止记录' : '继续语音补录'}
                        </button>
                    </div>

                    <textarea
                        value={memoryDraft}
                        onChange={(event) => {
                          setMemoryDraft(event.target.value);
                          setMemorySaveState(null);
                        }}
                        placeholder="继续补充这件藏品的故事、时间或场景。"
                        className="w-full min-h-[220px] resize-y rounded-[24px] border border-neutral-800 bg-black/60 px-5 py-4 text-sm leading-7 text-neutral-100 outline-none transition-colors placeholder:text-neutral-500 focus:border-remuse-accent/60 xl:min-h-[140px] xl:flex-1 xl:resize-none"
                    />

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <span className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-400">
                            识别结束后仍可继续编辑
                        </span>
                        <span className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-400">
                            保存后会同步更新记忆索引
                        </span>
                    </div>

                    {false && (
                    <div className="mt-4 rounded-[24px] border border-neutral-800 bg-black/30 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-remuse-accent/12 text-remuse-accent">
                                    <Volume2 size={16} />
                                </div>
                                <div>
                                    <p className="text-sm text-white">{audioDraftUrl ? '已保存录音草稿' : '还没有录音'}</p>
                                    <p className="text-xs text-neutral-500">录音会进入藏品档案，之后可在卡片封面的扬声器按钮中直接播放。</p>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => void handleToggleAudioRecording()}
                                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-display transition-colors ${
                                      isRecordingAudio
                                        ? 'border-red-500/60 bg-red-500/10 text-red-200'
                                        : 'border-neutral-700 text-neutral-200 hover:border-white hover:text-white'
                                    }`}
                                >
                                    {isRecordingAudio ? <Square size={14} /> : <Mic size={14} />}
                                    {isRecordingAudio ? '停止录音' : '录一段声音'}
                                </button>

                                {audioDraftUrl ? (
                                    <button
                                        type="button"
                                        onClick={handleClearAudioDraft}
                                        className="inline-flex items-center gap-2 rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition-colors hover:border-white hover:text-white"
                                    >
                                        <X size={14} />
                                        删除录音
                                    </button>
                                ) : null}
                            </div>
                        </div>

                        {audioDraftUrl ? (
                            <audio controls src={audioDraftUrl} className="mt-4 w-full" />
                        ) : null}

                        {audioRecordError ? (
                            <p className="mt-3 text-sm text-red-300">{audioRecordError}</p>
                        ) : null}
                    </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <span className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-400">
                            {audioDraftUrl ? '本次补录已附带语音原声' : '语音补录会同时保存原声'}
                        </span>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm text-neutral-500">
                            {memorySaveState || (archiveDraftDirty ? '你有尚未保存的档案修改。' : '当前档案内容已和藏品记录同步。')}
                        </div>
                        <button
                            type="button"
                            disabled={!archiveDraftDirty || isSavingMemoryDraft}
                            onClick={handleSaveMemoryDraft}
                            className="inline-flex items-center gap-2 rounded-full bg-remuse-accent px-4 py-2 text-sm font-display font-bold text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                        >
                            {isSavingMemoryDraft ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            保存记忆到档案
                        </button>
                    </div>

                    {memoryVoiceError && (
                      <p className="mt-3 text-sm text-red-300">{memoryVoiceError}</p>
                    )}
                    {audioRecordError && (
                      <p className="mt-3 text-sm text-amber-300">{audioRecordError}</p>
                    )}
                </div>
                </div>
            </div>
        )}

      </div>

      {/* Hall Selection Modal (Same as before) */}
      {showHallSelector && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-remuse-panel border border-remuse-border w-full max-w-md max-h-[80vh] flex flex-col clip-corner shadow-2xl">
                  <div className="p-4 border-b border-remuse-border flex justify-between items-center bg-neutral-900">
                      <h3 className="text-white font-display font-bold flex items-center gap-2">
                          <Box size={16} className="text-remuse-accent"/>
                          {editingResultHall ? '修改所属展馆' : 'TARGET DESTINATION'}
                      </h3>
                      <button onClick={() => { setShowHallSelector(false); setEditingResultHall(false); }} className="text-neutral-500 hover:text-white">
                          <X size={20} />
                      </button>
                  </div>
                  
                  <div className="overflow-y-auto p-2">
                      <div className="grid grid-cols-2 gap-2">
                          <button 
                             onClick={() => {
                               if (editingResultHall && analysisResult) {
                                 const nextHallId = aiDetectedCategory || analysisResult.hallId;
                                 const updated = {
                                   ...analysisResult,
                                   hallId: nextHallId,
                                   category: getHallNameById(hallsSafe, nextHallId, analysisResult.category),
                                 };
                                 setAnalysisResult(updated);
                                 onUpdateItem?.(updated);
                                 setEditingResultHall(false);
                               } else {
                                 setSelectedHallId(null);
                               }
                               setShowHallSelector(false);
                             }}
                             className={`p-4 text-left border font-mono text-xs transition-all ${!selectedHallId && !editingResultHall ? 'bg-remuse-accent text-black border-remuse-accent' : 'bg-transparent border-neutral-800 text-neutral-400 hover:border-neutral-600'}`}
                          >
                              <span className="block font-bold mb-1">AUTO DETECT</span>
                              <span className="opacity-60">AI 自动分类</span>
                          </button>
                          
                          {hallsSafe.map(hall => (
                              <button 
                                  key={hall.id}
                                  onClick={() => {
                                    if (editingResultHall && analysisResult) {
                                      const updated = {
                                        ...analysisResult,
                                        hallId: hall.id,
                                        category: hall.name,
                                      };
                                      setAnalysisResult(updated);
                                      onUpdateItem?.(updated);
                                      setEditingResultHall(false);
                                    } else {
                                      setSelectedHallId(hall.id);
                                    }
                                    setShowHallSelector(false);
                                  }}
                                  className={`p-4 text-left border font-mono text-xs transition-all group relative overflow-hidden ${(editingResultHall ? analysisResult?.hallId === hall.id : selectedHallId === hall.id) ? 'bg-remuse-secondary text-black border-remuse-secondary' : 'bg-transparent border-neutral-800 text-neutral-400 hover:border-neutral-600'}`}
                              >
                                  <span className="block font-bold mb-1 truncate relative z-10">{hall.name}</span>
                                  <span className="opacity-60 relative z-10">ID: {hall.id.substring(0,4)}</span>
                                  <img src={hall.imageUrl} className="absolute inset-0 w-full h-full object-cover opacity-10 grayscale group-hover:opacity-20 transition-opacity" alt="" />
                              </button>
                          ))}
                      </div>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};

export default Scanner;
