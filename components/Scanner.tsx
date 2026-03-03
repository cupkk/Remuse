
import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, Loader2, Sparkles, X, Box, Check, Sticker as StickerIcon, ArrowRight, AlertTriangle, RefreshCw, Wifi, WifiOff, ShieldAlert, ImageOff, Clock } from 'lucide-react';
import { fileToGenerativePart, analyzeItemImage, generateRemuseIdeas, generateSticker, AnalysisError } from '../services/geminiService';
import { CollectedItem, ExhibitionHall, Sticker } from '../types';
import IdeaGenerator from './IdeaGenerator';

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
  onItemAdded: (item: CollectedItem) => void;
  onStickerCreated: (sticker: Sticker) => void;
  onCancel: () => void;
  onReset?: () => void;
  onViewDetail: (item: CollectedItem) => void;
  onCompleteItem?: (id: string) => void;
  onUpdateItem?: (item: CollectedItem) => void;
  onDeleteItem?: (id: string) => void;
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

const Scanner: React.FC<ScannerProps> = ({ halls, onItemAdded, onStickerCreated, onCancel, onReset, onViewDetail, onCompleteItem, onUpdateItem, onDeleteItem }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingSticker, setIsGeneratingSticker] = useState(false);
  
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDetailItem, setPreviewDetailItem] = useState<CollectedItem | null>(null);
  const [statusText, setStatusText] = useState("准备归档");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  
  // Hall Selection State
  const [selectedHallId, setSelectedHallId] = useState<string | null>(null);
  const [showHallSelector, setShowHallSelector] = useState(false);
  
  // Batch Mode State
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  
  // Analysis Result
  const [analysisResult, setAnalysisResult] = useState<CollectedItem | null>(null);
  const [generatedSticker, setGeneratedSticker] = useState<Sticker | null>(null);
  const [errorInfo, setErrorInfo] = useState<AnalysisError | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);

  const selectedHallName = halls.find(h => h.id === selectedHallId)?.name;

  // Track blob URLs for cleanup on unmount to avoid revoking on state updates
  const blobUrlsRef = useRef<Set<string>>(new Set());

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
      blobUrlsRef.current.forEach(url => {
        URL.revokeObjectURL(url);
      });
    };
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    // Abort any in-flight analysis
    if (abortRef.current) {
      abortRef.current.abort();
    }

    setErrorInfo(null);
    setGeneratedSticker(null);

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

  const processBatchItem = async (itemId: string, file: File, directUrl: string) => {
    if (abortRef.current?.signal.aborted) return;
    
    setBatchItems(prev => prev.map(item => item.id === itemId ? { ...item, status: 'analyzing' } : item));
    
    try {
      const base64 = await fileToGenerativePart(file);
      if (abortRef.current?.signal.aborted) return;
      
      const analysis = await analyzeItemImage(base64);
      if (abortRef.current?.signal.aborted) return;

      const ideas = await generateRemuseIdeas(analysis.name, analysis.material);
      if (abortRef.current?.signal.aborted) return;

      const newItem: CollectedItem = {
        id: self.crypto?.randomUUID?.() ?? (`${Date.now()}-${Math.random().toString(36).slice(2,11)}`),
        name: analysis.name,
        category: selectedHallId || analysis.category, 
        material: analysis.material,
        story: analysis.story,
        tags: analysis.tags,
        imageUrl: `data:${file.type || 'image/jpeg'};base64,${base64}`,
        dateCollected: new Date().toISOString(),
        status: 'raw',
        ideas: ideas
      };

      setBatchItems(prev => prev.map(item => item.id === itemId ? { ...item, status: 'success', result: newItem } : item));
      onItemAdded(newItem);
      
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

    setBatchItems(prev => prev.map(i => i.id === itemId ? { ...i, isGeneratingSticker: true } : i));

    try {
      const base64 = item.result.imageUrl.split(',')[1];
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
      onStickerCreated(newSticker);
    } catch (e: unknown) {
      console.error("Batch sticker generation failed:", e);
      setBatchItems(prev => prev.map(i => i.id === itemId ? { ...i, isGeneratingSticker: false } : i));
    }
  };

  const processImage = async (file: File, directUrl?: string) => {
    // Abort any previous in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;
    
    setIsAnalyzing(true);
    setStatusText("正在扫描物质结构...");
    setAnalysisResult(null);
    setGeneratedSticker(null);
    setErrorInfo(null);
    
    // Use directly passed URL or fallback to state (though state might be stale if called immediately)
    const effectiveImageUrl = directUrl || previewUrl || '';

    try {
      const base64 = await fileToGenerativePart(file);
      if (controller.signal.aborted) return;
      
      setStatusText("Gemini 视觉系统识别中...");
      const analysis = await analyzeItemImage(base64);
      if (controller.signal.aborted) return;
      
      setStatusText("正在计算再生潜力...");
      const ideas = await generateRemuseIdeas(analysis.name, analysis.material);
      if (controller.signal.aborted) return;

      const newItem: CollectedItem = {
        id: self.crypto?.randomUUID?.() ?? (`${Date.now()}-${Math.random().toString(36).slice(2,11)}`),
        name: analysis.name,
        category: selectedHallId || analysis.category, 
        material: analysis.material,
        story: analysis.story,
        tags: analysis.tags,
        // Store as data URL so blob URL can be safely revoked
        imageUrl: `data:${file.type || 'image/jpeg'};base64,${base64}`,
        dateCollected: new Date().toISOString(),
        status: 'raw',
        ideas: ideas
      };

      setAnalysisResult(newItem);
      onItemAdded(newItem);
      setIsAnalyzing(false);

    } catch (err: unknown) {
      if (controller.signal.aborted) return; // Ignore aborted requests
      const error = err as Record<string, unknown>;
      // 结构化错误：如果是 classifyError 返回的已分类错误，直接使用
      if (error && error.category && error.title && error.suggestion) {
        setErrorInfo(error as unknown as AnalysisError);
      } else {
        setErrorInfo({
          category: 'UNKNOWN',
          title: '分析失败',
          message: (error?.message as string) || '未知错误',
          suggestion: '请重试。如果问题持续出现，尝试更换图片。',
        });
      }
      setIsAnalyzing(false);
    }
  };

  const handleGenerateSticker = async () => {
    if (!analysisResult) return;
    
    setIsGeneratingSticker(true);
    setStatusText("正在生成矢量贴纸与短剧...");

    try {
        // Extract base64 from stored data URL (no blob fetch needed)
        const base64 = analysisResult.imageUrl.split(',')[1];

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
        onStickerCreated(newSticker);
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

      <div className="max-w-md w-full relative z-10">
        
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
                          {item.generatedSticker ? (
                            <div className="flex items-center gap-2 bg-remuse-secondary/10 px-2 py-1 rounded border border-remuse-secondary/20 truncate max-w-full">
                              <img src={item.generatedSticker.stickerImageUrl} alt="Sticker" className="w-5 h-5 object-contain drop-shadow-[0_0_2px_rgba(255,255,255,0.5)] shrink-0" />
                              <span className="text-remuse-secondary text-xs font-mono truncate">已生成贴纸</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleGenerateBatchSticker(item.id)}
                              disabled={item.isGeneratingSticker}
                              className="flex items-center gap-1.5 text-xs font-mono bg-neutral-800 hover:bg-neutral-700 text-white px-2 py-1 rounded border border-neutral-700 transition-colors disabled:opacity-50 shrink-0"
                            >
                              {item.isGeneratingSticker ? (
                                <><Loader2 size={12} className="animate-spin shrink-0" /> 生成中...</>
                              ) : (
                                <><StickerIcon size={12} className="text-remuse-secondary shrink-0" /> 生成贴纸</>
                              )}
                            </button>
                          )}
                          
                          <button
                            onClick={() => setPreviewDetailItem(item.result!)}
                            className="flex items-center gap-1.5 text-xs font-mono bg-remuse-accent/10 hover:bg-remuse-accent/20 text-remuse-accent px-2 py-1 rounded border border-remuse-accent/20 transition-colors shrink-0"
                          >
                            <Box size={12} className="shrink-0" /> 查看详情
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
          <div className="bg-remuse-panel border border-remuse-border p-8 rounded-none clip-corner flex flex-col items-center animate-fade-in">
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
            {isGeneratingSticker && (
                <p className="text-xs text-neutral-400 mt-2 font-mono">Drawing Vector Lines...</p>
            )}
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
                >
                  <Upload size={18} /> 相册
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- STATE 3: RESULT & ACTIONS --- */}
        {!isBatchMode && !isAnalyzing && analysisResult && !isGeneratingSticker && (
            <div className="bg-remuse-panel border border-remuse-border p-4 md:p-6 clip-corner shadow-2xl animate-fade-in max-h-[calc(100vh-8rem)] overflow-y-auto">
                <div className="flex items-center justify-between mb-4 md:mb-6 border-b border-neutral-800 pb-4">
                    <h3 className="text-xl font-bold font-display text-white flex items-center gap-2">
                        <Check size={20} className="text-remuse-accent" />
                        归档成功
                    </h3>
                    <div className="bg-neutral-900 px-2 py-1 rounded text-xs text-neutral-400 font-mono">
                        ID: {analysisResult.id.slice(0,6)}
                    </div>
                </div>

                <div className="flex gap-4 mb-6">
                    <img src={analysisResult.imageUrl} alt="Result" className="w-24 h-24 object-cover border border-neutral-700 bg-neutral-900" />
                    <div>
                        <h4 className="font-bold text-white text-lg">{analysisResult.name}</h4>
                        <span className="inline-block bg-neutral-800 text-neutral-400 text-xs px-2 py-0.5 rounded-full mb-2">
                            {analysisResult.category}
                        </span>
                        <p className="text-neutral-500 text-xs italic font-mono line-clamp-2">"{analysisResult.story}"</p>
                    </div>
                </div>
                
                {generatedSticker ? (
                     <div className="mb-6 bg-neutral-900 p-4 border border-remuse-secondary/50 rounded-lg relative overflow-hidden">
                         <div className="absolute top-0 right-0 bg-remuse-secondary text-black text-[10px] font-bold px-2 py-1">NEW STICKER</div>
                         <div className="flex items-center gap-4">
                            <img src={generatedSticker.stickerImageUrl} alt="Sticker" className="w-20 h-20 object-contain drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]" />
                            <div className="flex-1">
                                <div className="bg-black border border-white p-2 rounded-tl-xl rounded-br-xl">
                                    <p className="text-xs text-white font-mono">"{generatedSticker.dramaText}"</p>
                                </div>
                            </div>
                         </div>
                     </div>
                ) : (
                    <button 
                        onClick={handleGenerateSticker}
                        className="w-full mb-4 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-white py-3 font-display text-sm flex items-center justify-center gap-2 transition-colors group"
                    >
                        <StickerIcon size={16} className="text-remuse-secondary group-hover:animate-bounce" />
                        生成数字贴纸 & 短剧
                    </button>
                )}

                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={onReset || onCancel}
                        className="py-3 border border-neutral-700 text-neutral-400 hover:text-white hover:border-white transition-colors font-display text-sm"
                    >
                        继续归档
                    </button>
                    <button
                        onClick={() => analysisResult && onViewDetail(analysisResult)}
                        className="py-3 bg-remuse-accent text-black font-bold hover:bg-white transition-colors font-display text-sm flex items-center justify-center gap-2"
                    >
                        查看详情 <ArrowRight size={16} />
                    </button>
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
                          <Box size={16} className="text-remuse-accent"/> TARGET DESTINATION
                      </h3>
                      <button onClick={() => setShowHallSelector(false)} className="text-neutral-500 hover:text-white">
                          <X size={20} />
                      </button>
                  </div>
                  
                  <div className="overflow-y-auto p-2">
                      <div className="grid grid-cols-2 gap-2">
                          <button 
                             onClick={() => { setSelectedHallId(null); setShowHallSelector(false); }}
                             className={`p-4 text-left border font-mono text-xs transition-all ${!selectedHallId ? 'bg-remuse-accent text-black border-remuse-accent' : 'bg-transparent border-neutral-800 text-neutral-400 hover:border-neutral-600'}`}
                          >
                              <span className="block font-bold mb-1">AUTO DETECT</span>
                              <span className="opacity-60">AI 自动分类</span>
                          </button>
                          
                          {halls.map(hall => (
                              <button 
                                  key={hall.id}
                                  onClick={() => { setSelectedHallId(hall.id); setShowHallSelector(false); }}
                                  className={`p-4 text-left border font-mono text-xs transition-all group relative overflow-hidden ${selectedHallId === hall.id ? 'bg-remuse-secondary text-black border-remuse-secondary' : 'bg-transparent border-neutral-800 text-neutral-400 hover:border-neutral-600'}`}
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

      {previewDetailItem && (
        <div className="fixed inset-0 z-[100] animate-fade-in">
          <IdeaGenerator 
            item={previewDetailItem} 
            onBack={() => setPreviewDetailItem(null)}
            onComplete={(id) => onCompleteItem?.(id)}
            onUpdateItem={(item) => onUpdateItem?.(item)}
            onDeleteItem={(id) => { setPreviewDetailItem(null); onDeleteItem?.(id); }}
          />
        </div>
      )}

    </div>
  );
};

export default Scanner;
