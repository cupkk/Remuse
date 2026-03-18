
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CollectedItem, MemoryAssistantMatch, MemoryAssistantMessage, Tool, User } from '../types';
import { Trophy, Sprout, Star, Hexagon, Zap, Award, Crown, Medal, Briefcase, Wrench, Scissors, PenTool, Ruler, Brush, X, Plus, Check, Trash2, LogOut, PackageOpen, Copy, MessageCircle, UserRound, Send, Mic, Square, Loader2, Sparkles, History, ShieldCheck, MailWarning } from 'lucide-react';
import AccountSecurityPanel from './AccountSecurityPanel';
import { askMemoryAssistant } from '../services/memoryService';
import { isSpeechRecognitionSupported, SpeechCaptureSession, startSpeechCapture } from '../services/speechRecognition';

interface CuratorOfficeProps {
  items: CollectedItem[];
  user?: User | null;
  onLogout?: () => Promise<void>;
  onClearSamples?: () => Promise<void>;
  onUpdateToolbox?: (tools: Tool[]) => Promise<void>;
  onUpgradeAccount?: () => void;
}

// --- Visualizations ---

const JarVisualization: React.FC<{ count: number }> = ({ count }) => {
  // Generate random positions for particles inside the jar
  const particles = useMemo(() => {
    return Array.from({ length: Math.min(count, 50) }).map((_, i) => ({
      id: i,
      x: 20 + Math.random() * 60, // 20% to 80% width
      y: 80 - Math.random() * (Math.min(i * 2, 60)), // Stack upwards roughly
      rotation: Math.random() * 360,
      type: Math.random() > 0.5 ? 'star' : 'crane',
      color: ['#ccff00', '#00ffff', '#ffffff'][Math.floor(Math.random() * 3)]
    }));
  }, [count]);

  return (
    <div className="relative w-full h-64 flex items-center justify-center">
      <svg viewBox="0 0 100 100" className="h-full overflow-visible drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]">
        {/* Jar Body */}
        <path 
          d="M30 10 L70 10 L75 20 L75 85 Q75 95 65 95 L35 95 Q25 95 25 85 L25 20 L30 10 Z" 
          fill="rgba(255,255,255,0.05)" 
          stroke="rgba(255,255,255,0.3)" 
          strokeWidth="1"
        />
        {/* Jar Lid Highlight */}
        <path d="M30 12 L70 12" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" />
        
        {/* Particles */}
        {particles.map((p) => (
          <g key={p.id} transform={`translate(${p.x}, ${p.y}) rotate(${p.rotation})`}>
            {p.type === 'star' ? (
              <path d="M0 -2 L0.6 -0.6 L2 0 L0.6 0.6 L0 2 L-0.6 0.6 L-2 0 L-0.6 -0.6 Z" fill={p.color} className="animate-pulse" style={{animationDuration: `${2 + Math.random()}s`}} />
            ) : (
              // Abstract crane/paper shape
              <path d="M0 0 L3 -2 L0 -4 L-3 -2 Z" fill={p.color} opacity="0.8" />
            )}
          </g>
        ))}

        {/* Label */}
        <text x="50" y="105" textAnchor="middle" className="text-[6px] fill-neutral-500 font-mono tracking-widest">
          COLLECTION JAR
        </text>
      </svg>
      <div className="absolute top-4 right-4 bg-remuse-panel border border-remuse-border px-2 py-1 rounded">
        <span className="text-xs text-white font-mono">{count} Items</span>
      </div>
    </div>
  );
};

const GardenVisualization: React.FC<{ remusedCount: number }> = ({ remusedCount }) => {
  // Generate trees based on count
  const trees = useMemo(() => {
    return Array.from({ length: Math.min(remusedCount, 20) }).map((_, i) => ({
      id: i,
      x: 10 + (i % 5) * 20 + (Math.random() * 10 - 5), 
      y: 20 + Math.floor(i / 5) * 20 + (Math.random() * 10 - 5),
      scale: 0.8 + Math.random() * 0.4
    }));
  }, [remusedCount]);

  return (
    <div className="relative w-full h-64 bg-neutral-900/30 border border-neutral-800 flex items-center justify-center overflow-hidden">
        {/* Grid Floor */}
        <div className="absolute inset-0 bg-grid-pattern opacity-20 transform perspective-1000 rotate-x-60 scale-150"></div>
        
        <div className="relative w-full h-full p-8 grid grid-cols-5 gap-4 content-center">
            {trees.length === 0 && (
                <div className="col-span-5 text-center text-neutral-400 font-mono text-xs">
                    森林尚未生长...<br/>完成改造以种植树木
                </div>
            )}
            {trees.map((tree) => (
                <div 
                    key={tree.id} 
                    className="flex justify-center items-end animate-fade-in"
                    style={{ transitionDelay: `${tree.id * 100}ms` }}
                >
                    <Sprout 
                        size={32 * tree.scale} 
                        className="text-remuse-accent drop-shadow-[0_0_5px_rgba(204,255,0,0.5)]" 
                        strokeWidth={1.5}
                    />
                </div>
            ))}
        </div>
        
        {/* Label */}
        <div className="absolute bottom-2 w-full text-center">
             <span className="text-[10px] text-neutral-500 font-mono tracking-widest uppercase">Regeneration Forest</span>
        </div>
        <div className="absolute top-4 right-4 bg-remuse-panel border border-remuse-border px-2 py-1 rounded">
           <span className="text-xs text-remuse-accent font-mono">{remusedCount} Trees</span>
        </div>
    </div>
  );
};

// --- Achievements ---

interface Achievement {
    id: string;
    title: string;
    desc: string;
    icon: React.ReactNode;
    condition: (items: CollectedItem[]) => boolean;
}

const ACHIEVEMENTS: Achievement[] = [
    {
        id: 'beginner',
        title: '初级收藏家',
        desc: '收集首个物品',
        icon: <Star size={24} />,
        condition: (items) => items.length >= 1
    },
    {
        id: 'creator',
        title: '再生新手',
        desc: '完成1次改造',
        icon: <Zap size={24} />,
        condition: (items) => items.some(i => i.status === 'remused')
    },
    {
        id: 'hoarder',
        title: '档案管理员',
        desc: '收集超过10个物品',
        icon: <Award size={24} />,
        condition: (items) => items.length >= 10
    },
    {
        id: 'master',
        title: '再生大师',
        desc: '完成5次改造',
        icon: <Crown size={24} />,
        condition: (items) => items.filter(i => i.status === 'remused').length >= 5
    },
    {
        id: 'guardian',
        title: '地球守护者',
        desc: '收集超过20个物品',
        icon: <Medal size={24} />,
        condition: (items) => items.length >= 20
    }
];

const AchievementBadge: React.FC<{ achievement: Achievement; unlocked: boolean }> = ({ achievement, unlocked }) => {
    return (
        <div className={`group relative flex flex-col items-center p-4 transition-all duration-500 ${unlocked ? 'opacity-100' : 'opacity-40 grayscale'}`}>
            <div className="relative mb-3">
                {/* Hexagon Background */}
                <div className={`w-16 h-16 flex items-center justify-center transition-all duration-500 clip-corner
                    ${unlocked 
                        ? 'bg-remuse-accent text-black shadow-[0_0_20px_rgba(204,255,0,0.4)] scale-110' 
                        : 'bg-transparent border border-neutral-600 text-neutral-500'}
                `}>
                    {achievement.icon}
                </div>
                {unlocked && <div className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full animate-ping"></div>}
            </div>
            <h4 className={`font-bold font-display text-sm mb-1 ${unlocked ? 'text-white' : 'text-neutral-500'}`}>
                {achievement.title}
            </h4>
            <p className="text-[10px] text-neutral-500 text-center max-w-[100px]">{achievement.desc}</p>
        </div>
    );
};

// --- Toolkit Section Components ---

const DEFAULT_TOOLS: Tool[] = [
  { id: '1', name: '精密剪刀', iconType: 'scissors', color: '#ff0055' },
  { id: '2', name: '强力胶带', iconType: 'tape', color: '#ccff00' },
  { id: '3', name: '万能胶水', iconType: 'glue', color: '#00ffff' },
  { id: '4', name: '螺丝刀组', iconType: 'screwdriver', color: '#ff9900' },
  { id: '5', name: '刻刀', iconType: 'knife', color: '#e5e5e5' },
  { id: '6', name: '钢尺', iconType: 'ruler', color: '#a3a3a3' },
];

const ToolIcon: React.FC<{ type: string; size?: number; color?: string }> = ({ type, size = 24, color = 'currentColor' }) => {
  switch (type) {
    case 'scissors': return <Scissors size={size} color={color} />;
    case 'tape': return <div style={{width: size, height: size, borderRadius: '50%', border: `3px solid ${color}`, opacity: 0.8}}></div>;
    case 'glue': return <PenTool size={size} color={color} />;
    case 'screwdriver': return <Wrench size={size} color={color} />;
    case 'brush': return <Brush size={size} color={color} />;
    case 'ruler': return <Ruler size={size} color={color} />;
    case 'knife': return <div className="rotate-45" style={{ color }}><PenTool size={size} /></div>;
    default: return <Briefcase size={size} color={color} />;
  }
};

function getInitialTools(toolbox?: Tool[]) {
  if (Array.isArray(toolbox) && toolbox.length > 0) {
    return toolbox;
  }
  return DEFAULT_TOOLS;
}

const CONTACT_WECHAT_ID = 'MTtin999';
const AVATAR_GRADIENTS = [
  ['#ccff00', '#00ffff'],
  ['#f97316', '#ec4899'],
  ['#60a5fa', '#22d3ee'],
  ['#a78bfa', '#f472b6'],
];

const DEFAULT_MEMORY_PROMPTS = [
  '帮我找和学生时代有关的藏品',
  '有没有哪件物品让我想到家人',
  '我收藏过哪些最有纪念意义的东西',
];

function createMemoryMessage(role: MemoryAssistantMessage['role'], content: string): MemoryAssistantMessage {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    role,
    content,
  };
}

function getAvatarSeed(user?: User | null) {
  return (user?.id || user?.nickname || user?.email || 'remuse').trim();
}

function getAvatarMonogram(user?: User | null) {
  const raw = (user?.nickname || user?.email || user?.id || 'RM').trim();
  if (!raw) {
    return 'R';
  }

  return raw.slice(0, 1).toUpperCase();
}

function getAvatarGradient(user?: User | null) {
  const seed = getAvatarSeed(user);
  const hash = Array.from(seed).reduce((total, char) => total + char.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

const ProfileAvatar: React.FC<{ user?: User | null }> = ({ user }) => {
  const [hasImageError, setHasImageError] = useState(false);
  const imageUrl = user?.avatarUrl?.trim() || '';
  const [fromColor, toColor] = getAvatarGradient(user);
  const monogram = getAvatarMonogram(user);

  useEffect(() => {
    setHasImageError(false);
  }, [imageUrl]);

  if (imageUrl && !hasImageError) {
    return (
      <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-full border-2 border-remuse-accent bg-neutral-900 shadow-[0_0_24px_rgba(204,255,0,0.16)] md:h-24 md:w-24">
        <img
          src={imageUrl}
          alt={`${user?.nickname || 'Remuse'} avatar`}
          className="h-full w-full object-cover"
          onError={() => setHasImageError(true)}
        />
        <div className="absolute inset-0 bg-remuse-accent mix-blend-color opacity-20" />
      </div>
    );
  }

  return (
    <div
      className="relative flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-remuse-accent text-white shadow-[0_0_24px_rgba(204,255,0,0.16)] md:h-24 md:w-24"
      style={{ background: `linear-gradient(135deg, ${fromColor} 0%, ${toColor} 100%)` }}
      aria-label={`${user?.nickname || 'Remuse'} avatar fallback`}
    >
      <div className="absolute inset-[3px] rounded-full bg-black/70" />
      <div className="absolute inset-0 opacity-30" style={{ background: `radial-gradient(circle at top, ${fromColor}, transparent 55%)` }} />
      <span className="relative z-10 font-display text-3xl font-black tracking-tight md:text-4xl">{monogram}</span>
      <UserRound size={18} className="absolute bottom-3 right-3 z-10 text-remuse-accent/80" />
    </div>
  );
};

const CuratorOffice: React.FC<CuratorOfficeProps> = ({
  items,
  user,
  onLogout,
  onClearSamples,
  onUpdateToolbox,
  onUpgradeAccount,
}) => {
  const remusedCount = items.filter(i => i.status === 'remused').length;
  const [isToolkitOpen, setIsToolkitOpen] = useState(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [myTools, setMyTools] = useState<Tool[]>(() => getInitialTools(user?.toolbox));
  const [clearingSamples, setClearingSamples] = useState(false);
  const [savingTools, setSavingTools] = useState(false);
  const [contactStatus, setContactStatus] = useState<'idle' | 'copied' | 'manual'>('idle');
  const showSampleClear = items.some((item) => item.isSample);
  const storyItems = useMemo(
    () => items.filter((item) => item.story?.trim()),
    [items],
  );
  const recentMemoryItems = useMemo<MemoryAssistantMatch[]>(
    () =>
      storyItems.slice(0, 3).map((item, index) => ({
        itemId: item.id,
        itemName: item.name,
        imageUrl: item.imageUrl,
        hallName: item.category || item.hallId,
        material: item.material || '未记录',
        dateCollected: item.dateCollected,
        storySnippet: item.story?.trim() || '',
        tags: item.tags || [],
        score: 100 - index,
      })),
    [storyItems],
  );
  const [memoryMessages, setMemoryMessages] = useState<MemoryAssistantMessage[]>([
    createMemoryMessage(
      'assistant',
      '我是你的记忆馆长。你可以问我和旧物有关的人、时间、地点或情绪，我会从你的藏品故事里把相关线索找出来。',
    ),
  ]);
  const [memoryQuery, setMemoryQuery] = useState('');
  const [memoryMatches, setMemoryMatches] = useState<MemoryAssistantMatch[]>([]);
  const [memorySuggestions, setMemorySuggestions] = useState<string[]>(DEFAULT_MEMORY_PROMPTS);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [memoryRetrievalSummary, setMemoryRetrievalSummary] = useState('还没有发起检索，先问我一个和旧物有关的问题。');
  const [isAskingMemory, setIsAskingMemory] = useState(false);
  const [isRecordingMemory, setIsRecordingMemory] = useState(false);
  const memoryRecognitionRef = useRef<SpeechCaptureSession | null>(null);
  const memoryDraftBaseRef = useRef('');

  useEffect(() => {
    setMyTools(getInitialTools(user?.toolbox));
  }, [user?.toolbox]);

  useEffect(() => {
    if (contactStatus === 'idle') {
      return undefined;
    }

    const timer = window.setTimeout(() => setContactStatus('idle'), 2400);
    return () => window.clearTimeout(timer);
  }, [contactStatus]);

  useEffect(() => {
    return () => {
      memoryRecognitionRef.current?.stop();
      memoryRecognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isSecurityModalOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSecurityModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSecurityModalOpen]);
  
  // Add Tool Modal State
  const [showAddToolModal, setShowAddToolModal] = useState(false);
  const [newToolName, setNewToolName] = useState('');
  const [newToolColor, setNewToolColor] = useState('#ccff00');

  // Determine icon based on name
  const determineIconType = (name: string): Tool['iconType'] => {
    const n = name.trim().toLowerCase();
    if (n.includes('剪') || n.includes('scissors') || n.includes('cut')) return 'scissors';
    if (n.includes('胶带') || n.includes('tape')) return 'tape';
    if (n.includes('胶') || n.includes('glue') || n.includes('粘')) return 'glue';
    if (n.includes('螺') || n.includes('driver') || n.includes('screw') || n.includes('wrench') || n.includes('扳')) return 'screwdriver';
    if (n.includes('笔') || n.includes('刷') || n.includes('brush') || n.includes('paint')) return 'brush';
    if (n.includes('尺') || n.includes('ruler') || n.includes('量')) return 'ruler';
    if (n.includes('刀') || n.includes('knife')) return 'knife';
    return 'other';
  };

  const handleAddTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newToolName.trim()) return;

    const newTool: Tool = {
        id: self.crypto?.randomUUID?.() ?? (`${Date.now()}-${Math.random().toString(36).slice(2,11)}`),
        name: newToolName,
        iconType: determineIconType(newToolName),
        color: newToolColor
    };

    const updated = [...myTools, newTool];
    setMyTools(updated);
    setSavingTools(true);
    try {
      await onUpdateToolbox?.(updated);
    } finally {
      setSavingTools(false);
    }
    setNewToolName('');
    setNewToolColor('#ccff00');
    setShowAddToolModal(false);
  };

  const handleDeleteTool = async (id: string) => {
      const updated = myTools.filter(t => t.id !== id);
      setMyTools(updated);
      setSavingTools(true);
      try {
        await onUpdateToolbox?.(updated);
      } finally {
        setSavingTools(false);
      }
  };

  const handleCopyWechat = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_WECHAT_ID);
      setContactStatus('copied');
      return;
    } catch {
      const input = document.createElement('input');
      input.value = CONTACT_WECHAT_ID;
      document.body.appendChild(input);
      input.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(input);
      setContactStatus(copied ? 'copied' : 'manual');
    }
  };

  const handleAskMemory = async (seedQuery?: string) => {
    const prompt = (seedQuery ?? memoryQuery).trim();
    if (prompt.length < 2 || isAskingMemory || storyItems.length === 0) {
      return;
    }

    const nextUserMessage = createMemoryMessage('user', prompt);
    const nextHistory = [...memoryMessages, nextUserMessage];

    setMemoryError(null);
    setMemoryMessages(nextHistory);
    setMemoryQuery('');
    setIsAskingMemory(true);

    try {
      const response = await askMemoryAssistant(prompt, nextHistory);
      setMemoryMessages((prev) => [...prev, createMemoryMessage('assistant', response.answer)]);
      setMemoryMatches(response.matches);
      setMemoryRetrievalSummary(response.retrievalSummary);
      if (response.suggestions.length > 0) {
        setMemorySuggestions(response.suggestions);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '记忆检索失败，请稍后再试';
      setMemoryError(message);
      setMemoryRetrievalSummary('这次没有成功完成检索，你可以稍后再试一次。');
      setMemoryMessages((prev) => [
        ...prev,
        createMemoryMessage(
          'assistant',
          '我这次没能顺利调出你的记忆档案。你可以稍后重试，或者把问题问得更具体一点，比如加入时间、人物或地点。',
        ),
      ]);
    } finally {
      setIsAskingMemory(false);
    }
  };

  const toggleMemoryVoiceInput = () => {
    if (isRecordingMemory) {
      memoryRecognitionRef.current?.stop();
      memoryRecognitionRef.current = null;
      setIsRecordingMemory(false);
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      setMemoryError('当前浏览器不支持语音输入，建议使用 Chrome 或 Edge。');
      return;
    }

    memoryDraftBaseRef.current = memoryQuery.trim() ? `${memoryQuery.trim()} ` : '';
    setMemoryError(null);
    setIsRecordingMemory(true);

    try {
      memoryRecognitionRef.current = startSpeechCapture({
        onTranscript: (transcript) => {
          setMemoryQuery(`${memoryDraftBaseRef.current}${transcript}`.trim());
        },
        onError: (message) => {
          setMemoryError(message);
          setIsRecordingMemory(false);
          memoryRecognitionRef.current = null;
        },
        onEnd: () => {
          setIsRecordingMemory(false);
          memoryRecognitionRef.current = null;
        },
      });
    } catch (error) {
      setMemoryError(error instanceof Error ? error.message : '语音输入启动失败');
      setIsRecordingMemory(false);
      memoryRecognitionRef.current = null;
    }
  };

  // If toolkit is open, render the sub-page overlay
  if (isToolkitOpen) {
    return (
      <div className="fixed inset-0 z-50 bg-neutral-900 flex flex-col animate-fade-in safe-area-pt">
        {/* Header */}
        <div className="p-6 border-b border-remuse-border bg-remuse-panel flex items-center justify-between">
          <div className="flex items-center gap-4">
             <div className="p-3 bg-remuse-accent text-black clip-corner">
               <Briefcase size={24} />
             </div>
             <div>
               <h2 className="text-2xl font-bold font-display text-white tracking-wide">MY TOOLKIT</h2>
               <p className="text-xs text-neutral-500 mt-1">自定义你的再生工具库</p>
             </div>
          </div>
          <button 
            onClick={() => setIsToolkitOpen(false)}
            className="p-2 hover:bg-neutral-800 rounded-full text-neutral-500 hover:text-white transition-colors"
          >
            <X size={28} />
          </button>
        </div>

        {/* Grid Cabinet Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-12 bg-neutral-900">
           <div className="max-w-4xl mx-auto">
              
              {/* Cabinet Frame */}
              <div className="bg-[#151515] p-4 rounded-lg border-[3px] border-neutral-700 shadow-2xl relative">
                  {/* Decorative Screws */}
                  <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-neutral-600"></div>
                  <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-neutral-600"></div>
                  <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full bg-neutral-600"></div>
                  <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-neutral-600"></div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                     {/* Render Tools in Slots */}
                     {myTools.map((tool, idx) => (
                       <div key={tool.id} className="aspect-square bg-[#0a0a0a] border border-neutral-800 rounded shadow-inner flex flex-col items-center justify-center group relative hover:border-remuse-accent/50 transition-colors">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDeleteTool(tool.id); }}
                            disabled={savingTools}
                            className="absolute top-1 right-1 p-1 text-neutral-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                             <Trash2 size={12} />
                          </button>

                          <div className="transform group-hover:scale-110 transition-transform duration-300 drop-shadow-lg">
                             <ToolIcon type={tool.iconType} size={40} color={tool.color} />
                          </div>
                          <span className="mt-4 text-xs font-mono text-neutral-400 group-hover:text-white">{tool.name}</span>
                          
                          {/* Slot Number Label */}
                          <span className="absolute top-2 left-2 text-[8px] text-neutral-500 font-mono">SLOT-{String(idx + 1).padStart(2,'0')}</span>
                       </div>
                     ))}
                     
                     {/* Add Button Slot */}
                     {myTools.length < 16 && (
                        <button 
                            onClick={() => setShowAddToolModal(true)}
                            disabled={savingTools}
                            className="aspect-square bg-[#0f0f0f] border border-dashed border-neutral-700 hover:border-remuse-accent rounded flex flex-col items-center justify-center group transition-colors"
                        >
                            <div className="w-10 h-10 rounded-full bg-neutral-800 group-hover:bg-remuse-accent group-hover:text-black flex items-center justify-center transition-colors mb-2">
                                <Plus size={20} />
                            </div>
                            <span className="text-[10px] text-neutral-500 group-hover:text-remuse-accent font-display">ADD TOOL</span>
                        </button>
                     )}

                     {/* Remaining Empty Slots (Filler to maintain grid look) */}
                     {Array.from({ length: Math.max(0, 11 - myTools.length) }).map((_, i) => (
                        <div key={`empty-${i}`} className="aspect-square bg-[#0a0a0a]/50 border border-neutral-800/30 rounded flex items-center justify-center opacity-30 border-dashed pointer-events-none">
                           <Plus size={20} className="text-neutral-800" />
                        </div>
                     ))}
                  </div>
              </div>
              
              <div className="mt-8 text-center">
                 <p className="text-xs font-mono text-neutral-500">
                    * 更多工具插槽正在解锁中 (Level {Math.floor(items.length / 5) + 1})
                 </p>
              </div>
           </div>
        </div>

        {/* Add Tool Modal */}
        {showAddToolModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
             <div className="bg-remuse-panel border border-remuse-border w-full max-w-sm p-6 relative clip-corner shadow-2xl">
                <button 
                  onClick={() => setShowAddToolModal(false)}
                  className="absolute top-4 right-4 text-neutral-500 hover:text-white"
                >
                  <X size={20} />
                </button>
                
                <h2 className="text-xl font-bold text-white font-display mb-6 flex items-center gap-2">
                    <Wrench size={20} className="text-remuse-accent" /> 获取新装备
                </h2>
                
                <form onSubmit={handleAddTool} className="space-y-4">
                  <div>
                    <label className="block text-xs font-mono text-neutral-500 mb-2">工具名称</label>
                    <input 
                      type="text" 
                      value={newToolName}
                      onChange={(e) => setNewToolName(e.target.value)}
                      placeholder="例如：热熔胶枪"
                      className="w-full bg-neutral-900 border border-neutral-700 p-3 text-white focus:border-remuse-accent outline-none font-mono text-sm"
                      autoFocus
                    />
                    <p className="text-[10px] text-neutral-400 mt-1">* 系统将根据名称自动匹配图标</p>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-neutral-500 mb-2">标识颜色</label>
                    <div className="flex items-center gap-3">
                        <input 
                            type="color" 
                            value={newToolColor}
                            onChange={(e) => setNewToolColor(e.target.value)}
                            className="w-10 h-10 bg-transparent cursor-pointer border-none p-0"
                        />
                        <span className="text-xs font-mono text-neutral-400">{newToolColor}</span>
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={!newToolName}
                    className={`w-full py-3 mt-4 font-bold font-display flex items-center justify-center gap-2 transition-colors
                      ${!newToolName || savingTools
                        ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed' 
                        : 'bg-remuse-accent text-black hover:bg-white'}
                    `}
                  >
                    <Check size={18} /> {savingTools ? '同步中...' : '确认入库'}
                  </button>
                </form>
             </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-remuse-dark pb-24">
      {/* Header */}
      <div className="border-b border-remuse-border bg-remuse-panel px-5 py-6 md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4 md:gap-5">
                  <ProfileAvatar user={user} />
                  <div className="min-w-0 flex-1">
                      <h1 className="text-3xl font-bold text-white font-display tracking-tight md:text-4xl">
                          {user?.nickname || '馆长'} <span className="text-remuse-accent">::</span> {user?.isGuest ? 'GUEST' : 'ADMIN'}
                      </h1>
                      <p className="mt-2 text-xs leading-relaxed text-neutral-500 md:text-sm">
                          {user?.email || `ID: ${user?.id?.slice(0, 8) || '89757'}`} // LEVEL {Math.floor(items.length / 5) + 1}
                      </p>
                  </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {!user?.isGuest && (
                  <button
                    onClick={() => setIsSecurityModalOpen(true)}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-remuse-accent/25 bg-remuse-accent/10 px-4 py-2.5 text-sm text-remuse-accent transition-colors hover:bg-remuse-accent/20"
                  >
                    <ShieldCheck size={16} />
                    <span>账号安全</span>
                  </button>
                )}
              {user?.isGuest && onUpgradeAccount && (
                <button
                  onClick={onUpgradeAccount}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 self-start rounded-lg border border-remuse-accent/30 bg-remuse-accent/10 px-4 py-2.5 text-sm text-remuse-accent transition-colors hover:bg-remuse-accent/20 md:self-center"
                >
                  <UserRound size={16} />
                  <span>升级账号</span>
                </button>
              )}
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 self-start rounded-lg border border-red-800/40 bg-red-900/30 px-4 py-2.5 text-sm text-red-400 transition-colors hover:bg-red-900/50 md:self-center"
                >
                  <LogOut size={16} />
                  <span>登出</span>
                </button>
              )}
              </div>
          </div>
      </div>

      <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-12">
          {!user?.isGuest && !user?.emailVerified && (
            <section className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <MailWarning size={18} className="mt-0.5 text-amber-200" />
                  <div>
                    <p className="text-sm font-semibold text-amber-100">邮箱尚未验证</p>
                    <p className="mt-1 text-xs leading-6 text-amber-50/85">
                      建议尽快完成验证，后续找回密码和恢复账号会更稳妥。
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSecurityModalOpen(true)}
                  className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-amber-100/20 bg-black/20 px-4 py-2 text-sm text-amber-50 transition-colors hover:bg-black/30"
                >
                  <ShieldCheck size={15} />
                  <span>去处理</span>
                </button>
              </div>
            </section>
          )}

          {/* Visualizations Section */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left: Collection Jar */}
              <div className="bg-remuse-panel border border-remuse-border p-6 rounded-sm relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-3 flex gap-2">
                       <Hexagon size={16} className="text-neutral-500" />
                       <Hexagon size={16} className="text-neutral-500" />
                  </div>
                  <h3 className="text-lg font-display text-neutral-300 mb-6 flex items-center gap-2">
                      <Star size={16} className="text-remuse-secondary"/> 馆藏星屑
                  </h3>
                  <JarVisualization count={items.length} />
                  <p className="text-center text-neutral-500 text-xs mt-4 font-mono">
                      每一件物品都是时间的结晶
                  </p>
              </div>

              {/* Right: Regeneration Forest */}
              <div className="bg-remuse-panel border border-remuse-border p-6 rounded-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 flex gap-2">
                       <Hexagon size={16} className="text-neutral-500" />
                       <Hexagon size={16} className="text-neutral-500" />
                  </div>
                  <h3 className="text-lg font-display text-neutral-300 mb-6 flex items-center gap-2">
                      <Sprout size={16} className="text-remuse-accent"/> 再生森林
                  </h3>
                  <GardenVisualization remusedCount={remusedCount} />
                  <p className="text-center text-neutral-500 text-xs mt-4 font-mono">
                      你的创意正在治愈这片数字荒原
                  </p>
              </div>
          </section>
          
          {/* --- NEW: TOOLKIT SECTION --- */}
          <section>
             <div className="flex items-center gap-4 mb-6">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent to-neutral-700"></div>
                <h2 className="text-xl font-display text-white flex items-center gap-2">
                    <Briefcase className="text-remuse-accent" size={20} /> 
                    EQUIPMENT
                </h2>
                <div className="h-px flex-1 bg-gradient-to-l from-transparent to-neutral-700"></div>
             </div>

             <div 
               onClick={() => setIsToolkitOpen(true)}
               className="group relative w-full h-32 md:h-40 bg-[#1a1a1a] border-2 border-neutral-700 hover:border-remuse-accent cursor-pointer transition-all duration-300 rounded-lg overflow-hidden flex items-center justify-center shadow-lg hover:shadow-[0_0_20px_rgba(204,255,0,0.1)]"
             >
                {/* Background Details simulating metal texture */}
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
                
                {/* Handle Visual */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-4 bg-neutral-800 rounded-b-lg border-b border-x border-neutral-600"></div>

                {/* Content */}
                <div className="relative z-10 flex flex-col items-center gap-3">
                   <div className="flex items-center gap-4 text-neutral-400 group-hover:text-remuse-accent transition-colors">
                      <Briefcase size={32} strokeWidth={1.5} />
                      <span className="text-2xl md:text-3xl font-black font-display tracking-tight">TOOLKIT</span>
                   </div>
                   <div className="flex gap-2">
                      {myTools.slice(0, 5).map((tool) => (
                        <div key={tool.id} className="w-1 h-1 rounded-full" style={{ backgroundColor: tool.color }}></div>
                      ))}
                      <span className="text-[10px] text-neutral-500 font-mono ml-2">ACCESS GRANTED</span>
                   </div>
                </div>

                {/* "Open" Hint */}
                <div className="absolute bottom-3 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-mono text-remuse-accent flex items-center gap-1">
                   OPEN CASE <Zap size={10} />
                </div>
             </div>
          </section>

          {false && (<section>
              <div className="mb-6 flex items-center gap-4">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent to-neutral-700"></div>
                  <h2 className="flex items-center gap-2 text-xl font-display text-white">
                      <History className="text-remuse-accent" size={20} />
                      MEMORY RAG
                  </h2>
                  <div className="h-px flex-1 bg-gradient-to-l from-transparent to-neutral-700"></div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
                  <div className="relative overflow-hidden rounded-xl border border-remuse-border bg-remuse-panel p-5 md:p-6">
                      <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-remuse-accent/10 blur-3xl" />
                      <div className="relative flex h-full flex-col gap-5">
                          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                              <div className="max-w-3xl">
                                  <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-remuse-accent/30 bg-remuse-accent/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.24em] text-remuse-accent">
                                      <Sparkles size={14} />
                                      Memory Curator
                                  </div>
                                  <h3 className="text-2xl font-display font-bold text-white">把旧物记忆放进独立对话界面</h3>
                                  <p className="mt-2 text-sm leading-7 text-neutral-300">
                                      记忆检索已经独立成单独页面。现在支持新增对话、删除对话、历史记录保存，以及基于你自己藏品故事的记忆召回。
                                  </p>
                              </div>

                              <div className="rounded-2xl border border-remuse-secondary/20 bg-black/20 px-4 py-3 md:w-[188px] md:flex-shrink-0">
                                  <span className="block text-[11px] font-mono uppercase tracking-[0.28em] text-neutral-500">Story Archive</span>
                                  <span className="mt-2 block text-2xl font-display font-bold text-remuse-secondary">{storyItems.length}</span>
                                  <span className="text-xs text-neutral-500">件藏品带有故事记录</span>
                              </div>
                          </div>

                          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                              <div className="flex flex-wrap gap-2">
                                  <span className="rounded-full border border-neutral-800 bg-black/20 px-3 py-2 text-xs text-neutral-300">新增独立对话</span>
                                  <span className="rounded-full border border-neutral-800 bg-black/20 px-3 py-2 text-xs text-neutral-300">删除历史会话</span>
                                  <span className="rounded-full border border-neutral-800 bg-black/20 px-3 py-2 text-xs text-neutral-300">同账号浏览器本地保存</span>
                                  <span className="rounded-full border border-neutral-800 bg-black/20 px-3 py-2 text-xs text-neutral-300">语音提问与记忆召回</span>
                              </div>

                              <button
                                  type="button"
                                  onClick={() => onOpenMemoryRag?.()}
                                  disabled={!onOpenMemoryRag}
                                  className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-remuse-accent px-5 py-3 text-sm font-display font-bold text-black transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                              >
                                  <History size={16} />
                                  打开记忆对话界面
                              </button>
                          </div>
                      </div>
                  </div>

                  <div className="grid gap-4">
                      <div className="rounded-xl border border-remuse-border bg-remuse-panel p-5">
                          <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-neutral-500">Conversation Ready</p>
                          <div className="mt-4 grid grid-cols-2 gap-3">
                              <div className="rounded-2xl border border-remuse-accent/20 bg-black/20 p-4">
                                  <p className="text-xs text-neutral-500">最近故事线索</p>
                                  <p className="mt-2 text-2xl font-display font-bold text-remuse-accent">{recentMemoryItems.length}</p>
                              </div>
                              <div className="rounded-2xl border border-neutral-800 bg-black/20 p-4">
                                  <p className="text-xs text-neutral-500">可召回档案</p>
                                  <p className="mt-2 text-2xl font-display font-bold text-white">{storyItems.length}</p>
                              </div>
                          </div>
                      </div>

                      <div className="rounded-xl border border-remuse-border bg-remuse-panel p-5">
                          <div className="mb-4 flex items-center justify-between gap-3">
                              <h4 className="text-lg font-display font-bold text-white">最近录入的故事</h4>
                              <span className="rounded-full border border-remuse-border bg-black/20 px-3 py-1 text-[11px] font-mono text-neutral-400">
                                  {recentMemoryItems.length} recent
                              </span>
                          </div>

                          <div className="space-y-3">
                              {recentMemoryItems.slice(0, 2).map((match) => (
                                  <div key={match.itemId} className="overflow-hidden rounded-2xl border border-remuse-border bg-black/20">
                                      <div className="flex min-w-0 gap-3 p-3">
                                          <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-white/10 bg-neutral-900">
                                              <img src={match.imageUrl} alt={match.itemName} className="h-full w-full object-cover" />
                                          </div>
                                          <div className="min-w-0 flex-1">
                                              <div className="flex flex-wrap items-center gap-2">
                                                  <h5 className="truncate font-display text-sm font-bold text-white">{match.itemName}</h5>
                                                  <span className="rounded-full border border-remuse-accent/20 bg-remuse-accent/10 px-2 py-0.5 text-[10px] font-mono text-remuse-accent">
                                                      {match.hallName}
                                                  </span>
                                              </div>
                                              <p className="mt-2 line-clamp-2 text-xs leading-6 text-neutral-400">{match.storySnippet}</p>
                                          </div>
                                      </div>
                                  </div>
                              ))}

                              {recentMemoryItems.length === 0 && (
                                  <div className="rounded-2xl border border-dashed border-neutral-800 bg-black/20 px-4 py-8 text-center text-sm leading-7 text-neutral-500">
                                      先在扫描归档或藏品编辑里写下一段故事，这里就会出现可用于回忆对话的线索。
                                  </div>
                              )}
                          </div>
                      </div>
                  </div>
              </div>
          </section>)}

          <section>
              <div className="mb-6 flex items-center gap-4">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent to-neutral-700"></div>
                  <h2 className="flex items-center gap-2 text-xl font-display text-white">
                      <MessageCircle className="text-remuse-secondary" size={20} />
                      CONTACT
                  </h2>
                  <div className="h-px flex-1 bg-gradient-to-l from-transparent to-neutral-700"></div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="relative overflow-hidden rounded-xl border border-remuse-border bg-remuse-panel p-5 md:p-6">
                      <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-remuse-secondary/10 blur-3xl" />
                      <div className="relative flex flex-col gap-5">
                          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                              <div className="max-w-xl">
                                  <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-remuse-secondary/30 bg-remuse-secondary/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.24em] text-remuse-secondary">
                                      <MessageCircle size={14} />
                                      Remuse Support
                                  </div>
                                  <h3 className="text-2xl font-display font-bold text-white">联系我们</h3>
                                  <p className="mt-2 text-sm leading-7 text-neutral-300">
                                      如果你遇到 Bug、想提需求、咨询合作，或者希望定制数字展陈与 AI 玩法，可以直接通过微信联系我。
                                  </p>
                              </div>

                              <div className="rounded-2xl border border-remuse-accent/25 bg-black/25 px-5 py-4">
                                  <span className="text-[11px] font-mono uppercase tracking-[0.3em] text-neutral-500">WeChat</span>
                                  <p className="mt-2 font-mono text-2xl font-bold text-remuse-accent">{CONTACT_WECHAT_ID}</p>
                              </div>
                          </div>

                          <div className="flex flex-col gap-3 md:flex-row md:items-center">
                              <button
                                  onClick={handleCopyWechat}
                                  className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-remuse-accent px-5 py-3 text-sm font-display font-bold text-black transition-transform hover:scale-[1.01]"
                              >
                                  {contactStatus === 'copied' ? <Check size={16} /> : <Copy size={16} />}
                                  {contactStatus === 'copied' ? '微信号已复制' : '复制微信号'}
                              </button>
                              <div className="rounded-xl border border-neutral-800 bg-black/20 px-4 py-3 text-xs leading-6 text-neutral-400">
                                  添加时可备注：`Remuse` / `反馈` / `合作`
                              </div>
                          </div>

                          {contactStatus !== 'idle' && (
                              <p className={`text-xs ${contactStatus === 'copied' ? 'text-remuse-accent' : 'text-neutral-400'}`}>
                                  {contactStatus === 'copied' ? '已复制到剪贴板，现在可以去微信搜索 MTtin999。' : '如果系统没有自动复制，请手动添加微信号 MTtin999。'}
                              </p>
                          )}
                      </div>
                  </div>

                  <div className="rounded-xl border border-remuse-border bg-remuse-panel p-5 md:p-6">
                      <p className="text-xs font-mono uppercase tracking-[0.28em] text-neutral-500">Support Scope</p>
                      <ul className="mt-4 space-y-3 text-sm leading-7 text-neutral-300">
                          <li>Bug 反馈与移动端体验问题</li>
                          <li>新功能建议与产品共创</li>
                          <li>拼豆图纸、贴纸工坊等模块定制</li>
                          <li>展览项目、品牌合作与技术咨询</li>
                      </ul>
                  </div>
              </div>
          </section>

          {/* Achievement Grid */}
          <section>
              <div className="flex items-center gap-4 mb-8">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent to-neutral-700"></div>
                  <h2 className="text-xl font-display text-white flex items-center gap-2">
                      <Trophy className="text-remuse-secondary" size={20} /> 
                      ACHIEVEMENTS
                  </h2>
                  <div className="h-px flex-1 bg-gradient-to-l from-transparent to-neutral-700"></div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {ACHIEVEMENTS.map(ach => (
                      <AchievementBadge 
                          key={ach.id} 
                          achievement={ach} 
                          unlocked={ach.condition(items)} 
                      />
                  ))}
              </div>
          </section>

          {/* Stats Summary Footer */}
          <div className="grid grid-cols-3 gap-4 border-t border-neutral-800 pt-8">
              <div className="text-center">
                  <span className="block text-3xl font-display font-bold text-white mb-1">{items.length}</span>
                  <span className="text-[10px] text-neutral-500 font-mono uppercase">Total Items</span>
              </div>
              <div className="text-center border-l border-neutral-800">
                  <span className="block text-3xl font-display font-bold text-remuse-accent mb-1">{remusedCount}</span>
                  <span className="text-[10px] text-neutral-500 font-mono uppercase">Remused</span>
              </div>
              <div className="text-center border-l border-neutral-800">
                  <span className="block text-3xl font-display font-bold text-remuse-secondary mb-1">
                      {remusedCount * 10 + items.length * 5}
                  </span>
                  <span className="text-[10px] text-neutral-500 font-mono uppercase">Eco Points</span>
              </div>
          </div>

          {/* 示例数据清除 */}
          {showSampleClear && (
            <div className="border border-dashed border-neutral-700 rounded-lg p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-neutral-400">
                <PackageOpen size={18} className="text-remuse-secondary flex-shrink-0" />
                <span className="text-xs">当前展馆中包含示例藏品，可一键清除后开始自己的收藏</span>
              </div>
              <button
                onClick={async () => {
                  if (clearingSamples) return;
                  setClearingSamples(true);
                  try {
                    await onClearSamples?.();
                  } finally {
                    setClearingSamples(false);
                  }
                }}
                disabled={clearingSamples}
                className="flex-shrink-0 px-3 py-1.5 text-xs font-mono bg-red-900/40 text-red-300 border border-red-800/60 rounded hover:bg-red-900/70 transition-colors disabled:opacity-50"
              >
                {clearingSamples ? '清除中...' : '清除示例'}
              </button>
            </div>
          )}

      </div>

      {isSecurityModalOpen && !user?.isGuest && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
          <button
            type="button"
            aria-label="关闭账号安全弹窗"
            className="absolute inset-0 cursor-default"
            onClick={() => setIsSecurityModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-4xl">
            <AccountSecurityPanel user={user} onClose={() => setIsSecurityModalOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default CuratorOffice;
