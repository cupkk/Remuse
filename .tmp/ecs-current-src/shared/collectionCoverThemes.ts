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
}

const COVER_THEME_PRESETS: CollectionCoverTheme[] = [
  {
    id: 'aurora-foil',
    label: 'Aurora Foil',
    accent: '#7df3ff',
    accentSoft: '#b3f8ff',
    glow: '#d18eff',
    backgroundStart: '#071325',
    backgroundEnd: '#15091f',
    spotlight: '#4ce0ff',
    frameEdge: '#d7fcff',
    frameFill: 'rgba(192, 249, 255, 0.12)',
    plateFill: 'rgba(8, 13, 28, 0.72)',
    lineColor: 'rgba(125, 243, 255, 0.34)',
    grainOpacity: 0.14,
  },
  {
    id: 'pearl-polaroid',
    label: 'Pearl Polaroid',
    accent: '#ffd97e',
    accentSoft: '#fff0c2',
    glow: '#ff8ec7',
    backgroundStart: '#17110d',
    backgroundEnd: '#30191c',
    spotlight: '#ffdb85',
    frameEdge: '#fff7ec',
    frameFill: 'rgba(255, 246, 230, 0.16)',
    plateFill: 'rgba(26, 18, 14, 0.74)',
    lineColor: 'rgba(255, 217, 126, 0.26)',
    grainOpacity: 0.16,
  },
  {
    id: 'museum-paper',
    label: 'Museum Paper',
    accent: '#8de8d4',
    accentSoft: '#d3fff6',
    glow: '#9fdb92',
    backgroundStart: '#0f1712',
    backgroundEnd: '#1f2517',
    spotlight: '#6bf0bf',
    frameEdge: '#f6fff6',
    frameFill: 'rgba(243, 255, 244, 0.12)',
    plateFill: 'rgba(12, 18, 14, 0.76)',
    lineColor: 'rgba(141, 232, 212, 0.22)',
    grainOpacity: 0.1,
  },
  {
    id: 'neon-grid',
    label: 'Neon Grid',
    accent: '#9afc3f',
    accentSoft: '#efffd3',
    glow: '#00d6ff',
    backgroundStart: '#08110d',
    backgroundEnd: '#091a24',
    spotlight: '#b1ff4f',
    frameEdge: '#f1ffdc',
    frameFill: 'rgba(190, 255, 112, 0.1)',
    plateFill: 'rgba(5, 11, 12, 0.78)',
    lineColor: 'rgba(154, 252, 63, 0.24)',
    grainOpacity: 0.12,
  },
  {
    id: 'velvet-stage',
    label: 'Velvet Stage',
    accent: '#ff92c2',
    accentSoft: '#ffe2f0',
    glow: '#79b7ff',
    backgroundStart: '#180c1d',
    backgroundEnd: '#090d1c',
    spotlight: '#ff92c2',
    frameEdge: '#fff0fa',
    frameFill: 'rgba(255, 226, 240, 0.12)',
    plateFill: 'rgba(17, 10, 18, 0.76)',
    lineColor: 'rgba(255, 146, 194, 0.24)',
    grainOpacity: 0.12,
  },
  {
    id: 'opal-archive',
    label: 'Opal Archive',
    accent: '#7ce2ff',
    accentSoft: '#ecfbff',
    glow: '#d6fff2',
    backgroundStart: '#0b1117',
    backgroundEnd: '#182130',
    spotlight: '#8effd8',
    frameEdge: '#f4fcff',
    frameFill: 'rgba(236, 251, 255, 0.14)',
    plateFill: 'rgba(8, 12, 18, 0.76)',
    lineColor: 'rgba(124, 226, 255, 0.22)',
    grainOpacity: 0.1,
  },
];

export function getCollectionCoverTheme(hallId: string | null | undefined): CollectionCoverTheme {
  if (!hallId) {
    return COVER_THEME_PRESETS[0];
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
