
import React, { useState, useRef, useEffect } from 'react';
import { Sticker, ItemCategory } from '../types';
import { Sticker as StickerIcon, Download, Trash2, Box, Layers, Move, CheckCircle2, X, Grid, Shuffle, Save, BookImage, Scissors, Printer, Smile, Loader2, Plus } from 'lucide-react';
import { generateEmojiPack, EmojiPackItem } from '../services/geminiService';
import logger from '../services/logger';

interface StickerLibraryProps {
    stickers: Sticker[];
    onDeleteSticker: (id: string) => void;
    onStickerCreated?: (sticker: Sticker) => void;
}

interface LayoutItem {
    instanceId: string;
    sticker: Sticker;
    x: number; // percentage 0-100
    y: number; // percentage 0-100
    rotation: number;
    scale: number;
    zIndex: number;
}

type CanvasMode = 'COLLAGE' | 'XIAOHONGSHU' | 'PRINT' | 'EMOJI_PACK';

// ==================== 小红书模板定义 ====================
interface XhsTemplate {
    id: string;
    name: string;
    ratio: string; // e.g. '3:4'
    width: number;
    height: number;
    bgColor: string;
    accentColor: string;
    textColor: string;
    layout: 'single-center' | 'duo-stack' | 'trio-scatter' | 'quad-grid';
}

const XHS_TEMPLATES: XhsTemplate[] = [
    { id: 'warm-vanilla', name: '奶茶日记', ratio: '3:4', width: 1080, height: 1440, bgColor: '#FFF8F0', accentColor: '#E8C4A0', textColor: '#5D4037', layout: 'single-center' },
    { id: 'mint-fresh', name: '薄荷清单', ratio: '1:1', width: 1080, height: 1080, bgColor: '#F0FFF4', accentColor: '#81C784', textColor: '#2E7D32', layout: 'duo-stack' },
    { id: 'lavender-dream', name: '薰衣草信笺', ratio: '3:4', width: 1080, height: 1440, bgColor: '#F5F0FF', accentColor: '#CE93D8', textColor: '#6A1B9A', layout: 'trio-scatter' },
    { id: 'peachy-keen', name: '蜜桃生活', ratio: '4:3', width: 1080, height: 810, bgColor: '#FFF0F0', accentColor: '#F48FB1', textColor: '#C62828', layout: 'quad-grid' },
];

const isMobileDevice = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

const saveBlobToDevice = async (blob: Blob, filename: string) => {
    const mobile = isMobileDevice();

    if (mobile && navigator.share) {
        try {
            const file = new File([blob], filename, { type: blob.type || 'image/png' });
            const canShareWithFile = typeof navigator.canShare === 'function'
                ? navigator.canShare({ files: [file] })
                : true;

            if (canShareWithFile) {
                await navigator.share({
                    files: [file],
                    title: '保存图片',
                    text: '保存到相册'
                });
                return;
            }
        } catch (error) {
            logger.warn('Share API save failed, fallback to download:', error);
        }
    }

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = objectUrl;
    link.click();

    if (mobile) {
        window.open(objectUrl, '_blank');
    }

    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
};

const saveCanvasToDevice = async (canvas: HTMLCanvasElement, filename: string) => {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
        alert('图片导出失败，请重试');
        return;
    }
    await saveBlobToDevice(blob, filename);
};

const saveImageUrlToDevice = async (imageUrl: string, filename: string) => {
    try {
        const response = await fetch(imageUrl, { mode: 'cors' });
        const blob = await response.blob();
        await saveBlobToDevice(blob, filename);
    } catch (error) {
        logger.warn('Fetch image as blob failed, fallback to direct open:', error);
        if (isMobileDevice()) {
            window.open(imageUrl, '_blank');
            return;
        }
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = filename;
        link.click();
    }
};

const StickerCard: React.FC<{ 
    sticker: Sticker; 
    onDelete: () => void; 
    selectable?: boolean;
    selected?: boolean;
    onToggleSelect?: () => void;
}> = ({ sticker, onDelete, selectable, selected, onToggleSelect }) => {
    return (
        <div 
            onClick={selectable ? onToggleSelect : undefined}
            onKeyDown={selectable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleSelect?.(); } } : undefined}
            role={selectable ? 'checkbox' : undefined}
            aria-checked={selectable ? selected : undefined}
            aria-label={selectable ? `选择贴纸: ${sticker.dramaText?.slice(0, 20)}` : undefined}
            tabIndex={selectable ? 0 : undefined}
            className={`relative group bg-neutral-900 border rounded-lg p-4 flex flex-col items-center transition-all duration-200
                ${selectable ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-remuse-accent' : ''}
                ${selected 
                    ? 'border-remuse-accent ring-1 ring-remuse-accent bg-neutral-800' 
                    : 'border-neutral-800 hover:border-neutral-600'}
            `}
        >
            
            {/* Selection Indicator */}
            {selectable && (
                <div className={`absolute top-2 left-2 w-5 h-5 rounded-full border flex items-center justify-center transition-colors z-20
                    ${selected ? 'bg-remuse-accent border-remuse-accent text-black' : 'border-neutral-600 bg-black/50'}
                `}>
                    {selected && <CheckCircle2 size={12} />}
                </div>
            )}

            {/* Action Bar (Only show if not in selection mode) */}
            {!selectable && (
                <div className="absolute top-2 right-2 flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10">
                    <button 
                        onClick={async (e) => {
                            e.stopPropagation();
                            await saveImageUrlToDevice(sticker.stickerImageUrl, `remuse-sticker-${sticker.id}.png`);
                        }}
                        className="p-1.5 bg-neutral-800 text-white hover:text-remuse-accent rounded border border-neutral-700"
                        title="Download"
                    >
                        <Download size={14} />
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        className="p-1.5 bg-neutral-800 text-white hover:text-red-500 rounded border border-neutral-700"
                        title="Delete"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            )}

            {/* Sticker Image */}
            <div className="relative w-full aspect-square mb-4 flex items-center justify-center bg-neutral-950 rounded overflow-hidden border border-neutral-800" style={{ backgroundImage: 'linear-gradient(45deg, #1a1a1a 25%, transparent 25%), linear-gradient(-45deg, #1a1a1a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1a1a 75%), linear-gradient(-45deg, transparent 75%, #1a1a1a 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px' }}>
                <img 
                    src={sticker.stickerImageUrl} 
                    alt="Sticker" 
                    className={`max-w-[80%] max-h-[80%] object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-transform duration-500
                        ${!selectable && 'group-hover:scale-110'}
                    `}
                />
            </div>

            {/* Text Bubble - ONLY in Library Card View, NOT in Collage */}
            <div className={`relative w-full bg-black border border-white p-2 md:p-3 rounded-none shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] transform transition-transform ${selected ? 'rotate-0' : '-rotate-1'}`}>
                <p className="font-mono text-[10px] md:text-xs font-bold text-white text-center leading-relaxed line-clamp-2">
                    "{sticker.dramaText}"
                </p>
            </div>
        </div>
    );
};

const StickerLibrary: React.FC<StickerLibraryProps> = ({ stickers, onDeleteSticker, onStickerCreated }) => {
    // View Mode: 'LIBRARY' (Grid) or 'CANVAS' (Layout Editor)
    const [viewMode, setViewMode] = useState<'LIBRARY' | 'CANVAS'>('LIBRARY');
    const [canvasMode, setCanvasMode] = useState<CanvasMode>('COLLAGE');
    
    // Filter & Selection
    const [filter, setFilter] = useState('ALL');
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Canvas State
    const [layoutItems, setLayoutItems] = useState<LayoutItem[]>([]);
    const [isCustomMode, setIsCustomMode] = useState(false); // Enable dragging
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const canvasRef = useRef<HTMLDivElement>(null);

    // 小红书 State
    const [xhsTemplate, setXhsTemplate] = useState<XhsTemplate>(XHS_TEMPLATES[0]);
    const [xhsTitle, setXhsTitle] = useState('我的宝贝焕新记 ✨');
    const xhsCanvasRef = useRef<HTMLDivElement>(null);

    // 手账打印 State
    const printCanvasRef = useRef<HTMLDivElement>(null);
    const [printScale, setPrintScale] = useState<number>(1.0);

    // 表情包生成 State
    const [emojiPackItems, setEmojiPackItems] = useState<EmojiPackItem[]>([]);
    const [isGeneratingEmoji, setIsGeneratingEmoji] = useState(false);
    const [emojiGenProgress, setEmojiGenProgress] = useState('');
    const [emojiCount, setEmojiCount] = useState(9);
    const [savedEmojiIds, setSavedEmojiIds] = useState<Set<number>>(new Set());

    const categories = ['ALL', ...Object.values(ItemCategory)];
    const filteredStickers = filter === 'ALL' 
        ? stickers 
        : stickers.filter(s => s.category === filter);

    // --- Selection Handlers ---

    const toggleSelectionMode = () => {
        if (isSelectionMode) {
            // Cancel selection
            setIsSelectionMode(false);
            setSelectedIds(new Set());
        } else {
            setIsSelectionMode(true);
        }
    };

    const handleSelectSticker = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            if (newSet.size >= 9) {
                alert("最多选择 9 张贴纸");
                return;
            }
            newSet.add(id);
        }
        setSelectedIds(newSet);
    };

    // --- Layout Handlers ---

    const generateRandomLayout = (itemsToLayout: Sticker[]) => {
        const count = itemsToLayout.length;
        if (count === 0) {
            setLayoutItems([]);
            return;
        }

        // --- Non-overlapping Grid Algorithm ---
        
        // Determine grid size (e.g., 4 items -> 2x2, 5 items -> 3x2 or 2x3)
        const cols = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / cols);
        
        const cellWidth = 100 / cols;
        const cellHeight = 100 / rows;

        // Dynamic Base Scale to prevent overlap
        let baseScale = 1.0;
        if (count > 1) baseScale = 0.9;
        if (count > 4) baseScale = 0.75;
        if (count > 6) baseScale = 0.65;
        if (count >= 9) baseScale = 0.55;

        // Shuffle items so they don't always appear in same order
        const shuffled = [...itemsToLayout].sort(() => Math.random() - 0.5);

        const newLayoutItems: LayoutItem[] = shuffled.map((sticker, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);

            // Calculate base center of the cell
            const baseX = (col * cellWidth) + (cellWidth / 2);
            const baseY = (row * cellHeight) + (cellHeight / 2);

            // Restrict jitter to small percentage of cell size to ensure sticker stays in its lane
            const jitterX = (Math.random() - 0.5) * (cellWidth * 0.2); 
            const jitterY = (Math.random() - 0.5) * (cellHeight * 0.2);

            return {
                instanceId: `layout-${sticker.id}-${Date.now()}-${index}`,
                sticker,
                x: baseX + jitterX,
                y: baseY + jitterY,
                rotation: (Math.random() * 20) - 10, // Moderate rotation (-10 to 10 deg)
                scale: baseScale * (0.9 + Math.random() * 0.2), // Variation +/- 10%
                zIndex: index + 1
            };
        });
        setLayoutItems(newLayoutItems);
    };

    const enterCanvasMode = (mode: CanvasMode = 'COLLAGE') => {
        const selectedStickers = stickers.filter(s => selectedIds.has(s.id));
        if (mode === 'COLLAGE') {
            generateRandomLayout(selectedStickers);
        }
        if (mode === 'EMOJI_PACK') {
            // Reset emoji pack state
            setEmojiPackItems([]);
            setSavedEmojiIds(new Set());
        }
        setCanvasMode(mode);
        setViewMode('CANVAS');
        setIsCustomMode(false);
    };

    const handleReLayout = () => {
        const currentStickers = layoutItems.map(item => item.sticker);
        generateRandomLayout(currentStickers);
    };

    const handleExportLayout = async () => {
        if (!canvasRef.current) return;
        
        const canvas = document.createElement('canvas');
        const rect = canvasRef.current.getBoundingClientRect();
        
        // High resolution export
        const scaleFactor = 2; 
        canvas.width = rect.width * scaleFactor;
        canvas.height = rect.height * scaleFactor;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.scale(scaleFactor, scaleFactor);
        
        // 1. Fill Background - transparent (clearRect)
        ctx.clearRect(0, 0, rect.width, rect.height);
        
        // 2. Draw Items
        const sortedItems = [...layoutItems].sort((a, b) => a.zIndex - b.zIndex);
        
        const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
             const img = new Image();
             img.crossOrigin = "anonymous";
             img.onload = () => resolve(img);
             img.onerror = reject;
             img.src = src;
        });

        for (const item of sortedItems) {
             try {
                 const img = await loadImage(item.sticker.stickerImageUrl);
                 ctx.save();
                 
                 const x = (item.x / 100) * rect.width;
                 const y = (item.y / 100) * rect.height;
                 
                 ctx.translate(x, y);
                 ctx.rotate((item.rotation * Math.PI) / 180);
                 ctx.scale(item.scale, item.scale);
                 
                 const baseWidth = window.innerWidth >= 768 ? 192 : 128;
                 const drawWidth = baseWidth;
                 const drawHeight = (img.height / img.width) * drawWidth;
                 
                 // 贴纸已有真透明背景，直接绘制
                 ctx.globalCompositeOperation = 'source-over';
                 ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
                 
                 ctx.restore();
             } catch (err) {
                 logger.error('Collage sticker draw failed:', err);
             }
        }
        
        await saveCanvasToDevice(canvas, `remuse-layout-${Date.now()}.png`);
    };

    // --- 小红书配图导出 ---
    const handleExportXhs = async () => {
        const selectedStickers = stickers.filter(s => selectedIds.has(s.id));
        if (selectedStickers.length === 0) return;

        const t = xhsTemplate;
        const canvas = document.createElement('canvas');
        canvas.width = t.width;
        canvas.height = t.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Background
        ctx.fillStyle = t.bgColor;
        ctx.fillRect(0, 0, t.width, t.height);

        // Decorative border
        const borderInset = 40;
        ctx.strokeStyle = t.accentColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.strokeRect(borderInset, borderInset, t.width - borderInset * 2, t.height - borderInset * 2);
        ctx.setLineDash([]);

        // Corner decorations (dots)
        const dotR = 6;
        ctx.fillStyle = t.accentColor;
        [[borderInset, borderInset], [t.width - borderInset, borderInset], [borderInset, t.height - borderInset], [t.width - borderInset, t.height - borderInset]].forEach(([cx, cy]) => {
            ctx.beginPath();
            ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
            ctx.fill();
        });

        // Title area
        const titleY = 100;
        ctx.fillStyle = t.textColor;
        ctx.font = `bold 48px "Comfortaa", "Noto Sans SC", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(xhsTitle, t.width / 2, titleY);

        // Subtitle line
        ctx.fillStyle = t.accentColor;
        ctx.fillRect(t.width / 2 - 60, titleY + 20, 120, 3);

        // Load images
        const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });

        // Layout stickers based on template layout
        const contentTop = titleY + 60;
        const contentBottom = t.height - 190;
        const contentHeight = contentBottom - contentTop;
        const contentLeft = 80;
        const contentRight = t.width - 80;
        const contentWidth = contentRight - contentLeft;
        const stickersToDraw = selectedStickers.slice(0, 4);

        const positions: { x: number; y: number; size: number; rot: number }[] = [];

        if (t.layout === 'single-center' || stickersToDraw.length === 1) {
            positions.push({ x: t.width / 2, y: contentTop + contentHeight / 2, size: Math.min(contentWidth, contentHeight) * 0.7, rot: (Math.random() - 0.5) * 10 });
        } else if (t.layout === 'duo-stack' || stickersToDraw.length === 2) {
            const sz = Math.min(contentWidth * 0.6, contentHeight * 0.42);
            positions.push({ x: t.width / 2 - 30, y: contentTop + contentHeight * 0.3, size: sz, rot: -8 });
            positions.push({ x: t.width / 2 + 30, y: contentTop + contentHeight * 0.7, size: sz, rot: 6 });
        } else if (t.layout === 'trio-scatter' || stickersToDraw.length === 3) {
            const sz = Math.min(contentWidth * 0.45, contentHeight * 0.35);
            positions.push({ x: contentLeft + contentWidth * 0.3, y: contentTop + contentHeight * 0.25, size: sz, rot: -12 });
            positions.push({ x: contentLeft + contentWidth * 0.7, y: contentTop + contentHeight * 0.35, size: sz, rot: 8 });
            positions.push({ x: t.width / 2, y: contentTop + contentHeight * 0.72, size: sz, rot: -4 });
        } else {
            const sz = Math.min(contentWidth * 0.42, contentHeight * 0.42);
            const gap = 20;
            positions.push({ x: t.width / 2 - sz / 2 - gap, y: contentTop + contentHeight * 0.28, size: sz, rot: -6 });
            positions.push({ x: t.width / 2 + sz / 2 + gap, y: contentTop + contentHeight * 0.28, size: sz, rot: 5 });
            positions.push({ x: t.width / 2 - sz / 2 - gap, y: contentTop + contentHeight * 0.72, size: sz, rot: 3 });
            positions.push({ x: t.width / 2 + sz / 2 + gap, y: contentTop + contentHeight * 0.72, size: sz, rot: -8 });
        }

        for (let i = 0; i < stickersToDraw.length && i < positions.length; i++) {
            try {
                const img = await loadImage(stickersToDraw[i].stickerImageUrl);
                const pos = positions[i];
                ctx.save();
                ctx.translate(pos.x, pos.y);
                ctx.rotate((pos.rot * Math.PI) / 180);

                // White shadow/glow effect behind sticker
                ctx.shadowColor = 'rgba(0,0,0,0.08)';
                ctx.shadowBlur = 20;
                ctx.shadowOffsetY = 8;

                const drawW = pos.size;
                const drawH = (img.height / img.width) * drawW;
                ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
                ctx.restore();
            } catch (e) {
                logger.error('XHS sticker draw failed:', e);
            }
        }

        // Drama text (first sticker's text)
        if (stickersToDraw.length > 0 && stickersToDraw[0].dramaText) {
            ctx.fillStyle = t.textColor + 'AA';
            ctx.font = `16px "Noto Sans SC", sans-serif`;
            ctx.textAlign = 'center';
            const dramaLines = stickersToDraw[0].dramaText.split('').reduce((acc: string[], ch, i) => {
                const lineIndex = Math.floor(i / 20);
                if (!acc[lineIndex]) acc[lineIndex] = '';
                acc[lineIndex] += ch;
                return acc;
            }, []);
            dramaLines.slice(0, 2).forEach((line, i) => {
                ctx.fillText(line, t.width / 2, contentBottom + 36 + i * 24);
            });
        }

        // Watermark
        ctx.fillStyle = t.accentColor;
        ctx.font = `bold 24px "Noto Sans SC", sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText('再生博物馆', t.width - 60, t.height - 42);

        await saveCanvasToDevice(canvas, `remuse-xhs-${t.id}-${Date.now()}.png`);
    };

    // --- 手账贴纸打印导出 ---
    const handleExportPrint = async () => {
        const selectedStickers = stickers.filter(s => selectedIds.has(s.id));
        if (selectedStickers.length === 0) return;

        // A4 size at 300 DPI: 2480 x 3508
        const A4_W = 2480;
        const A4_H = 3508;
        const MARGIN = 120;
        const canvas = document.createElement('canvas');
        canvas.width = A4_W;
        canvas.height = A4_H;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // White background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, A4_W, A4_H);

        // Title header
        ctx.fillStyle = '#333';
        ctx.font = `bold 60px "Comfortaa", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('REMUSE Sticker Sheet', A4_W / 2, MARGIN + 50);
        ctx.font = `30px "Noto Sans SC", sans-serif`;
        ctx.fillStyle = '#999';
        ctx.fillText(`${selectedStickers.length} 张贴纸 · 打印后沿虚线裁切`, A4_W / 2, MARGIN + 100);

        const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });

        // Grid layout
        const gridTop = MARGIN + 160;
        const availW = A4_W - MARGIN * 2;
        const availH = A4_H - gridTop - MARGIN;
        const count = selectedStickers.length;
        const cols = count <= 2 ? count : count <= 4 ? 2 : 3;
        const rows = Math.ceil(count / cols);
        const cellW = availW / cols;
        const cellH = availH / rows;
        const stickerPad = 40;

        for (let i = 0; i < count; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const cx = MARGIN + col * cellW;
            const cy = gridTop + row * cellH;

            // Dashed cut line border
            ctx.strokeStyle = '#ccc';
            ctx.lineWidth = 2;
            ctx.setLineDash([12, 8]);
            ctx.strokeRect(cx + 4, cy + 4, cellW - 8, cellH - 8);
            ctx.setLineDash([]);

            // Scissors icon at top-left corner
            ctx.fillStyle = '#bbb';
            ctx.font = '24px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('✂', cx + 12, cy + 28);

            // Draw sticker
            try {
                const img = await loadImage(selectedStickers[i].stickerImageUrl);
                const maxW = cellW - stickerPad * 2;
                const maxH = cellH - stickerPad * 2 - 80; // leave room for text
                const ratio = Math.min(maxW / img.width, maxH / img.height);
                const drawW = img.width * ratio;
                const drawH = img.height * ratio;
                const drawX = cx + (cellW - drawW) / 2;
                const drawY = cy + stickerPad + (maxH - drawH) / 2;

                ctx.drawImage(img, drawX, drawY, drawW, drawH);

                // Drama text below sticker
                if (selectedStickers[i].dramaText) {
                    ctx.fillStyle = '#666';
                    ctx.font = `22px "Noto Sans SC", sans-serif`;
                    ctx.textAlign = 'center';
                    const txt = selectedStickers[i].dramaText.length > 24 
                        ? selectedStickers[i].dramaText.slice(0, 24) + '…' 
                        : selectedStickers[i].dramaText;
                    ctx.fillText(txt, cx + cellW / 2, cy + cellH - stickerPad - 10);
                }
            } catch (e) {
                logger.error('Print sticker draw failed:', e);
            }
        }

        // Footer
        ctx.fillStyle = '#ccc';
        ctx.font = `20px "Comfortaa", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('remuse.app · print on sticker paper for best results', A4_W / 2, A4_H - 40);

        await saveCanvasToDevice(canvas, `remuse-sticker-sheet-${Date.now()}.png`);
    };

    // --- 表情包生成 ---
    const handleGenerateEmojiPack = async () => {
        const selectedStickers = stickers.filter(s => selectedIds.has(s.id));
        if (selectedStickers.length === 0) return;
        const sourceSticker = selectedStickers[0];

        setIsGeneratingEmoji(true);
        setEmojiPackItems([]);
        setSavedEmojiIds(new Set());
        setEmojiGenProgress('正在生成表情包文案...');

        try {
            setEmojiGenProgress(`正在并行生成 ${emojiCount} 张表情包图片，请耐心等待...`);
            const items = await generateEmojiPack(
                sourceSticker.stickerImageUrl.split(',')[1],
                sourceSticker.dramaText || '可爱物品',
                emojiCount
            );
            setEmojiPackItems(items);
            setEmojiGenProgress('');
        } catch (err) {
            logger.error('Emoji pack generation failed:', err);
            setEmojiGenProgress('生成失败，请重试');
        } finally {
            setIsGeneratingEmoji(false);
        }
    };

    const handleSaveEmojiToLibrary = (item: EmojiPackItem, index: number) => {
        if (!onStickerCreated) return;
        const sourceSticker = stickers.find(s => selectedIds.has(s.id));
        const newSticker: Sticker = {
            id: (self.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`),
            originalItemId: sourceSticker?.originalItemId ?? sourceSticker?.id ?? 'emoji',
            stickerImageUrl: item.imageUrl,
            dramaText: item.text,
            category: sourceSticker?.category ?? '其他',
            dateCreated: new Date().toISOString(),
        };
        onStickerCreated(newSticker);
        setSavedEmojiIds(prev => new Set([...prev, index]));
    };

    const handleDownloadAllEmoji = async () => {
        for (let i = 0; i < emojiPackItems.length; i++) {
            await saveImageUrlToDevice(emojiPackItems[i].imageUrl, `remuse-emoji-${i + 1}.png`);
        }
    };

    // --- Unified Pointer Logic (mouse + touch) ---

    const handlePointerDown = (clientX: number, clientY: number, instanceId: string) => {
        if (!isCustomMode || !canvasRef.current) return;

        setActiveDragId(instanceId);

        // Bring to front
        setLayoutItems(prev => {
            const maxZ = Math.max(...prev.map(i => i.zIndex));
            return prev.map(item =>
                item.instanceId === instanceId ? { ...item, zIndex: maxZ + 1 } : item
            );
        });
    };

    const handlePointerMove = (clientX: number, clientY: number) => {
        if (!activeDragId || !isCustomMode || !canvasRef.current) return;

        const rect = canvasRef.current.getBoundingClientRect();
        const xPercent = ((clientX - rect.left) / rect.width) * 100;
        const yPercent = ((clientY - rect.top) / rect.height) * 100;

        const clampedX = Math.max(0, Math.min(100, xPercent));
        const clampedY = Math.max(0, Math.min(100, yPercent));

        setLayoutItems(prev => prev.map(item => {
            if (item.instanceId === activeDragId) {
                return { ...item, x: clampedX, y: clampedY };
            }
            return item;
        }));
    };

    const handlePointerUp = () => {
        setActiveDragId(null);
    };

    // Mouse handlers
    const handleMouseDown = (e: React.MouseEvent, instanceId: string) => {
        handlePointerDown(e.clientX, e.clientY, instanceId);
    };
    const handleMouseMove = (e: React.MouseEvent) => {
        handlePointerMove(e.clientX, e.clientY);
    };
    const handleMouseUp = () => handlePointerUp();

    // Touch handlers — 移动端拖拽支持
    const handleTouchStart = (e: React.TouchEvent, instanceId: string) => {
        if (e.touches.length === 1) {
            e.preventDefault(); // 阻止页面滚动
            handlePointerDown(e.touches[0].clientX, e.touches[0].clientY, instanceId);
        }
    };
    const handleTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 1 && activeDragId) {
            e.preventDefault();
            handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
        }
    };
    const handleTouchEnd = () => handlePointerUp();

    // Global pointer up (mouse + touch) — catch drops outside the element
    useEffect(() => {
        const handleGlobalUp = () => setActiveDragId(null);
        window.addEventListener('mouseup', handleGlobalUp);
        window.addEventListener('touchend', handleGlobalUp);
        window.addEventListener('touchcancel', handleGlobalUp);
        return () => {
            window.removeEventListener('mouseup', handleGlobalUp);
            window.removeEventListener('touchend', handleGlobalUp);
            window.removeEventListener('touchcancel', handleGlobalUp);
        };
    }, []);


    // --- RENDER: CANVAS MODE ---
    if (viewMode === 'CANVAS') {
        const selectedStickers = stickers.filter(s => selectedIds.has(s.id));

        // --- Sub-render: 小红书配图 ---
        if (canvasMode === 'XIAOHONGSHU') {
            const t = xhsTemplate;
            return (
                <div className="h-full bg-remuse-dark text-white flex flex-col">
                    {/* Header */}
                    <div className="p-4 border-b border-neutral-800 bg-remuse-panel flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button onClick={() => setViewMode('LIBRARY')} className="text-neutral-500 hover:text-white"><X size={24} /></button>
                            <h2 className="text-xl font-bold font-display text-white flex items-center gap-2">
                                <BookImage size={20} className="text-pink-400" />
                                小红书配图
                            </h2>
                        </div>
                        <button 
                            onClick={handleExportXhs}
                            className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-pink-500 to-orange-400 text-white rounded-full text-sm font-display font-bold hover:scale-105 transition-transform shadow-lg"
                        >
                            <Download size={16} /> 保存配图
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto flex flex-col md:flex-row">
                        {/* Preview */}
                        <div className="flex-1 flex items-center justify-center p-6 bg-[#111]">
                            <div 
                                ref={xhsCanvasRef}
                                className="shadow-2xl rounded-lg overflow-hidden transition-all duration-300"
                                style={{ 
                                    backgroundColor: t.bgColor,
                                    width: '100%',
                                    maxWidth: t.ratio === '1:1' ? '360px' : t.ratio === '4:3' ? '420px' : '340px',
                                    aspectRatio: `${t.width}/${t.height}`,
                                    maxHeight: '70vh'
                                }}
                            >
                                {/* Flex column layout — title / stickers / text / watermark, no overlap */}
                                <div className="w-full h-full relative p-5 flex flex-col">
                                    {/* Decorative border (behind everything) */}
                                    <div className="absolute inset-4 border-2 border-dashed rounded-sm pointer-events-none" style={{ borderColor: t.accentColor + '66' }} />
                                    {/* Corner dots */}
                                    {[[4,4],[4,'auto'],['auto',4],['auto','auto']].map(([top, left], idx) => (
                                        <div key={idx} className="absolute w-3 h-3 rounded-full pointer-events-none" style={{ 
                                            backgroundColor: t.accentColor,
                                            top: typeof top === 'number' ? `${top * 4}px` : undefined,
                                            bottom: top === 'auto' ? '16px' : undefined,
                                            left: typeof left === 'number' ? `${left * 4}px` : undefined,
                                            right: left === 'auto' ? '16px' : undefined,
                                        }} />
                                    ))}

                                    {/* ① Title (固定高度) */}
                                    <div className="text-center pt-3 pb-1 shrink-0 relative z-10">
                                        <p className="font-bold font-display text-base leading-tight" style={{ color: t.textColor }}>{xhsTitle}</p>
                                        <div className="w-12 h-0.5 mx-auto mt-1.5" style={{ backgroundColor: t.accentColor }} />
                                    </div>

                                    {/* ② Stickers (弹性填充中间所有空间) */}
                                    <div className="flex-1 min-h-0 flex flex-wrap items-center justify-center gap-2 z-20 overflow-hidden px-4 py-2">
                                        {selectedStickers.slice(0, 4).map((s, i) => (
                                            <div key={s.id} className="transition-transform hover:scale-110" style={{ 
                                                transform: `rotate(${(i % 2 === 0 ? -1 : 1) * (4 + i * 2)}deg)`,
                                                width: selectedStickers.length === 1 ? '54%' : selectedStickers.length === 2 ? '40%' : '34%',
                                                maxWidth: '120px'
                                            }}>
                                                <img src={s.stickerImageUrl} alt="" className="w-full h-auto max-h-32 object-contain drop-shadow-lg" />
                                            </div>
                                        ))}
                                    </div>

                                    {/* ③ Drama text (固定在贴纸下方) */}
                                    {selectedStickers[0]?.dramaText && (
                                        <p className="shrink-0 text-center text-xs opacity-60 line-clamp-2 z-10 px-4 pb-1 leading-snug" style={{ color: t.textColor }}>
                                            「{selectedStickers[0].dramaText.slice(0, 40)}」
                                        </p>
                                    )}

                                    {/* ④ Watermark (最底部右对齐) */}
                                    <div className="shrink-0 text-right z-10 pr-1 pb-0.5">
                                        <p className="font-display font-bold text-xs" style={{ color: t.accentColor }}>再生博物馆</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Sidebar Controls */}
                        <div className="w-full md:w-72 bg-remuse-panel border-t md:border-t-0 md:border-l border-neutral-800 p-5 space-y-5 overflow-y-auto">
                            {/* Template Picker */}
                            <div>
                                <label className="text-xs font-display text-neutral-400 uppercase tracking-wider mb-3 block">选择风格</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {XHS_TEMPLATES.map(tmpl => (
                                        <button
                                            key={tmpl.id}
                                            onClick={() => setXhsTemplate(tmpl)}
                                            className={`p-3 rounded-lg border text-left transition-all text-xs
                                                ${xhsTemplate.id === tmpl.id 
                                                    ? 'border-pink-400 bg-pink-400/10' 
                                                    : 'border-neutral-700 hover:border-neutral-500'}
                                            `}
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: tmpl.bgColor, border: `2px solid ${tmpl.accentColor}` }} />
                                                <span className="font-display font-bold text-white">{tmpl.name}</span>
                                            </div>
                                            <span className="text-neutral-500">{tmpl.ratio}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Title Editor */}
                            <div>
                                <label className="text-xs font-display text-neutral-400 uppercase tracking-wider mb-2 block">标题文案</label>
                                <input 
                                    type="text"
                                    value={xhsTitle}
                                    onChange={e => setXhsTitle(e.target.value)}
                                    maxLength={20}
                                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-pink-400 focus:outline-none transition-colors"
                                    placeholder="输入标题..."
                                />
                            </div>

                            {/* Info */}
                            <div className="bg-neutral-900 rounded-lg p-3 text-xs text-neutral-500 space-y-1">
                                <p>✨ 导出为 {xhsTemplate.width}×{xhsTemplate.height} 高清图</p>
                                <p>📐 比例 {xhsTemplate.ratio}，适合{xhsTemplate.ratio === '3:4' ? '小红书/ins' : xhsTemplate.ratio === '1:1' ? '朋友圈/微博' : '公众号/B站'}封面</p>
                                <p>🎨 最多放置 4 张贴纸</p>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // --- Sub-render: 手账贴纸打印 ---
        if (canvasMode === 'PRINT') {
            return (
                <div className="h-full bg-remuse-dark text-white flex flex-col">
                    {/* Header */}
                    <div className="p-4 border-b border-neutral-800 bg-remuse-panel flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button onClick={() => setViewMode('LIBRARY')} className="text-neutral-500 hover:text-white"><X size={24} /></button>
                            <h2 className="text-xl font-bold font-display text-white flex items-center gap-2">
                                <Scissors size={20} className="text-remuse-secondary" />
                                手账贴纸打印
                            </h2>
                        </div>
                        <button 
                            onClick={handleExportPrint}
                            className="flex items-center gap-2 px-5 py-2 bg-remuse-secondary text-black rounded-full text-sm font-display font-bold hover:scale-105 transition-transform shadow-lg"
                        >
                            <Printer size={16} /> 导出打印图
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto flex flex-col md:flex-row">
                        {/* Preview */}
                        <div className="flex-1 flex items-center justify-center p-6 bg-[#111]">
                            <div 
                                ref={printCanvasRef}
                                className="bg-white shadow-2xl rounded-sm overflow-hidden"
                                style={{ 
                                    width: '100%',
                                    maxWidth: '340px',
                                    aspectRatio: '2480/3508',
                                    maxHeight: '75vh',
                                    transform: `scale(${printScale})`,
                                    transformOrigin: 'center center',
                                    transition: 'transform 0.3s'
                                }}
                            >
                                {/* Header */}
                                <div className="text-center pt-4 pb-2 border-b border-gray-200 mx-4">
                                    <p className="font-display font-bold text-base text-gray-700">REMUSE Sticker Sheet</p>
                                    <p className="text-[9px] text-gray-400 mt-0.5">{selectedStickers.length} 张贴纸 · 打印后沿虚线裁切</p>
                                </div>

                                {/* Grid */}
                                <div className="p-3" style={{ 
                                    display: 'grid',
                                    gridTemplateColumns: `repeat(${selectedStickers.length <= 2 ? selectedStickers.length : selectedStickers.length <= 4 ? 2 : 3}, 1fr)`,
                                    gap: '4px',
                                    flex: 1
                                }}>
                                    {selectedStickers.map((s, i) => (
                                        <div key={s.id} className="border border-dashed border-gray-300 rounded-sm p-2 relative flex flex-col items-center justify-center">
                                            <span className="absolute top-0.5 left-1 text-[8px] text-gray-300">✂</span>
                                            <img src={s.stickerImageUrl} alt="" className="w-full h-auto max-h-32 object-contain" />
                                            {s.dramaText && (
                                                <p className="text-[7px] text-gray-400 text-center mt-1 line-clamp-1">{s.dramaText.slice(0, 20)}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Footer */}
                                <div className="text-center pb-2">
                                    <p className="text-[7px] text-gray-300 font-display">remuse.app · print on sticker paper for best results</p>
                                </div>
                            </div>
                        </div>

                        {/* Sidebar */}
                        <div className="w-full md:w-72 bg-remuse-panel border-t md:border-t-0 md:border-l border-neutral-800 p-5 space-y-5">
                            <div>
                                <label className="text-xs font-display text-neutral-400 uppercase tracking-wider mb-2 block">预览缩放</label>
                                <input 
                                    type="range" min="0.5" max="1.5" step="0.1" 
                                    value={printScale}
                                    onChange={e => setPrintScale(parseFloat(e.target.value))}
                                    className="w-full accent-remuse-secondary"
                                />
                            </div>

                            <div className="bg-neutral-900 rounded-lg p-4 text-xs text-neutral-400 space-y-2">
                                <p className="font-display font-bold text-white text-sm mb-2">📋 使用说明</p>
                                <p>1. 点击「导出打印图」保存高清 PNG</p>
                                <p>2. 使用 A4 贴纸纸 / 不干胶纸打印</p>
                                <p>3. 沿虚线裁切，贴到手账本上 ✂️</p>
                <p className="pt-2 text-neutral-400 border-t border-neutral-800 mt-2">🖨️ 导出尺寸：2480×3508px（A4 300DPI）</p>
                                <p>📦 已选择 {selectedStickers.length} 张贴纸（最多 9 张）</p>
                            </div>

                            <div className="bg-gradient-to-br from-remuse-secondary/10 to-remuse-accent/10 rounded-lg p-4 border border-remuse-secondary/20">
                                <p className="text-xs text-remuse-secondary font-display font-bold mb-1">💡 小贴士</p>
                                <p className="text-xs text-neutral-400">推荐使用「防水光面不干胶」打印，效果最佳！在打印设置中选择「实际大小」避免缩放。</p>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // --- Sub-render: 表情包生成 ---
        if (canvasMode === 'EMOJI_PACK') {
            const sourceSticker = stickers.filter(s => selectedIds.has(s.id))[0];
            return (
                <div className="h-full bg-remuse-dark text-white flex flex-col">
                    {/* Header */}
                    <div className="p-4 border-b border-neutral-800 bg-remuse-panel flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-4">
                            <button onClick={() => setViewMode('LIBRARY')} className="text-neutral-500 hover:text-white"><X size={24} /></button>
                            <h2 className="text-xl font-bold font-display text-white flex items-center gap-2">
                                <Smile size={20} className="text-yellow-400" />
                                表情包生成器
                            </h2>
                        </div>
                        <div className="flex items-center gap-3">
                            {emojiPackItems.length > 0 && (
                                <button
                                    onClick={handleDownloadAllEmoji}
                                    className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-full text-sm font-display transition-colors"
                                >
                                    <Download size={15} /> 全部下载
                                </button>
                            )}
                            <button
                                onClick={handleGenerateEmojiPack}
                                disabled={isGeneratingEmoji || !sourceSticker}
                                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-yellow-400 to-orange-400 text-black rounded-full text-sm font-display font-bold hover:scale-105 transition-transform shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                            >
                                {isGeneratingEmoji
                                    ? <><Loader2 size={15} className="animate-spin" /> 生成中...</>
                                    : <><Smile size={15} /> {emojiPackItems.length > 0 ? '重新生成' : '开始生成'}</>
                                }
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                        {/* Main Area */}
                        <div className="flex-1 overflow-y-auto p-5">
                            {/* Source Sticker Preview */}
                            {sourceSticker && (
                                <div className="mb-5 p-4 bg-neutral-900 border border-neutral-800 rounded-xl flex items-center gap-4">
                                    <div className="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-neutral-950 flex items-center justify-center"
                                        style={{ backgroundImage: 'linear-gradient(45deg, #1a1a1a 25%, transparent 25%), linear-gradient(-45deg, #1a1a1a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1a1a 75%), linear-gradient(-45deg, transparent 75%, #1a1a1a 75%)', backgroundSize: '10px 10px', backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px' }}>
                                        <img src={sourceSticker.stickerImageUrl} alt="" className="w-12 h-12 object-contain" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-neutral-500 font-display mb-1">基于此贴纸生成表情包</p>
                                        <p className="text-sm text-white font-mono line-clamp-2">{sourceSticker.dramaText}</p>
                                    </div>
                                </div>
                            )}

                            {/* Generating Status */}
                            {isGeneratingEmoji && (
                                <div className="flex flex-col items-center justify-center py-16 gap-4">
                                    <div className="relative">
                                        <div className="w-16 h-16 rounded-full border-4 border-yellow-400/20 border-t-yellow-400 animate-spin" />
                                        <Smile size={24} className="absolute inset-0 m-auto text-yellow-400" />
                                    </div>
                                    <p className="text-sm text-neutral-400 text-center max-w-xs">{emojiGenProgress}</p>
                                    <p className="text-xs text-neutral-600 text-center">AI 正在为每张表情包生成独特图像，稍等片刻~</p>
                                </div>
                            )}

                            {/* Empty State */}
                            {!isGeneratingEmoji && emojiPackItems.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-neutral-800 rounded-xl gap-4">
                                    <div className="text-5xl">😄 😂 🥹 😎</div>
                                    <p className="text-neutral-400 font-display text-sm">点击「开始生成」创建你的专属表情包</p>
                                    <p className="text-xs text-neutral-600 text-center max-w-xs">AI 会基于你的贴纸角色，生成带有不同表情和文案气泡的表情包套组</p>
                                    {emojiGenProgress && <p className="text-sm text-red-400">{emojiGenProgress}</p>}
                                </div>
                            )}

                            {/* Results Grid */}
                            {!isGeneratingEmoji && emojiPackItems.length > 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                    {emojiPackItems.map((item, idx) => (
                                        <div key={idx} className="group relative bg-neutral-900 rounded-xl border border-neutral-800 hover:border-yellow-400/40 transition-all overflow-hidden">
                                            {/* Sticker Image */}
                                            <div className="aspect-square flex items-center justify-center p-3"
                                                style={{ backgroundImage: 'linear-gradient(45deg, #1a1a1a 25%, transparent 25%), linear-gradient(-45deg, #1a1a1a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1a1a 75%), linear-gradient(-45deg, transparent 75%, #1a1a1a 75%)', backgroundSize: '14px 14px', backgroundPosition: '0 0, 0 7px, 7px -7px, -7px 0px' }}>
                                                <img src={item.imageUrl} alt={item.text} className="w-full h-full object-contain drop-shadow-lg" />
                                            </div>
                                            {/* Text tag */}
                                            <div className="px-3 py-2 border-t border-neutral-800 bg-neutral-950">
                                                <p className="text-center text-sm font-bold text-white font-display">{item.text}</p>
                                            </div>
                                            {/* Actions overlay */}
                                            <div className="absolute top-2 right-2 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => saveImageUrlToDevice(item.imageUrl, `remuse-emoji-${idx + 1}.png`)}
                                                    className="p-1.5 bg-black/70 hover:bg-black text-white rounded-lg border border-neutral-700 backdrop-blur-sm"
                                                    title="下载"
                                                >
                                                    <Download size={13} />
                                                </button>
                                                {onStickerCreated && (
                                                    <button
                                                        onClick={() => handleSaveEmojiToLibrary(item, idx)}
                                                        disabled={savedEmojiIds.has(idx)}
                                                        className={`p-1.5 rounded-lg border backdrop-blur-sm transition-colors ${
                                                            savedEmojiIds.has(idx)
                                                                ? 'bg-yellow-400/20 border-yellow-400 text-yellow-400 cursor-default'
                                                                : 'bg-black/70 hover:bg-yellow-400/20 text-white hover:text-yellow-400 border-neutral-700'
                                                        }`}
                                                        title={savedEmojiIds.has(idx) ? '已存入贴纸库' : '存入贴纸库'}
                                                    >
                                                        {savedEmojiIds.has(idx) ? <CheckCircle2 size={13} /> : <Plus size={13} />}
                                                    </button>
                                                )}
                                            </div>
                                            {/* Saved badge */}
                                            {savedEmojiIds.has(idx) && (
                                                <div className="absolute top-2 left-2">
                                                    <span className="text-[10px] bg-yellow-400 text-black font-bold px-1.5 py-0.5 rounded-full">已入库</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Sidebar */}
                        <div className="w-full md:w-64 flex-shrink-0 bg-remuse-panel border-t md:border-t-0 md:border-l border-neutral-800 p-5 space-y-5 overflow-y-auto">
                            <div>
                                <label className="text-xs font-display text-neutral-400 uppercase tracking-wider mb-3 block">生成数量</label>
                                <div className="flex gap-2">
                                    {[3, 6, 9].map(n => (
                                        <button
                                            key={n}
                                            onClick={() => setEmojiCount(n)}
                                            className={`flex-1 py-2 rounded-lg border text-sm font-display font-bold transition-all ${
                                                emojiCount === n
                                                    ? 'bg-yellow-400 text-black border-yellow-400'
                                                    : 'bg-neutral-900 text-neutral-400 border-neutral-700 hover:border-neutral-500'
                                            }`}
                                        >
                                            {n} 张
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-neutral-900 rounded-xl p-4 space-y-2 text-xs text-neutral-400">
                                <p className="font-display font-bold text-white text-sm mb-1">✨ 功能说明</p>
                                <p>基于贴纸角色生成带文案气泡的表情包</p>
                                <p>每张表情包有独特表情和场景文案</p>
                                <p>可单张下载或全部保存到贴纸库</p>
                                <p className="pt-2 border-t border-neutral-800 text-neutral-600">生成 9 张约需 30-60 秒</p>
                            </div>

                            {emojiPackItems.length > 0 && (
                                <div className="space-y-2">
                                    <button
                                        onClick={() => {
                                            emojiPackItems.forEach((item, idx) => {
                                                if (!savedEmojiIds.has(idx) && onStickerCreated) {
                                                    handleSaveEmojiToLibrary(item, idx);
                                                }
                                            });
                                        }}
                                        disabled={savedEmojiIds.size === emojiPackItems.length}
                                        className="w-full py-2.5 rounded-xl border border-yellow-400/30 hover:border-yellow-400 hover:bg-yellow-400/10 text-sm font-display font-bold text-yellow-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        <Plus size={15} />
                                        {savedEmojiIds.size === emojiPackItems.length ? '全部已入库 ✓' : '全部存入贴纸库'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            );
        }

        // --- Sub-render: 自由拼贴 (COLLAGE, default) ---
        return (
            <div className="h-full bg-remuse-dark text-white flex flex-col">
                {/* Canvas Header */}
                <div className="p-4 border-b border-neutral-800 bg-remuse-panel flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setViewMode('LIBRARY')} className="text-neutral-500 hover:text-white">
                            <X size={24} />
                        </button>
                        <h2 className="text-xl font-bold font-display text-white flex items-center gap-2">
                            <Grid size={20} className="text-remuse-accent" />
                            STICKER COLLAGE
                        </h2>
                    </div>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={handleReLayout}
                            className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded text-sm font-display border border-neutral-700"
                        >
                            <Shuffle size={16} /> 重新排版
                        </button>
                        <button 
                            onClick={() => setIsCustomMode(!isCustomMode)}
                            className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-display border transition-colors
                                ${isCustomMode 
                                    ? 'bg-remuse-accent text-black border-remuse-accent' 
                                    : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white'}
                            `}
                        >
                            <Move size={16} /> {isCustomMode ? '完成自定义' : '自定义排版'}
                        </button>
                        <button 
                            onClick={handleExportLayout}
                            className="flex items-center gap-2 px-4 py-2 bg-remuse-secondary text-black hover:bg-white rounded text-sm font-display font-bold border border-remuse-secondary transition-colors"
                        >
                            <Save size={16} /> 导出排版
                        </button>
                    </div>
                </div>

                {/* Canvas Area */}
                <div className="flex-1 overflow-hidden relative flex items-center justify-center p-8 bg-[#111]">
                    <div 
                        ref={canvasRef}
                        onMouseMove={handleMouseMove}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        className={`
                            relative w-full max-w-3xl aspect-[4/3] bg-black shadow-2xl border border-neutral-800 overflow-hidden
                            ${isCustomMode ? 'cursor-default' : ''}
                        `}
                        style={{ touchAction: isCustomMode ? 'none' : 'auto' }}
                    >
                         {/* Removed Grid Visual */}

                         {layoutItems.map(item => (
                             <div
                                key={item.instanceId}
                                onMouseDown={(e) => handleMouseDown(e, item.instanceId)}
                                onTouchStart={(e) => handleTouchStart(e, item.instanceId)}
                                style={{
                                    position: 'absolute',
                                    left: `${item.x}%`,
                                    top: `${item.y}%`,
                                    transform: `translate(-50%, -50%) rotate(${item.rotation}deg) scale(${item.scale})`,
                                    zIndex: item.zIndex,
                                    cursor: isCustomMode ? (activeDragId === item.instanceId ? 'grabbing' : 'grab') : 'default',
                                    touchAction: 'none'
                                }}
                                className={`
                                    w-32 md:w-48 transition-transform duration-300 ease-out select-none
                                    ${activeDragId === item.instanceId ? 'duration-0 scale-105' : ''}
                                `}
                             >
                                <img 
                                    src={item.sticker.stickerImageUrl} 
                                    alt="Sticker" 
                                    className="w-full h-auto pointer-events-none" 
                                />
                                {isCustomMode && (
                                    <div className="absolute inset-0 border border-remuse-accent/50 rounded-lg pointer-events-none"></div>
                                )}
                             </div>
                         ))}
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="p-4 bg-remuse-panel border-t border-neutral-800 flex justify-center">
                    <p className="text-xs text-neutral-500 font-mono">
                        {isCustomMode ? '拖拽贴纸以调整位置' : '选择一个模式来调整布局'}
                    </p>
                </div>
            </div>
        );
    }

    // --- RENDER: LIBRARY MODE ---
    return (
        <div className="h-full bg-remuse-dark text-white p-6 md:p-10 overflow-y-auto pb-32">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
                <div>
                    <h1 className="text-4xl font-bold font-display tracking-tight mb-2 flex items-center gap-3">
                        <StickerIcon size={36} className="text-remuse-accent" />
                        STICKER LIBRARY
                    </h1>
                    <p className="text-neutral-500 text-sm">
                        实体物品的数字分身与专属剧情。
                    </p>
                </div>
                
                {/* Action Area */}
                <div className="flex flex-col md:flex-row items-end gap-3">
                    <div className="flex items-center gap-2 px-4 py-2 bg-neutral-900 border border-neutral-800 rounded-full">
                        <Box size={16} className="text-neutral-500" />
                        <span className="text-sm font-mono text-white">{stickers.length} ITEMS</span>
                    </div>
                    
                    {/* Toggle Selection Mode Button */}
                    <button 
                        onClick={toggleSelectionMode}
                        className={`flex items-center gap-2 px-5 py-2 rounded-full font-display text-sm border transition-all
                            ${isSelectionMode 
                                ? 'bg-neutral-800 text-white border-neutral-600' 
                                : 'bg-remuse-secondary text-black border-remuse-secondary hover:bg-cyan-300'}
                        `}
                    >
                        {isSelectionMode ? <X size={16} /> : <Grid size={16} />}
                        {isSelectionMode ? '取消选择' : '排版模式'}
                    </button>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar mb-8 pb-2">
                {categories.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setFilter(cat)}
                        className={`px-4 py-2 text-xs font-bold font-display whitespace-nowrap border transition-all
                            ${filter === cat 
                                ? 'bg-remuse-accent text-black border-remuse-accent' 
                                : 'bg-transparent text-neutral-500 border-neutral-800 hover:border-neutral-600 hover:text-white'}
                        `}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Selection Status Bar */}
            {isSelectionMode && (
                <div className="mb-6 p-4 bg-remuse-accent/10 border border-remuse-accent/30 rounded-xl animate-fade-in">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 size={20} className="text-remuse-accent" />
                            <span className="text-sm font-display text-white">已选择 {selectedIds.size} 张（最多 9 张）</span>
                        </div>
                    </div>
                    
                    {/* 4 Mode Buttons */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {/* 小红书配图 */}
                        <button 
                            onClick={() => enterCanvasMode('XIAOHONGSHU')}
                            disabled={selectedIds.size === 0}
                            className={`group relative p-4 rounded-xl border text-left transition-all overflow-hidden
                                ${selectedIds.size > 0 
                                    ? 'border-pink-400/30 hover:border-pink-400 hover:bg-pink-400/10 cursor-pointer hover:scale-[1.02]' 
                                    : 'border-neutral-800 opacity-40 cursor-not-allowed'}
                            `}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-orange-400 flex items-center justify-center text-white">
                                    <BookImage size={16} />
                                </div>
                                <span className="font-display font-bold text-sm text-white">小红书配图</span>
                            </div>
                            <p className="text-[11px] text-neutral-400 leading-relaxed">生成精美社交媒体配图，4种风格模板可选</p>
                        </button>

                        {/* 手账贴纸打印 */}
                        <button 
                            onClick={() => enterCanvasMode('PRINT')}
                            disabled={selectedIds.size === 0}
                            className={`group relative p-4 rounded-xl border text-left transition-all overflow-hidden
                                ${selectedIds.size > 0 
                                    ? 'border-remuse-secondary/30 hover:border-remuse-secondary hover:bg-remuse-secondary/10 cursor-pointer hover:scale-[1.02]' 
                                    : 'border-neutral-800 opacity-40 cursor-not-allowed'}
                            `}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white">
                                    <Scissors size={16} />
                                </div>
                                <span className="font-display font-bold text-sm text-white">手账贴纸</span>
                            </div>
                            <p className="text-[11px] text-neutral-400 leading-relaxed">A4排版 + 裁切线，打印后贴到手账本</p>
                        </button>

                        {/* 自由拼贴 */}
                        <button 
                            onClick={() => enterCanvasMode('COLLAGE')}
                            disabled={selectedIds.size === 0}
                            className={`group relative p-4 rounded-xl border text-left transition-all overflow-hidden
                                ${selectedIds.size > 0 
                                    ? 'border-remuse-accent/30 hover:border-remuse-accent hover:bg-remuse-accent/10 cursor-pointer hover:scale-[1.02]' 
                                    : 'border-neutral-800 opacity-40 cursor-not-allowed'}
                            `}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-lime-400 to-green-500 flex items-center justify-center text-black">
                                    <Layers size={16} />
                                </div>
                                <span className="font-display font-bold text-sm text-white">自由拼贴</span>
                            </div>
                            <p className="text-[11px] text-neutral-400 leading-relaxed">拖拽排版自由组合，导出透明背景拼贴</p>
                        </button>

                        {/* 表情包生成 */}
                        <button
                            onClick={() => enterCanvasMode('EMOJI_PACK')}
                            disabled={selectedIds.size === 0}
                            className={`group relative p-4 rounded-xl border text-left transition-all overflow-hidden
                                ${selectedIds.size > 0
                                    ? 'border-yellow-400/30 hover:border-yellow-400 hover:bg-yellow-400/10 cursor-pointer hover:scale-[1.02]'
                                    : 'border-neutral-800 opacity-40 cursor-not-allowed'}
                            `}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-400 to-orange-400 flex items-center justify-center text-black">
                                    <Smile size={16} />
                                </div>
                                <span className="font-display font-bold text-sm text-white">表情包</span>
                            </div>
                            <p className="text-[11px] text-neutral-400 leading-relaxed">AI 生成带文案气泡的可爱表情包套组</p>
                        </button>
                    </div>
                </div>
            )}

            {/* Grid */}
            {filteredStickers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-neutral-800 rounded-lg">
                    <StickerIcon size={48} className="text-neutral-500 mb-4" />
                    <p className="text-neutral-400 font-display">暂无贴纸</p>
                    <p className="text-xs text-neutral-400 mt-2">使用扫描仪生成你的第一个贴纸</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredStickers.map(sticker => (
                        <StickerCard 
                            key={sticker.id} 
                            sticker={sticker} 
                            onDelete={() => onDeleteSticker(sticker.id)}
                            selectable={isSelectionMode}
                            selected={selectedIds.has(sticker.id)}
                            onToggleSelect={() => handleSelectSticker(sticker.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default StickerLibrary;
