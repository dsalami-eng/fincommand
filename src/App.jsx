import React, { useState, useMemo, useEffect, useRef, useCallback, useContext, createContext } from "react";

// ── Global CSS ──────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body, #root { width:100%; min-height:100%; margin:0; padding:0; }
  body { overflow-x:hidden; }
  ::-webkit-scrollbar { width:5px; height:5px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:#2a3040; border-radius:3px; }
  input[type=range] { -webkit-appearance:none; appearance:none; }
  input[type=range]:focus { outline:none; }
  input, select, textarea { font-size:16px; } /* prevent iOS zoom */
  .fc-grid-2  { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .fc-grid-3  { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
  .fc-grid-5  { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; }
  .fc-health  { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
  .fc-runway4 { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
  .fc-analysis{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .fc-cashflow-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
  @media (max-width:1100px) {
    .fc-grid-5 { grid-template-columns:repeat(3,1fr); }
    .fc-cashflow-grid { grid-template-columns:repeat(3,1fr); }
  }
  @media (max-width:860px) {
    .fc-grid-2,.fc-analysis { grid-template-columns:1fr; }
    .fc-grid-3 { grid-template-columns:1fr 1fr; }
    .fc-grid-5 { grid-template-columns:1fr 1fr; }
    .fc-health  { grid-template-columns:1fr 1fr; }
    .fc-runway4 { grid-template-columns:1fr 1fr; }
    .fc-cashflow-grid { grid-template-columns:1fr 1fr; }
  }
  @media (max-width:560px) {
    .fc-grid-2,.fc-grid-3,.fc-grid-5,.fc-health,.fc-analysis { grid-template-columns:1fr; }
    .fc-runway4,.fc-cashflow-grid { grid-template-columns:1fr 1fr; }
  }
  @keyframes fc-spin { to { transform: rotate(360deg); } }
  .fc-spin { animation: fc-spin 0.8s linear infinite; }
`;
function GlobalStyles() { return <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />; }

// ══════════════════════════════════════════════════════════════════════════════
// SUPABASE  — real by default, env-injectable
// ══════════════════════════════════════════════════════════════════════════════
// ── Configure these with your real Supabase project credentials ──────────────
// Get them from: https://supabase.com/dashboard → Project → Settings → API
const SUPABASE_URL  = "https://cjgazhrxexjvztkzaujk.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqZ2F6aHJ4ZXhqdnp0a3phdWprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MTY0OTgsImV4cCI6MjA4ODQ5MjQ5OH0.2CB4zj-1z5RrS728vM87mq4rM1vnnxuahqE09HGuOXM";

const IS_CONFIGURED = !SUPABASE_URL.includes("YOUR_PROJECT");

// Fallback demo mode when keys not yet configured
const DEMO_KEY = "fincommand_demo_v6";
const demoStore = {
  get()   { try{ return JSON.parse(localStorage.getItem(DEMO_KEY)||"{}"); }catch{ return {}; } },
  set(d)  { try{ localStorage.setItem(DEMO_KEY,JSON.stringify(d)); }catch{} },
};
const DEMO_USER = { id:"demo-001", email:"demo@fincommand.app", user_metadata:{ full_name:"Demo User" } };

const demoDb = {
  async getSession()           { const s=demoStore.get(); return s.authed?{user:DEMO_USER}:null; },
  async signInEmail(e,p)       { if(!e||!p)return{user:null,error:"Required"}; demoStore.set({...demoStore.get(),authed:true}); return{user:DEMO_USER,error:null}; },
  async signUpEmail(e,p)       { if(!e||!p)return{user:null,error:"Required"}; demoStore.set({...demoStore.get(),authed:true}); return{user:DEMO_USER,error:null}; },
  async signInGoogle()         { demoStore.set({...demoStore.get(),authed:true}); return{error:null}; },
  async signOut()              { demoStore.set({}); return{error:null}; },
  async loadUserData()         { const s=demoStore.get(); return{data:s.userData||null,error:null}; },
  async saveUserData(_,payload){ demoStore.set({...demoStore.get(),userData:payload}); return{error:null}; },
  async resetPassword(e)       { return{error:null,message:"Check your email for reset link."}; },
};

let _sb = null;
async function getSb() {
  if(_sb) return _sb;
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  _sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
  });
  return _sb;
}
const realDb = {
  async getSession()           { const sb=await getSb(); const{data:{session}}=await sb.auth.getSession(); return session?{user:session.user}:null; },
  async signInEmail(e,p)       { const sb=await getSb(); const{data,error}=await sb.auth.signInWithPassword({email:e,password:p}); return{user:data?.user||null,error:error?.message||null}; },
  async signUpEmail(e,p)       { const sb=await getSb(); const{data,error}=await sb.auth.signUp({email:e,password:p,options:{emailRedirectTo:window.location.origin}}); return{user:data?.user||null,error:error?.message||null}; },
  async signInGoogle()         { const sb=await getSb(); const{error}=await sb.auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.origin,queryParams:{prompt:"select_account"}}}); return{error:error?.message||null}; },
  async signOut()              { const sb=await getSb(); return sb.auth.signOut(); },
  async loadUserData(uid)      { const sb=await getSb(); const{data,error}=await sb.from("user_data").select("*").eq("user_id",uid).maybeSingle(); return{data:data||null,error:error?.message||null}; },
  async saveUserData(uid,p)    { const sb=await getSb(); const{error}=await sb.from("user_data").upsert({user_id:uid,...p,updated_at:new Date().toISOString()},{onConflict:"user_id"}); return{error:error?.message||null}; },
  async resetPassword(email)   { const sb=await getSb(); const{error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+"/reset"}); return{error:error?.message||null}; },
};
const db = IS_CONFIGURED ? realDb : demoDb;

// Auth state listener helper
async function onAuthChange(cb) {
  if(!IS_CONFIGURED) return ()=>{};
  const sb = await getSb();
  const { data:{ subscription } } = sb.auth.onAuthStateChange(cb);
  return () => subscription?.unsubscribe();
}

// ══════════════════════════════════════════════════════════════════════════════
// THEMES — 13 themes across 3 categories
// ══════════════════════════════════════════════════════════════════════════════
const THEME_GROUPS = [
  { id:"dark",    label:"Dark",    emoji:"🌙" },
  { id:"light",   label:"Light",   emoji:"☀️" },
  { id:"cities",  label:"Cities",  emoji:"🌆" },
  { id:"culture", label:"Culture", emoji:"🌍" },
];
const THEMES = {
  // ── Dark terminals ──────────────────────────────────────────────────────────
  terminal: { id:"terminal", name:"Terminal", emoji:"🖥️", group:"dark",
    bg:"#08090b", surface:"#0f1114", card:"#141719", border:"#1e2329",
    text:"#e8eaf0", muted:"#4a5568", faint:"#1a1f26",
    green:"#00c896", red:"#ff4d6d", amber:"#f5a623", blue:"#4d9fff", purple:"#b57bee", accent:"#00c896" },
  slate: { id:"slate", name:"Slate", emoji:"🌫️", group:"dark",
    bg:"#0d1117", surface:"#161b22", card:"#1c2230", border:"#21293a",
    text:"#cdd9e5", muted:"#546e7a", faint:"#1a2233",
    green:"#3fb950", red:"#f85149", amber:"#d29922", blue:"#58a6ff", purple:"#bc8cff", accent:"#58a6ff" },
  midnight: { id:"midnight", name:"Midnight", emoji:"🌌",  group:"dark",
    bg:"#04050f", surface:"#080c1e", card:"#0d1230", border:"#141a3a",
    text:"#c8d6f0", muted:"#3a4870", faint:"#0b1028",
    green:"#00e5a0", red:"#ff4466", amber:"#ffa040", blue:"#6090ff", purple:"#a060ff", accent:"#6090ff" },
  // ── Light / soft ────────────────────────────────────────────────────────────
  spring: { id:"spring", name:"Spring", emoji:"🌸", group:"light",
    bg:"#f7f4f0", surface:"#ede8e2", card:"#ffffff", border:"#d9cfc6",
    text:"#2d2420", muted:"#8a7d74", faint:"#e8e0d8",
    green:"#3a8e54", red:"#c96b6b", amber:"#c8883a", blue:"#4a7fb0", purple:"#9b72b0", accent:"#c84580" },
  summer: { id:"summer", name:"Summer", emoji:"☀️", group:"light",
    bg:"#fffbf2", surface:"#fff4dc", card:"#ffffff", border:"#f0dba0",
    text:"#2a1e00", muted:"#a07828", faint:"#fff0c8",
    green:"#28a060", red:"#e04040", amber:"#f0a000", blue:"#2878c8", purple:"#8858b8", accent:"#e08000" },
  winter: { id:"winter", name:"Winter", emoji:"❄️", group:"light",
    bg:"#f0f4f8", surface:"#e4edf6", card:"#ffffff", border:"#c8d8ec",
    text:"#1a2840", muted:"#5a7898", faint:"#dce8f4",
    green:"#0a8060", red:"#c84040", amber:"#c87820", blue:"#1460b0", purple:"#5848a0", accent:"#1460b0" },
  // ── City themes ─────────────────────────────────────────────────────────────
  london: { id:"london", name:"London", emoji:"🇬🇧", group:"cities",
    bg:"#0f1318", surface:"#161c24", card:"#1c2530", border:"#253040",
    text:"#d8dde5", muted:"#50607a", faint:"#18222e",
    green:"#4aaa7c", red:"#cc4455", amber:"#c8920a", blue:"#4a8acc", purple:"#8878cc", accent:"#4a8acc" },
  newyork: { id:"newyork", name:"New York", emoji:"🗽", group:"cities",
    bg:"#0a0a0f", surface:"#111118", card:"#18181f", border:"#24242e",
    text:"#e8e8f0", muted:"#505068", faint:"#14141c",
    green:"#00cc88", red:"#ff3355", amber:"#ffa800", blue:"#4488ff", purple:"#cc44ff", accent:"#ffa800" },
  tokyo: { id:"tokyo", name:"Tokyo", emoji:"🗼", group:"cities",
    bg:"#0a0818", surface:"#110d28", card:"#161238", border:"#1e1848",
    text:"#e8d8f8", muted:"#5848a8", faint:"#130f30",
    green:"#00e8a8", red:"#ff2060", amber:"#ff9820", blue:"#40b0ff", purple:"#c030ff", accent:"#c030ff" },
  la: { id:"la", name:"Los Angeles", emoji:"🌴", group:"cities",
    bg:"#0c0a06", surface:"#181408", card:"#221c0a", border:"#302814",
    text:"#f8f0d8", muted:"#807050", faint:"#1e1808",
    green:"#50c858", red:"#ff5028", amber:"#ffc030", blue:"#30a8e8", purple:"#c050d8", accent:"#ffc030" },
  // ── Culture ─────────────────────────────────────────────────────────────────
  autumn: { id:"autumn", name:"Autumn", emoji:"🍂", group:"culture",
    bg:"#1a1208", surface:"#251a0a", card:"#2e2010", border:"#3d2e15",
    text:"#f0e0c0", muted:"#8a7050", faint:"#3a2a12",
    green:"#8ab840", red:"#e05030", amber:"#e08020", blue:"#7090c0", purple:"#b06890", accent:"#e08020" },
  westafrica: { id:"westafrica", name:"Kente", emoji:"🇬🇭", group:"culture",
    bg:"#0e0a02", surface:"#1a1404", card:"#221c06", border:"#332a08",
    text:"#fef0c0", muted:"#907840", faint:"#2a2208",
    green:"#40a840", red:"#e03010", amber:"#f0a800", blue:"#2080c0", purple:"#9840c0", accent:"#f0a800" },
  nigeria: { id:"nigeria", name:"Naija", emoji:"🇳🇬", group:"culture",
    bg:"#061006", surface:"#0c1e0c", card:"#112811", border:"#1a3a1a",
    text:"#d8f0d8", muted:"#4e7e4e", faint:"#162416",
    green:"#22d822", red:"#ff5022", amber:"#f8d000", blue:"#3878ff", purple:"#c050d8", accent:"#22d822" },
};
const ThemeCtx = createContext(THEMES.terminal);
const useTheme = () => useContext(ThemeCtx);

// ══════════════════════════════════════════════════════════════════════════════
// TAX ENGINE
// ══════════════════════════════════════════════════════════════════════════════
const TAX_CONFIGS = {
  US:{ name:"United States", flag:"🇺🇸", currency:"USD", symbol:"$",  fxToUSD:1,
    brackets:[{up:11600,r:.10},{up:47150,r:.12},{up:100525,r:.22},{up:191950,r:.24},{up:243725,r:.32},{up:609350,r:.35},{up:Infinity,r:.37}],
    stateRate:0.093, ficaRate:0.0765, ficaCap:160200,
    rentalNotes:"US-UK tax treaty prevents double-taxation. Declare worldwide income; claim foreign tax credit.",
    taxYearNote:"Tax year: Jan 1 – Dec 31. Filing: April 15." },
  UK:{ name:"United Kingdom", flag:"🇬🇧", currency:"GBP", symbol:"£", fxToUSD:1.27,
    brackets:[{up:12570,r:0},{up:50270,r:.20},{up:125140,r:.40},{up:Infinity,r:.45}],
    niRate:0.08, niUpper:50270, niLower:12570, niAbove:0.02,
    rentalNotes:"Rental income taxed at marginal rate. £1,000 property allowance. NRLS applies if non-resident.",
    taxYearNote:"Tax year: Apr 6 – Apr 5. Self Assessment: Jan 31." },
  CA:{ name:"Canada", flag:"🇨🇦", currency:"CAD", symbol:"CA$", fxToUSD:0.74,
    brackets:[{up:55867,r:.15},{up:111733,r:.205},{up:154906,r:.26},{up:220000,r:.29},{up:Infinity,r:.33}],
    provincialRate:0.1115, cppRate:0.0595, cppCap:68500, eiRate:0.0166, eiCap:63200,
    rentalNotes:"Rental income added to total. 50% of capital gains included. Principal residence exempt.",
    taxYearNote:"Tax year: Jan 1 – Dec 31. Filing: April 30." },
  AU:{ name:"Australia", flag:"🇦🇺", currency:"AUD", symbol:"A$", fxToUSD:0.65,
    brackets:[{up:18200,r:0},{up:45000,r:.19},{up:120000,r:.325},{up:180000,r:.37},{up:Infinity,r:.45}],
    medicareLevy:0.02,
    rentalNotes:"Negative gearing allowed. Rental losses offset income. 50% CGT discount after 12 months.",
    taxYearNote:"Tax year: Jul 1 – Jun 30. Filing: Oct 31." },
  DE:{ name:"Germany", flag:"🇩🇪", currency:"EUR", symbol:"€", fxToUSD:1.09,
    brackets:[{up:11604,r:0},{up:17006,r:.14},{up:66761,r:.24},{up:277826,r:.42},{up:Infinity,r:.45}],
    solidarityRate:0.055, socialInsuranceRate:0.195,
    rentalNotes:"Rental income (Vermietung) taxed at marginal. AfA depreciation 2%/yr on building value.",
    taxYearNote:"Tax year: Jan 1 – Dec 31. Filing: Jul 31." },
};
function calcTax(country, grossAnnual, bonusAnnual) {
  const cfg = TAX_CONFIGS[country]||TAX_CONFIGS.US;
  const total = grossAnnual + bonusAnnual;
  if(total<=0) return { netSalary:0, netBonus:0, effectiveRate:"0.0", annualTax:0 };
  let tax=0, prev=0;
  for(const b of cfg.brackets){ if(total<=prev)break; tax+=(Math.min(total,b.up)-prev)*b.r; prev=b.up; }
  let extra=0;
  if(country==="US")    { extra+=total*cfg.stateRate; extra+=Math.min(grossAnnual,cfg.ficaCap)*cfg.ficaRate; }
  else if(country==="UK"){ const ni=Math.max(0,Math.min(grossAnnual,cfg.niUpper)-cfg.niLower); extra+=ni*cfg.niRate+Math.max(0,grossAnnual-cfg.niUpper)*cfg.niAbove; }
  else if(country==="CA"){ extra+=total*cfg.provincialRate; extra+=Math.min(grossAnnual,cfg.cppCap)*cfg.cppRate; extra+=Math.min(grossAnnual,cfg.eiCap)*cfg.eiRate; }
  else if(country==="AU"){ extra+=total*cfg.medicareLevy; }
  else if(country==="DE"){ extra+=tax*cfg.solidarityRate; extra+=total*cfg.socialInsuranceRate; }
  const totalTax=tax+extra;
  const r=Math.max(0,1-totalTax/total);
  return { netSalary:Math.round((grossAnnual/12)*r), netBonus:Math.round((bonusAnnual/12)*r), effectiveRate:(totalTax/total*100).toFixed(1), annualTax:Math.round(totalTax) };
}

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS & HELPERS
// ══════════════════════════════════════════════════════════════════════════════
const TARGET_USD = 1900000;
const fv = (mo,rate,yrs) => { if(mo<=0||yrs<=0)return 0; const r=rate/12; return mo*((Math.pow(1+r,yrs*12)-1)/r)*(1+r); };
const sum = (arr,key) => (arr||[]).filter(i=>!i.excluded).reduce((s,i)=>s+(Number(i[key])||0),0);
const pct = n => (typeof n==="number"&&isFinite(n)&&!isNaN(n))?n.toFixed(1)+"%":"—";
const uid  = () => Date.now()+"-"+Math.random().toString(36).slice(2,7);

const INTERVAL_MODES = [
  {id:"1m",label:"Monthly", steps:Array.from({length:12},(_,i)=>(i+1)/12),  fmt:y=>"M"+Math.round(y*12)},
  {id:"6m",label:"6-Month", steps:Array.from({length:10},(_,i)=>(i+1)*0.5), fmt:y=>y<1?"6m":y+"yr"},
  {id:"1y",label:"Yearly",  steps:[1,2,3,4,5,6,7,8,10,12,15],               fmt:y=>y+"yr"},
  {id:"2y",label:"2-Year",  steps:[2,4,6,8,10,12,15,20],                    fmt:y=>y+"yr"},
  {id:"5y",label:"5-Year",  steps:[5,10,15,20,25,30],                       fmt:y=>y+"yr"},
];
const TABS = [
  {id:"overview",label:"Overview"},{id:"cashflow",label:"Cashflow"},
  {id:"income",label:"Income"},{id:"expenses",label:"Expenses"},
  {id:"savings",label:"Savings"},{id:"projections",label:"Projections"},{id:"analysis",label:"Analysis"},
];
const INCOME_TYPES = [{value:"salary",label:"Salary"},{value:"bonus",label:"Bonus"},{value:"rental",label:"Rental"},{value:"dividend",label:"Dividend"},{value:"freelance",label:"Freelance"},{value:"other",label:"Other"}];
const SAV_COLORS = ["#00c896","#4d9fff","#b57bee","#f5a623","#ff4d6d"];

const DEFAULT_FIXED  = () => [
  {id:uid(),name:"Rent / Mortgage",  amount:2000,excluded:false},
  {id:uid(),name:"Health Insurance", amount:200, excluded:false},
  {id:uid(),name:"Internet",         amount:60,  excluded:false},
  {id:uid(),name:"Phone",            amount:60,  excluded:false},
  {id:uid(),name:"Electricity",      amount:100, excluded:false},
  {id:uid(),name:"Subscriptions",    amount:80,  excluded:false},
  {id:uid(),name:"Gym & Wellness",   amount:80,  excluded:false},
  {id:uid(),name:"Transport / Car",  amount:200, excluded:false},
];
const DEFAULT_VAR = () => [
  {id:uid(),name:"Groceries",       amount:400, excluded:false},
  {id:uid(),name:"Dining Out",      amount:300, excluded:false},
  {id:uid(),name:"Entertainment",   amount:200, excluded:false},
  {id:uid(),name:"Clothing",        amount:100, excluded:false},
  {id:uid(),name:"Travel Fund",     amount:200, excluded:false},
  {id:uid(),name:"Miscellaneous",   amount:150, excluded:false},
];
const DEFAULT_SAV = () => [
  {id:uid(),name:"Index Funds",    amount:500, excluded:false},
  {id:uid(),name:"Pension / 401k", amount:300, excluded:false},
  {id:uid(),name:"Emergency Fund", amount:200, excluded:false},
];
const DEFAULT_CASHFLOW = () => ({
  months: Array.from({length:12},(_,i)=>{
    const d=new Date(); d.setMonth(d.getMonth()+i);
    return {
      id:uid(),
      label:d.toLocaleString("default",{month:"short"})+" "+d.getFullYear(),
      oneOffs: [],
    };
  }),
  openingBalance: 5000,
  showMonths: 12,
});

function buildFmt(symbol) {
  const fmt  = n => { const a=Math.abs(Math.round(n||0)); return (n<0?"-":"")+symbol+a.toLocaleString(); };
  const fmtK = n => { const a=Math.abs(n||0); const s=a>=1e6?symbol+(a/1e6).toFixed(2)+"M":symbol+Math.round(a/1000).toLocaleString()+"k"; return (n<0?"-":"")+s; };
  return { fmt, fmtK };
}
function calcProjRow(y,monthlySavings,netBonus,inclBonus) {
  const inv=Math.round(fv(monthlySavings,0.07,y));
  const bon=inclBonus?Math.round(fv(netBonus,0.07,y)):0;
  const car=Math.max(0,Math.round(30000*Math.pow(0.85,y)));
  return {y,inv,bon,car,total:inv+bon+car};
}
function niceMax(v) {
  if(v<=0)return 1;
  const mag=Math.pow(10,Math.floor(Math.log10(v)));
  for(const s of [1,1.5,2,2.5,3,4,5,6,7,8,10]) if(s*mag>=v) return s*mag;
  return 10*mag;
}

// ══════════════════════════════════════════════════════════════════════════════
// PRIMITIVE COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════
function Lbl({ children, color }) {
  const T=useTheme();
  return <div style={{fontSize:10,letterSpacing:1.5,textTransform:"uppercase",color:color||T.muted,marginBottom:6}}>{children}</div>;
}
function Pill({ label, color }) {
  return <span style={{fontSize:10,letterSpacing:1.2,textTransform:"uppercase",color,background:color+"2a",padding:"2px 8px",borderRadius:20,fontFamily:"monospace",fontWeight:700,whiteSpace:"nowrap"}}>{label}</span>;
}
function StatCard({ label, value, sub, color, size, bg }) {
  const T=useTheme();
  return (
    <div style={{background:bg||T.card,border:"1px solid "+T.border,borderRadius:14,padding:"16px 18px",minWidth:0}}>
      <div style={{fontSize:10,letterSpacing:1.5,textTransform:"uppercase",color:T.muted,marginBottom:7}}>{label}</div>
      <div style={{fontSize:size||22,fontFamily:"monospace",fontWeight:700,color:color||T.text,lineHeight:1.1,wordBreak:"break-word"}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:T.muted,marginTop:6,lineHeight:1.5}}>{sub}</div>}
    </div>
  );
}
function Toggle({ checked, onChange, label, sublabel, color }) {
  const T=useTheme(); const c=color||T.green;
  return (
    <div onClick={()=>onChange(!checked)} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",
      background:checked?c+"1a":T.faint+"80",border:"1px solid "+(checked?c+"55":T.border),
      borderRadius:8,padding:"8px 12px",transition:"all 0.2s",userSelect:"none"}}>
      <div style={{position:"relative",width:32,height:18,flexShrink:0}}>
        <div style={{position:"absolute",inset:0,borderRadius:9,background:checked?c:T.muted+"44",transition:"background 0.2s"}} />
        <div style={{position:"absolute",top:2,left:checked?16:2,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left 0.2s",boxShadow:checked?"0 0 6px "+c+"88":"none"}} />
      </div>
      <div>
        <div style={{fontSize:12,color:checked?T.text:T.muted,fontFamily:"monospace",fontWeight:checked?700:400}}>{label}</div>
        {sublabel&&<div style={{fontSize:11,color:T.muted,fontFamily:"monospace",marginTop:1}}>{sublabel}</div>}
      </div>
    </div>
  );
}
function SliderRow({ label, value, min, max, step, onChange, format, color, sublabel }) {
  const T=useTheme(); const c=color||T.blue;
  const w=((value-min)/(max-min))*100;
  return (
    <div style={{marginBottom:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:7,flexWrap:"wrap",gap:4}}>
        <div>
          <span style={{fontSize:12,color:T.text,fontFamily:"monospace"}}>{label}</span>
          {sublabel&&<span style={{fontSize:11,color:T.muted,fontFamily:"monospace",marginLeft:8}}>{sublabel}</span>}
        </div>
        <span style={{fontSize:18,color:c,fontFamily:"monospace",fontWeight:700}}>{format(value)}</span>
      </div>
      <div style={{position:"relative",height:5,background:T.faint,borderRadius:3}}>
        <div style={{position:"absolute",left:0,top:0,height:"100%",width:w+"%",background:"linear-gradient(90deg,"+c+"88,"+c+")",borderRadius:3}} />
        <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))}
          style={{position:"absolute",top:"50%",transform:"translateY(-50%)",width:"100%",opacity:0,cursor:"pointer",height:22,margin:0}} />
        <div style={{position:"absolute",top:"50%",transform:"translateY(-50%)",left:"calc("+w+"% - 7px)",width:14,height:14,borderRadius:"50%",background:c,border:"2px solid "+T.bg,boxShadow:"0 0 10px "+c+"66",pointerEvents:"none"}} />
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:3,fontSize:10,color:T.muted+"88",fontFamily:"monospace"}}>
        <span>{format(min)}</span><span>{format(max)}</span>
      </div>
    </div>
  );
}
function MiniBar({ value, max, color }) {
  const T=useTheme();
  const w=max>0?Math.min(100,Math.max(0,(value/max)*100)):0;
  return <div style={{height:4,background:T.faint,borderRadius:2}}><div style={{height:"100%",width:w+"%",background:color,borderRadius:2,transition:"width 0.25s"}} /></div>;
}
function Spinner() {
  const T=useTheme();
  return <div className="fc-spin" style={{width:16,height:16,border:"2px solid "+T.border,borderTop:"2px solid "+T.accent,borderRadius:"50%",display:"inline-block"}} />;
}

// ══════════════════════════════════════════════════════════════════════════════
// INLINE EDIT FIELD — click-to-edit for any cell
// ══════════════════════════════════════════════════════════════════════════════
function InlineEdit({ value, onCommit, type="text", style={}, placeholder="" }) {
  const T=useTheme();
  const [editing,setEditing]=useState(false);
  const [val,setVal]=useState(String(value));
  const inputRef=useRef(null);

  useEffect(()=>{ if(editing)inputRef.current?.select(); },[editing]);
  useEffect(()=>{ if(!editing)setVal(String(value)); },[value,editing]);

  const commit=()=>{
    setEditing(false);
    if(type==="number"){ const n=parseFloat(val); if(!isNaN(n)&&n>=0)onCommit(n); else setVal(String(value)); }
    else { const v=val.trim(); if(v)onCommit(v); else setVal(String(value)); }
  };

  if(editing) return (
    <input ref={inputRef} type={type==="number"?"number":"text"} value={val} onChange={e=>setVal(e.target.value)}
      onBlur={commit} onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Escape"){setEditing(false);setVal(String(value));}}}
      placeholder={placeholder}
      style={{background:T.faint,border:"1px solid "+T.accent+"66",borderRadius:5,padding:"3px 7px",color:T.text,fontFamily:"monospace",fontSize:13,outline:"none",...style}} />
  );
  return (
    <span onClick={()=>setEditing(true)}
      style={{cursor:"pointer",borderBottom:"1px dotted "+T.muted+"44",transition:"border-color 0.15s",lineHeight:1.4,...style}}
      title="Click to edit">{value}</span>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// THEME PICKER — grouped with 13 themes
// ══════════════════════════════════════════════════════════════════════════════
function ThemePicker({ current, onChange }) {
  const T=useTheme(); const [open,setOpen]=useState(false);
  const ref=useRef(null);
  useEffect(()=>{
    const h=e=>{ if(ref.current&&!ref.current.contains(e.target))setOpen(false); };
    document.addEventListener("mousedown",h); return ()=>document.removeEventListener("mousedown",h);
  },[]);
  const cur=THEMES[current]||THEMES.terminal;
  return (
    <div ref={ref} style={{position:"relative"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{background:T.faint,border:"1px solid "+T.border,color:T.text,borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:11,fontFamily:"monospace",display:"flex",alignItems:"center",gap:6}}>
        <span>{cur.emoji}</span>
        <span style={{color:T.muted}}>{cur.name}</span>
        <span style={{color:T.muted,fontSize:9}}>▼</span>
      </button>
      {open&&(
        <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:T.card,border:"1px solid "+T.border,borderRadius:12,padding:"10px",zIndex:300,width:340,boxShadow:"0 12px 40px #00000066",maxHeight:"80vh",overflowY:"auto"}}>
          {THEME_GROUPS.map(grp=>{
            const inGroup=Object.values(THEMES).filter(t=>t.group===grp.id);
            if(!inGroup.length) return null;
            return (
              <div key={grp.id} style={{marginBottom:10}}>
                <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:T.muted,marginBottom:6,paddingLeft:4}}>{grp.emoji} {grp.label}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
                  {inGroup.map(th=>(
                    <div key={th.id} onClick={()=>{onChange(th.id);setOpen(false);}}
                      style={{display:"flex",alignItems:"center",gap:7,padding:"7px 9px",borderRadius:8,cursor:"pointer",
                        background:current===th.id?th.accent+"1a":"transparent",
                        border:"1px solid "+(current===th.id?th.accent+"55":T.border+"44"),transition:"all 0.1s"}}>
                      <span style={{fontSize:14}}>{th.emoji}</span>
                      <span style={{fontSize:11,fontFamily:"monospace",color:current===th.id?th.accent:T.text,fontWeight:current===th.id?700:400,flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{th.name}</span>
                      <div style={{display:"flex",gap:2,flexShrink:0}}>
                        {[th.accent,th.blue,th.amber,th.green].map((c,i)=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:c}} />)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// EDITABLE TABLE — full inline name & value editing + slider
// ══════════════════════════════════════════════════════════════════════════════
function EditableTable({ title, icon, items, setItems, accentColor, sliderMax }) {
  const T=useTheme(); const sMax=sliderMax||5000;
  const [adding,setAdding]=useState(false);
  const [nName,setNName]=useState(""); const [nAmt,setNAmt]=useState(""); const [nType,setNType]=useState("other");

  const total=useMemo(()=>sum(items,"amount"),[items]);
  const upd=(id,v)=>setItems(p=>p.map(i=>i.id===id?{...i,amount:v}:i));
  const updN=(id,v)=>setItems(p=>p.map(i=>i.id===id?{...i,name:v}:i));
  const tog=(id)=>setItems(p=>p.map(i=>i.id===id?{...i,excluded:!i.excluded}:i));
  const del=(id)=>setItems(p=>p.filter(i=>i.id!==id));
  const add=()=>{ const a=parseFloat(nAmt); if(!nName.trim()||isNaN(a)||a<=0)return; setItems(p=>[...p,{id:uid(),name:nName.trim(),amount:a,type:nType,excluded:false,custom:true}]); setNName("");setNAmt("");setAdding(false); };
  const inputS={background:T.faint,border:"1px solid "+T.border,borderRadius:6,padding:"7px 10px",color:T.text,fontFamily:"monospace",fontSize:14,outline:"none"};

  return (
    <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:14,overflow:"hidden",marginBottom:14}}>
      <div style={{background:accentColor+"14",borderBottom:"1px solid "+T.border,padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:15}}>{icon}</span>
          <span style={{fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:T.text,fontFamily:"monospace"}}>{title}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:18,fontFamily:"monospace",fontWeight:700,color:accentColor}}>{total.toLocaleString()}</span>
          <button onClick={()=>setAdding(o=>!o)} style={{background:adding?accentColor+"22":T.faint,border:"1px solid "+(adding?accentColor:T.border),color:adding?accentColor:T.muted,borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:11,fontFamily:"monospace"}}>+ Add</button>
        </div>
      </div>
      <div style={{padding:"10px 18px 6px"}}>
        {items.map(item=>{
          const c=item.color||accentColor;
          const share=total>0&&!item.excluded?(item.amount/total)*100:0;
          return (
            <div key={item.id} style={{marginBottom:13,opacity:item.excluded?0.35:1,transition:"opacity 0.2s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:item.excluded?0:5,gap:6,flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:7,flex:1,minWidth:0}}>
                  <div style={{width:8,height:8,borderRadius:2,background:c,flexShrink:0}} />
                  {/* Inline name edit */}
                  {item.auto
                    ? <span style={{fontSize:12,color:T.text,fontFamily:"monospace",textDecoration:item.excluded?"line-through":"none"}}>{item.name}</span>
                    : <InlineEdit value={item.name} onCommit={v=>updN(item.id,v)} style={{fontSize:12,color:T.text,fontFamily:"monospace",textDecoration:item.excluded?"line-through":"none"}} />
                  }
                  {item.type&&item.type!=="other"&&<Pill label={item.type} color={c} />}
                  {item.excluded&&<Pill label="off" color={T.muted} />}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:7,flexShrink:0}}>
                  {!item.excluded&&<span style={{fontSize:10,color:T.muted,fontFamily:"monospace"}}>{pct(share)}</span>}
                  {/* Inline value edit */}
                  {item.auto
                    ? <span style={{fontSize:13,color:item.excluded?T.muted:c,fontFamily:"monospace",fontWeight:700,minWidth:60,textAlign:"right"}}>{item.amount.toLocaleString()}</span>
                    : <InlineEdit value={item.amount} type="number" onCommit={v=>upd(item.id,v)}
                        style={{fontSize:13,color:c,fontFamily:"monospace",fontWeight:700,textAlign:"right",maxWidth:90}} />
                  }
                  {item.auto
                    ? <span style={{fontSize:10,color:T.muted,padding:"2px 6px",border:"1px solid "+T.border,borderRadius:4,fontFamily:"monospace"}}>auto</span>
                    : <>
                        <button onClick={()=>tog(item.id)} style={{background:"transparent",border:"1px solid "+T.border,color:T.muted,cursor:"pointer",fontSize:10,padding:"3px 7px",borderRadius:4,fontFamily:"monospace"}}>{item.excluded?"on":"off"}</button>
                        {item.custom&&<button onClick={()=>del(item.id)} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:18,padding:"0 2px",lineHeight:1}}>×</button>}
                      </>}
                </div>
              </div>
              {!item.excluded&&!item.auto&&(
                <div style={{position:"relative",height:4,background:T.faint,borderRadius:2}}>
                  <div style={{position:"absolute",left:0,top:0,height:"100%",width:Math.min(100,(item.amount/sMax)*100)+"%",background:c+"88",borderRadius:2,transition:"width 0.1s"}} />
                  <input type="range" min={0} max={sMax} step={10} value={item.amount} onChange={e=>upd(item.id,Number(e.target.value))}
                    style={{position:"absolute",top:"50%",transform:"translateY(-50%)",width:"100%",opacity:0,cursor:"pointer",height:20,margin:0}} />
                </div>
              )}
              {!item.excluded&&item.auto&&<MiniBar value={item.amount} max={sMax} color={c+"44"} />}
              {item.sub&&<div style={{fontSize:10,color:T.muted,fontFamily:"monospace",marginTop:3,paddingLeft:16}}>{item.sub}</div>}
            </div>
          );
        })}
      </div>
      {adding&&(
        <div style={{padding:"12px 18px",borderTop:"1px solid "+T.border,display:"flex",gap:8,flexWrap:"wrap",background:T.surface,alignItems:"center"}}>
          <input placeholder="Name" value={nName} onChange={e=>setNName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} style={{...inputS,flex:1,minWidth:100}} />
          <select value={nType} onChange={e=>setNType(e.target.value)} style={{...inputS,background:T.faint}}>
            {INCOME_TYPES.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input type="number" placeholder="Amount /mo" value={nAmt} onChange={e=>setNAmt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} style={{...inputS,width:120}} />
          <button onClick={add} style={{background:accentColor,border:"none",color:T.bg,borderRadius:6,padding:"8px 14px",cursor:"pointer",fontSize:12,fontFamily:"monospace",fontWeight:700}}>Add</button>
          <button onClick={()=>setAdding(false)} style={{background:T.faint,border:"none",color:T.muted,borderRadius:6,padding:"8px 10px",cursor:"pointer",fontSize:12,fontFamily:"monospace"}}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SAVINGS SECTION
// ══════════════════════════════════════════════════════════════════════════════
function SavingsSection({ buckets, setBuckets }) {
  const T=useTheme();
  const [adding,setAdding]=useState(false);
  const [nName,setNName]=useState(""); const [nAmt,setNAmt]=useState("");
  const total=useMemo(()=>sum(buckets,"amount"),[buckets]);
  const upd=(id,v)=>setBuckets(p=>p.map(b=>b.id===id?{...b,amount:v}:b));
  const updN=(id,v)=>setBuckets(p=>p.map(b=>b.id===id?{...b,name:v}:b));
  const tog=(id)=>setBuckets(p=>p.map(b=>b.id===id?{...b,excluded:!b.excluded}:b));
  const del=(id)=>setBuckets(p=>p.filter(b=>b.id!==id));
  const add=()=>{ const a=parseFloat(nAmt); if(!nName.trim()||isNaN(a)||a<=0)return; setBuckets(p=>[...p,{id:uid(),name:nName.trim(),amount:a,excluded:false,custom:true}]); setNName("");setNAmt("");setAdding(false); };
  const inputS={background:T.faint,border:"1px solid "+T.border,borderRadius:6,padding:"7px 10px",color:T.text,fontFamily:"monospace",fontSize:14,outline:"none"};

  return (
    <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:14,overflow:"hidden",marginBottom:14}}>
      <div style={{background:T.green+"14",borderBottom:"1px solid "+T.border,padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span>💰</span>
          <span style={{fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:T.text,fontFamily:"monospace"}}>Savings Buckets</span>
        </div>
        <div style={{display:"flex",gap:12,alignItems:"center"}}>
          <span style={{fontSize:18,fontFamily:"monospace",fontWeight:700,color:T.green}}>{total.toLocaleString()}</span>
          <button onClick={()=>setAdding(o=>!o)} style={{background:adding?T.green+"22":T.faint,border:"1px solid "+(adding?T.green:T.border),color:adding?T.green:T.muted,borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:11,fontFamily:"monospace"}}>+ Add</button>
        </div>
      </div>
      <div style={{padding:"10px 18px 6px"}}>
        {buckets.map((b,idx)=>{
          const c=b.color||SAV_COLORS[idx%SAV_COLORS.length];
          const share=total>0&&!b.excluded?(b.amount/total)*100:0;
          return (
            <div key={b.id} style={{marginBottom:13,opacity:b.excluded?0.35:1,transition:"opacity 0.2s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5,gap:6,flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:7,flex:1,minWidth:0}}>
                  <div style={{width:8,height:8,borderRadius:2,background:c,flexShrink:0}} />
                  <InlineEdit value={b.name} onCommit={v=>updN(b.id,v)} style={{fontSize:12,color:T.text,fontFamily:"monospace",textDecoration:b.excluded?"line-through":"none"}} />
                  {b.excluded&&<Pill label="off" color={T.muted} />}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:7,flexShrink:0}}>
                  {!b.excluded&&<span style={{fontSize:10,color:T.muted,fontFamily:"monospace"}}>{pct(share)}</span>}
                  <InlineEdit value={b.amount} type="number" onCommit={v=>upd(b.id,v)} style={{fontSize:13,color:c,fontFamily:"monospace",fontWeight:700,textAlign:"right",maxWidth:90}} />
                  <button onClick={()=>tog(b.id)} style={{background:"transparent",border:"1px solid "+T.border,color:T.muted,cursor:"pointer",fontSize:10,padding:"3px 7px",borderRadius:4,fontFamily:"monospace"}}>{b.excluded?"on":"off"}</button>
                  {b.custom&&<button onClick={()=>del(b.id)} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:18,padding:"0 2px",lineHeight:1}}>×</button>}
                </div>
              </div>
              {!b.excluded&&(
                <div style={{position:"relative",height:4,background:T.faint,borderRadius:2}}>
                  <div style={{position:"absolute",left:0,top:0,height:"100%",width:Math.min(100,(b.amount/5000)*100)+"%",background:c+"88",borderRadius:2,transition:"width 0.1s"}} />
                  <input type="range" min={0} max={5000} step={25} value={b.amount} onChange={e=>upd(b.id,Number(e.target.value))}
                    style={{position:"absolute",top:"50%",transform:"translateY(-50%)",width:"100%",opacity:0,cursor:"pointer",height:20,margin:0}} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {adding&&(
        <div style={{padding:"12px 18px",borderTop:"1px solid "+T.border,display:"flex",gap:8,flexWrap:"wrap",background:T.surface,alignItems:"center"}}>
          <input placeholder="Bucket name" value={nName} onChange={e=>setNName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} style={{...inputS,flex:1,minWidth:110}} />
          <input type="number" placeholder="Amount /mo" value={nAmt} onChange={e=>setNAmt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} style={{...inputS,width:120}} />
          <button onClick={add} style={{background:T.green,border:"none",color:T.bg,borderRadius:6,padding:"8px 14px",cursor:"pointer",fontSize:12,fontFamily:"monospace",fontWeight:700}}>Add</button>
          <button onClick={()=>setAdding(false)} style={{background:T.faint,border:"none",color:T.muted,borderRadius:6,padding:"8px 10px",cursor:"pointer",fontSize:12,fontFamily:"monospace"}}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PROJECTION CHART
// ══════════════════════════════════════════════════════════════════════════════
function ProjChart({ monthlySavings, netBonus, includeBonus, intervalMode, fmtK }) {
  const T=useTheme();
  const [hovIdx,setHovIdx]=useState(null);
  const mode=useMemo(()=>INTERVAL_MODES.find(m=>m.id===intervalMode)||INTERVAL_MODES[2],[intervalMode]);
  const data=useMemo(()=>mode.steps.map(y=>calcProjRow(y,monthlySavings,netBonus,includeBonus)),[mode,monthlySavings,netBonus,includeBonus]);
  const ceiling=useMemo(()=>niceMax(Math.max(...data.map(d=>d.total),TARGET_USD*1.1)),[data]);
  const CHART_H=200;
  const toH=v=>Math.round((v/ceiling)*CHART_H);
  const toPct=v=>((v/ceiling)*100)+"%";
  const isCompact=data.length>10;
  const grids=useMemo(()=>Array.from({length:4},(_,i)=>ceiling*((i+1)/4)),[ceiling]);

  return (
    <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:14,padding:"20px 22px",marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div>
          <Lbl color={T.blue}>Net Worth Projection</Lbl>
          <div style={{fontSize:11,color:T.muted,fontFamily:"monospace"}}>7% annualised · {mode.label} intervals</div>
        </div>
        <Pill label="Target $1.9M" color={T.amber} />
      </div>
      <div style={{display:"flex",gap:0}}>
        <div style={{display:"flex",flexDirection:"column-reverse",justifyContent:"space-between",width:48,flexShrink:0,height:CHART_H,paddingBottom:2}}>
          {[0,...grids].map((v,i)=><div key={i} style={{fontSize:8,color:T.muted+"99",fontFamily:"monospace",textAlign:"right",paddingRight:6,lineHeight:1}}>{fmtK(v)}</div>)}
        </div>
        <div style={{flex:1,position:"relative",height:CHART_H}}>
          {grids.map((v,i)=><div key={i} style={{position:"absolute",left:0,right:0,bottom:toPct(v),borderTop:"1px dashed "+T.faint,pointerEvents:"none"}} />)}
          {TARGET_USD<=ceiling&&(
            <div style={{position:"absolute",left:0,right:0,bottom:toPct(TARGET_USD),borderTop:"1px dashed "+T.amber+"88",pointerEvents:"none"}}>
              <span style={{position:"absolute",right:4,top:-13,fontSize:8,color:T.amber,fontFamily:"monospace",whiteSpace:"nowrap"}}>target</span>
            </div>
          )}
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"flex-end",gap:isCompact?2:5,padding:"0 2px"}}>
            {data.map((d,idx)=>{
              const barH=toH(d.total),invH=toH(d.inv),hit=d.total>=TARGET_USD,hov=hovIdx===idx;
              return (
                <div key={d.y} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",minWidth:0,position:"relative"}}
                  onMouseEnter={()=>setHovIdx(idx)} onMouseLeave={()=>setHovIdx(null)} onTouchStart={()=>setHovIdx(idx)}>
                  {hov&&(
                    <div style={{position:"absolute",bottom:barH+8,left:"50%",transform:"translateX(-50%)",background:T.surface,
                      border:"1px solid "+(hit?T.amber:T.green)+"88",borderRadius:9,padding:"10px 12px",zIndex:10,whiteSpace:"nowrap",boxShadow:"0 4px 24px #00000066",pointerEvents:"none"}}>
                      <div style={{fontSize:10,color:T.muted,fontFamily:"monospace",letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>{mode.fmt(d.y)}{hit?" ✓ target":""}</div>
                      <div style={{fontSize:15,color:hit?T.amber:T.green,fontFamily:"monospace",fontWeight:700,marginBottom:4}}>{fmtK(d.total)}</div>
                      <div style={{fontSize:11,color:T.blue,fontFamily:"monospace"}}>Investments: {fmtK(d.inv)}</div>
                      {includeBonus&&<div style={{fontSize:11,color:T.amber,fontFamily:"monospace"}}>Bonus: {fmtK(d.bon)}</div>}
                      <div style={{fontSize:11,color:T.muted,fontFamily:"monospace"}}>Car: {fmtK(d.car)}</div>
                    </div>
                  )}
                  {!isCompact&&!hov&&<div style={{fontSize:8,color:hit?T.amber:T.green,fontFamily:"monospace",fontWeight:700,whiteSpace:"nowrap",marginBottom:2,lineHeight:1}}>{fmtK(d.total)}</div>}
                  {!isCompact&&hov&&<div style={{height:12,marginBottom:2}} />}
                  <div style={{width:"100%",height:barH,background:hov?(hit?T.amber+"55":T.green+"44"):(hit?T.amber+"2a":T.green+"1a"),
                    border:"1px solid "+(hit?T.amber:T.green)+(hov?"cc":"44"),borderRadius:"3px 3px 0 0",display:"flex",flexDirection:"column",
                    justifyContent:"flex-end",overflow:"hidden",flexShrink:0,transition:"background 0.15s",cursor:"crosshair"}}>
                    <div style={{width:"100%",height:invH,background:hov?T.blue+"cc":T.blue+"88",flexShrink:0}} />
                  </div>
                  <div style={{fontSize:isCompact?7:8,color:hov?T.text:(hit?T.amber:T.muted),fontFamily:"monospace",whiteSpace:"nowrap",marginTop:3,lineHeight:1,fontWeight:hov?700:400}}>{mode.fmt(d.y)}{hit?"✓":""}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{display:"flex",gap:14,flexWrap:"wrap",marginTop:14}}>
        {[{l:"Investments",c:T.blue},{l:"Other",c:T.purple},{l:"Total",c:T.green},{l:"Target",c:T.amber}].map(x=>(
          <div key={x.l} style={{display:"flex",alignItems:"center",gap:5}}>
            <div style={{width:7,height:7,borderRadius:2,background:x.c}} />
            <span style={{fontSize:10,color:T.muted,fontFamily:"monospace"}}>{x.l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CASHFLOW TAB — inspired by 18M Cashflow spreadsheet
// ══════════════════════════════════════════════════════════════════════════════
function CashflowTab({ cashflow, setCashflow, monthlyIncome, monthlyExpenses, monthlySavings, fmt, fmtK }) {
  const T=useTheme();
  const [addingOneOff,setAddingOneOff]=useState(null); // monthId
  const [nLabel,setNLabel]=useState(""); const [nAmount,setNAmount]=useState("");

  const { months, openingBalance } = cashflow;

  // Compute running cashflow
  const rows = useMemo(()=>{
    let opening = openingBalance;
    return months.map(mo=>{
      const oneOffTotal = (mo.oneOffs||[]).reduce((s,o)=>s+o.amount,0);
      const surplus    = monthlyIncome - monthlyExpenses - monthlySavings;
      const netMonth   = surplus - oneOffTotal;
      const closing    = opening + netMonth;
      const r = { ...mo, surplus, oneOffTotal, netMonth, openingBal:opening, closingBal:closing };
      opening = closing;
      return r;
    });
  },[months,openingBalance,monthlyIncome,monthlyExpenses,monthlySavings]);

  const summary = useMemo(()=>({
    totalOneOffs:  rows.reduce((s,r)=>s+r.oneOffTotal,0),
    totalSurplus:  rows.reduce((s,r)=>s+r.surplus,0),
    finalBalance:  rows.length?rows[rows.length-1].closingBal:openingBalance,
    lowestBalance: Math.min(...rows.map(r=>r.closingBal), openingBalance),
  }),[rows,openingBalance]);

  const addOneOff=(monthId)=>{
    const a=parseFloat(nAmount);
    if(!nLabel.trim()||isNaN(a)||a<=0)return;
    setCashflow(cf=>({ ...cf, months: cf.months.map(m=>m.id===monthId?{...m,oneOffs:[...(m.oneOffs||[]),{id:uid(),label:nLabel.trim(),amount:a}]}:m) }));
    setNLabel("");setNAmount("");setAddingOneOff(null);
  };
  const delOneOff=(monthId,oId)=>{
    setCashflow(cf=>({ ...cf, months: cf.months.map(m=>m.id===monthId?{...m,oneOffs:(m.oneOffs||[]).filter(o=>o.id!==oId)}:m) }));
  };
  const updOneOffLabel=(monthId,oId,v)=>{
    setCashflow(cf=>({ ...cf, months: cf.months.map(m=>m.id===monthId?{...m,oneOffs:(m.oneOffs||[]).map(o=>o.id===oId?{...o,label:v}:o)}:m) }));
  };
  const updOneOffAmount=(monthId,oId,v)=>{
    setCashflow(cf=>({ ...cf, months: cf.months.map(m=>m.id===monthId?{...m,oneOffs:(m.oneOffs||[]).map(o=>o.id===oId?{...o,amount:v}:o)}:m) }));
  };

  const inputS={background:T.faint,border:"1px solid "+T.border,borderRadius:6,padding:"7px 10px",color:T.text,fontFamily:"monospace",fontSize:14,outline:"none"};

  return (
    <div>
      {/* Summary KPIs */}
      <div className="fc-cashflow-grid" style={{marginBottom:16}}>
        <StatCard label="Opening Balance"  value={fmt(openingBalance)}         color={T.blue}  sub="Starting cash position" />
        <StatCard label="Total One-Offs"   value={fmt(summary.totalOneOffs)}   color={T.amber} sub="Non-recurring costs" />
        <StatCard label="Closing Balance"  value={fmt(summary.finalBalance)}   color={summary.finalBalance>=0?T.green:T.red} sub="End of period" />
        <StatCard label="Lowest Balance"   value={fmt(summary.lowestBalance)}  color={summary.lowestBalance<0?T.red:summary.lowestBalance<monthlyExpenses*2?T.amber:T.green} sub="Cash floor — watch this" />
      </div>

      {/* Opening balance edit */}
      <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:12,padding:"14px 18px",marginBottom:14,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:200}}>
          <Lbl color={T.blue}>Opening Cash Balance</Lbl>
          <div style={{fontSize:11,color:T.muted}}>Starting liquid balance before the first month. Edit by clicking the value.</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <InlineEdit value={openingBalance} type="number"
            onCommit={v=>setCashflow(cf=>({...cf,openingBalance:v}))}
            style={{fontSize:22,color:T.blue,fontFamily:"monospace",fontWeight:700}} />
          <span style={{fontSize:11,color:T.muted,fontFamily:"monospace"}}>click to edit</span>
        </div>
      </div>

      {/* Month-by-month grid — horizontal scroll on mobile */}
      <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:14,overflow:"hidden",marginBottom:14}}>
        <div style={{background:T.blue+"14",borderBottom:"1px solid "+T.border,padding:"12px 18px"}}>
          <Lbl color={T.blue}>Monthly Cashflow — {months.length}-Month View</Lbl>
          <div style={{fontSize:11,color:T.muted}}>Recurring surplus + one-off expenses per month. One-offs are non-recurring costs that hit your cash position.</div>
        </div>
        <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
          <table style={{width:"100%",minWidth:700,borderCollapse:"collapse",fontSize:11,fontFamily:"monospace"}}>
            <thead>
              <tr style={{background:T.surface}}>
                {["Month","Recurring Surplus","One-Off Costs","Net This Month","Opening Balance","Closing Balance"].map(h=>(
                  <th key={h} style={{padding:"10px 12px",textAlign:"right",color:T.muted,fontSize:10,letterSpacing:1.2,textTransform:"uppercase",borderBottom:"1px solid "+T.border,whiteSpace:"nowrap",fontFamily:"monospace",fontWeight:600}}>
                    {h==="Month"?<span style={{textAlign:"left",display:"block"}}>{h}</span>:h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row,idx)=>{
                const pos=row.closingBal>=0;
                const lowBal=row.closingBal<monthlyExpenses;
                const rowBg=idx%2===0?T.surface:"transparent";
                return (
                  <React.Fragment key={row.id}>
                    <tr style={{background:rowBg,cursor:"pointer"}} onClick={()=>setAddingOneOff(addingOneOff===row.id?null:row.id)}>
                      <td style={{padding:"10px 12px",color:T.text,fontWeight:700,whiteSpace:"nowrap"}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:13}}>{row.label}</span>
                          {(row.oneOffs||[]).length>0&&<Pill label={row.oneOffs.length+" one-off"+(row.oneOffs.length>1?"s":"")} color={T.amber} />}
                          <span style={{fontSize:10,color:T.muted,marginLeft:4}}>{addingOneOff===row.id?"▲":"▼"}</span>
                        </div>
                      </td>
                      <td style={{padding:"10px 12px",textAlign:"right",color:row.surplus>=0?T.green:T.red,fontWeight:600}}>{fmt(row.surplus)}</td>
                      <td style={{padding:"10px 12px",textAlign:"right",color:row.oneOffTotal>0?T.amber:T.muted}}>
                        {row.oneOffTotal>0?"-"+fmt(row.oneOffTotal):"—"}
                      </td>
                      <td style={{padding:"10px 12px",textAlign:"right",color:row.netMonth>=0?T.green:T.red,fontWeight:700}}>{row.netMonth>=0?"+":""}{fmt(row.netMonth)}</td>
                      <td style={{padding:"10px 12px",textAlign:"right",color:T.muted}}>{fmt(row.openingBal)}</td>
                      <td style={{padding:"10px 12px",textAlign:"right",color:pos?(lowBal?T.amber:T.green):T.red,fontWeight:700}}>
                        {fmt(row.closingBal)}{!pos?" ⚠":""}
                      </td>
                    </tr>
                    {/* Expanded one-offs panel */}
                    {addingOneOff===row.id&&(
                      <tr style={{background:T.faint}}>
                        <td colSpan={6} style={{padding:"0"}}>
                          <div style={{padding:"14px 18px",borderTop:"1px solid "+T.border,borderBottom:"1px solid "+T.border}}>
                            <div style={{fontSize:11,color:T.amber,fontFamily:"monospace",fontWeight:700,marginBottom:10,letterSpacing:1.2,textTransform:"uppercase"}}>One-Off Expenses — {row.label}</div>
                            {(row.oneOffs||[]).length===0&&(
                              <div style={{fontSize:11,color:T.muted,marginBottom:10}}>No one-off expenses this month. Add one below.</div>
                            )}
                            {(row.oneOffs||[]).map(o=>(
                              <div key={o.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,flexWrap:"wrap"}}>
                                <InlineEdit value={o.label} onCommit={v=>updOneOffLabel(row.id,o.id,v)}
                                  style={{fontSize:12,color:T.text,fontFamily:"monospace",flex:1,minWidth:120}} />
                                <span style={{color:T.muted,fontFamily:"monospace",fontSize:11}}>—</span>
                                <InlineEdit value={o.amount} type="number" onCommit={v=>updOneOffAmount(row.id,o.id,v)}
                                  style={{fontSize:13,color:T.amber,fontFamily:"monospace",fontWeight:700,maxWidth:100}} />
                                <button onClick={()=>delOneOff(row.id,o.id)} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:18,padding:"0 2px",lineHeight:1}}>×</button>
                              </div>
                            ))}
                            {/* Add one-off form */}
                            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginTop:8,paddingTop:10,borderTop:"1px solid "+T.border}}>
                              <input placeholder="Expense label (e.g. Holiday, Car service)" value={nLabel} onChange={e=>setNLabel(e.target.value)}
                                onKeyDown={e=>e.key==="Enter"&&addOneOff(row.id)}
                                style={{...inputS,flex:1,minWidth:180}} />
                              <input type="number" placeholder="Amount" value={nAmount} onChange={e=>setNAmount(e.target.value)}
                                onKeyDown={e=>e.key==="Enter"&&addOneOff(row.id)}
                                style={{...inputS,width:110}} />
                              <button onClick={()=>addOneOff(row.id)} style={{background:T.amber,border:"none",color:T.bg,borderRadius:6,padding:"8px 14px",cursor:"pointer",fontSize:12,fontFamily:"monospace",fontWeight:700}}>Add</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{background:T.surface,borderTop:"2px solid "+T.border}}>
                <td style={{padding:"12px 12px",color:T.text,fontWeight:700,fontFamily:"monospace",letterSpacing:1.2,textTransform:"uppercase",fontSize:10}}>Total</td>
                <td style={{padding:"12px",textAlign:"right",color:T.green,fontWeight:700}}>{fmt(summary.totalSurplus)}</td>
                <td style={{padding:"12px",textAlign:"right",color:summary.totalOneOffs>0?T.amber:T.muted,fontWeight:700}}>{summary.totalOneOffs>0?"-"+fmt(summary.totalOneOffs):"—"}</td>
                <td style={{padding:"12px",textAlign:"right",color:summary.finalBalance-openingBalance>=0?T.green:T.red,fontWeight:700}}>{fmt(summary.finalBalance-openingBalance)}</td>
                <td style={{padding:"12px",textAlign:"right",color:T.muted}}>{fmt(openingBalance)}</td>
                <td style={{padding:"12px",textAlign:"right",color:summary.finalBalance>=0?T.green:T.red,fontWeight:700,fontSize:14}}>{fmt(summary.finalBalance)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Visual balance chart */}
      <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:14,padding:"20px 22px",marginBottom:14}}>
        <Lbl color={T.green}>Closing Balance by Month</Lbl>
        <div style={{display:"flex",alignItems:"flex-end",gap:4,height:80,marginTop:12}}>
          {rows.map(row=>{
            const maxAbs=Math.max(...rows.map(r=>Math.abs(r.closingBal)),1);
            const h=Math.max(3,(Math.abs(row.closingBal)/maxAbs)*70);
            const col=row.closingBal<0?T.red:row.closingBal<monthlyExpenses*2?T.amber:T.green;
            return (
              <div key={row.id} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                <div style={{width:"100%",height:h,background:col+"88",border:"1px solid "+col+"55",borderRadius:"2px 2px 0 0"}} title={row.label+": "+fmt(row.closingBal)} />
                <div style={{fontSize:7,color:T.muted,fontFamily:"monospace",writingMode:"vertical-rl",transform:"rotate(180deg)",whiteSpace:"nowrap"}}>{row.label.split(" ")[0]}</div>
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",gap:14,marginTop:8,flexWrap:"wrap"}}>
          {[{l:"Positive",c:T.green},{l:"Watch",c:T.amber},{l:"Deficit",c:T.red}].map(x=>(
            <div key={x.l} style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:7,height:7,borderRadius:2,background:x.c}} />
              <span style={{fontSize:10,color:T.muted,fontFamily:"monospace"}}>{x.l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tips */}
      <div style={{background:T.amber+"12",border:"1px solid "+T.amber+"33",borderRadius:12,padding:"14px 18px",fontSize:11,color:T.muted,lineHeight:1.8}}>
        <span style={{color:T.amber,fontWeight:700}}>💡 Cashflow tip: </span>
        Click any month row to expand and add or edit one-off expenses. Click inline values to edit directly. The closing balance bar chart highlights months where your cash position needs attention.
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// HEALTH SCORE
// ══════════════════════════════════════════════════════════════════════════════
function HealthScore({ savingsRate, housingPct, totalExpenses, netIncome }) {
  const T=useTheme();
  const expRatio=netIncome>0?totalExpenses/netIncome:0;
  const cards=[
    {label:"Savings Rate",    val:savingsRate,  score:savingsRate>=30?"Strong":savingsRate>=20?"Moderate":"Weak",    color:savingsRate>=30?T.green:savingsRate>=20?T.amber:T.red,  bench:"Target: 25–35%",     detail:pct(savingsRate)+" of net income"},
    {label:"Housing Ratio",   val:housingPct,   score:housingPct<=28?"Healthy":housingPct<=38?"Elevated":"High",    color:housingPct<=28?T.green:housingPct<=38?T.amber:T.red,   bench:"Rule: <30% of net",  detail:pct(housingPct)+" of net income"},
    {label:"Expense Ratio",   val:expRatio*100, score:expRatio<=.60?"Lean":expRatio<=.80?"Moderate":"High Burn",    color:expRatio<=.60?T.green:expRatio<=.80?T.amber:T.red,     bench:"Target: <65% of net",detail:pct(expRatio*100)+" of income"},
  ];
  return (
    <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:14,padding:"20px 22px",marginBottom:14}}>
      <Lbl color={T.purple}>Financial Health Score</Lbl>
      <div className="fc-health" style={{marginTop:12}}>
        {cards.map(s=>(
          <div key={s.label} style={{background:T.surface,border:"1px solid "+s.color+"44",borderRadius:12,padding:16}}>
            <div style={{fontSize:10,color:T.muted,marginBottom:6,letterSpacing:1,textTransform:"uppercase"}}>{s.label}</div>
            <div style={{fontSize:22,color:s.color,fontFamily:"monospace",fontWeight:700,marginBottom:4}}>{s.score}</div>
            <div style={{fontSize:12,color:s.color,marginBottom:8}}>{s.detail}</div>
            <MiniBar value={Math.min(Math.abs(s.val),100)} max={100} color={s.color} />
            <div style={{fontSize:10,color:T.muted,lineHeight:1.6,marginTop:7}}>{s.bench}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// LANDING PAGE
// ══════════════════════════════════════════════════════════════════════════════
function LandingPage({ onGetStarted }) {
  const T=useTheme();
  const features=[
    {icon:"🌍",title:"Multi-Country Tax Engine",      desc:"Accurate net income for US, UK, Canada, Australia & Germany — 2024/25 tax rates."},
    {icon:"📅",title:"12-Month Cashflow Tracker",     desc:"Month-by-month cashflow with one-off expense tracking. See your cash floor before it hits."},
    {icon:"✨",title:"AI Finance Advisor",            desc:"Ask Claude AI anything about your finances. It answers using your actual numbers."},
    {icon:"💡",title:"Finance Glossary",             desc:"28 terms in plain English. Tap the lightbulb anytime — no jargon left unexplained."},
    {icon:"📋",title:"Tax Year Report",              desc:"One-page printable annual summary — gross, net, total tax paid, effective rate."},
    {icon:"☁️",title:"Cloud Sync",                   desc:"Sign in with Google, Apple, or Microsoft. Auto-saves and syncs across every device."},
    {icon:"📈",title:"30-Year Net Worth Projections", desc:"Configurable chart with hover tooltips, $1.9M target line, and detailed breakdowns."},
    {icon:"🎨",title:"13 Themes",                    desc:"Dark, light, city, and culture themes — Terminal, Tokyo, LA, London, NYC and more."},
    {icon:"🔐",title:"Private & Secure",              desc:"Row-level security means only you can ever see your financial data."},
    {icon:"📊",title:"Full Financial Dashboard",      desc:"Income, expenses, savings, projections and health analysis all in one unified view."},
  ];
  return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",display:"flex",flexDirection:"column"}}>
      <nav style={{padding:"16px clamp(20px,5vw,60px)",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid "+T.border,position:"sticky",top:0,background:T.bg+"ee",backdropFilter:"blur(10px)",zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:19,fontWeight:800,color:T.accent,letterSpacing:-0.5,fontFamily:"monospace"}}>FinCommand</span>
          {!IS_CONFIGURED&&<span style={{fontSize:10,color:T.amber,background:T.amber+"22",padding:"3px 8px",borderRadius:8,fontFamily:"monospace"}}>DEMO</span>}
        </div>
        <button onClick={onGetStarted} style={{background:"transparent",border:"1px solid "+T.accent+"66",color:T.accent,borderRadius:8,padding:"8px 20px",cursor:"pointer",fontSize:12,letterSpacing:1}}>Sign In</button>
      </nav>
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"clamp(48px,8vh,100px) clamp(20px,5vw,60px)",textAlign:"center",width:"100%",boxSizing:"border-box"}}>
        <div style={{fontSize:10,letterSpacing:4,color:T.accent,textTransform:"uppercase",marginBottom:22}}>Personal Finance OS</div>
        <h1 style={{fontSize:"clamp(30px,6vw,54px)",fontWeight:800,margin:"0 0 20px",letterSpacing:-1.5,lineHeight:1.1,color:T.text,maxWidth:660}}>
          Your money.<br /><span style={{color:T.accent}}>Completely clear.</span>
        </h1>
        <p style={{fontSize:"clamp(13px,1.5vw,16px)",color:T.muted,lineHeight:1.9,maxWidth:500,margin:"0 0 38px"}}>
          A professional-grade financial dashboard that speaks your country's tax language — with real cloud sync and multi-device access.
        </p>
        <div style={{display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center"}}>
          <button onClick={onGetStarted} style={{background:T.accent,border:"none",color:T.bg,borderRadius:12,padding:"14px 34px",cursor:"pointer",fontSize:14,fontWeight:700,letterSpacing:0.3}}>Get Started — Free</button>
          <button onClick={onGetStarted} style={{background:"transparent",border:"1px solid "+T.border,color:T.muted,borderRadius:12,padding:"14px 26px",cursor:"pointer",fontSize:14}}>Sign In</button>
        </div>
        <div style={{marginTop:22,fontSize:11,color:T.muted,letterSpacing:2,textTransform:"uppercase"}}>🇺🇸 US · 🇬🇧 UK · 🇨🇦 Canada · 🇦🇺 Australia · 🇩🇪 Germany</div>
      </div>
      <div style={{padding:"clamp(40px,6vh,80px) clamp(20px,5vw,60px)",width:"100%",maxWidth:1400,margin:"0 auto",boxSizing:"border-box"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:16}}>
          {features.map(f=>(
            <div key={f.title} style={{background:T.card,border:"1px solid "+T.border,borderRadius:14,padding:"22px 22px"}}>
              <div style={{fontSize:26,marginBottom:12}}>{f.icon}</div>
              <div style={{fontSize:14,fontWeight:700,color:T.text,marginBottom:9}}>{f.title}</div>
              <div style={{fontSize:12,color:T.muted,lineHeight:1.9}}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
      <footer style={{textAlign:"center",padding:"18px 20px",fontSize:10,color:T.border,borderTop:"1px solid "+T.border}}>
        For personal planning purposes only · Not financial advice · FinCommand 2026
      </footer>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH PAGE — real sign-up/sign-in/google/password reset
// ══════════════════════════════════════════════════════════════════════════════
function AuthPage({ onBack, onAuthSuccess }) {
  const T=useTheme();
  const [mode,setMode]=useState("signin"); // signin | signup | reset
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [showPass,setShowPass]=useState(false);

  const inputS={background:T.faint,border:"1px solid "+T.border,borderRadius:8,padding:"12px 14px",color:T.text,fontFamily:"inherit",fontSize:14,outline:"none",width:"100%",boxSizing:"border-box",transition:"border-color 0.15s"};
  const focusS={...inputS,border:"1px solid "+T.accent+"66"};

  const handleEmail=async()=>{
    if(!email.trim()||(!password.trim()&&mode!=="reset"))return;
    setLoading(true);setError("");setMessage("");
    try {
      if(mode==="reset") {
        const{error:e,message:m}=await db.resetPassword(email.trim());
        if(e) throw new Error(e);
        setMessage("Password reset email sent. Check your inbox.");
        setLoading(false); return;
      }
      const fn = mode==="signup"?db.signUpEmail:db.signInEmail;
      const{user,error:e}=await fn(email.trim(),password);
      if(e) throw new Error(typeof e==="string"?e:e?.message||"Authentication failed.");
      if(mode==="signup"&&IS_CONFIGURED&&!user?.confirmed_at&&!user?.email_confirmed_at){
        setMessage("Account created! Check your email to confirm, then sign in.");
        setLoading(false); return;
      }
      await onAuthSuccess();
    } catch(e){ setError(e?.message||"Authentication failed."); }
    finally { setLoading(false); }
  };

  const handleGoogle=async()=>{
    setLoading(true);setError("");
    const{error:e}=await db.signInGoogle();
    if(e){ setError(typeof e==="string"?e:e?.message||"Google sign-in failed."); setLoading(false); return; }
    if(!IS_CONFIGURED) await onAuthSuccess();
    setLoading(false);
  };
  const handleApple=async()=>{
    setLoading(true);setError("");
    if(!IS_CONFIGURED){ await onAuthSuccess(); setLoading(false); return; }
    try{ const sb=await getSb(); const{error:e}=await sb.auth.signInWithOAuth({provider:"apple",options:{redirectTo:window.location.origin}}); if(e)throw e; }
    catch(e){ setError(e?.message||"Apple sign-in failed."); setLoading(false); }
  };
  const handleAzure=async()=>{
    setLoading(true);setError("");
    if(!IS_CONFIGURED){ await onAuthSuccess(); setLoading(false); return; }
    try{ const sb=await getSb(); const{error:e}=await sb.auth.signInWithOAuth({provider:"azure",options:{redirectTo:window.location.origin,scopes:"email profile openid"}}); if(e)throw e; }
    catch(e){ setError(e?.message||"Microsoft sign-in failed."); setLoading(false); }
  };

  const canSubmit = email.trim()&&(mode==="reset"||password.trim())&&!loading;

  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"20px",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"}}>
      <button onClick={onBack} style={{position:"fixed",top:20,left:20,background:T.faint,border:"1px solid "+T.border,color:T.muted,cursor:"pointer",fontSize:12,fontFamily:"monospace",letterSpacing:1,borderRadius:8,padding:"7px 12px",display:"flex",alignItems:"center",gap:6}}>
        ← Back
      </button>
      <div style={{width:"100%",maxWidth:420}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:24,fontWeight:800,color:T.accent,marginBottom:6,letterSpacing:-0.5}}>FinCommand</div>
          <div style={{fontSize:13,color:T.muted}}>
            {mode==="signup"?"Create your account":mode==="reset"?"Reset your password":"Welcome back"}
          </div>
          {!IS_CONFIGURED&&<div style={{marginTop:10,fontSize:11,color:T.amber,background:T.amber+"18",padding:"6px 14px",borderRadius:8,fontFamily:"monospace",display:"inline-block"}}>Demo mode — any email works</div>}
        </div>

        <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:16,padding:"28px"}}>
          {/* Social OAuth */}
          {mode!=="reset"&&(
            <>
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
                <button onClick={handleGoogle} disabled={loading}
                  style={{width:"100%",background:T.surface,border:"1px solid "+T.border,color:T.text,borderRadius:10,padding:"12px",cursor:loading?"not-allowed":"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:10,transition:"background 0.15s",opacity:loading?0.7:1}}>
                  {loading?<Spinner />:<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>}
                  <span>Continue with Google</span>
                </button>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <button onClick={handleApple} disabled={loading}
                    style={{background:T.surface,border:"1px solid "+T.border,color:T.text,borderRadius:10,padding:"11px",cursor:loading?"not-allowed":"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:loading?0.7:1}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill={T.text}><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                    Apple
                  </button>
                  <button onClick={handleAzure} disabled={loading}
                    style={{background:T.surface,border:"1px solid "+T.border,color:T.text,borderRadius:10,padding:"11px",cursor:loading?"not-allowed":"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:loading?0.7:1}}>
                    <svg width="16" height="16" viewBox="0 0 23 23"><path fill="#f3f3f3" d="M0 0h11v11H0z"/><path fill="#f35325" d="M12 0h11v11H12z"/><path fill="#05a6f0" d="M0 12h11v11H0z"/><path fill="#ffba08" d="M12 12h11v11H12z"/></svg>
                    Microsoft
                  </button>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
                <div style={{flex:1,height:1,background:T.border}} />
                <span style={{fontSize:11,color:T.muted,letterSpacing:2,textTransform:"uppercase"}}>or</span>
                <div style={{flex:1,height:1,background:T.border}} />
              </div>
            </>
          )}

          <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
            <input placeholder="Email address" type="email" value={email} onChange={e=>setEmail(e.target.value)} style={inputS}
              onKeyDown={e=>e.key==="Enter"&&canSubmit&&handleEmail()} />
            {mode!=="reset"&&(
              <div style={{position:"relative"}}>
                <input placeholder="Password (min 8 chars)" type={showPass?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} style={{...inputS,paddingRight:44}}
                  onKeyDown={e=>e.key==="Enter"&&canSubmit&&handleEmail()} />
                <button onClick={()=>setShowPass(p=>!p)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:13}}>
                  {showPass?"🙈":"👁"}
                </button>
              </div>
            )}
          </div>

          {error  &&<div style={{background:T.red+"18",border:"1px solid "+T.red+"44",borderRadius:8,padding:"10px 14px",fontSize:12,color:T.red,marginBottom:14,lineHeight:1.6}}>{error}</div>}
          {message&&<div style={{background:T.green+"18",border:"1px solid "+T.green+"44",borderRadius:8,padding:"10px 14px",fontSize:12,color:T.green,marginBottom:14,lineHeight:1.6}}>{message}</div>}

          <button onClick={handleEmail} disabled={!canSubmit}
            style={{width:"100%",background:T.accent,border:"none",color:T.bg,borderRadius:10,padding:"14px",cursor:canSubmit?"pointer":"not-allowed",fontSize:14,fontWeight:700,opacity:!canSubmit?0.55:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"opacity 0.2s"}}>
            {loading&&<Spinner />}
            {loading?"…":mode==="signup"?"Create Account":mode==="reset"?"Send Reset Email":"Sign In"}
          </button>

          <div style={{marginTop:16,display:"flex",flexDirection:"column",gap:8,alignItems:"center"}}>
            {mode==="signin"&&(
              <>
                <button onClick={()=>{setMode("signup");setError("");setMessage("");}} style={{background:"transparent",border:"none",color:T.blue,cursor:"pointer",fontSize:12,textDecoration:"underline"}}>
                  No account? Create one free
                </button>
                <button onClick={()=>{setMode("reset");setError("");setMessage("");}} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:11,textDecoration:"underline"}}>
                  Forgot password?
                </button>
              </>
            )}
            {mode==="signup"&&(
              <button onClick={()=>{setMode("signin");setError("");setMessage("");}} style={{background:"transparent",border:"none",color:T.blue,cursor:"pointer",fontSize:12,textDecoration:"underline"}}>
                Already have an account? Sign in
              </button>
            )}
            {mode==="reset"&&(
              <button onClick={()=>{setMode("signin");setError("");setMessage("");}} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:11,textDecoration:"underline"}}>
                Back to sign in
              </button>
            )}
          </div>
        </div>
        {IS_CONFIGURED&&(
          <div style={{textAlign:"center",marginTop:14,fontSize:11,color:T.muted,lineHeight:1.7}}>
            Your data is encrypted and stored securely.<br/>We never share your information.
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ONBOARDING
// ══════════════════════════════════════════════════════════════════════════════
function OnboardingPage({ user, onComplete }) {
  const T=useTheme();
  const [step,setStep]=useState(0);
  const [country,setCountry]=useState("US");
  const [name,setName]=useState(user?.user_metadata?.full_name?.split(" ")[0]||"");
  const [gross,setGross]=useState(80000);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const cfg=TAX_CONFIGS[country];
  const {netSalary,effectiveRate}=useMemo(()=>calcTax(country,gross,0),[country,gross]);

  const handleComplete=async()=>{
    setSaving(true);setError("");
    const profile={country,name:name.trim(),grossSalary:gross,currency:cfg.currency};
    const dashboard={inclBonus:false,annualBonus:0,customIncome:[],fixedItems:DEFAULT_FIXED(),varItems:DEFAULT_VAR(),savBuckets:DEFAULT_SAV(),usdBalance:5000,projInterval:"1y",cashflow:DEFAULT_CASHFLOW(),inclRental:false};
    const{error:e}=await db.saveUserData(user.id,{profile,dashboard});
    if(e){setError("Could not save. Please try again.");setSaving(false);return;}
    onComplete(profile,dashboard);
  };

  const steps=["Country","Your Name","Income"];
  const inputS={background:T.faint,border:"1px solid "+T.border,borderRadius:8,padding:"12px 14px",color:T.text,fontFamily:"inherit",fontSize:14,outline:"none",width:"100%",boxSizing:"border-box"};

  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"20px",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"}}>
      <div style={{width:"100%",maxWidth:520}}>
        {/* Steps */}
        <div style={{display:"flex",gap:6,marginBottom:28,justifyContent:"center",flexWrap:"wrap"}}>
          {steps.map((s,i)=>(
            <div key={s} style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:26,height:26,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:i<step?T.green:i===step?T.accent:T.faint,border:"1px solid "+(i<=step?T.accent:T.border),fontSize:11,color:i<=step?T.bg:T.muted,fontWeight:700,flexShrink:0}}>
                {i<step?"✓":i+1}
              </div>
              <span style={{fontSize:10,color:i===step?T.text:T.muted,letterSpacing:1.5,textTransform:"uppercase"}}>{s}</span>
              {i<steps.length-1&&<div style={{width:20,height:1,background:T.border,marginLeft:4}} />}
            </div>
          ))}
        </div>

        <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:16,padding:"32px"}}>
          {error&&<div style={{background:T.red+"18",border:"1px solid "+T.red+"44",borderRadius:8,padding:"10px 12px",fontSize:11,color:T.red,marginBottom:16}}>{error}</div>}

          {step===0&&(
            <div>
              <Lbl color={T.accent}>Step 1 of 3</Lbl>
              <h2 style={{margin:"0 0 6px",fontSize:20,color:T.text,fontWeight:700}}>Where are you based?</h2>
              <p style={{margin:"0 0 22px",fontSize:12,color:T.muted,lineHeight:1.7}}>Determines tax calculations, currency, and financial benchmarks throughout your dashboard.</p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {Object.entries(TAX_CONFIGS).map(([code,c])=>(
                  <div key={code} onClick={()=>setCountry(code)}
                    style={{background:country===code?T.accent+"18":T.surface,border:"1px solid "+(country===code?T.accent+"66":T.border),borderRadius:10,padding:"14px 16px",cursor:"pointer",transition:"all 0.15s"}}>
                    <div style={{fontSize:22,marginBottom:5}}>{c.flag}</div>
                    <div style={{fontSize:12,fontWeight:700,color:T.text}}>{c.name}</div>
                    <div style={{fontSize:11,color:T.muted,marginTop:2}}>{c.currency} · {c.symbol}</div>
                  </div>
                ))}
              </div>
              <button onClick={()=>setStep(1)} style={{marginTop:20,width:"100%",background:T.accent,border:"none",color:T.bg,borderRadius:10,padding:"13px",cursor:"pointer",fontSize:14,fontWeight:700}}>Continue →</button>
            </div>
          )}

          {step===1&&(
            <div>
              <Lbl color={T.accent}>Step 2 of 3</Lbl>
              <h2 style={{margin:"0 0 6px",fontSize:20,color:T.text,fontWeight:700}}>What should we call you?</h2>
              <p style={{margin:"0 0 22px",fontSize:12,color:T.muted,lineHeight:1.7}}>First name only is fine.</p>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your first name" onKeyDown={e=>e.key==="Enter"&&name.trim()&&setStep(2)} style={inputS} autoFocus />
              <div style={{display:"flex",gap:10,marginTop:20}}>
                <button onClick={()=>setStep(0)} style={{flex:1,background:T.faint,border:"1px solid "+T.border,color:T.muted,borderRadius:10,padding:"13px",cursor:"pointer",fontSize:13}}>← Back</button>
                <button onClick={()=>setStep(2)} disabled={!name.trim()} style={{flex:2,background:T.accent,border:"none",color:T.bg,borderRadius:10,padding:"13px",cursor:"pointer",fontSize:14,fontWeight:700,opacity:!name.trim()?0.5:1}}>Continue →</button>
              </div>
            </div>
          )}

          {step===2&&(
            <div>
              <Lbl color={T.accent}>Step 3 of 3</Lbl>
              <h2 style={{margin:"0 0 6px",fontSize:20,color:T.text,fontWeight:700}}>Your gross annual salary</h2>
              <p style={{margin:"0 0 22px",fontSize:12,color:T.muted,lineHeight:1.7}}>We'll calculate net take-home using {cfg.flag} {cfg.name} tax rules.</p>
              <SliderRow label="Gross Annual Salary" value={gross} min={20000} max={500000} step={5000} onChange={setGross} format={v=>cfg.symbol+(v/1000).toFixed(0)+"k"} color={T.accent} />
              <div style={{background:T.surface,borderRadius:10,padding:"14px 16px",marginTop:6}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,color:T.muted}}>Estimated net/mo</span><span style={{fontSize:16,color:T.green,fontFamily:"monospace",fontWeight:700}}>{cfg.symbol}{netSalary.toLocaleString()}</span></div>
                <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,color:T.muted}}>Effective tax rate</span><span style={{fontSize:12,color:T.amber,fontFamily:"monospace"}}>{effectiveRate}%</span></div>
                <div style={{fontSize:11,color:T.muted,marginTop:8,lineHeight:1.6}}>{cfg.taxYearNote}</div>
              </div>
              <div style={{display:"flex",gap:10,marginTop:20}}>
                <button onClick={()=>setStep(1)} style={{flex:1,background:T.faint,border:"1px solid "+T.border,color:T.muted,borderRadius:10,padding:"13px",cursor:"pointer",fontSize:13}}>← Back</button>
                <button onClick={handleComplete} disabled={saving} style={{flex:2,background:T.accent,border:"none",color:T.bg,borderRadius:10,padding:"13px",cursor:"pointer",fontSize:14,fontWeight:700,opacity:saving?0.6:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                  {saving&&<Spinner />}{saving?"Setting up…":"Launch Dashboard →"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// INCOME TABLE — with inline edit
// ══════════════════════════════════════════════════════════════════════════════
function IncomeTable({ items, setCustomIncome, inclBonus, setInclBonus, totalIncome, fmt }) {
  const T=useTheme();
  const [adding,setAdding]=useState(false);
  const [nName,setNName]=useState(""); const [nAmt,setNAmt]=useState(""); const [nType,setNType]=useState("other");
  const inputS={background:T.faint,border:"1px solid "+T.border,borderRadius:6,padding:"7px 10px",color:T.text,fontFamily:"monospace",fontSize:14,outline:"none"};

  const active=items.filter(i=>!i.excluded); const actTotal=active.reduce((s,i)=>s+i.amount,0);

  const add=()=>{
    const a=parseFloat(nAmt);
    if(!nName.trim()||isNaN(a)||a<=0)return;
    setCustomIncome(p=>[...p,{id:uid(),name:nName.trim(),amount:a,type:nType,excluded:false,color:T.purple}]);
    setNName("");setNAmt("");setAdding(false);
  };

  return (
    <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:14,overflow:"hidden",marginBottom:14}}>
      <div style={{background:T.green+"14",borderBottom:"1px solid "+T.border,padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}><span>💰</span><span style={{fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:T.text,fontFamily:"monospace"}}>Income Sources</span></div>
        <div style={{display:"flex",gap:12,alignItems:"center"}}>
          <span style={{fontSize:18,fontFamily:"monospace",fontWeight:700,color:T.green}}>{fmt(totalIncome)}</span>
          <button onClick={()=>setAdding(o=>!o)} style={{background:adding?T.green+"22":T.faint,border:"1px solid "+(adding?T.green:T.border),color:adding?T.green:T.muted,borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:11,fontFamily:"monospace"}}>+ Add</button>
        </div>
      </div>
      <div style={{padding:"10px 18px 6px"}}>
        {items.map(item=>{
          const c=item.color||T.green;
          const excl=item.id==="bon"?!inclBonus:item.excluded;
          const share=actTotal>0&&!excl?(item.amount/actTotal)*100:0;
          return (
            <div key={item.id} style={{marginBottom:13,opacity:excl?0.35:1,transition:"opacity 0.2s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5,gap:6,flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:7,flex:1,minWidth:0}}>
                  <div style={{width:8,height:8,borderRadius:2,background:c,flexShrink:0}} />
                  {item.auto
                    ?<span style={{fontSize:12,color:T.text,fontFamily:"monospace",textDecoration:excl?"line-through":"none"}}>{item.name}</span>
                    :<InlineEdit value={item.name} onCommit={v=>setCustomIncome(p=>p.map(i=>i.id===item.id?{...i,name:v}:i))}
                        style={{fontSize:12,color:T.text,fontFamily:"monospace",textDecoration:excl?"line-through":"none"}} />}
                  <Pill label={item.type||"other"} color={c} />
                  {item.auto&&<Pill label="auto" color={T.muted} />}
                  {excl&&<Pill label="off" color={T.muted} />}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:7,flexShrink:0}}>
                  {!excl&&<span style={{fontSize:10,color:T.muted,fontFamily:"monospace"}}>{pct(share)}</span>}
                  {item.auto
                    ?<span style={{fontSize:13,color:excl?T.muted:c,fontFamily:"monospace",fontWeight:700,minWidth:60,textAlign:"right"}}>{fmt(item.amount)}</span>
                    :<InlineEdit value={item.amount} type="number" onCommit={v=>setCustomIncome(p=>p.map(i=>i.id===item.id?{...i,amount:v}:i))}
                        style={{fontSize:13,color:c,fontFamily:"monospace",fontWeight:700,textAlign:"right",maxWidth:90}} />}
                  {item.id==="bon"&&<button onClick={()=>setInclBonus(!inclBonus)} style={{background:"transparent",border:"1px solid "+T.border,color:T.muted,cursor:"pointer",fontSize:10,padding:"3px 7px",borderRadius:4,fontFamily:"monospace"}}>{inclBonus?"off":"on"}</button>}
                  {item.id==="sal"&&<span style={{fontSize:10,color:T.muted,padding:"2px 6px",border:"1px solid "+T.border,borderRadius:4,fontFamily:"monospace"}}>slider ↑</span>}
                  {!item.auto&&<>
                    <button onClick={()=>setCustomIncome(p=>p.map(i=>i.id===item.id?{...i,excluded:!i.excluded}:i))} style={{background:"transparent",border:"1px solid "+T.border,color:T.muted,cursor:"pointer",fontSize:10,padding:"3px 7px",borderRadius:4,fontFamily:"monospace"}}>{item.excluded?"on":"off"}</button>
                    <button onClick={()=>setCustomIncome(p=>p.filter(i=>i.id!==item.id))} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:18,padding:"0 2px",lineHeight:1}}>×</button>
                  </>}
                </div>
              </div>
              {!excl&&!item.auto&&(
                <div style={{position:"relative",height:4,background:T.faint,borderRadius:2}}>
                  <div style={{position:"absolute",left:0,top:0,height:"100%",width:Math.min(100,(item.amount/20000)*100)+"%",background:c+"88",borderRadius:2}} />
                  <input type="range" min={0} max={20000} step={50} value={item.amount} onChange={e=>setCustomIncome(p=>p.map(i=>i.id===item.id?{...i,amount:Number(e.target.value)}:i))}
                    style={{position:"absolute",top:"50%",transform:"translateY(-50%)",width:"100%",opacity:0,cursor:"pointer",height:20,margin:0}} />
                </div>
              )}
              {!excl&&item.auto&&<MiniBar value={item.amount} max={actTotal||1} color={c+"44"} />}
              {item.sub&&<div style={{fontSize:10,color:T.muted,fontFamily:"monospace",marginTop:3,paddingLeft:16}}>{item.sub}</div>}
            </div>
          );
        })}
      </div>
      {adding&&(
        <div style={{padding:"12px 18px",borderTop:"1px solid "+T.border,display:"flex",gap:8,flexWrap:"wrap",background:T.surface,alignItems:"center"}}>
          <input placeholder="Source name" value={nName} onChange={e=>setNName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} style={{...inputS,flex:1,minWidth:100}} />
          <select value={nType} onChange={e=>setNType(e.target.value)} style={{...inputS,background:T.faint}}>{INCOME_TYPES.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
          <input type="number" placeholder="Amount /mo" value={nAmt} onChange={e=>setNAmt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} style={{...inputS,width:120}} />
          <button onClick={add} style={{background:T.green,border:"none",color:T.bg,borderRadius:6,padding:"8px 14px",cursor:"pointer",fontSize:12,fontFamily:"monospace",fontWeight:700}}>Add</button>
          <button onClick={()=>setAdding(false)} style={{background:T.faint,border:"none",color:T.muted,borderRadius:6,padding:"8px 10px",cursor:"pointer",fontSize:12,fontFamily:"monospace"}}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
function Dashboard({ user, profile, initialData, onSignOut, themeId, onThemeChange }) {
  const T=useTheme();
  const country=profile?.country||"US";
  const cfg=TAX_CONFIGS[country]||TAX_CONFIGS.US;
  const {fmt,fmtK}=useMemo(()=>buildFmt(cfg.symbol),[cfg.symbol]);

  // ── v7 overlay states ────────────────────────────────────────────────────
  const [showGlossary,  setShowGlossary ]=useState(false);
  const [showAI,        setShowAI       ]=useState(false);
  const [showTaxReport, setShowTaxReport]=useState(false);

  const [tab,         setTab]        =useState("overview");
  const [inclBonus,   setInclBonus]  =useState(initialData?.inclBonus??false);
  const [grossSalary, setGrossSalary]=useState(profile?.grossSalary||80000);
  const [annualBonus, setAnnualBonus]=useState(initialData?.annualBonus||0);
  const [customIncome,setCustomIncome]=useState(initialData?.customIncome||[]);
  const [fixedItems,  setFixedItems] =useState(()=>initialData?.fixedItems||DEFAULT_FIXED());
  const [varItems,    setVarItems]   =useState(()=>initialData?.varItems  ||DEFAULT_VAR());
  const [savBuckets,  setSavBuckets] =useState(()=>initialData?.savBuckets||DEFAULT_SAV());
  const [usdBalance,  setUsdBalance] =useState(initialData?.usdBalance||5000);
  const [projInterval,setProjInterval]=useState(initialData?.projInterval||"1y");
  const [cashflow,    setCashflow]   =useState(()=>initialData?.cashflow||DEFAULT_CASHFLOW());
  const [saveStatus,  setSaveStatus] =useState("idle");
  const saveTimer=useRef(null); const pendingSave=useRef(null);

  const {netSalary,netBonus,effectiveRate}=useMemo(()=>calcTax(country,grossSalary,annualBonus),[country,grossSalary,annualBonus]);

  const STATUS_CFG=useMemo(()=>({
    idle:  {label:"",               color:T.muted},
    saving:{label:"● saving…",     color:T.muted},
    saved: {label:"✓ saved",       color:T.green},
    error: {label:"⚠ save failed", color:T.amber},
  }),[T.muted,T.green,T.amber]);

  useEffect(()=>{
    const h=()=>{ if(pendingSave.current) db.saveUserData(user.id,pendingSave.current); };
    window.addEventListener("beforeunload",h);
    return ()=>window.removeEventListener("beforeunload",h);
  },[user.id]);

  const getSnapshot=useCallback(()=>({
    profile:{...profile,grossSalary},
    dashboard:{inclBonus,annualBonus,customIncome,fixedItems,varItems,savBuckets,usdBalance,projInterval,cashflow},
  }),[profile,grossSalary,inclBonus,annualBonus,customIncome,fixedItems,varItems,savBuckets,usdBalance,projInterval,cashflow]);

  useEffect(()=>{
    setSaveStatus("saving");
    if(saveTimer.current)clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(async()=>{
      const snap=getSnapshot(); pendingSave.current=snap;
      const{error}=await db.saveUserData(user.id,snap);
      pendingSave.current=null;
      setSaveStatus(error?"error":"saved");
      setTimeout(()=>setSaveStatus("idle"),2000);
    },900);
    return ()=>{ if(saveTimer.current)clearTimeout(saveTimer.current); };
  },[getSnapshot,user.id]);

  const derived=useMemo(()=>{
    const bonus  =inclBonus?netBonus:0;
    const extra  =sum(customIncome,"amount");
    const income =netSalary+bonus+extra;
    const fixed  =sum(fixedItems,"amount");
    const variable=sum(varItems,"amount");
    const savings=sum(savBuckets,"amount");
    const expenses=fixed+variable;
    const rem    =income-expenses-savings;
    const sRate  =income>0?(savings/income)*100:0;
    const rentAmt=(fixedItems.find(i=>/rent|mortgage/i.test(i.name))?.amount)||0;
    const housing=income>0?(rentAmt/income)*100:0;
    return {bonus,extra,income,fixed,variable,savings,expenses,rem,sRate,rentAmt,housing};
  },[inclBonus,netBonus,netSalary,customIncome,fixedItems,varItems,savBuckets]);

  const {bonus,extra,income,fixed,variable,savings,expenses,rem,sRate,rentAmt,housing}=derived;

  const runway=useMemo(()=>{
    const months=expenses>0?usdBalance/expenses:0;
    const target=expenses*6; const pctV=target>0?Math.min(100,(usdBalance/target)*100):0;
    const color=months>=6?T.green:months>=3?T.amber:T.red;
    const verdict=months>=6?"✓ Solid":months>=3?"~ Building":"⚠ Thin";
    const toTgt=rem>0?Math.max(0,(target-usdBalance)/rem):null;
    return {months,target,pct:pctV,color,verdict,toTarget:toTgt};
  },[expenses,usdBalance,rem,T.green,T.amber,T.red]);

  const incomeItems=useMemo(()=>[
    {id:"sal",name:"Base Salary (net/mo)",     amount:netSalary,color:T.green,type:"salary",auto:true,excluded:false,sub:cfg.symbol+(grossSalary/1000).toFixed(0)+"k gross · ~"+effectiveRate+"% tax"},
    {id:"bon",name:"Annual Bonus (net avg/mo)",amount:netBonus, color:T.amber,type:"bonus", auto:true,excluded:!inclBonus,sub:cfg.symbol+(annualBonus/1000).toFixed(0)+"k gross annual"},
    ...customIncome,
  ],[netSalary,netBonus,grossSalary,annualBonus,effectiveRate,inclBonus,customIncome,cfg.symbol,T.green,T.amber]);

  const si=STATUS_CFG[saveStatus]||STATUS_CFG.idle;
  const cardS={background:T.card,border:"1px solid "+T.border,borderRadius:12,overflow:"hidden",marginBottom:14};

  return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",padding:"clamp(14px,2.5vw,28px) clamp(14px,3.5vw,44px)"}}>
      <div style={{maxWidth:1400,margin:"0 auto"}}>

        {/* ── HEADER ── */}
        <div style={{marginBottom:18,display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{fontSize:10,letterSpacing:3,color:T.accent,textTransform:"uppercase",marginBottom:5,fontFamily:"monospace"}}>{cfg.flag} {cfg.name} · FinCommand</div>
            <h1 style={{margin:0,fontSize:"clamp(18px,2.8vw,26px)",fontWeight:800,color:T.text,letterSpacing:-0.5,lineHeight:1.1}}>{profile?.name?profile.name+"'s ":""}Financial Dashboard</h1>
            <p style={{margin:"5px 0 0",fontSize:11,color:T.muted}}>{cfg.currency} · {cfg.taxYearNote}</p>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:7}}>
            <div style={{fontSize:10,letterSpacing:1.5,color:si.color,minHeight:13,transition:"color 0.3s",fontFamily:"monospace"}}>{si.label}</div>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}}>
              {/* Tax Year Report */}
              <button onClick={()=>setShowTaxReport(true)} title="Tax Year Summary" style={{background:T.faint,border:"1px solid "+T.border,color:T.amber,borderRadius:8,padding:"5px 11px",cursor:"pointer",fontSize:11,fontFamily:"monospace",display:"flex",alignItems:"center",gap:5,letterSpacing:0.5}}>
                📋 <span>Tax Report</span>
              </button>
              {/* Glossary */}
              <button onClick={()=>setShowGlossary(true)} title="Finance Glossary" style={{background:T.faint,border:"1px solid "+T.border,color:T.muted,borderRadius:8,padding:"5px 9px",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",width:32,height:32}} aria-label="Glossary">
                💡
              </button>
              {/* AI Advisor */}
              <button onClick={()=>setShowAI(true)} title="AI Finance Advisor" style={{background:"linear-gradient(135deg,"+T.accent+"22,"+T.purple+"18)",border:"1px solid "+T.accent+"44",color:T.accent,borderRadius:8,padding:"5px 11px",cursor:"pointer",fontSize:11,fontFamily:"monospace",display:"flex",alignItems:"center",gap:5,fontWeight:700}}>
                ✨ <span>Ask AI</span>
              </button>
              <ThemePicker current={themeId} onChange={onThemeChange} />
              <span style={{fontSize:11,color:T.muted,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user?.email}</span>
              <button onClick={onSignOut} style={{background:"transparent",border:"1px solid "+T.border+"66",color:T.muted,borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:11}}>Sign Out</button>
              <div>
                <div style={{fontSize:10,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:2,textAlign:"right"}}>Net Income</div>
                <div style={{fontSize:"clamp(20px,2.5vw,28px)",fontFamily:"monospace",fontWeight:700,color:T.green}}>{fmt(income)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── INCOME CONTROLS ── */}
        <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:16,padding:"clamp(14px,2vw,22px) clamp(14px,2.5vw,26px)",marginBottom:14}}>
          <Lbl>Income Controls</Lbl>
          <div className="fc-grid-2" style={{marginBottom:14,marginTop:10}}>
            <SliderRow label="Gross Annual Salary" value={grossSalary} min={20000} max={500000} step={5000} onChange={setGrossSalary} format={v=>cfg.symbol+(v/1000).toFixed(0)+"k"} color={T.green} sublabel={"Net ≈ "+fmt(netSalary)+"/mo"} />
            <SliderRow label="Annual Bonus"        value={annualBonus} min={0}     max={300000} step={5000} onChange={setAnnualBonus} format={v=>cfg.symbol+(v/1000).toFixed(0)+"k"} color={T.amber} sublabel={"Net ≈ "+fmt(netBonus)+"/mo avg"} />
          </div>
          <Toggle checked={inclBonus} onChange={setInclBonus} color={T.amber} label="Include Bonus Income" sublabel={inclBonus?"+"+fmt(netBonus)+"/mo added to income":"Bonus excluded from calculations"} />
          <div style={{display:"flex",gap:16,flexWrap:"wrap",padding:"12px 14px",background:T.surface,borderRadius:10,marginTop:14}}>
            {[
              {l:"Net Salary",    v:fmt(netSalary),                       c:T.green},
              {l:"Bonus /mo",     v:inclBonus?fmt(netBonus):"—",           c:inclBonus?T.amber:T.muted},
              {l:"Extra",         v:extra>0?fmt(extra):"—",                c:extra>0?T.purple:T.muted},
              {l:"Total Income",  v:fmt(income),                           c:T.text},
              {l:"Effective Tax", v:effectiveRate+"%",                     c:T.amber},
              {l:"Remainder",     v:(rem>=0?"+":"")+fmt(rem),              c:rem>=0?T.green:T.red},
            ].map(s=>(
              <div key={s.l}>
                <div style={{fontSize:10,color:T.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:3}}>{s.l}</div>
                <div style={{fontSize:14,color:s.c,fontWeight:700,fontFamily:"monospace"}}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── TAX BANNER ── */}
        <div style={{background:T.amber+"12",border:"1px solid "+T.amber+"2a",borderRadius:12,padding:"12px 18px",fontSize:11,color:T.muted,lineHeight:1.8,marginBottom:14}}>
          <span style={{color:T.amber,fontWeight:700}}>{cfg.flag} Tax Note: </span>{cfg.rentalNotes} {cfg.taxYearNote}
        </div>

        {/* ── TABS ── */}
        <div style={{display:"flex",gap:2,marginBottom:18,background:T.card,padding:4,borderRadius:12,border:"1px solid "+T.border,overflowX:"auto",WebkitOverflowScrolling:"touch",scrollbarWidth:"none",msOverflowStyle:"none"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{flex:"1 0 auto",padding:"8px 10px",borderRadius:9,border:"none",background:tab===t.id?T.accent:"transparent",color:tab===t.id?T.bg:T.muted,cursor:"pointer",fontSize:11,letterSpacing:1,textTransform:"uppercase",fontWeight:tab===t.id?700:500,transition:"all 0.15s",whiteSpace:"nowrap",minWidth:70}}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ══ OVERVIEW ══ */}
        {tab==="overview"&&(<>
          <div className="fc-grid-5" style={{marginBottom:14}}>
            <StatCard label="Total Expenses"  value={fmt(expenses)} color={T.red}                      sub={pct(income>0?(expenses/income)*100:0)+" of income"} />
            <StatCard label="Total Savings"   value={fmt(savings)}  color={T.green}                    sub={pct(sRate)+" savings rate"} />
            <StatCard label="Effective Tax"   value={effectiveRate+"%"} color={T.amber}                sub={"~"+fmt(netSalary*12)+" net/yr"} />
            <StatCard label="Monthly Surplus" value={(rem>=0?"+":"")+fmt(rem)} color={rem>=0?T.green:T.red} bg={rem>=0?T.green+"14":T.red+"0f"} sub="After all goals" />
            <StatCard label="Cash Runway"     value={runway.months.toFixed(1)+" mo"} color={runway.color} bg={runway.color+"14"} sub={fmt(usdBalance)+" liquid · "+runway.verdict} />
          </div>

          {/* Runway card */}
          <div style={{background:T.card,border:"1px solid "+runway.color+"44",borderRadius:14,padding:"16px 20px",marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12,flexWrap:"wrap",gap:10}}>
              <div>
                <Lbl color={runway.color}>Cash Runway — Liquid Balance</Lbl>
                <div style={{fontSize:11,color:T.muted,marginTop:2}}>{fmt(expenses)}/mo burn · 6-month target = {fmt(runway.target)}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:11,color:T.muted,letterSpacing:1.5,textTransform:"uppercase"}}>Balance</span>
                <input type="number" value={usdBalance} onChange={e=>setUsdBalance(Math.max(0,Number(e.target.value)))}
                  style={{background:T.faint,border:"1px solid "+runway.color+"55",borderRadius:8,padding:"6px 12px",color:runway.color,fontFamily:"monospace",fontSize:15,fontWeight:700,outline:"none",width:130,textAlign:"right"}} />
              </div>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5,fontSize:10,color:T.muted,letterSpacing:1}}>
                <span>0</span><span style={{color:T.amber}}>3 mo — {fmt(expenses*3)}</span><span style={{color:T.green}}>6 mo — {fmt(runway.target)}</span>
              </div>
              <div style={{position:"relative",height:10,background:T.faint,borderRadius:5}}>
                <div style={{position:"absolute",left:"50%",top:0,width:1,height:"100%",background:T.amber+"55"}} />
                <div style={{position:"absolute",left:0,top:0,height:"100%",width:runway.pct+"%",background:"linear-gradient(90deg,"+runway.color+"88,"+runway.color+")",borderRadius:5,transition:"width 0.3s"}} />
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:5,fontSize:11}}>
                <span style={{color:runway.color,fontWeight:700}}>{runway.months.toFixed(1)} mo · {pct(runway.pct)} of target</span>
                {usdBalance<runway.target&&runway.toTarget!==null&&<span style={{color:T.muted}}>~{runway.toTarget.toFixed(1)} mo to target</span>}
                {usdBalance>=runway.target&&<span style={{color:T.green}}>✓ Fully funded</span>}
              </div>
            </div>
            <div className="fc-runway4">
              {[
                {l:"Balance",      v:fmt(usdBalance),                                                    c:runway.color},
                {l:"Monthly Burn", v:fmt(expenses),                                                      c:T.red},
                {l:"To 6mo Target",v:usdBalance>=runway.target?"✓ Funded":fmt(runway.target-usdBalance), c:usdBalance>=runway.target?T.green:T.amber},
                {l:"Months",       v:runway.months.toFixed(1)+" mo",                                     c:runway.color},
              ].map(s=>(
                <div key={s.l} style={{background:T.surface,borderRadius:10,padding:"10px 14px"}}>
                  <div style={{fontSize:10,color:T.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>{s.l}</div>
                  <div style={{fontSize:14,color:s.c,fontFamily:"monospace",fontWeight:700}}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Allocation bar */}
          <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:12,padding:"14px 18px",marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8,flexWrap:"wrap",gap:4}}>
              <Lbl>Monthly Allocation — {fmt(income)} total</Lbl>
              <span style={{fontSize:10,color:T.green,fontFamily:"monospace"}}>Savings: {pct(sRate)}</span>
            </div>
            <div style={{height:14,background:T.faint,borderRadius:7,overflow:"hidden",display:"flex"}}>
              {[{v:fixed,c:T.red},{v:variable,c:T.red+"88"},{v:savings,c:T.green},{v:Math.max(0,rem),c:T.muted+"44"}].map((s,i)=>(
                <div key={i} style={{height:"100%",width:(income>0?Math.max(0,(s.v/income)*100):0)+"%",background:s.c,transition:"width 0.3s"}} />
              ))}
            </div>
            <div style={{display:"flex",gap:14,marginTop:8,flexWrap:"wrap"}}>
              {[{l:"Fixed",v:fixed,c:T.red},{l:"Variable",v:variable,c:T.red+"88"},{l:"Savings",v:savings,c:T.green},{l:"Surplus",v:Math.max(0,rem),c:T.muted}].map(s=>(
                <div key={s.l} style={{display:"flex",alignItems:"center",gap:5}}>
                  <div style={{width:7,height:7,borderRadius:2,background:s.c}} />
                  <span style={{fontSize:11,color:T.muted}}>{s.l}: {fmt(s.v)} ({pct(income>0?(s.v/income)*100:0)})</span>
                </div>
              ))}
            </div>
          </div>

          {/* P&L statement */}
          <div style={cardS}>
            {[
              {label:"Net Salary /mo",        val:netSalary,    color:T.green,                          dim:false},
              {label:"Bonus /mo (avg)",        val:bonus,        color:inclBonus?T.amber:T.muted,        dim:!inclBonus},
              {label:"Other Income",           val:extra,        color:extra>0?T.purple:T.muted,         dim:extra===0},
              {label:"Fixed Expenses",         val:-fixed,       color:T.red,                            dim:false},
              {label:"Variable Expenses",      val:-variable,    color:T.red,                            dim:false},
              {label:"Savings & Investments",  val:-savings,     color:T.blue,                           dim:false},
              {label:"Monthly Surplus",        val:rem,          color:rem>=0?T.green:T.red,             bold:true},
            ].map((r,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 18px",borderBottom:i<6?"1px solid "+T.border:"none",background:r.bold?T.surface:"transparent",opacity:r.dim?0.38:1}}>
                <span style={{fontSize:r.bold?12:11,color:r.bold?T.text:T.muted,fontWeight:r.bold?700:400,textTransform:r.bold?"uppercase":"none",letterSpacing:r.bold?1.2:0}}>{r.label}</span>
                <span style={{fontSize:r.bold?17:13,color:r.color,fontWeight:r.bold?700:500,fontFamily:"monospace"}}>{r.val>=0?fmt(r.val):"-"+fmt(Math.abs(r.val))}</span>
              </div>
            ))}
          </div>
        </>)}

        {/* ══ CASHFLOW ══ */}
        {tab==="cashflow"&&(
          <CashflowTab cashflow={cashflow} setCashflow={setCashflow}
            monthlyIncome={income} monthlyExpenses={expenses} monthlySavings={savings}
            fmt={fmt} fmtK={fmtK} />
        )}

        {/* ══ INCOME ══ */}
        {tab==="income"&&(<>
          <div className="fc-grid-3" style={{marginBottom:14}}>
            <StatCard label="Net Salary /mo"   value={fmt(netSalary)}   color={T.green} sub={cfg.symbol+(grossSalary/1000).toFixed(0)+"k gross"} />
            <StatCard label="Bonus /mo (avg)"  value={inclBonus?fmt(netBonus):"Excluded"} color={inclBonus?T.amber:T.muted} sub={cfg.symbol+(annualBonus/1000).toFixed(0)+"k gross"} />
            <StatCard label="Total Net Income" value={fmt(income)} color={T.text} sub="All active sources" />
          </div>
          <IncomeTable items={incomeItems} setCustomIncome={setCustomIncome} inclBonus={inclBonus} setInclBonus={setInclBonus} totalIncome={income} fmt={fmt} />
        </>)}

        {/* ══ EXPENSES ══ */}
        {tab==="expenses"&&(<>
          <div className="fc-grid-3" style={{marginBottom:14}}>
            <StatCard label="Fixed Expenses"    value={fmt(fixed)}    color={T.red}      sub={pct(income>0?(fixed/income)*100:0)+" of income"} />
            <StatCard label="Variable Expenses" value={fmt(variable)} color={T.red+"88"} sub={pct(income>0?(variable/income)*100:0)+" of income"} />
            <StatCard label="Total Outgoings"   value={fmt(expenses)} color={T.red}      sub={pct(income>0?(expenses/income)*100:0)+" of income"} />
          </div>
          <EditableTable title="Fixed Expenses"    icon="🔒" items={fixedItems} setItems={setFixedItems} accentColor={T.red}  sliderMax={8000} />
          <EditableTable title="Variable Expenses" icon="🔄" items={varItems}   setItems={setVarItems}   accentColor={T.blue} sliderMax={3000} />
        </>)}

        {/* ══ SAVINGS ══ */}
        {tab==="savings"&&(<>
          <div className="fc-grid-3" style={{marginBottom:14}}>
            <StatCard label="Monthly Savings"   value={fmt(savings)}            color={T.green} sub={pct(sRate)+" savings rate"} />
            <StatCard label="Annual Savings"    value={fmt(savings*12)}          color={T.green} sub="Excluding bonus" />
            <StatCard label="With Bonus (net)"  value={fmt(savings*12+netBonus*12)} color={T.amber} sub="Total annual capacity" />
          </div>
          <SavingsSection buckets={savBuckets} setBuckets={setSavBuckets} />
          <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:12,padding:"16px 18px",marginBottom:14}}>
            <Lbl color={T.green}>Allocation Breakdown</Lbl>
            <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:10}}>
              {savBuckets.filter(b=>!b.excluded).map((b,idx)=>{
                const c=b.color||SAV_COLORS[idx%SAV_COLORS.length];
                const share=savings>0?(b.amount/savings)*100:0;
                return (
                  <div key={b.id} style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:70,fontSize:11,color:T.muted,textAlign:"right",flexShrink:0,fontFamily:"monospace"}}>{fmt(b.amount)}</div>
                    <div style={{flex:1}}><MiniBar value={b.amount} max={savings||1} color={c} /></div>
                    <div style={{fontSize:10,color:c,width:34,flexShrink:0,fontFamily:"monospace"}}>{pct(share)}</div>
                    <div style={{fontSize:11,color:T.text,flex:1,fontFamily:"monospace"}}>{b.name}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>)}

        {/* ══ PROJECTIONS ══ */}
        {tab==="projections"&&(<>
          <div style={{display:"flex",gap:4,marginBottom:14,background:T.card,padding:4,borderRadius:10,border:"1px solid "+T.border,width:"fit-content",flexWrap:"wrap"}}>
            {INTERVAL_MODES.map(m=>(
              <button key={m.id} onClick={()=>setProjInterval(m.id)}
                style={{padding:"6px 12px",borderRadius:7,border:"none",background:projInterval===m.id?T.accent:"transparent",color:projInterval===m.id?T.bg:T.muted,cursor:"pointer",fontSize:10,fontFamily:"monospace",letterSpacing:1.5,textTransform:"uppercase",fontWeight:projInterval===m.id?700:400,transition:"all 0.15s",whiteSpace:"nowrap"}}>
                {m.label}
              </button>
            ))}
          </div>
          <ProjChart monthlySavings={savings} netBonus={netBonus} includeBonus={inclBonus} intervalMode={projInterval} fmtK={fmtK} />
          <div style={cardS}>
            <div style={{padding:"12px 18px",background:T.surface,borderBottom:"1px solid "+T.border,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
              <Lbl color={T.green}>Detailed Projections — {fmt(savings)}/mo @ 7% return</Lbl>
              <Pill label={INTERVAL_MODES.find(m=>m.id===projInterval)?.label+" view"||""} color={T.green} />
            </div>
            <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
              <table style={{width:"100%",minWidth:500,borderCollapse:"collapse",fontSize:11,fontFamily:"monospace"}}>
                <thead>
                  <tr>{["Period","Investments","Bonus","Car","Total","vs $1.9M"].map(h=>(
                    <th key={h} style={{padding:"10px 12px",textAlign:"right",color:T.muted,fontSize:10,letterSpacing:1.2,textTransform:"uppercase",borderBottom:"1px solid "+T.border,whiteSpace:"nowrap",fontWeight:600}}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {(INTERVAL_MODES.find(m=>m.id===projInterval)||INTERVAL_MODES[2]).steps.map((y,i)=>{
                    const row=calcProjRow(y,savings,netBonus,inclBonus);
                    const gap=row.total-TARGET_USD,hit=row.total>=TARGET_USD;
                    return (
                      <tr key={y} style={{background:i%2===0?T.surface:"transparent",borderBottom:"1px solid "+T.border}}>
                        <td style={{padding:"10px 12px",color:hit?T.amber:T.text,fontWeight:hit?700:400,whiteSpace:"nowrap"}}>{INTERVAL_MODES.find(m=>m.id===projInterval)?.fmt(y)||y+"yr"}{hit?" ✓":""}</td>
                        <td style={{padding:"10px 12px",textAlign:"right",color:T.blue}}>{fmtK(row.inv)}</td>
                        <td style={{padding:"10px 12px",textAlign:"right",color:inclBonus?T.amber:T.muted}}>{inclBonus?fmtK(row.bon):"—"}</td>
                        <td style={{padding:"10px 12px",textAlign:"right",color:T.muted}}>{fmtK(row.car)}</td>
                        <td style={{padding:"10px 12px",textAlign:"right",color:hit?T.amber:T.green,fontWeight:700}}>{fmtK(row.total)}</td>
                        <td style={{padding:"10px 12px",textAlign:"right",color:hit?T.green:T.red,fontWeight:600}}>{gap>=0?"+":""}{fmtK(gap)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>)}

        {/* ══ ANALYSIS ══ */}
        {tab==="analysis"&&(<>
          <HealthScore savingsRate={sRate} housingPct={housing} totalExpenses={expenses} netIncome={income} />
          <div style={{background:T.card,border:"1px solid "+runway.color+"44",borderRadius:12,padding:"16px 18px",marginBottom:14}}>
            <Lbl color={runway.color}>Cash Runway Analysis</Lbl>
            <div className="fc-analysis" style={{marginTop:12}}>
              {[
                {label:"3-month floor",   score:runway.months>=3?"✓ Met":"⚠ Below",            color:runway.months>=3?T.green:T.red,    detail:runway.months>=3?"Above minimum. Current: "+runway.months.toFixed(1)+" months.":"Only "+runway.months.toFixed(1)+"mo. Need "+fmt(expenses*3-usdBalance)+" more for floor."},
                {label:"6-month target",  score:runway.months>=6?"✓ Funded":runway.months>=3?"~ In Progress":"⚠ Priority",color:runway.color,detail:runway.months>=6?"Fully funded. "+fmt(usdBalance-runway.target)+" above target.":fmt(runway.target-usdBalance)+" shortfall. "+(runway.toTarget!==null?"~"+runway.toTarget.toFixed(1)+" months to target.":"Increase surplus.")},
                {label:"Burn sensitivity",score:expenses<4000?"✓ Lean":expenses<7000?"~ Moderate":"⚠ High Burn",        color:expenses<4000?T.green:expenses<7000?T.amber:T.red,  detail:"Each "+cfg.symbol+"1k cut = "+(1000/Math.max(1,expenses)).toFixed(2)+" more months runway."},
                {label:"Balance vs income",score:usdBalance>=income*2?"✓ Strong":usdBalance>=income?"~ Adequate":"⚠ Low",color:usdBalance>=income*2?T.green:usdBalance>=income?T.amber:T.red,detail:fmt(usdBalance)+" = "+(income>0?(usdBalance/income).toFixed(1):"—")+"× monthly income."},
              ].map(item=>(
                <div key={item.label} style={{background:T.surface,border:"1px solid "+item.color+"33",borderRadius:10,padding:"12px 14px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,gap:8,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,color:T.muted,fontFamily:"monospace"}}>{item.label}</span>
                    <Pill label={item.score} color={item.color} />
                  </div>
                  <p style={{margin:0,fontSize:11,color:T.muted,lineHeight:1.7}}>{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
          <div style={cardS}>
            <div style={{padding:"12px 18px",background:T.surface,borderBottom:"1px solid "+T.border}}>
              <Lbl color={T.purple}>Objective Assessment</Lbl>
            </div>
            {[
              {area:"Housing",          color:rentAmt>income*.35?T.red:rentAmt>income*.28?T.amber:T.green, verdict:rentAmt>income*.35?"⚠ Elevated":rentAmt>income*.28?"~ Borderline":"✓ Reasonable", detail:"At "+pct(housing)+" of net income. "+cfg.taxYearNote},
              {area:"Savings Rate",     color:sRate>=30?T.green:sRate>=20?T.amber:T.red,                   verdict:sRate>=30?"✓ Strong":sRate>=20?"~ Moderate":"⚠ Insufficient",                   detail:pct(sRate)+" savings rate. Target 30%+ for aggressive wealth building."},
              {area:"Expense Control",  color:expenses<income*.65?T.green:expenses<income*.80?T.amber:T.red,verdict:expenses<income*.65?"✓ Controlled":expenses<income*.80?"~ Moderate":"⚠ High",   detail:"Total "+fmt(expenses)+"/mo = "+pct(income>0?(expenses/income)*100:0)+" of net income."},
              {area:"Tax Efficiency",   color:Number(effectiveRate)<25?T.green:Number(effectiveRate)<35?T.amber:T.red,verdict:Number(effectiveRate)<25?"✓ Efficient":Number(effectiveRate)<35?"~ Average":"⚠ High",detail:effectiveRate+"% effective rate. "+cfg.rentalNotes},
              {area:"Wealth Trajectory",color:T.green,verdict:"✓ On Track",detail:"At "+fmt(savings)+"/mo compounding at 7%, you are on a path toward the $1.9M target. Review Projections tab for your timeline."},
            ].map((r,i)=>(
              <div key={i} style={{padding:"14px 18px",borderBottom:i<4?"1px solid "+T.border:"none"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5,gap:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:12,color:T.text,fontWeight:700}}>{r.area}</span>
                  <Pill label={r.verdict} color={r.color} />
                </div>
                <p style={{margin:0,fontSize:11,color:T.muted,lineHeight:1.7}}>{r.detail}</p>
              </div>
            ))}
          </div>
        </>)}

        <footer style={{textAlign:"center",marginTop:28,fontSize:10,color:T.border,paddingBottom:20}}>
          For personal planning purposes only · Not financial advice · FinCommand 2026
        </footer>
      </div>

      {/* ── OVERLAYS ───────────────────────────────────────────────────────── */}
      {showGlossary&&<GlossaryPanel onClose={()=>setShowGlossary(false)} />}

      {showTaxReport&&<TaxYearReport
        profile={profile} grossSalary={grossSalary} annualBonus={annualBonus}
        inclBonus={inclBonus} netSalary={netSalary} netBonus={netBonus}
        effectiveRate={effectiveRate} totalSavings={savings}
        totalExpenses={expenses} totalIncome={income} fmt={fmt}
        onClose={()=>setShowTaxReport(false)} />}

      {showAI&&<AIAdvisor
        onClose={()=>setShowAI(false)}
        themeId={themeId}
        dashboardContext={JSON.stringify({
          name:profile?.name, country:country, currency:cfg.currency, symbol:cfg.symbol,
          grossSalary, annualBonus, inclBonus,
          netSalary:Math.round(netSalary), netBonus:Math.round(netBonus),
          effectiveRate, totalIncome:Math.round(income),
          totalExpenses:Math.round(expenses), totalSavings:Math.round(savings),
          savingsRate:income>0?Math.round(savings/income*100):0,
          usdBalance, emergencyFundTarget:Math.round(expenses*6),
          cashRunwayMonths:expenses>0?Math.round(usdBalance/expenses):0,
          housingPct:income>0?Math.round((fixedItems.find(f=>f.name?.toLowerCase().includes("rent")||f.name?.toLowerCase().includes("mortgage"))?.amount||0)/income*100):0,
          netWorthProjection30yr:Math.round(usdBalance*Math.pow(1.07,30)+savings*12*((Math.pow(1.07,30)-1)/0.07)),
          fixedExpenses:fixedItems.map(i=>({name:i.name,amount:i.amount})),
          variableExpenses:varItems.map(i=>({name:i.name,amount:i.amount})),
          savingsBuckets:savBuckets.map(i=>({name:i.name,amount:i.amount})),
        },null,2)}
      />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// GLOSSARY — lightbulb icon panel with plain-English financial definitions
// ══════════════════════════════════════════════════════════════════════════════
const GLOSSARY_TERMS = [
  { term:"Net Income", cat:"Income", def:"Your take-home pay after all taxes are deducted. The actual money that lands in your bank account each month." },
  { term:"Gross Salary", cat:"Income", def:"Your salary before any tax or deductions. The number on your job offer letter." },
  { term:"Effective Tax Rate", cat:"Tax", def:"The overall percentage of your total income you pay in tax — not your top bracket rate. If you earn $100k and pay $22k in tax, your effective rate is 22%." },
  { term:"Marginal Tax Rate", cat:"Tax", def:"The tax rate applied only to your next pound/dollar of income. Earning £1,000 more doesn't mean everything gets taxed at the higher rate — only that extra £1,000 does." },
  { term:"FICA", cat:"Tax", def:"US payroll taxes: Social Security (6.2%) and Medicare (1.45%) that are automatically deducted from your US payslip." },
  { term:"National Insurance", cat:"Tax", def:"UK payroll contributions (similar to US FICA) that fund state pension and NHS. You pay 8% on earnings between £12,570–£50,270." },
  { term:"Monthly Surplus", cat:"Budgeting", def:"What's left over each month after paying all expenses and hitting your savings targets. Positive = you're building wealth. Negative = spending more than you earn." },
  { term:"Cash Runway", cat:"Budgeting", def:"How many months you could cover all your expenses using only your current liquid savings, with no income. 6 months is the gold standard emergency buffer." },
  { term:"Savings Rate", cat:"Budgeting", def:"The percentage of your net income you save each month. A 20% rate is considered good; 30%+ is strong for wealth building." },
  { term:"Housing Ratio", cat:"Budgeting", def:"The percentage of your net income spent on rent or mortgage. Financial rules of thumb suggest keeping this below 30%." },
  { term:"Emergency Fund", cat:"Savings", def:"A dedicated cash reserve set aside purely for unexpected events — job loss, medical bills, urgent repairs. Separate from investment savings." },
  { term:"Index Funds", cat:"Investing", def:"Investment funds that track a market index (like the S&P 500). Low-cost, diversified, and historically outperform most active fund managers over time." },
  { term:"401(k) / Pension", cat:"Investing", def:"Tax-advantaged retirement savings accounts. Contributions often reduce your taxable income now, and the money grows tax-free until retirement." },
  { term:"Compound Interest", cat:"Investing", def:"Earning returns on your returns. A £10k investment growing at 7%/year becomes ~£19.7k in 10 years — not from adding money, but because growth builds on itself." },
  { term:"7% Return Assumption", cat:"Investing", def:"The historical average annual real return of a globally diversified stock portfolio over long periods, after adjusting for inflation. Used as a conservative planning benchmark." },
  { term:"Net Worth", cat:"Wealth", def:"Everything you own (assets) minus everything you owe (liabilities). Your salary doesn't build wealth — your net worth does." },
  { term:"Liquidity", cat:"Wealth", def:"How quickly you can turn an asset into cash without losing much value. Cash is fully liquid; property is illiquid. Liquid savings = accessible money." },
  { term:"Asset Allocation", cat:"Investing", def:"How you divide investments across categories like stocks, bonds, property, and cash. Your allocation determines your risk/return profile." },
  { term:"Negative Gearing", cat:"Tax", def:"(Australia) When your rental income is less than the property costs — the loss can offset other taxable income, reducing your total tax bill." },
  { term:"Foreign Tax Credit", cat:"Tax", def:"A US tax mechanism that prevents double-taxation on income you've already paid tax on in another country — relevant if you have UK income and a US tax obligation." },
  { term:"Self Assessment", cat:"Tax", def:"The UK annual tax filing process for people with income not taxed at source (rental income, freelance, overseas income). Deadline: January 31st." },
  { term:"Non-Resident Landlord Scheme (NRLS)", cat:"Tax", def:"UK scheme requiring tenants/agents to deduct basic rate tax from rental payments to landlords living abroad, unless HMRC has approved gross payment." },
  { term:"Projected Surplus", cat:"Cashflow", def:"How much cash you're expected to have left at the end of the month after all planned income and expenses — before one-off costs." },
  { term:"One-Off Expenses", cat:"Cashflow", def:"Non-recurring costs in a given month — holiday, car service, new appliance, moving costs. These don't appear every month but can significantly impact your cash position." },
  { term:"Closing Balance", cat:"Cashflow", def:"The amount of liquid cash you're projected to have at the end of a given month, after all income, expenses, savings, and one-offs." },
  { term:"$1.9M Target", cat:"Wealth", def:"FinCommand's default net worth target — approximately £1.5M — based on the 4% safe withdrawal rule needing ~£60k/yr in retirement to maintain a comfortable lifestyle in a major city." },
  { term:"Dollar-Cost Averaging", cat:"Investing", def:"Investing a fixed amount at regular intervals regardless of market conditions. Removes the impossible task of timing the market and smooths out volatility over time." },
  { term:"Capital Gains", cat:"Tax", def:"Profit made when you sell an asset for more than you paid for it — shares, property, crypto. Often taxed differently (usually lower) than regular income." },
];

function GlossaryPanel({ onClose }) {
  const T=useTheme();
  const [search,setSearch]=useState("");
  const [cat,setCat]=useState("All");
  const cats=["All",...[...new Set(GLOSSARY_TERMS.map(g=>g.cat))]];
  const filtered=GLOSSARY_TERMS.filter(g=>{
    const matchCat=cat==="All"||g.cat===cat;
    const matchSearch=!search.trim()||g.term.toLowerCase().includes(search.toLowerCase())||g.def.toLowerCase().includes(search.toLowerCase());
    return matchCat&&matchSearch;
  });

  return (
    <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"flex-start",justifyContent:"flex-end",padding:"60px 20px 20px"}}>
      {/* Backdrop */}
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"#00000066",backdropFilter:"blur(4px)"}} />
      {/* Panel */}
      <div style={{position:"relative",width:"100%",maxWidth:500,maxHeight:"calc(100vh - 80px)",background:T.card,border:"1px solid "+T.border,borderRadius:16,display:"flex",flexDirection:"column",boxShadow:"0 24px 64px #00000077",overflow:"hidden"}}>
        {/* Header */}
        <div style={{padding:"18px 20px 14px",borderBottom:"1px solid "+T.border,background:T.surface,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:32,height:32,background:T.amber+"22",border:"1px solid "+T.amber+"44",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>💡</div>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:T.text}}>Finance Glossary</div>
                <div style={{fontSize:11,color:T.muted}}>{GLOSSARY_TERMS.length} terms · plain English</div>
              </div>
            </div>
            <button onClick={onClose} style={{background:"transparent",border:"1px solid "+T.border,color:T.muted,borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>
          <input placeholder="Search terms…" value={search} onChange={e=>setSearch(e.target.value)}
            style={{width:"100%",background:T.faint,border:"1px solid "+T.border,borderRadius:8,padding:"9px 12px",color:T.text,fontFamily:"inherit",fontSize:13,outline:"none",boxSizing:"border-box",marginBottom:10}} />
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {cats.map(c=>(
              <button key={c} onClick={()=>setCat(c)}
                style={{background:cat===c?T.amber+"22":"transparent",border:"1px solid "+(cat===c?T.amber+"66":T.border+"66"),color:cat===c?T.amber:T.muted,borderRadius:20,padding:"4px 10px",cursor:"pointer",fontSize:10,fontFamily:"monospace",letterSpacing:0.5,fontWeight:cat===c?700:400}}>
                {c}
              </button>
            ))}
          </div>
        </div>
        {/* Terms list */}
        <div style={{overflowY:"auto",flex:1,padding:"12px 0"}}>
          {filtered.length===0&&<div style={{padding:"20px",textAlign:"center",color:T.muted,fontSize:13}}>No matching terms</div>}
          {filtered.map((g,i)=>(
            <div key={g.term} style={{padding:"12px 20px",borderBottom:i<filtered.length-1?"1px solid "+T.border+"44":"none",transition:"background 0.1s"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                <span style={{fontSize:12,fontWeight:700,color:T.text,fontFamily:"monospace"}}>{g.term}</span>
                <span style={{fontSize:9,letterSpacing:1.2,textTransform:"uppercase",color:T.amber,background:T.amber+"18",padding:"2px 7px",borderRadius:10,fontFamily:"monospace"}}>{g.cat}</span>
              </div>
              <p style={{margin:0,fontSize:12,color:T.muted,lineHeight:1.75}}>{g.def}</p>
            </div>
          ))}
        </div>
        <div style={{padding:"10px 20px",borderTop:"1px solid "+T.border,fontSize:10,color:T.muted,textAlign:"center",flexShrink:0}}>
          Definitions are simplified for educational purposes only
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAX YEAR SUMMARY REPORT (Enhancement #9)
// ══════════════════════════════════════════════════════════════════════════════
function TaxYearReport({ profile, grossSalary, annualBonus, inclBonus, netSalary, netBonus, effectiveRate, totalSavings, totalExpenses, totalIncome, fmt, onClose }) {
  const T=useTheme();
  const cfg=TAX_CONFIGS[profile?.country||"US"]||TAX_CONFIGS.US;
  const { annualTax }=useMemo(()=>calcTax(profile?.country||"US",grossSalary,inclBonus?annualBonus:0),[profile,grossSalary,annualBonus,inclBonus]);
  const annualNet=totalIncome*12;
  const annualExpenses=totalExpenses*12;
  const annualSavingsTotal=totalSavings*12;
  const now=new Date();
  const taxYear=cfg.taxYearNote;

  const rows=[
    {label:"Gross Annual Salary",        value:fmt(grossSalary),                color:T.green},
    {label:"Annual Bonus (gross)",        value:inclBonus?fmt(annualBonus):"Excluded",     color:inclBonus?T.amber:T.muted},
    {label:"Estimated Total Tax",         value:"-"+fmt(annualTax),             color:T.red},
    {label:"Net Annual Salary",           value:fmt(netSalary*12),              color:T.green},
    {label:"Net Bonus (avg annual)",      value:inclBonus?fmt(netBonus*12):"—", color:inclBonus?T.amber:T.muted},
    {label:"Effective Tax Rate",          value:effectiveRate+"%",              color:T.amber},
    {label:"Annual Expenses",             value:"-"+fmt(annualExpenses),        color:T.red},
    {label:"Annual Savings Contributed",  value:fmt(annualSavingsTotal),        color:T.blue},
    {label:"Net Annual Income (total)",   value:fmt(annualNet),                 color:T.text,bold:true},
  ];

  return (
    <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"#00000066",backdropFilter:"blur(4px)"}} />
      <div style={{position:"relative",width:"100%",maxWidth:580,background:T.card,border:"1px solid "+T.border,borderRadius:18,overflow:"hidden",boxShadow:"0 24px 64px #00000077",maxHeight:"90vh",overflowY:"auto"}}>
        {/* Report header */}
        <div style={{background:"linear-gradient(135deg,"+T.accent+"22,"+T.blue+"11)",borderBottom:"1px solid "+T.border,padding:"24px 28px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div style={{fontSize:10,letterSpacing:3,color:T.accent,textTransform:"uppercase",marginBottom:6,fontFamily:"monospace"}}>FinCommand · Annual Report</div>
              <h2 style={{margin:"0 0 4px",fontSize:22,fontWeight:800,color:T.text,letterSpacing:-0.5}}>Tax Year Summary</h2>
              <div style={{fontSize:12,color:T.muted}}>{cfg.flag} {cfg.name} · {taxYear}</div>
              <div style={{fontSize:11,color:T.muted,marginTop:2}}>Generated {now.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</div>
            </div>
            <button onClick={onClose} style={{background:"transparent",border:"1px solid "+T.border,color:T.muted,borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>×</button>
          </div>
        </div>
        {/* KPI row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:0,borderBottom:"1px solid "+T.border}}>
          {[
            {label:"Net Income / mo",  value:fmt(totalIncome),    color:T.green},
            {label:"Total Tax / yr",   value:fmt(annualTax),      color:T.red},
            {label:"Savings / yr",     value:fmt(annualSavingsTotal), color:T.blue},
          ].map((k,i)=>(
            <div key={i} style={{padding:"16px 20px",borderRight:i<2?"1px solid "+T.border:"none",textAlign:"center"}}>
              <div style={{fontSize:10,color:T.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:5}}>{k.label}</div>
              <div style={{fontSize:19,color:k.color,fontFamily:"monospace",fontWeight:700}}>{k.value}</div>
            </div>
          ))}
        </div>
        {/* Line items */}
        <div style={{padding:"0"}}>
          {rows.map((r,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 28px",borderBottom:i<rows.length-1?"1px solid "+T.border+"44":"none",background:r.bold?T.surface:"transparent"}}>
              <span style={{fontSize:r.bold?12:11,color:r.bold?T.text:T.muted,fontWeight:r.bold?700:400,letterSpacing:r.bold?0.5:0,textTransform:r.bold?"uppercase":"none"}}>{r.label}</span>
              <span style={{fontSize:r.bold?16:13,color:r.color,fontFamily:"monospace",fontWeight:r.bold?700:500}}>{r.value}</span>
            </div>
          ))}
        </div>
        {/* Tax note */}
        <div style={{padding:"16px 28px",background:T.amber+"0a",borderTop:"1px solid "+T.amber+"22"}}>
          <div style={{fontSize:11,color:T.muted,lineHeight:1.8}}>
            <span style={{color:T.amber,fontWeight:700}}>📋 {cfg.flag} Note: </span>{cfg.rentalNotes}
          </div>
        </div>
        {/* Print button */}
        <div style={{padding:"16px 28px",display:"flex",gap:10}}>
          <button onClick={()=>window.print()} style={{flex:1,background:T.accent,border:"none",color:T.bg,borderRadius:10,padding:"12px",cursor:"pointer",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            🖨️ Print / Save as PDF
          </button>
          <button onClick={onClose} style={{background:T.faint,border:"1px solid "+T.border,color:T.muted,borderRadius:10,padding:"12px 20px",cursor:"pointer",fontSize:13}}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// AI FINANCE ADVISOR — conversational AI using the Anthropic API
// Powered by dashboard data context + Claude claude-sonnet-4-20250514
// ══════════════════════════════════════════════════════════════════════════════
function AIAdvisor({ dashboardContext, themeId, onClose }) {
  const T=useTheme();
  const [messages,setMessages]=useState([
    { role:"assistant", text:"Hi! I'm your AI Finance Advisor. I have access to your complete financial data — income, expenses, savings, cashflow, and projections. Ask me anything about your finances, what-if scenarios, or how to improve your financial position." }
  ]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const bottomRef=useRef(null);
  const inputRef=useRef(null);

  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[messages]);

  const QUICK_PROMPTS=[
    "Am I on track to hit £1.9M?",
    "How can I improve my savings rate?",
    "What if my rent drops by £500?",
    "Analyse my biggest expense risks",
    "When can I stop worrying about my emergency fund?",
    "What's my financial health score breakdown?",
    "How does my housing cost compare to best practice?",
    "Give me a 3-point action plan for this month",
  ];

  const sendMessage=async(text)=>{
    const userText=(text||input).trim();
    if(!userText||loading)return;
    setInput("");setError("");
    const newMessages=[...messages,{role:"user",text:userText}];
    setMessages(newMessages);
    setLoading(true);

    const systemPrompt=
      "You are an expert personal finance advisor embedded in FinCommand, a financial dashboard app. "+
      "You have access to the user's complete financial data below. "+
      "Give specific, actionable, data-driven advice. Be direct, warm, and concise. "+
      "Use numbers from their data. Format with short paragraphs. "+
      "Never give generic advice — always tie it to their actual numbers.\n\n"+
      "USER'S FINANCIAL SNAPSHOT:\n"+dashboardContext+"\n\n"+
      "Rules:\n"+
      "- Always reference specific numbers from their data\n"+
      "- Be encouraging but honest about risks\n"+
      "- Suggest concrete next steps\n"+
      "- Keep responses under 250 words unless asked for detail\n"+
      "- Use £/$ symbols matching their country currency\n"+
      "- Never recommend specific investment products or funds";

    // ── Route: Edge Function (production) or direct API (demo/dev) ──────────
    const useEdge = IS_CONFIGURED;

    try {
      // Get auth token to authenticate with the edge function
      let authHeader = {};
      if(IS_CONFIGURED){
        const sb = await getSb();
        const { data:{ session } } = await sb.auth.getSession();
        if(session?.access_token) authHeader = { "Authorization": "Bearer " + session.access_token };
      }

      const payload = {
        system: systemPrompt,
        messages: newMessages.filter(m=>m.role!=="system").map(m=>({role:m.role,content:m.text})),
      };

      const endpoint = useEdge
        ? SUPABASE_URL+"/functions/v1/ai-advisor"
        : "https://api.anthropic.com/v1/messages";

      const headers = useEdge
        ? { "Content-Type":"application/json", "apikey":SUPABASE_ANON, ...authHeader }
        : { "Content-Type":"application/json","anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true" };

      const body = useEdge
        ? JSON.stringify(payload)
        : JSON.stringify({ model:"claude-sonnet-4-5", max_tokens:600, system:systemPrompt,
            messages:newMessages.filter(m=>m.role!=="system").map(m=>({role:m.role,content:m.text})) });

      const res = await fetch(endpoint, { method:"POST", headers, body });

      if(!res.ok){
        const errData = await res.json().catch(()=>({}));
        const errMsg  = errData?.error?.message || errData?.message || ("Error "+res.status+(useEdge?" — check Edge Function is deployed.":" — check Anthropic API key."));
        setError(errMsg);
        setLoading(false);
        return;
      }

      // ── Streaming response ─────────────────────────────────────────────────
      // Edge function always streams — don't rely solely on content-type header
      const ct = res.headers.get("content-type") || "";
      const isStream = ct.includes("text/event-stream") || ct.includes("text/plain") || useEdge;
      if(isStream && res.body){
        const reader   = res.body.getReader();
        const decoder  = new TextDecoder();
        let   fullText = "";
        let   buffer   = "";
        setMessages(p=>[...p,{role:"assistant",text:""}]);
        setLoading(false);
        while(true){
          const { done, value } = await reader.read();
          if(done) break;
          buffer += decoder.decode(value,{stream:true});
          const parts = buffer.split("\n");
          buffer = "";
          for(const line of parts){
            if(!line.startsWith("data:")) continue;
            const raw = line.slice(5).trim();
            if(raw==="[DONE]") break;
            try{
              const j = JSON.parse(raw);
              const delta = j?.delta?.text || j?.choices?.[0]?.delta?.content || "";
              if(delta){
                fullText += delta;
                setMessages(p=>{
                  const copy=[...p];
                  copy[copy.length-1]={role:"assistant",text:fullText};
                  return copy;
                });
              }
            }catch{}
          }
        }
        setLoading(false);
      } else {
        // ── Non-streaming JSON response ──────────────────────────────────────
        const data  = await res.json();
        const reply = data.content?.[0]?.text || data.reply || data.message || "Sorry, I couldn't generate a response.";
        setMessages(p=>[...p,{role:"assistant",text:reply}]);
        setLoading(false);
      }
    } catch(e) {
      setError("Connection issue — check your network or that the Edge Function is deployed.");
      setLoading(false);
    }
  };

  const isDark=["terminal","slate","midnight","autumn","westafrica","nigeria","london","newyork","tokyo","la"].includes(themeId);

  return (
    <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"flex-end",justifyContent:"flex-end",padding:"70px 20px 20px"}}>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"#00000044",backdropFilter:"blur(2px)"}} />
      <div style={{position:"relative",width:"100%",maxWidth:460,height:"min(680px,85vh)",background:T.card,border:"1px solid "+T.border,borderRadius:18,display:"flex",flexDirection:"column",boxShadow:"0 24px 64px #00000077",overflow:"hidden"}}>
        {/* Header */}
        <div style={{padding:"16px 18px",borderBottom:"1px solid "+T.border,background:"linear-gradient(135deg,"+T.accent+"18,"+T.purple+"0a)",flexShrink:0,display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,background:"linear-gradient(135deg,"+T.accent+","+T.purple+")",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>✨</div>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700,color:T.text}}>AI Finance Advisor</div>
            <div style={{fontSize:11,color:T.muted}}>Powered by your data · Claude AI</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:T.green,boxShadow:"0 0 6px "+T.green}} />
            <span style={{fontSize:10,color:T.muted,fontFamily:"monospace"}}>live</span>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:"1px solid "+T.border,color:T.muted,borderRadius:7,width:28,height:28,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>×</button>
        </div>
        {/* Messages */}
        <div style={{flex:1,overflowY:"auto",padding:"14px 16px",display:"flex",flexDirection:"column",gap:12}}>
          {messages.map((m,i)=>(
            <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",flexDirection:m.role==="user"?"row-reverse":"row"}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:m.role==="user"?T.blue+"33":"linear-gradient(135deg,"+T.accent+"44,"+T.purple+"33)",border:"1px solid "+(m.role==="user"?T.blue+"44":T.accent+"33"),display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}>
                {m.role==="user"?"👤":"✨"}
              </div>
              <div style={{maxWidth:"82%",background:m.role==="user"?T.blue+"18":T.surface,border:"1px solid "+(m.role==="user"?T.blue+"33":T.border+"66"),borderRadius:m.role==="user"?"12px 4px 12px 12px":"4px 12px 12px 12px",padding:"10px 13px"}}>
                <div style={{fontSize:12,color:T.text,lineHeight:1.75,whiteSpace:"pre-wrap"}}>{m.text}</div>
              </div>
            </div>
          ))}
          {loading&&(
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:"linear-gradient(135deg,"+T.accent+"44,"+T.purple+"33)",border:"1px solid "+T.accent+"33",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>✨</div>
              <div style={{background:T.surface,border:"1px solid "+T.border+"66",borderRadius:"4px 12px 12px 12px",padding:"10px 16px",display:"flex",gap:5,alignItems:"center"}}>
                {[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:T.accent,opacity:0.6,animation:"fc-spin "+(0.6+i*0.15)+"s ease-in-out infinite alternate"}} />)}
              </div>
            </div>
          )}
          {error&&<div style={{fontSize:11,color:T.red,textAlign:"center",padding:"6px 12px",background:T.red+"12",borderRadius:8}}>{error}</div>}
          <div ref={bottomRef} />
        </div>
        {/* Quick prompts */}
        {messages.length<=1&&(
          <div style={{padding:"6px 14px 8px",borderTop:"1px solid "+T.border+"44",flexShrink:0}}>
            <div style={{fontSize:10,color:T.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:7}}>Quick questions</div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              {QUICK_PROMPTS.map(q=>(
                <button key={q} onClick={()=>sendMessage(q)} style={{background:T.faint,border:"1px solid "+T.border,color:T.muted,borderRadius:20,padding:"5px 10px",cursor:"pointer",fontSize:10,fontFamily:"inherit",transition:"all 0.15s",lineHeight:1.4}}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* Input */}
        <div style={{padding:"10px 14px",borderTop:"1px solid "+T.border,flexShrink:0,display:"flex",gap:8,background:T.surface}}>
          <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendMessage()}
            placeholder="Ask anything about your finances…"
            style={{flex:1,background:T.faint,border:"1px solid "+T.border,borderRadius:10,padding:"10px 13px",color:T.text,fontFamily:"inherit",fontSize:13,outline:"none"}} />
          <button onClick={()=>sendMessage()} disabled={!input.trim()||loading}
            style={{background:T.accent,border:"none",color:T.bg,borderRadius:10,padding:"10px 16px",cursor:(!input.trim()||loading)?"not-allowed":"pointer",fontSize:16,fontWeight:700,opacity:(!input.trim()||loading)?0.5:1,transition:"opacity 0.2s",display:"flex",alignItems:"center",justifyContent:"center"}}>
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}


class ErrorBoundary extends React.Component {
  constructor(p){super(p);this.state={error:null};}
  static getDerivedStateFromError(e){return{error:e};}
  render(){
    if(this.state.error)return(
      <div style={{minHeight:"100vh",background:"#08090b",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace",color:"#ff4d6d",flexDirection:"column",gap:16,padding:20,textAlign:"center"}}>
        <div style={{fontSize:32}}>⚠</div>
        <div style={{fontSize:15,fontWeight:700}}>Something went wrong</div>
        <div style={{fontSize:11,color:"#4a5568",maxWidth:380,lineHeight:1.8}}>{this.state.error?.message||"An unexpected error occurred."}</div>
        <button onClick={()=>{this.setState({error:null});window.location.reload();}} style={{background:"#ff4d6d",border:"none",color:"#fff",borderRadius:8,padding:"10px 22px",cursor:"pointer",fontSize:12,fontFamily:"monospace",marginTop:8}}>Reload App</button>
      </div>
    );
    return this.props.children;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [screen,  setScreen] =useState("loading");
  const [user,    setUser]   =useState(null);
  const [profile, setProfile]=useState(null);
  const [dashData,setDashData]=useState(null);
  const [themeId, setThemeId]=useState(()=>{try{return localStorage.getItem("fc_theme")||"terminal";}catch{return "terminal";}});

  const handleThemeChange=useCallback(id=>{
    setThemeId(id);try{localStorage.setItem("fc_theme",id);}catch{}
  },[]);

  const loadUserData=useCallback(async u=>{
    try{
      const{data}=await db.loadUserData(u.id);
      if(data?.profile&&data?.dashboard){
        // Migrate: add cashflow if missing from old saves
        if(!data.dashboard.cashflow) data.dashboard.cashflow=DEFAULT_CASHFLOW();
        setProfile(data.profile);setDashData(data.dashboard);setScreen("dashboard");
      } else setScreen("onboarding");
    }catch{setScreen("onboarding");}
  },[]);

  // Initial session check
  useEffect(()=>{
    db.getSession().then(session=>{
      if(session?.user){setUser(session.user);loadUserData(session.user);}
      else setScreen("landing");
    }).catch(()=>setScreen("landing"));
  },[loadUserData]);

  // Real-time auth state listener (Google OAuth redirect, token refresh, etc.)
  useEffect(()=>{
    let unsub=()=>{};
    onAuthChange((event,session)=>{
      if(session?.user){setUser(session.user);loadUserData(session.user);}
      else if(event==="SIGNED_OUT"){setUser(null);setProfile(null);setDashData(null);setScreen("landing");}
    }).then(fn=>{ unsub=fn; });
    return ()=>unsub();
  },[loadUserData]);

  const refreshSession=useCallback(async()=>{
    const sess=await db.getSession();
    if(sess?.user){setUser(sess.user);await loadUserData(sess.user);}
    else{setUser(null);setScreen("landing");}
  },[loadUserData]);

  const handleSignOut=useCallback(async()=>{
    await db.signOut();
    setUser(null);setProfile(null);setDashData(null);setScreen("landing");
  },[]);

  const handleOnboardingComplete=useCallback((prof,dash)=>{
    setProfile(prof);setDashData(dash);setScreen("dashboard");
  },[]);

  const theme=THEMES[themeId]||THEMES.terminal;

  if(screen==="loading")return(
    <div style={{minHeight:"100vh",background:"#08090b",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace",color:"#4a5568",flexDirection:"column",gap:14}}>
      <div className="fc-spin" style={{width:24,height:24,border:"2px solid #1e2329",borderTop:"2px solid #00c896",borderRadius:"50%"}} />
      <div style={{fontSize:11,letterSpacing:2}}>LOADING…</div>
      <style>{".fc-spin{animation:fc-spin .8s linear infinite}@keyframes fc-spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );

  return (
    <ErrorBoundary>
      <GlobalStyles />
      <ThemeCtx.Provider value={theme}>
        {screen==="landing"    &&<LandingPage onGetStarted={()=>setScreen("auth")} />}
        {screen==="auth"       &&<AuthPage onBack={()=>setScreen("landing")} onAuthSuccess={refreshSession} />}
        {screen==="onboarding" &&<OnboardingPage user={user} onComplete={handleOnboardingComplete} />}
        {screen==="dashboard"  &&profile&&dashData&&<Dashboard user={user} profile={profile} initialData={dashData} onSignOut={handleSignOut} themeId={themeId} onThemeChange={handleThemeChange} />}
      </ThemeCtx.Provider>
    </ErrorBoundary>
  );
}
