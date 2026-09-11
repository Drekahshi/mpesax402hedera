"use client";

import { usePathname } from 'next/navigation';
import BottomNav from '@/components/shared/BottomNav';

const FULLSCREEN_ROUTES = ['/nuvari', '/ai', '/chat'];

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isFullscreen = FULLSCREEN_ROUTES.some(r => pathname?.startsWith(r));

  if (isFullscreen) {
    return (
      <div style={{ width: '100%', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    );
  }

  return (
    <>
      {/* Full-bleed shell — no max-width cap so desktop fills the screen */}
      <div style={{ width: '100%', minHeight: '100dvh', position: 'relative' }}>
        {children}
      </div>
      <BottomNav />
    </>
  );
}
