
import React, { useEffect, useRef, useState } from 'react';
import { CollectedItem, ItemCategory, SavedJournal, SavedTransformationGuide, SaveJournalInput, Sticker } from '../types';
import { Sticker as StickerIcon, Download, Trash2, Box, Layers, Move, CheckCircle2, X, Grid, Shuffle, Save, BookImage, Scissors, Printer, Smile, Loader2, Plus, Mic, MicOff } from 'lucide-react';
import { generateEmojiPack, EmojiPackItem, StickerInput } from '../services/geminiService';
import { fetchImageAsset } from '../services/imageUtils';
import logger from '../services/logger';
import { EMOJI_PACK_CATEGORY, PERLER_PATTERN_CATEGORY } from '../shared/stickerCategories';

export type CanvasMode = 'COLLAGE' | 'XIAOHONGSHU' | 'PRINT' | 'EMOJI_PACK';

type LibraryTab = 'STICKERS' | 'EMOJI_PACKS' | 'PERLER_PATTERNS' | 'JOURNALS' | 'TRANSFORMATION_GUIDES';
type LibraryViewMode = 'LIBRARY' | 'CANVAS';

interface StickerLibraryProps {
    stickers: Sticker[];
    sourceItems?: CollectedItem[];
    journals?: SavedJournal[];
    guides?: SavedTransformationGuide[];
    onDeleteSticker: (id: string) => void;
    onStickerCreated?: (sticker: Sticker) => Promise<void> | void;
    onSaveJournal?: (journal: SaveJournalInput) => Promise<SavedJournal> | void;
    onDeleteJournal?: (id: string) => Promise<void> | void;
    onOpenPerlerPattern?: (pattern: Sticker) => void;
    initialViewMode?: LibraryViewMode;
    initialCanvasMode?: CanvasMode;
    initialSelectionIds?: string[];
    initialLibraryTab?: LibraryTab;
    headerTitle?: string;
    headerDescription?: string;
    showLayoutModeToggle?: boolean;
    onOpenGuide?: (guide: SavedTransformationGuide) => void;
    onExit?: () => void;
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

type JournalRestoreItem = SavedJournal['layoutItems'][number];

type PrintInteractionMode = 'drag' | 'scale' | 'rotate';
type PrintResizeHandle = 'nw' | 'ne' | 'sw' | 'se';

interface PrintInteractionState {
    instanceId: string;
    mode: PrintInteractionMode;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startScale: number;
    startRotation: number;
    centerX: number;
    centerY: number;
    startDistance: number;
    startAngle: number;
}

// ==================== 小红书模板定义 ====================
type XhsBackgroundStyle = 'forest' | 'paper' | 'editorial' | 'candy';
type XhsStickerEffect = 'outline' | 'paper' | 'shadow' | 'glow';
type XhsHeaderStyle = 'center' | 'note' | 'editorial' | 'bubble';
type XhsCaptionStyle = 'card' | 'plain' | 'strip';
type XhsBadgeKind = 'solid' | 'outline' | 'tag';
type PrintTemplateStyle = 'journal' | 'stamp' | 'postcard' | 'card';

interface XhsSlot {
    x: number;
    y: number;
    width: number;
    rotate: number;
    zIndex?: number;
}

interface XhsBadge {
    text: string;
    x: number;
    y: number;
    rotate: number;
    kind: XhsBadgeKind;
}

interface XhsTemplate {
    id: string;
    name: string;
    ratio: '3:4' | '1:1' | '4:3';
    width: number;
    height: number;
    bgColor: string;
    accentColor: string;
    textColor: string;
    secondaryTextColor: string;
    panelColor: string;
    backgroundStyle: XhsBackgroundStyle;
    stickerEffect: XhsStickerEffect;
    headerStyle: XhsHeaderStyle;
    captionStyle: XhsCaptionStyle;
    eyebrow: string;
    footerText: string;
    slots: XhsSlot[];
    badges: XhsBadge[];
    layout?: string;
}

interface XhsStickerPlacement extends XhsSlot {
    locked?: boolean;
}

interface PrintTemplate {
    id: string;
    name: string;
    description: string;
    bgColor: string;
    accentColor: string;
    textColor: string;
    secondaryTextColor: string;
    panelColor: string;
    style: PrintTemplateStyle;
    headerTitle: string;
    headerSubtitle: string;
    footerText: string;
}

const _LEGACY_XHS_TEMPLATES = [
    { id: 'warm-vanilla', name: '奶茶日记', ratio: '3:4', width: 1080, height: 1440, bgColor: '#FFF8F0', accentColor: '#E8C4A0', textColor: '#5D4037', layout: 'single-center' },
    { id: 'mint-fresh', name: '薄荷清单', ratio: '1:1', width: 1080, height: 1080, bgColor: '#F0FFF4', accentColor: '#81C784', textColor: '#2E7D32', layout: 'duo-stack' },
    { id: 'lavender-dream', name: '薰衣草信笺', ratio: '3:4', width: 1080, height: 1440, bgColor: '#F5F0FF', accentColor: '#CE93D8', textColor: '#6A1B9A', layout: 'trio-scatter' },
    { id: 'peachy-keen', name: '蜜桃生活', ratio: '4:3', width: 1080, height: 810, bgColor: '#FFF0F0', accentColor: '#F48FB1', textColor: '#C62828', layout: 'quad-grid' },
];

const XHS_POST_WIDTH = 1080;
const XHS_POST_HEIGHT = 1440;

const XHS_TEMPLATES: XhsTemplate[] = [
    {
        id: 'forest-moodboard',
        name: '森系情绪板',
        ratio: '3:4',
        width: XHS_POST_WIDTH,
        height: XHS_POST_HEIGHT,
        bgColor: '#142014',
        accentColor: '#F4F0E4',
        textColor: '#FFFDF6',
        secondaryTextColor: '#D6E2CD',
        panelColor: 'rgba(21, 34, 23, 0.76)',
        backgroundStyle: 'forest',
        stickerEffect: 'outline',
        headerStyle: 'center',
        captionStyle: 'plain',
        eyebrow: 'GOOD MOOD',
        footerText: 'remuse / share today',
        slots: [
            { x: 28, y: 28, width: 30, rotate: -8, zIndex: 3 },
            { x: 74, y: 26, width: 28, rotate: 9, zIndex: 3 },
            { x: 50, y: 58, width: 42, rotate: -3, zIndex: 4 },
            { x: 23, y: 80, width: 28, rotate: -10, zIndex: 2 },
            { x: 78, y: 79, width: 28, rotate: 7, zIndex: 2 },
        ],
        badges: [
            { text: 'GO', x: 54, y: 34, rotate: -6, kind: 'solid' },
            { text: 'weekend pick', x: 77, y: 17, rotate: 10, kind: 'outline' },
            { text: '#museum day', x: 19, y: 70, rotate: -8, kind: 'tag' },
        ],
    },
    {
        id: 'scrapbook-diary',
        name: '手账贴贴',
        ratio: '3:4',
        width: XHS_POST_WIDTH,
        height: XHS_POST_HEIGHT,
        bgColor: '#F8F1E7',
        accentColor: '#D9805D',
        textColor: '#49352C',
        secondaryTextColor: '#8B7164',
        panelColor: 'rgba(255, 248, 238, 0.92)',
        backgroundStyle: 'paper',
        stickerEffect: 'paper',
        headerStyle: 'note',
        captionStyle: 'card',
        eyebrow: 'museum memo',
        footerText: 'collect / paste / post',
        slots: [
            { x: 50, y: 42, width: 38, rotate: -2, zIndex: 4 },
            { x: 24, y: 26, width: 24, rotate: -10, zIndex: 3 },
            { x: 77, y: 29, width: 23, rotate: 8, zIndex: 3 },
            { x: 28, y: 72, width: 25, rotate: -8, zIndex: 2 },
            { x: 76, y: 73, width: 27, rotate: 6, zIndex: 2 },
        ],
        badges: [
            { text: 'daily pick', x: 21, y: 14, rotate: -6, kind: 'tag' },
            { text: '贴一页喜欢', x: 78, y: 16, rotate: 7, kind: 'outline' },
            { text: 'museum vibes', x: 75, y: 58, rotate: -8, kind: 'solid' },
        ],
    },
    {
        id: 'editorial-cover',
        name: '杂志封面',
        ratio: '3:4',
        width: XHS_POST_WIDTH,
        height: XHS_POST_HEIGHT,
        bgColor: '#FBF8F3',
        accentColor: '#FF5B39',
        textColor: '#171515',
        secondaryTextColor: '#6F6960',
        panelColor: 'rgba(255, 255, 255, 0.94)',
        backgroundStyle: 'editorial',
        stickerEffect: 'shadow',
        headerStyle: 'editorial',
        captionStyle: 'strip',
        eyebrow: 'NEW DROP',
        footerText: 'post-ready cover / 3:4',
        slots: [
            { x: 63, y: 31, width: 38, rotate: -3, zIndex: 4 },
            { x: 27, y: 46, width: 25, rotate: -10, zIndex: 3 },
            { x: 75, y: 62, width: 24, rotate: 8, zIndex: 3 },
            { x: 49, y: 79, width: 32, rotate: 2, zIndex: 2 },
        ],
        badges: [
            { text: '01', x: 15, y: 28, rotate: 0, kind: 'solid' },
            { text: 'today edit', x: 23, y: 66, rotate: -8, kind: 'outline' },
            { text: 'museum pick', x: 73, y: 15, rotate: 0, kind: 'tag' },
        ],
    },
    {
        id: 'candy-bubble',
        name: '糖心海报',
        ratio: '3:4',
        width: XHS_POST_WIDTH,
        height: XHS_POST_HEIGHT,
        bgColor: '#FFF2F5',
        accentColor: '#F04D97',
        textColor: '#56293B',
        secondaryTextColor: '#A2647D',
        panelColor: 'rgba(255, 249, 251, 0.9)',
        backgroundStyle: 'candy',
        stickerEffect: 'glow',
        headerStyle: 'bubble',
        captionStyle: 'card',
        eyebrow: 'SHARE THIS',
        footerText: 'soft light / cute post',
        slots: [
            { x: 49, y: 29, width: 30, rotate: -6, zIndex: 4 },
            { x: 24, y: 58, width: 27, rotate: -10, zIndex: 3 },
            { x: 76, y: 51, width: 25, rotate: 10, zIndex: 3 },
            { x: 53, y: 79, width: 32, rotate: -2, zIndex: 2 },
        ],
        badges: [
            { text: 'so cute', x: 22, y: 20, rotate: -8, kind: 'outline' },
            { text: 'today', x: 76, y: 17, rotate: 8, kind: 'tag' },
            { text: 'look at this', x: 76, y: 73, rotate: -6, kind: 'solid' },
        ],
    },
];

const PRINT_TEMPLATES: PrintTemplate[] = [
    {
        id: 'calendar-journal',
        name: '手账拼贴',
        description: '纸感便签、胶带和留白，适合做日常手账页。',
        bgColor: '#fffaf2',
        accentColor: '#111827',
        textColor: '#0f172a',
        secondaryTextColor: '#64748b',
        panelColor: 'rgba(255,255,255,0.94)',
        style: 'journal',
        headerTitle: 'Monthly Journal',
        headerSubtitle: 'calendar / stickers / print',
        footerText: 'print and keep your month in one page',
    },
    {
        id: 'stamp-market',
        name: '邮票边框',
        description: '边框更像邮票与印章页，适合收藏感排版。',
        bgColor: '#f7f4ec',
        accentColor: '#6f8d5d',
        textColor: '#263224',
        secondaryTextColor: '#74806c',
        panelColor: 'rgba(250,248,241,0.96)',
        style: 'stamp',
        headerTitle: 'REMUSE Stamp Market',
        headerSubtitle: 'tear / seal / archive / label',
        footerText: 'postmarked by your tiny memories',
    },
    {
        id: 'postcard-mail',
        name: '明信片页',
        description: '更像旅行明信片和留念卡片，适合故事感内容。',
        bgColor: '#fbf5ef',
        accentColor: '#d28962',
        textColor: '#4f3328',
        secondaryTextColor: '#9a7e6e',
        panelColor: 'rgba(255,250,245,0.94)',
        style: 'postcard',
        headerTitle: 'Museum Postcard Sheet',
        headerSubtitle: 'from remuse / to your desk',
        footerText: 'mail yourself a softer memory',
    },
    {
        id: 'collector-cards',
        name: '收藏卡片',
        description: '更规整的卡片式展示，适合打印裁切后单独收纳。',
        bgColor: '#f4f4f4',
        accentColor: '#3a4857',
        textColor: '#1f2730',
        secondaryTextColor: '#697380',
        panelColor: 'rgba(255,255,255,0.94)',
        style: 'card',
        headerTitle: 'Collector Card Sheet',
        headerSubtitle: 'archive / sort / keep / display',
        footerText: 'print-ready cards for your collection',
    },
];

const CALENDAR_WEEKDAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
const CALENDAR_MONTH_SHORT_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const CALENDAR_MONTH_FULL_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
const CALENDAR_BACKGROUND_SWATCHES = ['#fffdf7', '#f8f1e7', '#eef6ff', '#f7f0ff', '#eff7ea'] as const;

type CalendarDayCell = {
    key: string;
    dayNumber: number;
    inCurrentMonth: boolean;
    isWeekend: boolean;
};

const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('读取图片文件失败'));
        reader.readAsDataURL(file);
    });

const buildCalendarCells = (year: number, month: number): CalendarDayCell[] => {
    const firstDay = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const daysInPrevMonth = new Date(year, month - 1, 0).getDate();
    const firstWeekday = (firstDay.getDay() + 6) % 7;

    return Array.from({ length: 42 }, (_, index) => {
        const col = index % 7;
        const dayOffset = index - firstWeekday + 1;
        const inCurrentMonth = dayOffset > 0 && dayOffset <= daysInMonth;
        const dayNumber = inCurrentMonth
            ? dayOffset
            : dayOffset <= 0
                ? daysInPrevMonth + dayOffset
                : dayOffset - daysInMonth;

        return {
            key: `${year}-${month}-${index}`,
            dayNumber,
            inCurrentMonth,
            isWeekend: col >= 5,
        };
    });
};

const buildJournalTitle = (year: number, month: number, headerNote: string) => {
    const trimmedNote = headerNote.trim().split('\n')[0]?.trim() || '';
    return trimmedNote
        ? `${year}年${month}月 · ${trimmedNote.slice(0, 24)}`
        : `${year}年${month}月月历手账`;
};

const drawCoverImageToCanvas = (
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    width: number,
    height: number,
) => {
    const scale = Math.max(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const drawX = (width - drawWidth) / 2;
    const drawY = (height - drawHeight) / 2;
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
};

const getXhsSlots = (template: XhsTemplate, count: number) =>
    template.slots.slice(0, Math.max(1, Math.min(count, template.slots.length)));

const getPrintBaseWidth = (count: number) => {
    if (count <= 1) return 20;
    if (count === 2) return 17;
    if (count <= 4) return 14;
    if (count <= 6) return 12.5;
    return 11;
};

const getPrintPattern = (count: number) => {
    switch (count) {
        case 1:
            return [{ x: 50, y: 14, scale: 1 }];
        case 2:
            return [
                { x: 28, y: 15, scale: 0.94 },
                { x: 74, y: 18, scale: 0.94 },
            ];
        case 3:
            return [
                { x: 26, y: 14, scale: 0.88 },
                { x: 73, y: 17, scale: 0.88 },
                { x: 18, y: 43, scale: 0.98 },
            ];
        case 4:
            return [
                { x: 28, y: 14, scale: 0.88 },
                { x: 73, y: 16, scale: 0.84 },
                { x: 18, y: 44, scale: 0.94 },
                { x: 64, y: 74, scale: 0.9 },
            ];
        case 5:
            return [
                { x: 20, y: 12, scale: 0.82 },
                { x: 50, y: 10, scale: 0.86 },
                { x: 80, y: 14, scale: 0.8 },
                { x: 18, y: 43, scale: 0.88 },
                { x: 71, y: 72, scale: 0.84 },
            ];
        case 6:
            return [
                { x: 18, y: 12, scale: 0.8 },
                { x: 50, y: 10, scale: 0.84 },
                { x: 82, y: 14, scale: 0.78 },
                { x: 18, y: 42, scale: 0.82 },
                { x: 50, y: 64, scale: 0.9 },
                { x: 82, y: 72, scale: 0.78 },
            ];
        default:
            return [
                { x: 16, y: 12, scale: 0.74 },
                { x: 36, y: 10, scale: 0.76 },
                { x: 58, y: 10, scale: 0.76 },
                { x: 80, y: 13, scale: 0.72 },
                { x: 16, y: 40, scale: 0.74 },
                { x: 50, y: 54, scale: 0.82 },
                { x: 80, y: 40, scale: 0.74 },
                { x: 28, y: 78, scale: 0.78 },
                { x: 72, y: 78, scale: 0.78 },
            ];
    }
};

const buildPrintLayoutItems = (stickers: Sticker[], template: PrintTemplate): LayoutItem[] => {
    const pattern = getPrintPattern(stickers.length);
    const rotations = [-8, 5, -4, 7, -6, 4, -3, 6, -5];

    return stickers.map((sticker, index) => {
        const slot = pattern[index] ?? pattern[pattern.length - 1] ?? { x: 50, y: 50, scale: 1 };
        return {
            instanceId: `print-${template.id}-${sticker.id}-${index}`,
            sticker,
            x: slot.x,
            y: slot.y,
            rotation: rotations[index] ?? 0,
            scale: slot.scale,
            zIndex: index + 1,
        };
    });
};

const getPrintPageBackground = (template: PrintTemplate): React.CSSProperties => {
    switch (template.style) {
        case 'journal':
            return {
                backgroundImage: `
                    linear-gradient(180deg, rgba(255,255,255,0.72), rgba(255,255,255,0.22)),
                    repeating-linear-gradient(180deg, rgba(182,115,82,0.10) 0, rgba(182,115,82,0.10) 1px, transparent 1px, transparent 84px),
                    linear-gradient(180deg, #fbf4ea 0%, #f4e7d8 100%)
                `,
            };
        case 'stamp':
            return {
                backgroundImage: `
                    radial-gradient(circle at 18% 12%, rgba(111,141,93,0.14), transparent 16%),
                    radial-gradient(circle at 82% 18%, rgba(255,255,255,0.75), transparent 18%),
                    linear-gradient(180deg, #f8f4ea 0%, #f1ebdd 100%)
                `,
            };
        case 'postcard':
            return {
                backgroundImage: `
                    linear-gradient(180deg, rgba(255,255,255,0.72), rgba(255,255,255,0.34)),
                    linear-gradient(90deg, rgba(210,137,98,0.08) 0, rgba(210,137,98,0.08) 18%, transparent 18%, transparent 100%),
                    linear-gradient(180deg, #fff7f0 0%, #f6ede3 100%)
                `,
            };
        case 'card':
            return {
                backgroundImage: `
                    linear-gradient(180deg, rgba(255,255,255,0.82), rgba(255,255,255,0.42)),
                    repeating-linear-gradient(90deg, rgba(58,72,87,0.05) 0, rgba(58,72,87,0.05) 1px, transparent 1px, transparent 120px),
                    linear-gradient(180deg, #fafafa 0%, #f1f1f1 100%)
                `,
            };
    }
};

const getPrintStickerFrameStyle = (template: PrintTemplate, active: boolean): React.CSSProperties => ({
    background: 'transparent',
    border: 'none',
    borderRadius: '28px',
    padding: 0,
    filter: active
        ? `drop-shadow(0 0 0 2px ${template.accentColor}) drop-shadow(0 18px 34px rgba(15,23,42,0.28))`
        : 'drop-shadow(0 18px 34px rgba(15,23,42,0.22))',
    transform: active ? 'scale(1.02)' : 'scale(1)',
});

const clampValue = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const PRINT_SCALE_FLOOR = 0.12;
const PRINT_HANDLE_CONFIGS: Array<{ id: PrintResizeHandle; className: string }> = [
    { id: 'nw', className: '-left-2 -top-2 cursor-nwse-resize' },
    { id: 'ne', className: '-right-2 -top-2 cursor-nesw-resize' },
    { id: 'sw', className: '-bottom-2 -left-2 cursor-nesw-resize' },
    { id: 'se', className: '-bottom-2 -right-2 cursor-nwse-resize' },
];

const normalizeAngleDelta = (angle: number) => {
    let next = angle;
    while (next > 180) next -= 360;
    while (next < -180) next += 360;
    return next;
};

const clampPrintPosition = (x: number, y: number, _scale: number, _count: number) => {
    return {
        x: clampValue(x, 0, 100),
        y: clampValue(y, 0, 100),
    };
};

const syncPrintLayoutItems = (
    prev: LayoutItem[],
    stickers: Sticker[],
    template: PrintTemplate,
    overrides: Record<string, Partial<LayoutItem>> = {},
): LayoutItem[] => {
    const defaults = buildPrintLayoutItems(stickers, template);
    const prevByStickerId = new Map(prev.map((item) => [item.sticker.id, item]));
    let nextZ = Math.max(0, ...prev.map((item) => item.zIndex)) + 1;

    return defaults.map((defaultItem) => {
        const existing = prevByStickerId.get(defaultItem.sticker.id);
        const override = overrides[defaultItem.sticker.id];

        if (existing) {
            const clamped = clampPrintPosition(
                override?.x ?? existing.x,
                override?.y ?? existing.y,
                override?.scale ?? existing.scale,
                defaults.length,
            );

            return {
                ...existing,
                instanceId: defaultItem.instanceId,
                sticker: defaultItem.sticker,
                x: clamped.x,
                y: clamped.y,
                scale: override?.scale ?? existing.scale,
                rotation: override?.rotation ?? existing.rotation,
                zIndex: override?.zIndex ?? existing.zIndex,
            };
        }

        const clamped = clampPrintPosition(
            override?.x ?? defaultItem.x,
            override?.y ?? defaultItem.y,
            override?.scale ?? defaultItem.scale,
            defaults.length,
        );

        return {
            ...defaultItem,
            ...override,
            x: clamped.x,
            y: clamped.y,
            zIndex: override?.zIndex ?? nextZ++,
        };
    });
};

const getXhsPreviewBackground = (template: XhsTemplate): React.CSSProperties => {
    switch (template.backgroundStyle) {
        case 'forest':
            return {
                backgroundImage: `
                    radial-gradient(circle at 18% 20%, rgba(158, 196, 121, 0.20), transparent 18%),
                    radial-gradient(circle at 78% 15%, rgba(255, 255, 255, 0.12), transparent 20%),
                    radial-gradient(circle at 50% 76%, rgba(73, 115, 69, 0.28), transparent 26%),
                    linear-gradient(180deg, #22331e 0%, #121a12 100%)
                `,
            };
        case 'paper':
            return {
                backgroundImage: `
                    linear-gradient(180deg, rgba(255,255,255,0.72), rgba(255,255,255,0.28)),
                    repeating-linear-gradient(180deg, rgba(217,185,167,0.10) 0, rgba(217,185,167,0.10) 1px, transparent 1px, transparent 72px),
                    linear-gradient(180deg, #f9f1e7 0%, #f4e7d8 100%)
                `,
            };
        case 'editorial':
            return {
                backgroundImage: `
                    linear-gradient(110deg, rgba(255, 91, 57, 0.12) 0%, rgba(255, 91, 57, 0.12) 32%, transparent 32%, transparent 100%),
                    radial-gradient(circle at 88% 14%, rgba(255, 91, 57, 0.16), transparent 18%),
                    linear-gradient(180deg, #fdf9f4 0%, #f6f0e8 100%)
                `,
            };
        case 'candy':
            return {
                backgroundImage: `
                    radial-gradient(circle at 18% 20%, rgba(255,255,255,0.82), transparent 15%),
                    radial-gradient(circle at 78% 18%, rgba(255,210,228,0.85), transparent 18%),
                    radial-gradient(circle at 50% 72%, rgba(255,198,220,0.55), transparent 22%),
                    linear-gradient(180deg, #fff4f7 0%, #ffe6ef 100%)
                `,
            };
    }
};

const getXhsStickerFrameStyle = (template: XhsTemplate): React.CSSProperties => {
    switch (template.stickerEffect) {
        case 'outline':
            return { filter: 'drop-shadow(0 0 2px rgba(255,255,255,1)) drop-shadow(0 0 10px rgba(255,255,255,0.9)) drop-shadow(0 14px 24px rgba(0,0,0,0.24))' };
        case 'paper':
            return {
                backgroundColor: 'rgba(255, 252, 247, 0.95)',
                border: '1px solid rgba(199, 161, 141, 0.32)',
                borderRadius: '26px',
                padding: '4%',
                boxShadow: '0 14px 30px rgba(102, 78, 58, 0.12)',
            };
        case 'shadow':
            return { filter: 'drop-shadow(0 16px 28px rgba(15,15,15,0.18)) drop-shadow(0 2px 2px rgba(255,255,255,0.6))' };
        case 'glow':
            return { filter: 'drop-shadow(0 0 12px rgba(240,77,151,0.18)) drop-shadow(0 14px 26px rgba(136,70,96,0.20))' };
    }
};

const getXhsBadgeStyle = (template: XhsTemplate, badge: XhsBadge): React.CSSProperties => {
    const base: React.CSSProperties = {
        position: 'absolute',
        left: `${badge.x}%`,
        top: `${badge.y}%`,
        transform: `translate(-50%, -50%) rotate(${badge.rotate}deg)`,
        zIndex: 20,
        whiteSpace: 'nowrap',
        fontSize: badge.kind === 'tag' ? '10px' : '11px',
        letterSpacing: badge.kind === 'outline' ? '0.18em' : '0.08em',
    };

    if (badge.kind === 'solid') {
        return {
            ...base,
            padding: '8px 14px',
            borderRadius: '999px',
            background: template.accentColor,
            color: template.backgroundStyle === 'editorial' ? '#fffaf7' : '#201413',
            fontWeight: 800,
            boxShadow: '0 10px 18px rgba(0,0,0,0.16)',
        };
    }

    if (badge.kind === 'outline') {
        return {
            ...base,
            padding: '8px 12px',
            borderRadius: '999px',
            border: `2px solid ${template.accentColor}`,
            color: template.textColor,
            background: 'rgba(255,255,255,0.08)',
            fontStyle: 'italic',
            fontWeight: 700,
        };
    }

    return {
        ...base,
        padding: '6px 10px',
        borderRadius: '999px',
        background: template.panelColor,
        color: template.accentColor,
        fontWeight: 800,
        textTransform: 'uppercase',
        boxShadow: '0 8px 18px rgba(0,0,0,0.08)',
    };
};

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

const isIOSDevice = () =>
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isWeChatBrowser = () => /MicroMessenger/i.test(navigator.userAgent);

type SaveActionResult = {
    mode: 'share-sheet' | 'preview' | 'download';
    title: string;
    message: string;
    previewUrl?: string;
};

const triggerDownload = (href: string, filename: string) => {
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    link.rel = 'noopener';
    link.click();
};

const persistBlobToDevice = async (blob: Blob, filename: string): Promise<SaveActionResult | null> => {
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
                    text: isIOSDevice() ? '请在系统面板中选择“存储图像”。' : '请在系统面板中选择“保存到相册”。',
                });

                return {
                    mode: 'share-sheet',
                    title: 'Opened system save sheet',
                    message: isIOSDevice()
                        ? '请在系统菜单中选择“存储图像”，即可保存到照片。'
                        : '请在系统菜单中选择“保存到相册”，即可保存到你的相册。',
                };
            }
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                return null;
            }
            logger.warn('Share API save failed, fallback to preview/download:', error);
        }
    }

    const objectUrl = URL.createObjectURL(blob);

    if (mobile && (isIOSDevice() || isWeChatBrowser())) {
        return {
            mode: 'preview',
            title: 'Long press to save',
            message: isWeChatBrowser()
                ? 'This browser cannot write directly to the album. Long press the image preview and choose save.'
                : 'iPhone 浏览器通常需要长按图片。请长按预览图，并选择“存储到照片”。',
            previewUrl: objectUrl,
        };
    }

    triggerDownload(objectUrl, filename);
    setTimeout(() => URL.revokeObjectURL(objectUrl), mobile ? 4000 : 1000);

    return {
        mode: 'download',
        title: mobile ? 'Started saving image' : 'Image downloaded',
        message: mobile
            ? 'If it does not appear in your album, check the system Downloads folder once.'
            : 'The image has been saved to your browser downloads folder.',
    };
};

const persistCanvasToDevice = async (canvas: HTMLCanvasElement, filename: string): Promise<SaveActionResult | null> => {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
        throw new Error('\u5bfc\u51fa\u56fe\u50cf\u5931\u8d25');
    }
    return persistBlobToDevice(blob, filename);
};

const canvasToPngDataUrl = (canvas: HTMLCanvasElement) => canvas.toDataURL('image/png');

const persistImageUrlToDevice = async (imageUrl: string, filename: string): Promise<SaveActionResult | null> => {
    try {
        const response = await fetchImageAsset(imageUrl);
        const blob = await response.blob();
        return persistBlobToDevice(blob, filename);
    } catch (error) {
        logger.warn('Fetch image as blob failed, fallback to direct preview/download:', error);

        if (isMobileDevice()) {
            return {
                mode: 'preview',
                title: 'Long press to save',
                message: 'This image opened in preview mode. Long press it and choose save to album.',
                previewUrl: imageUrl,
            };
        }

        triggerDownload(imageUrl, filename);
        return {
            mode: 'download',
            title: 'Image downloaded',
            message: 'The image has been saved to your browser downloads folder.',
        };
    }
};

const StickerCard: React.FC<{ 
    sticker: Sticker; 
    onDelete: () => void; 
    onSaveSticker?: (sticker: Sticker) => Promise<void> | void;
    selectable?: boolean;
    selected?: boolean;
    onToggleSelect?: () => void;
}> = ({ sticker, onDelete, onSaveSticker, selectable, selected, onToggleSelect }) => {
    const [isDramaExpanded, setIsDramaExpanded] = useState(false);
    const dramaText = sticker.dramaText?.trim() || '这张贴纸暂时还没有内心戏。';
    const showDramaToggle = dramaText.length > 36;

    return (
        <div 
            onClick={selectable ? onToggleSelect : undefined}
            onKeyDown={selectable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleSelect?.(); } } : undefined}
            role={selectable ? 'checkbox' : undefined}
            aria-checked={selectable ? selected : undefined}
            aria-label={selectable ? `选择贴纸: ${sticker.dramaText?.slice(0, 20)}` : undefined}
            tabIndex={selectable ? 0 : undefined}
            data-testid="results-sticker-card"
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
                            await onSaveSticker?.(sticker);
                        }}
                        className="p-1.5 bg-neutral-800 text-white hover:text-remuse-accent rounded border border-neutral-700"
                        title="保存到相册"
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
                <p className={`font-mono text-[10px] md:text-xs font-bold text-white text-center leading-relaxed break-words ${isDramaExpanded ? '' : 'line-clamp-2'}`}>
                    "{dramaText}"
                </p>
                {showDramaToggle && !selectable && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsDramaExpanded((prev) => !prev);
                        }}
                        aria-expanded={isDramaExpanded}
                        className="mt-2 ml-auto block text-[10px] font-display text-remuse-accent transition-colors hover:text-white"
                    >
                        {isDramaExpanded ? '收起' : '展开全文'}
                    </button>
                )}
            </div>
        </div>
    );
};

const StickerLibrary: React.FC<StickerLibraryProps> = ({
    stickers = [],
    sourceItems = [],
    journals = [],
    guides = [],
    onDeleteSticker,
    onStickerCreated,
    onSaveJournal,
    onDeleteJournal,
    onOpenPerlerPattern,
    initialViewMode = 'LIBRARY',
    initialCanvasMode = 'COLLAGE',
    initialSelectionIds = [],
    initialLibraryTab = 'STICKERS',
    headerTitle = 'STICKER LIBRARY',
    headerDescription = '实体物品的数字分身与专属剧情。',
    showLayoutModeToggle = true,
    onOpenGuide,
    onExit,
}) => {
    const safeStickers = Array.isArray(stickers) ? stickers : [];
    const safeSourceItems = Array.isArray(sourceItems) ? sourceItems : [];
    const safeJournals = Array.isArray(journals) ? journals : [];
    const safeGuides = Array.isArray(guides) ? guides : [];
    // View Mode: 'LIBRARY' (Grid) or 'CANVAS' (Layout Editor)
    const [viewMode, setViewMode] = useState<LibraryViewMode>(initialViewMode);
    const [canvasMode, setCanvasMode] = useState<CanvasMode>(initialCanvasMode);
    
    // Filter & Selection
    const [filter, setFilter] = useState('ALL');
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(initialSelectionIds));

    // Canvas State
    const [layoutItems, setLayoutItems] = useState<LayoutItem[]>([]);
    const [isCustomMode, setIsCustomMode] = useState(false); // Enable dragging
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const canvasRef = useRef<HTMLDivElement>(null);

    // 小红书 State
    const [xhsTemplate, setXhsTemplate] = useState<XhsTemplate>(XHS_TEMPLATES[0]);
    const [xhsTitle, setXhsTitle] = useState('今日份收藏灵感');
    const xhsCanvasRef = useRef<HTMLDivElement>(null);
    const [xhsPlacements, setXhsPlacements] = useState<Record<string, XhsStickerPlacement>>({});
    const [activeXhsDragId, setActiveXhsDragId] = useState<string | null>(null);
    const [selectedXhsStickerId, setSelectedXhsStickerId] = useState<string | null>(null);

    // 手账打印 State
    const printCanvasRef = useRef<HTMLDivElement>(null);
    const printBackgroundInputRef = useRef<HTMLInputElement>(null);
    const [printScale, setPrintScale] = useState<number>(1.0);
    const [printTemplate, setPrintTemplate] = useState<PrintTemplate>(PRINT_TEMPLATES[0]);
    const [selectedPrintItemId, setSelectedPrintItemId] = useState<string | null>(null);
    const [printInteraction, setPrintInteraction] = useState<PrintInteractionState | null>(null);
    const [printYear, setPrintYear] = useState<number>(new Date().getFullYear());
    const [printMonth, setPrintMonth] = useState<number>(new Date().getMonth() + 1);
    const [printBackgroundColor, setPrintBackgroundColor] = useState<string>('#fffdf7');
    const [printBackgroundImage, setPrintBackgroundImage] = useState<string>('');
    const [printBackgroundOverlay, setPrintBackgroundOverlay] = useState<number>(0.74);
    const [printHeaderNote, setPrintHeaderNote] = useState<string>('');
    const [activeJournalId, setActiveJournalId] = useState<string | null>(null);
    const [journalSnapshotStickers, setJournalSnapshotStickers] = useState<Sticker[]>([]);

    // 表情包生成 State
    const [emojiPackItems, setEmojiPackItems] = useState<EmojiPackItem[]>([]);
    const [isGeneratingEmoji, setIsGeneratingEmoji] = useState(false);
    const [emojiGenProgress, setEmojiGenProgress] = useState('');
    const [emojiCount, setEmojiCount] = useState(6);
    const [emojiMoodText, setEmojiMoodText] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [emojiSheetUrl, setEmojiSheetUrl] = useState<string>('');
    const recognitionRef = useRef<any>(null);

    // 表情包库 / 贴纸库 切换
    const [libraryTab, setLibraryTab] = useState<LibraryTab>(initialLibraryTab);
    const [saveFeedback, setSaveFeedback] = useState<{ title: string; message: string } | null>(null);
    const [savePreview, setSavePreview] = useState<{ imageUrl: string; title: string; message: string } | null>(null);
    const saveFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 将贴纸按 category 分为普通贴纸和表情包
    const regularStickers = safeStickers.filter(s => ![EMOJI_PACK_CATEGORY, PERLER_PATTERN_CATEGORY].includes(s.category));
    const emojiPacks = safeStickers.filter(s => s.category === EMOJI_PACK_CATEGORY);
    const perlerPatterns = safeStickers.filter(s => s.category === PERLER_PATTERN_CATEGORY);

    const categories = ['ALL', ...Object.values(ItemCategory)];
    const filteredStickers = filter === 'ALL' 
        ? regularStickers 
        : regularStickers.filter(s => s.category === filter);
    const libraryStats = libraryTab === 'EMOJI_PACKS'
        ? { count: emojiPacks.length, label: 'EMOJI PACKS' }
        : libraryTab === 'PERLER_PATTERNS'
            ? { count: perlerPatterns.length, label: 'PERLER FILES' }
            : libraryTab === 'JOURNALS'
                ? { count: safeJournals.length, label: 'JOURNALS' }
            : libraryTab === 'TRANSFORMATION_GUIDES'
                ? { count: safeGuides.length, label: 'GUIDES' }
            : { count: regularStickers.length, label: 'STICKERS' };

    useEffect(() => {
        return () => {
            if (saveFeedbackTimerRef.current) {
                clearTimeout(saveFeedbackTimerRef.current);
            }
            if (savePreview?.imageUrl?.startsWith('blob:')) {
                URL.revokeObjectURL(savePreview.imageUrl);
            }
        };
    }, [savePreview]);

    const handleReturnFromCanvas = () => {
        if (initialViewMode === 'CANVAS' && onExit) {
            onExit();
            return;
        }

        setViewMode('LIBRARY');
    };

    const closeSavePreview = () => {
        if (savePreview?.imageUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(savePreview.imageUrl);
        }
        setSavePreview(null);
    };

    const handleOpenPerlerPatternCard = (pattern: Sticker) => {
        if (pattern.metadata?.perlerPatternSnapshot) {
            onOpenPerlerPattern?.(pattern);
            return;
        }

        if (!pattern.originalItemId) {
            showSaveFeedback('无法恢复拼豆工坊', '这张拼豆图纸缺少原始藏品记录，当前只能下载或删除。');
            return;
        }

        const sourceItem = safeSourceItems.find((item) => item.id === pattern.originalItemId);
        if (!sourceItem) {
            showSaveFeedback('无法恢复拼豆工坊', '没有找到这张拼豆图纸对应的原始藏品，当前只能下载或删除。');
            return;
        }

        onOpenPerlerPattern?.(pattern);
    };

    const showSaveFeedback = (title: string, message: string) => {
        if (saveFeedbackTimerRef.current) {
            clearTimeout(saveFeedbackTimerRef.current);
        }
        setSaveFeedback({ title, message });
        saveFeedbackTimerRef.current = setTimeout(() => {
            setSaveFeedback(null);
            saveFeedbackTimerRef.current = null;
        }, 3200);
    };

    const handleSaveResult = (result: SaveActionResult | null) => {
        if (!result) return;
        showSaveFeedback(result.title, result.message);
        if (result.mode === 'preview' && result.previewUrl) {
            setSavePreview({
                imageUrl: result.previewUrl,
                title: result.title,
                message: result.message,
            });
        }
    };

    const runSaveAction = async (action: () => Promise<SaveActionResult | null>) => {
        try {
            const result = await action();
            handleSaveResult(result);
        } catch (error) {
            logger.error('Save action failed:', error);
            showSaveFeedback('保存失败', '请稍后再试。');
        }
    };

    const handlePrintBackgroundUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';

        if (!file) {
            return;
        }

        if (!file.type.startsWith('image/')) {
            showSaveFeedback('请选择图片文件', '这里只支持上传手账纸、照片或其他图片背景。');
            return;
        }

        try {
            const dataUrl = await readFileAsDataUrl(file);
            setPrintBackgroundImage(dataUrl);
        } catch (error) {
            logger.error('Print background upload failed:', error);
            showSaveFeedback('背景上传失败', '这张图片暂时无法读取，请换一张再试。');
        }
    };

    const clearPrintBackground = () => {
        setPrintBackgroundImage('');
    };

    const handleStickerCardSave = async (sticker: Sticker) => {
        await runSaveAction(() => persistImageUrlToDevice(sticker.stickerImageUrl, `remuse-sticker-${sticker.id}.png`));
    };

    const renderSaveFeedback = () => (
        <>
            {saveFeedback && (
                <div className="fixed inset-x-4 bottom-24 z-[70] md:bottom-6 md:left-auto md:right-6 md:inset-x-auto md:w-96">
                    <div className="rounded-2xl border border-remuse-secondary/40 bg-neutral-950/95 px-4 py-3 shadow-2xl backdrop-blur-md">
                        <p className="text-sm font-display font-bold text-white">{saveFeedback.title}</p>
                        <p className="mt-1 text-xs leading-relaxed text-neutral-300">{saveFeedback.message}</p>
                    </div>
                </div>
            )}

            {savePreview && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-neutral-800 bg-neutral-950 shadow-2xl">
                        <div className="flex items-start justify-between gap-4 border-b border-neutral-800 p-4">
                            <div>
                                <p className="text-base font-display font-bold text-white">{savePreview.title}</p>
                                <p className="mt-1 text-xs leading-relaxed text-neutral-400">{savePreview.message}</p>
                            </div>
                            <button
                                onClick={closeSavePreview}
                                className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 text-neutral-300 transition-colors hover:border-white hover:text-white"
                                aria-label="Close image preview"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-4">
                            <div className="flex min-h-[18rem] items-center justify-center overflow-hidden rounded-[20px] bg-black">
                                <img
                                    src={savePreview.imageUrl}
                                    alt="Save preview"
                                    className="h-full max-h-[70dvh] w-full object-contain"
                                />
                            </div>
                            <p className="mt-3 text-center text-sm text-neutral-300">
                                Long press the image, then choose save to your album.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </>
    );

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
                showSaveFeedback('最多选择 9 张', '一次最多选择 9 张贴纸。');
                return;
            }
            newSet.add(id);
        }
        setSelectedIds(newSet);
    };

    const getXhsPlacementKey = (templateId: string, stickerId: string) => `${templateId}:${stickerId}`;

    const getDefaultXhsPlacement = (template: XhsTemplate, stickerId: string, index: number, count: number): XhsStickerPlacement => {
        const slots = getXhsSlots(template, count);
        const slot = slots[index] ?? slots[slots.length - 1] ?? template.slots[0];
        return {
            x: slot.x,
            y: slot.y,
            width: slot.width,
            rotate: slot.rotate,
            zIndex: slot.zIndex ?? index + 1,
        };
    };

    const getXhsPlacement = (template: XhsTemplate, stickerId: string, index: number, count: number): XhsStickerPlacement => {
        return xhsPlacements[getXhsPlacementKey(template.id, stickerId)] ?? getDefaultXhsPlacement(template, stickerId, index, count);
    };

    useEffect(() => {
        const selectedStickers = safeStickers.filter((sticker) => selectedIds.has(sticker.id)).slice(0, xhsTemplate.slots.length);
        if (selectedStickers.length === 0) {
            return;
        }

        setXhsPlacements((prev) => {
            let changed = false;
            const next = { ...prev };

            selectedStickers.forEach((sticker, index) => {
                const key = getXhsPlacementKey(xhsTemplate.id, sticker.id);
                if (!next[key]) {
                    next[key] = getDefaultXhsPlacement(xhsTemplate, sticker.id, index, selectedStickers.length);
                    changed = true;
                }
            });

            return changed ? next : prev;
        });
    }, [safeStickers, selectedIds, xhsTemplate]);

    useEffect(() => {
        const selectedStickers = safeStickers.filter((sticker) => selectedIds.has(sticker.id)).slice(0, xhsTemplate.slots.length);
        if (selectedStickers.length === 0) {
            setSelectedXhsStickerId(null);
            return;
        }

        setSelectedXhsStickerId((prev) =>
            prev && selectedStickers.some((sticker) => sticker.id === prev) ? prev : selectedStickers[0].id,
        );
    }, [safeStickers, selectedIds, xhsTemplate]);

    const handleXhsPointerDown = (stickerId: string) => {
        setSelectedXhsStickerId(stickerId);
        setActiveXhsDragId(stickerId);
        setXhsPlacements((prev) => {
            const key = getXhsPlacementKey(xhsTemplate.id, stickerId);
            const current = prev[key];
            if (!current) return prev;
            const maxZ = Math.max(
                1,
                ...Object.entries(prev)
                    .filter(([mapKey]) => mapKey.startsWith(`${xhsTemplate.id}:`))
                    .map(([, placement]) => placement.zIndex ?? 1),
            );
            return {
                ...prev,
                [key]: {
                    ...current,
                    zIndex: maxZ + 1,
                },
            };
        });
    };

    const handleXhsPointerMove = (clientX: number, clientY: number, stickersInPreview: Sticker[]) => {
        if (!activeXhsDragId || !xhsCanvasRef.current) return;

        const rect = xhsCanvasRef.current.getBoundingClientRect();
        const xPercent = ((clientX - rect.left) / rect.width) * 100;
        const yPercent = ((clientY - rect.top) / rect.height) * 100;
        const activeIndex = stickersInPreview.findIndex((sticker) => sticker.id === activeXhsDragId);
        const currentPlacement = getXhsPlacement(xhsTemplate, activeXhsDragId, Math.max(0, activeIndex), stickersInPreview.length);
        const xMargin = Math.max(10, currentPlacement.width / 2);
        const yMargin = Math.max(12, currentPlacement.width / 2);

        setXhsPlacements((prev) => ({
            ...prev,
            [getXhsPlacementKey(xhsTemplate.id, activeXhsDragId)]: {
                ...currentPlacement,
                x: Math.max(xMargin, Math.min(100 - xMargin, xPercent)),
                y: Math.max(yMargin, Math.min(100 - yMargin, yPercent)),
            },
        }));
    };

    const stopXhsPointerDrag = () => {
        setActiveXhsDragId(null);
    };

    const resetXhsPlacements = (stickersInPreview: Sticker[]) => {
        setXhsPlacements((prev) => {
            const next = { ...prev };
            stickersInPreview.forEach((sticker, index) => {
                next[getXhsPlacementKey(xhsTemplate.id, sticker.id)] = getDefaultXhsPlacement(xhsTemplate, sticker.id, index, stickersInPreview.length);
            });
            return next;
        });
        setActiveXhsDragId(null);
        setSelectedXhsStickerId(stickersInPreview[0]?.id ?? null);
    };

    const updateXhsPlacement = (stickerId: string, updater: (placement: XhsStickerPlacement) => XhsStickerPlacement) => {
        setXhsPlacements((prev) => {
            const stickerIndex = safeStickers.findIndex((sticker) => sticker.id === stickerId);
            const currentPlacement = getXhsPlacement(xhsTemplate, stickerId, Math.max(0, stickerIndex), safeStickers.length);
            return {
                ...prev,
                [getXhsPlacementKey(xhsTemplate.id, stickerId)]: updater(currentPlacement),
            };
        });
    };

    const getPrintWorkspaceStickers = () => {
        const liveStickerMap = new Map(safeStickers.map((sticker) => [sticker.id, sticker]));
        return Array.from(selectedIds)
            .map((stickerId) => liveStickerMap.get(stickerId) || journalSnapshotStickers.find((sticker) => sticker.id === stickerId) || null)
            .filter((sticker): sticker is Sticker => Boolean(sticker));
    };

    const restoreLayoutItemsFromJournal = (journal: SavedJournal) => {
        const liveStickerMap = new Map(safeStickers.map((sticker) => [sticker.id, sticker]));
        const restored = journal.layoutItems.map((item, index) => {
            const sticker = liveStickerMap.get(item.stickerId) || item.sticker;
            return {
                instanceId: `print-${journal.templateId}-${sticker.id}-${Date.now()}-${index}`,
                sticker,
                x: item.x,
                y: item.y,
                rotation: item.rotation,
                scale: item.scale,
                zIndex: item.zIndex,
            };
        });

        setActiveJournalId(journal.id);
        setJournalSnapshotStickers(journal.layoutItems.map((item) => item.sticker));
        setSelectedIds(new Set(journal.selectedStickerIds));
        setCanvasMode('PRINT');
        setViewMode('CANVAS');
        setPrintTemplate(PRINT_TEMPLATES.find((template) => template.id === journal.templateId) || PRINT_TEMPLATES[0]);
        setPrintYear(journal.year);
        setPrintMonth(journal.month);
        setPrintBackgroundColor(journal.backgroundColor || '#fffdf7');
        setPrintBackgroundImage(journal.backgroundImageUrl || '');
        setPrintBackgroundOverlay(journal.backgroundOverlay ?? 0.74);
        setPrintHeaderNote(journal.headerNote || '');
        setPrintScale(1);
        setPrintInteraction(null);
        setLayoutItems(restored);
        setSelectedPrintItemId(restored[0]?.instanceId ?? null);
    };

    useEffect(() => {
        if (viewMode !== 'CANVAS' || canvasMode !== 'PRINT') {
            return;
        }

        const printStickers = getPrintWorkspaceStickers();
        if (printStickers.length === 0) {
            setLayoutItems([]);
            setSelectedPrintItemId(null);
            return;
        }

        setLayoutItems((prev) => syncPrintLayoutItems(prev, printStickers, printTemplate));

        setSelectedPrintItemId((prev) => {
            if (prev) {
                const currentStickerId = printStickers.find((sticker) => prev.includes(sticker.id))?.id;

                if (currentStickerId) {
                    const nextIndex = printStickers.findIndex((sticker) => sticker.id === currentStickerId);
                    if (nextIndex >= 0) {
                        return `print-${printTemplate.id}-${currentStickerId}-${nextIndex}`;
                    }
                }
            }
            return `print-${printTemplate.id}-${printStickers[0].id}-0`;
        });
    }, [canvasMode, journalSnapshotStickers, printTemplate, safeStickers, selectedIds, viewMode]);

    const beginPrintInteraction = (
        clientX: number,
        clientY: number,
        item: LayoutItem,
        mode: PrintInteractionMode,
    ) => {
        if (!printCanvasRef.current) return;

        const rect = printCanvasRef.current.getBoundingClientRect();
        const centerX = rect.left + (item.x / 100) * rect.width;
        const centerY = rect.top + (item.y / 100) * rect.height;

        setSelectedPrintItemId(item.instanceId);
        setLayoutItems((prev) => {
            const maxZ = Math.max(1, ...prev.map((entry) => entry.zIndex));
            return prev.map((entry) => (entry.instanceId === item.instanceId ? { ...entry, zIndex: maxZ + 1 } : entry));
        });
        setPrintInteraction({
            instanceId: item.instanceId,
            mode,
            startClientX: clientX,
            startClientY: clientY,
            startX: item.x,
            startY: item.y,
            startScale: item.scale,
            startRotation: item.rotation,
            centerX,
            centerY,
            startDistance: Math.max(1, Math.hypot(clientX - centerX, clientY - centerY)),
            startAngle: Math.atan2(clientY - centerY, clientX - centerX),
        });
    };

    const handlePrintPointerDown = (clientX: number, clientY: number, instanceId: string) => {
        const item = layoutItems.find((entry) => entry.instanceId === instanceId);
        if (!item) return;
        beginPrintInteraction(clientX, clientY, item, 'drag');
    };

    const handlePrintResizePointerDown = (
        clientX: number,
        clientY: number,
        instanceId: string,
    ) => {
        const item = layoutItems.find((entry) => entry.instanceId === instanceId);
        if (!item) return;
        beginPrintInteraction(clientX, clientY, item, 'scale');
    };

    const handlePrintRotatePointerDown = (clientX: number, clientY: number, instanceId: string) => {
        const item = layoutItems.find((entry) => entry.instanceId === instanceId);
        if (!item) return;
        beginPrintInteraction(clientX, clientY, item, 'rotate');
    };

    const stopPrintInteraction = () => {
        setPrintInteraction(null);
    };

    const handlePrintCanvasPointerDown = (target: EventTarget | null) => {
        if (target instanceof Element && target.closest('[data-print-sticker-shell="true"]')) {
            return;
        }
        setSelectedPrintItemId(null);
        stopPrintInteraction();
    };

    useEffect(() => {
        if (viewMode !== 'CANVAS' || canvasMode !== 'PRINT' || !selectedPrintItemId) {
            return;
        }

        const handleGlobalPointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Element && target.closest('[data-print-sticker-shell="true"]')) {
                return;
            }
            setSelectedPrintItemId(null);
            stopPrintInteraction();
        };

        document.addEventListener('pointerdown', handleGlobalPointerDown, true);
        return () => {
            document.removeEventListener('pointerdown', handleGlobalPointerDown, true);
        };
    }, [canvasMode, selectedPrintItemId, viewMode]);

    const handleAddStickerToPrint = (stickerId: string, clientX?: number, clientY?: number) => {
        const sticker = regularStickers.find((entry) => entry.id === stickerId);
        if (!sticker || selectedIds.has(sticker.id)) {
            return;
        }

        const currentSelectedStickers = getPrintWorkspaceStickers();
        if (currentSelectedStickers.length >= 9) {
            showSaveFeedback('最多选择 9 张', '月历手账当前最多同时排版 9 张贴纸。');
            return;
        }

        const nextSelectedStickers = [...currentSelectedStickers, sticker];
        const nextIndex = nextSelectedStickers.findIndex((entry) => entry.id === sticker.id);
        const nextInstanceId = `print-${printTemplate.id}-${sticker.id}-${nextIndex}`;
        const maxZ = Math.max(0, ...layoutItems.map((item) => item.zIndex)) + 1;
        let overrides: Record<string, Partial<LayoutItem>> = {};

        if (typeof clientX === 'number' && typeof clientY === 'number' && printCanvasRef.current) {
            const rect = printCanvasRef.current.getBoundingClientRect();
            const defaultNewItem = buildPrintLayoutItems(nextSelectedStickers, printTemplate).find((item) => item.sticker.id === sticker.id);

            if (defaultNewItem) {
                const xPercent = ((clientX - rect.left) / rect.width) * 100;
                const yPercent = ((clientY - rect.top) / rect.height) * 100;
                const clamped = clampPrintPosition(xPercent, yPercent, defaultNewItem.scale, nextSelectedStickers.length);

                overrides = {
                    [sticker.id]: {
                        x: clamped.x,
                        y: clamped.y,
                        scale: defaultNewItem.scale,
                        rotation: defaultNewItem.rotation,
                        zIndex: maxZ,
                    },
                };
            }
        }

        setSelectedIds((prev) => {
            const next = new Set(prev);
            next.add(sticker.id);
            return next;
        });
        setLayoutItems((prev) => syncPrintLayoutItems(prev, nextSelectedStickers, printTemplate, overrides));
        setSelectedPrintItemId(nextInstanceId);
    };

    const handleRemoveStickerFromPrint = (stickerId: string) => {
        if (!selectedIds.has(stickerId)) {
            return;
        }

        const remainingStickers = getPrintWorkspaceStickers().filter((entry) => entry.id !== stickerId);
        const nextSelectedId = remainingStickers[0]?.id ?? null;

        setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(stickerId);
            return next;
        });
        setLayoutItems((prev) => syncPrintLayoutItems(prev.filter((item) => item.sticker.id !== stickerId), remainingStickers, printTemplate));
        setSelectedPrintItemId(
            nextSelectedId ? `print-${printTemplate.id}-${nextSelectedId}-${remainingStickers.findIndex((item) => item.id === nextSelectedId)}` : null,
        );
        stopPrintInteraction();
    };

    const handlePrintCanvasDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        const stickerId = event.dataTransfer.getData('text/remuse-sticker-id');
        if (!stickerId) {
            return;
        }
        handleAddStickerToPrint(stickerId, event.clientX, event.clientY);
    };

    const handlePrintPointerMove = (clientX: number, clientY: number) => {
        if (!printInteraction || !printCanvasRef.current) return;

        const rect = printCanvasRef.current.getBoundingClientRect();

        setLayoutItems((prev) =>
            prev.map((item) =>
                item.instanceId === printInteraction.instanceId
                    ? (() => {
                          if (printInteraction.mode === 'drag') {
                              const deltaX = ((clientX - printInteraction.startClientX) / rect.width) * 100;
                              const deltaY = ((clientY - printInteraction.startClientY) / rect.height) * 100;
                              const nextPosition = clampPrintPosition(
                                  printInteraction.startX + deltaX,
                                  printInteraction.startY + deltaY,
                                  item.scale,
                                  prev.length,
                              );

                              return {
                                  ...item,
                                  x: nextPosition.x,
                                  y: nextPosition.y,
                              };
                          }

                          if (printInteraction.mode === 'scale') {
                              const currentDistance = Math.max(
                                  1,
                                  Math.hypot(clientX - printInteraction.centerX, clientY - printInteraction.centerY),
                              );
                              const nextScale = Math.max(
                                  PRINT_SCALE_FLOOR,
                                  printInteraction.startScale * (currentDistance / printInteraction.startDistance),
                              );
                              const nextPosition = clampPrintPosition(item.x, item.y, nextScale, prev.length);

                              return {
                                  ...item,
                                  scale: nextScale,
                                  x: nextPosition.x,
                                  y: nextPosition.y,
                              };
                          }

                          const currentAngle = Math.atan2(
                              clientY - printInteraction.centerY,
                              clientX - printInteraction.centerX,
                          );
                          const deltaRotation = normalizeAngleDelta(
                              ((currentAngle - printInteraction.startAngle) * 180) / Math.PI,
                          );

                          return {
                              ...item,
                              rotation: printInteraction.startRotation + deltaRotation,
                          };
                      })()
                    : item,
            ),
        );
    };

    const resetPrintLayout = (stickersInPrint: Sticker[]) => {
        const nextLayout = buildPrintLayoutItems(stickersInPrint, printTemplate);
        setLayoutItems(nextLayout);
        setSelectedPrintItemId(nextLayout[0]?.instanceId ?? null);
        stopPrintInteraction();
    };

    const updatePrintLayoutItem = (instanceId: string, updater: (item: LayoutItem) => LayoutItem) => {
        setLayoutItems((prev) => prev.map((item) => (item.instanceId === instanceId ? updater(item) : item)));
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
        const selectedStickers = safeStickers.filter(s => selectedIds.has(s.id));
        if (mode === 'COLLAGE') {
            generateRandomLayout(selectedStickers);
        }
        if (mode === 'PRINT') {
            setActiveJournalId(null);
            setJournalSnapshotStickers([]);
        }
        if (mode === 'EMOJI_PACK') {
            // Reset emoji pack state
            setEmojiPackItems([]);
            setEmojiSheetUrl('');
            setEmojiMoodText('');
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
        
        await runSaveAction(() => persistCanvasToDevice(canvas, `remuse-layout-${Date.now()}.png`));
    };

    // --- 小红书配图导出 ---
    const handleExportXhs = async () => {
        const selectedStickers = safeStickers.filter(s => selectedIds.has(s.id));
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

        await runSaveAction(() => persistCanvasToDevice(canvas, `remuse-xhs-${t.id}-${Date.now()}.png`));
    };

    // --- 手账贴纸打印导出 ---
    const handleExportXhsCard = async () => {
        const selectedStickers = safeStickers.filter((sticker) => selectedIds.has(sticker.id));
        if (selectedStickers.length === 0) return;

        const template = xhsTemplate;
        const title = xhsTitle.trim() || '今日份收藏灵感';
        const caption =
            selectedStickers.map((sticker) => sticker.dramaText?.trim()).find(Boolean) ||
            '把今天的喜欢拼成一张可以直接发的小红书卡片。';
        const stickersToDraw = selectedStickers.slice(0, template.slots.length);
        const placements = stickersToDraw
            .map((sticker, index) => ({
                sticker,
                placement: getXhsPlacement(template, sticker.id, index, stickersToDraw.length),
            }))
            .sort((a, b) => (a.placement.zIndex ?? 0) - (b.placement.zIndex ?? 0));

        const canvas = document.createElement('canvas');
        canvas.width = template.width;
        canvas.height = template.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const loadImage = (src: string) =>
            new Promise<HTMLImageElement>((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = src;
            });

        const withAlpha = (hex: string, alphaHex: string) => (hex.startsWith('#') ? `${hex}${alphaHex}` : hex);

        const roundedRect = (x: number, y: number, width: number, height: number, radius: number) => {
            const r = Math.min(radius, width / 2, height / 2);
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + width, y, x + width, y + height, r);
            ctx.arcTo(x + width, y + height, x, y + height, r);
            ctx.arcTo(x, y + height, x, y, r);
            ctx.arcTo(x, y, x + width, y, r);
            ctx.closePath();
        };

        const fillRoundedRect = (
            x: number,
            y: number,
            width: number,
            height: number,
            radius: number,
            fill: string,
        ) => {
            roundedRect(x, y, width, height, radius);
            ctx.fillStyle = fill;
            ctx.fill();
        };

        const strokeRoundedRect = (
            x: number,
            y: number,
            width: number,
            height: number,
            radius: number,
            stroke: string,
            lineWidth = 2,
        ) => {
            roundedRect(x, y, width, height, radius);
            ctx.strokeStyle = stroke;
            ctx.lineWidth = lineWidth;
            ctx.stroke();
        };

        const wrapText = (text: string, maxWidth: number, maxLines: number) => {
            const chars = Array.from(text);
            const lines: string[] = [];
            let currentLine = '';
            let charIndex = 0;

            while (charIndex < chars.length) {
                const next = currentLine + chars[charIndex];
                if (ctx.measureText(next).width > maxWidth && currentLine) {
                    lines.push(currentLine);
                    currentLine = '';
                    if (lines.length === maxLines - 1) break;
                } else {
                    currentLine = next;
                    charIndex += 1;
                }
            }

            const tail = `${currentLine}${chars.slice(charIndex).join('')}`;
            if (lines.length === maxLines - 1) {
                lines.push(tail.length > 0 ? `${tail.slice(0, Math.max(1, tail.length - 1))}…` : tail);
                return lines;
            }

            if (tail) {
                lines.push(tail);
            }

            return lines.slice(0, maxLines);
        };

        const drawBackground = () => {
            ctx.fillStyle = template.bgColor;
            ctx.fillRect(0, 0, template.width, template.height);

            if (template.backgroundStyle === 'forest') {
                const gradient = ctx.createLinearGradient(0, 0, 0, template.height);
                gradient.addColorStop(0, '#23351e');
                gradient.addColorStop(1, '#111811');
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, template.width, template.height);

                for (let i = 0; i < 8; i += 1) {
                    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(160,203,125,0.07)';
                    roundedRect(60 + i * 118, 0, 54 + (i % 3) * 14, template.height, 28);
                    ctx.fill();
                }

                const glow = ctx.createRadialGradient(
                    template.width * 0.5,
                    template.height * 0.58,
                    60,
                    template.width * 0.5,
                    template.height * 0.58,
                    460,
                );
                glow.addColorStop(0, 'rgba(116,152,96,0.28)');
                glow.addColorStop(1, 'rgba(116,152,96,0)');
                ctx.fillStyle = glow;
                ctx.fillRect(0, 0, template.width, template.height);
            } else if (template.backgroundStyle === 'paper') {
                const gradient = ctx.createLinearGradient(0, 0, 0, template.height);
                gradient.addColorStop(0, '#faf3ea');
                gradient.addColorStop(1, '#f1e3d3');
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, template.width, template.height);

                ctx.strokeStyle = 'rgba(182,151,131,0.16)';
                ctx.lineWidth = 1;
                for (let y = 80; y < template.height; y += 88) {
                    ctx.beginPath();
                    ctx.moveTo(92, y);
                    ctx.lineTo(template.width - 92, y);
                    ctx.stroke();
                }
            } else if (template.backgroundStyle === 'editorial') {
                const gradient = ctx.createLinearGradient(0, 0, 0, template.height);
                gradient.addColorStop(0, '#fdf9f4');
                gradient.addColorStop(1, '#f5eee6');
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, template.width, template.height);
                ctx.fillStyle = withAlpha(template.accentColor, '24');
                ctx.fillRect(0, 0, template.width * 0.42, template.height * 0.24);
                ctx.fillStyle = withAlpha(template.accentColor, '16');
                ctx.fillRect(template.width * 0.68, template.height * 0.78, template.width * 0.24, template.height * 0.12);
            } else {
                const gradient = ctx.createLinearGradient(0, 0, 0, template.height);
                gradient.addColorStop(0, '#fff6f8');
                gradient.addColorStop(1, '#ffe7ef');
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, template.width, template.height);

                [
                    { x: 186, y: 182, radius: 108, fill: 'rgba(255,255,255,0.92)' },
                    { x: 902, y: 228, radius: 138, fill: 'rgba(255,211,228,0.84)' },
                    { x: 540, y: 1160, radius: 186, fill: 'rgba(255,196,217,0.42)' },
                ].forEach((bubble) => {
                    ctx.beginPath();
                    ctx.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2);
                    ctx.fillStyle = bubble.fill;
                    ctx.fill();
                });
            }

            ctx.save();
            ctx.setLineDash([10, 12]);
            strokeRoundedRect(54, 54, template.width - 108, template.height - 108, 38, withAlpha(template.accentColor, '66'), 3);
            ctx.restore();

            [
                [64, 64],
                [template.width - 64, 64],
                [64, template.height - 64],
                [template.width - 64, template.height - 64],
            ].forEach(([x, y]) => {
                ctx.beginPath();
                ctx.arc(x, y, 9, 0, Math.PI * 2);
                ctx.fillStyle = withAlpha(template.accentColor, 'cc');
                ctx.fill();
            });
        };

        const drawHeader = () => {
            if (template.headerStyle === 'center') {
                ctx.textAlign = 'center';
                ctx.fillStyle = template.secondaryTextColor;
                ctx.font = '700 26px "Noto Sans SC", sans-serif';
                ctx.fillText(template.eyebrow, template.width / 2, 118);
                ctx.fillStyle = template.textColor;
                ctx.font = '800 72px "Noto Sans SC", sans-serif';
                wrapText(title, 620, 2).forEach((line, index) => {
                    ctx.fillText(line, template.width / 2, 190 + index * 76);
                });
                fillRoundedRect(template.width / 2 - 78, 252, 156, 8, 8, template.accentColor);
                return;
            }

            if (template.headerStyle === 'note') {
                fillRoundedRect(110, 86, template.width - 220, 180, 44, template.panelColor);
                strokeRoundedRect(110, 86, template.width - 220, 180, 44, withAlpha(template.accentColor, '72'), 2);
                ctx.textAlign = 'left';
                ctx.fillStyle = template.accentColor;
                ctx.font = '800 24px "Noto Sans SC", sans-serif';
                ctx.fillText(template.eyebrow.toUpperCase(), 152, 140);
                ctx.fillStyle = template.textColor;
                ctx.font = '800 64px "Noto Sans SC", sans-serif';
                wrapText(title, 700, 2).forEach((line, index) => {
                    ctx.fillText(line, 152, 210 + index * 66);
                });
                return;
            }

            if (template.headerStyle === 'editorial') {
                ctx.fillStyle = template.accentColor;
                ctx.fillRect(96, 98, 120, 12);
                ctx.textAlign = 'left';
                ctx.fillStyle = template.secondaryTextColor;
                ctx.font = '700 22px "Noto Sans SC", sans-serif';
                ctx.fillText(template.eyebrow, 98, 82);
                ctx.fillStyle = withAlpha(template.textColor, '24');
                ctx.font = '900 148px "Noto Sans SC", sans-serif';
                ctx.fillText('01', 804, 184);
                ctx.fillStyle = template.textColor;
                ctx.font = '800 82px "Noto Sans SC", sans-serif';
                wrapText(title, 660, 2).forEach((line, index) => {
                    ctx.fillText(line, 98, 208 + index * 82);
                });
                return;
            }

            ctx.textAlign = 'center';
            ctx.fillStyle = template.secondaryTextColor;
            ctx.font = '700 24px "Noto Sans SC", sans-serif';
            ctx.fillText(template.eyebrow, template.width / 2, 108);
            fillRoundedRect(172, 124, template.width - 344, 126, 63, 'rgba(255,255,255,0.84)');
            strokeRoundedRect(172, 124, template.width - 344, 126, 63, withAlpha(template.accentColor, '66'), 2);
            ctx.fillStyle = template.textColor;
            ctx.font = '800 60px "Noto Sans SC", sans-serif';
            wrapText(title, 560, 2).forEach((line, index) => {
                ctx.fillText(line, template.width / 2, 198 + index * 56);
            });
        };

        const drawBadge = (badge: XhsBadge) => {
            ctx.save();
            ctx.translate((badge.x / 100) * template.width, (badge.y / 100) * template.height);
            ctx.rotate((badge.rotate * Math.PI) / 180);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const fontSize = badge.kind === 'tag' ? 24 : 28;
            ctx.font = `800 ${fontSize}px "Noto Sans SC", sans-serif`;
            const textWidth = ctx.measureText(badge.text).width;
            const badgeWidth = textWidth + (badge.kind === 'solid' ? 56 : 48);
            const badgeHeight = badge.kind === 'tag' ? 48 : 58;

            if (badge.kind === 'solid') {
                fillRoundedRect(-badgeWidth / 2, -badgeHeight / 2, badgeWidth, badgeHeight, 30, template.accentColor);
                ctx.fillStyle = template.backgroundStyle === 'editorial' ? '#fff8f5' : '#201413';
            } else if (badge.kind === 'outline') {
                fillRoundedRect(-badgeWidth / 2, -badgeHeight / 2, badgeWidth, badgeHeight, 30, 'rgba(255,255,255,0.08)');
                strokeRoundedRect(-badgeWidth / 2, -badgeHeight / 2, badgeWidth, badgeHeight, 30, template.accentColor, 3);
                ctx.fillStyle = template.textColor;
            } else {
                fillRoundedRect(-badgeWidth / 2, -badgeHeight / 2, badgeWidth, badgeHeight, 26, template.panelColor);
                ctx.fillStyle = template.accentColor;
            }

            ctx.fillText(badge.text, 0, 2);
            ctx.restore();
        };

        const drawSticker = async (sticker: Sticker, placement: XhsStickerPlacement) => {
            const image = await loadImage(sticker.stickerImageUrl);
            const centerX = (placement.x / 100) * template.width;
            const centerY = (placement.y / 100) * template.height;
            const maxWidth = (placement.width / 100) * template.width;
            const maxHeight = template.height * (placement.width > 35 ? 0.26 : 0.22);

            let drawWidth = maxWidth;
            let drawHeight = (image.height / image.width) * drawWidth;
            if (drawHeight > maxHeight) {
                const scale = maxHeight / drawHeight;
                drawWidth *= scale;
                drawHeight *= scale;
            }

            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate((placement.rotate * Math.PI) / 180);

            if (template.stickerEffect === 'paper') {
                ctx.shadowColor = 'rgba(90,64,46,0.16)';
                ctx.shadowBlur = 24;
                ctx.shadowOffsetY = 18;
                fillRoundedRect(-drawWidth / 2 - 28, -drawHeight / 2 - 28, drawWidth + 56, drawHeight + 56, 34, 'rgba(255,251,247,0.95)');
                strokeRoundedRect(-drawWidth / 2 - 28, -drawHeight / 2 - 28, drawWidth + 56, drawHeight + 56, 34, 'rgba(201,164,141,0.34)', 2);
                ctx.shadowColor = 'transparent';
            } else if (template.stickerEffect === 'outline') {
                ctx.shadowColor = 'rgba(255,255,255,0.96)';
                ctx.shadowBlur = 22;
                ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
                ctx.shadowColor = 'rgba(0,0,0,0.28)';
                ctx.shadowBlur = 26;
                ctx.shadowOffsetY = 16;
            } else if (template.stickerEffect === 'shadow') {
                ctx.shadowColor = 'rgba(19,17,14,0.24)';
                ctx.shadowBlur = 30;
                ctx.shadowOffsetY = 18;
            } else {
                ctx.shadowColor = 'rgba(240,77,151,0.24)';
                ctx.shadowBlur = 26;
                ctx.shadowOffsetY = 16;
            }

            ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
            ctx.restore();
        };

        const drawCaption = () => {
            const lines = wrapText(caption, 660, template.captionStyle === 'strip' ? 2 : 3);

            if (template.captionStyle === 'card') {
                fillRoundedRect(110, template.height - 328, template.width - 220, 176, 44, template.panelColor);
                strokeRoundedRect(110, template.height - 328, template.width - 220, 176, 44, withAlpha(template.accentColor, '56'), 2);
                ctx.textAlign = 'left';
                ctx.fillStyle = template.accentColor;
                ctx.font = '800 24px "Noto Sans SC", sans-serif';
                ctx.fillText(template.eyebrow, 152, template.height - 276);
                ctx.fillStyle = template.textColor;
                ctx.font = '600 30px "Noto Sans SC", sans-serif';
                lines.forEach((line, index) => {
                    ctx.fillText(line, 152, template.height - 224 + index * 38);
                });
                return;
            }

            if (template.captionStyle === 'strip') {
                fillRoundedRect(88, template.height - 252, template.width - 176, 120, 32, 'rgba(20,20,20,0.08)');
                ctx.fillStyle = template.accentColor;
                ctx.fillRect(124, template.height - 216, 96, 8);
                ctx.textAlign = 'left';
                ctx.fillStyle = template.textColor;
                ctx.font = '800 28px "Noto Sans SC", sans-serif';
                ctx.fillText(title, 124, template.height - 170);
                ctx.font = '600 24px "Noto Sans SC", sans-serif';
                lines.forEach((line, index) => {
                    ctx.fillText(line, 124, template.height - 134 + index * 30);
                });
                return;
            }

            ctx.textAlign = 'center';
            ctx.fillStyle = template.secondaryTextColor;
            ctx.font = '600 30px "Noto Sans SC", sans-serif';
            lines.forEach((line, index) => {
                ctx.fillText(line, template.width / 2, template.height - 244 + index * 40);
            });
        };

        drawBackground();
        drawHeader();
        template.badges.forEach(drawBadge);

        for (let index = 0; index < placements.length; index += 1) {
            try {
                await drawSticker(placements[index].sticker, placements[index].placement);
            } catch (error) {
                logger.error('XHS sticker draw failed:', error);
            }
        }

        drawCaption();

        ctx.fillStyle = template.accentColor;
        ctx.font = '800 24px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(template.footerText, 92, template.height - 64);
        ctx.textAlign = 'right';
        ctx.fillText('再生博物馆', template.width - 92, template.height - 64);

        await runSaveAction(() => persistCanvasToDevice(canvas, `remuse-xhs-${template.id}-${Date.now()}.png`));
    };

    const renderXhsStudio = (selectedStickers: Sticker[]) => {
        const template = xhsTemplate;
        const previewTitle = xhsTitle.trim() || '今日份收藏灵感';
        const previewCaption =
            selectedStickers.map((sticker) => sticker.dramaText?.trim()).find(Boolean) ||
            '把今天的喜欢拼成一张可以直接发的小红书卡片。';
        const previewStickers = selectedStickers.slice(0, template.slots.length);
        const previewStickerPlacements = previewStickers
            .map((sticker, index) => ({
                sticker,
                placement: getXhsPlacement(template, sticker.id, index, previewStickers.length),
            }))
            .sort((a, b) => (a.placement.zIndex ?? 0) - (b.placement.zIndex ?? 0));
        const previewFrameStyle = getXhsStickerFrameStyle(template);
        const selectedXhsSticker = previewStickerPlacements.find(({ sticker }) => sticker.id === selectedXhsStickerId) ?? previewStickerPlacements[0] ?? null;

        return (
            <div className="remuse-studio h-full bg-remuse-dark text-white flex flex-col">
                <div className="p-4 border-b border-neutral-800 bg-remuse-panel flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={handleReturnFromCanvas} className="text-neutral-500 hover:text-white">
                            <X size={24} />
                        </button>
                        <h2 className="text-xl font-bold font-display text-white flex items-center gap-2">
                            <BookImage size={20} className="text-pink-400" />
                            小红书配图
                        </h2>
                    </div>
                    <button
                        onClick={handleExportXhsCard}
                        className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-pink-500 to-orange-400 text-white rounded-full text-sm font-display font-bold hover:scale-105 transition-transform shadow-lg"
                    >
                        <Download size={16} /> 保存配图
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto flex flex-col xl:flex-row pb-[calc(env(safe-area-inset-bottom)+5rem)] xl:pb-0">
                    <div className="flex-1 flex items-center justify-center p-4 md:p-6 bg-[#0f0f10]">
                        <div
                            ref={xhsCanvasRef}
                            className="relative w-full max-w-[370px] md:max-w-[400px] aspect-[3/4] rounded-[34px] overflow-hidden border border-white/8 shadow-[0_30px_80px_rgba(0,0,0,0.45)] touch-none"
                            style={getXhsPreviewBackground(template)}
                            onMouseMove={(event) => handleXhsPointerMove(event.clientX, event.clientY, previewStickers)}
                            onMouseUp={stopXhsPointerDrag}
                            onMouseLeave={stopXhsPointerDrag}
                            onTouchMove={(event) => {
                                if (activeXhsDragId && event.touches.length === 1) {
                                    event.preventDefault();
                                    handleXhsPointerMove(event.touches[0].clientX, event.touches[0].clientY, previewStickers);
                                }
                            }}
                            onTouchEnd={stopXhsPointerDrag}
                            onTouchCancel={stopXhsPointerDrag}
                        >
                            <div
                                className="absolute inset-[4.5%] rounded-[28px] border-2 border-dashed pointer-events-none"
                                style={{ borderColor: `${template.accentColor}66` }}
                            />

                            {[
                                { top: '4.6%', left: '4.6%' },
                                { top: '4.6%', right: '4.6%' },
                                { bottom: '4.6%', left: '4.6%' },
                                { bottom: '4.6%', right: '4.6%' },
                            ].map((dot, index) => (
                                <div
                                    key={index}
                                    className="absolute h-3.5 w-3.5 rounded-full"
                                    style={{ ...dot, backgroundColor: template.accentColor }}
                                />
                            ))}

                            {template.backgroundStyle === 'editorial' && (
                                <>
                                    <div className="absolute left-0 top-0 h-[22%] w-[42%]" style={{ backgroundColor: `${template.accentColor}22` }} />
                                    <div className="absolute right-[8%] top-[8%] text-[76px] font-black tracking-tight opacity-10" style={{ color: template.textColor }}>
                                        01
                                    </div>
                                </>
                            )}

                            {template.backgroundStyle === 'candy' && (
                                <>
                                    <div className="absolute left-[8%] top-[12%] h-16 w-16 rounded-full bg-white/80 blur-sm" />
                                    <div className="absolute right-[10%] top-[14%] h-20 w-20 rounded-full blur-sm" style={{ backgroundColor: `${template.accentColor}33` }} />
                                </>
                            )}

                            <div className="absolute inset-x-0 top-[7%] px-[8%] z-20">
                                {template.headerStyle === 'center' && (
                                    <div className="text-center">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.45em]" style={{ color: template.secondaryTextColor }}>
                                            {template.eyebrow}
                                        </p>
                                        <h3 className="mt-3 text-[30px] leading-[1.1] font-black" style={{ color: template.textColor }}>
                                            {previewTitle}
                                        </h3>
                                        <div className="mx-auto mt-4 h-1.5 w-24 rounded-full" style={{ backgroundColor: template.accentColor }} />
                                    </div>
                                )}

                                {template.headerStyle === 'note' && (
                                    <div
                                        className="rounded-[24px] px-5 py-4 shadow-[0_14px_34px_rgba(81,58,42,0.12)]"
                                        style={{ backgroundColor: template.panelColor, border: `1px solid ${template.accentColor}66` }}
                                    >
                                        <p className="text-[11px] font-bold uppercase tracking-[0.35em]" style={{ color: template.accentColor }}>
                                            {template.eyebrow}
                                        </p>
                                        <h3 className="mt-2 text-[26px] leading-[1.15] font-black" style={{ color: template.textColor }}>
                                            {previewTitle}
                                        </h3>
                                    </div>
                                )}

                                {template.headerStyle === 'editorial' && (
                                    <div className="max-w-[72%]">
                                        <div className="h-1.5 w-24 rounded-full" style={{ backgroundColor: template.accentColor }} />
                                        <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.38em]" style={{ color: template.secondaryTextColor }}>
                                            {template.eyebrow}
                                        </p>
                                        <h3 className="mt-3 text-[32px] leading-[1.02] font-black tracking-tight" style={{ color: template.textColor }}>
                                            {previewTitle}
                                        </h3>
                                    </div>
                                )}

                                {template.headerStyle === 'bubble' && (
                                    <div className="text-center">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.35em]" style={{ color: template.secondaryTextColor }}>
                                            {template.eyebrow}
                                        </p>
                                        <div
                                            className="mx-auto mt-3 inline-flex max-w-[88%] items-center justify-center rounded-full px-6 py-4"
                                            style={{ backgroundColor: 'rgba(255,255,255,0.84)', border: `1px solid ${template.accentColor}66` }}
                                        >
                                            <h3 className="text-[24px] leading-[1.15] font-black" style={{ color: template.textColor }}>
                                                {previewTitle}
                                            </h3>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="absolute inset-0 z-10">
                                {previewStickerPlacements.map(({ sticker, placement }) => {
                                    return (
                                        <div
                                            key={sticker.id}
                                            className={`absolute select-none ${activeXhsDragId === sticker.id ? 'cursor-grabbing' : 'cursor-grab'}`}
                                            style={{
                                                left: `${placement.x}%`,
                                                top: `${placement.y}%`,
                                                width: `${placement.width}%`,
                                                transform: `translate(-50%, -50%) rotate(${placement.rotate}deg)`,
                                                zIndex: placement.zIndex ?? 4,
                                                touchAction: 'none',
                                            }}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                setSelectedXhsStickerId(sticker.id);
                                            }}
                                            onMouseDown={(event) => {
                                                event.preventDefault();
                                                handleXhsPointerDown(sticker.id);
                                                handleXhsPointerMove(event.clientX, event.clientY, previewStickers);
                                            }}
                                            onTouchStart={(event) => {
                                                if (event.touches.length === 1) {
                                                    event.preventDefault();
                                                    handleXhsPointerDown(sticker.id);
                                                    handleXhsPointerMove(event.touches[0].clientX, event.touches[0].clientY, previewStickers);
                                                }
                                            }}
                                        >
                                            <div
                                                className="flex items-center justify-center transition-all"
                                                style={{
                                                    ...previewFrameStyle,
                                                    boxShadow:
                                                        selectedXhsStickerId === sticker.id
                                                            ? `0 0 0 2px ${template.accentColor}, 0 18px 28px rgba(0,0,0,0.22)`
                                                            : previewFrameStyle.boxShadow,
                                                }}
                                            >
                                                <img
                                                    src={sticker.stickerImageUrl}
                                                    alt={sticker.dramaText || 'sticker'}
                                                    className="block w-full h-auto object-contain"
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {template.badges.map((badge) => (
                                <div key={`${template.id}-${badge.text}-${badge.x}-${badge.y}`} style={getXhsBadgeStyle(template, badge)}>
                                    {badge.text}
                                </div>
                            ))}

                            <div className="absolute inset-x-[8%] bottom-[10%] z-20">
                                {template.captionStyle === 'card' && (
                                    <div
                                        className="rounded-[24px] px-5 py-4 shadow-[0_16px_36px_rgba(0,0,0,0.12)]"
                                        style={{ backgroundColor: template.panelColor, border: `1px solid ${template.accentColor}55` }}
                                    >
                                        <p className="text-[11px] font-bold uppercase tracking-[0.35em]" style={{ color: template.accentColor }}>
                                            {template.eyebrow}
                                        </p>
                                        <p className="mt-3 text-[13px] leading-6" style={{ color: template.textColor }}>
                                            {previewCaption}
                                        </p>
                                    </div>
                                )}

                                {template.captionStyle === 'plain' && (
                                    <div className="text-center px-4">
                                        <p className="text-[13px] leading-6" style={{ color: template.secondaryTextColor }}>
                                            {previewCaption}
                                        </p>
                                    </div>
                                )}

                                {template.captionStyle === 'strip' && (
                                    <div className="rounded-[20px] px-5 py-4" style={{ backgroundColor: 'rgba(18,18,18,0.08)' }}>
                                        <div className="h-1.5 w-20 rounded-full" style={{ backgroundColor: template.accentColor }} />
                                        <p className="mt-3 text-[14px] font-black" style={{ color: template.textColor }}>
                                            {previewTitle}
                                        </p>
                                        <p className="mt-2 text-[12px] leading-5" style={{ color: template.secondaryTextColor }}>
                                            {previewCaption}
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="absolute inset-x-[8%] bottom-[4.8%] z-20 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.18em]">
                                <span style={{ color: template.accentColor }}>{template.footerText}</span>
                                <span style={{ color: template.accentColor }}>再生博物馆</span>
                            </div>
                        </div>
                    </div>

                    <div className="w-full xl:w-80 bg-remuse-panel border-t xl:border-t-0 xl:border-l border-neutral-800 p-4 md:p-5 space-y-5 xl:overflow-y-auto">
                        <div>
                            <label className="text-xs font-display text-neutral-400 uppercase tracking-wider mb-3 block">选择风格</label>
                            <p className="mb-3 text-[11px] leading-relaxed text-neutral-500">全部固定为 3:4，直接适配小红书发图比例。</p>
                            <div className="grid grid-cols-1 gap-3">
                                {XHS_TEMPLATES.map((tmpl) => (
                                    <button
                                        key={tmpl.id}
                                        onClick={() => setXhsTemplate(tmpl)}
                                        className={`rounded-2xl border p-3 text-left transition-all ${
                                            xhsTemplate.id === tmpl.id
                                                ? 'border-pink-400 bg-pink-400/10 shadow-[0_0_0_1px_rgba(244,114,182,0.2)]'
                                                : 'border-neutral-700 hover:border-neutral-500 hover:bg-white/[0.02]'
                                        }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div
                                                className="h-14 w-12 shrink-0 rounded-xl border"
                                                style={{
                                                    backgroundColor: tmpl.bgColor,
                                                    borderColor: `${tmpl.accentColor}88`,
                                                    ...getXhsPreviewBackground(tmpl),
                                                }}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-3">
                                                    <span className="font-display font-bold text-sm text-white">{tmpl.name}</span>
                                                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-neutral-400">3:4</span>
                                                </div>
                                                <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
                                                    {tmpl.eyebrow} · {tmpl.footerText}
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-neutral-800 bg-black/20 p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <label className="mb-2 block text-xs font-display uppercase tracking-wider text-neutral-400">贴纸位置</label>
                                    <p className="text-[11px] leading-relaxed text-neutral-500">
                                        直接拖动画布中的贴纸，自定义它们在卡片里的位置。保存配图时会按当前排布导出。
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => resetXhsPlacements(previewStickers)}
                                    disabled={previewStickers.length === 0}
                                    className="shrink-0 rounded-full border border-neutral-700 px-3 py-1.5 text-[11px] font-display text-neutral-300 transition-colors hover:border-remuse-accent hover:text-remuse-accent disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    重置位置
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-display text-neutral-400 uppercase tracking-wider mb-2 block">标题文案</label>
                            <input
                                type="text"
                                value={xhsTitle}
                                onChange={(e) => setXhsTitle(e.target.value)}
                                maxLength={20}
                                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-3 text-sm text-white focus:border-pink-400 focus:outline-none transition-colors"
                                placeholder="输入卡片标题..."
                            />
                        </div>
                    </div>

                    {renderSaveFeedback()}
                </div>
            </div>
        );
    };

    const renderEditableXhsStudio = (selectedStickers: Sticker[]) => {
        const template = xhsTemplate;
        const previewTitle = xhsTitle.trim() || '今日份收藏灵感';
        const previewCaption = selectedStickers.map((sticker) => sticker.dramaText?.trim()).find(Boolean) || '把今天想留下来的物件和情绪，整理成一张可以直接发出的小红书配图。';
        const previewStickers = selectedStickers.slice(0, template.slots.length);
        const previewStickerPlacements = previewStickers
            .map((sticker, index) => ({
                sticker,
                placement: getXhsPlacement(template, sticker.id, index, previewStickers.length),
            }))
            .sort((a, b) => (a.placement.zIndex ?? 0) - (b.placement.zIndex ?? 0));
        const selectedXhsSticker = previewStickerPlacements.find(({ sticker }) => sticker.id === selectedXhsStickerId) ?? previewStickerPlacements[0] ?? null;

        return (
            <div className="remuse-studio flex h-full flex-col bg-remuse-dark text-white">
                <div className="flex items-center justify-between border-b border-neutral-800 bg-remuse-panel p-4">
                    <div className="flex items-center gap-4">
                        <button onClick={handleReturnFromCanvas} className="text-neutral-500 transition-colors hover:text-white"><X size={24} /></button>
                        <h2 className="flex items-center gap-2 text-xl font-bold font-display text-white"><BookImage size={20} className="text-pink-400" />小红书配图</h2>
                    </div>
                    <button onClick={handleExportXhsCard} className="flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-orange-400 px-5 py-2 text-sm font-display font-bold text-white shadow-lg transition-transform hover:scale-105"><Download size={16} />保存配图</button>
                </div>
                <div className="flex flex-1 flex-col overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+5rem)] xl:flex-row xl:pb-0">
                    <div className="flex flex-1 items-center justify-center bg-[#0f0f10] p-4 md:p-6">
                        <div
                            ref={xhsCanvasRef}
                            className="relative aspect-[3/4] w-full max-w-[370px] overflow-hidden rounded-[34px] border border-white/8 shadow-[0_30px_80px_rgba(0,0,0,0.45)] touch-none md:max-w-[400px]"
                            style={getXhsPreviewBackground(template)}
                            onMouseMove={(event) => handleXhsPointerMove(event.clientX, event.clientY, previewStickers)}
                            onMouseUp={stopXhsPointerDrag}
                            onMouseLeave={stopXhsPointerDrag}
                            onTouchMove={(event) => {
                                if (activeXhsDragId && event.touches.length === 1) {
                                    event.preventDefault();
                                    handleXhsPointerMove(event.touches[0].clientX, event.touches[0].clientY, previewStickers);
                                }
                            }}
                            onTouchEnd={stopXhsPointerDrag}
                            onTouchCancel={stopXhsPointerDrag}
                        >
                            <div className="pointer-events-none absolute inset-[4.5%] rounded-[28px] border-2 border-dashed" style={{ borderColor: `${template.accentColor}55` }} />
                            <div className="absolute inset-x-0 top-[8%] z-20 px-[8%] text-center">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.42em]" style={{ color: template.secondaryTextColor }}>{template.eyebrow}</p>
                                <h3 className="mt-3 text-[30px] font-black leading-[1.08]" style={{ color: template.textColor }}>{previewTitle}</h3>
                                <div className="mx-auto mt-4 h-1.5 w-24 rounded-full" style={{ backgroundColor: template.accentColor }} />
                            </div>
                            {previewStickerPlacements.map(({ sticker, placement }) => (
                                <div
                                    key={sticker.id}
                                    className={`absolute z-10 select-none ${activeXhsDragId === sticker.id ? 'cursor-grabbing' : 'cursor-grab'}`}
                                    style={{ left: `${placement.x}%`, top: `${placement.y}%`, width: `${placement.width}%`, transform: `translate(-50%, -50%) rotate(${placement.rotate}deg)`, zIndex: placement.zIndex ?? 3, touchAction: 'none' }}
                                    onClick={(event) => { event.stopPropagation(); setSelectedXhsStickerId(sticker.id); }}
                                    onMouseDown={(event) => { event.preventDefault(); handleXhsPointerDown(sticker.id); handleXhsPointerMove(event.clientX, event.clientY, previewStickers); }}
                                    onTouchStart={(event) => { if (event.touches.length === 1) { event.preventDefault(); handleXhsPointerDown(sticker.id); handleXhsPointerMove(event.touches[0].clientX, event.touches[0].clientY, previewStickers); } }}
                                >
                                    <div className="flex items-center justify-center transition-all" style={{ ...getXhsStickerFrameStyle(template), boxShadow: selectedXhsStickerId === sticker.id ? `0 0 0 2px ${template.accentColor}, 0 18px 28px rgba(0,0,0,0.22)` : getXhsStickerFrameStyle(template).boxShadow }}>
                                        <img src={sticker.stickerImageUrl} alt={sticker.dramaText || 'sticker'} className="block h-auto w-full object-contain" />
                                    </div>
                                </div>
                            ))}
                            <div className="absolute inset-x-[8%] bottom-[10%] z-20 rounded-[24px] px-5 py-4 shadow-[0_16px_36px_rgba(0,0,0,0.12)]" style={{ backgroundColor: template.panelColor, border: `1px solid ${template.accentColor}55` }}>
                                <p className="text-[11px] font-bold uppercase tracking-[0.35em]" style={{ color: template.accentColor }}>{template.eyebrow}</p>
                                <p className="mt-3 text-[13px] leading-6" style={{ color: template.textColor }}>{previewCaption}</p>
                            </div>
                            <div className="absolute inset-x-[8%] bottom-[4.8%] z-20 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.18em]">
                                <span style={{ color: template.accentColor }}>{template.footerText}</span>
                                <span style={{ color: template.accentColor }}>再生博物馆</span>
                            </div>
                        </div>
                    </div>
                    <div className="w-full space-y-5 border-t border-neutral-800 bg-remuse-panel p-4 xl:w-80 xl:overflow-y-auto xl:border-l xl:border-t-0 md:p-5">
                        <div className="grid grid-cols-1 gap-3">
                            {XHS_TEMPLATES.map((tmpl) => (
                                <button key={tmpl.id} onClick={() => setXhsTemplate(tmpl)} className={`rounded-2xl border p-3 text-left transition-all ${xhsTemplate.id === tmpl.id ? 'border-pink-400 bg-pink-400/10 shadow-[0_0_0_1px_rgba(244,114,182,0.2)]' : 'border-neutral-700 hover:border-neutral-500 hover:bg-white/[0.02]'}`}>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-sm font-display font-bold text-white">{tmpl.name}</span>
                                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-neutral-400">3:4</span>
                                    </div>
                                    <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">{tmpl.eyebrow} · {tmpl.footerText}</p>
                                </button>
                            ))}
                        </div>
                        <div className="rounded-2xl border border-neutral-800 bg-black/20 p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div><label className="mb-2 block text-xs font-display uppercase tracking-wider text-neutral-400">贴纸编辑</label><p className="text-[11px] leading-relaxed text-neutral-500">先点选一张贴纸，再拖动位置或在这里调整大小。</p></div>
                                <button type="button" onClick={() => resetXhsPlacements(previewStickers)} disabled={previewStickers.length === 0} className="shrink-0 rounded-full border border-neutral-700 px-3 py-1.5 text-[11px] font-display text-neutral-300 transition-colors hover:border-remuse-accent hover:text-remuse-accent disabled:cursor-not-allowed disabled:opacity-40">重置布局</button>
                            </div>
                            {selectedXhsSticker ? (
                                <div className="mt-4 space-y-4 rounded-2xl border border-white/10 bg-neutral-950/70 p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-14 w-14 overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-2"><img src={selectedXhsSticker.sticker.stickerImageUrl} alt={selectedXhsSticker.sticker.dramaText || 'selected sticker'} className="h-full w-full object-contain" /></div>
                                        <div className="min-w-0"><p className="text-xs font-display uppercase tracking-[0.2em] text-neutral-500">selected sticker</p><p className="mt-1 line-clamp-2 text-sm font-display font-bold text-white">{selectedXhsSticker.sticker.dramaText || selectedXhsSticker.sticker.category}</p></div>
                                    </div>
                                    <div>
                                        <div className="mb-2 flex items-center justify-between"><label className="text-xs font-display uppercase tracking-wider text-neutral-400">贴纸大小</label><span className="text-[11px] font-mono text-neutral-500">{Math.round(selectedXhsSticker.placement.width)}%</span></div>
                                        <input type="range" min="16" max="54" step="1" value={selectedXhsSticker.placement.width} onChange={(event) => updateXhsPlacement(selectedXhsSticker.sticker.id, (placement) => ({ ...placement, width: clampValue(Number(event.target.value), 16, 54) }))} className="w-full accent-remuse-accent" />
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-4 rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/50 px-4 py-5 text-sm text-neutral-500">先在预览区点击一张贴纸，再调节大小。</div>
                            )}
                        </div>
                        <div>
                            <label className="mb-2 block text-xs font-display uppercase tracking-wider text-neutral-400">标题文案</label>
                            <input type="text" value={xhsTitle} onChange={(e) => setXhsTitle(e.target.value)} maxLength={20} className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-3 text-sm text-white transition-colors focus:border-pink-400 focus:outline-none" placeholder="输入一个适合发帖的标题..." />
                        </div>
                    </div>
                    {renderSaveFeedback()}
                </div>
            </div>
        );
    };

    const renderCalendarPrintCanvas = async () => {
        const printStickers = getPrintWorkspaceStickers();
        if (printStickers.length === 0) return null;

        const exportItems =
            layoutItems.length > 0 ? [...layoutItems] : buildPrintLayoutItems(printStickers, printTemplate);
        const calendarCells = buildCalendarCells(printYear, printMonth);
        const A4_W = 2480;
        const A4_H = 3508;
        const outerMargin = 110;
        const headerTop = 150;
        const weekdayY = 470;
        const weekdayHeight = 92;
        const gridTop = weekdayY + weekdayHeight + 26;
        const gridBottom = A4_H - 180;
        const gridGap = 16;
        const gridWidth = A4_W - outerMargin * 2;
        const gridHeight = gridBottom - gridTop;
        const cellWidth = (gridWidth - gridGap * 6) / 7;
        const cellHeight = (gridHeight - gridGap * 5) / 6;
        const baseWidth = (A4_W * getPrintBaseWidth(exportItems.length)) / 100;

        const canvas = document.createElement('canvas');
        canvas.width = A4_W;
        canvas.height = A4_H;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const loadImage = (src: string) =>
            new Promise<HTMLImageElement>((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = src;
            });

        const drawRoundRect = (x: number, y: number, width: number, height: number, radius: number) => {
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
        };

        ctx.fillStyle = printBackgroundColor;
        ctx.fillRect(0, 0, A4_W, A4_H);

        if (printBackgroundImage) {
            try {
                const backgroundImage = await loadImage(printBackgroundImage);
                drawCoverImageToCanvas(ctx, backgroundImage, A4_W, A4_H);
                ctx.fillStyle = `rgba(255,255,255,${printBackgroundOverlay})`;
                ctx.fillRect(0, 0, A4_W, A4_H);
            } catch (error) {
                logger.error('Calendar background draw failed:', error);
            }
        }

        ctx.strokeStyle = 'rgba(15,23,42,0.18)';
        ctx.lineWidth = 6;
        drawRoundRect(outerMargin * 0.7, outerMargin * 0.7, A4_W - outerMargin * 1.4, A4_H - outerMargin * 1.4, 58);
        ctx.stroke();

        ctx.fillStyle = printTemplate.textColor;
        ctx.textAlign = 'left';
        ctx.font = '900 72px "Noto Sans SC", sans-serif';
        ctx.fillText(`${printYear}`, 150, headerTop);
        ctx.font = '900 150px "Noto Sans SC", sans-serif';
        ctx.fillText(`${printMonth}`, 180, headerTop + 165);
        ctx.font = '600 52px "Noto Sans SC", sans-serif';
        ctx.fillText(CALENDAR_MONTH_SHORT_LABELS[printMonth - 1], 390, headerTop + 150);

        ctx.textAlign = 'center';
        ctx.font = '900 108px "Noto Sans SC", sans-serif';
        ctx.fillText(CALENDAR_MONTH_FULL_LABELS[printMonth - 1], A4_W / 2, 320);

        if (printHeaderNote.trim()) {
            ctx.textAlign = 'right';
            ctx.fillStyle = printTemplate.textColor;
            ctx.font = '500 40px "Noto Sans SC", sans-serif';
            const noteLines = printHeaderNote.trim().split('\n').slice(0, 4);
            noteLines.forEach((line, index) => {
                ctx.fillText(line, A4_W - 170, 160 + index * 54);
            });
        }

        CALENDAR_WEEKDAY_LABELS.forEach((weekday, index) => {
            const x = outerMargin + index * (cellWidth + gridGap);
            const weekend = index >= 5;

            ctx.fillStyle = weekend ? '#111827' : 'rgba(255,255,255,0.9)';
            ctx.strokeStyle = weekend ? '#111827' : 'rgba(15,23,42,0.14)';
            ctx.lineWidth = 3;
            drawRoundRect(x, weekdayY, cellWidth, weekdayHeight, 18);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = weekend ? '#ffffff' : printTemplate.textColor;
            ctx.textAlign = 'center';
            ctx.font = '900 36px "Noto Sans SC", sans-serif';
            ctx.fillText(weekday, x + cellWidth / 2, weekdayY + 58);
        });

        calendarCells.forEach((cell, index) => {
            const column = index % 7;
            const row = Math.floor(index / 7);
            const x = outerMargin + column * (cellWidth + gridGap);
            const y = gridTop + row * (cellHeight + gridGap);

            ctx.fillStyle = cell.inCurrentMonth ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.46)';
            ctx.strokeStyle = cell.inCurrentMonth ? 'rgba(15,23,42,0.14)' : 'rgba(100,116,139,0.16)';
            ctx.lineWidth = 3;
            drawRoundRect(x, y, cellWidth, cellHeight, 26);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = cell.inCurrentMonth ? printTemplate.textColor : printTemplate.secondaryTextColor;
            ctx.textAlign = 'left';
            ctx.font = '700 34px "Noto Sans SC", sans-serif';
            ctx.fillText(String(cell.dayNumber), x + 26, y + 46);

            ctx.fillStyle = 'rgba(148,163,184,0.28)';
            ctx.fillRect(x + 24, y + cellHeight - 42, cellWidth - 48, 2);
        });

        for (const item of [...exportItems].sort((a, b) => a.zIndex - b.zIndex)) {
            try {
                const image = await loadImage(item.sticker.stickerImageUrl);
                const drawWidth = baseWidth * item.scale;
                const drawHeight = drawWidth * (image.height / image.width);
                const centerX = (item.x / 100) * A4_W;
                const centerY = (item.y / 100) * A4_H;

                ctx.save();
                ctx.translate(centerX, centerY);
                ctx.rotate((item.rotation * Math.PI) / 180);
                ctx.shadowColor = 'rgba(15,23,42,0.18)';
                ctx.shadowBlur = 28;
                ctx.shadowOffsetY = 16;
                ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
                ctx.restore();
            } catch (error) {
                logger.error('Calendar sticker draw failed:', error);
            }
        }

        ctx.textAlign = 'center';
        ctx.fillStyle = printTemplate.secondaryTextColor;
        ctx.font = '500 26px "Noto Sans SC", sans-serif';
        ctx.fillText('remuse monthly journal', A4_W / 2, A4_H - 92);
        return canvas;
    };

    const exportCalendarPrint = async () => {
        const canvas = await renderCalendarPrintCanvas();
        if (!canvas) return;
        await runSaveAction(() => persistCanvasToDevice(canvas, `remuse-calendar-journal-${Date.now()}.png`));
    };

    const handleSaveJournalToLibrary = async () => {
        if (!onSaveJournal) {
            showSaveFeedback('暂不可保存', '当前页面还没有接入手账库保存能力。');
            return;
        }

        const canvas = await renderCalendarPrintCanvas();
        if (!canvas) {
            showSaveFeedback('还没有内容', '先放入贴纸并完成排版，再存入手账库。');
            return;
        }

        const stickerIds = layoutItems.map((item) => item.sticker.id);
        const payload: SaveJournalInput = {
            id: activeJournalId || undefined,
            title: buildJournalTitle(printYear, printMonth, printHeaderNote),
            previewImageBase64: canvasToPngDataUrl(canvas),
            backgroundImageBase64: printBackgroundImage.startsWith('data:') ? printBackgroundImage : undefined,
            backgroundImageUrl: printBackgroundImage && !printBackgroundImage.startsWith('data:') ? printBackgroundImage : '',
            templateId: printTemplate.id,
            year: printYear,
            month: printMonth,
            headerNote: printHeaderNote,
            backgroundColor: printBackgroundColor,
            backgroundOverlay: printBackgroundOverlay,
            selectedStickerIds: stickerIds,
            layoutItems: layoutItems.map((item) => ({
                stickerId: item.sticker.id,
                sticker: {
                    ...item.sticker,
                    originalItemId: item.sticker.originalItemId || '',
                    dramaText: item.sticker.dramaText || '',
                    category: item.sticker.category || '其他',
                    dateCreated: item.sticker.dateCreated || '',
                },
                x: item.x,
                y: item.y,
                rotation: item.rotation,
                scale: item.scale,
                zIndex: item.zIndex,
            })),
            dateCreated: activeJournalId
                ? safeJournals.find((journal) => journal.id === activeJournalId)?.dateCreated || new Date().toISOString()
                : new Date().toISOString(),
        };

        try {
            const saved = await onSaveJournal(payload);
            if (saved) {
                setActiveJournalId(saved.id);
                setJournalSnapshotStickers(saved.layoutItems.map((item) => item.sticker));
                setSelectedIds(new Set(saved.selectedStickerIds));
            }
            showSaveFeedback('已存入手账库', '这份月历手账已经保存到再生成果库，可随时继续编辑。');
        } catch (error) {
            logger.error('Save journal to library failed:', error);
            showSaveFeedback('保存失败', '存入手账库失败，请稍后重试。');
        }
    };

    const handleExportPrintStyled = async () => {
        const selectedStickers = safeStickers.filter((sticker) => selectedIds.has(sticker.id));
        if (selectedStickers.length === 0) return;

        const exportItems =
            layoutItems.length === selectedStickers.length ? [...layoutItems] : buildPrintLayoutItems(selectedStickers, printTemplate);
        const A4_W = 2480;
        const A4_H = 3508;
        const canvas = document.createElement('canvas');
        canvas.width = A4_W;
        canvas.height = A4_H;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const loadImage = (src: string) =>
            new Promise<HTMLImageElement>((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = src;
            });

        const drawRoundRect = (x: number, y: number, width: number, height: number, radius: number) => {
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
        };

        ctx.fillStyle = printTemplate.bgColor;
        ctx.fillRect(0, 0, A4_W, A4_H);
        ctx.textAlign = 'center';
        ctx.fillStyle = printTemplate.textColor;
        ctx.font = '700 68px "Noto Sans SC", sans-serif';
        ctx.fillText(printTemplate.headerTitle, A4_W / 2, 180);
        ctx.fillStyle = printTemplate.secondaryTextColor;
        ctx.font = '500 28px "Noto Sans SC", sans-serif';
        ctx.fillText(printTemplate.headerSubtitle, A4_W / 2, 235);

        const pageX = 190;
        const pageY = 320;
        const pageW = A4_W - 380;
        const pageH = A4_H - 610;

        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        drawRoundRect(pageX, pageY, pageW, pageH, 48);
        ctx.fill();
        ctx.strokeStyle = `${printTemplate.accentColor}55`;
        ctx.lineWidth = 4;
        drawRoundRect(pageX, pageY, pageW, pageH, 48);
        ctx.stroke();

        const baseWidth = (pageW * getPrintBaseWidth(exportItems.length)) / 100;
        for (const item of [...exportItems].sort((a, b) => a.zIndex - b.zIndex)) {
            try {
                const image = await loadImage(item.sticker.stickerImageUrl);
                const drawW = baseWidth * item.scale;
                const drawH = drawW * (image.height / image.width);
                const centerX = pageX + (item.x / 100) * pageW;
                const centerY = pageY + (item.y / 100) * pageH;
                const frameW = drawW * 1.16;
                const frameH = drawH * 1.16;

                ctx.save();
                ctx.translate(centerX, centerY);
                ctx.rotate((item.rotation * Math.PI) / 180);
                ctx.fillStyle = 'rgba(255,255,255,0.96)';
                ctx.strokeStyle = `${printTemplate.accentColor}66`;
                ctx.lineWidth = 4;
                if (printTemplate.style === 'stamp') {
                    ctx.setLineDash([18, 12]);
                } else {
                    ctx.setLineDash([]);
                }
                drawRoundRect(-frameW / 2, -frameH / 2, frameW, frameH, printTemplate.style === 'postcard' ? 26 : 34);
                ctx.fill();
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);
                ctx.restore();
            } catch (error) {
                logger.error('Print sticker draw failed:', error);
            }
        }

        ctx.fillStyle = printTemplate.secondaryTextColor;
        ctx.font = '500 24px "Noto Sans SC", sans-serif';
        ctx.fillText(printTemplate.footerText, A4_W / 2, A4_H - 90);
        await runSaveAction(() => persistCanvasToDevice(canvas, `remuse-print-${printTemplate.id}-${Date.now()}.png`));
    };

    const renderCalendarPrintStudio = (selectedStickers: Sticker[]) => {
        const selectedPrintItem = layoutItems.find((item) => item.instanceId === selectedPrintItemId) ?? layoutItems[0] ?? null;
        const previewBaseWidth = getPrintBaseWidth(layoutItems.length || selectedStickers.length || 1);
        const calendarCells = buildCalendarCells(printYear, printMonth);
        const yearOptions = Array.from({ length: 8 }, (_, index) => new Date().getFullYear() - 1 + index);
        const availablePrintStickers = regularStickers.filter((sticker) => !selectedIds.has(sticker.id));

        return (
            <div className="remuse-studio flex h-full flex-col bg-remuse-dark text-white">
                <div className="flex items-center justify-between border-b border-neutral-800 bg-remuse-panel p-4">
                    <div className="flex items-center gap-4">
                        <button onClick={handleReturnFromCanvas} className="text-neutral-500 transition-colors hover:text-white">
                            <X size={24} />
                        </button>
                        <div>
                            <h2 className="flex items-center gap-2 text-xl font-bold font-display text-white">
                                <Scissors size={20} className="text-remuse-secondary" />
                                月历手账
                            </h2>
                            <p className="mt-1 text-xs text-neutral-500">上传背景，自由拖拽贴纸，导出可打印的月历页。</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleSaveJournalToLibrary}
                            disabled={layoutItems.length === 0}
                            className="flex items-center gap-2 rounded-full border border-neutral-700 bg-transparent px-5 py-2 text-sm font-display font-bold text-white transition-colors hover:border-remuse-secondary hover:text-remuse-secondary disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <Save size={16} />
                            存入手账库
                        </button>
                        <button
                            onClick={exportCalendarPrint}
                            disabled={layoutItems.length === 0}
                            className="flex items-center gap-2 rounded-full bg-remuse-secondary px-5 py-2 text-sm font-display font-bold text-black shadow-lg transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                        >
                            <Printer size={16} />
                            导出月历图
                        </button>
                    </div>
                </div>

                <div className="flex flex-1 flex-col overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+5rem)] xl:flex-row xl:pb-0">
                    <div className="flex flex-1 items-center justify-center bg-[#111] p-4 md:p-6">
                        <div
                            ref={printCanvasRef}
                            className="relative w-full max-w-[440px] overflow-hidden rounded-[26px] border border-white/10 bg-[#f8f5ee] shadow-2xl touch-none"
                            style={{
                                aspectRatio: '2480/3508',
                                maxHeight: '78vh',
                                transform: `scale(${printScale})`,
                                transformOrigin: 'center center',
                                transition: 'transform 0.3s',
                                backgroundColor: printBackgroundColor,
                            }}
                            onMouseDown={(event) => handlePrintCanvasPointerDown(event.target)}
                            onTouchStart={(event) => handlePrintCanvasPointerDown(event.target)}
                            onDragOver={(event) => {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = 'move';
                            }}
                            onDrop={handlePrintCanvasDrop}
                            onMouseMove={(event) => handlePrintPointerMove(event.clientX, event.clientY)}
                            onMouseUp={stopPrintInteraction}
                            onMouseLeave={stopPrintInteraction}
                            onTouchMove={(event) => {
                                if (printInteraction && event.touches.length === 1) {
                                    event.preventDefault();
                                    handlePrintPointerMove(event.touches[0].clientX, event.touches[0].clientY);
                                }
                            }}
                            onTouchEnd={stopPrintInteraction}
                            onTouchCancel={stopPrintInteraction}
                        >
                            {printBackgroundImage && (
                                <img src={printBackgroundImage} alt="Calendar background" className="absolute inset-0 h-full w-full object-cover" />
                            )}
                            <div
                                className="absolute inset-0"
                                style={{ background: printBackgroundImage ? `rgba(255,255,255,${printBackgroundOverlay})` : 'rgba(255,255,255,0.18)' }}
                            />
                            <div className="absolute inset-[3%] rounded-[32px] border border-neutral-900/15" />

                            <div className="absolute left-[6.5%] top-[5.2%] z-[2]">
                                <p className="text-[18px] font-black leading-none tracking-[0.04em]" style={{ color: printTemplate.textColor }}>
                                    {printYear}
                                </p>
                                <div className="mt-[1.5%] flex items-end gap-[2%]">
                                    <span className="text-[44px] font-black leading-none" style={{ color: printTemplate.textColor }}>
                                        {printMonth}
                                    </span>
                                    <span className="pb-[5%] text-[15px] font-semibold" style={{ color: printTemplate.textColor }}>
                                        {CALENDAR_MONTH_SHORT_LABELS[printMonth - 1]}
                                    </span>
                                </div>
                            </div>

                            <div className="absolute inset-x-[24%] top-[8.5%] z-[2] text-center">
                                <h3 className="text-[28px] font-black leading-none tracking-[-0.04em]" style={{ color: printTemplate.textColor }}>
                                    {CALENDAR_MONTH_FULL_LABELS[printMonth - 1]}
                                </h3>
                            </div>

                            {printHeaderNote.trim() ? (
                                <div className="absolute right-[7%] top-[5.5%] z-[2] max-w-[32%] text-right">
                                    <p className="whitespace-pre-line text-[9.5px] font-medium leading-[1.55]" style={{ color: printTemplate.textColor }}>
                                        {printHeaderNote.trim()}
                                    </p>
                                </div>
                            ) : null}

                            <div className="absolute inset-x-[5%] top-[18%] bottom-[7%] z-[1] flex flex-col">
                                <div className="mb-[1.5%] grid grid-cols-7 gap-[1.1%]">
                                    {CALENDAR_WEEKDAY_LABELS.map((weekday, index) => {
                                        const weekend = index >= 5;
                                        return (
                                            <div
                                                key={weekday}
                                                className="flex items-center justify-center rounded-[10px] border text-[9px] font-black tracking-[0.2em]"
                                                style={{
                                                    background: weekend ? '#111827' : 'rgba(255,255,255,0.82)',
                                                    color: weekend ? '#ffffff' : printTemplate.textColor,
                                                    borderColor: weekend ? '#111827' : 'rgba(15,23,42,0.18)',
                                                }}
                                            >
                                                {weekday}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="grid flex-1 grid-cols-7 grid-rows-6 gap-[1.1%]">
                                    {calendarCells.map((cell) => (
                                        <div
                                            key={cell.key}
                                            className="relative overflow-hidden rounded-[14px] border"
                                            style={{
                                                background: cell.inCurrentMonth ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.42)',
                                                borderColor: cell.inCurrentMonth ? 'rgba(15,23,42,0.16)' : 'rgba(100,116,139,0.18)',
                                            }}
                                        >
                                            <span
                                                className="absolute left-[8%] top-[8%] text-[9px] font-bold"
                                                style={{ color: cell.inCurrentMonth ? printTemplate.textColor : printTemplate.secondaryTextColor }}
                                            >
                                                {cell.dayNumber}
                                            </span>
                                            <div className="absolute inset-x-[8%] bottom-[13%] h-px" style={{ background: 'rgba(148,163,184,0.28)' }} />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {layoutItems
                                .slice()
                                .sort((a, b) => a.zIndex - b.zIndex)
                                .map((item) => {
                                    const isSelected = selectedPrintItemId === item.instanceId;
                                    const isInteracting = printInteraction?.instanceId === item.instanceId;

                                    return (
                                        <div
                                            key={item.instanceId}
                                            data-print-sticker-shell="true"
                                            role="button"
                                            tabIndex={0}
                                            aria-label={item.sticker.dramaText || item.sticker.category || '贴纸'}
                                            className={`absolute z-10 flex select-none items-center justify-center ${isInteracting && printInteraction?.mode === 'drag' ? 'cursor-grabbing' : 'cursor-grab'}`}
                                            style={{
                                                left: `${item.x}%`,
                                                top: `${item.y}%`,
                                                width: `${previewBaseWidth * item.scale}%`,
                                                transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
                                                touchAction: 'none',
                                            }}
                                            onClick={() => setSelectedPrintItemId(item.instanceId)}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault();
                                                    setSelectedPrintItemId(item.instanceId);
                                                }
                                            }}
                                            onMouseDown={(event) => {
                                                event.preventDefault();
                                                handlePrintPointerDown(event.clientX, event.clientY, item.instanceId);
                                            }}
                                            onTouchStart={(event) => {
                                                if (event.touches.length === 1) {
                                                    event.preventDefault();
                                                    handlePrintPointerDown(event.touches[0].clientX, event.touches[0].clientY, item.instanceId);
                                                }
                                            }}
                                        >
                                            <div className="relative flex w-full items-center justify-center transition-all" style={getPrintStickerFrameStyle(printTemplate, isSelected)}>
                                                <img src={item.sticker.stickerImageUrl} alt={item.sticker.dramaText || 'sticker'} className="block h-auto w-full object-contain" />

                                                {isSelected ? (
                                                    <>
                                                        <div className="pointer-events-none absolute inset-0 rounded-[24px] border-2 border-cyan-300/95 shadow-[0_0_0_1px_rgba(34,211,238,0.25)]" />
                                                        <button
                                                            type="button"
                                                            aria-label="移出贴纸"
                                                            className="absolute -right-2 -top-2 z-[2] flex h-7 w-7 items-center justify-center rounded-full border border-red-300/30 bg-[#171717]/85 text-red-100 shadow-[0_8px_20px_rgba(0,0,0,0.28)] backdrop-blur transition-colors hover:border-red-300/60 hover:bg-red-500/90"
                                                            onMouseDown={(event) => {
                                                                event.preventDefault();
                                                                event.stopPropagation();
                                                            }}
                                                            onTouchStart={(event) => {
                                                                event.preventDefault();
                                                                event.stopPropagation();
                                                            }}
                                                            onClick={(event) => {
                                                                event.preventDefault();
                                                                event.stopPropagation();
                                                                handleRemoveStickerFromPrint(item.sticker.id);
                                                            }}
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                        <div className="pointer-events-none absolute left-1/2 top-0 h-6 w-px -translate-x-1/2 -translate-y-full bg-cyan-300/75" />
                                                        <button
                                                            type="button"
                                                            aria-label="旋转贴纸"
                                                            className={`absolute left-1/2 top-0 flex h-5 w-5 -translate-x-1/2 -translate-y-[175%] items-center justify-center rounded-full border border-cyan-200 bg-[#0f172a] text-cyan-200 shadow-lg ${printInteraction?.mode === 'rotate' && isInteracting ? 'cursor-grabbing' : 'cursor-grab'}`}
                                                            onMouseDown={(event) => {
                                                                event.preventDefault();
                                                                event.stopPropagation();
                                                                handlePrintRotatePointerDown(event.clientX, event.clientY, item.instanceId);
                                                            }}
                                                            onTouchStart={(event) => {
                                                                if (event.touches.length === 1) {
                                                                    event.preventDefault();
                                                                    event.stopPropagation();
                                                                    handlePrintRotatePointerDown(event.touches[0].clientX, event.touches[0].clientY, item.instanceId);
                                                                }
                                                            }}
                                                        >
                                                            <span className="block h-2 w-2 rounded-full bg-cyan-300" />
                                                        </button>

                                                        {PRINT_HANDLE_CONFIGS.map((handle) => (
                                                            <button
                                                                key={handle.id}
                                                                type="button"
                                                                aria-label="缩放贴纸"
                                                                className={`absolute ${handle.className} h-4 w-4 rounded-full border-2 border-[#0f172a] bg-cyan-300 shadow-lg`}
                                                                onMouseDown={(event) => {
                                                                    event.preventDefault();
                                                                    event.stopPropagation();
                                                                    handlePrintResizePointerDown(event.clientX, event.clientY, item.instanceId);
                                                                }}
                                                                onTouchStart={(event) => {
                                                                    if (event.touches.length === 1) {
                                                                        event.preventDefault();
                                                                        event.stopPropagation();
                                                                        handlePrintResizePointerDown(event.touches[0].clientX, event.touches[0].clientY, item.instanceId);
                                                                    }
                                                                }}
                                                            />
                                                        ))}
                                                    </>
                                                ) : null}
                                            </div>
                                        </div>
                                    );
                                })}

                            <div className="absolute inset-x-[8%] bottom-[4%] text-center text-[8px] font-display uppercase tracking-[0.24em]" style={{ color: printTemplate.secondaryTextColor }}>
                                remuse monthly journal
                            </div>
                        </div>
                    </div>

                    <div className="w-full space-y-5 border-t border-neutral-800 bg-remuse-panel p-4 xl:w-[22rem] xl:overflow-y-auto xl:border-l xl:border-t-0 md:p-5">
                        <div className="rounded-2xl border border-neutral-800 bg-black/20 p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <label className="mb-2 block text-xs font-display uppercase tracking-wider text-neutral-400">贴纸池</label>
                                    <p className="text-[11px] leading-relaxed text-neutral-500">把贴纸拖进月历里，或点击加入。移出后会自动回到这里。</p>
                                </div>
                                <span className="rounded-full border border-neutral-700 px-2.5 py-1 text-[11px] font-mono text-neutral-400">
                                    {availablePrintStickers.length}/{regularStickers.length}
                                </span>
                            </div>

                            <div className="mt-4 max-h-[18rem] space-y-3 overflow-y-auto pr-1">
                                {availablePrintStickers.length > 0 ? (
                                    availablePrintStickers.map((sticker) => (
                                        <div
                                            key={sticker.id}
                                            draggable
                                            onDragStart={(event) => {
                                                event.dataTransfer.effectAllowed = 'move';
                                                event.dataTransfer.setData('text/remuse-sticker-id', sticker.id);
                                            }}
                                            className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-3 transition-colors hover:border-remuse-secondary/40"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-2">
                                                    <img src={sticker.stickerImageUrl} alt={sticker.dramaText || 'sticker'} className="h-full w-full object-contain" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="line-clamp-2 text-sm font-display font-bold text-white">
                                                        {sticker.dramaText || sticker.category}
                                                    </p>
                                                    <p className="mt-1 text-[11px] text-neutral-500">拖进月历或点击加入</p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleAddStickerToPrint(sticker.id)}
                                                className="mt-3 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-display text-white transition-colors hover:border-remuse-secondary hover:text-remuse-secondary"
                                            >
                                                加入月历
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/50 px-4 py-5 text-sm leading-relaxed text-neutral-500">
                                        贴纸池已经空了。把画布里的贴纸移出后，它会自动回到这里。
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-neutral-800 bg-black/20 p-4">
                            <p className="text-sm font-display font-bold text-white">月历设置</p>
                            <div className="mt-4 grid grid-cols-2 gap-3">
                                <label className="text-xs text-neutral-400">
                                    <span className="mb-2 block font-display uppercase tracking-wider">年份</span>
                                    <select
                                        value={printYear}
                                        onChange={(event) => setPrintYear(Number(event.target.value))}
                                        className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-3 text-sm text-white focus:border-remuse-secondary focus:outline-none"
                                    >
                                        {yearOptions.map((year) => (
                                            <option key={year} value={year}>
                                                {year}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="text-xs text-neutral-400">
                                    <span className="mb-2 block font-display uppercase tracking-wider">月份</span>
                                    <select
                                        value={printMonth}
                                        onChange={(event) => setPrintMonth(Number(event.target.value))}
                                        className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-3 text-sm text-white focus:border-remuse-secondary focus:outline-none"
                                    >
                                        {CALENDAR_MONTH_FULL_LABELS.map((monthLabel, index) => (
                                            <option key={monthLabel} value={index + 1}>
                                                {index + 1} / {monthLabel}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>

                            <div className="mt-4">
                                <div className="mb-2 flex items-center justify-between">
                                    <label className="text-xs font-display uppercase tracking-wider text-neutral-400">纯色底色</label>
                                    <input
                                        type="color"
                                        value={printBackgroundColor}
                                        onChange={(event) => setPrintBackgroundColor(event.target.value)}
                                        className="h-9 w-11 cursor-pointer rounded-lg border border-neutral-700 bg-neutral-900 p-1"
                                    />
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {CALENDAR_BACKGROUND_SWATCHES.map((color) => (
                                        <button
                                            key={color}
                                            type="button"
                                            aria-label={`Select ${color}`}
                                            onClick={() => setPrintBackgroundColor(color)}
                                            className={`h-9 w-9 rounded-full border transition-transform hover:scale-105 ${printBackgroundColor.toLowerCase() === color.toLowerCase() ? 'border-white' : 'border-white/15'}`}
                                            style={{ backgroundColor: color }}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="mt-4">
                                <div className="mb-2 flex items-center justify-between">
                                    <label className="text-xs font-display uppercase tracking-wider text-neutral-400">背景图</label>
                                    {printBackgroundImage ? (
                                        <button
                                            type="button"
                                            onClick={clearPrintBackground}
                                            className="rounded-full border border-neutral-700 px-3 py-1 text-[11px] font-display text-neutral-300 transition-colors hover:border-remuse-secondary hover:text-remuse-secondary"
                                        >
                                            清除
                                        </button>
                                    ) : null}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => printBackgroundInputRef.current?.click()}
                                    className="w-full rounded-2xl border border-dashed border-neutral-700 bg-neutral-900/70 px-4 py-4 text-left transition-colors hover:border-remuse-secondary hover:bg-neutral-900"
                                >
                                    <p className="text-sm font-display font-bold text-white">上传手账纸或照片</p>
                                    <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">支持把自己的底纸、照片或打印背景铺在整页下面。</p>
                                </button>
                                <input
                                    ref={printBackgroundInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handlePrintBackgroundUpload}
                                />
                            </div>

                            {printBackgroundImage ? (
                                <div className="mt-4">
                                    <div className="mb-2 flex items-center justify-between">
                                        <label className="text-xs font-display uppercase tracking-wider text-neutral-400">背景覆盖度</label>
                                        <span className="text-[11px] font-mono text-neutral-500">{Math.round(printBackgroundOverlay * 100)}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.2"
                                        max="0.95"
                                        step="0.05"
                                        value={printBackgroundOverlay}
                                        onChange={(event) => setPrintBackgroundOverlay(Number(event.target.value))}
                                        className="w-full accent-remuse-secondary"
                                    />
                                </div>
                            ) : null}

                            <div className="mt-4">
                                <label className="mb-2 block text-xs font-display uppercase tracking-wider text-neutral-400">页眉文字</label>
                                <textarea
                                    rows={4}
                                    maxLength={80}
                                    value={printHeaderNote}
                                    onChange={(event) => setPrintHeaderNote(event.target.value)}
                                    placeholder="写一句这个月的主题、提醒或想记录的话。"
                                    className="w-full rounded-2xl border border-neutral-700 bg-neutral-900 px-3 py-3 text-sm leading-relaxed text-white transition-colors focus:border-remuse-secondary focus:outline-none"
                                />
                            </div>
                        </div>

                        <div className="rounded-2xl border border-neutral-800 bg-black/20 p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <label className="mb-2 block text-xs font-display uppercase tracking-wider text-neutral-400">贴纸排版</label>
                                    <p className="text-[11px] leading-relaxed text-neutral-500">在左侧拖动贴纸，自由摆成月历手账；点击贴纸后可直接拖动、缩放和旋转。</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => resetPrintLayout(selectedStickers)}
                                    disabled={selectedStickers.length === 0}
                                    className="shrink-0 rounded-full border border-neutral-700 px-3 py-1.5 text-[11px] font-display text-neutral-300 transition-colors hover:border-remuse-secondary hover:text-remuse-secondary disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    重置排版
                                </button>
                            </div>
                            {selectedPrintItem ? (
                                <div className="mt-4 space-y-4 rounded-2xl border border-white/10 bg-neutral-950/70 p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-14 w-14 overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-2">
                                            <img src={selectedPrintItem.sticker.stickerImageUrl} alt={selectedPrintItem.sticker.dramaText || 'selected sticker'} className="h-full w-full object-contain" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-display uppercase tracking-[0.2em] text-neutral-500">selected sticker</p>
                                            <p className="mt-1 line-clamp-2 text-sm font-display font-bold text-white">
                                                {selectedPrintItem.sticker.dramaText || selectedPrintItem.sticker.category}
                                            </p>
                                        </div>
                                    </div>
                                    <p className="rounded-2xl border border-dashed border-neutral-800 bg-black/20 px-3 py-3 text-xs leading-relaxed text-neutral-400">
                                        直接在纸面上拖动、拉四角缩放，或拖顶部圆点旋转。
                                    </p>
                                </div>
                            ) : (
                                <div className="mt-4 rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/50 px-4 py-5 text-sm text-neutral-500">
                                    先点击纸面上的任意贴纸，再直接拖动、缩放或旋转它。
                                </div>
                            )}
                        </div>

                        <div className="rounded-2xl border border-neutral-800 bg-black/20 p-4">
                            <label className="mb-2 block text-xs font-display uppercase tracking-wider text-neutral-400">预览缩放</label>
                            <input
                                type="range"
                                min="0.6"
                                max="1.45"
                                step="0.05"
                                value={printScale}
                                onChange={(event) => setPrintScale(Number(event.target.value))}
                                className="w-full accent-remuse-secondary"
                            />
                        </div>
                    </div>

                    {renderSaveFeedback()}
                </div>
            </div>
        );
    };

    const renderEditablePrintStudio = (selectedStickers: Sticker[]) => {
        const selectedPrintItem = layoutItems.find((item) => item.instanceId === selectedPrintItemId) ?? layoutItems[0] ?? null;
        const previewBaseWidth = getPrintBaseWidth(layoutItems.length || selectedStickers.length || 1);
        const calendarCells = buildCalendarCells(printYear, printMonth);
        const yearOptions = Array.from({ length: 8 }, (_, index) => new Date().getFullYear() - 1 + index);

        return (
            <div className="remuse-studio flex h-full flex-col bg-remuse-dark text-white">
                <div className="flex items-center justify-between border-b border-neutral-800 bg-remuse-panel p-4">
                    <div className="flex items-center gap-4">
                        <button onClick={handleReturnFromCanvas} className="text-neutral-500 transition-colors hover:text-white"><X size={24} /></button>
                        <h2 className="flex items-center gap-2 text-xl font-bold font-display text-white"><Scissors size={20} className="text-remuse-secondary" />手账拼贴工坊</h2>
                    </div>
                    <button onClick={handleExportPrint} className="flex items-center gap-2 rounded-full bg-remuse-secondary px-5 py-2 text-sm font-display font-bold text-black shadow-lg transition-transform hover:scale-105"><Printer size={16} />导出打印图</button>
                </div>

                <div className="flex flex-1 flex-col overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+5rem)] xl:flex-row xl:pb-0">
                    <div className="flex flex-1 items-center justify-center bg-[#111] p-4 md:p-6">
                        <div
                            ref={printCanvasRef}
                            className="relative w-full max-w-[420px] overflow-hidden rounded-[22px] border border-white/10 shadow-2xl touch-none"
                            style={{
                                aspectRatio: '2480/3508',
                                maxHeight: '78vh',
                                transform: `scale(${printScale})`,
                                transformOrigin: 'center center',
                                transition: 'transform 0.3s',
                                backgroundColor: printBackgroundColor,
                            }}
                            onMouseDown={(event) => handlePrintCanvasPointerDown(event.target)}
                            onTouchStart={(event) => handlePrintCanvasPointerDown(event.target)}
                            onDragOver={(event) => {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = 'move';
                            }}
                            onDrop={handlePrintCanvasDrop}
                            onMouseMove={(event) => handlePrintPointerMove(event.clientX, event.clientY)}
                            onMouseUp={stopPrintInteraction}
                            onMouseLeave={stopPrintInteraction}
                            onTouchMove={(event) => { if (printInteraction && event.touches.length === 1) { event.preventDefault(); handlePrintPointerMove(event.touches[0].clientX, event.touches[0].clientY); } }}
                            onTouchEnd={stopPrintInteraction}
                            onTouchCancel={stopPrintInteraction}
                        >
                            {printBackgroundImage && (
                                <img src={printBackgroundImage} alt="Calendar background" className="absolute inset-0 h-full w-full object-cover" />
                            )}
                            <div
                                className="absolute inset-0"
                                style={{ background: printBackgroundImage ? `rgba(255,255,255,${printBackgroundOverlay})` : 'rgba(255,255,255,0.18)' }}
                            />
                            <div className="absolute inset-[3.5%] rounded-[28px] border border-neutral-900/20" />

                            <div className="absolute left-[6.5%] top-[5.5%] z-[2]">
                                <p className="text-[18px] font-black leading-none tracking-[0.04em]" style={{ color: printTemplate.textColor }}>{printYear}</p>
                                <div className="mt-[2%] flex items-end gap-[2%]">
                                    <span className="text-[44px] font-black leading-none" style={{ color: printTemplate.textColor }}>{printMonth}</span>
                                    <span className="pb-[5%] text-[15px] font-semibold" style={{ color: printTemplate.textColor }}>{CALENDAR_MONTH_SHORT_LABELS[printMonth - 1]}</span>
                                </div>
                            </div>

                            <div className="absolute inset-x-[26%] top-[8.5%] z-[2] text-center">
                                <h3 className="text-[28px] font-black leading-none tracking-[-0.04em]" style={{ color: printTemplate.textColor }}>
                                    {CALENDAR_MONTH_FULL_LABELS[printMonth - 1]}
                                </h3>
                            </div>

                            {printHeaderNote.trim() ? (
                                <div className="absolute right-[7%] top-[5.5%] z-[2] max-w-[32%] text-right">
                                    <p className="whitespace-pre-line text-[9.5px] font-medium leading-[1.55]" style={{ color: printTemplate.textColor }}>
                                        {printHeaderNote.trim()}
                                    </p>
                                </div>
                            ) : null}

                            <div className="absolute inset-x-[5%] top-[18%] bottom-[7%] z-[1] flex flex-col">
                                <div className="mb-[1.5%] grid grid-cols-7 gap-[1.1%]">
                                    {CALENDAR_WEEKDAY_LABELS.map((weekday, index) => {
                                        const weekend = index >= 5;
                                        return (
                                            <div
                                                key={weekday}
                                                className="flex items-center justify-center rounded-[10px] border text-[9px] font-black tracking-[0.2em]"
                                                style={{
                                                    background: weekend ? '#111827' : 'rgba(255,255,255,0.82)',
                                                    color: weekend ? '#ffffff' : printTemplate.textColor,
                                                    borderColor: weekend ? '#111827' : 'rgba(15,23,42,0.18)',
                                                }}
                                            >
                                                {weekday}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="grid flex-1 grid-cols-7 grid-rows-6 gap-[1.1%]">
                                    {calendarCells.map((cell) => (
                                        <div
                                            key={cell.key}
                                            className="relative overflow-hidden rounded-[14px] border"
                                            style={{
                                                background: cell.inCurrentMonth ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.42)',
                                                borderColor: cell.inCurrentMonth ? 'rgba(15,23,42,0.16)' : 'rgba(100,116,139,0.18)',
                                            }}
                                        >
                                            <span
                                                className="absolute left-[8%] top-[8%] text-[9px] font-bold"
                                                style={{ color: cell.inCurrentMonth ? printTemplate.textColor : printTemplate.secondaryTextColor }}
                                            >
                                                {cell.dayNumber}
                                            </span>
                                            <div className="absolute inset-x-[8%] bottom-[13%] h-px" style={{ background: 'rgba(148,163,184,0.28)' }} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {layoutItems.slice().sort((a, b) => a.zIndex - b.zIndex).map((item) => {
                                const isSelected = selectedPrintItemId === item.instanceId;
                                const isInteracting = printInteraction?.instanceId === item.instanceId;

                                return (
                                    <div
                                        key={item.instanceId}
                                        data-print-sticker-shell="true"
                                        role="button"
                                        tabIndex={0}
                                        aria-label={item.sticker.dramaText || item.sticker.category || '贴纸'}
                                        className={`absolute z-10 flex select-none items-center justify-center ${isInteracting && printInteraction?.mode === 'drag' ? 'cursor-grabbing' : 'cursor-grab'}`}
                                        style={{ left: `${item.x}%`, top: `${item.y}%`, width: `${previewBaseWidth * item.scale}%`, transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`, touchAction: 'none' }}
                                        onClick={() => setSelectedPrintItemId(item.instanceId)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                setSelectedPrintItemId(item.instanceId);
                                            }
                                        }}
                                        onMouseDown={(event) => { event.preventDefault(); handlePrintPointerDown(event.clientX, event.clientY, item.instanceId); }}
                                        onTouchStart={(event) => { if (event.touches.length === 1) { event.preventDefault(); handlePrintPointerDown(event.touches[0].clientX, event.touches[0].clientY, item.instanceId); } }}
                                    >
                                        <div className="relative flex w-full items-center justify-center transition-all" style={getPrintStickerFrameStyle(printTemplate, isSelected)}>
                                            <img src={item.sticker.stickerImageUrl} alt={item.sticker.dramaText || 'sticker'} className="block h-auto w-full object-contain" />

                                            {isSelected ? (
                                                <>
                                                    <div className="pointer-events-none absolute inset-0 rounded-[24px] border-2 border-cyan-300/95 shadow-[0_0_0_1px_rgba(34,211,238,0.25)]" />
                                                    <div className="pointer-events-none absolute left-1/2 top-0 h-6 w-px -translate-x-1/2 -translate-y-full bg-cyan-300/75" />
                                                    <button
                                                        type="button"
                                                        aria-label="旋转贴纸"
                                                        className={`absolute left-1/2 top-0 flex h-5 w-5 -translate-x-1/2 -translate-y-[175%] items-center justify-center rounded-full border border-cyan-200 bg-[#0f172a] text-cyan-200 shadow-lg ${printInteraction?.mode === 'rotate' && isInteracting ? 'cursor-grabbing' : 'cursor-grab'}`}
                                                        onMouseDown={(event) => {
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                            handlePrintRotatePointerDown(event.clientX, event.clientY, item.instanceId);
                                                        }}
                                                        onTouchStart={(event) => {
                                                            if (event.touches.length === 1) {
                                                                event.preventDefault();
                                                                event.stopPropagation();
                                                                handlePrintRotatePointerDown(event.touches[0].clientX, event.touches[0].clientY, item.instanceId);
                                                            }
                                                        }}
                                                    >
                                                        <span className="block h-2 w-2 rounded-full bg-cyan-300" />
                                                    </button>

                                                    {PRINT_HANDLE_CONFIGS.map((handle) => (
                                                        <button
                                                            key={handle.id}
                                                            type="button"
                                                            aria-label="缩放贴纸"
                                                            className={`absolute ${handle.className} h-4 w-4 rounded-full border-2 border-[#0f172a] bg-cyan-300 shadow-lg`}
                                                            onMouseDown={(event) => {
                                                                event.preventDefault();
                                                                event.stopPropagation();
                                                                handlePrintResizePointerDown(event.clientX, event.clientY, item.instanceId);
                                                            }}
                                                            onTouchStart={(event) => {
                                                                if (event.touches.length === 1) {
                                                                    event.preventDefault();
                                                                    event.stopPropagation();
                                                                    handlePrintResizePointerDown(event.touches[0].clientX, event.touches[0].clientY, item.instanceId);
                                                                }
                                                            }}
                                                        />
                                                    ))}
                                                </>
                                            ) : null}
                                        </div>
                                    </div>
                                );
                            })}
                            <div className="absolute inset-x-[8%] bottom-[4%] text-center text-[8px] font-display uppercase tracking-[0.24em]" style={{ color: printTemplate.secondaryTextColor }}>{printTemplate.footerText}</div>
                        </div>
                    </div>

                    <div className="w-full space-y-5 border-t border-neutral-800 bg-remuse-panel p-4 xl:w-80 xl:overflow-y-auto xl:border-l xl:border-t-0 md:p-5">
                        <div className="grid grid-cols-1 gap-3">
                            {PRINT_TEMPLATES.map((tmpl) => (
                                <button key={tmpl.id} onClick={() => setPrintTemplate(tmpl)} className={`rounded-2xl border p-3 text-left transition-all ${printTemplate.id === tmpl.id ? 'border-remuse-secondary bg-remuse-secondary/10 shadow-[0_0_0_1px_rgba(0,255,255,0.12)]' : 'border-neutral-700 hover:border-neutral-500 hover:bg-white/[0.02]'}`}>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-sm font-display font-bold text-white">{tmpl.name}</span>
                                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-neutral-400">{tmpl.style}</span>
                                    </div>
                                    <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">{tmpl.description}</p>
                                </button>
                            ))}
                        </div>

                        <div className="rounded-2xl border border-neutral-800 bg-black/20 p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div><label className="mb-2 block text-xs font-display uppercase tracking-wider text-neutral-400">贴纸排布</label><p className="text-[11px] leading-relaxed text-neutral-500">支持鼠标直接拖动、缩放和旋转贴纸。</p></div>
                                <button type="button" onClick={() => resetPrintLayout(selectedStickers)} disabled={selectedStickers.length === 0} className="shrink-0 rounded-full border border-neutral-700 px-3 py-1.5 text-[11px] font-display text-neutral-300 transition-colors hover:border-remuse-secondary hover:text-remuse-secondary disabled:cursor-not-allowed disabled:opacity-40">重置排版</button>
                            </div>
                            {selectedPrintItem ? (
                                <div className="mt-4 space-y-4 rounded-2xl border border-white/10 bg-neutral-950/70 p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-14 w-14 overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-2"><img src={selectedPrintItem.sticker.stickerImageUrl} alt={selectedPrintItem.sticker.dramaText || 'selected sticker'} className="h-full w-full object-contain" /></div>
                                        <div className="min-w-0"><p className="text-xs font-display uppercase tracking-[0.2em] text-neutral-500">selected sticker</p><p className="mt-1 line-clamp-2 text-sm font-display font-bold text-white">{selectedPrintItem.sticker.dramaText || selectedPrintItem.sticker.category}</p></div>
                                    </div>
                                    <p className="rounded-2xl border border-dashed border-neutral-800 bg-black/20 px-3 py-3 text-xs leading-relaxed text-neutral-400">直接在纸面上拖动、拉四角缩放，或拖顶部圆点旋转。</p>
                                </div>
                            ) : (
                                <div className="mt-4 rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/50 px-4 py-5 text-sm text-neutral-500">先点击纸面上的贴纸，再直接拖动、缩放或旋转它。</div>
                            )}
                        </div>

                        <div>
                            <label className="mb-2 block text-xs font-display uppercase tracking-wider text-neutral-400">预览缩放</label>
                            <input type="range" min="0.6" max="1.45" step="0.05" value={printScale} onChange={(event) => setPrintScale(Number(event.target.value))} className="w-full accent-remuse-secondary" />
                        </div>
                    </div>

                    {renderSaveFeedback()}
                </div>
            </div>
        );
    };

    const handleExportPrint = async () => {
        {
        const styledStickers = safeStickers.filter((sticker) => selectedIds.has(sticker.id));
        if (styledStickers.length === 0) return;

        const exportItems =
            layoutItems.length === styledStickers.length ? [...layoutItems] : buildPrintLayoutItems(styledStickers, printTemplate);
        const A4_W = 2480;
        const A4_H = 3508;
        const styledCanvas = document.createElement('canvas');
        styledCanvas.width = A4_W;
        styledCanvas.height = A4_H;
        const styledCtx = styledCanvas.getContext('2d');
        if (!styledCtx) return;

        const loadStyledImage = (src: string) =>
            new Promise<HTMLImageElement>((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = src;
            });

        const drawStyledRoundRect = (x: number, y: number, width: number, height: number, radius: number) => {
            styledCtx.beginPath();
            styledCtx.moveTo(x + radius, y);
            styledCtx.lineTo(x + width - radius, y);
            styledCtx.quadraticCurveTo(x + width, y, x + width, y + radius);
            styledCtx.lineTo(x + width, y + height - radius);
            styledCtx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            styledCtx.lineTo(x + radius, y + height);
            styledCtx.quadraticCurveTo(x, y + height, x, y + height - radius);
            styledCtx.lineTo(x, y + radius);
            styledCtx.quadraticCurveTo(x, y, x + radius, y);
            styledCtx.closePath();
        };

        styledCtx.fillStyle = printTemplate.bgColor;
        styledCtx.fillRect(0, 0, A4_W, A4_H);
        styledCtx.textAlign = 'center';
        styledCtx.fillStyle = printTemplate.textColor;
        styledCtx.font = '700 68px "Noto Sans SC", sans-serif';
        styledCtx.fillText(printTemplate.headerTitle, A4_W / 2, 180);
        styledCtx.fillStyle = printTemplate.secondaryTextColor;
        styledCtx.font = '500 28px "Noto Sans SC", sans-serif';
        styledCtx.fillText(printTemplate.headerSubtitle, A4_W / 2, 235);

        const pageX = 190;
        const pageY = 320;
        const pageW = A4_W - 380;
        const pageH = A4_H - 610;
        styledCtx.fillStyle = 'rgba(255,255,255,0.78)';
        drawStyledRoundRect(pageX, pageY, pageW, pageH, 48);
        styledCtx.fill();
        styledCtx.strokeStyle = `${printTemplate.accentColor}55`;
        styledCtx.lineWidth = 4;
        drawStyledRoundRect(pageX, pageY, pageW, pageH, 48);
        styledCtx.stroke();

        const baseWidth = (pageW * getPrintBaseWidth(exportItems.length)) / 100;
        for (const item of [...exportItems].sort((a, b) => a.zIndex - b.zIndex)) {
            try {
                const image = await loadStyledImage(item.sticker.stickerImageUrl);
                const drawW = baseWidth * item.scale;
                const drawH = drawW * (image.height / image.width);
                const centerX = pageX + (item.x / 100) * pageW;
                const centerY = pageY + (item.y / 100) * pageH;
                const frameW = drawW * 1.16;
                const frameH = drawH * 1.16;

                styledCtx.save();
                styledCtx.translate(centerX, centerY);
                styledCtx.rotate((item.rotation * Math.PI) / 180);
                styledCtx.fillStyle = 'rgba(255,255,255,0.96)';
                styledCtx.strokeStyle = `${printTemplate.accentColor}66`;
                styledCtx.lineWidth = 4;
                if (printTemplate.style === 'stamp') {
                    styledCtx.setLineDash([18, 12]);
                } else {
                    styledCtx.setLineDash([]);
                }
                drawStyledRoundRect(-frameW / 2, -frameH / 2, frameW, frameH, printTemplate.style === 'postcard' ? 26 : 34);
                styledCtx.fill();
                styledCtx.stroke();
                styledCtx.setLineDash([]);
                styledCtx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);
                styledCtx.restore();
            } catch (error) {
                logger.error('Print sticker draw failed:', error);
            }
        }

        styledCtx.fillStyle = printTemplate.secondaryTextColor;
        styledCtx.font = '500 24px "Noto Sans SC", sans-serif';
        styledCtx.fillText(printTemplate.footerText, A4_W / 2, A4_H - 90);
        await runSaveAction(() => persistCanvasToDevice(styledCanvas, `remuse-print-${printTemplate.id}-${Date.now()}.png`));
        return;
        }

        const selectedStickers = safeStickers.filter(s => selectedIds.has(s.id));
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

        await runSaveAction(() => persistCanvasToDevice(canvas, `remuse-sticker-sheet-${Date.now()}.png`));
    };

    // --- 表情包生成 ---
    const handleGenerateEmojiPack = async () => {
        const selectedStickers = safeStickers.filter(s => selectedIds.has(s.id));
        if (selectedStickers.length === 0) return;

        setIsGeneratingEmoji(true);
        setEmojiPackItems([]);
        setEmojiSheetUrl('');
        setEmojiGenProgress('正在分析心情，生成表情包文案...');

        try {
            setEmojiGenProgress(`正在将 ${selectedStickers.length} 张贴纸转化为表情包，请耐心等待...`);
            // 将所有选中贴纸转为 base64
            const stickerInputs: StickerInput[] = [];
            for (const sticker of selectedStickers) {
                let base64 = '';
                let mimeType = 'image/png';
                const stickerUrl = sticker.stickerImageUrl;
                if (stickerUrl.startsWith('data:')) {
                    const [meta, payload = ''] = stickerUrl.split(',');
                    const declaredMimeType = meta.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64$/)?.[1];
                    base64 = payload;
                    mimeType = declaredMimeType || mimeType;
                } else {
                    const resp = await fetchImageAsset(stickerUrl);
                    const blob = await resp.blob();
                    mimeType = blob.type || mimeType;
                    const dataUrl = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(blob);
                    });
                    base64 = dataUrl.split(',')[1];
                }
                stickerInputs.push({ base64, mimeType, name: sticker.dramaText || sticker.category || 'sticker' });
                continue;
                stickerInputs.push({ base64, name: sticker.dramaText || '可爱物品' });
            }

            setEmojiGenProgress(`正在生成 ${emojiCount} 张表情包整图，请耐心等待...`);
            const items = await generateEmojiPack(
                stickerInputs,
                emojiCount,
                emojiMoodText
            );
            setEmojiPackItems(items);
            setEmojiSheetUrl(items[0]?.imageUrl || '');
            setEmojiGenProgress('');
        } catch (err) {
            logger.error('Emoji pack generation failed:', err);
            setEmojiGenProgress('生成失败，请重试');
        } finally {
            setIsGeneratingEmoji(false);
        }
    };

    // 下载合成贴纸表
    const handleDownloadEmojiSheet = async () => {
        if (!emojiSheetUrl) return;
        await runSaveAction(() => persistImageUrlToDevice(emojiSheetUrl, `remuse-emoji-sheet-${Date.now()}.png`));
    };

    // 存入表情包库（作为特殊 category 的贴纸保存）
    const handleSaveToEmojiLibrary = async () => {
        if (!emojiSheetUrl || !onStickerCreated) return;
        const selectedStickers = safeStickers.filter(s => selectedIds.has(s.id));
        const sourceNames = selectedStickers.map(s => s.dramaText || '物品').join('、');
        const newSticker: Sticker = {
            id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            originalItemId: selectedStickers
                .map((sticker) => sticker.originalItemId?.trim())
                .find((itemId): itemId is string => !!itemId) || '',
            stickerImageUrl: emojiSheetUrl,
            dramaText: emojiMoodText || sourceNames,
            category: '__emoji_pack__',
            dateCreated: new Date().toISOString(),
        };
        try {
            await onStickerCreated(newSticker);
            showSaveFeedback('已存入表情包库', '这套表情包已经保存到再生成果库。');
            return;
        } catch (error) {
            logger.error('Save emoji pack to library failed:', error);
            showSaveFeedback('保存失败', '存入表情包库失败，请稍后重试。');
            return;
        }
    };

    // 语音输入
    const toggleVoiceInput = () => {
        if (isRecording) {
            // 停止录音
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
            setIsRecording(false);
            return;
        }

        // 检查浏览器支持
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            showSaveFeedback('语音不可用', '当前浏览器不支持语音输入，请尝试使用 Chrome。');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'zh-CN';
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event: any) => {
            let transcript = '';
            for (let i = 0; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            setEmojiMoodText(transcript);
        };

        recognition.onerror = (event: any) => {
            logger.warn('Speech recognition error:', event.error);
            setIsRecording(false);
            if (event.error === 'not-allowed') {
                showSaveFeedback('麦克风权限被拒绝', '请允许麦克风权限后再尝试语音输入。');
            }
        };

        recognition.onend = () => {
            setIsRecording(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
        setIsRecording(true);
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
        const handleGlobalUp = () => {
            setActiveDragId(null);
            setActiveXhsDragId(null);
        };
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
        const selectedStickers = safeStickers.filter(s => selectedIds.has(s.id));

        // --- Sub-render: 小红书配图 ---
        if (canvasMode === 'XIAOHONGSHU') {
            return renderEditableXhsStudio(selectedStickers);
            const t = xhsTemplate;
            return (
                <div className="remuse-studio h-full bg-remuse-dark text-white flex flex-col">
                    {/* Header */}
                    <div className="p-4 border-b border-neutral-800 bg-remuse-panel flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button onClick={handleReturnFromCanvas} className="text-neutral-500 hover:text-white"><X size={24} /></button>
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

                    <div className="flex-1 overflow-y-auto flex flex-col xl:flex-row pb-[calc(env(safe-area-inset-bottom)+5rem)] xl:pb-0">
                        {/* Preview */}
                        <div className="flex-1 flex items-center justify-center p-4 md:p-6 bg-[#111]">
                            <div 
                                ref={xhsCanvasRef}
                                className="shadow-2xl rounded-lg overflow-hidden transition-all duration-300"
                                style={{ 
                                    backgroundColor: t.bgColor,
                                    width: '100%',
                                    maxWidth: t.ratio === '1:1' ? '360px' : t.ratio === '4:3' ? '420px' : '340px',
                                    aspectRatio: `${t.width}/${t.height}`,
                                    maxHeight: '72vh'
                                }}
                            >
                                {/*
                                  ┌─────────────────────────────┐
                                  │  装饰边框 (absolute, z=0)    │
                                  ├─────────────────────────────┤  13%
                                  │  ① 标题                     │
                                  ├─────────────────────────────┤  53%
                                  │  ② 贴纸区 (overflow:hidden) │
                                  ├─────────────────────────────┤  22%
                                  │  ③ 剧情文字                  │
                                  ├─────────────────────────────┤  12%
                                  │  ④ 水印                     │
                                  └─────────────────────────────┘
                                  grid-template-rows 严格隔离，不会互相遮挡
                                */}
                                <div className="relative w-full h-full" style={{
                                    display: 'grid',
                                    gridTemplateRows: '13% 53% 22% 12%',
                                    padding: '6% 7%',
                                }}>
                                    {/* 装饰边框 + 角点 (absolute, 完全在 grid 外) */}
                                    <div className="absolute inset-[5%] border-2 border-dashed rounded-sm pointer-events-none" style={{ borderColor: t.accentColor + '55' }} />
                                    {[
                                        { top: '5%',    left: '5%'    },
                                        { top: '5%',    right: '5%'   },
                                        { bottom: '5%', left: '5%'    },
                                        { bottom: '5%', right: '5%'   },
                                    ].map((pos, idx) => (
                                        <div key={idx} className="absolute w-2.5 h-2.5 rounded-full pointer-events-none z-0"
                                            style={{ backgroundColor: t.accentColor, ...pos }} />
                                    ))}

                                    {/* ① 标题行 */}
                                    <div className="flex flex-col items-center justify-center relative z-10">
                                        <p className="font-bold font-display text-[13px] leading-tight text-center px-2" style={{ color: t.textColor }}>
                                            {xhsTitle}
                                        </p>
                                        <div className="w-10 h-[2px] mt-1.5 rounded-full" style={{ backgroundColor: t.accentColor }} />
                                    </div>

                                    {/* ② 贴纸区：height:100% + minHeight:0 锁死 grid 行高，内部再用显式 grid 按数量布局 */}
                                    {(() => {
                                        const ss = selectedStickers.slice(0, 4);
                                        const n = ss.length;
                                        // 列数：1 张=1列，2张=2列，3~4张=2列
                                        const cols = n === 1 ? 1 : 2;
                                        // 行数：1~2张=1行，3~4张=2行
                                        const rows = n <= 2 ? 1 : 2;
                                        return (
                                            <div
                                                className="relative z-10 overflow-hidden"
                                                style={{
                                                    height: '100%',    // 严格填满且不超出 grid 行
                                                    minHeight: 0,
                                                    padding: '5% 6%',
                                                    display: 'grid',
                                                    gridTemplateColumns: `repeat(${cols}, 1fr)`,
                                                    gridTemplateRows: `repeat(${rows}, 1fr)`,
                                                    gap: '4%',
                                                }}
                                            >
                                                {ss.map((s, i) => {
                                                    const rot = (i % 2 === 0 ? -1 : 1) * (3 + (i % 2) * 2);
                                                    // 3 张时第 3 张居中跨两列，宽度限制避免太大
                                                    const isCenter3 = n === 3 && i === 2;
                                                    return (
                                                        <div
                                                            key={s.id}
                                                            style={{
                                                                gridColumn: isCenter3 ? '1 / -1' : undefined,
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                overflow: 'hidden',   // 旋转溢出再截一层
                                                                transform: `rotate(${rot}deg)`,
                                                                padding: isCenter3 ? '0 28%' : '4%',
                                                            }}
                                                        >
                                                            <img
                                                                src={s.stickerImageUrl}
                                                                alt=""
                                                                style={{
                                                                    maxWidth: '100%',
                                                                    maxHeight: '100%',
                                                                    width: 'auto',
                                                                    height: 'auto',
                                                                    objectFit: 'contain',
                                                                    filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.12))',
                                                                }}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}

                                    {/* ③ 剧情文字行 */}
                                    <div className="flex items-center justify-center relative z-10 px-1">
                                        {selectedStickers[0]?.dramaText ? (
                                            <p className="text-center leading-snug px-1"
                                               style={{
                                                   color: t.textColor,
                                                   fontSize: '10px',
                                                   opacity: 0.65,
                                                   display: '-webkit-box',
                                                   WebkitLineClamp: 3,
                                                   WebkitBoxOrient: 'vertical',
                                                   overflow: 'hidden',
                                               }}>
                                                「{selectedStickers[0].dramaText.slice(0, 55)}」
                                            </p>
                                        ) : (
                                            <div className="w-16 h-px opacity-30" style={{ backgroundColor: t.accentColor }} />
                                        )}
                                    </div>

                                    {/* ④ 水印行 */}
                                    <div className="flex items-end justify-end relative z-10">
                                        <p className="font-display font-bold text-[10px]" style={{ color: t.accentColor }}>
                                            再生博物馆
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Sidebar Controls */}
                        <div className="w-full xl:w-72 bg-remuse-panel border-t xl:border-t-0 xl:border-l border-neutral-800 p-4 md:p-5 space-y-5 xl:overflow-y-auto">
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
                        </div>
                        {renderSaveFeedback()}
                    </div>
                </div>
            );
        }

        // --- Sub-render: 手账贴纸打印 ---
        if (canvasMode === 'PRINT') {
            return renderCalendarPrintStudio(selectedStickers);
            return (
                <div className="remuse-studio h-full bg-remuse-dark text-white flex flex-col">
                    {/* Header */}
                    <div className="p-4 border-b border-neutral-800 bg-remuse-panel flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button onClick={handleReturnFromCanvas} className="text-neutral-500 hover:text-white"><X size={24} /></button>
                            <h2 className="text-xl font-bold font-display text-white flex items-center gap-2">
                                <Scissors size={20} className="text-remuse-secondary" />
                                手账拼贴工坊
                            </h2>
                        </div>
                        <button 
                            onClick={handleExportPrint}
                            className="flex items-center gap-2 px-5 py-2 bg-remuse-secondary text-black rounded-full text-sm font-display font-bold hover:scale-105 transition-transform shadow-lg"
                        >
                            <Printer size={16} /> 导出打印图
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto flex flex-col xl:flex-row pb-[calc(env(safe-area-inset-bottom)+5rem)] xl:pb-0">
                        {/* Preview */}
                        <div className="flex-1 flex items-center justify-center p-4 md:p-6 bg-[#111]">
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
                        <div className="w-full xl:w-72 bg-remuse-panel border-t xl:border-t-0 xl:border-l border-neutral-800 p-4 md:p-5 space-y-5">
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
                {renderSaveFeedback()}
                </div>
            );
        }

        if (canvasMode === 'EMOJI_PACK') {
            const sourceStickers = safeStickers.filter(s => selectedIds.has(s.id));
            return (
                <div className="remuse-studio h-full bg-remuse-dark text-white flex flex-col">
                    {/* Header */}
                    <div className="p-4 border-b border-neutral-800 bg-remuse-panel flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-4">
                            <button onClick={handleReturnFromCanvas} className="text-neutral-500 hover:text-white"><X size={24} /></button>
                            <h2 className="text-xl font-bold font-display text-white flex items-center gap-2">
                                <Smile size={20} className="text-yellow-400" />
                                表情包工坊
                            </h2>
                        </div>
                        <div className="flex items-center gap-3">
                            {emojiSheetUrl && (
                                <>
                                    <button
                                        onClick={handleSaveToEmojiLibrary}
                                        className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-purple-400 to-pink-400 text-white rounded-full text-sm font-display font-bold hover:scale-105 transition-transform shadow-lg"
                                    >
                                        <Plus size={15} /> 存入表情包库
                                    </button>
                                    <button
                                        onClick={handleDownloadEmojiSheet}
                                        className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-green-400 to-emerald-500 text-black rounded-full text-sm font-display font-bold hover:scale-105 transition-transform shadow-lg"
                                    >
                                        <Download size={15} /> 保存到相册
                                    </button>
                                </>
                            )}
                            <button
                                onClick={handleGenerateEmojiPack}
                                disabled={isGeneratingEmoji || sourceStickers.length === 0}
                                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-yellow-400 to-orange-400 text-black rounded-full text-sm font-display font-bold hover:scale-105 transition-transform shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                            >
                                {isGeneratingEmoji
                                    ? <><Loader2 size={15} className="animate-spin" /> 生成中...</>
                                    : <><Smile size={15} /> {emojiPackItems.length > 0 ? '重新生成' : '开始生成'}</>
                                }
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto xl:overflow-hidden flex flex-col xl:flex-row pb-[calc(env(safe-area-inset-bottom)+5rem)] xl:pb-0">
                        {/* Main Area */}
                        <div className="flex-1 p-4 md:p-5 md:overflow-y-auto">
                            {/* Source Stickers Preview (ALL selected) */}
                            {sourceStickers.length > 0 && (
                                <div className="mb-5 p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
                                    <p className="text-xs text-neutral-500 font-display mb-3">基于 {sourceStickers.length} 张贴纸生成表情包</p>
                                    <div className="flex gap-3 overflow-x-auto pb-1">
                                        {sourceStickers.map(sticker => (
                                            <div key={sticker.id} className="flex items-center gap-3 flex-shrink-0 bg-neutral-950 rounded-lg px-3 py-2 border border-neutral-800">
                                                <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-neutral-900 flex items-center justify-center"
                                                    style={{ backgroundImage: 'linear-gradient(45deg, #1a1a1a 25%, transparent 25%), linear-gradient(-45deg, #1a1a1a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1a1a 75%), linear-gradient(-45deg, transparent 75%, #1a1a1a 75%)', backgroundSize: '10px 10px', backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px' }}>
                                                    <img src={sticker.stickerImageUrl} alt="" className="w-10 h-10 object-contain" />
                                                </div>
                                                <p className="text-xs text-white font-mono line-clamp-1 max-w-[120px]">{sticker.dramaText}</p>
                                            </div>
                                        ))}
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
                                    <p className="text-xs text-neutral-600 text-center">AI 正在生成整张表情包，稍等片刻~</p>
                                </div>
                            )}

                            {/* Empty State */}
                            {!isGeneratingEmoji && emojiPackItems.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-neutral-800 rounded-xl gap-4">
                                    <div className="text-5xl">😄 😂 🥹 😎</div>
                                    <p className="text-neutral-400 font-display text-sm">输入你的心情，点击「开始生成」</p>
                                    <p className="text-xs text-neutral-600 text-center max-w-xs">AI 会基于物品角色和你的心情，生成一整张拟人态表情包贴纸</p>
                                    {emojiGenProgress && <p className="text-sm text-red-400">{emojiGenProgress}</p>}
                                </div>
                            )}

                            {/* ===== 合成贴纸表预览（核心展示） ===== */}
                            {!isGeneratingEmoji && emojiSheetUrl && (
                                <div className="space-y-4">
                                    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl">
                                        <div className="p-3 border-b border-neutral-800 flex items-center justify-between">
                                            <span className="text-xs font-display text-neutral-400">📋 表情包贴纸表（{emojiCount} 张）</span>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={handleSaveToEmojiLibrary}
                                                    className="flex items-center gap-1.5 px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-full text-xs font-display transition-colors"
                                                >
                                                    <Plus size={12} /> 存入表情包库
                                                </button>
                                                <button
                                                    onClick={handleDownloadEmojiSheet}
                                                    className="flex items-center gap-1.5 px-3 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-full text-xs font-display transition-colors"
                                                >
                                                    <Download size={12} /> 保存到相册
                                                </button>
                                            </div>
                                        </div>
                                        <div className="p-4 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)' }}>
                                            <img
                                                src={emojiSheetUrl}
                                                alt="表情包贴纸表"
                                                className="max-w-full max-h-[60vh] object-contain rounded-xl shadow-xl"
                                                style={{ imageRendering: 'auto' }}
                                            />
                                        </div>
                                    </div>

                                </div>
                            )}
                        </div>

                        {/* Sidebar */}
                        <div className="w-full xl:w-72 flex-shrink-0 bg-remuse-panel border-t xl:border-t-0 xl:border-l border-neutral-800 p-4 md:p-5 space-y-5 xl:overflow-y-auto">
                            {/* 心情输入区 */}
                            <div>
                                <label className="text-xs font-display text-neutral-400 uppercase tracking-wider mb-2 block">💭 说说你的心情</label>
                                <div className="relative">
                                    <textarea
                                        value={emojiMoodText}
                                        onChange={(e) => setEmojiMoodText(e.target.value)}
                                        placeholder="输入或语音说出你的心情...&#10;例如：今天加班好累但终于搞完了超开心！"
                                        rows={3}
                                        className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 pr-12 text-sm text-white placeholder-neutral-600 resize-none focus:outline-none focus:border-yellow-400/50 focus:ring-1 focus:ring-yellow-400/20 transition-all"
                                        disabled={isGeneratingEmoji}
                                    />
                                    <button
                                        onClick={toggleVoiceInput}
                                        disabled={isGeneratingEmoji}
                                        className={`absolute right-2 bottom-2 p-2 rounded-lg transition-all ${
                                            isRecording
                                                ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/50'
                                                : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700'
                                        }`}
                                        title={isRecording ? '停止录音' : '语音输入'}
                                    >
                                        {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                                    </button>
                                </div>
                                {isRecording && (
                                    <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1.5 animate-pulse">
                                        <span className="w-2 h-2 bg-red-400 rounded-full inline-block" />
                                        正在聆听...
                                    </p>
                                )}
                                <p className="text-[10px] text-neutral-600 mt-1.5">AI 会从心情中提取情感关键词，不会照搬原文</p>
                            </div>

                            {/* 数量选择 */}
                            <div>
                                <label className="text-xs font-display text-neutral-400 uppercase tracking-wider mb-3 block">生成数量</label>
                                <div className="flex gap-1.5 mb-3">
                                    {[4, 6, 9, 12].map(n => (
                                        <button
                                            key={n}
                                            onClick={() => setEmojiCount(n)}
                                            disabled={isGeneratingEmoji}
                                            className={`flex-1 py-1.5 rounded-lg border text-xs font-display font-bold transition-all ${
                                                emojiCount === n
                                                    ? 'bg-yellow-400 text-black border-yellow-400'
                                                    : 'bg-neutral-900 text-neutral-400 border-neutral-700 hover:border-neutral-500'
                                            }`}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="range"
                                        min={1}
                                        max={16}
                                        value={emojiCount}
                                        onChange={e => setEmojiCount(parseInt(e.target.value))}
                                        disabled={isGeneratingEmoji}
                                        className="flex-1 accent-yellow-400"
                                    />
                                    <span className="text-sm font-mono text-yellow-400 w-8 text-center">{emojiCount}</span>
                                </div>
                                <p className="text-[10px] text-neutral-600 mt-1.5">自由选择 1-16 张，AI 自动排版</p>
                            </div>

                        </div>
                    </div>
                    {renderSaveFeedback()}
                </div>
            );
        }

        // --- Sub-render: 自由拼贴 (COLLAGE, default) ---
        return (
            <div className="remuse-studio h-full bg-remuse-dark text-white flex flex-col">
                {/* Canvas Header */}
                <div className="p-4 border-b border-neutral-800 bg-remuse-panel flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={handleReturnFromCanvas} className="text-neutral-500 hover:text-white">
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
                <div className="flex-1 overflow-y-auto xl:overflow-hidden relative flex items-center justify-center p-4 md:p-8 pb-[calc(env(safe-area-inset-bottom)+5rem)] xl:pb-8 bg-[#111]">
                    <div 
                        ref={canvasRef}
                        onMouseMove={handleMouseMove}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        className={`
                            relative w-full max-w-3xl aspect-[4/3] max-h-[56vh] xl:max-h-none bg-black shadow-2xl border border-neutral-800 overflow-hidden
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
                                    w-24 sm:w-32 md:w-48 transition-transform duration-300 ease-out select-none
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
            {renderSaveFeedback()}
            </div>
        );
    }

    // --- RENDER: LIBRARY MODE ---
    return (
        <div data-testid="results-library" className="h-full bg-remuse-dark text-white p-6 md:p-10 overflow-y-auto pb-32">
            {/* Header */}
            <div className="flex flex-col xl:flex-row xl:items-end justify-between mb-10 gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        {onExit ? (
                            <button
                                type="button"
                                onClick={onExit}
                                aria-label="返回再生工坊"
                                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-neutral-800 bg-neutral-950 text-neutral-400 transition-colors hover:border-neutral-600 hover:text-white"
                            >
                                <X size={18} />
                            </button>
                        ) : null}
                        <h1 className="text-4xl font-bold font-display tracking-tight flex items-center gap-3">
                        <StickerIcon size={36} className="text-remuse-accent" />
                        {headerTitle}
                        </h1>
                    </div>
                    <p className="mt-2 text-neutral-500 text-sm">
                        {headerDescription}
                    </p>
                </div>
                
                {/* Action Area */}
                <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-end gap-3">
                    <div className="flex items-center gap-2 px-4 py-2 bg-neutral-900 border border-neutral-800 rounded-full">
                        <Box size={16} className="text-neutral-500" />
                        <span className="text-sm font-mono text-white">{libraryStats.count} {libraryStats.label}</span>
                    </div>
                    
                    {/* Toggle Selection Mode Button */}
                    {showLayoutModeToggle && libraryTab === 'STICKERS' && (
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
                    )}
                </div>
            </div>

            {/* Library Tab Toggle: 贴纸库 / 表情包库 */}
            <div className="mb-6 flex flex-wrap gap-2">
                <button
                    onClick={() => { setLibraryTab('STICKERS'); setIsSelectionMode(false); setSelectedIds(new Set()); }}
                    data-testid="results-tab-stickers"
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-display text-sm font-bold border transition-all
                        ${libraryTab === 'STICKERS'
                            ? 'bg-remuse-accent text-black border-remuse-accent'
                            : 'bg-transparent text-neutral-400 border-neutral-700 hover:border-neutral-500 hover:text-white'}
                    `}
                >
                    <StickerIcon size={16} />
                    贴纸库
                    <span className="text-xs opacity-70">({regularStickers.length})</span>
                </button>
                <button
                    onClick={() => { setLibraryTab('EMOJI_PACKS'); setIsSelectionMode(false); setSelectedIds(new Set()); }}
                    data-testid="results-tab-emoji-packs"
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-display text-sm font-bold border transition-all
                        ${libraryTab === 'EMOJI_PACKS'
                            ? 'bg-gradient-to-r from-yellow-400 to-orange-400 text-black border-yellow-400'
                            : 'bg-transparent text-neutral-400 border-neutral-700 hover:border-neutral-500 hover:text-white'}
                    `}
                >
                    <Smile size={16} />
                    表情包库
                    <span className="text-xs opacity-70">({emojiPacks.length})</span>
                </button>
                <button
                    onClick={() => { setLibraryTab('PERLER_PATTERNS'); setIsSelectionMode(false); setSelectedIds(new Set()); }}
                    data-testid="results-tab-perler-patterns"
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-display text-sm font-bold border transition-all
                        ${libraryTab === 'PERLER_PATTERNS'
                            ? 'bg-gradient-to-r from-cyan-300 to-violet-400 text-black border-cyan-300'
                            : 'bg-transparent text-neutral-400 border-neutral-700 hover:border-neutral-500 hover:text-white'}
                    `}
                >
                    <Box size={16} />
                    拼豆库
                    <span className="text-xs opacity-70">({perlerPatterns.length})</span>
                </button>
                <button
                    onClick={() => { setLibraryTab('JOURNALS'); setIsSelectionMode(false); setSelectedIds(new Set()); }}
                    data-testid="results-tab-journals"
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-display text-sm font-bold border transition-all
                        ${libraryTab === 'JOURNALS'
                            ? 'bg-gradient-to-r from-cyan-300 to-sky-500 text-black border-cyan-300'
                            : 'bg-transparent text-neutral-400 border-neutral-700 hover:border-neutral-500 hover:text-white'}
                    `}
                >
                    <Scissors size={16} />
                    手账库
                    <span className="text-xs opacity-70">({safeJournals.length})</span>
                </button>
                <button
                    onClick={() => { setLibraryTab('TRANSFORMATION_GUIDES'); setIsSelectionMode(false); setSelectedIds(new Set()); }}
                    data-testid="results-tab-guides"
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-display text-sm font-bold border transition-all
                        ${libraryTab === 'TRANSFORMATION_GUIDES'
                            ? 'bg-gradient-to-r from-remuse-accent to-remuse-secondary text-black border-remuse-accent'
                            : 'bg-transparent text-neutral-400 border-neutral-700 hover:border-neutral-500 hover:text-white'}
                    `}
                >
                    <BookImage size={16} />
                    改造指南
                    <span className="text-xs opacity-70">({safeGuides.length})</span>
                </button>
            </div>

            {libraryTab === 'TRANSFORMATION_GUIDES' && (
                <>
                    {safeGuides.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-neutral-800 rounded-lg">
                            <div className="w-16 h-16 rounded-2xl bg-remuse-accent/10 border border-remuse-accent/20 flex items-center justify-center mb-4">
                                <BookImage size={28} className="text-remuse-accent" />
                            </div>
                            <p className="text-neutral-400 font-display mb-2">暂无综合改造指南</p>
                            <p className="text-xs text-neutral-600 text-center max-w-xs">
                                从再生工坊选择 1 件或多件藏品生成综合改造指南，生成完成后会自动保存到这里。
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                            {safeGuides.map((guide) => (
                                <button
                                    key={guide.id}
                                    type="button"
                                    onClick={() => onOpenGuide?.(guide)}
                                    className="group overflow-hidden rounded-[24px] border border-neutral-800 bg-neutral-900 text-left transition-all hover:border-remuse-accent/40 hover:-translate-y-0.5"
                                >
                                    <div className="aspect-[4/3] overflow-hidden bg-black/30">
                                        {guide.imageUrl ? (
                                            <img
                                                src={guide.imageUrl}
                                                alt={guide.title}
                                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                                            />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center text-neutral-500">
                                                <BookImage size={28} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-3 p-5">
                                        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.24em] text-remuse-accent">
                                            <BookImage size={13} />
                                            Guide
                                        </div>
                                        <div>
                                            <h3 className="font-display text-xl font-bold text-white">{guide.title}</h3>
                                            <p className="mt-2 line-clamp-3 text-sm leading-7 text-neutral-400">{guide.summary}</p>
                                        </div>
                                        <div className="flex flex-wrap gap-3 text-xs text-neutral-500">
                                            <span>来源藏品 {guide.sourceItems.length}</span>
                                            <span>{new Date(guide.dateCreated).toLocaleDateString('zh-CN')}</span>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* ===== 表情包库 Tab ===== */}
            {libraryTab === 'EMOJI_PACKS' && (
                <>
                    {emojiPacks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-neutral-800 rounded-lg">
                            <div className="text-5xl mb-4">😄 😂 🥹</div>
                            <p className="text-neutral-400 font-display mb-2">暂无表情包</p>
                            <p className="text-xs text-neutral-600 text-center max-w-xs">
                                从再生工坊选择藏品进入表情包工坊，生成后点击「存入表情包库」
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {emojiPacks.map(pack => (
                                <div key={pack.id} className="relative group bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden hover:border-yellow-400/30 transition-all">
                                    {/* Action Buttons */}
                                    <div className="absolute top-3 right-3 flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10">
                                        <button
                                            onClick={async () => {
                                                await runSaveAction(() => persistImageUrlToDevice(pack.stickerImageUrl, `remuse-emoji-pack-${pack.id}.png`));
                                            }}
                                            className="p-2 bg-neutral-800/90 text-white hover:text-green-400 rounded-lg border border-neutral-700 backdrop-blur-sm"
                                            title="保存到相册"
                                        >
                                            <Download size={14} />
                                        </button>
                                        <button
                                            onClick={() => onDeleteSticker(pack.id)}
                                            className="p-2 bg-neutral-800/90 text-white hover:text-red-400 rounded-lg border border-neutral-700 backdrop-blur-sm"
                                            title="删除"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    {/* Image */}
                                    <div className="p-3">
                                        <img
                                            src={pack.stickerImageUrl}
                                            alt="表情包"
                                            className="w-full h-auto rounded-lg"
                                            style={{ imageRendering: 'auto' }}
                                        />
                                    </div>
                                    {/* Info */}
                                    <div className="px-4 pb-4">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Smile size={14} className="text-yellow-400" />
                                            <span className="text-xs font-display text-neutral-400">
                                                {new Date(pack.dateCreated).toLocaleDateString('zh-CN')}
                                            </span>
                                        </div>
                                        {pack.dramaText && (
                                            <p className="text-xs text-neutral-500 line-clamp-1">{pack.dramaText}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* ===== 拼豆库 Tab ===== */}
            {libraryTab === 'PERLER_PATTERNS' && (
                <>
                    {perlerPatterns.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-neutral-800 rounded-lg">
                            <div className="w-16 h-16 rounded-2xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center mb-4">
                                <Box size={28} className="text-cyan-300" />
                            </div>
                            <p className="text-neutral-400 font-display mb-2">暂无拼豆图纸</p>
                            <p className="text-xs text-neutral-600 text-center max-w-xs">
                                从再生工坊选择单件藏品进入拼豆图纸工坊，生成完成后会自动存入拼豆库
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {perlerPatterns.map((pattern) => (
                                <div
                                    key={pattern.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => handleOpenPerlerPatternCard(pattern)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            handleOpenPerlerPatternCard(pattern);
                                        }
                                    }}
                                    className="relative group bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden hover:border-cyan-300/30 transition-all text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-300/40"
                                >
                                    <div className="absolute top-3 right-3 flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10">
                                        <button
                                            onClick={async (event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                await runSaveAction(() => persistImageUrlToDevice(pattern.stickerImageUrl, `remuse-perler-pattern-${pattern.id}.png`));
                                            }}
                                            className="p-2 bg-neutral-800/90 text-white hover:text-cyan-300 rounded-lg border border-neutral-700 backdrop-blur-sm"
                                            title="保存到相册"
                                        >
                                            <Download size={14} />
                                        </button>
                                        <button
                                            onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                onDeleteSticker(pattern.id);
                                            }}
                                            className="p-2 bg-neutral-800/90 text-white hover:text-red-400 rounded-lg border border-neutral-700 backdrop-blur-sm"
                                            title="删除"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>

                                    <div className="p-3 bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950">
                                        <img
                                            src={pattern.stickerImageUrl}
                                            alt="拼豆图纸"
                                            className="w-full h-auto rounded-lg bg-white"
                                            style={{ imageRendering: 'auto' }}
                                        />
                                    </div>

                                    <div className="px-4 pb-4">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Box size={14} className="text-cyan-300" />
                                            <span className="text-xs font-display text-neutral-400">
                                                {new Date(pattern.dateCreated).toLocaleDateString('zh-CN')}
                                            </span>
                                        </div>
                                        {pattern.dramaText && (
                                            <p className="text-xs text-neutral-500 leading-relaxed line-clamp-2">{pattern.dramaText}</p>
                                        )}
                                        <p className="mt-3 text-[11px] font-display uppercase tracking-[0.22em] text-cyan-300/80">
                                            点击继续编辑拼豆图纸
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {libraryTab === 'JOURNALS' && (
                <>
                    {safeJournals.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-neutral-800 rounded-lg">
                            <div className="w-16 h-16 rounded-2xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center mb-4">
                                <Scissors size={28} className="text-cyan-300" />
                            </div>
                            <p className="text-neutral-400 font-display mb-2">暂无手账</p>
                            <p className="text-xs text-neutral-600 text-center max-w-xs">
                                在月历手账界面点击「存入手账库」，就能把当前排版保存到这里，并随时继续编辑。
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {safeJournals.map((journal) => (
                                <div
                                    key={journal.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => restoreLayoutItemsFromJournal(journal)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            restoreLayoutItemsFromJournal(journal);
                                        }
                                    }}
                                    className="group relative overflow-hidden rounded-[24px] border border-neutral-800 bg-neutral-900 text-left transition-all hover:-translate-y-0.5 hover:border-cyan-300/30"
                                >
                                    <div className="absolute top-3 right-3 flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10">
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                void runSaveAction(() => persistImageUrlToDevice(journal.previewImageUrl, `remuse-journal-${journal.id}.png`));
                                            }}
                                            className="p-2 bg-neutral-800/90 text-white hover:text-cyan-300 rounded-lg border border-neutral-700 backdrop-blur-sm"
                                            title="保存到相册"
                                        >
                                            <Download size={14} />
                                        </button>
                                        {onDeleteJournal ? (
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    void onDeleteJournal(journal.id);
                                                }}
                                                className="p-2 bg-neutral-800/90 text-white hover:text-red-400 rounded-lg border border-neutral-700 backdrop-blur-sm"
                                                title="删除"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        ) : null}
                                    </div>

                                    <div className="aspect-[4/5] overflow-hidden bg-[#111]">
                                        {journal.previewImageUrl ? (
                                            <img
                                                src={journal.previewImageUrl}
                                                alt={journal.title}
                                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                                            />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center text-neutral-500">
                                                <Scissors size={28} />
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-3 p-5">
                                        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.24em] text-cyan-300">
                                            <Scissors size={13} />
                                            Journal
                                        </div>
                                        <div>
                                            <h3 className="font-display text-xl font-bold text-white">{journal.title}</h3>
                                            <p className="mt-2 text-sm text-neutral-400">
                                                {journal.year} / {String(journal.month).padStart(2, '0')} · 点击继续编辑原排版
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-3 text-xs text-neutral-500">
                                            <span>{journal.layoutItems.length} 张贴纸</span>
                                            <span>{new Date(journal.updatedAt || journal.dateCreated).toLocaleDateString('zh-CN')}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* ===== 贴纸库 Tab ===== */}
            {libraryTab === 'STICKERS' && (
                <>
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
                <div className="mb-6 animate-fade-in">
                    {/* Selection counter */}
                    <div className="flex items-center gap-3 mb-4">
                        <div className="flex items-center gap-2 px-4 py-2 bg-remuse-accent/15 border border-remuse-accent/40 rounded-full">
                            <CheckCircle2 size={15} className="text-remuse-accent" />
                            <span className="text-sm font-display font-bold text-white">
                                已选 <span className="text-remuse-accent">{selectedIds.size}</span> 张
                            </span>
                        </div>
                        <div className="flex gap-1">
                            {Array.from({ length: 9 }).map((_, i) => (
                                <div key={i} className={`w-2 h-2 rounded-full transition-all duration-300 ${i < selectedIds.size ? 'bg-remuse-accent scale-110' : 'bg-neutral-800'}`} />
                            ))}
                        </div>
                        <span className="text-xs text-neutral-600 font-display">最多 9 张</span>
                    </div>

                    {/* Mode Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                        {/* 小红书配图 */}
                        <button
                            onClick={() => enterCanvasMode('XIAOHONGSHU')}
                            disabled={selectedIds.size === 0}
                            className={`group relative p-5 rounded-2xl text-left transition-all duration-200 overflow-hidden
                                ${selectedIds.size > 0
                                    ? 'cursor-pointer hover:scale-[1.03] hover:-translate-y-0.5 active:scale-[0.98]'
                                    : 'opacity-35 cursor-not-allowed'}
                            `}
                            style={{ background: selectedIds.size > 0 ? 'linear-gradient(135deg, rgba(244,114,182,0.12) 0%, rgba(251,146,60,0.08) 100%)' : 'rgba(255,255,255,0.03)', border: selectedIds.size > 0 ? '1px solid rgba(244,114,182,0.25)' : '1px solid rgba(255,255,255,0.06)' }}
                        >
                            {selectedIds.size > 0 && <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" style={{ background: 'linear-gradient(135deg, rgba(244,114,182,0.08) 0%, rgba(251,146,60,0.06) 100%)' }} />}
                            <div className="relative">
                                <div className="w-11 h-11 rounded-xl mb-3 flex items-center justify-center text-white shadow-lg" style={{ background: 'linear-gradient(135deg, #ec4899 0%, #f97316 100%)', boxShadow: selectedIds.size > 0 ? '0 4px 20px rgba(236,72,153,0.35)' : 'none' }}>
                                    <BookImage size={20} />
                                </div>
                                <p className="font-display font-bold text-sm text-white mb-1">小红书配图</p>
                                <p className="text-[11px] text-neutral-500 leading-relaxed">固定 3:4，4 款可直接发的小红书创意卡片</p>
                            </div>
                        </button>

                        {/* 手账贴纸 */}
                        <button
                            onClick={() => enterCanvasMode('PRINT')}
                            disabled={selectedIds.size === 0}
                            className={`group relative p-5 rounded-2xl text-left transition-all duration-200 overflow-hidden
                                ${selectedIds.size > 0
                                    ? 'cursor-pointer hover:scale-[1.03] hover:-translate-y-0.5 active:scale-[0.98]'
                                    : 'opacity-35 cursor-not-allowed'}
                            `}
                            style={{ background: selectedIds.size > 0 ? 'linear-gradient(135deg, rgba(34,211,238,0.12) 0%, rgba(59,130,246,0.08) 100%)' : 'rgba(255,255,255,0.03)', border: selectedIds.size > 0 ? '1px solid rgba(34,211,238,0.25)' : '1px solid rgba(255,255,255,0.06)' }}
                        >
                            {selectedIds.size > 0 && <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.08) 0%, rgba(59,130,246,0.06) 100%)' }} />}
                            <div className="relative">
                                <div className="w-11 h-11 rounded-xl mb-3 flex items-center justify-center text-white shadow-lg" style={{ background: 'linear-gradient(135deg, #22d3ee 0%, #3b82f6 100%)', boxShadow: selectedIds.size > 0 ? '0 4px 20px rgba(34,211,238,0.35)' : 'none' }}>
                                    <Scissors size={20} />
                                </div>
                                <p className="font-display font-bold text-sm text-white mb-1">月历手账</p>
                                <p className="text-[11px] text-neutral-500 leading-relaxed">上传背景，自由排版后导出打印</p>
                            </div>
                        </button>

                        {/* 自由拼贴 */}
                        <button
                            onClick={() => enterCanvasMode('COLLAGE')}
                            disabled={selectedIds.size === 0}
                            className={`group relative p-5 rounded-2xl text-left transition-all duration-200 overflow-hidden
                                ${selectedIds.size > 0
                                    ? 'cursor-pointer hover:scale-[1.03] hover:-translate-y-0.5 active:scale-[0.98]'
                                    : 'opacity-35 cursor-not-allowed'}
                            `}
                            style={{ background: selectedIds.size > 0 ? 'linear-gradient(135deg, rgba(163,230,53,0.12) 0%, rgba(34,197,94,0.08) 100%)' : 'rgba(255,255,255,0.03)', border: selectedIds.size > 0 ? '1px solid rgba(163,230,53,0.25)' : '1px solid rgba(255,255,255,0.06)' }}
                        >
                            {selectedIds.size > 0 && <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" style={{ background: 'linear-gradient(135deg, rgba(163,230,53,0.08) 0%, rgba(34,197,94,0.06) 100%)' }} />}
                            <div className="relative">
                                <div className="w-11 h-11 rounded-xl mb-3 flex items-center justify-center text-black shadow-lg" style={{ background: 'linear-gradient(135deg, #a3e635 0%, #22c55e 100%)', boxShadow: selectedIds.size > 0 ? '0 4px 20px rgba(163,230,53,0.35)' : 'none' }}>
                                    <Layers size={20} />
                                </div>
                                <p className="font-display font-bold text-sm text-white mb-1">自由拼贴</p>
                                <p className="text-[11px] text-neutral-500 leading-relaxed">拖拽排版，透明背景</p>
                            </div>
                        </button>

                    </div>
                </div>
            )}

            {/* Grid */}
            {filteredStickers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-neutral-800 rounded-lg">
                    <StickerIcon size={48} className="text-neutral-500 mb-4" />
                    <p className="text-neutral-400 font-display">暂无贴纸</p>
                    <p className="text-xs text-neutral-400 mt-2">从再生工坊生成你的第一张贴纸</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredStickers.map(sticker => (
                        <StickerCard 
                            key={sticker.id} 
                            sticker={sticker} 
                            onDelete={() => onDeleteSticker(sticker.id)}
                            onSaveSticker={handleStickerCardSave}
                            selectable={isSelectionMode}
                            selected={selectedIds.has(sticker.id)}
                            onToggleSelect={() => handleSelectSticker(sticker.id)}
                        />
                    ))}
                </div>
            )}
                </>
            )}
        {renderSaveFeedback()}
        </div>
    );
};

export default StickerLibrary;
