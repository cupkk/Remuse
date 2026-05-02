import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  CheckCheck,
  Copy,
  Gift,
  Heart,
  Sparkles,
  Smartphone,
  Sun,
} from 'lucide-react';
import { NFC_GIFT_DEMOS, getNfcGiftDemo, type NfcGiftDemo } from '../shared/nfcGiftDemos';

interface GiftRouteState {
  slug: string | null;
}

interface NfcGiftExperienceProps {
  basePath?: string;
}

interface LuckyQuote {
  english: string;
  chinese: string;
  source: string;
}

const LUCK_STORAGE_PREFIX = 'remuse:nfc-lucky-good:';
const LUCKY_BUILD_ID = '20260424-nfc-lucky-v2';

const badgeClassName =
  'inline-flex min-h-[34px] items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.24em]';

const pageShellClassName =
  'min-h-dvh overflow-x-clip bg-[#050606] pb-[calc(env(safe-area-inset-bottom)+2rem)] text-white';

const glassPanelClassName =
  'border border-white/10 bg-white/[0.045] shadow-[0_30px_100px_rgba(0,0,0,0.36)] backdrop-blur-2xl';

function normalizePathname(pathname: string) {
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
}

function normalizeBasePath(basePath: string) {
  const normalized = normalizePathname(basePath || '/gift');
  return normalized === '/' ? '/' : normalized;
}

function buildGiftHref(basePath: string, slug?: string | null) {
  if (basePath === '/') {
    return slug ? `/${slug}` : '/';
  }

  return slug ? `${basePath}/${slug}` : basePath;
}

export function isNfcGiftExperiencePath(pathname: string, basePath = '/gift') {
  const normalizedPath = normalizePathname(pathname);
  const normalizedBase = normalizeBasePath(basePath);

  if (normalizedBase === '/') {
    return true;
  }

  return normalizedPath === normalizedBase || normalizedPath.startsWith(`${normalizedBase}/`);
}

function getGiftRouteState(pathname: string, basePath: string): GiftRouteState {
  const normalized = normalizePathname(pathname);
  const normalizedBase = normalizeBasePath(basePath);

  if (!isNfcGiftExperiencePath(normalized, normalizedBase)) {
    return { slug: null };
  }

  const relativePath = normalizedBase === '/'
    ? normalized
    : normalizePathname(normalized.slice(normalizedBase.length) || '/');
  const segments = relativePath.split('/').filter(Boolean);

  return {
    slug: segments[0] || null,
  };
}

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function getTodayLabel() {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());
}

function hashText(text: string) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function getTodayGift() {
  if (NFC_GIFT_DEMOS.length === 0) {
    return null;
  }

  return NFC_GIFT_DEMOS[hashText(getTodayKey()) % NFC_GIFT_DEMOS.length];
}

function buildLuckyQuote(gift: NfcGiftDemo): LuckyQuote {
  const text = `${gift.title} ${gift.sourceItemName} ${gift.sourceCategory} ${gift.tags.join(' ')}`;

  if (/奶茶|饮|杯|咖啡/.test(text)) {
    return {
      english: 'Carry the small sweetness forward, and let today become warm enough to remember.',
      chinese: '把这一点甜继续带在身上，让今天足够温柔，也足够被记住。',
      source: 'REMUSE',
    };
  }

  if (/牛仔|衣|布|单宁|纺织/.test(text)) {
    return {
      english: 'Every softened edge is proof that time can stay close without holding you back.',
      chinese: '每一道被时间磨软的边，都在提醒你：旧日可以靠近，也可以继续向前。',
      source: 'REMUSE',
    };
  }

  if (/色纸|纸|票|书|卡/.test(text)) {
    return {
      english: 'A small page can keep a whole season bright.',
      chinese: '一小页纸，也可以替你保存一个仍然发亮的季节。',
      source: 'REMUSE',
    };
  }

  if (/玩偶|毛绒|童话|摆件/.test(text)) {
    return {
      english: 'Let the gentle things stand beside you first.',
      chinese: '先让柔软的事物站到你身边，今天就不必一个人用力。',
      source: 'REMUSE',
    };
  }

  if (/玻璃|瓶|容器/.test(text)) {
    return {
      english: 'May what once held something ordinary now hold a little light for you.',
      chinese: '愿曾经盛放日常的容器，今天替你盛住一点光。',
      source: 'REMUSE',
    };
  }

  return {
    english: 'The ordinary object has arrived as a quiet sign of luck.',
    chinese: '普通的物件已经抵达，像一枚安静的好运信号。',
    source: 'REMUSE',
  };
}

function buildAsciiGlyphs(gift: NfcGiftDemo) {
  const source = `${gift.title} ${gift.tags.join(' ')} REMUSE LUCK`.replace(/\s+/g, '');
  const chars = source || 'REMUSE';

  return Array.from({ length: 150 }, (_, index) => chars[index % chars.length]);
}

const NfcGiftExperience: React.FC<NfcGiftExperienceProps> = ({ basePath = '/gift' }) => {
  const normalizedBasePath = normalizeBasePath(basePath);
  const [route, setRoute] = useState(() =>
    getGiftRouteState(typeof window === 'undefined' ? '/' : window.location.pathname, normalizedBasePath),
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handlePopState = () => setRoute(getGiftRouteState(window.location.pathname, normalizedBasePath));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [normalizedBasePath]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const root = document.documentElement;
    const body = document.body;
    const mount = document.getElementById('root');
    root.classList.add('gift-site-html');
    body.classList.add('gift-site-body');
    mount?.classList.add('gift-site-root');

    return () => {
      root.classList.remove('gift-site-html');
      body.classList.remove('gift-site-body');
      mount?.classList.remove('gift-site-root');
    };
  }, []);

  const activeGift = useMemo(() => getNfcGiftDemo(route.slug), [route.slug]);
  const todayGift = useMemo(() => getTodayGift(), []);

  useEffect(() => {
    if (activeGift) {
      document.title = `${activeGift.title} | 每日幸运物品`;
      return;
    }

    document.title = route.slug ? '幸运物品未找到 | REMUSE' : '每日幸运物品 | REMUSE';
  }, [activeGift, route.slug]);

  const handleCopyLink = async () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  if (route.slug && !activeGift) {
    return (
      <div className={pageShellClassName} data-build={LUCKY_BUILD_ID}>
        <LuckyBackground />
        <div className="relative mx-auto flex min-h-dvh w-full max-w-[640px] flex-col px-4 py-5 safe-area-pt md:px-6 md:py-8">
          <BackLink basePath={normalizedBasePath} />
          <section className={`mt-6 rounded-[34px] p-6 ${glassPanelClassName}`}>
            <span className={`${badgeClassName} border-red-400/25 bg-red-400/10 text-red-200`}>
              <Gift size={14} />
              未找到
            </span>
            <h1 className="mt-5 font-display text-3xl font-black tracking-[-0.04em] text-white">
              这枚 NFC 还没有绑定幸运物品
            </h1>
            <p className="mt-3 text-sm leading-7 text-neutral-300">
              当前链接没有对应的公开好物。你可以回到入口页，查看已经写入 NFC 的每日幸运物品。
            </p>
          </section>
          <div className="mt-6 rounded-[28px] border border-white/10 bg-black/25 p-5 text-sm leading-7 text-neutral-300">
            这个 NFC 链接暂未绑定好物。请检查贴纸写入的网址是否正确。
          </div>
        </div>
      </div>
    );
  }

  if (!activeGift) {
    return (
      <div className={pageShellClassName} data-build={LUCKY_BUILD_ID}>
        <LuckyBackground />
        <div className="relative mx-auto w-full max-w-[1180px] px-4 py-5 safe-area-pt md:px-6 md:py-8">
          <section className={`overflow-hidden rounded-[38px] p-5 md:p-7 ${glassPanelClassName}`}>
            <div className="grid gap-7 lg:grid-cols-[minmax(0,0.98fr)_minmax(320px,0.72fr)] lg:items-center">
              <div>
                <span className={`${badgeClassName} border-remuse-accent/30 bg-remuse-accent/10 text-remuse-accent`}>
                  <Sun size={14} />
                  今日好物 NFC
                </span>
                <h1 className="mt-6 max-w-3xl font-display text-5xl font-black tracking-[-0.06em] text-white md:text-7xl">
                  每日幸运物品
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-8 text-neutral-300 md:text-lg">
                  请接受来自物品的幸运与力量。手机轻触 NFC，打开今天被选中的好物、故事和一页好运签。
                </p>
                {todayGift ? <TodayStatusBar gift={todayGift} basePath={normalizedBasePath} /> : null}
              </div>

              {todayGift ? (
                <LuckyObjectCard gift={todayGift} basePath={normalizedBasePath} compact />
              ) : null}
            </div>
          </section>

          <section className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-remuse-secondary">NFC 入口</p>
                <h2 className="mt-2 font-display text-3xl font-bold tracking-[-0.04em] text-white">已写入 NFC 的好物入口</h2>
              </div>
              <p className="max-w-lg text-sm leading-7 text-neutral-400">
                这些固定网址可以直接写入 NFC 贴纸。后续也可以把用户上传的藏品加入同一套幸运物品池。
              </p>
            </div>
            <GiftGrid gifts={NFC_GIFT_DEMOS} basePath={normalizedBasePath} />
          </section>
        </div>
      </div>
    );
  }

  return (
    <LuckyGiftDetail
      gift={activeGift}
      basePath={normalizedBasePath}
      copied={copied}
      onCopy={() => void handleCopyLink()}
    />
  );
};

function LuckyGiftDetail({
  gift,
  basePath,
  copied,
  onCopy,
}: {
  gift: NfcGiftDemo;
  basePath: string;
  copied: boolean;
  onCopy: () => void;
}) {
  const quote = useMemo(() => buildLuckyQuote(gift), [gift]);
  const [paperOpen, setPaperOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const handleAcceptLuck = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(`${LUCK_STORAGE_PREFIX}${gift.slug}`, JSON.stringify({
        slug: gift.slug,
        title: gift.title,
        receivedAt: new Date().toISOString(),
      }));
    }
    setAccepted(true);
  };

  return (
    <div className={pageShellClassName} data-build={LUCKY_BUILD_ID}>
      <LuckyInlineStyles />
      <LuckyBackground accent={gift.palette.spotlight} />
      <div className="relative mx-auto w-full max-w-[1120px] px-4 py-5 safe-area-pt md:px-6 md:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BackLink basePath={basePath} />
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border border-remuse-accent/25 bg-remuse-accent/10 px-4 text-sm text-remuse-accent transition-colors hover:bg-remuse-accent/15"
          >
            {copied ? <CheckCheck size={16} /> : <Copy size={16} />}
            {copied ? '链接已复制' : '复制这页好运'}
          </button>
        </div>

        <main className={`mt-5 overflow-hidden rounded-[42px] p-5 md:p-8 ${glassPanelClassName}`}>
          <div className="grid gap-8 lg:grid-cols-[minmax(320px,0.82fr)_minmax(0,1fr)] lg:items-center">
            <NfcArtifactStage gift={gift} />

            <section>
              <span className={`${badgeClassName} border-remuse-accent/30 bg-remuse-accent/10 text-remuse-accent`}>
                <Sun size={14} />
                {gift.capsuleLabel || 'NFC 档案'}
              </span>
              <h1 className="mt-5 max-w-2xl font-display text-5xl font-black text-white md:text-7xl">
                {gift.title}
              </h1>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-neutral-200">{gift.subtitle}</p>

              <div className="mt-6 flex flex-wrap gap-2">
                {gift.tags.slice(0, 4).map((tag) => (
                  <span key={tag} className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs text-neutral-300">
                    #{tag}
                  </span>
                ))}
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <LuckyFact label="日期" value={getTodayLabel()} icon={<CalendarDays size={16} />} />
                <LuckyFact label="档案编号" value={gift.archiveCode} icon={<Smartphone size={16} />} />
                <LuckyFact label="来源" value={gift.sourceItemName} icon={<Sparkles size={16} />} />
              </div>
            </section>
          </div>

          <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.42fr)]">
            <LuckyPaper quote={quote} open={paperOpen} onOpen={() => setPaperOpen(true)} />

            <div className="flex flex-col justify-between rounded-[32px] border border-white/10 bg-black/25 p-5">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-remuse-secondary">收下好运</p>
                <h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.04em] text-white">{gift.title}</h2>
                <p className="mt-3 text-sm leading-7 text-neutral-300">
                  这份好运会留存在当前设备里。后续接入账号后，可以同步到“收到的好运”入口。
                </p>
              </div>

              <button
                type="button"
                onClick={handleAcceptLuck}
                className={`mt-6 inline-flex min-h-[56px] w-full cursor-pointer items-center justify-center gap-2 rounded-full px-6 text-base font-bold transition-all ${
                  accepted
                    ? 'bg-white text-black shadow-[0_0_32px_rgba(255,255,255,0.22)]'
                    : 'bg-remuse-accent text-black shadow-[0_0_36px_rgba(204,255,0,0.22)] hover:scale-[1.01] hover:bg-white'
                }`}
              >
                {accepted ? <CheckCheck size={20} /> : <Heart size={20} />}
                {accepted ? '好运已收下' : '收下好运'}
              </button>

              {accepted ? (
                <p className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm leading-6 text-emerald-100">
                  好运物品已在本机保存。若这是来自朋友的 NFC，好运也已经被你接住了。
                </p>
              ) : null}
            </div>
          </section>
        </main>

      </div>
    </div>
  );
}

function BackLink({ basePath }: { basePath: string }) {
  return (
    <a
      href={buildGiftHref(basePath)}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-neutral-700 px-4 text-sm text-neutral-300 transition-colors hover:border-white hover:text-white"
    >
      <ArrowLeft size={16} />
      返回入口
    </a>
  );
}

function TodayStatusBar({ gift, basePath }: { gift: NfcGiftDemo; basePath: string }) {
  return (
    <a
      href={buildGiftHref(basePath, gift.slug)}
      className="mt-6 flex items-center gap-4 rounded-[26px] border border-white/10 bg-black/25 p-3 transition-colors hover:border-remuse-accent/35"
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
        <img src={gift.originalImageUrl} alt={gift.imageAlt} className="h-full w-full object-cover" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">{getTodayLabel()}</p>
        <p className="mt-1 truncate font-display text-xl font-bold text-white">{gift.title}</p>
      </div>
      <span className="hidden rounded-full border border-remuse-accent/25 bg-remuse-accent/10 px-3 py-1 text-xs text-remuse-accent sm:inline-flex">
        今日幸运好物
      </span>
    </a>
  );
}

function LuckyObjectCard({ gift, basePath, compact = false }: { gift: NfcGiftDemo; basePath: string; compact?: boolean }) {
  const glyphs = useMemo(() => buildAsciiGlyphs(gift), [gift]);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handlePointerMove = (event: React.PointerEvent<HTMLAnchorElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left) / rect.width - 0.5;
    const relativeY = (event.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: relativeY * -8, y: relativeX * 10 });
  };

  return (
    <a
      href={buildGiftHref(basePath, gift.slug)}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setTilt({ x: 0, y: 0 })}
      className="group block"
      style={{ perspective: '1200px' }}
    >
      <article
        className={`relative mx-auto overflow-hidden rounded-[38px] border border-white/12 bg-[#080b0d] p-4 shadow-[0_28px_80px_rgba(0,0,0,0.42)] transition-transform duration-200 ${
          compact ? 'max-w-[360px]' : 'max-w-[430px]'
        }`}
        style={{
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          backgroundImage: `radial-gradient(circle at 50% 16%, ${gift.palette.glow}, transparent 36%), linear-gradient(180deg, rgba(11,14,18,0.98), rgba(4,5,7,0.98))`,
        }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="pointer-events-none absolute -inset-16 rounded-full opacity-50 blur-3xl" style={{ backgroundColor: gift.palette.spotlight }} />

        <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-black/35 p-5">
          <div className="absolute inset-0 grid grid-cols-10 gap-1 p-4 font-mono text-[10px] leading-none text-white/10">
            {glyphs.map((glyph, index) => (
              <span key={`${glyph}-${index}`} className={index % 7 === 0 ? 'text-remuse-accent/30' : ''}>
                {glyph}
              </span>
            ))}
          </div>

          <div className="relative mx-auto flex aspect-square max-w-[300px] items-center justify-center overflow-hidden rounded-full border border-white/10 bg-black/30 shadow-[inset_0_0_70px_rgba(255,255,255,0.08)]">
            <div className="absolute inset-6 rounded-full border border-remuse-secondary/20" />
            <img
              src={gift.originalImageUrl}
              alt={gift.imageAlt}
              className="h-[78%] w-[78%] rounded-[24px] object-cover opacity-90 mix-blend-screen saturate-[1.15] contrast-[1.08] transition-transform duration-500 group-hover:scale-[1.04]"
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_42%,rgba(0,0,0,0.62)_74%)]" />
          </div>

          <div className="relative mt-5 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-remuse-accent">今日好物</p>
            <h2 className="mt-2 font-display text-3xl font-black tracking-[-0.04em] text-white">{gift.title}</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-300">{gift.sourceItemName}</p>
          </div>
        </div>
      </article>
    </a>
  );
}

function NfcArtifactStage({ gift }: { gift: NfcGiftDemo }) {
  return (
    <section
      className="relative mx-auto w-full max-w-[460px] overflow-hidden rounded-[38px] border border-white/12 bg-[#06090b] p-4 shadow-[0_34px_110px_rgba(0,0,0,0.48)]"
      style={{
        backgroundImage: `radial-gradient(circle at 50% 0%, ${gift.palette.glow}, transparent 42%), linear-gradient(180deg, rgba(12,15,18,0.98), rgba(3,4,5,0.98))`,
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:30px_30px]" />
      <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full opacity-35 blur-3xl" style={{ backgroundColor: gift.palette.spotlight }} />

      <div className="relative rounded-[30px] border border-white/10 bg-black/35 p-3">
        <div className="overflow-hidden rounded-[26px] border border-white/12 bg-black">
          <img src={gift.coverImageUrl} alt={gift.coverAlt} className="aspect-[4/5] w-full object-cover" />
        </div>
        <div className="absolute right-6 top-6 rounded-full border border-black/50 bg-remuse-accent px-3 py-1 font-mono text-[11px] font-bold text-black">
          {gift.archiveCode.replace('RM-GIFT-', '#')}
        </div>
      </div>

      <div className="relative mt-4 grid grid-cols-[84px_minmax(0,1fr)] gap-4">
        <div className="overflow-hidden rounded-[20px] border border-white/10 bg-black/35">
          <img src={gift.originalImageUrl} alt={gift.imageAlt} className="aspect-square w-full object-cover" />
        </div>
        <div className="min-w-0 py-1">
          <p className="font-mono text-[11px] tracking-[0.22em] text-remuse-accent">{gift.capsuleLabel || 'NFC 档案'}</p>
          <h2 className="mt-2 truncate font-display text-2xl font-bold text-white">{gift.title}</h2>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-neutral-400">{gift.stickerCaption}</p>
        </div>
      </div>
    </section>
  );
}

function LuckyPaper({
  quote,
  open,
  onOpen,
}: {
  quote: LuckyQuote;
  open: boolean;
  onOpen: () => void;
}) {
  return (
    <section
      className={`relative overflow-hidden rounded-[32px] border p-5 transition-all duration-700 ${
        open
          ? 'border-amber-200/30 bg-[#efe0bd] text-[#21190c] shadow-[0_0_48px_rgba(255,197,104,0.16)]'
          : 'border-white/10 bg-black/25 text-white'
      }`}
    >
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.38),transparent_16%),linear-gradient(115deg,transparent,rgba(255,255,255,0.15),transparent)]" />
      {open ? <div className="remuse-burn-wave pointer-events-none absolute inset-0" /> : null}

      <div className="relative">
        <p className={`font-mono text-[11px] uppercase tracking-[0.28em] ${open ? 'text-[#7a5327]' : 'text-remuse-accent'}`}>
          光落此页
        </p>

        {!open ? (
          <button
            type="button"
            onClick={onOpen}
            className="mt-8 flex min-h-[220px] w-full cursor-pointer items-center justify-center rounded-[26px] border border-dashed border-remuse-accent/30 bg-remuse-accent/5 px-6 text-center transition-all hover:border-remuse-accent/60 hover:bg-remuse-accent/10"
          >
            <span>
              <span className="block font-display text-3xl font-bold tracking-[-0.04em] text-white">光落此页，等你开启</span>
              <span className="mt-4 block text-sm text-neutral-400">点击纸张，让好运文字慢慢显现</span>
            </span>
          </button>
        ) : (
          <div className="remuse-paper-reveal mt-6 min-h-[220px] rounded-[26px] border border-[#7a5327]/20 bg-[#fff5d8]/55 p-6">
            <p className="font-serif text-2xl leading-10 text-[#1d160d] md:text-3xl">{quote.english}</p>
            <p className="mt-6 text-lg font-medium leading-9 text-[#2f2414]">{quote.chinese}</p>
            <p className="mt-6 text-right font-mono text-xs uppercase tracking-[0.22em] text-[#7a5327]">-- {quote.source}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function LuckyFact({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-black/25 p-4">
      <div className="flex items-center gap-2 text-neutral-400">
        {icon}
        <span className="font-mono text-[11px] uppercase tracking-[0.2em]">{label}</span>
      </div>
      <p className="mt-3 text-sm leading-7 text-white">{value}</p>
    </div>
  );
}

function GiftGrid({ gifts, basePath }: { gifts: NfcGiftDemo[]; basePath: string }) {
  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {gifts.map((gift) => (
        <GiftPreviewCard key={gift.slug} gift={gift} basePath={basePath} />
      ))}
    </div>
  );
}

function GiftPreviewCard({ gift, basePath }: { gift: NfcGiftDemo; basePath: string }) {
  return (
    <a
      href={buildGiftHref(basePath, gift.slug)}
      className="group overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.045] transition-all hover:-translate-y-0.5 hover:border-remuse-accent/35"
    >
      <div
        className="p-3"
        style={{
          backgroundImage: `radial-gradient(circle at top left, ${gift.palette.glow}, transparent 38%), linear-gradient(180deg, rgba(10,13,16,0.98), rgba(5,6,8,0.98))`,
        }}
      >
        <div className="overflow-hidden rounded-[24px] border border-white/10 bg-black/20">
          <img
            src={gift.originalImageUrl}
            alt={gift.imageAlt}
            className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </div>
      </div>

      <div className="p-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-neutral-500">每日幸运物品</p>
        <h3 className="mt-3 font-display text-2xl font-bold tracking-[-0.04em] text-white">{gift.title}</h3>
        <p className="mt-3 line-clamp-2 text-sm leading-7 text-neutral-300">{gift.subtitle}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {gift.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-neutral-300">
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </a>
  );
}

function LuckyBackground({ accent = '#ccff00' }: { accent?: string }) {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#060707,#030404_54%,#071113)]" />
      <div
        className="absolute left-[-18%] top-[-20%] h-[520px] w-[520px] rounded-full blur-3xl"
        style={{ backgroundColor: accent, opacity: 0.16 }}
      />
      <div className="absolute bottom-[-22%] right-[-16%] h-[560px] w-[560px] rounded-full bg-remuse-secondary/10 blur-3xl" />
      <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:32px_32px]" />
    </div>
  );
}

function LuckyInlineStyles() {
  return (
    <style>
      {`
        @keyframes remusePaperReveal {
          0% { opacity: 0; transform: translateY(14px); filter: blur(8px); }
          100% { opacity: 1; transform: translateY(0); filter: blur(0); }
        }

        @keyframes remuseBurnWave {
          0% { transform: translateX(-45%) scaleX(0.7); opacity: 0; }
          35% { opacity: 0.78; }
          100% { transform: translateX(62%) scaleX(1.1); opacity: 0; }
        }

        .remuse-paper-reveal {
          animation: remusePaperReveal 820ms ease-out both;
        }

        .remuse-burn-wave::before {
          content: "";
          position: absolute;
          inset: -20% auto -20% 0;
          width: 34%;
          background:
            radial-gradient(circle at 50% 22%, rgba(255, 255, 255, 0.88), transparent 18%),
            radial-gradient(circle at 50% 50%, rgba(255, 194, 91, 0.62), transparent 34%),
            radial-gradient(circle at 50% 75%, rgba(255, 102, 43, 0.36), transparent 28%);
          mix-blend-mode: screen;
          filter: blur(14px);
          animation: remuseBurnWave 980ms ease-out both;
        }
      `}
    </style>
  );
}

export default NfcGiftExperience;
