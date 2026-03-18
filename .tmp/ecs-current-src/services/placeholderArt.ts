function encodeSvg(svg: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function buildPlaceholderArtwork(options: {
  title: string;
  subtitle?: string;
  from: string;
  to: string;
  accent?: string;
}) {
  const accent = options.accent || '#ffffff';
  return encodeSvg(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${options.from}" />
          <stop offset="100%" stop-color="${options.to}" />
        </linearGradient>
      </defs>
      <rect width="1200" height="900" fill="url(#bg)" rx="48" />
      <circle cx="980" cy="180" r="180" fill="${accent}" fill-opacity="0.12" />
      <circle cx="220" cy="760" r="220" fill="${accent}" fill-opacity="0.10" />
      <rect x="96" y="96" width="1008" height="708" rx="36" fill="rgba(0,0,0,0.18)" />
      <text x="120" y="210" fill="#ffffff" font-size="40" font-family="Arial, sans-serif" letter-spacing="8">RE-MUSEUM</text>
      <text x="120" y="340" fill="#ffffff" font-size="82" font-weight="700" font-family="Arial, sans-serif">${escapeXml(options.title)}</text>
      <text x="120" y="430" fill="#ffffff" fill-opacity="0.82" font-size="34" font-family="Arial, sans-serif">${escapeXml(options.subtitle || 'Curated cover')}</text>
      <rect x="120" y="520" width="240" height="8" rx="4" fill="${accent}" fill-opacity="0.75" />
      <rect x="120" y="556" width="320" height="8" rx="4" fill="${accent}" fill-opacity="0.38" />
    </svg>
  `);
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
