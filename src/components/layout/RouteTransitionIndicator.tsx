'use client';

import { useNavigationLoading } from '@/context/NavigationLoadingContext';

const formatTargetLabel = (href: string | null) => {
  if (!href) return 'Loading...';
  if (href === '/') return 'Opening dashboard...';
  if (href.includes('/reports')) return 'Opening report...';
  if (href.includes('/project/')) return 'Opening project...';
  if (href.includes('/database')) return 'Opening database...';
  if (href.includes('/team')) return 'Opening team page...';
  if (href.includes('/settings')) return 'Opening settings...';
  return 'Loading...';
};

export function RouteTransitionIndicator() {
  const { isNavigating, targetHref } = useNavigationLoading();

  if (!isNavigating) return null;

  return (
    <div className="fixed inset-0 z-[71] flex items-center justify-center bg-black/10 backdrop-blur-[1px] cursor-wait">
      <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-2xl">
        <div className="relative h-7 w-7 flex-shrink-0 overflow-hidden">
          <div className="banter-loader">
            <div className="banter-loader__box" />
            <div className="banter-loader__box" />
            <div className="banter-loader__box" />
            <div className="banter-loader__box" />
            <div className="banter-loader__box" />
            <div className="banter-loader__box" />
            <div className="banter-loader__box" />
            <div className="banter-loader__box" />
            <div className="banter-loader__box" />
          </div>
        </div>
        <span className="text-xs font-medium text-slate-600">{formatTargetLabel(targetHref)}</span>
      </div>
    </div>
  );
}
