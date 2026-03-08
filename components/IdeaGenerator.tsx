
import React, { useEffect, useRef, useState } from 'react';
import { CollectedItem, Difficulty, RemuseIdea, ExhibitionHall, Sticker } from '../types';
import { ArrowLeft, Hammer, Clock, CheckCircle2, Share2, Hexagon, Zap, Pencil, Trash2, Save, XCircle, Sticker as StickerIcon, Loader2, Sparkles, Mic, Square } from 'lucide-react';
import { generateSticker } from '../services/geminiService';
import { imageUrlToBase64 } from '../services/imageUtils';
import { getHallNameById } from '../services/halls';
import { isSpeechRecognitionSupported, SpeechCaptureSession, startSpeechCapture } from '../services/speechRecognition';

interface IdeaGeneratorProps {
  item: CollectedItem;
  halls?: ExhibitionHall[];
  onBack: () => void;
  onComplete: (itemId: string) => void;
  onUpdateItem?: (updatedItem: CollectedItem) => void;
  onDeleteItem?: (itemId: string) => void;
  onStickerCreated?: (sticker: Sticker) => Promise<void> | void;
  hasExistingSticker?: boolean;
  onGenerateStickerRequest?: (item: CollectedItem) => void;
  isGeneratingStickerGlobal?: boolean;
}

const DifficultyRating: React.FC<{ level: Difficulty }> = ({ level }) => {
  const stars = {
    [Difficulty.EASY]: 1,
    [Difficulty.MEDIUM]: 2,
    [Difficulty.HARD]: 3
  };
  return (
    <div className="flex gap-1">
      {[1, 2, 3].map(i => (
        <div 
          key={i} 
          className={`h-1.5 w-4 ${i <= stars[level] ? 'bg-remuse-accent' : 'bg-neutral-700'}`}
        />
      ))}
    </div>
  );
};

const IdeaGenerator: React.FC<IdeaGeneratorProps> = ({ item, halls = [], onBack, onComplete, onUpdateItem, onDeleteItem, onStickerCreated, hasExistingSticker: initialHasSticker, onGenerateStickerRequest, isGeneratingStickerGlobal }) => {
  const [selectedIdea, setSelectedIdea] = useState<RemuseIdea | null>(item.ideas?.[0] || null);
  const [showCelebration, setShowCelebration] = useState(false);
  const safeTags = Array.isArray(item.tags) ? item.tags : [];
  const safeIdeas = Array.isArray(item.ideas) ? item.ideas : [];
  const safeHalls = Array.isArray(halls) ? halls : [];

  // If we have a global generator prop, use that instead of our local state
  // We still keep the local one as fallback in case `onGenerateStickerRequest` isn't provided (e.g., from old usage).
  const [localIsGeneratingSticker, setIsGeneratingSticker] = useState(false);
  const isGeneratingSticker = isGeneratingStickerGlobal ?? localIsGeneratingSticker;
  const [showStickerSuccess, setShowStickerSuccess] = useState(false);
  const [localHasSticker, setLocalHasSticker] = useState(!!initialHasSticker);

  // Sync localHasSticker when initialHasSticker changes from App.tsx due to background generation finish
  React.useEffect(() => {
     setLocalHasSticker(!!initialHasSticker);
  }, [initialHasSticker]);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editHallId, setEditHallId] = useState(item.hallId);
  const [editStory, setEditStory] = useState(item.story || '');
  const [storyVoiceError, setStoryVoiceError] = useState<string | null>(null);
  const [isRecordingStory, setIsRecordingStory] = useState(false);
  const storyRecognitionRef = useRef<SpeechCaptureSession | null>(null);
  const storyDraftBaseRef = useRef('');

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Is this item already completed (either from props or just now)?
  const isCompleted = item.status === 'remused';

  useEffect(() => {
    return () => {
      storyRecognitionRef.current?.stop();
      storyRecognitionRef.current = null;
    };
  }, []);

  const handleGenerateSticker = async () => {
    if (isGeneratingSticker) return;

    if (onGenerateStickerRequest) {
      onGenerateStickerRequest(item);
      return;
    }

    if (!onStickerCreated) return;
    setIsGeneratingSticker(true);
    try {
      const base64 = await imageUrlToBase64(item.imageUrl);
      const { stickerImageUrl, dramaText } = await generateSticker(base64, item.name);
      
      const newSticker: Sticker = {
          id: self.crypto?.randomUUID?.() ?? (`${Date.now()}-${Math.random().toString(36).slice(2,11)}`),
          originalItemId: item.id,
          stickerImageUrl: stickerImageUrl,
          dramaText: dramaText,
          category: item.category,
          dateCreated: new Date().toISOString()
      };
      
      await onStickerCreated(newSticker);
      setLocalHasSticker(true);
      setShowStickerSuccess(true);
      setTimeout(() => setShowStickerSuccess(false), 3000);
    } catch (err) {
      console.error("Sticker generation failed", err);
      alert("贴纸生成失败，请稍后重试");
    } finally {
      setIsGeneratingSticker(false);
    }
  };

  const handleCompleteClick = () => {
    if (isCompleted) return;
    setShowCelebration(true);
    onComplete(item.id);
    setTimeout(() => { setShowCelebration(false); }, 2000);
  };

  const handleSaveEdit = () => {
    if (!onUpdateItem) return;
    const updated: CollectedItem = {
      ...item,
      name: editName.trim() || item.name,
      hallId: editHallId,
      category: getHallNameById(safeHalls, editHallId, item.category),
      story: editStory.trim() || undefined,
    };
    onUpdateItem(updated);
    setIsEditing(false);
    setStoryVoiceError(null);
    setIsRecordingStory(false);
  };

  const handleCancelEdit = () => {
    storyRecognitionRef.current?.stop();
    storyRecognitionRef.current = null;
    setEditName(item.name);
    setEditHallId(item.hallId);
    setEditStory(item.story || '');
    setStoryVoiceError(null);
    setIsRecordingStory(false);
    setIsEditing(false);
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

  const handleDeleteConfirm = () => {
    if (!onDeleteItem) return;
    onDeleteItem(item.id);
  };

  return (
    <div className="h-full flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden bg-remuse-dark relative">
      
      {/* Celebration Overlay Effect */}
      {showCelebration && (
        <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center">
            {/* Simple CSS Particle Explosion */}
            {Array.from({ length: 20 }).map((_, i) => (
                <div 
                    key={i}
                    className="absolute w-2 h-2 rounded-full animate-ping"
                    style={{
                        backgroundColor: ['#ccff00', '#00ffff', '#ffffff'][i % 3],
                        left: '50%',
                        top: '50%',
                        transform: `rotate(${i * 18}deg) translate(${50 + Math.random() * 100}px)`,
                        animationDuration: '0.8s',
                        animationDelay: `${Math.random() * 0.2}s`,
                        opacity: 0
                    }}
                ></div>
            ))}
            
            {/* Floating Text */}
            <div className="absolute flex flex-col items-center animate-bounce duration-700">
                <span className="text-4xl font-black italic text-remuse-accent drop-shadow-[0_4px_0_rgba(0,0,0,1)]">
                    +10 PTS
                </span>
                <span className="text-white font-mono text-sm bg-black px-2 mt-1">
                    REGENERATION COMPLETE
                </span>
            </div>
        </div>
      )}

      {/* Left Panel: Image & Core Info */}
      <div className="w-full lg:w-1/3 bg-remuse-panel border-b border-remuse-border lg:border-b-0 lg:border-r flex flex-col relative">
        <button 
          onClick={onBack}
          className="absolute left-3 top-3 z-20 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/60 text-white backdrop-blur-sm transition hover:bg-white/10 md:left-4 md:top-4"
        >
          <ArrowLeft size={22} />
        </button>
        
        {/* Edit/Delete buttons */}
        {(onUpdateItem || onDeleteItem) && !isEditing && (
          <div className="absolute right-3 top-3 z-20 flex gap-2 md:right-4 md:top-4">
            {onUpdateItem && (
              <button
                onClick={() => setIsEditing(true)}
                aria-label="编辑物品信息"
                className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/60 text-neutral-300 backdrop-blur-sm transition hover:bg-remuse-accent/20 hover:text-remuse-accent"
              >
                <Pencil size={18} />
              </button>
            )}
            {onDeleteItem && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                aria-label="删除物品"
                className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/60 text-neutral-300 backdrop-blur-sm transition hover:bg-red-500/20 hover:text-red-400"
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-30 bg-black/80 flex items-center justify-center p-6">
            <div className="bg-remuse-panel border border-red-900/60 p-6 max-w-xs w-full clip-corner animate-fade-in">
              <h3 className="text-lg font-display font-bold text-white mb-2">确认删除</h3>
              <p className="text-sm text-neutral-400 mb-1">
                确定要删除「{item.name}」吗？
              </p>
              <p className="text-xs text-red-400/80 font-mono mb-6">此操作不可撤销</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="py-2.5 border border-neutral-700 text-neutral-400 hover:text-white hover:border-white transition-colors font-display text-sm"
                >
                  取消
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="py-2.5 bg-red-600 text-white font-bold hover:bg-red-500 transition-colors font-display text-sm flex items-center justify-center gap-2"
                >
                  <Trash2 size={14} /> 删除
                </button>
              </div>
            </div>
          </div>
        )}
        
        <div className="relative h-[31dvh] min-h-[220px] max-h-[340px] shrink-0 sm:h-[34dvh] sm:max-h-[380px] lg:h-2/3">
          <img 
            src={item.imageUrl} 
            alt={item.name} 
            className="w-full h-full object-cover transition-all duration-700"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-remuse-panel"></div>
          <div className="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-6">
            <div className="inline-block px-2 py-1 bg-remuse-accent text-black font-bold font-mono text-xs mb-2">
              ID: {item.id.split('-')[0].toUpperCase()}
            </div>

            {/* Editable or static display */}
            {isEditing ? (
              <div className="space-y-3 bg-black/60 p-4 rounded-lg backdrop-blur-sm">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={toggleStoryVoiceInput}
                    className={`inline-flex min-h-[34px] items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
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
                  <label className="block text-[10px] text-neutral-400 font-mono mb-1">名称</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 text-white px-3 py-2 text-sm font-display focus:border-remuse-accent focus:outline-none transition-colors"
                    placeholder="物品名称"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-neutral-400 font-mono mb-1">分类</label>
                  <select
                    value={editHallId}
                    onChange={(e) => setEditHallId(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 text-white px-3 py-2 text-sm font-display focus:border-remuse-accent focus:outline-none transition-colors appearance-none"
                  >
                    {safeHalls.map((hall) => (
                      <option key={hall.id} value={hall.id}>{hall.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-neutral-400 font-mono mb-1">故事</label>
                  <textarea
                    value={editStory}
                    onChange={(e) => setEditStory(e.target.value)}
                    rows={3}
                    className="w-full bg-neutral-900 border border-neutral-700 text-white px-3 py-2 text-sm font-sans focus:border-remuse-accent focus:outline-none transition-colors resize-none"
                    placeholder="这件物品的故事..."
                  />
                </div>
                {storyVoiceError && <p className="text-xs text-red-300">{storyVoiceError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveEdit}
                    className="flex-1 py-2 bg-remuse-accent text-black font-bold font-display text-sm flex items-center justify-center gap-1.5 hover:bg-white transition-colors"
                  >
                    <Save size={14} /> 保存
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="flex-1 py-2 border border-neutral-600 text-neutral-300 font-display text-sm flex items-center justify-center gap-1.5 hover:border-white hover:text-white transition-colors"
                  >
                    <XCircle size={14} /> 取消
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="mb-2 text-2xl font-display font-bold leading-none text-white sm:text-3xl">{item.name}</h1>
                <p className="border-l-2 border-remuse-accent pl-3 font-mono text-sm italic text-neutral-400">
                  {item.story}
                </p>
              </>
            )}
          </div>
        </div>
        
        <div className="p-5 md:p-6 lg:flex-1 lg:overflow-y-auto">
           <h3 className="font-mono text-neutral-500 text-xs mb-4">规格参数</h3>
           <div className="grid grid-cols-2 gap-4">
             <div className="p-3 bg-neutral-900 border border-neutral-800">
               <span className="block text-[10px] text-neutral-500 font-mono">材质</span>
               <span className="text-white text-sm">{item.material}</span>
             </div>
             <div className="p-3 bg-neutral-900 border border-neutral-800">
               <span className="block text-[10px] text-neutral-500 font-mono">分类</span>
               <span className="text-white text-sm">{getHallNameById(safeHalls, item.hallId, item.category)}</span>
             </div>
           </div>
           
           <div className="mt-6 flex flex-wrap gap-2">
             {safeTags.map(tag => (
               <span key={tag} className="text-[10px] px-2 py-1 border border-neutral-700 text-neutral-400 rounded-full">
                 #{tag}
               </span>
             ))}
           </div>

             {/* Sticker Generation Button */}
             {onStickerCreated && (
                <div className="mt-8 border-t border-neutral-800 pt-6">
                  {showStickerSuccess ? (
                    <div className="w-full bg-remuse-secondary/20 text-remuse-secondary py-3 text-center text-sm font-display flex items-center justify-center gap-2">
                       <CheckCircle2 size={16} /> 已生成并添加到贴纸库
                    </div>
                  ) : (
                    <div className="space-y-2">
                        {localHasSticker && (
                           <div className="w-full bg-remuse-accent/10 border border-remuse-accent/20 text-remuse-accent py-2 px-3 text-center text-xs font-mono flex items-center justify-center gap-2">
                              <CheckCircle2 size={14} /> 该藏品已生成数字贴纸
                           </div>
                        )}
                        <button
                            onClick={handleGenerateSticker}
                            disabled={isGeneratingSticker}
                            className="w-full bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed border border-neutral-600 text-white py-3 font-display text-sm flex items-center justify-center gap-2 transition-colors group"
                        >
                            {isGeneratingSticker ? (
                               <><Loader2 size={16} className="animate-spin text-remuse-secondary" /> 正在生成...</>
                            ) : (
                               <><StickerIcon size={16} className="text-remuse-secondary group-hover:animate-bounce" /> {localHasSticker ? '重新生成数字贴纸' : '生成数字贴纸'}</>
                            )}
                        </button>
                    </div>
                  )}
                </div>
             )}
        </div>
      </div>

      {/* Right Panel: Regeneration Ideas */}
      <div className="relative lg:flex-1 lg:flex lg:flex-col lg:overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-5 pointer-events-none"></div>

        <div className="p-4 md:p-6 lg:p-10 lg:overflow-y-auto lg:flex-1 pb-32">
          <h2 className="text-2xl font-display text-white mb-6 flex items-center gap-2">
            <Hexagon className="text-remuse-secondary" size={24} /> 
            再生协议 (REGENERATION PROTOCOLS)
          </h2>

          <div className="mb-8 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0 md:pb-0">
            {safeIdeas.map((idea, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedIdea(idea)}
                className={`min-w-[15rem] snap-start rounded-2xl text-left p-4 border transition-all md:min-w-0 ${
                  selectedIdea === idea 
                  ? 'bg-neutral-800 border-remuse-secondary' 
                  : 'bg-transparent border-neutral-700 hover:border-neutral-500'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                   <DifficultyRating level={idea.difficulty} />
                   {selectedIdea === idea && <div className="w-2 h-2 bg-remuse-secondary rounded-full animate-pulse"></div>}
                </div>
                <h4 className={`font-display font-bold text-sm ${selectedIdea === idea ? 'text-white' : 'text-neutral-400'}`}>
                  {idea.title}
                </h4>
              </button>
            ))}
          </div>

          {selectedIdea && (
            <div className="animate-fade-in space-y-8 max-w-3xl">
              <div>
                <h3 className="text-xl font-display font-bold text-remuse-secondary mb-2">{selectedIdea.title}</h3>
                <p className="text-neutral-300 leading-relaxed">{selectedIdea.description}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-neutral-900/50 p-6 border border-neutral-800 clip-corner-top">
                   <h4 className="font-mono text-xs text-remuse-accent mb-4 flex items-center gap-2">
                     <Hammer size={14} /> 所需材料
                   </h4>
                   <ul className="space-y-2">
                     {(Array.isArray(selectedIdea.materials) ? selectedIdea.materials : []).map((m, i) => (
                       <li key={i} className="flex items-center gap-3 text-sm text-neutral-300">
                         <div className="w-1 h-1 bg-neutral-500"></div>
                         {m}
                       </li>
                     ))}
                   </ul>
                </div>

                <div>
                  <h4 className="font-mono text-xs text-remuse-accent mb-4 flex items-center gap-2">
                     <Clock size={14} /> 执行步骤
                   </h4>
                   <div className="space-y-6 relative border-l border-neutral-800 ml-2">
                     {(Array.isArray(selectedIdea.steps) ? selectedIdea.steps : []).map((step, i) => (
                       <div key={i} className="pl-6 relative">
                         <div className="absolute -left-[5px] top-1 w-2.5 h-2.5 bg-neutral-800 border border-neutral-600 rounded-full flex items-center justify-center">
                           {/* dot */}
                         </div>
                         <span className="font-mono text-xs text-neutral-500 mb-1 block">步骤 0{i+1}</span>
                         <p className="text-sm text-neutral-200">{step}</p>
                       </div>
                     ))}
                   </div>
                </div>
              </div>

              <div className="pt-8 flex gap-4">
                 <button 
                  onClick={handleCompleteClick}
                  disabled={isCompleted}
                  className={`flex-1 font-bold py-4 px-6 transition-all font-display flex items-center justify-center gap-2 clip-corner
                    ${isCompleted 
                        ? 'bg-neutral-800 text-green-400 border border-green-900 cursor-default' 
                        : 'bg-remuse-secondary text-black hover:bg-cyan-300 active:scale-95'}
                  `}
                 >
                   {isCompleted ? (
                       <>
                        <CheckCircle2 size={20} className="fill-current" /> 已再生 (+10积分)
                       </>
                   ) : (
                       <>
                        <CheckCircle2 size={20} /> 标记为完成 (+10 积分)
                       </>
                   )}
                 </button>
                 <button 
                   onClick={async () => {
                     const shareText = `🌿 我用 REMUSE 把「${item.name}」变成了「${selectedIdea?.title}」！\n\n${selectedIdea?.description || ''}\n\n#REMUSE #万物再生`;
                     if (navigator.share) {
                       try {
                         await navigator.share({ title: `REMUSE · ${item.name}`, text: shareText });
                       } catch {}
                     } else {
                       await navigator.clipboard.writeText(shareText);
                       const btn = document.activeElement as HTMLElement;
                       const original = btn?.title;
                       if (btn) { btn.title = '已复制！'; setTimeout(() => { btn.title = original || ''; }, 2000); }
                     }
                   }}
                   title="分享"
                   className="bg-transparent border border-neutral-600 text-white p-4 hover:border-white transition-colors"
                 >
                   <Share2 size={20} />
                 </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default IdeaGenerator;
