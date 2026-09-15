'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Newspaper, Mic, BookOpen,
  Play, Pause, Heart, DollarSign,
  Search, RefreshCw, ChevronRight, Zap,
  Leaf, TrendingUp, Eye,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
type ContentType = 'ARTICLE' | 'FIELD_JOURNAL' | 'AUDIO_PODCAST' | 'MARKET_NEWS' | 'EDUCATIONAL_GUIDE';
type Category    = 'ALL' | 'FORESTRY_MRV' | 'MSME_GROWTH' | 'CHAMA_SAVINGS' | 'AGRI_MARKET';

interface Post {
  id: string; slug: string; title: string; summary: string;
  contentType: ContentType; category: Category;
  creator: string; badge: string; publishedAt: string;
  viewsCount: number; likesCount: number; tipsEarnedKes: number;
  audioDurationSeconds?: number; audioUrl?: string;
  language: string; tags: string[];
}

// ── Design tokens (kaiweb palette, box-less editorial) ─────────────────────
const C = {
  bg:        '#0B1C14',
  card:      '#0F2419',
  pineDeep:  '#0A2A20',
  pine:      '#0F3D2E',
  pineLight: '#2D5A3D',
  gold:      '#C89B3C',
  goldLight: '#E4C878',
  clay:      '#9C4B2D',
  paper:     '#F6F2E7',
  paperDim:  '#EFE9D9',
  ink:       '#1B1A14',
  inkLight:  '#9BA396',
  hairline:  'rgba(200,155,60,0.14)',
};

const MONO  = { fontFamily: "'IBM Plex Mono', monospace" } as const;
const SERIF = { fontFamily: "'Fraunces', serif" } as const;

// ── Seed data ──────────────────────────────────────────────────────────────
const SEED_POSTS: Post[] = [
  { id:'p1', slug:'bamboo-dry-season-care', title:'Protecting Bamboo Seedlings in the Dry Season',
    summary:'Guardians share tips to keep bamboo alive in Kenya\'s dry spell: mulching, watering, and shading.',
    contentType:'FIELD_JOURNAL', category:'FORESTRY_MRV', creator:'Grace Wangari', badge:'COMMUNITY_REPORTER', publishedAt:'2026-08-28', viewsCount:341, likesCount:47, tipsEarnedKes:1200, language:'EN', tags:['Bamboo','MRV','Dry Season'] },
  { id:'p2', slug:'ybob-chama-yield', title:'How Our Chama Earned 18% APY With yBOB Vault',
    summary:'One chama moved savings into the yBOB vault and now gets monthly KES payouts.',
    contentType:'ARTICLE', category:'CHAMA_SAVINGS', creator:'Wanjiru Kamau', badge:'CHAMA_MENTOR', publishedAt:'2026-08-27', viewsCount:512, likesCount:89, tipsEarnedKes:2400, language:'SW', tags:['yBOB','Chama','Yield'] },
  { id:'p3', slug:'dap-fertiliser-market-aug26', title:'DAP Fertiliser Price Alert: Eldoret Market',
    summary:'DAP surged 12% this week on port delays. Farmers: buy in bulk through a co-op.',
    contentType:'MARKET_NEWS', category:'AGRI_MARKET', creator:'Daniel Ruto', badge:'JOURNALIST', publishedAt:'2026-08-26', viewsCount:728, likesCount:130, tipsEarnedKes:3100, language:'EN', tags:['Fertiliser','Prices','Market'] },
  { id:'p4', slug:'kai-ledger-voice-guide', title:'KAI Smart Ledger: Voice Guide for Traders',
    summary:'Record daily sales, credit, and stock by voice. No internet needed.',
    contentType:'AUDIO_PODCAST', category:'MSME_GROWTH', creator:'Beatrice Mutua', badge:'AGRI_EXPERT', publishedAt:'2026-08-25', viewsCount:215, likesCount:38, tipsEarnedKes:900, audioDurationSeconds:482, language:'SW', tags:['Ledger','Voice','MSME'] },
  { id:'p5', slug:'rwa-invoice-token-guide', title:'Tokenise Your Unpaid Invoice: Step by Step',
    summary:'Turn an unpaid invoice into a token and get instant KES working capital.',
    contentType:'EDUCATIONAL_GUIDE', category:'MSME_GROWTH', creator:'Joseph Kimani', badge:'AGRI_EXPERT', publishedAt:'2026-08-24', viewsCount:403, likesCount:62, tipsEarnedKes:1800, language:'EN', tags:['RWA','Invoice','Finance'] },
  { id:'p6', slug:'honey-reserve-season-2026', title:'Honey Harvest Season: Turkana Beekeepers Join KAI',
    summary:'500kg of certified honey is now on the KAI registry, unlocking 14% APY for beekeepers.',
    contentType:'FIELD_JOURNAL', category:'FORESTRY_MRV', creator:'Fatuma Hassan', badge:'COMMUNITY_REPORTER', publishedAt:'2026-08-23', viewsCount:290, likesCount:54, tipsEarnedKes:1500, language:'EN', tags:['Honey','GAMI','Forest'] },
  { id:'p7', slug:'carbon-credits-mau-2026', title:'Mau Forest CFA Earns 8,420 Carbon Credits on Ethereum & Hedera',
    summary:'Patrol logs anchored on-chain auto-minted 8,420 carbon credits.',
    contentType:'ARTICLE', category:'FORESTRY_MRV', creator:'Agnes Chebet', badge:'COMMUNITY_REPORTER', publishedAt:'2026-08-22', viewsCount:617, likesCount:98, tipsEarnedKes:2800, language:'EN', tags:['Carbon','Blockchain','MRV'] },
  { id:'p8', slug:'chama-investment-pool-podcast', title:'Group Investment Basics for SACCO Members',
    summary:'How M-Pesa savings become yBOB, grow in vaults, and pay out monthly.',
    contentType:'AUDIO_PODCAST', category:'CHAMA_SAVINGS', creator:'Akinyi Odhiambo', badge:'CHAMA_MENTOR', publishedAt:'2026-08-21', viewsCount:189, likesCount:29, tipsEarnedKes:700, audioDurationSeconds:720, language:'SW', tags:['SACCO','DeFi','Audio'] },
];

// ── Config ─────────────────────────────────────────────────────────────────
const CATEGORIES: { id: Category; label: string }[] = [
  { id:'ALL',           label:'All' },
  { id:'FORESTRY_MRV',  label:'Forest' },
  { id:'MSME_GROWTH',   label:'Business' },
  { id:'CHAMA_SAVINGS', label:'Chama' },
  { id:'AGRI_MARKET',   label:'Market' },
];

const TYPE_CFG: Record<ContentType, { icon: React.ReactNode; label: string }> = {
  ARTICLE:           { icon:<Newspaper size={11} />,  label:'Article' },
  FIELD_JOURNAL:     { icon:<Leaf size={11} />,        label:'Journal' },
  AUDIO_PODCAST:     { icon:<Mic size={11} />,         label:'Podcast' },
  MARKET_NEWS:       { icon:<TrendingUp size={11} />,  label:'Market' },
  EDUCATIONAL_GUIDE: { icon:<BookOpen size={11} />,    label:'Guide' },
};

function fmt(secs: number) {
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// ── Audio hook ─────────────────────────────────────────────────────────────
function useAudio(url?: string) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const toggle = () => {
    if (!ref.current) { ref.current = new Audio(url); ref.current.onended = () => setPlaying(false); }
    if (playing) { ref.current.pause(); setPlaying(false); }
    else         { ref.current.play().catch(() => {}); setPlaying(true); }
  };
  return { playing, toggle };
}

// ── Stat highlight ─────────────────────────────────────────────────────────
function Stat({ icon, value, label, accent }: { icon: React.ReactNode; value: string; label: string; accent?: boolean }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {icon}
      </span>
      <span style={{
        ...SERIF,
        fontSize: 20, fontWeight: 600, letterSpacing: '-0.3px',
        color: accent ? C.goldLight : C.paper,
      }}>
        {value}
      </span>
      <span style={{ ...MONO, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: C.inkLight }}>
        {label}
      </span>
    </span>
  );
}

// ── Post row (editorial, no box) ───────────────────────────────────────────
function PostRow({ post, idx, onLike, onTip }: { post: Post; idx: number; onLike:(id:string)=>void; onTip:(p:Post)=>void }) {
  const tc  = TYPE_CFG[post.contentType];
  const cat = CATEGORIES.find(c => c.id === post.category);
  const { playing, toggle } = useAudio(post.audioUrl);
  const isPodcast = post.contentType === 'AUDIO_PODCAST';
  const [liked, setLiked] = useState(false);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 + idx * 0.05, duration: 0.3 }}
      style={{
        padding: '30px 8px',
        borderBottom: `1px solid ${C.hairline}`,
      }}
    >
      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
        <span style={{ ...MONO, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: C.goldLight, display: 'flex', alignItems: 'center', gap: 5 }}>
          {tc.icon} {tc.label}
        </span>
        {cat && cat.id !== 'ALL' && (
          <span style={{ ...MONO, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: C.inkLight }}>
            {cat.label}
          </span>
        )}
        <span style={{ fontSize: 12, color: C.inkLight }}>
          {post.publishedAt}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: C.inkLight }}>
          By <b style={{ color: C.paper, fontWeight: 700 }}>{post.creator}</b>
        </span>
      </div>

      {/* Title */}
      <h3 style={{ ...SERIF, fontSize: 26, fontWeight: 600, color: C.paper, margin: '0 0 10px', lineHeight: 1.3, maxWidth: 860 }}>
        {post.title}
      </h3>

      {/* Summary */}
      <p style={{ fontSize: 15, color: 'rgba(246,242,231,0.72)', lineHeight: 1.7, margin: '0 0 18px', maxWidth: 820 }}>
        {post.summary}
      </p>

      {/* Podcast player */}
      {isPodcast && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, maxWidth: 520 }}>
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={toggle}
            style={{
              width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: playing ? C.pineLight : C.gold,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            {playing ? <Pause size={16} color="#0A1912" /> : <Play size={16} color="#0A1912" style={{ marginLeft: 2 }} />}
          </motion.button>
          <div style={{ flex: 1 }}>
            <p style={{ ...MONO, fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: C.goldLight, margin: '0 0 2px' }}>
              Audio Journal
            </p>
            <p style={{ fontSize: 12, color: C.inkLight, margin: 0 }}>
              {post.audioDurationSeconds ? fmt(post.audioDurationSeconds) : '-'} | {post.language === 'SW' ? 'Swahili' : 'English'}
            </p>
          </div>
          <Mic size={14} color="rgba(200,155,60,0.6)" />
        </div>
      )}

      {/* Highlighted key figures */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap', marginBottom: 16 }}>
        <Stat icon={<Eye size={14} color={C.goldLight} />} value={post.viewsCount.toLocaleString()} label="views" />
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span
            role="button"
            aria-pressed={liked}
            onClick={() => {
              if (liked) return;
              setLiked(true);
              onLike(post.id);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: liked ? 'default' : 'pointer' }}
          >
            <Heart size={14} color={liked ? C.clay : C.goldLight} style={{ fill: liked ? C.clay : 'none', transition: 'fill 0.15s' }} />
          </span>
          <span style={{ ...SERIF, fontSize: 20, fontWeight: 600, letterSpacing: '-0.3px', color: C.paper }}>
            {post.likesCount + (liked ? 1 : 0)}
          </span>
          <span style={{ ...MONO, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: C.inkLight }}>likes</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <DollarSign size={15} color={C.gold} />
          </span>
          <span style={{ ...SERIF, fontSize: 20, fontWeight: 600, letterSpacing: '-0.3px', color: C.goldLight }}>
            KES {post.tipsEarnedKes.toLocaleString()}
          </span>
          <span style={{ ...MONO, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: C.inkLight }}>earned</span>
        </span>

        {/* Tags */}
        <span style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          {post.tags.slice(0, 2).map(t => (
            <span key={t} style={{ ...MONO, fontSize: 10, letterSpacing: 0.5, color: C.inkLight }}>#{t}</span>
          ))}
        </span>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onTip(post)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: C.gold, color: C.ink, fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
          }}
        >
          <DollarSign size={13} /> Tip {post.creator.split(' ')[0]}
        </motion.button>
      </div>
    </motion.article>
  );
}

// ── Tip modal ──────────────────────────────────────────────────────────────
function TipModal({ post, onClose, onPaid, onNeedPayout }: {
  post: Post;
  onClose: () => void;
  onPaid: (postId: string, amountKes: number) => void;
  onNeedPayout: (creator: string) => void;
}) {
  const [amount, setAmount] = useState('100');
  const [email, setEmail]   = useState('');
  const [status, setStatus] = useState<'idle' | 'paying' | 'awaiting' | 'success' | 'error'>('idle');
  const [msg, setMsg]       = useState('');
  const [needPayout, setNeedPayout] = useState(false);

  const handlePay = async () => {
    const amt = Math.round(Number(amount));
    if (!amt || amt < 1) { setStatus('error'); setMsg('Enter a valid tip amount.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setStatus('error'); setMsg('Enter a valid email address for the receipt.'); return; }

    setStatus('paying');
    setMsg('Opening secure payment...');
    try {
      const res = await fetch('/api/hub/tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, amountKes: amt, creator: post.creator, postTitle: post.title, slug: post.slug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment could not be started');

      window.open(data.authorizationUrl, '_blank');
      setStatus('awaiting');
      setMsg(`Complete payment for KES ${data.amountKes} in the Paystack tab (M-Pesa or card).`);

      let attempts = 0;
      const id = setInterval(async () => {
        attempts++;
        try {
          const r    = await fetch(`/api/paystack/verify?reference=${data.reference}`);
          const poll = await r.json();
          if (poll.status === 'success') {
            clearInterval(id);
            const pdRes = await fetch('/api/hub/tip/payout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reference: data.reference }),
            }).catch(() => null);
            const pd = pdRes ? await pdRes.json() : null;
            if (pd?.status === 'no_account') {
              setNeedPayout(true);
              setStatus('success');
              setMsg(`Tip confirmed! ${post.creator} has no payout account yet, so this tip is held. Register theirs to release the funds.`);
              onPaid(post.id, amt);
              return;
            }
            setStatus('success');
            setMsg(pd?.status === 'paid'
              ? `Tip confirmed! KES ${poll.amountKes?.toLocaleString() ?? data.amountKes} auto-sent to ${post.creator}.`
              : `Tip confirmed! KES ${poll.amountKes?.toLocaleString() ?? data.amountKes} reserved for ${post.creator}.`);
            onPaid(post.id, amt);
            setTimeout(onClose, 2200);
          } else if (poll.status === 'failed' || poll.status === 'abandoned') {
            clearInterval(id);
            setStatus('error');
            setMsg(`Payment ${poll.status}. You can try again.`);
          } else if (attempts >= 18) {
            clearInterval(id);
            setStatus('awaiting');
            setMsg('Waiting for confirmation. Check your email for the Paystack receipt.');
          }
        } catch { /* ignore polling errors */ }
      }, 5000);
    } catch (e: unknown) {
      setStatus('error');
      setMsg(e instanceof Error ? e.message.slice(0, 160) : 'Payment could not be started.');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(4,10,7,0.78)',
        padding: 20, overflowY: 'auto',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0,  opacity: 1 }}
        exit={{ y: 24,    opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        style={{
          width: '100%', maxWidth: 460,
          background: C.pineDeep,
          borderRadius: 14,
          padding: '30px 28px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 20 }}>
          <div style={{
            width: 46, height: 46, borderRadius: '50%',
            background: C.pineLight,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 19, fontWeight: 700, color: C.paper,
          }}>
            {post.creator.charAt(0)}
          </div>
          <div>
            <p style={{ ...SERIF, fontSize: 18, fontWeight: 600, color: C.paper, margin: 0 }}>Tip {post.creator}</p>
            <p style={{ fontSize: 12, color: C.inkLight, margin: 0 }}>{post.title.slice(0, 42)}…</p>
          </div>
        </div>

        <p style={{ ...MONO, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: C.goldLight, marginBottom: 10 }}>Amount (KES)</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {['50','100','250','500'].map(a => (
            <motion.button
              key={a}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setAmount(a)}
              style={{
                flex: 1, padding: '11px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: amount === a ? C.gold : 'rgba(255,255,255,0.05)',
                color: amount === a ? C.ink : C.paperDim,
                fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
                transition: 'background 0.15s, color 0.15s',
              }}
            >KES {a}</motion.button>
          ))}
        </div>

        <input
          value={amount}
          onChange={e => setAmount(e.target.value)}
          type="number"
          placeholder="Custom amount"
          disabled={status === 'paying' || status === 'awaiting' || status === 'success'}
          style={{
            width: '100%', background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${C.hairline}`,
            borderRadius: 8, padding: '12px 14px',
            fontSize: 15, color: C.paper, outline: 'none',
            fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 10,
          }}
        />

        <input
          value={email}
          onChange={e => setEmail(e.target.value)}
          type="email"
          placeholder="Your email (for the receipt)"
          disabled={status === 'paying' || status === 'awaiting' || status === 'success'}
          style={{
            width: '100%', background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${C.hairline}`,
            borderRadius: 8, padding: '12px 14px',
            fontSize: 15, color: C.paper, outline: 'none',
            fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 10,
          }}
        />

        {msg && (
          <p style={{
            fontSize: 12, lineHeight: 1.5, margin: '0 0 10px',
            color: status === 'success' ? C.goldLight : status === 'error' ? C.clay : C.inkLight,
          }}>
            {msg}
          </p>
        )}

        {needPayout && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => { onNeedPayout(post.creator); onClose(); }}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
              background: C.paper, color: C.ink, fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
              marginBottom: 10,
            }}
          >
            Register {post.creator.split(' ')[0]}'s payout account
          </motion.button>
        )}

        <motion.button
          whileHover={status === 'idle' || status === 'error' ? { scale: 1.02 } : {}}
          whileTap={status === 'idle' || status === 'error' ? { scale: 0.97 } : {}}
          onClick={handlePay}
          disabled={status === 'paying' || status === 'awaiting' || status === 'success'}
          style={{
            width: '100%', padding: '14px 0', borderRadius: 9, border: 'none',
            cursor: (status === 'paying' || status === 'awaiting' || status === 'success') ? 'default' : 'pointer',
            background: status === 'success' ? C.pineLight : C.gold,
            color: status === 'success' ? C.paper : C.ink,
            fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
          }}
        >
          {status === 'success'   ? 'Tip Sent!'
           : status === 'paying'  ? 'Starting payment...'
           : status === 'awaiting'? 'Waiting for payment...'
           : `Pay KES ${amount} with M-Pesa / Card`}
        </motion.button>

        <button
          onClick={onClose}
          disabled={status === 'paying' || status === 'awaiting'}
          style={{
            width: '100%', marginTop: 10, padding: '12px 0', borderRadius: 9, border: 'none',
            background: 'rgba(255,255,255,0.05)',
            color: C.paperDim, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >Cancel</button>
      </motion.div>
    </motion.div>
  );
}

// ── Payout account modal ────────────────────────────────────────────────────
function PayoutModal({ initialCreator, onClose }: { initialCreator: string; onClose: () => void }) {
  const [name, setName]       = useState(initialCreator);
  const [type, setType]       = useState<'mobile_money' | 'kepss'>('mobile_money');
  const [bankAccounts, setBankAccounts] = useState<{ name: string; code: string }[]>([]);
  const [bankCode, setBankCode]         = useState('MPESA');
  const [accountNumber, setAccountNumber] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [msg, setMsg]       = useState('');

  useEffect(() => {
    if (type === 'mobile_money') { setBankCode('MPESA'); return; }
    setBankCode('');
    fetch('/api/hub/payout/banks')
      .then(r => r.json())
      .then(d => setBankAccounts((d.bankAccounts ?? []).map((b: { name: string; code: string }) => ({ name: b.name, code: b.code }))))
      .catch(() => setBankAccounts([]));
  }, [type]);

  const handleSave = async () => {
    const account = accountNumber.trim();
    if (!name.trim())        { setStatus('error'); setMsg('Enter the creator name.'); return; }
    if (!account)            { setStatus('error'); setMsg('Enter the account number or phone.'); return; }
    if (type === 'mobile_money' && !/^(\+?254|0)?\d{9}$/.test(account.replace(/\s/g, ''))) {
      setStatus('error'); setMsg('Enter a valid Kenyan phone number, e.g. 0712345678 or 254712345678.'); return;
    }
    if (type === 'kepss' && !bankCode) { setStatus('error'); setMsg('Select the creator\'s bank.'); return; }

    setStatus('saving');
    setMsg('Registering payout account with Paystack...');
    try {
      const res = await fetch('/api/hub/payout/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), payoutType: type, accountNumber: account, bankCode, accountName: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      setStatus('success');
      setMsg(`Payout account registered. Future tips to ${name.trim()} are auto-sent to ${account}.`);
    } catch (e: unknown) {
      setStatus('error');
      setMsg(e instanceof Error ? e.message.slice(0, 160) : 'Registration failed.');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(4,10,7,0.82)',
        padding: 20, overflowY: 'auto',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0,  opacity: 1 }}
        exit={{ y: 24,    opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        style={{
          width: '100%', maxWidth: 460,
          background: C.pineDeep,
          borderRadius: 14,
          padding: '30px 28px',
        }}
      >
        <p style={{ ...SERIF, fontSize: 20, fontWeight: 600, color: C.paper, margin: '0 0 4px' }}>
          Creator payout account
        </p>
        <p style={{ fontSize: 12, color: C.inkLight, lineHeight: 1.5, margin: '0 0 20px' }}>
          Where tips are auto-sent via Paystack Transfer (KES, M-Pesa or bank).
        </p>

        <p style={{ ...MONO, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: C.goldLight, marginBottom: 8 }}>Creator name</p>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Grace Wangari"
          disabled={status === 'success'}
          style={{
            width: '100%', background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${C.hairline}`, borderRadius: 8, padding: '12px 14px',
            fontSize: 15, color: C.paper, outline: 'none', fontFamily: 'inherit',
            boxSizing: 'border-box', marginBottom: 12,
          }}
        />

        <p style={{ ...MONO, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: C.goldLight, marginBottom: 8 }}>Payout type</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {(['mobile_money', 'kepss'] as const).map(t => (
            <motion.button
              key={t}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setType(t)}
              style={{
                flex: 1, padding: '12px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: type === t ? C.gold : 'rgba(255,255,255,0.05)',
                color: type === t ? C.ink : C.paperDim,
                fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {t === 'mobile_money' ? 'M-Pesa' : 'Bank account'}
            </motion.button>
          ))}
        </div>

        {type === 'kepss' && (
          <>
            <p style={{ ...MONO, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: C.goldLight, marginBottom: 8 }}>Bank</p>
            <select
              value={bankCode}
              onChange={e => setBankCode(e.target.value)}
              disabled={status === 'success'}
              style={{
                width: '100%', background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${C.hairline}`, borderRadius: 8, padding: '12px 14px',
                fontSize: 15, color: C.paper, outline: 'none', fontFamily: 'inherit',
                boxSizing: 'border-box', marginBottom: 12,
              }}
            >
              <option value="" style={{ color: C.ink }}>Select bank…</option>
              {bankAccounts.map(b => (
                <option key={b.code} value={b.code} style={{ color: C.ink }}>{b.name}</option>
              ))}
            </select>
          </>
        )}

        <input
          value={accountNumber}
          onChange={e => setAccountNumber(e.target.value)}
          placeholder={type === 'mobile_money' ? 'M-Pesa phone number, e.g. 0712345678' : 'Bank account number'}
          disabled={status === 'success'}
          style={{
            width: '100%', background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${C.hairline}`, borderRadius: 8, padding: '12px 14px',
            fontSize: 15, color: C.paper, outline: 'none', fontFamily: 'inherit',
            boxSizing: 'border-box', marginBottom: 12,
          }}
        />

        {msg && (
          <p style={{
            fontSize: 12, lineHeight: 1.5, margin: '0 0 12px',
            color: status === 'success' ? C.goldLight : status === 'error' ? C.clay : C.inkLight,
          }}>
            {msg}
          </p>
        )}

        <motion.button
          whileHover={status !== 'saving' && status !== 'success' ? { scale: 1.02 } : {}}
          whileTap={status !== 'saving' && status !== 'success' ? { scale: 0.97 } : {}}
          onClick={handleSave}
          disabled={status === 'saving' || status === 'success'}
          style={{
            width: '100%', padding: '14px 0', borderRadius: 9, border: 'none',
            cursor: (status === 'saving' || status === 'success') ? 'default' : 'pointer',
            background: status === 'success' ? C.pineLight : C.gold,
            color: status === 'success' ? C.paper : C.ink,
            fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
          }}
        >
          {status === 'success' ? 'Registered!' : status === 'saving' ? 'Registering...' : 'Register payout account'}
        </motion.button>

        <button
          onClick={onClose}
          style={{
            width: '100%', marginTop: 10, padding: '12px 0', borderRadius: 9, border: 'none',
            background: 'rgba(255,255,255,0.05)',
            color: C.paperDim, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >Close</button>
      </motion.div>
    </motion.div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function HubPage() {
  const [category, setCategory] = useState<Category>('ALL');
  const [search,   setSearch]   = useState('');
  const [posts,    setPosts]    = useState<Post[]>(SEED_POSTS);
  const [loading,  setLoading]  = useState(false);
  const [tipPost,  setTipPost]  = useState<Post | null>(null);
  const [payoutFor, setPayoutFor] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category !== 'ALL') params.set('category', category);
      if (search.trim())       params.set('q', search.trim());
      const r = await fetch(`/api/hub/feed?${params}`);
      if (r.ok) { const d = await r.json(); if (d.posts?.length) setPosts(d.posts); }
    } catch { /* use seed */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [category]);

  const filtered = posts.filter(p => {
    const matchCat = category === 'ALL' || p.category === category;
    const q = search.trim().toLowerCase();
    const matchQ = !q || p.title.toLowerCase().includes(q) || p.summary.toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  const handleLike = (id: string) =>
    setPosts(ps => ps.map(p => p.id === id ? { ...p, likesCount: p.likesCount + 1 } : p));

  const handlePaid = (id: string, amountKes: number) =>
    setPosts(ps => ps.map(p => p.id === id ? { ...p, tipsEarnedKes: p.tipsEarnedKes + amountKes } : p));

  const featuredPost = filtered[0];
  const feedPosts    = filtered.slice(1);

  const totalViews = posts.reduce((a, p) => a + p.viewsCount, 0);
  const totalLikes = posts.reduce((a, p) => a + p.likesCount, 0);
  const totalTips  = posts.reduce((a, p) => a + p.tipsEarnedKes, 0);
  const creators   = new Set(posts.map(p => p.creator)).size;

  return (
    <main style={{
      minHeight: '100dvh', background: C.bg,
      color: C.paper, fontFamily: "'IBM Plex Sans', sans-serif",
      paddingBottom: 80,
    }}>
      {/* kaiweb fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap');
      `}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px' }}>

        {/* ── Masthead ── */}
        <header style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '30px 0 22px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: C.gold, color: C.ink, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 17,
            }}>K</div>
            <div>
              <h1 style={{ ...SERIF, fontSize: 28, fontWeight: 600, color: C.paper, margin: 0, lineHeight: 1.05 }}>
                Community Info Hub
              </h1>
              <p style={{ ...MONO, fontSize: 10, letterSpacing: 1.4, color: C.goldLight, margin: '4px 0 0' }}>
                JOURNAL | NEWS | GUIDES | PODCASTS
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              borderBottom: `1px solid ${C.hairline}`,
              padding: '6px 2px',
            }}>
              <Search size={15} color={C.goldLight} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search the hub"
                style={{
                  background: 'none', border: 'none', outline: 'none',
                  fontSize: 14, color: C.paper, fontFamily: 'inherit',
                  minWidth: 180, padding: 0,
                }}
              />
            </div>
            <motion.button
              whileHover={{ rotate: 180 }}
              transition={{ duration: 0.4 }}
              onClick={load}
              style={{
                width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: 'transparent', color: C.goldLight,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </motion.button>
          </div>
        </header>

        {/* ── Category nav (text tabs, no boxes) ── */}
        <nav style={{
          display: 'flex', alignItems: 'center', gap: 24,
          padding: '14px 0', borderTop: `1px solid ${C.hairline}`, borderBottom: `1px solid ${C.hairline}`,
          overflowX: 'auto', scrollbarWidth: 'none',
        }}>
          {CATEGORIES.map(c => (
            <motion.button
              key={c.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => setCategory(c.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '4px 0',
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase',
                color: category === c.id ? C.goldLight : C.inkLight,
                fontWeight: category === c.id ? 600 : 400,
                borderBottom: category === c.id ? `2px solid ${C.gold}` : '2px solid transparent',
                whiteSpace: 'nowrap', transition: 'color 0.18s',
              }}
            >
              {c.label}
            </motion.button>
          ))}
          <Link href="/hub/create" style={{
            ...MONO, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase',
            color: C.goldLight, fontWeight: 600, textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
          }}>
            + Publish <ChevronRight size={13} />
          </Link>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => setPayoutFor('')}
            style={{
              ...MONO, background: 'none', border: 'none', cursor: 'pointer',
              padding: '4px 0', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase',
              color: C.goldLight, fontWeight: 600, whiteSpace: 'nowrap',
            }}
          >
            Payout
          </motion.button>
        </nav>

        {/* ── Hub highlights: the main numbers ── */}
        <section style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 28,
          padding: '34px 0 6px',
        }}>
          <div>
            <p style={{ ...SERIF, fontSize: 34, fontWeight: 600, letterSpacing: '-0.5px', color: C.goldLight, margin: 0 }}>
              {totalViews.toLocaleString()}
            </p>
            <p style={{ ...MONO, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: C.inkLight, margin: '4px 0 0' }}>
              Reads across the hub
            </p>
          </div>
          <div>
            <p style={{ ...SERIF, fontSize: 34, fontWeight: 600, letterSpacing: '-0.5px', color: C.paper, margin: 0 }}>
              {totalLikes.toLocaleString()}
            </p>
            <p style={{ ...MONO, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: C.inkLight, margin: '4px 0 0' }}>
              Likes from the community
            </p>
          </div>
          <div>
            <p style={{ ...SERIF, fontSize: 34, fontWeight: 600, letterSpacing: '-0.5px', color: C.gold, margin: 0 }}>
              KES {totalTips.toLocaleString()}
            </p>
            <p style={{ ...MONO, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: C.inkLight, margin: '4px 0 0' }}>
              Paid out to creators
            </p>
          </div>
          <div>
            <p style={{ ...SERIF, fontSize: 34, fontWeight: 600, letterSpacing: '-0.5px', color: C.paper, margin: 0 }}>
              {creators}
            </p>
            <p style={{ ...MONO, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: C.inkLight, margin: '4px 0 0' }}>
              Active creators
            </p>
          </div>
        </section>

        {/* ── Featured top story (highlighted) ── */}
        <AnimatePresence mode="wait">
          {featuredPost && (
            <motion.section
              key={featuredPost.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              style={{
                margin: '26px 0 10px',
                padding: '34px 0 30px',
                background: `linear-gradient(135deg, ${C.pine} 0%, ${C.pineDeep} 100%)`,
                borderRadius: 14,
              }}
            >
              <div style={{ padding: '0 32px' }}>
                <p style={{ ...MONO, fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: C.goldLight, margin: '0 0 14px' }}>
                  Featured Top Story | {TYPE_CFG[featuredPost.contentType].label}
                </p>
                <h2 style={{ ...SERIF, fontSize: 36, fontWeight: 600, color: C.paper, margin: '0 0 14px', lineHeight: 1.2, maxWidth: 760 }}>
                  {featuredPost.title}
                </h2>
                <p style={{ fontSize: 16, color: 'rgba(246,242,231,0.75)', lineHeight: 1.7, margin: '0 0 22px', maxWidth: 780 }}>
                  {featuredPost.summary.slice(0, 110)}…
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: 26, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ ...SERIF, fontSize: 22, fontWeight: 600, color: C.gold }}>
                    KES {featuredPost.tipsEarnedKes.toLocaleString()}
                  </span>
                  <span style={{ ...MONO, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: C.inkLight }}>
                    earned by creator
                  </span>
                  <span style={{ width: 1, height: 22, background: C.hairline }} />
                  <span style={{ ...SERIF, fontSize: 22, fontWeight: 600, color: C.paper }}>
                    {featuredPost.viewsCount.toLocaleString()}
                  </span>
                  <span style={{ ...MONO, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: C.inkLight }}>
                    reads
                  </span>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setTipPost(featuredPost)}
                    style={{
                      marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
                      padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: C.gold, color: C.ink, fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                    }}
                  >
                    <DollarSign size={14} /> Tip Creator
                  </motion.button>
                </div>

                <p style={{ ...MONO, fontSize: 11, color: C.goldLight, margin: '18px 0 0' }}>
                  By {featuredPost.creator} | {featuredPost.publishedAt}
                </p>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── Section label ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '26px 0 6px' }}>
          <p style={{ ...MONO, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: C.goldLight }}>
            {filtered.length > 0 ? 'Latest in the hub' : 'Browse'}
          </p>
          {category !== 'ALL' && (
            <p style={{ ...MONO, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: C.inkLight }}>
              {CATEGORIES.find(c => c.id === category)?.label}
            </p>
          )}
        </div>

        {/* ── Feed (editorial rows, no boxes) ── */}
        {filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ textAlign: 'center', padding: '70px 20px', color: C.inkLight, fontSize: 15 }}
          >
            No posts found. Try a different category or search term.
          </motion.div>
        ) : (
          <div>
            {feedPosts.map((p, i) => (
              <PostRow key={p.id} post={p} idx={i} onLike={handleLike} onTip={setTipPost} />
            ))}
          </div>
        )}

        {/* ── KAI Onboarding (highlight band, no box) ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          style={{
            marginTop: 48,
            padding: '34px 8px 26px',
            borderBottom: `1px solid ${C.hairline}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: C.gold, color: C.ink,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Zap size={19} />
            </div>
            <div>
              <p style={{ ...SERIF, fontSize: 22, fontWeight: 600, color: C.paper, margin: 0 }}>KAI Onboarding Agent</p>
              <p style={{ ...MONO, fontSize: 10, letterSpacing: 1.2, color: C.goldLight, margin: '3px 0 0' }}>
                FOREST | MSME | CHAMA
              </p>
            </div>
          </div>

          <p style={{ fontSize: 16, color: 'rgba(246,242,231,0.75)', lineHeight: 1.7, margin: '0 0 20px', maxWidth: 780 }}>
            Not sure where to start? Ask KAI to recommend the best vault, group, or Chama for you.
          </p>

          <Link href="/ai" style={{ textDecoration: 'none' }}>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              style={{
                padding: '14px 30px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: C.gold, color: C.ink, fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
              }}
            >
              Ask KAI to Onboard Me →
            </motion.button>
          </Link>
        </motion.div>
      </div>

      {/* ── TIP MODAL ── */}
      <AnimatePresence>
        {tipPost && <TipModal
          post={tipPost}
          onClose={() => setTipPost(null)}
          onPaid={handlePaid}
          onNeedPayout={(creator) => setPayoutFor(creator)}
        />}
      </AnimatePresence>

      {/* ── PAYOUT MODAL ── */}
      <AnimatePresence>
        {payoutFor !== null && <PayoutModal initialCreator={payoutFor} onClose={() => setPayoutFor(null)} />}
      </AnimatePresence>
    </main>
  );
}