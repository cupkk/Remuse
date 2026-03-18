import sharp from 'sharp';
import { getCollectionCoverTheme } from '../shared/collectionCoverThemes.ts';

const COVER_WIDTH = 900;
const COVER_HEIGHT = 1260;

interface ComposeCollectionCoverOptions {
  hallId: string;
  subjectDataUrl: string;
  useCutoutLayout?: boolean;
}

interface DecodedDataUrl {
  mimeType: string;
  buffer: Buffer;
}

export async function composeCollectionCoverDataUrl({
  hallId,
  subjectDataUrl,
  useCutoutLayout = true,
}: ComposeCollectionCoverOptions) {
  const theme = getCollectionCoverTheme(hallId);
  const subjectData = decodeDataUrl(subjectDataUrl);
  const subjectAsset = await prepareSubjectAsset(subjectData, useCutoutLayout);
  const svg = renderCollectionCoverSvg({
    hallId,
    subjectDataUrl: subjectAsset.dataUrl,
    useCutoutLayout,
  });

  const buffer = await sharp(Buffer.from(svg))
    .webp({
      quality: 90,
      alphaQuality: 92,
      effort: 5,
      nearLossless: true,
    })
    .toBuffer();

  return `data:image/webp;base64,${buffer.toString('base64')}`;

  function renderCollectionCoverSvg(input: {
    hallId: string;
    subjectDataUrl: string;
    useCutoutLayout: boolean;
  }) {
    const selectedTheme = getCollectionCoverTheme(input.hallId);

    const frameOuterX = 96;
    const frameOuterY = 84;
    const frameOuterW = COVER_WIDTH - frameOuterX * 2;
    const frameOuterH = COVER_HEIGHT - 154;
    const frameInnerX = frameOuterX + 28;
    const frameInnerY = frameOuterY + 28;
    const frameInnerW = frameOuterW - 56;
    const frameInnerH = frameOuterH - 72;

    const artX = frameInnerX + 30;
    const artY = frameInnerY + 52;
    const artW = frameInnerW - 60;
    const artH = 650;

    const subjectX = input.useCutoutLayout ? artX + 24 : artX;
    const subjectY = input.useCutoutLayout ? artY + 30 : artY;
    const subjectW = input.useCutoutLayout ? artW - 48 : artW;
    const subjectH = input.useCutoutLayout ? artH - 10 : artH;

    return `
      <svg width="${COVER_WIDTH}" height="${COVER_HEIGHT}" viewBox="0 0 ${COVER_WIDTH} ${COVER_HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="stageGradient" x1="120" y1="40" x2="780" y2="1220" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="${selectedTheme.backgroundStart}" />
            <stop offset="100%" stop-color="${selectedTheme.backgroundEnd}" />
          </linearGradient>
          <radialGradient id="spotlightA" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(250 190) rotate(34) scale(360 300)">
            <stop offset="0%" stop-color="${selectedTheme.spotlight}" stop-opacity="0.55" />
            <stop offset="100%" stop-color="${selectedTheme.spotlight}" stop-opacity="0" />
          </radialGradient>
          <radialGradient id="spotlightB" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(690 280) rotate(120) scale(280 320)">
            <stop offset="0%" stop-color="${selectedTheme.glow}" stop-opacity="0.34" />
            <stop offset="100%" stop-color="${selectedTheme.glow}" stop-opacity="0" />
          </radialGradient>
          <linearGradient id="frameGlow" x1="${frameOuterX}" y1="${frameOuterY}" x2="${frameOuterX + frameOuterW}" y2="${frameOuterY + frameOuterH}" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="${selectedTheme.accent}" />
            <stop offset="52%" stop-color="${selectedTheme.accentSoft}" />
            <stop offset="100%" stop-color="${selectedTheme.glow}" />
          </linearGradient>
          <linearGradient id="glossGradient" x1="${frameOuterX + 18}" y1="${frameOuterY}" x2="${frameOuterX + frameOuterW - 32}" y2="${frameOuterY + 420}" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="rgba(255,255,255,0.54)" />
            <stop offset="25%" stop-color="rgba(255,255,255,0.10)" />
            <stop offset="60%" stop-color="rgba(255,255,255,0.02)" />
            <stop offset="100%" stop-color="rgba(255,255,255,0)" />
          </linearGradient>
          <pattern id="microGrid" patternUnits="userSpaceOnUse" width="54" height="54">
            <path d="M54 0H0V54" stroke="${selectedTheme.lineColor}" stroke-width="1"/>
          </pattern>
          <filter id="frameShadow" x="0" y="0" width="${COVER_WIDTH}" height="${COVER_HEIGHT}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
            <feDropShadow dx="0" dy="34" stdDeviation="42" flood-color="rgba(0,0,0,0.5)" />
          </filter>
          <filter id="subjectShadow" x="0" y="0" width="${COVER_WIDTH}" height="${COVER_HEIGHT}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
            <feDropShadow dx="0" dy="20" stdDeviation="18" flood-color="rgba(0,0,0,0.34)" />
          </filter>
          <clipPath id="artClip">
            <rect x="${artX}" y="${artY}" width="${artW}" height="${artH}" rx="38" />
          </clipPath>
        </defs>

        <rect width="${COVER_WIDTH}" height="${COVER_HEIGHT}" fill="#05080D" />
        <rect width="${COVER_WIDTH}" height="${COVER_HEIGHT}" fill="url(#stageGradient)" />
        <rect width="${COVER_WIDTH}" height="${COVER_HEIGHT}" fill="url(#spotlightA)" />
        <rect width="${COVER_WIDTH}" height="${COVER_HEIGHT}" fill="url(#spotlightB)" />

        <g opacity="${selectedTheme.grainOpacity}">
          <circle cx="164" cy="1084" r="154" fill="${selectedTheme.accent}" fill-opacity="0.1" />
          <circle cx="748" cy="180" r="126" fill="${selectedTheme.glow}" fill-opacity="0.12" />
          <circle cx="736" cy="1018" r="112" fill="${selectedTheme.accentSoft}" fill-opacity="0.1" />
        </g>

        <rect x="84" y="990" width="${COVER_WIDTH - 168}" height="156" rx="52" fill="rgba(255,255,255,0.03)" />

        <g filter="url(#frameShadow)">
          <rect x="${frameOuterX}" y="${frameOuterY}" width="${frameOuterW}" height="${frameOuterH}" rx="56" fill="${selectedTheme.frameFill}" stroke="url(#frameGlow)" stroke-width="8" />
          <rect x="${frameInnerX}" y="${frameInnerY}" width="${frameInnerW}" height="${frameInnerH}" rx="42" fill="${selectedTheme.plateFill}" stroke="${selectedTheme.frameEdge}" stroke-opacity="0.3" stroke-width="2" />
          <rect x="${artX}" y="${artY}" width="${artW}" height="${artH}" rx="38" fill="rgba(7,10,18,0.76)" />
          <rect x="${artX}" y="${artY}" width="${artW}" height="${artH}" rx="38" fill="url(#microGrid)" opacity="0.44" />

          <path d="M${artX + 46} ${artY + 86}C${artX + 150} ${artY + 56}, ${artX + 210} ${artY + 88}, ${artX + 276} ${artY + 164}" stroke="${selectedTheme.accentSoft}" stroke-opacity="0.18" stroke-width="2"/>
          <path d="M${artX + artW - 110} ${artY + 42}L${artX + artW - 54} ${artY + 98}L${artX + artW - 22} ${artY + 72}" stroke="${selectedTheme.glow}" stroke-opacity="0.3" stroke-width="2"/>
          <path d="M${artX + 36} ${artY + artH - 92}H${artX + artW - 36}" stroke="${selectedTheme.accentSoft}" stroke-opacity="0.22" stroke-width="3"/>
        </g>

        ${input.useCutoutLayout ? `
          <g filter="url(#subjectShadow)">
            <image
              href="${input.subjectDataUrl}"
              x="${subjectX}"
              y="${subjectY}"
              width="${subjectW}"
              height="${subjectH}"
              preserveAspectRatio="xMidYMid meet"
            />
          </g>
        ` : `
          <g clip-path="url(#artClip)" filter="url(#subjectShadow)">
            <image
              href="${input.subjectDataUrl}"
              x="${subjectX}"
              y="${subjectY}"
              width="${subjectW}"
              height="${subjectH}"
              preserveAspectRatio="xMidYMid slice"
            />
          </g>
        `}

        <rect x="${frameOuterX + 18}" y="${frameOuterY + 12}" width="${frameOuterW - 36}" height="220" rx="48" fill="url(#glossGradient)" opacity="0.58" />
        <rect x="${frameOuterX + 36}" y="${frameOuterY + frameOuterH - 74}" width="${frameOuterW - 72}" height="2" fill="${selectedTheme.accentSoft}" fill-opacity="0.44" />

        <g transform="translate(${frameInnerX + 34} ${frameInnerY + frameInnerH - 112})">
          <text fill="${selectedTheme.accentSoft}" fill-opacity="0.86" font-family="IBM Plex Mono, monospace" font-size="18" letter-spacing="8">${selectedTheme.label.toUpperCase()}</text>
          <text x="0" y="44" fill="#F7FAFC" fill-opacity="0.82" font-family="IBM Plex Sans, Arial, sans-serif" font-size="20" letter-spacing="1.5">Museum Cover</text>
        </g>
      </svg>
    `;
  }
}

async function prepareSubjectAsset(subject: DecodedDataUrl, useCutoutLayout: boolean) {
  const pipeline = sharp(subject.buffer).rotate().ensureAlpha();
  const prepared = useCutoutLayout
    ? pipeline.trim({ threshold: 8 })
    : pipeline;
  const resized = await prepared
    .resize({
      width: useCutoutLayout ? 650 : 700,
      height: useCutoutLayout ? 760 : 760,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  return {
    dataUrl: `data:image/png;base64,${resized.toString('base64')}`,
  };
}

function decodeDataUrl(dataUrl: string): DecodedDataUrl {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    throw new Error('Invalid image payload for collection cover.');
  }

  return {
    mimeType: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], 'base64'),
  };
}
