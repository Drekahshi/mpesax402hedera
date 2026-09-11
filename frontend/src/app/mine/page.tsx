'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount } from 'wagmi';
import WalletConnectModal from '@/components/WalletConnectModal';
import { useKaiStore } from '@/store/useKaiStore';
import {
  CheckCircle, Users, UserPlus, ArrowLeft,
  CircleCheck, Gift, Sparkles, Coins,
  Zap, TrendingUp, Trophy, Clock, Star,
  Layers, Flame, Timer,
} from 'lucide-react';

const Rs: React.CSSProperties = { textShadow: '0 1px 4px rgba(0,0,0,0.88)' };
const R:  React.CSSProperties = { textShadow: '0 2px 8px rgba(0,0,0,0.90)' };

/* key word highlight helpers */
const HL = {
  green:  { color:'#34d399', fontWeight:700, textShadow:'0 0 12px rgba(52,211,153,0.55)'  } as React.CSSProperties,
  amber:  { color:'#fbbf24', fontWeight:700, textShadow:'0 0 12px rgba(251,191,36,0.55)'  } as React.CSSProperties,
  cyan:   { color:'#22d3ee', fontWeight:700, textShadow:'0 0 12px rgba(34,211,238,0.50)'  } as React.CSSProperties,
  purple: { color:'#c084fc', fontWeight:700, textShadow:'0 0 12px rgba(192,132,252,0.50)' } as React.CSSProperties,
  white:  { color:'#ffffff', fontWeight:800, textShadow:'0 0 10px rgba(255,255,255,0.35)' } as React.CSSProperties,
};

const POOLS = [
  { name:'ETH Alpha Miners', spots:'247/500', pct:49, badge:'Hot',    open:true,  reward:'500 NVR',   color:'#10b981' },
  { name:'NVR Launch Pool',   spots:'89/200',  pct:45, badge:'Early',  open:true,  reward:'1,000 NVR', color:'#22d3ee' },
  { name:'Early Adopter Promo', spots:'500/500', pct:100,badge:'Closed', open:false, reward:'200 NVR',   color:'#6366f1' },
];

const TOKEN_DROPS = [
  { symbol:'NVR',    name:'Nuvari Token',    reward:'10 NVR',   color:'#10b981', Icon:Zap         },
  { symbol:'YBOB',   name:'Stablecoin',      reward:'2 YBOB',   color:'#22c55e', Icon:Layers      },
  { symbol:'YTOKEN', name:'Yield Token',     reward:'1 YTOKEN', color:'#60a5fa', Icon:TrendingUp  },
  { symbol:'GAMI',   name:'Community',       reward:'5 GAMI',   color:'#f59e0b', Icon:Users       },
];

const TASKS = [
  { id:'checkin',   title:'Daily Check-in',  desc:'Open app today',           reward:'5 NVR',    color:'#10b981', icon:Gift      },
  { id:'policy',    title:'Explore Policy',  desc:'Open any policy template', reward:'2 YBOB',   color:'#22d3ee', icon:Sparkles  },
  { id:'agent',     title:'Ask KAI Agent',   desc:'Chat with KAI once',       reward:'1 GAMI',   color:'#f59e0b', icon:Coins     },
  { id:'community', title:'Join Community',  desc:'Follow ecosystem update',  reward:'1 YTOKEN', color:'#a855f7', icon:UserPlus  },
];

function Bar({ v, max, c }: { v:number; max:number; c:string }) {
  return (
    <div style={{ height:4, borderRadius:4, background:'rgba(255,255,255,0.08)', overflow:'hidden' }}>
      <motion.div initial={{ width:0 }} animate={{ width:`${Math.min(v/max*100,100)}%` }}
        transition={{ duration:1, ease:'easeOut' }}
        style={{ height:'100%', borderRadius:4, background:`linear-gradient(90deg,${c},${c}cc)`, boxShadow:`0 0 8px ${c}80` }} />
    </div>
  );
}

const W: React.CSSProperties = { width:'100%', maxWidth:1280, margin:'0 auto', padding:'0 40px' };

export default function MinePage() {
  const { isConnected } = useAccount();
  const setTokenBalance = useKaiStore(s => s.setTokenBalance);

  const [showModal,  setShowModal]  = useState(false);
  const [claimed,    setClaimed]    = useState(false);
  const [claiming,   setClaiming]   = useState(false);
  const [countdown,  setCountdown]  = useState(86400);
  const [joinedWait, setJoinedWait] = useState(false);
  const [minted,     setMinted]     = useState<string|null>(null);
  const [mintName,   setMintName]   = useState('');
  const [mintSym,    setMintSym]    = useState('');
  const [mintSupply, setMintSupply] = useState('');
  const [doneTasks,  setDoneTasks]  = useState<string[]>([]);
  const [taskMsg,    setTaskMsg]    = useState('');
  const [agentOn,    setAgentOn]    = useState(false);
  const [activePool, setActivePool] = useState<number|null>(null);

  useEffect(() => {
    const id = setInterval(() => setCountdown(c => Math.max(0,c-1)), 1000);
    return () => clearInterval(id);
  }, []);

  const fmt = (s:number) => {
    const h   = Math.floor(s/3600).toString().padStart(2,'0');
    const m   = Math.floor((s%3600)/60).toString().padStart(2,'0');
    const sec = (s%60).toString().padStart(2,'0');
    return `${h}:${m}:${sec}`;
  };

  const claim = async () => {
    if (!isConnected) { setShowModal(true); return; }
    setClaiming(true);
    await new Promise(r => setTimeout(r,1400));
    setTokenBalance('nvr', useKaiStore.getState().balances.nvr + 10);
    setClaimed(true); setClaiming(false);
  };

  const doTask = (id:string, reward:string) => {
    if (!isConnected) { setShowModal(true); return; }
    if (doneTasks.includes(id)) return;
    const [amt, sym] = reward.split(' ');
    const k = sym.toLowerCase() as 'nvr'|'ybob'|'ytoken'|'gami';
    setTokenBalance(k, useKaiStore.getState().balances[k] + Number(amt));
    setDoneTasks(t => [...t, id]);
    setTaskMsg(`+${reward} added to wallet`);
    setTimeout(() => setTaskMsg(''), 3000);
  };

  const mintToken = () => {
    if (!mintName||!mintSym||!mintSupply) return;
    setMinted(`0x${Math.random().toString(16).slice(2,12).toUpperCase()}`);
  };

  const pts = doneTasks.length * 5 + (claimed ? 10 : 0);

  return (
    <main style={{ minHeight:'100dvh', color:'#fff', fontFamily:'var(--font-sans)', position:'relative', paddingBottom:100 }}>

      {/* ambient orbs */}
      <div aria-hidden style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0 }}>
        <div style={{ position:'absolute', top:'0%', right:'-5%', width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle,rgba(16,185,129,0.12) 0%,transparent 65%)', animation:'orb-drift-a 14s ease-in-out infinite' }} />
        <div style={{ position:'absolute', bottom:'20%', left:'-5%', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle,rgba(245,158,11,0.08) 0%,transparent 65%)', animation:'orb-drift-b 18s ease-in-out infinite' }} />
        <div style={{ position:'absolute', top:'50%', right:'10%', width:260, height:260, borderRadius:'50%', background:'radial-gradient(circle,rgba(168,85,247,0.07) 0%,transparent 65%)', animation:'orb-drift-a 22s ease-in-out infinite reverse' }} />
      </div>

      {/* HERO BANNER */}
      <div style={{ position:'relative', zIndex:5, overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(135deg,rgba(4,78,59,0.60) 0%,rgba(6,6,12,0.82) 50%,rgba(4,38,78,0.55) 100%)' }} />
        <div style={{ position:'absolute', inset:0, background:'repeating-linear-gradient(110deg,transparent 0px,transparent 60px,rgba(255,255,255,0.02) 60px,rgba(255,255,255,0.02) 61px)', pointerEvents:'none' }} />

        <div style={{ ...W, position:'relative', zIndex:2, paddingTop:28, paddingBottom:40 }}>
          <Link href="/" style={{ display:'inline-flex', alignItems:'center', gap:8, textDecoration:'none', color:'rgba(255,255,255,0.52)', fontSize:13, marginBottom:28 }}>
            <ArrowLeft size={14}/> Back to Home
          </Link>

          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:40, alignItems:'center' }}>
            <div>
              {/* live badge */}
              <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'5px 14px', borderRadius:999, background:'rgba(16,185,129,0.13)', boxShadow:'0 0 0 1px rgba(16,185,129,0.28) inset', marginBottom:16 }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:'#34d399', boxShadow:'0 0 8px #34d399', animation:'pulse-dot 2s ease-in-out infinite' }} />
                <span style={{ fontSize:11, fontWeight:800, letterSpacing:1.4, textTransform:'uppercase', ...HL.green }}>
                  Live Rewards Desk · Sepolia Testnet
                </span>
              </div>

              <h1 style={{ fontSize:'clamp(28px,3.5vw,52px)', fontWeight:900, margin:'0 0 12px', letterSpacing:'-1.5px', lineHeight:1.1, ...R }}>
                Mine and Earn{' '}
                <span style={{ color:'#34d399', textShadow:'0 0 20px rgba(52,211,153,0.60)' }}>NVR Tokens</span>
                <br/>
                <span style={{ color:'rgba(255,255,255,0.68)', fontSize:'0.65em', fontWeight:700, letterSpacing:'-0.5px' }}>
                  Free daily airdrops on{' '}
                  <span style={HL.cyan}>Ethereum & Hedera</span>
                </span>
              </h1>

              <p style={{ fontSize:'clamp(13px,1.1vw,15px)', color:'rgba(255,255,255,0.65)', margin:'0 0 28px', lineHeight:1.65, maxWidth:520, ...Rs }}>
                Complete tasks, claim daily rewards, and join exclusive{' '}
                <span style={HL.cyan}>launchpools</span>.
                Every action earns you{' '}
                <span style={HL.amber}>Kai Bar points</span>{' '}
                and builds your path to the future{' '}
                <span style={HL.green}>KAI token airdrop</span>.
              </p>

              <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                <motion.button whileHover={{ scale:1.04 }} whileTap={{ scale:0.96 }}
                  onClick={claim} disabled={claimed||claiming}
                  style={{
                    display:'flex', alignItems:'center', gap:10,
                    padding:'13px 28px', borderRadius:14, border:'none',
                    cursor:claimed?'default':'pointer',
                    background:claimed?'rgba(34,197,94,0.15)':'linear-gradient(135deg,#10b981,#047857)',
                    color:claimed?'#4ade80':'#fff', fontSize:15, fontWeight:800,
                    boxShadow:claimed?'0 0 0 1px rgba(34,197,94,0.30) inset':'0 8px 28px rgba(16,185,129,0.50)',
                    transition:'all 0.2s',
                  }}>
                  {claiming
                    ? <><Clock size={17} style={{ animation:'spin 1s linear infinite' }}/> Processing</>
                    : claimed
                      ? <><CheckCircle size={17}/> Claimed · Next in {fmt(countdown)}</>
                      : <><Gift size={17}/> Claim 10 NVR Free</>
                  }
                </motion.button>
                <Link href="/kai-bar" style={{ textDecoration:'none' }}>
                  <motion.button whileHover={{ scale:1.04 }} whileTap={{ scale:0.96 }}
                    style={{ display:'flex', alignItems:'center', gap:8, padding:'13px 24px', borderRadius:14, border:'none', cursor:'pointer', background:'rgba(255,255,255,0.08)', backdropFilter:'blur(12px)', boxShadow:'0 0 0 1px rgba(255,255,255,0.12) inset', color:'#fff', fontSize:15, fontWeight:700 }}>
                    <Trophy size={17}/> View Kai Bar
                  </motion.button>
                </Link>
              </div>
            </div>

            {/* hero stats */}
            <motion.div initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.15 }}
              style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, minWidth:280 }}>
              {[
                { Icon:Trophy,      label:'Your Points', value:pts,                          suffix:'pts',  color:'#34d399' },
                { Icon:Flame,       label:'Day Streak',  value:3,                            suffix:'days', color:'#f59e0b' },
                { Icon:CheckCircle, label:'Tasks Done',  value:`${doneTasks.length}/${TASKS.length}`, suffix:'', color:'#60a5fa' },
                { Icon:Zap,         label:'NVR Earned',  value:claimed?10:0,                 suffix:'NVR',  color:'#a855f7' },
              ].map((s,i) => (
                <motion.div key={s.label}
                  initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.18+i*0.06 }}
                  style={{ padding:'14px 16px', borderRadius:16, background:'rgba(8,8,14,0.65)', backdropFilter:'blur(18px)', boxShadow:`0 0 0 0.5px ${s.color}22 inset, 0 8px 24px rgba(0,0,0,0.40)`, textAlign:'center' }}>
                  <s.Icon size={20} color={s.color} style={{ display:'block', margin:'0 auto 6px', filter:`drop-shadow(0 0 6px ${s.color}88)` }}/>
                  <p style={{ fontSize:'clamp(16px,1.6vw,22px)', fontWeight:900, color:s.color, margin:'0 0 2px', textShadow:`0 0 12px ${s.color}80` }}>
                    {s.value}{s.suffix && <span style={{ fontSize:'0.55em', fontWeight:700, opacity:0.7 }}> {s.suffix}</span>}
                  </p>
                  <p style={{ fontSize:10, color:'rgba(255,255,255,0.40)', fontWeight:700, letterSpacing:0.8, textTransform:'uppercase', margin:0 }}>{s.label}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT GRID */}
      <div style={{ ...W, marginTop:28, display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, position:'relative', zIndex:5 }}>

        {/* LEFT COLUMN */}
        <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

          {/* TOKEN DROPS */}
          <motion.section initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.10 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div>
                <h2 style={{ fontSize:16, fontWeight:900, color:'#fff', margin:0, ...Rs }}>
                  Ecosystem{' '}<span style={HL.amber}>Token Drops</span>
                </h2>
                <p style={{ fontSize:12, color:'rgba(255,255,255,0.42)', margin:'3px 0 0' }}>
                  Rotating rewards for <span style={{ color:'rgba(255,255,255,0.70)', fontWeight:600 }}>active community members</span>
                </p>
              </div>
              <span style={{ fontSize:10, fontWeight:800, letterSpacing:0.8, padding:'3px 10px', borderRadius:999, background:'rgba(16,185,129,0.10)', boxShadow:'0 0 0 1px rgba(16,185,129,0.22) inset', ...HL.green }}>LIVE</span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {TOKEN_DROPS.map((t,i) => (
                <motion.div key={t.symbol}
                  initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.12+i*0.05 }}
                  whileHover={{ y:-4, scale:1.02 }}
                  style={{ padding:'18px 16px', borderRadius:18, cursor:'default', position:'relative', overflow:'hidden', background:`linear-gradient(145deg,${t.color}12 0%,rgba(6,6,12,0.65) 100%)`, backdropFilter:'blur(18px)', boxShadow:`0 0 0 0.5px ${t.color}25 inset, 0 8px 28px rgba(0,0,0,0.35)` }}>
                  <div style={{ position:'absolute', top:-20, right:-20, width:80, height:80, borderRadius:'50%', background:`radial-gradient(circle,${t.color}18 0%,transparent 70%)`, pointerEvents:'none' }} />
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                    <div style={{ width:38, height:38, borderRadius:12, background:`${t.color}1e`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 14px ${t.color}30` }}>
                      <t.Icon size={18} color={t.color}/>
                    </div>
                    <div>
                      <p style={{ fontSize:13, fontWeight:800, color:'#fff', margin:0 }}>{t.symbol}</p>
                      <p style={{ fontSize:10, color:'rgba(255,255,255,0.42)', margin:0 }}>{t.name}</p>
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'baseline', gap:5 }}>
                    <span style={{ fontSize:22, fontWeight:900, color:t.color, textShadow:`0 0 16px ${t.color}80` }}>{t.reward.split(' ')[0]}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:`${t.color}cc` }}>{t.reward.split(' ')[1]}</span>
                  </div>
                  <p style={{ fontSize:10, color:'rgba(255,255,255,0.35)', margin:'4px 0 0', fontWeight:600 }}>Per claim cycle</p>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* LAUNCHPOOLS */}
          <motion.section initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.16 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div>
                <h2 style={{ fontSize:16, fontWeight:900, color:'#fff', margin:0, ...Rs }}>
                  Active{' '}<span style={HL.cyan}>Launchpools</span>
                </h2>
                <p style={{ fontSize:12, color:'rgba(255,255,255,0.42)', margin:'3px 0 0' }}>
                  Join early for <span style={{ color:'rgba(255,255,255,0.70)', fontWeight:600 }}>maximum rewards</span>
                </p>
              </div>
              <span style={{ fontSize:10, fontWeight:800, padding:'3px 10px', borderRadius:999, background:'rgba(34,211,238,0.08)', boxShadow:'0 0 0 1px rgba(34,211,238,0.20) inset', ...HL.cyan }}>3 POOLS</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {POOLS.map((p,i) => (
                <motion.div key={i}
                  initial={{ opacity:0, x:-12 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.18+i*0.06 }}
                  whileHover={{ x:4 }}
                  onClick={() => setActivePool(activePool===i?null:i)}
                  style={{ padding:'16px 18px', borderRadius:16, cursor:'pointer', overflow:'hidden', background:`linear-gradient(110deg,${p.color}0f 0%,rgba(6,6,14,0.65) 100%)`, backdropFilter:'blur(20px)', boxShadow:`0 0 0 0.5px ${p.color}20 inset, 0 6px 24px rgba(0,0,0,0.32)`, transition:'box-shadow 0.22s' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                    <div style={{ width:44, height:44, borderRadius:13, background:`${p.color}18`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:`0 0 16px ${p.color}28` }}>
                      <Layers size={20} color={p.color}/>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                        <p style={{ fontSize:14, fontWeight:800, color:'#fff', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</p>
                        <span style={{
                          fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:999,
                          background:p.open?'rgba(34,197,94,0.12)':'rgba(248,113,113,0.12)',
                          color:p.open?'#4ade80':'#f87171',
                          boxShadow:`0 0 0 1px ${p.open?'rgba(34,197,94,0.25)':'rgba(248,113,113,0.25)'} inset`,
                          flexShrink:0,
                        }}>{p.badge}</span>
                      </div>
                      <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                        <span style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>{p.spots} joined</span>
                        <span style={{ fontSize:11, fontWeight:800, color:p.color }}>{p.reward}</span>
                      </div>
                      <div style={{ marginTop:8 }}><Bar v={p.pct} max={100} c={p.color}/></div>
                    </div>
                    <motion.button
                      whileHover={p.open?{ scale:1.06 }:{}} whileTap={p.open?{ scale:0.94 }:{}}
                      disabled={!p.open}
                      onClick={e => { e.stopPropagation(); if(!isConnected) setShowModal(true); }}
                      style={{ padding:'8px 18px', borderRadius:10, border:'none', cursor:p.open?'pointer':'not-allowed', flexShrink:0, background:p.open?`linear-gradient(135deg,${p.color},${p.color}99)`:'rgba(255,255,255,0.06)', color:p.open?'#fff':'rgba(255,255,255,0.25)', fontSize:12, fontWeight:800, boxShadow:p.open?`0 4px 14px ${p.color}40`:'none', transition:'all 0.18s' }}>
                      {p.open?'Join':'Closed'}
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* AUTO-DROP AGENT */}
          <motion.section initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.22 }}>
            <div style={{ padding:'20px 22px', borderRadius:18, background:'rgba(8,8,14,0.60)', backdropFilter:'blur(22px)', boxShadow:'0 0 0 0.5px rgba(16,185,129,0.14) inset, 0 8px 28px rgba(0,0,0,0.35)', position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:-30, right:-30, width:120, height:120, borderRadius:'50%', background:'radial-gradient(circle,rgba(16,185,129,0.10) 0%,transparent 70%)', pointerEvents:'none' }} />
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <Zap size={15} color="#10b981"/>
                    <p style={{ fontSize:14, fontWeight:900, color:'#fff', margin:0, ...Rs }}>
                      Auto-Drop <span style={HL.green}>Agent</span>
                    </p>
                  </div>
                  <p style={{ fontSize:12, color:'rgba(255,255,255,0.45)', margin:0 }}>
                    AI mines <span style={HL.green}>NVR tokens</span> 24/7 on <span style={HL.cyan}>Sepolia</span>
                  </p>
                </div>
                <motion.button whileTap={{ scale:0.94 }}
                  onClick={() => { if (!isConnected) setShowModal(true); else setAgentOn(v=>!v); }}
                  style={{ width:52, height:28, borderRadius:14, border:'none', cursor:'pointer', position:'relative', background:agentOn?'linear-gradient(135deg,#10b981,#047857)':'rgba(255,255,255,0.10)', boxShadow:agentOn?'0 0 14px rgba(16,185,129,0.40)':'none', transition:'all 0.28s' }}>
                  <motion.div animate={{ left:agentOn?26:3 }} transition={{ type:'spring', stiffness:500, damping:30 }}
                    style={{ width:22, height:22, borderRadius:'50%', background:'#fff', position:'absolute', top:3, boxShadow:'0 2px 6px rgba(0,0,0,0.30)' }} />
                </motion.button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                {[
                  { l:'Mining Rate', v:agentOn?'0.003/s':'0.000/s', c:'#10b981' },
                  { l:'Total Mined',  v:agentOn?'0.2 NVR':'0.0 NVR', c:'#10b981' },
                  { l:'Status',       v:agentOn?'Active':'Idle',      c:agentOn?'#4ade80':'#94a3b8' },
                ].map(s => (
                  <div key={s.l} style={{ padding:'12px 14px', borderRadius:12, background:'rgba(255,255,255,0.04)', boxShadow:'0 0 0 0.5px rgba(255,255,255,0.07) inset' }}>
                    <p style={{ fontSize:9, color:'rgba(255,255,255,0.38)', margin:'0 0 5px', fontWeight:700, textTransform:'uppercase', letterSpacing:0.6 }}>{s.l}</p>
                    <p style={{ fontSize:14, fontWeight:900, color:s.c, margin:0, textShadow:`0 0 8px ${s.c}60` }}>{s.v}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

          {/* DAILY TASKS */}
          <motion.section initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.12 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div>
                <h2 style={{ fontSize:16, fontWeight:900, color:'#fff', margin:0, ...Rs }}>
                  Today&apos;s <span style={HL.amber}>Tasks</span>
                </h2>
                <p style={{ fontSize:12, color:'rgba(255,255,255,0.42)', margin:'3px 0 0' }}>
                  Complete all <span style={{ color:'rgba(255,255,255,0.70)', fontWeight:600 }}>4 tasks</span> for maximum daily rewards
                </p>
              </div>
              <AnimatePresence>
                {taskMsg && (
                  <motion.div initial={{ opacity:0, scale:0.8, y:4 }} animate={{ opacity:1, scale:1, y:0 }} exit={{ opacity:0, scale:0.8 }}
                    style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:999, background:'rgba(34,197,94,0.12)', boxShadow:'0 0 0 1px rgba(34,197,94,0.25) inset', fontSize:12, fontWeight:700, color:'#4ade80' }}>
                    <CheckCircle size={12}/> {taskMsg}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div style={{ marginBottom:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontSize:11, color:'rgba(255,255,255,0.45)', fontWeight:600 }}>Daily Progress</span>
                <span style={{ fontSize:11, fontWeight:800, ...HL.amber }}>{doneTasks.length}/{TASKS.length} completed</span>
              </div>
              <Bar v={doneTasks.length} max={TASKS.length} c="#fbbf24"/>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {TASKS.map((task,i) => {
                const Icon = task.icon;
                const done = doneTasks.includes(task.id);
                return (
                  <motion.button key={task.id}
                    initial={{ opacity:0, x:14 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.14+i*0.05 }}
                    whileHover={done?{}:{ x:4, scale:1.01 }} whileTap={done?{}:{ scale:0.98 }}
                    onClick={() => doTask(task.id, task.reward)} disabled={done}
                    style={{ textAlign:'left', display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderRadius:16, border:'none', cursor:done?'default':'pointer', background:done?'rgba(34,197,94,0.07)':'rgba(255,255,255,0.04)', backdropFilter:'blur(10px)', boxShadow:done?`0 0 0 0.5px rgba(34,197,94,0.22) inset, 0 4px 16px rgba(0,0,0,0.25)`:`0 0 0 0.5px ${task.color}18 inset, 0 4px 16px rgba(0,0,0,0.25)`, color:'#fff', transition:'all 0.18s' }}>
                    <div style={{ width:40, height:40, borderRadius:13, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:done?'rgba(34,197,94,0.14)':`${task.color}18`, boxShadow:done?'0 0 14px rgba(34,197,94,0.25)':`0 0 14px ${task.color}28`, color:done?'#4ade80':task.color }}>
                      {done ? <CircleCheck size={19}/> : <Icon size={19}/>}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:14, fontWeight:800, color:done?'rgba(255,255,255,0.45)':'#fff', margin:0 }}>{task.title}</p>
                      <p style={{ fontSize:11, color:'rgba(255,255,255,0.38)', margin:'2px 0 0' }}>{done ? 'Completed today' : task.desc}</p>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <span style={{ display:'block', fontSize:13, fontWeight:900, color:done?'#4ade80':task.color, textShadow:done?'0 0 10px rgba(34,197,94,0.50)':`0 0 10px ${task.color}60` }}>
                        {done ? 'Done' : `+${task.reward}`}
                      </span>
                      {!done && <span style={{ fontSize:10, color:'rgba(255,255,255,0.30)', fontWeight:600 }}>Tap to complete</span>}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.section>

          {/* EARLY ACCESS + MINT */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>

            {/* EARLY ACCESS */}
            <motion.div initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.24 }}
              style={{ padding:'18px', borderRadius:18, background:'linear-gradient(145deg,rgba(167,139,250,0.12),rgba(8,8,14,0.65))', backdropFilter:'blur(20px)', boxShadow:'0 0 0 0.5px rgba(167,139,250,0.20) inset, 0 8px 26px rgba(0,0,0,0.35)', position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:-20, right:-20, width:90, height:90, borderRadius:'50%', background:'radial-gradient(circle,rgba(167,139,250,0.15) 0%,transparent 70%)', pointerEvents:'none' }} />
              <Star size={16} color="#a78bfa" style={{ marginBottom:8 }}/>
              <p style={{ fontSize:14, fontWeight:900, color:'#a78bfa', margin:'0 0 5px' }}>Early Access</p>
              <p style={{ fontSize:12, color:'rgba(255,255,255,0.50)', margin:'0 0 14px', lineHeight:1.5 }}>
                Unlock <span style={HL.purple}>higher reward tiers</span> before public launch
              </p>
              <AnimatePresence mode="wait">
                {!joinedWait ? (
                  <motion.button key="join" whileHover={{ scale:1.04 }} whileTap={{ scale:0.96 }}
                    onClick={() => setJoinedWait(true)}
                    style={{ width:'100%', background:'linear-gradient(135deg,#a78bfa,#7c3aed)', color:'#fff', fontWeight:800, fontSize:13, padding:'10px', borderRadius:11, border:'none', cursor:'pointer', boxShadow:'0 6px 18px rgba(139,92,246,0.42)' }}>
                    Join Waitlist
                  </motion.button>
                ) : (
                  <motion.div key="done" initial={{ scale:0.85, opacity:0 }} animate={{ scale:1, opacity:1 }}
                    style={{ display:'flex', alignItems:'center', gap:7, padding:'10px 14px', borderRadius:11, background:'rgba(34,197,94,0.10)', boxShadow:'0 0 0 1px rgba(34,197,94,0.22) inset', color:'#22c55e', fontWeight:800, fontSize:13 }}>
                    <CheckCircle size={15}/> You are on the list!
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* MINT TOKEN */}
            <motion.div initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.26 }}
              style={{ padding:'18px', borderRadius:18, background:'rgba(8,8,14,0.60)', backdropFilter:'blur(20px)', boxShadow:'0 0 0 0.5px rgba(167,139,250,0.14) inset, 0 8px 26px rgba(0,0,0,0.32)' }}>
              <TrendingUp size={16} color="#a78bfa" style={{ marginBottom:8 }}/>
              <p style={{ fontSize:14, fontWeight:900, color:'#a78bfa', margin:'0 0 5px' }}>Mint Token</p>
              <p style={{ fontSize:12, color:'rgba(255,255,255,0.50)', margin:'0 0 12px' }}>
                Deploy your own <span style={HL.purple}>ERC-20</span> on <span style={HL.cyan}>Sepolia</span>
              </p>
              <AnimatePresence mode="wait">
                {!minted ? (
                  <motion.div key="form" style={{ display:'flex', flexDirection:'column', gap:7 }}>
                    {[
                      { v:mintName,   s:setMintName,   p:'Token Name',        t:'text'   },
                      { v:mintSym,    s:setMintSym,    p:'Symbol (e.g. TKN)', t:'text'   },
                      { v:mintSupply, s:setMintSupply, p:'Total Supply',      t:'number' },
                    ].map(({ v,s,p,t }) => (
                      <input key={p} value={v} onChange={e => s(e.target.value)} placeholder={p} type={t}
                        style={{ background:'rgba(255,255,255,0.06)', border:'none', boxShadow:'0 0 0 1px rgba(255,255,255,0.09) inset', borderRadius:10, padding:'9px 12px', fontSize:12, color:'#fff', outline:'none', fontFamily:'inherit', transition:'box-shadow 0.18s', width:'100%', boxSizing:'border-box' }}
                        onFocus={e => (e.target.style.boxShadow='0 0 0 1.5px rgba(167,139,250,0.48) inset')}
                        onBlur={e  => (e.target.style.boxShadow='0 0 0 1px rgba(255,255,255,0.09) inset')}
                      />
                    ))}
                    <motion.button onClick={mintToken}
                      whileHover={(mintName&&mintSym&&mintSupply)?{ scale:1.02 }:{}}
                      whileTap={(mintName&&mintSym&&mintSupply)?{ scale:0.97 }:{}}
                      style={{ background:(mintName&&mintSym&&mintSupply)?'linear-gradient(135deg,#a78bfa,#7c3aed)':'rgba(255,255,255,0.07)', color:(mintName&&mintSym&&mintSupply)?'#fff':'rgba(255,255,255,0.28)', fontWeight:800, fontSize:12, padding:'10px', borderRadius:10, border:'none', cursor:mintName?'pointer':'not-allowed', fontFamily:'inherit', boxShadow:(mintName&&mintSym&&mintSupply)?'0 6px 16px rgba(139,92,246,0.40)':'none', transition:'all 0.18s' }}>
                      Deploy on Sepolia
                    </motion.button>
                  </motion.div>
                ) : (
                  <motion.div key="success" initial={{ opacity:0, scale:0.9 }} animate={{ opacity:1, scale:1 }}
                    style={{ textAlign:'center', padding:'8px 0' }}>
                    <p style={{ fontSize:13, fontWeight:800, color:'#22c55e', margin:'0 0 6px' }}>Token Deployed!</p>
                    <p style={{ fontFamily:'monospace', fontSize:10, color:'#10b981', margin:'0 0 10px', wordBreak:'break-all', background:'rgba(16,185,129,0.08)', padding:'6px 8px', borderRadius:8 }}>{minted}</p>
                    <button onClick={() => { setMinted(null); setMintName(''); setMintSym(''); setMintSupply(''); }}
                      style={{ fontSize:11, color:'rgba(255,255,255,0.45)', background:'rgba(255,255,255,0.06)', border:'none', borderRadius:8, padding:'6px 14px', cursor:'pointer', fontFamily:'inherit' }}>
                      Deploy another
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>

          {/* COUNTDOWN */}
          <motion.div initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.28 }}
            style={{ padding:'20px 22px', borderRadius:18, background:'linear-gradient(135deg,rgba(245,158,11,0.10),rgba(8,8,14,0.65))', backdropFilter:'blur(20px)', boxShadow:'0 0 0 0.5px rgba(245,158,11,0.18) inset, 0 8px 28px rgba(0,0,0,0.35)', display:'flex', alignItems:'center', gap:18 }}>
            <div style={{ width:52, height:52, borderRadius:16, background:'rgba(245,158,11,0.14)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:'0 0 18px rgba(245,158,11,0.25)' }}>
              <Timer size={24} color="#fbbf24"/>
            </div>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:12, color:'rgba(255,255,255,0.50)', margin:'0 0 4px', fontWeight:600 }}>
                {claimed ? 'Next claim available in' : 'Daily claim resets in'}
              </p>
              <p style={{ fontSize:24, fontWeight:900, color:'#fbbf24', margin:0, fontFamily:'monospace', textShadow:'0 0 14px rgba(251,191,36,0.55)', letterSpacing:2 }}>
                {fmt(countdown)}
              </p>
            </div>
            <div style={{ textAlign:'right' }}>
              <p style={{ fontSize:10, color:'rgba(255,255,255,0.38)', margin:'0 0 3px', fontWeight:600, textTransform:'uppercase', letterSpacing:0.6 }}>Streak</p>
              <p style={{ fontSize:20, fontWeight:900, color:'#f59e0b', margin:0, textShadow:'0 0 12px rgba(245,158,11,0.60)' }}>3 days</p>
            </div>
          </motion.div>

        </div>
      </div>

      {showModal && <WalletConnectModal onClose={() => setShowModal(false)} />}
    </main>
  );
}
