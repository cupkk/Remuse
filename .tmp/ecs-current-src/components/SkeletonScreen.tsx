
import React from 'react';
import { ViewState } from '../types';

interface SkeletonScreenProps {
  view: ViewState;
}

const Bone: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`bg-neutral-800 animate-skeleton-pulse rounded ${className}`} />
);

/** Scanner skeleton */
const ScannerSkeleton: React.FC = () => (
  <div className="p-8 space-y-6 max-w-2xl mx-auto">
    <Bone className="h-10 w-40 mx-auto" />
    <Bone className="h-[300px] w-full clip-corner" />
    <div className="flex justify-center gap-4">
      <Bone className="h-10 w-28 rounded-full" />
      <Bone className="h-10 w-28 rounded-full" />
    </div>
  </div>
);

/** Museum / Gallery skeleton */
const GallerySkeleton: React.FC = () => (
  <div className="p-6 space-y-6">
    <div className="flex items-center justify-between">
      <Bone className="h-8 w-32" />
      <Bone className="h-8 w-20" />
    </div>
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Bone className="aspect-square w-full" />
          <Bone className="h-4 w-3/4" />
          <Bone className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  </div>
);

/** Item detail skeleton */
const DetailSkeleton: React.FC = () => (
  <div className="h-full flex flex-col lg:flex-row">
    <div className="w-full lg:w-1/3 bg-remuse-panel border-r border-remuse-border p-6 space-y-4">
      <Bone className="h-[200px] w-full" />
      <Bone className="h-6 w-2/3" />
      <Bone className="h-4 w-full" />
      <div className="grid grid-cols-2 gap-4 mt-6">
        <Bone className="h-16 w-full" />
        <Bone className="h-16 w-full" />
      </div>
    </div>
    <div className="flex-1 p-8 space-y-6">
      <Bone className="h-8 w-48" />
      <div className="grid grid-cols-3 gap-4">
        <Bone className="h-24 w-full" />
        <Bone className="h-24 w-full" />
        <Bone className="h-24 w-full" />
      </div>
      <Bone className="h-40 w-full" />
    </div>
  </div>
);

/** Generic card-list skeleton (Guide, Profile, StickerLib, Inspiration) */
const CardListSkeleton: React.FC = () => (
  <div className="p-6 space-y-6">
    <Bone className="h-8 w-40" />
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Bone className="aspect-[4/3] w-full rounded-lg" />
          <Bone className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  </div>
);

const SkeletonScreen: React.FC<SkeletonScreenProps> = ({ view }) => {
  const skeletonMap: Record<ViewState, React.ReactNode> = {
    SCANNER: <ScannerSkeleton />,
    MUSEUM: <GallerySkeleton />,
    ITEM_DETAIL: <DetailSkeleton />,
    LOGIN: <CardListSkeleton />,
    STICKER_LIBRARY: <CardListSkeleton />,
    INSPIRATION: <CardListSkeleton />,
    PROFILE: <CardListSkeleton />,
    MEMORY_RAG: <CardListSkeleton />,
  };

  return (
    <div className="h-full overflow-hidden" aria-busy="true" aria-label="加载中">
      {skeletonMap[view] || <CardListSkeleton />}
    </div>
  );
};

export default SkeletonScreen;
