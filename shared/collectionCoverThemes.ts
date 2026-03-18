import { ItemCategory } from '../types.js';

export interface CollectionCoverSubjectBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CollectionCoverTheme {
  id: string;
  label: string;
  accent: string;
  accentSoft: string;
  glow: string;
  backgroundStart: string;
  backgroundEnd: string;
  spotlight: string;
  frameEdge: string;
  frameFill: string;
  plateFill: string;
  lineColor: string;
  grainOpacity: number;
  templateAsset: string;
  subjectBox: CollectionCoverSubjectBox;
  titleColor: string;
  metaColor: string;
}

const COVER_THEME_PRESETS: CollectionCoverTheme[] = [
  {
    id: 'packaging-polaroid',
    label: 'Packaging Archive',
    accent: '#ffd38f',
    accentSoft: '#fff3d8',
    glow: '#ffb36e',
    backgroundStart: '#1a110c',
    backgroundEnd: '#312017',
    spotlight: '#ffd6a7',
    frameEdge: '#fff4e6',
    frameFill: 'rgba(255, 243, 220, 0.18)',
    plateFill: 'rgba(28, 18, 12, 0.76)',
    lineColor: 'rgba(255, 216, 168, 0.22)',
    grainOpacity: 0.14,
    templateAsset: '/collection-cover-backgrounds/packaging-polaroid.svg',
    subjectBox: { x: 156, y: 174, width: 588, height: 758 },
    titleColor: '#fff7eb',
    metaColor: '#e9c7a0',
  },
  {
    id: 'container-glass',
    label: 'Container Archive',
    accent: '#8df1ff',
    accentSoft: '#dffcff',
    glow: '#4ad9ff',
    backgroundStart: '#08131d',
    backgroundEnd: '#0f2233',
    spotlight: '#8df1ff',
    frameEdge: '#e2fdff',
    frameFill: 'rgba(213, 249, 255, 0.14)',
    plateFill: 'rgba(9, 18, 32, 0.78)',
    lineColor: 'rgba(141, 241, 255, 0.22)',
    grainOpacity: 0.12,
    templateAsset: '/collection-cover-backgrounds/container-glass.svg',
    subjectBox: { x: 148, y: 164, width: 604, height: 776 },
    titleColor: '#f4feff',
    metaColor: '#a7dae3',
  },
  {
    id: 'paper-scrapbook',
    label: 'Paper Archive',
    accent: '#e6d3a2',
    accentSoft: '#fff7dc',
    glow: '#ffc96b',
    backgroundStart: '#181411',
    backgroundEnd: '#2a211a',
    spotlight: '#f4deb0',
    frameEdge: '#fff7e8',
    frameFill: 'rgba(255, 245, 228, 0.12)',
    plateFill: 'rgba(26, 21, 15, 0.78)',
    lineColor: 'rgba(230, 211, 162, 0.2)',
    grainOpacity: 0.12,
    templateAsset: '/collection-cover-backgrounds/paper-scrapbook.svg',
    subjectBox: { x: 152, y: 170, width: 596, height: 760 },
    titleColor: '#fff8ed',
    metaColor: '#d9c7ab',
  },
  {
    id: 'electronic-holo',
    label: 'Electronic Archive',
    accent: '#aef85b',
    accentSoft: '#f1ffd8',
    glow: '#63dfff',
    backgroundStart: '#091014',
    backgroundEnd: '#0d1d28',
    spotlight: '#c5ff72',
    frameEdge: '#efffdd',
    frameFill: 'rgba(212, 255, 151, 0.12)',
    plateFill: 'rgba(9, 15, 18, 0.78)',
    lineColor: 'rgba(174, 248, 91, 0.22)',
    grainOpacity: 0.12,
    templateAsset: '/collection-cover-backgrounds/electronic-holo.svg',
    subjectBox: { x: 136, y: 150, width: 628, height: 800 },
    titleColor: '#f8ffe8',
    metaColor: '#bcd8ca',
  },
  {
    id: 'textile-velvet',
    label: 'Textile Archive',
    accent: '#ffb3d8',
    accentSoft: '#ffe8f5',
    glow: '#f09cff',
    backgroundStart: '#190f17',
    backgroundEnd: '#2f1628',
    spotlight: '#ffb3d8',
    frameEdge: '#fff1f8',
    frameFill: 'rgba(255, 233, 244, 0.12)',
    plateFill: 'rgba(23, 10, 18, 0.8)',
    lineColor: 'rgba(255, 179, 216, 0.22)',
    grainOpacity: 0.14,
    templateAsset: '/collection-cover-backgrounds/textile-velvet.svg',
    subjectBox: { x: 146, y: 162, width: 608, height: 784 },
    titleColor: '#fff4f9',
    metaColor: '#e1c1d1',
  },
  {
    id: 'other-archive',
    label: 'Archive Edition',
    accent: '#c0d7e6',
    accentSoft: '#f0f7fb',
    glow: '#dce7ef',
    backgroundStart: '#111418',
    backgroundEnd: '#1f2730',
    spotlight: '#d7e7f4',
    frameEdge: '#f3f8fc',
    frameFill: 'rgba(240, 247, 251, 0.12)',
    plateFill: 'rgba(14, 18, 23, 0.8)',
    lineColor: 'rgba(192, 215, 230, 0.2)',
    grainOpacity: 0.1,
    templateAsset: '/collection-cover-backgrounds/other-archive.svg',
    subjectBox: { x: 144, y: 162, width: 612, height: 786 },
    titleColor: '#f7fafc',
    metaColor: '#b8c5d0',
  },
];

const HALL_THEME_ORDER: Array<[string, number]> = [
  [ItemCategory.PACKAGING, 0],
  [ItemCategory.CONTAINER, 1],
  [ItemCategory.PAPER, 2],
  [ItemCategory.ELECTRONIC, 3],
  [ItemCategory.TEXTILE, 4],
  [ItemCategory.OTHER, 5],
];

const HALL_THEME_MAP = new Map<string, CollectionCoverTheme>(
  HALL_THEME_ORDER.map(([hallId, index]) => [hallId, COVER_THEME_PRESETS[index]]),
);

export function getCollectionCoverTheme(hallId: string | null | undefined): CollectionCoverTheme {
  if (!hallId) {
    return COVER_THEME_PRESETS[0];
  }

  const explicit = HALL_THEME_MAP.get(hallId);
  if (explicit) {
    return explicit;
  }

  const hash = stableHash(hallId);
  return COVER_THEME_PRESETS[hash % COVER_THEME_PRESETS.length];
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}
