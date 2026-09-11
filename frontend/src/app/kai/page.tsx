'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ExternalLink, Menu, X } from 'lucide-react';

const PAGES = [
  { label: 'Home',           file: 'index.html' },
  { label: 'Problem',        file: 'problems.html' },
  { label: 'Solution',       file: 'solution.html' },
  { label: 'Products',       file: 'products.html' },
  { label: 'Insurance',      file: 'insurance.html' },
  { label: 'Pension',        file: 'pension.html' },
  { label: 'Trust',          file: 'trust.html' },
  { label: 'Tokens',         file: 'tokens.html' },
  { label: 'Ecosystem',      file: 'ecosystem.html' },
  { label: 'DAO',            file: 'DAO.html' },
  { label: 'Business Canvas', file: 'bizcanvas.html' },
];

export default function KaiWebPage() {
  const [active, setActive] = useState(PAGES[0]);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#0a0a0c', fontFamily: 'inherit' }}>

      {/* ── Top Bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
        background: 'rgba(10,10,12,0.95)', borderBottom: '1px solid rgba(16,185,129,0.18)',
        backdropFilter: 'blur(16px)', flexShrink: 0, zIndex: 10,
      }}>
        <Link href="/" style={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center' }}>
          <ChevronLeft size={20} />
        </Link>

        <button
          onClick={() => setSidebarOpen(s => !s)}
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          {sidebarOpen ? <X size={15} color="#fff" /> : <Menu size={15} color="#fff" />}
        </button>

        {/* Breadcrumb */}
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700 }}>KAI Web</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: '0 6px' }}>›</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>{active.label}</span>
        </div>

        {/* Open in new tab */}
        <a
          href={`/kaiweb/${active.file}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in new tab"
          style={{ color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center' }}
        >
          <ExternalLink size={15} />
        </a>
      </div>

      {/* ── Body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar ── */}
        {sidebarOpen && (
          <aside style={{
            width: 210, flexShrink: 0, background: 'rgba(16,16,20,0.97)',
            borderRight: '1px solid rgba(16,185,129,0.12)', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 8px',
          }}>
            <p style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.3)', letterSpacing: 2, textTransform: 'uppercase', padding: '4px 8px 8px' }}>
              KAI Pages
            </p>
            {PAGES.map(p => (
              <button
                key={p.file}
                onClick={() => setActive(p)}
                style={{
                  textAlign: 'left', padding: '9px 12px', borderRadius: 8,
                  background: active.file === p.file ? 'rgba(16,185,129,0.15)' : 'transparent',
                  border: active.file === p.file ? '1px solid rgba(16,185,129,0.35)' : '1px solid transparent',
                  color: active.file === p.file ? '#10b981' : 'rgba(255,255,255,0.65)',
                  fontSize: 12, fontWeight: active.file === p.file ? 700 : 400,
                  cursor: 'pointer', transition: 'all 0.15s', width: '100%',
                }}
              >
                {p.label}
              </button>
            ))}
          </aside>
        )}

        {/* ── iFrame ── */}
        <iframe
          key={active.file}
          src={`/kaiweb/${active.file}`}
          title={active.label}
          style={{
            flex: 1, border: 'none', background: '#fff',
            width: '100%', height: '100%',
          }}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        />
      </div>
    </div>
  );
}
