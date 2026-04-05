import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, CheckCircle2, Download, Grid, Lock, Search, Unlock, X } from 'lucide-react';
import type {
  PerlerPatternCropModeValue,
  PerlerPatternSourceModeValue,
  PerlerPatternStudioSnapshot,
  Sticker,
} from '../../types';
import PerlerPatternCanvas from '../PerlerPatternCanvas';
import logger from '../../services/logger';
import {
  buildPerlerPatternCsv,
  drawPerlerPatternCanvas,
  generatePerlerPattern,
  getPerlerDisplayKey,
  getPerlerPaletteEntries,
  getPerlerPatternCanvasMetrics,
  perlerColorSystemOptions,
  rebuildPerlerPatternResult,
  type PerlerColorSystem,
  type PerlerPatternCropMode,
  type PerlerPatternMode,
  type PerlerPatternResult,
} from '../../services/perlerPattern';
import { PERLER_PATTERN_CATEGORY } from '../../shared/stickerCategories';

export interface PerlerPatternStudioProps {
  sourceStickers: Sticker[];
  preparedSourceSticker?: Sticker | null;
  prepareSourceError?: string | null;
  onBack: () => void;
  onPatternSaved?: (patternSticker: Sticker) => Promise<void> | void;
  initialSnapshot?: PerlerPatternStudioSnapshot | null;
  initialPatternSticker?: Sticker | null;
  onTaskNotice?: (
    tone: 'success' | 'error' | 'info',
    title: string,
    message: string,
  ) => void;
}

type Cell = { row: number; column: number };
type Rect = { startRow: number; endRow: number; startColumn: number; endColumn: number };
type Swatch = { key: string; color: string; displayKey: string };
type EditMode = 'inspect' | 'paint' | 'replace';
type PaletteMode = 'pattern' | 'full';

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
};

const rgbToHex = (rgb: { r: number; g: number; b: number } | null | undefined) =>
  rgb
    ? `#${[rgb.r, rgb.g, rgb.b].map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('')}`
    : null;

const sameCell = (left: Cell | null, right: Cell | null) =>
  !!left && !!right && left.row === right.row && left.column === right.column;

const cellRect = (cell: Cell): Rect => ({
  startRow: cell.row,
  endRow: cell.row,
  startColumn: cell.column,
  endColumn: cell.column,
});

const normalizeRect = (start: Cell, end: Cell): Rect => ({
  startRow: Math.min(start.row, end.row),
  endRow: Math.max(start.row, end.row),
  startColumn: Math.min(start.column, end.column),
  endColumn: Math.max(start.column, end.column),
});

const rectCellCount = (rect: Rect | null) =>
  !rect ? 0 : (rect.endRow - rect.startRow + 1) * (rect.endColumn - rect.startColumn + 1);

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;
const getModeLabel = (mode: PerlerPatternMode) => (mode === 'average' ? '平均取色' : '主色取样');

function sourceOverlayStyle(pattern: PerlerPatternResult | null, rect: Rect | null): React.CSSProperties | null {
  if (!pattern?.analysis || !rect) return null;
  const { sourceBounds, sourceWidth, sourceHeight } = pattern.analysis;
  const cellWidth = sourceBounds.width / pattern.columns;
  const cellHeight = sourceBounds.height / pattern.rows;
  return {
    left: `${((sourceBounds.left + rect.startColumn * cellWidth) / sourceWidth) * 100}%`,
    top: `${((sourceBounds.top + rect.startRow * cellHeight) / sourceHeight) * 100}%`,
    width: `${(((rect.endColumn - rect.startColumn + 1) * cellWidth) / sourceWidth) * 100}%`,
    height: `${(((rect.endRow - rect.startRow + 1) * cellHeight) / sourceHeight) * 100}%`,
  };
}

function getCellsOnLine(start: Cell, end: Cell): Cell[] {
  const cells: Cell[] = [];
  let x0 = start.column;
  let y0 = start.row;
  const x1 = end.column;
  const y1 = end.row;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let error = dx - dy;
  while (true) {
    cells.push({ row: y0, column: x0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = error * 2;
    if (e2 > -dy) {
      error -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      error += dx;
      y0 += sy;
    }
  }
  return cells;
}

function paintPattern(
  pattern: PerlerPatternResult,
  targets: Cell[],
  brushSize: 1 | 3,
  swatch: Swatch,
  lockedKeys: Set<string>,
) {
  const cells = pattern.cells.map((row) => row.map((cell) => ({ ...cell })));
  const radius = brushSize === 3 ? 1 : 0;
  let changed = false;
  for (const target of targets) {
    for (let row = target.row - radius; row <= target.row + radius; row += 1) {
      for (let column = target.column - radius; column <= target.column + radius; column += 1) {
        const current = cells[row]?.[column];
        if (
          !current ||
          lockedKeys.has(current.key) ||
          (current.key === swatch.key && current.color.toUpperCase() === swatch.color.toUpperCase())
        ) {
          continue;
        }
        cells[row][column] = { key: swatch.key, color: swatch.color };
        changed = true;
      }
    }
  }
  return changed ? rebuildPerlerPatternResult(pattern, cells) : null;
}

function replaceRect(
  pattern: PerlerPatternResult,
  rect: Rect,
  swatch: Swatch,
  lockedKeys: Set<string>,
) {
  const cells = pattern.cells.map((row) => row.map((cell) => ({ ...cell })));
  let changed = false;
  for (let row = rect.startRow; row <= rect.endRow; row += 1) {
    for (let column = rect.startColumn; column <= rect.endColumn; column += 1) {
      const current = cells[row]?.[column];
      if (
        !current ||
        lockedKeys.has(current.key) ||
        (current.key === swatch.key && current.color.toUpperCase() === swatch.color.toUpperCase())
      ) {
        continue;
      }
      cells[row][column] = { key: swatch.key, color: swatch.color };
      changed = true;
    }
  }
  return changed ? rebuildPerlerPatternResult(pattern, cells) : null;
}

function createPatternSticker(
  sourceSticker: Sticker,
  pattern: PerlerPatternResult,
  sourceMode: PerlerPatternSourceModeValue,
  sourceUrls: { original: string; prepared: string | null },
  options: { colorSystem: PerlerColorSystem; previewCellSize: number; showCellCodes: boolean },
  exportCanvas: HTMLCanvasElement,
): Sticker {
  return {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    originalItemId: sourceSticker.originalItemId,
    stickerImageUrl: exportCanvas.toDataURL('image/png'),
    dramaText: `拼豆图纸 · ${sourceSticker.dramaText || '未命名素材'}`,
    category: PERLER_PATTERN_CATEGORY,
    dateCreated: new Date().toISOString(),
    metadata: {
      perlerPatternSnapshot: {
        sourceSticker: {
          id: sourceSticker.id,
          originalItemId: sourceSticker.originalItemId,
          stickerImageUrl: sourceUrls.original,
          originalImageUrl: sourceUrls.original,
          preparedImageUrl: sourceUrls.prepared || undefined,
          dramaText: sourceSticker.dramaText,
          category: sourceSticker.category,
          dateCreated: sourceSticker.dateCreated,
        },
        pattern: {
          columns: pattern.columns,
          rows: pattern.rows,
          totalBeads: pattern.totalBeads,
          colorCounts: pattern.colorCounts.map((item) => ({ ...item })),
          cells: pattern.cells.map((row) => row.map((cell) => ({ ...cell }))),
          settings: { ...pattern.settings },
        },
        options: {
          columns: pattern.settings.columns,
          similarityThreshold: pattern.settings.similarityThreshold,
          mode: pattern.settings.mode,
          sourceMode,
          transparentThreshold: pattern.settings.transparentThreshold,
          cropMode: pattern.settings.cropMode,
          edgeBias: pattern.settings.edgeBias,
          colorSystem: options.colorSystem,
          previewCellSize: options.previewCellSize,
          showCellCodes: options.showCellCodes,
        },
      },
    },
  };
}

function restorePattern(snapshot: PerlerPatternStudioSnapshot | null): PerlerPatternResult | null {
  if (!snapshot?.pattern) return null;
  return rebuildPerlerPatternResult(
    {
      columns: snapshot.pattern.columns,
      rows: snapshot.pattern.rows,
      totalBeads: snapshot.pattern.totalBeads,
      colorCounts: snapshot.pattern.colorCounts.map((item) => ({ ...item })),
      cells: snapshot.pattern.cells.map((row) => row.map((cell) => ({ ...cell }))),
      settings: {
        columns: snapshot.pattern.settings.columns,
        similarityThreshold: snapshot.pattern.settings.similarityThreshold,
        mode: snapshot.pattern.settings.mode,
        transparentThreshold: snapshot.pattern.settings.transparentThreshold,
        cropMode: snapshot.pattern.settings.cropMode ?? snapshot.options.cropMode ?? 'content',
        edgeBias: snapshot.pattern.settings.edgeBias ?? snapshot.options.edgeBias ?? 0,
      },
      quality: {
        score: 0,
        edgeRetention: null,
        isolatedBeads: 0,
        isolatedRatio: 0,
        fragmentCount: 0,
        fragmentationRatio: 0,
        warnings: [],
      },
    },
    snapshot.pattern.cells.map((row) => row.map((cell) => ({ ...cell }))),
  );
}
export default function PerlerPatternStudioV2(props: PerlerPatternStudioProps): React.ReactElement | null {
  const {
    sourceStickers,
    preparedSourceSticker = null,
    prepareSourceError = null,
    onBack,
    onPatternSaved,
    initialSnapshot = null,
    onTaskNotice,
  } = props;

  const sourceSticker =
    (initialSnapshot?.sourceSticker as Sticker | undefined) ?? sourceStickers[0] ?? null;
  const sourceUrls = useMemo(
    () => ({
      original:
        initialSnapshot?.sourceSticker.originalImageUrl ??
        (sourceSticker as (Sticker & { originalImageUrl?: string }) | null)?.originalImageUrl ??
        sourceSticker?.stickerImageUrl ??
        '',
      prepared:
        initialSnapshot?.sourceSticker.preparedImageUrl ??
        (sourceSticker as (Sticker & { preparedImageUrl?: string }) | null)?.preparedImageUrl ??
        preparedSourceSticker?.stickerImageUrl ??
        null,
    }),
    [
      initialSnapshot?.sourceSticker.originalImageUrl,
      initialSnapshot?.sourceSticker.preparedImageUrl,
      preparedSourceSticker?.stickerImageUrl,
      sourceSticker,
    ],
  );

  const initialPattern = useMemo(() => restorePattern(initialSnapshot), [initialSnapshot]);
  const [pattern, setPattern] = useState<PerlerPatternResult | null>(initialPattern);
  const [columns, setColumns] = useState(initialSnapshot?.options.columns ?? initialPattern?.settings.columns ?? 48);
  const [similarityThreshold, setSimilarityThreshold] = useState(initialSnapshot?.options.similarityThreshold ?? initialPattern?.settings.similarityThreshold ?? 30);
  const [mode, setMode] = useState<PerlerPatternMode>(initialSnapshot?.options.mode ?? initialPattern?.settings.mode ?? 'dominant');
  const [sourceMode, setSourceMode] = useState<PerlerPatternSourceModeValue>(initialSnapshot?.options.sourceMode ?? 'original');
  const [transparentThreshold, setTransparentThreshold] = useState(initialSnapshot?.options.transparentThreshold ?? initialPattern?.settings.transparentThreshold ?? 128);
  const [cropMode, setCropMode] = useState<PerlerPatternCropMode>((initialSnapshot?.options.cropMode as PerlerPatternCropMode | undefined) ?? initialPattern?.settings.cropMode ?? 'content');
  const [edgeBias, setEdgeBias] = useState(initialSnapshot?.options.edgeBias ?? initialPattern?.settings.edgeBias ?? 0);
  const [colorSystem, setColorSystem] = useState<PerlerColorSystem>(initialSnapshot?.options.colorSystem ?? 'MARD');
  const [previewCellSize, setPreviewCellSize] = useState(initialSnapshot?.options.previewCellSize ?? 22);
  const [showCellCodes, setShowCellCodes] = useState(initialSnapshot?.options.showCellCodes ?? true);
  const [legendSearch, setLegendSearch] = useState('');
  const [highlightColor, setHighlightColor] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<Cell | null>(null);
  const [hoveredCell, setHoveredCell] = useState<Cell | null>(null);
  const [selectionRect, setSelectionRect] = useState<Rect | null>(null);
  const [editMode, setEditMode] = useState<EditMode>('inspect');
  const [brushSize, setBrushSize] = useState<1 | 3>(1);
  const [paintSwatch, setPaintSwatch] = useState<Swatch | null>(null);
  const [lockedKeys, setLockedKeys] = useState<string[]>([]);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>('full');
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [undoStack, setUndoStack] = useState<PerlerPatternResult[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [saveStatusTone, setSaveStatusTone] = useState<'success' | 'error'>('success');
  const generatedPatternRef = useRef<PerlerPatternResult | null>(initialPattern);
  const patternRef = useRef<PerlerPatternResult | null>(initialPattern);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tokenRef = useRef(0);
  const pointerStateRef = useRef<{
    pointerId: number | null;
    mode: EditMode | null;
    anchor: Cell | null;
    lastPaintCell: Cell | null;
    undoPushed: boolean;
  }>({ pointerId: null, mode: null, anchor: null, lastPaintCell: null, undoPushed: false });

  const activeSourceUrl =
    sourceMode === 'prepared' && sourceUrls.prepared ? sourceUrls.prepared : sourceUrls.original;
  const lockedKeySet = useMemo(() => new Set(lockedKeys), [lockedKeys]);
  const paletteEntries = useMemo(() => {
    const keyword = legendSearch.trim().toLowerCase();
    return getPerlerPaletteEntries(pattern, colorSystem)
      .filter((entry) => paletteMode === 'full' || entry.count > 0)
      .filter(
        (entry) =>
          !keyword ||
          entry.displayKey.toLowerCase().includes(keyword) ||
          entry.color.toLowerCase().includes(keyword) ||
          entry.key.toLowerCase().includes(keyword),
      )
      .sort((left, right) => {
        if (left.inPattern !== right.inPattern) {
          return left.inPattern ? -1 : 1;
        }
        return paletteMode === 'pattern'
          ? right.count - left.count || left.displayKey.localeCompare(right.displayKey)
          : left.displayKey.localeCompare(right.displayKey);
      });
  }, [colorSystem, legendSearch, paletteMode, pattern]);

  const selectedInfo = selectedCell && pattern ? pattern.cells[selectedCell.row]?.[selectedCell.column] : null;
  const selectedSourceColor = selectedCell && pattern?.analysis?.representativeGrid ? pattern.analysis.representativeGrid[selectedCell.row]?.[selectedCell.column] ?? null : null;
  const selectedError = selectedCell && pattern?.analysis?.errorGrid ? pattern.analysis.errorGrid[selectedCell.row]?.[selectedCell.column] ?? null : null;
  const hoveredError = hoveredCell && pattern?.analysis?.errorGrid ? pattern.analysis.errorGrid[hoveredCell.row]?.[hoveredCell.column] ?? null : null;
  const selectedStyle = sourceOverlayStyle(pattern, selectedCell ? cellRect(selectedCell) : null);
  const hoveredStyle = sourceOverlayStyle(pattern, hoveredCell && !sameCell(hoveredCell, selectedCell) ? cellRect(hoveredCell) : null);
  const selectionStyle = sourceOverlayStyle(pattern, selectionRect);

  useEffect(() => {
    patternRef.current = pattern;
  }, [pattern]);

  useEffect(() => {
    if (!saveStatus) return undefined;
    const timer = window.setTimeout(() => setSaveStatus(''), 2200);
    return () => window.clearTimeout(timer);
  }, [saveStatus]);

  useEffect(() => {
    generatedPatternRef.current = initialPattern;
    patternRef.current = initialPattern;
    setPattern(initialPattern);
    setUndoStack([]);
    setSelectedCell(null);
    setHoveredCell(null);
    setSelectionRect(null);
  }, [initialPattern]);

  useEffect(() => {
    if (!sourceSticker || !activeSourceUrl) return undefined;
    const token = tokenRef.current + 1;
    tokenRef.current = token;
    setIsGenerating(true);
    setError('');
    const timer = window.setTimeout(async () => {
      try {
        const next = await generatePerlerPattern(activeSourceUrl, {
          columns,
          similarityThreshold,
          mode,
          transparentThreshold,
          cropMode,
          edgeBias,
        });
        if (tokenRef.current !== token) return;
        generatedPatternRef.current = next;
        patternRef.current = next;
        setPattern(next);
        setUndoStack([]);
        setSelectedCell(null);
        setHoveredCell(null);
        setSelectionRect(null);
      } catch (generationError) {
        logger.error('Perler generation failed:', generationError);
        if (tokenRef.current === token) {
          setError(generationError instanceof Error ? generationError.message : '拼豆图纸生成失败。');
        }
      } finally {
        if (tokenRef.current === token) setIsGenerating(false);
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [activeSourceUrl, columns, cropMode, edgeBias, mode, similarityThreshold, sourceSticker, transparentThreshold]);

  const commitPattern = (nextPattern: PerlerPatternResult) => {
    patternRef.current = nextPattern;
    setPattern(nextPattern);
  };

  const pushUndoSnapshot = (snapshot: PerlerPatternResult) => {
    setUndoStack((current) => [snapshot, ...current].slice(0, 24));
  };

  const resetPointerState = () => {
    pointerStateRef.current = { pointerId: null, mode: null, anchor: null, lastPaintCell: null, undoPushed: false };
  };

  const getCanvasCellFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): Cell | null => {
    const currentPattern = patternRef.current;
    if (!currentPattern || !canvasRef.current) return null;
    const metrics = getPerlerPatternCanvasMetrics(currentPattern, { cellSize: previewCellSize });
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * metrics.contentWidth - metrics.leftGutter;
    const y = ((event.clientY - rect.top) / rect.height) * metrics.contentHeight - metrics.headerHeight;
    return x < 0 || y < 0 || x >= metrics.gridWidth || y >= metrics.gridHeight
      ? null
      : { row: Math.floor(y / metrics.cellSize), column: Math.floor(x / metrics.cellSize) };
  };

  const applyPaintTargets = (targets: Cell[], shouldPushUndo: boolean) => {
    const currentPattern = patternRef.current;
    if (!currentPattern || !paintSwatch) return;
    const nextPattern = paintPattern(currentPattern, targets, brushSize, paintSwatch, lockedKeySet);
    if (!nextPattern) return;
    if (shouldPushUndo) pushUndoSnapshot(currentPattern);
    commitPattern(nextPattern);
  };

  const applySelectionReplace = () => {
    const currentPattern = patternRef.current;
    if (!currentPattern || !selectionRect || !paintSwatch) return;
    const nextPattern = replaceRect(currentPattern, selectionRect, paintSwatch, lockedKeySet);
    if (!nextPattern) return;
    pushUndoSnapshot(currentPattern);
    commitPattern(nextPattern);
    setSelectedCell({ row: selectionRect.startRow, column: selectionRect.startColumn });
  };

  const handlePointerDown: React.PointerEventHandler<HTMLCanvasElement> = (event) => {
    const cell = getCanvasCellFromEvent(event);
    if (!cell) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setHoveredCell(cell);
    setSelectedCell(cell);
    if (editMode === 'paint') {
      pointerStateRef.current = { pointerId: event.pointerId, mode: 'paint', anchor: null, lastPaintCell: cell, undoPushed: false };
      const before = patternRef.current;
      applyPaintTargets([cell], true);
      if (before !== patternRef.current) pointerStateRef.current.undoPushed = true;
      return;
    }
    if (editMode === 'replace') {
      pointerStateRef.current = { pointerId: event.pointerId, mode: 'replace', anchor: cell, lastPaintCell: null, undoPushed: false };
      setSelectionRect(normalizeRect(cell, cell));
      return;
    }
    pointerStateRef.current = { pointerId: event.pointerId, mode: 'inspect', anchor: cell, lastPaintCell: null, undoPushed: false };
  };

  const handlePointerMove: React.PointerEventHandler<HTMLCanvasElement> = (event) => {
    const cell = getCanvasCellFromEvent(event);
    setHoveredCell(cell);
    if (!cell) return;
    const drag = pointerStateRef.current;
    if (drag.mode === 'paint' && drag.lastPaintCell && paintSwatch && !sameCell(drag.lastPaintCell, cell)) {
      const before = patternRef.current;
      applyPaintTargets(getCellsOnLine(drag.lastPaintCell, cell), !drag.undoPushed);
      if (!drag.undoPushed && before !== patternRef.current) drag.undoPushed = true;
      drag.lastPaintCell = cell;
      setSelectedCell(cell);
      return;
    }
    if (drag.mode === 'replace' && drag.anchor) {
      setSelectionRect(normalizeRect(drag.anchor, cell));
      setSelectedCell(cell);
    }
  };

  const handlePointerUp: React.PointerEventHandler<HTMLCanvasElement> = (event) => {
    if (pointerStateRef.current.pointerId === event.pointerId) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {}
    }
    resetPointerState();
  };

  const handlePointerLeave: React.PointerEventHandler<HTMLCanvasElement> = () => {
    if (pointerStateRef.current.pointerId === null) setHoveredCell(null);
  };

  if (!sourceSticker) return null;

  const summaryText = pattern
    ? `${pattern.columns} × ${pattern.rows} · ${pattern.totalBeads} 颗拼豆 · ${pattern.colorCounts.length} 种颜色 · ${getModeLabel(pattern.settings.mode)}`
    : '';
  const statCards = [
    ['质量评分', pattern?.quality.score !== undefined ? `${pattern.quality.score}/100` : '--'],
    ['轮廓保留', pattern?.quality.edgeRetention === null || pattern?.quality.edgeRetention === undefined ? '无' : `${pattern.quality.edgeRetention}%`],
    ['平均色差', pattern?.analysis?.errorSummary?.averageDeltaE ?? '无'],
    ['热区格数', pattern?.analysis?.errorSummary ? `${pattern.analysis.errorSummary.hotCellCount} (${formatPercent(pattern.analysis.errorSummary.hotCellRatio)})` : '--'],
    ['孤立拼豆', pattern ? `${pattern.quality.isolatedBeads} (${formatPercent(pattern.quality.isolatedRatio)})` : '--'],
    ['碎片数量', pattern ? `${pattern.quality.fragmentCount} (${formatPercent(pattern.quality.fragmentationRatio)})` : '--'],
  ] as const;

  return (
    <div className="remuse-studio flex h-full flex-col bg-remuse-dark text-white">
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-800 bg-remuse-panel p-4">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-neutral-500 hover:text-white" aria-label="返回"><X size={24} /></button>
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-white font-display"><Box size={20} className="text-cyan-300" />拼豆图纸工作台</h2>
            <p className="mt-1 text-xs text-neutral-500">支持完整色卡精修、连续涂抹、框选替换和误差热力图。</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={async () => {
            if (!pattern || !onPatternSaved) return;
            try {
              const exportCanvas = document.createElement('canvas');
              drawPerlerPatternCanvas(exportCanvas, pattern, { cellSize: previewCellSize, displayColorSystem: colorSystem, showCellCodes, highlightColor: null });
              await onPatternSaved(createPatternSticker(sourceSticker, pattern, sourceMode, sourceUrls, { colorSystem, previewCellSize, showCellCodes }, exportCanvas));
              setSaveStatusTone('success');
              setSaveStatus('图纸已保存到再生成果库。');
              onTaskNotice?.('success', '拼豆图纸已保存', '这张拼豆图纸已经存入再生成果库，可以继续查看或导出。');
            } catch (saveError) {
              logger.error('Perler pattern save failed:', saveError);
              const message = saveError instanceof Error && saveError.message.trim()
                ? saveError.message
                : '服务器暂时没有完成保存，请稍后再试。';
              setSaveStatusTone('error');
              setSaveStatus(`保存失败：${message}`);
              onTaskNotice?.('error', '拼豆图纸保存失败', message);
            }
          }} disabled={!pattern || !onPatternSaved || isGenerating} className="flex items-center gap-2 rounded-full bg-gradient-to-r from-fuchsia-400 to-violet-400 px-5 py-2 text-sm font-bold text-white font-display disabled:opacity-50"><CheckCircle2 size={15} />保存</button>
          <button onClick={() => pattern && downloadBlob(new Blob([buildPerlerPatternCsv(pattern, colorSystem)], { type: 'text/csv;charset=utf-8;' }), `remuse-perler-pattern-${Date.now()}.csv`)} disabled={!pattern || isGenerating} className="flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-900 px-5 py-2 text-sm font-bold text-white font-display disabled:opacity-50"><Grid size={15} />导出 CSV</button>
          <button onClick={async () => {
            if (!pattern) return;
            const exportCanvas = document.createElement('canvas');
            drawPerlerPatternCanvas(exportCanvas, pattern, { cellSize: previewCellSize, displayColorSystem: colorSystem, showCellCodes, highlightColor: null });
            const blob = await new Promise<Blob | null>((resolve) => exportCanvas.toBlob(resolve, 'image/png'));
            if (blob) downloadBlob(blob, `remuse-perler-pattern-${Date.now()}.png`);
          }} disabled={!pattern || isGenerating} className="flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-300 to-blue-400 px-5 py-2 text-sm font-bold text-black font-display disabled:opacity-50"><Download size={15} />导出 PNG</button>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        <div className="flex-1 space-y-5 p-4 md:overflow-y-auto md:p-5">
          <div className="grid gap-4 xl:grid-cols-[0.86fr_1.14fr]">
            <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
              <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3"><span className="text-xs text-neutral-400 font-display">源图</span><span className="text-xs text-neutral-500">{sourceMode === 'original' ? '原图' : '预处理图'}</span></div>
              <div className="space-y-4 p-4">
                <div className="relative overflow-hidden rounded-xl border border-neutral-800 bg-black/20" style={{ aspectRatio: pattern?.analysis ? `${pattern.analysis.sourceWidth} / ${pattern.analysis.sourceHeight}` : '1 / 1' }}>
                  {activeSourceUrl ? <img src={activeSourceUrl} alt={sourceSticker.dramaText || '拼豆源图'} className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500">源图不可用。</div>}
                  {selectionStyle && <div className="absolute border-2 border-cyan-300/80 border-dashed bg-cyan-300/10" style={selectionStyle} />}
                  {selectedStyle && <div className="absolute border-2 border-cyan-300 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]" style={selectedStyle} />}
                  {hoveredStyle && <div className="absolute border-2 border-amber-300 bg-amber-300/10" style={hoveredStyle} />}
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs xl:grid-cols-3">{statCards.map(([label, value]) => <div key={label} className="rounded-xl border border-neutral-800 bg-black/20 p-3"><span className="mb-1 block text-neutral-500">{label}</span><span className="font-mono text-white">{value}</span></div>)}</div>
                <div className="space-y-2 rounded-xl border border-neutral-800 bg-black/20 p-3"><div className="flex items-center justify-between text-[11px] text-neutral-500"><span>误差热力图</span><span>{showHeatmap ? '显示中' : '已隐藏'}</span></div><div className="h-2 rounded-full bg-gradient-to-r from-emerald-300 via-amber-300 to-rose-500" /><div className="flex items-center justify-between text-[11px] text-neutral-500"><span>误差低</span><span>误差高</span></div></div>
                {pattern?.quality.warnings?.length ? pattern.quality.warnings.map((warning) => <div key={warning} className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">{warning}</div>) : <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100">当前图纸已通过内置质量检查。</div>}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl">
              <div className="flex items-center justify-between border-b border-neutral-800 p-3"><span className="text-xs text-neutral-400 font-display">图纸预览</span><div className="flex items-center gap-3 text-xs text-neutral-500">{hoveredCell && hoveredError && <span>悬停 r{hoveredCell.row + 1} c{hoveredCell.column + 1} · 色差 {hoveredError.deltaE}</span>}{highlightColor && <span>颜色高亮中</span>}<span>{pattern?.columns ?? '--'} × {pattern?.rows ?? '--'}</span></div></div>
              <div className="overflow-auto p-5" style={{ background: 'linear-gradient(135deg, #101010 0%, #1a1a1a 100%)', minHeight: 'min(76vh, 920px)' }}>{pattern ? <div className="flex min-h-[620px] items-start justify-center rounded-2xl border border-neutral-800/80 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.06),_transparent_52%),linear-gradient(180deg,_rgba(255,255,255,0.04),_rgba(255,255,255,0.01))] p-4"><PerlerPatternCanvas pattern={pattern} canvasRef={canvasRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerLeave} title="RE-MUSE 拼豆图纸" summary={summaryText} cellSize={previewCellSize} highlightColor={highlightColor} displayColorSystem={colorSystem} showCellCodes={showCellCodes} selectedCell={selectedCell} hoveredCell={hoveredCell} selectionRect={selectionRect} showHeatmap={showHeatmap} className="mx-auto block w-auto max-w-full max-h-[72vh] touch-none rounded-xl bg-white shadow-[0_24px_60px_rgba(0,0,0,0.35)] cursor-crosshair" /></div> : <div className="flex min-h-[420px] items-center justify-center text-sm text-neutral-500">{isGenerating ? '正在生成图纸...' : '等待源图中。'}</div>}</div>
            </div>
          </div>

          {(selectedInfo || selectionRect) && <div className="grid gap-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4 lg:grid-cols-[140px_1fr]"><div className="h-[140px] w-[140px] rounded-xl border border-neutral-800 bg-black/30" style={activeSourceUrl && pattern?.analysis && (hoveredCell ?? selectedCell) ? { backgroundImage: `url("${activeSourceUrl}")`, backgroundRepeat: 'no-repeat', backgroundSize: `${pattern.analysis.sourceWidth * 4}px ${pattern.analysis.sourceHeight * 4}px`, backgroundPosition: `${70 - (pattern.analysis.sourceBounds.left + (pattern.analysis.sourceBounds.width / pattern.columns) * (((hoveredCell ?? selectedCell) as Cell).column + 0.5)) * 4}px ${70 - (pattern.analysis.sourceBounds.top + (pattern.analysis.sourceBounds.height / pattern.rows) * (((hoveredCell ?? selectedCell) as Cell).row + 0.5)) * 4}px` } : undefined} /><div className="flex flex-wrap content-start gap-3 text-sm">{selectedCell && <div className="rounded-xl border border-neutral-800 bg-black/20 px-3 py-2"><span className="mr-2 text-neutral-500">已选中</span><span className="font-mono">r{selectedCell.row + 1} c{selectedCell.column + 1}</span></div>}{selectedInfo && <div className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-black/20 px-3 py-2"><span className="h-4 w-4 rounded-sm border border-white/10" style={{ backgroundColor: selectedInfo.color }} /><span className="font-mono">{selectedInfo.isTransparent ? '透明' : getPerlerDisplayKey(selectedInfo.color, colorSystem)}</span><span className="text-neutral-500">{selectedInfo.color}</span></div>}{selectedSourceColor && <div className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-black/20 px-3 py-2"><span className="h-4 w-4 rounded-sm border border-white/10" style={{ backgroundColor: rgbToHex(selectedSourceColor) ?? '#FFFFFF' }} /><span className="text-neutral-500">源图均色</span><span className="font-mono text-neutral-100">{rgbToHex(selectedSourceColor)}</span></div>}{selectedError && <div className="rounded-xl border border-neutral-800 bg-black/20 px-3 py-2"><span className="mr-2 text-neutral-500">色差</span><span className="font-mono">dE {selectedError.deltaE}</span></div>}{selectionRect && <div className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-3 py-2"><span className="mr-2 text-cyan-100">框选区域</span><span className="font-mono">{rectCellCount(selectionRect)} 格</span></div>}{selectedInfo && <button onClick={() => setPaintSwatch({ key: selectedInfo.key, color: selectedInfo.color, displayKey: selectedInfo.isTransparent ? '透明' : getPerlerDisplayKey(selectedInfo.color, colorSystem) })} className="rounded-xl border border-neutral-700 px-3 py-2 text-neutral-200">吸取当前格颜色</button>}<button onClick={() => { if (!undoStack.length) return; const [previous, ...rest] = undoStack; patternRef.current = previous; setPattern(previous); setUndoStack(rest); }} disabled={!undoStack.length} className="rounded-xl border border-neutral-700 px-3 py-2 text-neutral-200 disabled:opacity-40">撤销</button><button onClick={() => { if (!generatedPatternRef.current) return; patternRef.current = generatedPatternRef.current; setPattern(generatedPatternRef.current); setUndoStack([]); setSelectionRect(null); }} disabled={!generatedPatternRef.current} className="rounded-xl border border-neutral-700 px-3 py-2 text-neutral-200 disabled:opacity-40">重置修改</button><button onClick={applySelectionReplace} disabled={!selectionRect || !paintSwatch} className="rounded-xl border border-cyan-300/40 bg-cyan-300/10 px-3 py-2 text-cyan-100 disabled:opacity-40">用当前颜色替换框选区域</button><button onClick={() => setSelectionRect(null)} disabled={!selectionRect} className="rounded-xl border border-neutral-700 px-3 py-2 text-neutral-200 disabled:opacity-40">清除框选</button></div></div>}

          {error && <p className="text-sm text-red-400">{error}</p>}
          {saveStatus && <p className={`text-sm ${saveStatusTone === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>{saveStatus}</p>}
        </div>
        <div className="w-full shrink-0 space-y-5 border-t border-neutral-800 bg-remuse-panel p-4 md:w-[380px] md:overflow-y-auto md:border-l md:border-t-0 md:p-5">
          <div className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4"><div className="flex items-center justify-between"><p className="text-xs uppercase tracking-wider text-neutral-400 font-display">源图模式</p><button onClick={() => setShowHeatmap((current) => !current)} className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold font-display ${showHeatmap ? 'border-cyan-300 bg-cyan-300 text-black' : 'border-neutral-700 bg-neutral-900 text-neutral-400'}`}>{showHeatmap ? '热图开启' : '热图关闭'}</button></div><div className="grid grid-cols-2 gap-2"><button onClick={() => setSourceMode('original')} className={`rounded-lg border py-2 text-xs font-bold font-display ${sourceMode === 'original' ? 'border-cyan-300 bg-cyan-300 text-black' : 'border-neutral-700 bg-neutral-900 text-neutral-400'}`}>原图</button><button onClick={() => sourceUrls.prepared && setSourceMode('prepared')} disabled={!sourceUrls.prepared} className={`rounded-lg border py-2 text-xs font-bold font-display ${sourceMode === 'prepared' ? 'border-cyan-300 bg-cyan-300 text-black' : 'border-neutral-700 bg-neutral-900 text-neutral-400'} disabled:cursor-not-allowed disabled:opacity-50`}>预处理图</button></div><p className="text-[11px] text-neutral-500">原图保留更多细节，预处理图更适合轮廓已经简化过的素材。</p>{prepareSourceError && <p className="text-[11px] text-amber-300">{prepareSourceError}</p>}</div>

          <div className="space-y-4"><div><label className="mb-3 block text-xs uppercase tracking-wider text-neutral-400 font-display">列数</label><div className="flex items-center gap-3"><input type="range" min={24} max={96} step={2} value={columns} onChange={(event) => setColumns(parseInt(event.target.value, 10))} className="flex-1 accent-cyan-300" /><span className="w-8 text-center text-sm text-cyan-200 font-mono">{columns}</span></div></div><div><label className="mb-3 block text-xs uppercase tracking-wider text-neutral-400 font-display">颜色合并</label><div className="flex items-center gap-3"><input type="range" min={0} max={60} step={2} value={similarityThreshold} onChange={(event) => setSimilarityThreshold(parseInt(event.target.value, 10))} className="flex-1 accent-cyan-300" /><span className="w-8 text-center text-sm text-cyan-200 font-mono">{similarityThreshold}</span></div></div><div><label className="mb-3 block text-xs uppercase tracking-wider text-neutral-400 font-display">透明阈值</label><div className="flex items-center gap-3"><input type="range" min={0} max={255} step={5} value={transparentThreshold} onChange={(event) => setTransparentThreshold(parseInt(event.target.value, 10))} className="flex-1 accent-cyan-300" /><span className="w-12 text-center text-sm text-cyan-200 font-mono">{transparentThreshold}</span></div></div><div><label className="mb-3 block text-xs uppercase tracking-wider text-neutral-400 font-display">轮廓强化</label><div className="flex items-center gap-3"><input type="range" min={0} max={100} step={5} value={edgeBias} onChange={(event) => setEdgeBias(parseInt(event.target.value, 10))} className="flex-1 accent-cyan-300" /><span className="w-10 text-center text-sm text-cyan-200 font-mono">{edgeBias}</span></div></div></div>

          <div className="grid grid-cols-2 gap-2">{([['content', '内容裁切'], ['full', '保留整张图']] as Array<[PerlerPatternCropModeValue, string]>).map(([value, label]) => <button key={value} onClick={() => setCropMode(value as PerlerPatternCropMode)} className={`rounded-lg border py-2 text-xs font-bold font-display ${cropMode === value ? 'border-cyan-300 bg-cyan-300 text-black' : 'border-neutral-700 bg-neutral-900 text-neutral-400'}`}>{label}</button>)}</div>
          <div className="grid grid-cols-2 gap-2"><button onClick={() => setMode('dominant')} className={`rounded-lg border py-2 text-xs font-bold font-display ${mode === 'dominant' ? 'border-cyan-300 bg-cyan-300 text-black' : 'border-neutral-700 bg-neutral-900 text-neutral-400'}`}>主色取样</button><button onClick={() => setMode('average')} className={`rounded-lg border py-2 text-xs font-bold font-display ${mode === 'average' ? 'border-cyan-300 bg-cyan-300 text-black' : 'border-neutral-700 bg-neutral-900 text-neutral-400'}`}>平均取色</button></div>

          <div className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4"><p className="text-xs uppercase tracking-wider text-neutral-400 font-display">编辑模式</p><div className="grid grid-cols-3 gap-2">{([['inspect', '查看'], ['paint', '连续涂抹'], ['replace', '框选替换']] as Array<[EditMode, string]>).map(([value, label]) => <button key={value} onClick={() => setEditMode(value)} className={`rounded-lg border py-2 text-xs font-bold font-display ${editMode === value ? 'border-cyan-300 bg-cyan-300 text-black' : 'border-neutral-700 bg-neutral-900 text-neutral-400'}`}>{label}</button>)}</div><div className="grid grid-cols-2 gap-2">{[1, 3].map((value) => <button key={value} onClick={() => setBrushSize(value as 1 | 3)} disabled={editMode !== 'paint'} className={`rounded-lg border py-2 text-xs font-bold font-display ${brushSize === value ? 'border-cyan-300 bg-cyan-300 text-black' : 'border-neutral-700 bg-neutral-900 text-neutral-400'} disabled:opacity-40`}>{value}x{value}</button>)}</div><p className="text-[11px] text-neutral-500">连续涂抹会跟随指针持续上色；框选替换会批量覆盖选区；被锁定的颜色不会被改写。</p></div>

          <div><label className="mb-3 block text-xs uppercase tracking-wider text-neutral-400 font-display">色号体系</label><div className="grid grid-cols-3 gap-2">{perlerColorSystemOptions.slice(0, 6).map((system) => <button key={system.key} onClick={() => setColorSystem(system.key)} className={`rounded-lg border py-2 text-xs font-bold font-display ${colorSystem === system.key ? 'border-cyan-300 bg-cyan-300 text-black' : 'border-neutral-700 bg-neutral-900 text-neutral-400'}`}>{system.name}</button>)}</div></div>
          <div><label className="mb-3 block text-xs uppercase tracking-wider text-neutral-400 font-display">预览缩放</label><div className="flex items-center gap-3"><input type="range" min={16} max={36} step={1} value={previewCellSize} onChange={(event) => setPreviewCellSize(parseInt(event.target.value, 10))} className="flex-1 accent-cyan-300" /><span className="w-8 text-center text-sm text-cyan-200 font-mono">{previewCellSize}</span></div></div>
          <button onClick={() => setShowCellCodes((current) => !current)} className={`flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold font-display ${showCellCodes ? 'bg-cyan-300 text-black' : 'border border-neutral-700 bg-neutral-900 text-neutral-300'}`}><Grid size={16} />{showCellCodes ? '隐藏格子色号' : '显示格子色号'}</button>

          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4"><div className="mb-3 flex items-center justify-between"><p className="text-xs uppercase tracking-wider text-neutral-400 font-display">色卡</p><div className="flex items-center gap-2"><button onClick={() => setPaletteMode('pattern')} className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold font-display ${paletteMode === 'pattern' ? 'border-cyan-300 bg-cyan-300 text-black' : 'border-neutral-700 bg-neutral-900 text-neutral-400'}`}>图纸已用</button><button onClick={() => setPaletteMode('full')} className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold font-display ${paletteMode === 'full' ? 'border-cyan-300 bg-cyan-300 text-black' : 'border-neutral-700 bg-neutral-900 text-neutral-400'}`}>完整色卡</button></div></div><div className="relative mb-3"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" /><input value={legendSearch} onChange={(event) => setLegendSearch(event.target.value)} placeholder="搜索色号或颜色" className="w-full rounded-lg border border-neutral-700 bg-black/30 py-2 pl-9 pr-3 text-xs text-white placeholder-neutral-600 focus:border-cyan-300 focus:outline-none" /></div><div className="mb-3 flex items-center justify-between text-[11px] text-neutral-500"><span>{pattern?.totalBeads ?? 0} 颗拼豆</span><span>{lockedKeys.length} 个锁定颜色</span></div><div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">{paletteEntries.map((color) => { const isHighlighted = highlightColor?.toUpperCase() === color.color.toUpperCase(); const isPaintSelected = paintSwatch?.color.toUpperCase() === color.color.toUpperCase(); const isLocked = lockedKeySet.has(color.key); return <div key={`${color.displayKey}-${color.color}`} className={`flex items-center gap-2 rounded-lg border px-2 py-2 transition-all ${isPaintSelected ? 'border-fuchsia-300 bg-fuchsia-300/10' : isHighlighted ? 'border-cyan-300 bg-cyan-300/10' : 'border-neutral-800 bg-black/10 hover:border-neutral-700'}`}><button onClick={() => { if (editMode === 'paint' || editMode === 'replace') { setPaintSwatch({ key: color.key, color: color.color, displayKey: color.displayKey }); return; } setHighlightColor((current) => current?.toUpperCase() === color.color.toUpperCase() ? null : color.color); }} className="flex min-w-0 flex-1 items-center gap-3 text-xs"><span className="h-4 w-4 shrink-0 rounded-sm border border-white/10" style={{ backgroundColor: color.color }} /><span className="w-12 text-left font-mono text-neutral-100">{color.displayKey}</span><span className="truncate text-left text-neutral-500">{color.color}</span><span className={`ml-auto font-mono ${color.count > 0 ? 'text-cyan-200' : 'text-neutral-600'}`}>{color.count}</span></button><button onClick={() => setLockedKeys((current) => current.includes(color.key) ? current.filter((value) => value !== color.key) : [...current, color.key])} className={`rounded-lg border p-2 ${isLocked ? 'border-amber-300/50 bg-amber-300/10 text-amber-200' : 'border-neutral-700 bg-neutral-900 text-neutral-400'}`} aria-label={isLocked ? `解锁 ${color.displayKey}` : `锁定 ${color.displayKey}`} title={isLocked ? '解锁颜色' : '锁定颜色'}>{isLocked ? <Lock size={14} /> : <Unlock size={14} />}</button></div>; })}</div></div>

          {paintSwatch && <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-xs text-neutral-400"><div className="flex items-center gap-3"><span className="h-4 w-4 rounded-sm border border-white/10" style={{ backgroundColor: paintSwatch.color }} /><span className="font-mono text-white">{paintSwatch.displayKey} {paintSwatch.color}</span></div><p className="mt-2">当前精修颜色。可用于连续涂抹，也可直接替换框选区域。</p></div>}
          {pattern && <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-xs text-neutral-400">图纸规格：{pattern.columns} × {pattern.rows} · {pattern.totalBeads} 颗拼豆 · {pattern.colorCounts.length} 种颜色。</div>}
        </div>
      </div>
    </div>
  );
}
