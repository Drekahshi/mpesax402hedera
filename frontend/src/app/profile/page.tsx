'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trees, Store, Users, Wallet, ChevronRight,
  CheckCircle, RefreshCw, Copy, LogOut,
  ShieldCheck, Zap, TrendingUp, Settings,
  ExternalLink, Save, MapPin, Phone, Edit3,
  Award, BarChart3, Star,
} from 'lucide-react';

interface Profile {
  walletAddress:string; displayName:string; phone:string;
  county:string; idNumber:string;
  cfaGroup:string; cfaRole:string; cfaRegion:string; cfaJoinYear:string;
  businessName:string; businessType:string; businessLocation:string;
  annualTurnover:string; mpesaNumber:string;
  chamaName:string; chamaRole:string; chamaRegNo:string; monthlyContrib:string;
  riskTolerance:string; preferredVault:string; notifications:boolean;
  updatedAt?:string;
}

const EMPTY:Profile = {
  walletAddress:'', displayName:'', phone:'', county:'', idNumber:'',
  cfaGroup:'', cfaRole:'', cfaRegion:'', cfaJoinYear:'',
  businessName:'', businessType:'', businessLocation:'', annualTurnover:'', mpesaNumber:'',
  chamaName:'', chamaRole:'', chamaRegNo:'', monthlyContrib:'',
  riskTolerance:'medium', preferredVault:'', notifications:true,
};

const CFA_ROLES   = ['Guardian','Treasurer','Secretary','Admin','Auditor','Member'];
const CHAMA_ROLES = ['Chairperson','Treasurer','Secretary','Member'];
const BIZ_TYPES   = ['Agri Supplies','Retail Shop','Hardware','Pharmacy','Textile / Crafts','Produce Distributor','Tech / Services','Food & Beverage','Other'];
const COUNTIES    = ['Nairobi','Mombasa','Kisumu','Nakuru','Eldoret','Thika','Meru','Nyeri','Kericho','Kakamega','Machakos','Garissa','Other'];
const RISK_LEVELS = [
  { v:'conservative', label:'Conservative', apy:'7–12%',  color:'#22c55e' },
  { v:'medium',       label:'Balanced',     apy:'12–18%', color:'#3b82f6' },
  { v:'high',         label:'High Yield',   apy:'18–24%', color:'#10b981' },
];
const VAULTS = ['kvyBOB (7.5% APY)','kvNVR (15.2% APY)','kvYTOKEN (14.8% APY)','kvGAMI (22.0% APY)','kvYGOLD (12.4% APY)'];

/* ── text always punches over background image ── */
const R:React.CSSProperties  = { textShadow:'0 2px 12px rgba(0,0,0,0.95), 0 0 40px rgba(0,0,0,0.80)' };
const Rs:React.CSSProperties = { textShadow:'0 1px 8px rgba(0,0,0,0.95)' };

/* ── highlight colours ── */
const G  = { color:'#34d399', fontWeight:800 } as React.CSSProperties;
const AM = { color:'#fbbf24', fontWeight:800 } as React.CSSProperties;
const CY = { color:'#22d3ee', fontWeight:800 } as React.CSSProperties;
const PU = { color:'#c084fc', fontWeight:800 } as React.CSSProperties;

/* ── bare underline input, readable on any bg ── */
function KInput({ value, onChange, placeholder, type='text', big=false }:{
  value:string; onChange:(v:string)=>void; placeholder?:string; type?:string; big?:boolean;
}) {
  const [f, setF] = useState(false);
  return (
    <input type={type} value={value} onChange={e=>onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        background:'rgba(0,0,0,0.45)',
        border:'none',
        borderBottom:`2px solid ${f?'#10b981':'rgba(255,255,255,0.20)'}`,
        borderRadius:8,
        padding: big ? '14px 16px' : '12px 14px',
        fontSize: big ? 16 : 15,
        color:'#fff',
        outline:'none',
        fontFamily:'inherit',
        width:'100%',
        backdropFilter:'blur(12px)',
        boxSizing:'border-box',
        transition:'border-color 0.2s',
        textShadow:'0 1px 6px rgba(0,0,0,0.90)',
      }}
      onFocus={()=>setF(true)} onBlur={()=>setF(false)}
    />
  );
}

function KSelect({ value, onChange, options, placeholder }:{
  value:string; onChange:(v:string)=>void; options:string[]; placeholder?:string;
}) {
  const [f, setF] = useState(false);
  return (
    <select value={value} onChange={e=>onChange(e.target.value)}
      style={{
        background:'rgba(0,0,0,0.50)',
        border:'none',
        borderBottom:`2px solid ${f?'#10b981':'rgba(255,255,255,0.20)'}`,
        borderRadius:8,
        padding:'12px 14px',
        fontSize:15,
        color: value ? '#fff' : 'rgba(255,255,255,0.45)',
        outline:'none',
        fontFamily:'inherit',
        width:'100%',
        backdropFilter:'blur(12px)',
        boxSizing:'border-box',
        appearance:'none',
        transition:'border-color 0.2s',
        cursor:'pointer',
      }}
      onFocus={()=>setF(true)} onBlur={()=>setF(false)}>
      {placeholder && <option value="" disabled style={{background:'#0a0a14'}}>{placeholder}</option>}
      {options.map(o=><option key={o} value={o} style={{background:'#0a0a14'}}>{o}</option>)}
    </select>
  );
}

function FormRow({ label, children }:{ label:string; children:React.ReactNode }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      <span style={{ fontSize:12, fontWeight:700, letterSpacing:1.0, textTransform:'uppercase', color:'rgba(255,255,255,0.55)', ...Rs }}>
        {label}
      </span>
      {children}
    </div>
  );
}

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const [profile, setProfile] = useState<Profile>({ ...EMPTY });
  const [saved,   setSaved]   = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [copied,  setCopied]  = useState(false);
  const [tab,     setTab]     = useState<'personal'|'cfa'|'sme'|'chama'|'prefs'>('personal');
  const [toast,   setToast]   = useState('');
  const [editing, setEditing] = useState(false);

  const load = useCallback(async (addr:string) => {
    try {
      const r = await fetch(`/api/profile?wallet=${addr}`);
      const { profile:p } = await r.json();
      setProfile(p ? { ...EMPTY, ...p } : { ...EMPTY, walletAddress:addr });
    } catch { setProfile({ ...EMPTY, walletAddress:addr }); }
  }, []);

  useEffect(() => { if (address) load(address); }, [address, load]);

  const set = (k:keyof Profile) => (v:string|boolean) =>
    setProfile(p=>({ ...p, [k]:v }));

  const save = async () => {
    if (!address) { setToast('Connect wallet first'); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/profile', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ ...profile, walletAddress:address }),
      });
      if (r.ok) {
        setSaved(true); setToast('Profile saved'); setEditing(false);
        setTimeout(()=>{ setSaved(false); setToast(''); }, 3000);
      } else setToast('Save failed — try again');
    } catch { setToast('Network error'); }
    finally { setSaving(false); }
  };

  const copyAddr = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true); setTimeout(()=>setCopied(false), 1600);
  };

  const fields   = [profile.displayName,profile.phone,profile.county,profile.cfaGroup,profile.cfaRole,profile.businessName,profile.businessType,profile.chamaName,profile.chamaRole];
  const complete = Math.round(fields.filter(Boolean).length / fields.length * 100);
  const initials = profile.displayName
    ? profile.displayName.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)
    : 'KN';

  const TABS = [
    { id:'personal', label:'Personal',  color:'#10b981', Icon:Award   },
    { id:'cfa',      label:'CFA Group', color:'#22c55e', Icon:Trees   },
    { id:'sme',      label:'Business',  color:'#3b82f6', Icon:Store   },
    { id:'chama',    label:'Chama',     color:'#a855f7', Icon:Users   },
    { id:'prefs',    label:'KAI Prefs', color:'#f59e0b', Icon:Settings },
  ] as const;

  return (
    <main style={{ minHeight:'100dvh', color:'#fff', fontFamily:'var(--font-sans)', paddingBottom:100, position:'relative' }}>

      {/* strong dark overlay so text is ALWAYS readable over bg image */}
      <div aria-hidden style={{ position:'fixed', inset:0, background:'rgba(4,4,10,0.72)', zIndex:0, pointerEvents:'none' }}/>

      {/* ambient colour glows */}
      <div aria-hidden style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:1 }}>
        <div style={{ position:'absolute', top:'-5%', left:'20%', width:600, height:600, borderRadius:'50%', background:'radial-gradient(circle,rgba(16,185,129,0.12) 0%,transparent 65%)', animation:'orb-drift-a 18s ease-in-out infinite' }}/>
        <div style={{ position:'absolute', bottom:'10%', right:'5%', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle,rgba(168,85,247,0.09) 0%,transparent 65%)', animation:'orb-drift-b 22s ease-in-out infinite' }}/>
      </div>

      {/* ═══════════════════════════════════════
          COVER BANNER
      ═══════════════════════════════════════ */}
      <div style={{ position:'relative', zIndex:5, height:240, overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(135deg,rgba(4,78,59,0.75) 0%,rgba(6,6,16,0.92) 55%,rgba(60,10,100,0.65) 100%)' }}/>
        <div style={{ position:'absolute', inset:0, background:'repeating-linear-gradient(110deg,transparent 0,transparent 58px,rgba(255,255,255,0.025) 58px,rgba(255,255,255,0.025) 59px)', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', top:'-40%', left:'25%', width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle,rgba(16,185,129,0.20) 0%,transparent 60%)', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', top:'-30%', right:'15%', width:350, height:350, borderRadius:'50%', background:'radial-gradient(circle,rgba(168,85,247,0.15) 0%,transparent 60%)', pointerEvents:'none' }}/>
      </div>

      {/* ═══════════════════════════════════════
          IDENTITY HERO — avatar + name
      ═══════════════════════════════════════ */}
      <div style={{ maxWidth:1280, margin:'0 auto', padding:'0 48px', position:'relative', zIndex:6 }}>
        <div style={{ marginTop:-80, display:'flex', alignItems:'flex-end', gap:32 }}>

          {/* Avatar */}
          <motion.div initial={{ opacity:0, scale:0.85 }} animate={{ opacity:1, scale:1 }} transition={{ delay:0.06 }}
            style={{ flexShrink:0, position:'relative' }}>
            <div style={{ width:140, height:140, borderRadius:'50%', background:'linear-gradient(135deg,#10b981,#22d3ee,#a855f7)', padding:4, boxShadow:'0 0 60px rgba(16,185,129,0.60), 0 0 120px rgba(34,211,238,0.20)' }}>
              <div style={{ width:'100%', height:'100%', borderRadius:'50%', background:'linear-gradient(145deg,rgba(16,185,129,0.55),rgba(4,78,59,0.95))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:48, fontWeight:900, color:'#6ee7b7', ...R }}>
                {initials}
              </div>
            </div>
            {isConnected && (
              <span style={{ position:'absolute', bottom:8, right:6, width:22, height:22, borderRadius:'50%', background:'#22c55e', border:'3px solid rgba(6,6,14,0.95)', boxShadow:'0 0 14px rgba(34,197,94,0.80)', animation:'pulse-dot 2.5s ease-in-out infinite', display:'block' }}/>
            )}
          </motion.div>

          {/* Name + meta */}
          <motion.div initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.10 }}
            style={{ flex:1, paddingBottom:18 }}>
            <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:10 }}>
              <h1 style={{ fontSize:'clamp(28px,3.2vw,48px)', fontWeight:900, margin:0, letterSpacing:'-1px', color:'#fff', ...R }}>
                {profile.displayName || <span style={{ color:'rgba(255,255,255,0.35)' }}>Your Name</span>}
              </h1>
              {isConnected && (
                <span style={{ padding:'5px 14px', borderRadius:999, background:'rgba(16,185,129,0.18)', boxShadow:'0 0 0 1.5px rgba(16,185,129,0.40) inset', fontSize:12, fontWeight:800, letterSpacing:0.5, ...G, flexShrink:0 }}>
                  KAI Member
                </span>
              )}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:24, flexWrap:'wrap' }}>
              {profile.county && (
                <span style={{ display:'flex', alignItems:'center', gap:6, fontSize:15, color:'rgba(255,255,255,0.72)', ...Rs }}>
                  <MapPin size={15} color="#34d399"/> {profile.county}, Kenya
                </span>
              )}
              {profile.phone && (
                <span style={{ display:'flex', alignItems:'center', gap:6, fontSize:15, color:'rgba(255,255,255,0.72)', ...Rs }}>
                  <Phone size={15} color="#22d3ee"/> {profile.phone}
                </span>
              )}
              {isConnected && (
                <button onClick={copyAddr} style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', fontSize:13, color:'rgba(255,255,255,0.55)', fontFamily:'monospace', padding:0, ...Rs }}>
                  {address?.slice(0,10)}...{address?.slice(-6)}
                  {copied ? <CheckCircle size={13} color="#4ade80"/> : <Copy size={13} color="rgba(255,255,255,0.45)"/>}
                </button>
              )}
            </div>
          </motion.div>

          {/* Action buttons */}
          <motion.div initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.14 }}
            style={{ display:'flex', gap:12, paddingBottom:18, flexShrink:0 }}>
            <motion.button whileHover={{ scale:1.04 }} whileTap={{ scale:0.96 }}
              onClick={()=>setEditing(v=>!v)}
              style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 22px', borderRadius:13, border:'none', cursor:'pointer', background:'rgba(255,255,255,0.10)', backdropFilter:'blur(16px)', boxShadow:'0 0 0 1px rgba(255,255,255,0.14) inset', color:'#fff', fontSize:14, fontWeight:700, ...Rs }}>
              <Edit3 size={16}/> {editing ? 'Cancel' : 'Edit Profile'}
            </motion.button>
            <motion.button whileHover={{ scale:1.04 }} whileTap={{ scale:0.96 }}
              onClick={save} disabled={saving||!isConnected}
              style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 26px', borderRadius:13, border:'none', cursor:isConnected?'pointer':'not-allowed', background:saved?'rgba(34,197,94,0.20)':'linear-gradient(135deg,#10b981,#047857)', color:saved?'#4ade80':'#fff', fontSize:14, fontWeight:800, boxShadow:saved?'0 0 0 1px rgba(34,197,94,0.35) inset':'0 8px 28px rgba(16,185,129,0.50)', transition:'all 0.2s', ...Rs }}>
              {saving?<RefreshCw size={16} style={{animation:'spin 1s linear infinite'}}/>:saved?<CheckCircle size={16}/>:<Save size={16}/>}
              {saving?'Saving':saved?'Saved':'Save Profile'}
            </motion.button>
          </motion.div>
        </div>

        {/* completion bar */}
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.20 }}
          style={{ marginTop:24, display:'flex', alignItems:'center', gap:16 }}>
          <span style={{ fontSize:14, color:'rgba(255,255,255,0.55)', fontWeight:600, flexShrink:0, ...Rs }}>Profile {complete}%</span>
          <div style={{ flex:1, height:5, borderRadius:5, background:'rgba(255,255,255,0.10)' }}>
            <motion.div initial={{ width:0 }} animate={{ width:`${complete}%` }} transition={{ duration:1.2, ease:'easeOut' }}
              style={{ height:'100%', borderRadius:5, background:'linear-gradient(90deg,#10b981,#22d3ee)', boxShadow:'0 0 10px rgba(16,185,129,0.65)' }}/>
          </div>
          <span style={{ fontSize:15, fontWeight:900, color:complete>=80?'#34d399':complete>=40?'#fbbf24':'#f87171', flexShrink:0, ...Rs }}>{complete}%</span>
        </motion.div>

        {/* membership tags */}
        <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.24 }}
          style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop:20 }}>
          {profile.cfaGroup && (
            <Link href="/cfa" style={{ textDecoration:'none' }}>
              <motion.div whileHover={{ y:-3, scale:1.04 }} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 18px', borderRadius:999, background:'rgba(34,197,94,0.16)', boxShadow:'0 0 0 1.5px rgba(34,197,94,0.35) inset', cursor:'pointer' }}>
                <Trees size={15} color="#22c55e"/>
                <span style={{ fontSize:14, fontWeight:700, color:'#22c55e', ...Rs }}>{profile.cfaGroup}</span>
              </motion.div>
            </Link>
          )}
          {profile.businessName && (
            <Link href="/sme" style={{ textDecoration:'none' }}>
              <motion.div whileHover={{ y:-3, scale:1.04 }} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 18px', borderRadius:999, background:'rgba(59,130,246,0.16)', boxShadow:'0 0 0 1.5px rgba(59,130,246,0.35) inset', cursor:'pointer' }}>
                <Store size={15} color="#3b82f6"/>
                <span style={{ fontSize:14, fontWeight:700, color:'#3b82f6', ...Rs }}>{profile.businessName}</span>
              </motion.div>
            </Link>
          )}
          {profile.chamaName && (
            <Link href="/saving" style={{ textDecoration:'none' }}>
              <motion.div whileHover={{ y:-3, scale:1.04 }} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 18px', borderRadius:999, background:'rgba(168,85,247,0.16)', boxShadow:'0 0 0 1.5px rgba(168,85,247,0.35) inset', cursor:'pointer' }}>
                <Users size={15} color="#a855f7"/>
                <span style={{ fontSize:14, fontWeight:700, color:'#a855f7', ...Rs }}>{profile.chamaName}</span>
              </motion.div>
            </Link>
          )}
          {!profile.cfaGroup && !profile.businessName && !profile.chamaName && (
            <span style={{ fontSize:14, color:'rgba(255,255,255,0.35)', fontStyle:'italic', ...Rs }}>
              No memberships yet — fill in the tabs below to add them
            </span>
          )}
        </motion.div>

        {/* ═══ DIVIDER ═══ */}
        <div style={{ marginTop:28, height:1, background:'linear-gradient(90deg,transparent,rgba(16,185,129,0.35),rgba(34,211,238,0.22),transparent)' }}/>

        {/* ═══════════════════════════════════════
            MAIN BODY: sidebar nav + form
        ═══════════════════════════════════════ */}
        <div style={{ marginTop:32, display:'grid', gridTemplateColumns:'240px 1fr', gap:36 }}>

          {/* LEFT: vertical tab nav */}
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {TABS.map((t,i) => (
              <motion.button key={t.id}
                initial={{ opacity:0, x:-14 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.14+i*0.05 }}
                whileHover={{ x:5 }}
                onClick={()=>setTab(t.id)}
                style={{
                  display:'flex', alignItems:'center', gap:12, padding:'14px 18px',
                  borderRadius:14, border:'none', cursor:'pointer', textAlign:'left',
                  background: tab===t.id ? `${t.color}16` : 'rgba(255,255,255,0.04)',
                  backdropFilter:'blur(12px)',
                  boxShadow: tab===t.id ? `0 0 0 1.5px ${t.color}40 inset` : '0 0 0 0.5px rgba(255,255,255,0.08) inset',
                  color: tab===t.id ? t.color : 'rgba(255,255,255,0.60)',
                  fontSize:15, fontWeight: tab===t.id ? 800 : 500,
                  transition:'all 0.18s',
                  ...Rs,
                }}>
                <t.Icon size={18}/>
                {t.label}
                {tab===t.id && <span style={{ marginLeft:'auto', width:8, height:8, borderRadius:'50%', background:t.color, boxShadow:`0 0 10px ${t.color}` }}/>}
              </motion.button>
            ))}

            {/* wallet */}
            <div style={{ marginTop:28, paddingTop:20, borderTop:'1px solid rgba(255,255,255,0.08)' }}>
              {isConnected ? (
                <>
                  <p style={{ fontSize:11, fontWeight:700, letterSpacing:1.2, textTransform:'uppercase', color:'rgba(255,255,255,0.35)', margin:'0 0 10px', ...Rs }}>Linked Wallet</p>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                    <Wallet size={14} color="#10b981"/>
                    <span style={{ fontSize:11, fontFamily:'monospace', color:'rgba(255,255,255,0.55)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {address}
                    </span>
                    <button onClick={copyAddr} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.35)', padding:0, display:'flex' }}>
                      {copied?<CheckCircle size={12} color="#4ade80"/>:<Copy size={12}/>}
                    </button>
                    <a href={`https://sepolia.etherscan.io/address/${address}`} target="_blank" rel="noreferrer" style={{ color:'#10b981', display:'flex' }}>
                      <ExternalLink size={12}/>
                    </a>
                  </div>
                  <button onClick={()=>disconnect()} style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 0', border:'none', background:'none', cursor:'pointer', color:'rgba(248,113,113,0.70)', fontSize:13, fontWeight:600, fontFamily:'inherit', ...Rs }}>
                    <LogOut size={14}/> Disconnect Wallet
                  </button>
                </>
              ) : (
                <Link href="/" style={{ textDecoration:'none' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:9, cursor:'pointer', padding:'10px 0', color:'rgba(255,255,255,0.50)', fontSize:14, ...Rs }}>
                    <Wallet size={15} color="#10b981"/> Connect wallet
                    <ChevronRight size={13} color="#10b981" style={{ marginLeft:'auto' }}/>
                  </div>
                </Link>
              )}
            </div>

            {/* quick links */}
            <div style={{ marginTop:24 }}>
              <p style={{ fontSize:11, fontWeight:700, letterSpacing:1.2, textTransform:'uppercase', color:'rgba(255,255,255,0.35)', margin:'0 0 10px', ...Rs }}>Quick Access</p>
              {[
                { label:'CFA Dashboard',  href:'/cfa',     color:'#22c55e', Icon:Trees     },
                { label:'SME Dashboard',  href:'/sme',     color:'#3b82f6', Icon:Store     },
                { label:'Saving Group',   href:'/saving',  color:'#a855f7', Icon:Users     },
                { label:'Kai Bar',        href:'/kai-bar', color:'#fbbf24', Icon:Award     },
                { label:'Pools',          href:'/pools',   color:'#22c55e', Icon:BarChart3 },
              ].map(l => (
                <Link key={l.label} href={l.href} style={{ textDecoration:'none' }}>
                  <motion.div whileHover={{ x:5 }}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:11, cursor:'pointer', transition:'background 0.18s', marginBottom:4 }}
                    onMouseEnter={e=>(e.currentTarget.style.background=`${l.color}10`)}
                    onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    <l.Icon size={15} color={l.color}/>
                    <span style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.65)', ...Rs }}>{l.label}</span>
                    <ChevronRight size={11} color="rgba(255,255,255,0.25)" style={{ marginLeft:'auto' }}/>
                  </motion.div>
                </Link>
              ))}
            </div>
          </div>

          {/* RIGHT: form — large text, open layout, no boxes */}
          <div>
            <AnimatePresence mode="wait">
              <motion.div key={tab}
                initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }}
                transition={{ duration:0.20 }}>

                {/* Section heading */}
                <div style={{ marginBottom:36 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                    {(() => { const t=TABS.find(x=>x.id===tab)!; return <t.Icon size={22} color={t.color} style={{ filter:`drop-shadow(0 0 8px ${t.color}80)`, flexShrink:0 }}/>; })()}
                    <h2 style={{ fontSize:26, fontWeight:900, margin:0, letterSpacing:'-0.5px', color:'#fff', ...R }}>
                      {tab==='personal' && <>Personal <span style={G}>Information</span></>}
                      {tab==='cfa'      && <>CFA <span style={G}>Group Membership</span></>}
                      {tab==='sme'      && <>Business <span style={{color:'#60a5fa',fontWeight:800}}>Profile</span></>}
                      {tab==='chama'    && <>Chama <span style={PU}>Membership</span></>}
                      {tab==='prefs'    && <>KAI <span style={AM}>Ecosystem Preferences</span></>}
                    </h2>
                    {editing && (
                      <span style={{ marginLeft:'auto', fontSize:11, fontWeight:800, padding:'4px 12px', borderRadius:999, background:'rgba(251,191,36,0.14)', boxShadow:'0 0 0 1px rgba(251,191,36,0.35) inset', ...AM, flexShrink:0 }}>
                        EDITING
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize:16, color:'rgba(255,255,255,0.60)', margin:0, lineHeight:1.65, ...Rs }}>
                    {tab==='personal' && 'Your core identity on KAI Nuvari'}
                    {tab==='cfa'      && <>Membership unlocks <span style={G}>forest yield vaults</span>, governance voting and <span style={AM}>carbon credit rewards</span></>}
                    {tab==='sme'      && <>Unlock <span style={{color:'#60a5fa',fontWeight:700}}>working capital loans</span>, yBOB merchant accounts and <span style={AM}>revenue tokenisation on Ethereum & Hedera</span></>}
                    {tab==='chama'    && <>Pool contributions auto-routed to the <span style={PU}>highest-yield vault</span> strategy. Current best: <span style={G}>22% APY</span></>}
                    {tab==='prefs'    && <>Personalise your <span style={AM}>DeFi risk strategy</span> and vault preferences</>}
                  </p>
                </div>

                {/* ── PERSONAL ── */}
                {tab==='personal' && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'32px 48px' }}>
                    <div style={{ gridColumn:'1/-1' }}>
                      <FormRow label="Display Name *">
                        <KInput value={profile.displayName} onChange={set('displayName')} placeholder="e.g. Grace Wangari" big/>
                      </FormRow>
                    </div>
                    <FormRow label="Phone Number">
                      <KInput value={profile.phone} onChange={set('phone')} placeholder="+254 7..." type="tel"/>
                    </FormRow>
                    <FormRow label="National ID">
                      <KInput value={profile.idNumber} onChange={set('idNumber')} placeholder="ID number"/>
                    </FormRow>
                    <div style={{ gridColumn:'1/-1' }}>
                      <FormRow label="County / Region">
                        <KSelect value={profile.county} onChange={set('county')} options={COUNTIES} placeholder="Select your county..."/>
                      </FormRow>
                    </div>
                    {isConnected && (
                      <div style={{ gridColumn:'1/-1', paddingTop:12 }}>
                        <p style={{ fontSize:11, fontWeight:700, letterSpacing:1.0, textTransform:'uppercase', color:'rgba(255,255,255,0.35)', margin:'0 0 8px', ...Rs }}>
                          Linked <span style={G}>Wallet</span>
                        </p>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <Wallet size={16} color="#10b981"/>
                          <span style={{ fontSize:13, fontFamily:'monospace', color:'rgba(255,255,255,0.65)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', ...Rs }}>{address}</span>
                          <a href={`https://sepolia.etherscan.io/address/${address}`} target="_blank" rel="noreferrer" style={{ color:'#10b981', display:'flex' }}>
                            <ExternalLink size={14}/>
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── CFA ── */}
                {tab==='cfa' && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'32px 48px' }}>
                    <div style={{ gridColumn:'1/-1' }}>
                      <FormRow label="CFA Group Name *">
                        <KInput value={profile.cfaGroup} onChange={set('cfaGroup')} placeholder="e.g. Mau Forest Guardians Group A" big/>
                      </FormRow>
                    </div>
                    <FormRow label="Your Role">
                      <KSelect value={profile.cfaRole} onChange={set('cfaRole')} options={CFA_ROLES} placeholder="Select role..."/>
                    </FormRow>
                    <FormRow label="Join Year">
                      <KInput value={profile.cfaJoinYear} onChange={set('cfaJoinYear')} placeholder="2022" type="number"/>
                    </FormRow>
                    <div style={{ gridColumn:'1/-1' }}>
                      <FormRow label="Forest Region">
                        <KInput value={profile.cfaRegion} onChange={set('cfaRegion')} placeholder="e.g. Rift Valley – Mau Complex"/>
                      </FormRow>
                    </div>
                    {/* forest products */}
                    <div style={{ gridColumn:'1/-1', marginTop:8 }}>
                      <p style={{ fontSize:13, fontWeight:700, letterSpacing:1.0, textTransform:'uppercase', color:'rgba(255,255,255,0.40)', margin:'0 0 18px', ...Rs }}>
                        Linked <span style={G}>Forest Products</span>
                      </p>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
                        {[
                          { name:'Honey Reserve', apy:'14.0%', color:'#f59e0b' },
                          { name:'Med. Herbs',    apy:'16.0%', color:'#22c55e' },
                          { name:'Seed Bank',     apy:'6.5%',  color:'#10b981' },
                          { name:'Water Rights',  apy:'5.8%',  color:'#60a5fa' },
                        ].map(p => (
                          <motion.div key={p.name} whileHover={{ y:-5, scale:1.04 }}
                            style={{ textAlign:'center', padding:'22px 12px', borderRadius:20, background:`linear-gradient(145deg,${p.color}14,rgba(6,6,16,0.70))`, backdropFilter:'blur(16px)', boxShadow:`0 0 0 1px ${p.color}28 inset, 0 8px 28px rgba(0,0,0,0.40)` }}>
                            <p style={{ fontSize:14, fontWeight:700, color:'rgba(255,255,255,0.80)', margin:'0 0 10px', ...Rs }}>{p.name}</p>
                            <p style={{ fontSize:28, fontWeight:900, color:p.color, margin:0, textShadow:`0 0 18px ${p.color}90, 0 0 40px ${p.color}40` }}>{p.apy}</p>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── SME ── */}
                {tab==='sme' && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'32px 48px' }}>
                    <div style={{ gridColumn:'1/-1' }}>
                      <FormRow label="Business Name *">
                        <KInput value={profile.businessName} onChange={set('businessName')} placeholder="e.g. Kipkelion Farm Supplies" big/>
                      </FormRow>
                    </div>
                    <FormRow label="Business Type">
                      <KSelect value={profile.businessType} onChange={set('businessType')} options={BIZ_TYPES} placeholder="Select type..."/>
                    </FormRow>
                    <FormRow label="Annual Turnover (KES)">
                      <KInput value={profile.annualTurnover} onChange={set('annualTurnover')} placeholder="500000" type="number"/>
                    </FormRow>
                    <div style={{ gridColumn:'1/-1' }}>
                      <FormRow label="Business Location">
                        <KInput value={profile.businessLocation} onChange={set('businessLocation')} placeholder="e.g. Kipkelion, Kericho County"/>
                      </FormRow>
                    </div>
                    <div style={{ gridColumn:'1/-1' }}>
                      <FormRow label="M-Pesa Till / Paybill">
                        <KInput value={profile.mpesaNumber} onChange={set('mpesaNumber')} placeholder="e.g. 4056789"/>
                      </FormRow>
                    </div>
                    <div style={{ gridColumn:'1/-1', marginTop:8 }}>
                      <p style={{ fontSize:13, fontWeight:700, letterSpacing:1.0, textTransform:'uppercase', color:'rgba(255,255,255,0.40)', margin:'0 0 18px', ...Rs }}>
                        Available <span style={{color:'#60a5fa',fontWeight:700}}>Financial Products</span>
                      </p>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
                        {[
                          { name:'Working Capital Loan', rate:'8% p.a.',  color:'#22c55e' },
                          { name:'Inventory Finance',    rate:'6% p.a.',  color:'#3b82f6' },
                          { name:'Merchant yBOB',        rate:'7.5% APY', color:'#a855f7' },
                        ].map(p => (
                          <motion.div key={p.name} whileHover={{ y:-5, scale:1.04 }}
                            style={{ textAlign:'center', padding:'22px 14px', borderRadius:20, background:`linear-gradient(145deg,${p.color}14,rgba(6,6,16,0.70))`, backdropFilter:'blur(16px)', boxShadow:`0 0 0 1px ${p.color}28 inset, 0 8px 28px rgba(0,0,0,0.40)` }}>
                            <p style={{ fontSize:14, fontWeight:700, color:'rgba(255,255,255,0.80)', margin:'0 0 10px', ...Rs }}>{p.name}</p>
                            <p style={{ fontSize:28, fontWeight:900, color:p.color, margin:0, textShadow:`0 0 18px ${p.color}90, 0 0 40px ${p.color}40` }}>{p.rate}</p>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── CHAMA ── */}
                {tab==='chama' && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'32px 48px' }}>
                    <div style={{ gridColumn:'1/-1' }}>
                      <FormRow label="Chama / SACCO Name *">
                        <KInput value={profile.chamaName} onChange={set('chamaName')} placeholder="e.g. Mwanzo Mpya Women Savings Chama" big/>
                      </FormRow>
                    </div>
                    <FormRow label="Your Role">
                      <KSelect value={profile.chamaRole} onChange={set('chamaRole')} options={CHAMA_ROLES} placeholder="Select role..."/>
                    </FormRow>
                    <FormRow label="Monthly Contribution (KES)">
                      <KInput value={profile.monthlyContrib} onChange={set('monthlyContrib')} placeholder="2000" type="number"/>
                    </FormRow>
                    <div style={{ gridColumn:'1/-1' }}>
                      <FormRow label="Registration Number (optional)">
                        <KInput value={profile.chamaRegNo} onChange={set('chamaRegNo')} placeholder="e.g. SS/NGO/2021/4821"/>
                      </FormRow>
                    </div>
                    <div style={{ gridColumn:'1/-1', marginTop:8 }}>
                      <p style={{ fontSize:13, fontWeight:700, letterSpacing:1.0, textTransform:'uppercase', color:'rgba(255,255,255,0.40)', margin:'0 0 18px', ...Rs }}>
                        Vault <span style={PU}>Strategies</span>
                      </p>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
                        {[
                          { name:'Conservative KES', apy:'12%', risk:'Very Low', color:'#22c55e' },
                          { name:'Balanced yBOB',    apy:'18%', risk:'Low',      color:'#3b82f6' },
                          { name:'High Yield ETH',  apy:'24%', risk:'Medium',   color:'#10b981' },
                        ].map(v => (
                          <motion.div key={v.name} whileHover={{ y:-5, scale:1.04 }}
                            style={{ textAlign:'center', padding:'22px 14px', borderRadius:20, background:`linear-gradient(145deg,${v.color}14,rgba(6,6,16,0.70))`, backdropFilter:'blur(16px)', boxShadow:`0 0 0 1px ${v.color}28 inset, 0 8px 28px rgba(0,0,0,0.40)` }}>
                            <p style={{ fontSize:14, fontWeight:700, color:'rgba(255,255,255,0.80)', margin:'0 0 4px', ...Rs }}>{v.name}</p>
                            <p style={{ fontSize:12, color:'rgba(255,255,255,0.40)', margin:'0 0 10px', ...Rs }}>Risk: {v.risk}</p>
                            <p style={{ fontSize:32, fontWeight:900, color:v.color, margin:0, textShadow:`0 0 20px ${v.color}90, 0 0 50px ${v.color}40` }}>{v.apy}</p>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── PREFS ── */}
                {tab==='prefs' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:36 }}>
                    <div>
                      <p style={{ fontSize:13, fontWeight:700, letterSpacing:1.0, textTransform:'uppercase', color:'rgba(255,255,255,0.40)', margin:'0 0 18px', ...Rs }}>
                        Risk <span style={AM}>Tolerance</span>
                      </p>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
                        {RISK_LEVELS.map(r => (
                          <motion.button key={r.v} whileHover={{ y:-4 }} whileTap={{ scale:0.97 }}
                            onClick={()=>set('riskTolerance')(r.v)}
                            style={{ padding:'24px 16px', borderRadius:20, border:'none', cursor:'pointer', textAlign:'center', background:profile.riskTolerance===r.v?`${r.color}18`:'rgba(255,255,255,0.04)', backdropFilter:'blur(14px)', boxShadow:profile.riskTolerance===r.v?`0 0 0 1.5px ${r.color}50 inset, 0 0 30px ${r.color}18`:'0 0 0 0.5px rgba(255,255,255,0.08) inset', transition:'all 0.20s' }}>
                            {profile.riskTolerance===r.v && <CheckCircle size={18} color={r.color} style={{ display:'block', margin:'0 auto 10px' }}/>}
                            <p style={{ fontSize:15, fontWeight:800, color:'#fff', margin:'0 0 5px', ...Rs }}>{r.label}</p>
                            <p style={{ fontSize:13, color:'rgba(255,255,255,0.45)', margin:'0 0 12px', ...Rs }}>Expected yield</p>
                            <p style={{ fontSize:30, fontWeight:900, color:r.color, margin:0, textShadow:`0 0 20px ${r.color}90, 0 0 50px ${r.color}40` }}>{r.apy}</p>
                          </motion.button>
                        ))}
                      </div>
                    </div>

                    <FormRow label="Preferred Vault">
                      <KSelect value={profile.preferredVault} onChange={set('preferredVault')} options={VAULTS} placeholder="Choose vault..."/>
                    </FormRow>

                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingBottom:20, borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
                      <div>
                        <p style={{ fontSize:16, fontWeight:700, color:'#fff', margin:'0 0 4px', ...Rs }}>Notifications</p>
                        <p style={{ fontSize:14, color:'rgba(255,255,255,0.50)', margin:0, ...Rs }}>Yield payouts, DAO votes, patrol alerts</p>
                      </div>
                      <button onClick={()=>set('notifications')(!profile.notifications)}
                        style={{ width:56, height:30, borderRadius:15, border:'none', cursor:'pointer', padding:0, background:profile.notifications?'linear-gradient(135deg,#10b981,#059669)':'rgba(255,255,255,0.12)', transition:'background 0.2s', position:'relative', flexShrink:0, boxShadow:profile.notifications?'0 0 16px rgba(16,185,129,0.45)':'none' }}>
                        <span style={{ position:'absolute', top:3, left:profile.notifications?29:3, width:24, height:24, borderRadius:'50%', background:'#fff', transition:'left 0.2s', boxShadow:'0 1px 5px rgba(0,0,0,0.45)' }}/>
                      </button>
                    </div>

                    {profile.updatedAt && (
                      <p style={{ fontSize:13, color:'rgba(255,255,255,0.28)', margin:0, ...Rs }}>
                        Last saved: {new Date(profile.updatedAt).toLocaleString('en-KE')}
                      </p>
                    )}
                  </div>
                )}

                {/* Save button */}
                <motion.button whileHover={{ scale:1.01 }} whileTap={{ scale:0.98 }}
                  onClick={save} disabled={saving||!isConnected}
                  style={{ marginTop:44, width:'100%', padding:'17px', borderRadius:16, border:'none', cursor:isConnected?'pointer':'not-allowed', background:saved?'rgba(34,197,94,0.18)':'linear-gradient(135deg,#34d399 0%,#10b981 50%,#059669 100%)', color:saved?'#4ade80':'#fff', fontSize:16, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', gap:10, boxShadow:saved?'none':'0 8px 32px rgba(16,185,129,0.40)', transition:'all 0.2s', opacity:saving||!isConnected?0.48:1, ...Rs }}>
                  {saving?<><RefreshCw size={18} style={{animation:'spin 1s linear infinite'}}/> Saving profile…</>
                  :saved?<><CheckCircle size={18}/> Profile Saved</>
                  :<><Save size={18}/> Save Profile</>}
                </motion.button>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity:0, y:12, scale:0.94 }} animate={{ opacity:1, y:0, scale:1 }} exit={{ opacity:0, y:12, scale:0.94 }}
            style={{ position:'fixed', bottom:100, left:'50%', transform:'translateX(-50%)', padding:'12px 28px', borderRadius:999, zIndex:200, whiteSpace:'nowrap', background:toast.includes('saved')?'rgba(34,197,94,0.22)':'rgba(248,113,113,0.22)', border:`1.5px solid ${toast.includes('saved')?'rgba(34,197,94,0.50)':'rgba(248,113,113,0.45)'}`, color:toast.includes('saved')?'#4ade80':'#f87171', fontSize:14, fontWeight:700, backdropFilter:'blur(20px)', boxShadow:'0 10px 36px rgba(0,0,0,0.60)' }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
