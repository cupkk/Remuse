import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookImage,
  CheckCheck,
  Clock3,
  Copy,
  Gift,
  MapPin,
  Sparkles,
  Smartphone,
} from 'lucide-react';
import { NFC_GIFT_DEMOS, getNfcGiftDemo, type NfcGiftDemo } from '../shared/nfcGiftDemos';

interface GiftRouteState {
  slug: string | null;
}

interface NfcGiftExperienceProps {
  basePath?: string;
}

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

function buildHeroSurfaceStyle(gift: NfcGiftDemo) {
  return {
    backgroundImage: `radial-gradient(circle at top left, ${gift.palette.glow}, transparent 34%), linear-gradient(180deg, rgba(12,15,18,0.98), rgba(7,9,12,0.98))`,
  };
}

function buildPanelSurfaceStyle(gift: NfcGiftDemo) {
  return {
    backgroundImage: `linear-gradient(180deg, ${gift.palette.panelTint}, rgba(18,20,24,0.96))`,
    borderColor: 'rgba(255,255,255,0.08)',
  };
}

const badgeClassName =
  'inline-flex min-h-[36px] items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.24em]';

const pageShellClassName =
  'min-h-dvh overflow-x-clip bg-remuse-dark pb-[calc(env(safe-area-inset-bottom)+2.5rem)] text-white';

const cardSurfaceClassName =
  'rounded-[30px] border border-remuse-border bg-remuse-panel shadow-[0_20px_56px_rgba(0,0,0,0.22)]';

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

  useEffect(() => {
    if (activeGift) {
      document.title = `${activeGift.title} | REMUSE NFC Gift`;
      return;
    }

    document.title = route.slug ? '礼物未找到 | REMUSE NFC Gift' : 'REMUSE NFC Gift';
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
      <div className={pageShellClassName}>
        <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col px-4 py-5 safe-area-pt md:px-6 md:py-8">
          <a
            href={buildGiftHref(normalizedBasePath)}
            className="inline-flex min-h-[44px] items-center gap-2 self-start rounded-full border border-neutral-700 px-4 text-sm text-neutral-300 transition-colors hover:border-white hover:text-white"
          >
            <ArrowLeft size={16} />
            返回礼物入口
          </a>

          <div className={`mt-6 p-6 ${cardSurfaceClassName}`}>
            <div className="inline-flex items-center gap-2 rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.24em] text-red-200">
              <Gift size={14} />
              Gift Missing
            </div>
            <h1 className="mt-4 font-display text-3xl font-black tracking-[-0.04em] text-white">这份 NFC 礼物暂时打不开</h1>
            <p className="mt-3 text-sm leading-7 text-neutral-300">
              当前链接没有对应的礼物页面。你可以回到入口页，继续看看其它已经写入 NFC 的真实礼物。
            </p>
          </div>

          <div className="mt-6 space-y-4">
            {NFC_GIFT_DEMOS.map((gift) => (
              <GiftPreviewCard key={gift.slug} gift={gift} basePath={normalizedBasePath} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!activeGift) {
    return (
      <div className={pageShellClassName}>
        <div className="mx-auto w-full max-w-[1220px] px-4 py-5 safe-area-pt md:px-6 md:py-8">
          <section
            className="overflow-hidden rounded-[36px] border border-remuse-border p-5 shadow-[0_28px_90px_rgba(0,0,0,0.28)] md:p-7"
            style={{
              backgroundImage:
                'radial-gradient(circle at top left, rgba(204,255,0,0.16), transparent 30%), radial-gradient(circle at bottom right, rgba(0,255,255,0.12), transparent 28%), linear-gradient(180deg, rgba(12,15,18,0.98), rgba(7,9,12,0.98))',
            }}
          >
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)]">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`${badgeClassName} border-remuse-accent/25 bg-remuse-accent/10 text-remuse-accent`}>
                    <Gift size={14} />
                    NFC 小礼物
                  </span>
                  <span className={`${badgeClassName} border-remuse-secondary/25 bg-remuse-secondary/10 text-remuse-secondary`}>
                    <Smartphone size={14} />
                    真实图片 + 故事
                  </span>
                </div>

                <h1 className="mt-6 max-w-4xl font-display text-4xl font-black tracking-[-0.05em] text-white md:text-6xl">
                  轻触 NFC，
                  <span className="text-remuse-accent">打开一份我想送出去的小礼物</span>
                </h1>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-neutral-300 md:text-base">
                  每一枚 NFC 里，都留着一张真实原图、一张再生贴纸，和一段关于这件藏品的故事。
                  它不是一条冷冰冰的链接，更像是一份可以被轻轻递出去的数字礼物。
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <MetaStat title="真实保留" value="原图还在" detail="先看到它本来的样子，再看到它被重新整理成礼物后的样子。" />
                  <MetaStat title="故事留存" value="一物一故事" detail="旧物的来历、记忆和情绪线，会一起留在这一页里。" />
                  <MetaStat title="轻触即开" value="拿起就能看" detail="朋友轻触 NFC 就能打开，不需要安装 App，也不需要登录。" />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <FeaturePanel
                  title="收到的人会看到"
                  icon={<BookImage size={18} />}
                  accent="text-remuse-accent"
                  points={[
                    '一张真实原图，知道这件东西最开始是什么样子。',
                    '一张再生贴纸，让旧物变成更适合被送出去的样子。',
                    '一段小故事，让这份礼物不只是一张图片。',
                  ]}
                />
                <FeaturePanel
                  title="Re-Museum 做了什么"
                  icon={<Sparkles size={18} />}
                  accent="text-remuse-secondary"
                  points={[
                    '把旧物重新整理、重新讲述，而不是简单替换掉它。',
                    '用 AI 帮它做成贴纸和封面，但把真实原图继续保留下来。',
                    '让 NFC 变成一个可以轻轻打开的小小礼物入口。',
                  ]}
                />
              </div>
            </div>
          </section>

          <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {NFC_GIFT_DEMOS.map((gift) => (
              <GiftPreviewCard key={gift.slug} gift={gift} basePath={normalizedBasePath} />
            ))}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className={pageShellClassName}>
      <div className="mx-auto w-full max-w-[1180px] px-4 py-5 safe-area-pt md:px-6 md:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a
            href={buildGiftHref(normalizedBasePath)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-neutral-700 px-4 text-sm text-neutral-300 transition-colors hover:border-white hover:text-white"
          >
            <ArrowLeft size={16} />
            返回礼物入口
          </a>

          <button
            type="button"
            onClick={() => void handleCopyLink()}
            className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border border-remuse-accent/25 bg-remuse-accent/10 px-4 text-sm text-remuse-accent transition-colors hover:bg-remuse-accent/15"
          >
            {copied ? <CheckCheck size={16} /> : <Copy size={16} />}
            {copied ? '链接已复制' : '复制这份礼物'}
          </button>
        </div>

        <section
          className="mt-5 overflow-hidden rounded-[36px] border border-remuse-border p-5 shadow-[0_28px_90px_rgba(0,0,0,0.28)] md:p-7"
          style={buildHeroSurfaceStyle(activeGift)}
        >
          <div className="grid gap-8 xl:grid-cols-[minmax(320px,0.82fr)_minmax(0,1.18fr)] xl:items-center">
            <div className="mx-auto w-full max-w-[420px]">
              <div className="overflow-hidden rounded-[30px] border border-white/12 bg-black/20 p-3 shadow-[0_24px_64px_rgba(0,0,0,0.32)]">
                <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#0c1013]">
                  <img
                    src={activeGift.coverImageUrl}
                    alt={activeGift.coverAlt}
                    className="aspect-[5/7] w-full object-cover"
                  />
                </div>

                <div className="mt-4 rounded-[20px] border border-white/10 bg-white/5 px-4 py-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-neutral-500">A Page For You</p>
                  <p className="mt-2 text-sm leading-6 text-neutral-200">
                    这张封面只是第一页。我真正想放给你看的，是它原本的样子、后来变成的贴纸，
                    还有我舍不得丢掉的那一小段记忆。
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`${badgeClassName} border-remuse-accent/25 bg-remuse-accent/10 text-remuse-accent`}>
                  <Gift size={14} />
                  给你的小礼物
                </span>
              </div>

              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-neutral-500">给你的一页</p>
                <h1 className="mt-3 font-display text-4xl font-black tracking-[-0.05em] text-white md:text-5xl">
                  {activeGift.title}
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-300 md:text-base">{activeGift.subtitle}</p>
              </div>

              <div
                className="rounded-[26px] border border-white/10 bg-black/25 p-4"
                style={{ boxShadow: `0 0 0 1px ${activeGift.palette.glow} inset` }}
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-neutral-500">想先对你说</p>
                <p className="mt-3 text-sm leading-7 text-neutral-100">
                  如果你点开了这里，就当作我把这件喜欢的小东西认真递给你。
                  它不只是一个链接，更像是我想留给你看的一张原图、一张贴纸，
                  还有一小段一直想讲给你听的心事。
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <GiftFact label="藏品原名" value={activeGift.sourceItemName} icon={<BookImage size={16} />} />
                <GiftFact label="物件材质" value={activeGift.sourceMaterial} icon={<MapPin size={16} />} />
                <GiftFact label="留存时间" value={activeGift.generatedAtLabel} icon={<Clock3 size={16} />} />
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 md:grid-cols-2">
          <ArtifactCard
            title="藏品原图"
            subtitle="我先把它本来的样子给你看"
            imageUrl={activeGift.originalImageUrl}
            imageAlt={activeGift.imageAlt}
            gift={activeGift}
            caption={activeGift.sourceItemName}
          />
          <ArtifactCard
            title="再生贴纸"
            subtitle="后来，我又把它换了一种方式送给你"
            imageUrl={activeGift.stickerImageUrl}
            imageAlt={activeGift.stickerAlt}
            gift={activeGift}
            caption={activeGift.stickerCaption}
            preserveTransparency
          />
        </section>

        <section className={`mt-6 p-5 md:p-6 ${cardSurfaceClassName}`} style={buildPanelSurfaceStyle(activeGift)}>
          <div className="flex items-center gap-2 text-remuse-secondary">
            <BookImage size={18} />
            <p className="font-mono text-[11px] uppercase tracking-[0.24em]">Three Small Notes</p>
          </div>
          <h2 className="mt-3 font-display text-2xl font-bold text-white">想留给你的三句话</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-300">
            我把关于它的三句话放在这里给你看：它原本带着什么记忆，后来被重新想象成了什么样子，
            最后还有一句，是我更想送给你的。
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <StoryBeat
              label="01"
              title="它原本的样子"
              content={activeGift.sourceStory}
              accent={activeGift.palette.spotlight}
            />
            <StoryBeat
              label="02"
              title="后来变成了什么"
              content={activeGift.analyzedStory || activeGift.subtitle}
              accent={activeGift.palette.spotlight}
            />
            <StoryBeat
              label="03"
              title="最后想留给你"
              content={activeGift.stickerCaption}
              accent={activeGift.palette.spotlight}
            />
          </div>
        </section>

        <section className={`mt-6 p-5 md:p-6 ${cardSurfaceClassName}`}>
          <div className="flex items-center gap-2 text-remuse-secondary">
            <Gift size={18} />
            <p className="font-mono text-[11px] uppercase tracking-[0.24em]">More Little Gifts</p>
          </div>
          <h2 className="mt-3 font-display text-2xl font-bold text-white">也看看别的小礼物吧</h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {NFC_GIFT_DEMOS.filter((gift) => gift.slug !== activeGift.slug).map((gift) => (
              <GiftPreviewCard key={gift.slug} gift={gift} basePath={normalizedBasePath} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

function GiftPreviewCard({ gift, basePath }: { gift: NfcGiftDemo; basePath: string }) {
  return (
    <a
      href={buildGiftHref(basePath, gift.slug)}
      className="group overflow-hidden rounded-[28px] border border-remuse-border bg-remuse-panel transition-all hover:-translate-y-0.5 hover:border-remuse-accent/35"
    >
      <div
        className="p-3"
        style={{
          backgroundImage: `radial-gradient(circle at top left, ${gift.palette.glow}, transparent 34%), linear-gradient(180deg, rgba(12,15,18,0.98), rgba(7,9,12,0.98))`,
        }}
      >
        <div className="overflow-hidden rounded-[22px] border border-white/10 bg-black/20">
          <img
            src={gift.coverImageUrl}
            alt={gift.coverAlt}
            className="aspect-[5/6] w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        </div>
      </div>

      <div className="p-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-neutral-500">送你的小礼物</p>

        <h3 className="mt-3 font-display text-2xl font-bold text-white">{gift.title}</h3>
        <p className="mt-3 line-clamp-3 text-sm leading-7 text-neutral-300">{gift.subtitle}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {gift.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-neutral-300">
              #{tag}
            </span>
          ))}
        </div>

        <div className="mt-5 inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border border-remuse-accent/25 bg-remuse-accent/10 px-4 text-sm text-remuse-accent transition-colors group-hover:bg-remuse-accent/15">
          点开看看
          <ArrowLeft size={16} className="rotate-180" />
        </div>
      </div>
    </a>
  );
}

function MetaStat({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-neutral-500">{title}</p>
      <p className="mt-3 font-display text-2xl font-bold text-white">{value}</p>
      <p className="mt-2 text-sm leading-7 text-neutral-300">{detail}</p>
    </div>
  );
}

function FeaturePanel({
  title,
  icon,
  accent,
  points,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  points: string[];
}) {
  return (
    <section className="rounded-[28px] border border-white/8 bg-black/20 p-5">
      <div className={`flex items-center gap-2 ${accent}`}>
        {icon}
        <p className="font-mono text-[11px] uppercase tracking-[0.24em]">{title}</p>
      </div>

      <div className="mt-4 space-y-3">
        {points.map((point) => (
          <div key={point} className="rounded-[20px] border border-white/8 bg-black/20 p-3 text-sm leading-7 text-neutral-300">
            {point}
          </div>
        ))}
      </div>
    </section>
  );
}

function ArtifactCard({
  title,
  subtitle,
  imageUrl,
  imageAlt,
  gift,
  caption,
  preserveTransparency = false,
}: {
  title: string;
  subtitle: string;
  imageUrl: string;
  imageAlt: string;
  gift: NfcGiftDemo;
  caption?: string;
  preserveTransparency?: boolean;
}) {
  return (
    <section className={`p-5 md:p-6 ${cardSurfaceClassName}`} style={buildPanelSurfaceStyle(gift)}>
      <div className="flex items-center gap-2 text-remuse-accent">
        <BookImage size={18} />
        <p className="font-mono text-[11px] uppercase tracking-[0.24em]">{title}</p>
      </div>
      <p className="mt-3 text-sm text-neutral-400">{subtitle}</p>

      <div className={`mt-5 overflow-hidden rounded-[24px] border border-white/8 ${preserveTransparency ? 'bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.06),transparent_28%),linear-gradient(180deg,rgba(9,12,14,0.98),rgba(4,6,8,0.98))]' : 'bg-black/20'}`}>
        <img src={imageUrl} alt={imageAlt} className="aspect-[5/6] w-full object-cover" />
      </div>

      {caption ? <p className="mt-4 whitespace-pre-line text-sm leading-7 text-neutral-200">{caption}</p> : null}
    </section>
  );
}

function GiftFact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-black/18 p-4">
      <div className="flex items-center gap-2 text-neutral-400">
        {icon}
        <span className="text-xs uppercase tracking-[0.18em]">{label}</span>
      </div>
      <p className="mt-3 text-sm leading-7 text-white">{value}</p>
    </div>
  );
}

function StoryBeat({
  label,
  title,
  content,
  accent,
}: {
  label: string;
  title: string;
  content: string;
  accent: string;
}) {
  return (
    <article className="rounded-[24px] border border-white/8 bg-black/15 p-4">
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-mono font-bold text-black"
          style={{ backgroundColor: accent }}
        >
          {label}
        </div>
        <h3 className="font-display text-lg font-bold text-white">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-7 text-neutral-300">{content}</p>
    </article>
  );
}

export default NfcGiftExperience;
