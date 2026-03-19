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
  /* Hide number input spinners for cleaner UX in rate/return fields */
  .fc-no-spin::-webkit-inner-spin-button,
  .fc-no-spin::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
  .fc-no-spin { -moz-appearance:textfield; }
`;
function GlobalStyles() { return <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />; }

// ══════════════════════════════════════════════════════════════════════════════
// ENVIRONMENT CONFIG — set PRODUCTION_DOMAIN before deploying to git
// ══════════════════════════════════════════════════════════════════════════════
// STEP 1: Set this to your deployed app's domain (no https://, no trailing slash)
//         Example: "myfinapp.com" or "app.myfinapp.com"
//         Leave empty ("") to stay in demo mode everywhere (safe default)
const PRODUCTION_DOMAIN = "fincommand.vercel.app";

// STEP 2: Your Supabase credentials (already set — don't change these)
const SUPABASE_URL  = "https://cjgazhrxexjvztkzaujk.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqZ2F6aHJ4ZXhqdnp0a3phdWprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MTY0OTgsImV4cCI6MjA4ODQ5MjQ5OH0.2CB4zj-1z5RrS728vM87mq4rM1vnnxuahqE09HGuOXM";

// ── IS_DEMO: true everywhere EXCEPT your explicit production domain ───────────
// Default is ALWAYS demo mode — no network calls, no auth, no "Failed to fetch".
// Only flips to false when the browser hostname exactly matches PRODUCTION_DOMAIN.
// This means Claude artifacts, localhost, Vercel previews, CI — all run as demo.
const IS_DEMO = (() => {
  if (!PRODUCTION_DOMAIN) return true; // no domain set → always demo
  try {
    const h = window.location.hostname;
    return h !== PRODUCTION_DOMAIN && !h.endsWith("." + PRODUCTION_DOMAIN);
  } catch { return true; }
})();

// IS_CONFIGURED: only true in production with a real domain configured
const IS_CONFIGURED = !IS_DEMO && !SUPABASE_URL.includes("YOUR_PROJECT");

// IS_EDGE_DEPLOYED: set to true once Supabase Edge Function ai-advisor is deployed.
// When false, AI Advisor calls Anthropic API directly (safe, works in all environments).
const IS_EDGE_DEPLOYED = false;

// ── Demo persistence ──────────────────────────────────────────────────────────
const DEMO_KEY = "fincommand_demo_v6";
const demoStore = {
  get()  { try { return JSON.parse(localStorage.getItem(DEMO_KEY) || "{}"); } catch { return {}; } },
  set(d) { try { localStorage.setItem(DEMO_KEY, JSON.stringify(d)); } catch {} },
};
const DEMO_USER = { id:"demo-001", email:"demo@fincommand.app", user_metadata:{ full_name:"Demo User" } };

// ── Demo DB — zero network calls, localStorage only ───────────────────────────
// getSession always returns a user → app skips auth and shows dashboard directly.
const demoDb = {
  async getSession()           { return { user: DEMO_USER }; },
  async signInEmail()          { demoStore.set({...demoStore.get(),authed:true}); return { user:DEMO_USER, error:null }; },
  async signUpEmail()          { demoStore.set({...demoStore.get(),authed:true}); return { user:DEMO_USER, error:null }; },
  async signInGoogle()         { demoStore.set({...demoStore.get(),authed:true}); return { error:null }; },
  async signOut()              { demoStore.set({}); return { error:null }; },
  async loadUserData()         { const s=demoStore.get(); return { data:s.userData||null, error:null }; },
  async saveUserData(_,payload){ demoStore.set({...demoStore.get(),userData:payload}); return { error:null }; },
  async resetPassword()        { return { error:null, message:"Demo mode — no email sent." }; },
};

// ── Real DB — Supabase, only used when IS_CONFIGURED = true ───────────────────
// getSb uses new Function() to hide import() strings from Webpack static analysis.
// Tries npm package first (bundler/git), then CDN ESM (raw browser).
let _sb = null;
async function getSb() {
  if (_sb) return _sb;
  let createClient;
  try {
    const mod = await (new Function('return import("@supabase/supabase-js")')());
    createClient = mod.createClient;
  } catch {
    try {
      const CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
      const mod = await (new Function('u','return import(u)')(CDN));
      createClient = mod.createClient;
    } catch (e) {
      console.error("[FinCommand] Could not load Supabase:", e);
      return null;
    }
  }
  _sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true },
  });
  return _sb;
}
const realDb = {
  async getSession()        { const sb=await getSb(); if(!sb)return null; const{data:{session}}=await sb.auth.getSession(); return session?{user:session.user}:null; },
  async signInEmail(e,p)    { const sb=await getSb(); if(!sb)return{user:null,error:"Connection unavailable"}; const{data,error}=await sb.auth.signInWithPassword({email:e,password:p}); return{user:data?.user||null,error:error?.message||null}; },
  async signUpEmail(e,p)    { const sb=await getSb(); if(!sb)return{user:null,error:"Connection unavailable"}; const{data,error}=await sb.auth.signUp({email:e,password:p,options:{emailRedirectTo:window.location.origin}}); return{user:data?.user||null,error:error?.message||null}; },
  async signInGoogle()      { const sb=await getSb(); if(!sb)return{error:"Connection unavailable"}; const{error}=await sb.auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.origin,queryParams:{prompt:"select_account"}}}); return{error:error?.message||null}; },
  async signOut()           { const sb=await getSb(); if(!sb)return{error:null}; return sb.auth.signOut(); },
  async loadUserData(uid)   { const sb=await getSb(); if(!sb)return{data:null,error:"Connection unavailable"}; const{data,error}=await sb.from("user_data").select("*").eq("user_id",uid).maybeSingle(); return{data:data||null,error:error?.message||null}; },
  async saveUserData(uid,p) { const sb=await getSb(); if(!sb)return{error:"Connection unavailable"}; const{error}=await sb.from("user_data").upsert({user_id:uid,...p,updated_at:new Date().toISOString()},{onConflict:"user_id"}); return{error:error?.message||null}; },
  async resetPassword(e)    { const sb=await getSb(); if(!sb)return{error:"Connection unavailable"}; const{error}=await sb.auth.resetPasswordForEmail(e,{redirectTo:window.location.origin+"/reset"}); return{error:error?.message||null}; },
};

const db = IS_CONFIGURED ? realDb : demoDb;

async function onAuthChange(cb) {
  if (!IS_CONFIGURED) return () => {};
  const sb = await getSb();
  if (!sb) return () => {};
  const { data:{ subscription } } = sb.auth.onAuthStateChange(cb);
  return () => subscription?.unsubscribe();
}

// ══════════════════════════════════════════════════════════════════════════════
// THEMES — 13 themes across 3 categories
// ══════════════════════════════════════════════════════════════════════════════
const THEME_GROUPS = [
  { id:"dark",    label:"Dark",    emoji:"🌙" },
  { id:"seasons", label:"Seasons", emoji:"🍂" },
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
  spring: { id:"spring", name:"Spring", emoji:"🌸", group:"seasons",
    bg:"#f7f4f0", surface:"#ede8e2", card:"#ffffff", border:"#d9cfc6",
    text:"#2d2420", muted:"#8a7d74", faint:"#e8e0d8",
    green:"#3a8e54", red:"#c96b6b", amber:"#c8883a", blue:"#4a7fb0", purple:"#9b72b0", accent:"#c84580" },
  summer: { id:"summer", name:"Summer", emoji:"☀️", group:"seasons",
    bg:"#fffbf2", surface:"#fff4dc", card:"#ffffff", border:"#f0dba0",
    text:"#2a1e00", muted:"#a07828", faint:"#fff0c8",
    green:"#28a060", red:"#e04040", amber:"#f0a000", blue:"#2878c8", purple:"#8858b8", accent:"#e08000" },
  winter: { id:"winter", name:"Winter", emoji:"❄️", group:"seasons",
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
  autumn: { id:"autumn", name:"Autumn", emoji:"🍂", group:"seasons",
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
    taxYearNote:"Tax year: Apr 6 – Apr 5. Self Assessment: Jan 31.",
    studentLoanPlans:{
      plan1:   { label:"Plan 1 (pre-2012)",      threshold:24990, rate:0.09 },
      plan2:   { label:"Plan 2 (2012–2023)",      threshold:27295, rate:0.09 },
      plan4:   { label:"Plan 4 (Scotland)",        threshold:31395, rate:0.09 },
      plan5:   { label:"Plan 5 (post-Aug 2023)",   threshold:25000, rate:0.09 },
      postgrad:{ label:"Postgraduate Loan",         threshold:21000, rate:0.06 },
    } },
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
  NG:{ name:"Nigeria", flag:"🇳🇬", currency:"NGN", symbol:"₦", fxToUSD:0.00065,
    brackets:[{up:300000,r:0.07},{up:600000,r:0.11},{up:1100000,r:0.15},{up:1600000,r:0.19},{up:3200000,r:0.21},{up:Infinity,r:0.24}],
    pensionRate:0.08, pensionCap:Infinity,
    rentalNotes:"Rental income subject to PAYE or 10% withholding tax. Register with FIRS for annual filing.",
    taxYearNote:"Tax year: Jan 1 – Dec 31. Filing: March 31." },
  DE:{ name:"Germany", flag:"🇩🇪", currency:"EUR", symbol:"€", fxToUSD:1.09,
    brackets:[{up:11604,r:0},{up:17006,r:.14},{up:66761,r:.24},{up:277826,r:.42},{up:Infinity,r:.45}],
    solidarityRate:0.055, socialInsuranceRate:0.195,
    rentalNotes:"Rental income (Vermietung) taxed at marginal. AfA depreciation 2%/yr on building value.",
    taxYearNote:"Tax year: Jan 1 – Dec 31. Filing: Jul 31." },
};
function calcTax(country, grossAnnual, bonusAnnual, studentLoan) {
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
  else if(country==="NG"){ extra+=Math.min(grossAnnual,cfg.pensionCap)*cfg.pensionRate; }
  const totalTax=tax+extra;
  const r = Math.max(0, 1-totalTax/total);
  let monthlyStudentLoanRepayment = 0;
  if (studentLoan?.enabled && cfg.studentLoanPlans) {
    const plan = cfg.studentLoanPlans[studentLoan.plan||"plan2"];
    if (plan && grossAnnual > plan.threshold)
      monthlyStudentLoanRepayment += Math.round(((grossAnnual-plan.threshold)*plan.rate)/12);
    if (studentLoan.postgrad && cfg.studentLoanPlans.postgrad && grossAnnual > cfg.studentLoanPlans.postgrad.threshold)
      monthlyStudentLoanRepayment += Math.round(((grossAnnual-cfg.studentLoanPlans.postgrad.threshold)*cfg.studentLoanPlans.postgrad.rate)/12);
  }
  return {
    netSalary: Math.max(0, Math.round((grossAnnual/12)*r) - monthlyStudentLoanRepayment),
    netBonus: Math.round((bonusAnnual/12)*r),
    effectiveRate: (totalTax/total*100).toFixed(1),
    annualTax: Math.round(totalTax),
    monthlyStudentLoanRepayment,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS & HELPERS
// ══════════════════════════════════════════════════════════════════════════════
const DEFAULT_TARGET_NW = 1900000;
const TARGET_USD = DEFAULT_TARGET_NW;
const fv = (mo, rate, yrs) => {
  if (mo<=0||yrs<=0) return 0;
  const r = rate/12;
  if (Math.abs(r)<1e-10) return mo*yrs*12;
  return mo*((Math.pow(1+r,yrs*12)-1)/r)*(1+r);
};
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
  {id:"overview",     label:"Overview"},
  {id:"assets",       label:"Assets"},
  {id:"liabilities",  label:"Liabilities"},
  {id:"income",       label:"Income"},
  {id:"savings",      label:"Savings"},
  {id:"expenses",     label:"Expenses"},
  {id:"analysis",     label:"Analysis"},
  {id:"projections",  label:"Projections"},
  {id:"cashflow",     label:"Cashflow"},
];

const LIABILITY_CATEGORIES = [
  {value:"mortgage",  label:"Mortgage",      emoji:"🏠"},
  {value:"carloan",   label:"Car Loan",       emoji:"🚗"},
  {value:"student",   label:"Student Loan",   emoji:"🎓"},
  {value:"credit",    label:"Credit Card",    emoji:"💳"},
  {value:"personal",  label:"Personal Loan",  emoji:"🤝"},
  {value:"business",  label:"Business Loan",  emoji:"🏢"},
  {value:"other",     label:"Other Debt",     emoji:"📋"},
];

const DEFAULT_LIABILITIES = () => [
  {id:uid(), name:"Mortgage",      category:"mortgage", balance:250000, interestRate:4.5, monthlyPayment:1200, notes:"", excluded:false},
  {id:uid(), name:"Car Finance",   category:"carloan",  balance:12000,  interestRate:6.9, monthlyPayment:280,  notes:"", excluded:false},
];

// Asset categories
const ASSET_CATEGORIES = [
  {value:"property",    label:"Property",      emoji:"🏠"},
  {value:"stocks",      label:"Stocks / ETFs",  emoji:"📈"},
  {value:"pension",     label:"Pension / 401k", emoji:"🏦"},
  {value:"crypto",      label:"Crypto",          emoji:"₿"},
  {value:"business",    label:"Business",        emoji:"🏢"},
  {value:"cash",        label:"Cash / Savings",  emoji:"💵"},
  {value:"bonds",       label:"Bonds / Fixed",   emoji:"📄"},
  {value:"other",       label:"Other",           emoji:"📦"},
];

const DEFAULT_ASSETS = () => [
  {id:uid(), name:"Primary Property",  category:"property", value:300000, annualReturn:4.0, notes:"", excluded:false},
  {id:uid(), name:"Investment Account",category:"stocks",   value:25000,  annualReturn:8.0, notes:"", excluded:false},
  {id:uid(), name:"Pension Fund",      category:"pension",  value:40000,  annualReturn:7.0, notes:"", excluded:false},
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
  {id:uid(),name:"Index Funds",    amount:500, excluded:false, annualReturn:8.0},
  {id:uid(),name:"Pension / 401k", amount:300, excluded:false, annualReturn:7.0},
  {id:uid(),name:"Emergency Fund", amount:200, excluded:false, annualReturn:2.0},
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
function calcProjRow(y, monthlySavings, netBonus, inclBonus, annualReturnRate, initialAssetValue) {
  const r = (typeof annualReturnRate==="number" && isFinite(annualReturnRate) && annualReturnRate>0)
    ? annualReturnRate/100 : 0.07;
  const inv = Math.round(fv(monthlySavings, r, y));
  const bon = inclBonus ? Math.round(fv(netBonus, r, y)) : 0;
  const car = Math.max(0, Math.round(30000*Math.pow(0.85, y)));
  // Existing assets compound at the same weighted rate (if provided)
  const existingAssets = initialAssetValue>0 ? Math.round(initialAssetValue*Math.pow(1+r,y)) : 0;
  return { y, inv, bon, car, existingAssets, total: inv+bon+car+existingAssets };
}
function weightedAvgReturn(buckets) {
  const active = (buckets||[]).filter(b=>!b.excluded);
  const totalAmt = active.reduce((s,b)=>s+(Number(b.amount)||0), 0);
  if (totalAmt<=0) return 7;
  return active.reduce((s,b)=>s+(Number(b.amount)||0)*(Number(b.annualReturn)||7), 0)/totalAmt;
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
    if(type==="number"){ const n=parseFloat(val); if(!isNaN(n))onCommit(n); else setVal(String(value)); }
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
// COLLAPSIBLE SECTION — reusable expand/collapse wrapper
// ══════════════════════════════════════════════════════════════════════════════
function CollapsibleSection({ title, icon, children, defaultOpen=true, accentColor, badge, storeKey }) {
  const T = useTheme();
  const [open, setOpen] = useState(()=>{
    if(!storeKey) return defaultOpen;
    try {
      const stored = localStorage.getItem("fc_cs_"+storeKey);
      return stored !== null ? stored === "1" : defaultOpen;
    } catch { return defaultOpen; }
  });
  const toggle = () => setOpen(o=>{
    const next = !o;
    if(storeKey) { try { localStorage.setItem("fc_cs_"+storeKey, next?"1":"0"); } catch {} }
    return next;
  });
  const c = accentColor || T.accent;
  return (
    <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:14,overflow:"hidden",marginBottom:14}}>
      <div onClick={toggle}
        style={{background:c+"0e",borderBottom:open?"1px solid "+T.border:"none",padding:"12px 18px",
          display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",userSelect:"none"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {icon&&<span style={{fontSize:15}}>{icon}</span>}
          <span style={{fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:T.text,fontFamily:"monospace"}}>{title}</span>
          {badge!==undefined&&<span style={{fontSize:11,fontFamily:"monospace",fontWeight:700,color:c,marginLeft:4}}>{badge}</span>}
        </div>
        <span style={{fontSize:13,color:T.muted,transform:open?"rotate(0deg)":"rotate(-90deg)",transition:"transform 0.2s",display:"inline-block"}}>▼</span>
      </div>
      {open&&<div>{children}</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// EDITABLE TABLE — full inline name & value editing + slider
// ══════════════════════════════════════════════════════════════════════════════
function EditableTable({ title, icon, items, setItems, accentColor, sliderMax, bare }) {
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
    <div style={{background:bare?"transparent":T.card,border:bare?"none":"1px solid "+T.border,borderRadius:bare?0:14,overflow:"hidden",marginBottom:bare?0:14}}>
      <div style={{background:bare?"transparent":accentColor+"14",borderBottom:bare?"none":"1px solid "+T.border,padding:"12px 18px",display:bare?"none":"flex",justifyContent:"space-between",alignItems:"center"}}>
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
// LIABILITIES TAB
// ══════════════════════════════════════════════════════════════════════════════
function LiabilitiesTab({ liabilities, setLiabilities, assets, openingBalance, income, expenses, fmt, fmtK }) {
  const T = useTheme();
  const [adding, setAdding] = useState(false);
  const [nName, setNName] = useState("");
  const [nCat,  setNCat]  = useState("mortgage");
  const [nBal,  setNBal]  = useState("");
  const [nRate, setNRate] = useState("4.5");
  const [nPmt,  setNPmt]  = useState("");

  const active       = useMemo(()=>liabilities.filter(l=>!l.excluded), [liabilities]);
  const totalDebt    = useMemo(()=>active.reduce((s,l)=>s+(Number(l.balance)||0),0), [active]);
  const totalAssets  = useMemo(()=>(assets||[]).filter(a=>!a.excluded).reduce((s,a)=>s+(Number(a.value)||0),0), [assets]);
  const netWorth     = totalAssets + openingBalance - totalDebt;
  const totalPmts    = useMemo(()=>active.reduce((s,l)=>s+(Number(l.monthlyPayment)||0),0), [active]);
  const debtToIncome = income>0 ? (totalPmts/income)*100 : 0;
  const catMap       = Object.fromEntries(LIABILITY_CATEGORIES.map(c=>[c.value,c]));

  const upd  = (id,k,v) => setLiabilities(p=>p.map(l=>l.id===id?{...l,[k]:v}:l));
  const tog  = id        => setLiabilities(p=>p.map(l=>l.id===id?{...l,excluded:!l.excluded}:l));
  const del  = id        => setLiabilities(p=>p.filter(l=>l.id!==id));
  const add  = () => {
    const b=parseFloat(nBal), r=parseFloat(nRate), m=parseFloat(nPmt);
    if(!nName.trim()||isNaN(b)||b<0) return;
    setLiabilities(p=>[...p,{id:uid(),name:nName.trim(),category:nCat,balance:b,interestRate:isNaN(r)?0:r,monthlyPayment:isNaN(m)?0:m,notes:"",excluded:false,custom:true}]);
    setNName(""); setNBal(""); setNRate("4.5"); setNPmt(""); setAdding(false);
  };
  const inputS = {background:T.faint,border:"1px solid "+T.border,borderRadius:6,padding:"7px 10px",color:T.text,fontFamily:"monospace",fontSize:14,outline:"none"};

  const insights = useMemo(()=>{
    if(totalDebt<=0) return [{icon:"✅",color:T.green,text:"No liabilities recorded. Add your debts here to see your true net worth and debt-to-income ratio."}];
    const list = [];
    // Debt-to-income
    if(debtToIncome>43) list.push({icon:"⚠️",color:T.red,  text:`Monthly debt payments are ${pct(debtToIncome)} of income — above the 43% threshold lenders consider high risk. Consider paying down the highest-interest debt first.`});
    else if(debtToIncome>28) list.push({icon:"📊",color:T.amber,text:`Debt payments at ${pct(debtToIncome)} of income. The 28% rule suggests keeping this below 28% for housing, 36% total. You have limited headroom.`});
    else list.push({icon:"✅",color:T.green,text:`Debt-to-income of ${pct(debtToIncome)} is within healthy range. This means lenders and advisors would typically view your debt load as manageable.`});
    // Highest interest
    const highest = active.reduce((mx,l)=>(!mx||l.interestRate>mx.interestRate)?l:mx, null);
    if(highest&&highest.interestRate>5) list.push({icon:"🔥",color:T.red,text:`${highest.name} at ${pct(highest.interestRate)} interest is your most expensive debt. Paying this down first (avalanche method) saves the most in total interest over time.`});
    // Net worth position
    if(netWorth<0) list.push({icon:"⚠️",color:T.red,text:`Net worth is currently ${fmtK(netWorth)} — total debts exceed total assets. This is common early in life (e.g. mortgages). Focus on growing assets and reducing high-interest debt.`});
    else list.push({icon:"💼",color:T.blue,text:`True net worth: ${fmtK(netWorth)} (${fmtK(totalAssets+openingBalance)} assets minus ${fmtK(totalDebt)} liabilities). Growing this number is the core goal of long-term financial planning.`});
    return list.slice(0,4);
  },[active, totalDebt, totalAssets, netWorth, debtToIncome, income, T, fmtK]);

  return (
    <div>
      {/* Summary KPIs */}
      <div className="fc-grid-3" style={{marginBottom:14}}>
        <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:14,padding:"16px 18px"}}>
          <div style={{fontSize:10,letterSpacing:1.5,textTransform:"uppercase",color:T.muted,marginBottom:7}}>Total Debt</div>
          <div style={{fontSize:26,fontFamily:"monospace",fontWeight:700,color:T.red}}>{fmtK(totalDebt)}</div>
          <div style={{fontSize:11,color:T.muted,marginTop:4}}>{totalPmts>0&&fmt(totalPmts)+"/mo payments"}</div>
        </div>
        <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:14,padding:"16px 18px"}}>
          <div style={{fontSize:10,letterSpacing:1.5,textTransform:"uppercase",color:T.muted,marginBottom:7}}>Net Worth</div>
          <div style={{fontSize:26,fontFamily:"monospace",fontWeight:700,color:netWorth>=0?T.green:T.red}}>{fmtK(netWorth)}</div>
          <div style={{fontSize:11,color:T.muted,marginTop:4}}>Assets − Liabilities</div>
        </div>
        <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:14,padding:"16px 18px"}}>
          <div style={{fontSize:10,letterSpacing:1.5,textTransform:"uppercase",color:T.muted,marginBottom:7}}>Debt-to-Income</div>
          <div style={{fontSize:26,fontFamily:"monospace",fontWeight:700,color:debtToIncome>43?T.red:debtToIncome>28?T.amber:T.green}}>{pct(debtToIncome)}</div>
          <div style={{fontSize:11,color:T.muted,marginTop:4}}>Monthly payments vs income</div>
        </div>
      </div>

      {/* Liability list */}
      <CollapsibleSection title="My Liabilities" icon="📋" accentColor={T.red} storeKey="lib-list" badge={fmtK(totalDebt)}>
        <div style={{padding:"10px 18px 6px"}}>
          {liabilities.length===0&&(
            <div style={{padding:"24px 0",textAlign:"center",color:T.muted,fontSize:12,fontFamily:"monospace"}}>
              No liabilities added yet. Tap + Add Liability below.
            </div>
          )}
          {liabilities.map(l=>{
            const catInfo = catMap[l.category]||{emoji:"📋",label:"Other"};
            const debtShare = totalDebt>0&&!l.excluded ? (l.balance/totalDebt)*100 : 0;
            const monthlyInterest = !l.excluded ? Math.round((Number(l.balance)||0)*(Number(l.interestRate)||0)/100/12) : 0;
            return (
              <div key={l.id} style={{marginBottom:16,opacity:l.excluded?0.35:1,transition:"opacity 0.2s"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,flexWrap:"wrap"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
                    <span style={{fontSize:18,flexShrink:0}}>{catInfo.emoji}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <InlineEdit value={l.name} onCommit={v=>upd(l.id,"name",v)}
                        style={{fontSize:13,color:T.text,fontFamily:"monospace",fontWeight:600}} />
                      <div style={{fontSize:10,color:T.muted,fontFamily:"monospace",marginTop:2}}>{catInfo.label}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0,flexWrap:"wrap"}}>
                    {!l.excluded&&<span style={{fontSize:10,color:T.muted,fontFamily:"monospace"}}>{pct(debtShare)}</span>}
                    <InlineEdit value={l.balance} type="number" onCommit={v=>upd(l.id,"balance",Math.max(0,v))}
                      style={{fontSize:14,color:T.red,fontFamily:"monospace",fontWeight:700,textAlign:"right",maxWidth:110}} />
                    {!l.excluded&&(
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{position:"relative",width:56,height:18,flexShrink:0}}>
                          <div style={{position:"absolute",top:"50%",transform:"translateY(-50%)",left:0,right:0,height:4,background:T.faint,borderRadius:2}} />
                          <div style={{position:"absolute",top:"50%",transform:"translateY(-50%)",left:0,height:4,width:Math.min(100,(Number(l.interestRate)||0)/20*100)+"%",background:T.red+"88",borderRadius:2}} />
                          <input type="range" min={0} max={20} step={0.1} value={Number(l.interestRate)||0}
                            onChange={e=>upd(l.id,"interestRate",Number(e.target.value))}
                            style={{position:"absolute",top:"50%",transform:"translateY(-50%)",width:"100%",opacity:0,cursor:"pointer",height:18,margin:0}} />
                        </div>
                        <input type="number" value={Number(l.interestRate)||0} min={0} max={30} step={0.1}
                          onChange={e=>upd(l.id,"interestRate",Math.min(30,Math.max(0,Number(e.target.value))))}
                          className="fc-no-spin"
                          style={{width:32,background:"transparent",border:"none",color:T.amber,fontFamily:"monospace",fontSize:11,fontWeight:700,outline:"none",textAlign:"right",padding:0}} />
                        <span style={{fontSize:10,color:T.muted,fontFamily:"monospace"}}>%</span>
                      </div>
                    )}
                    <button onClick={()=>tog(l.id)} style={{background:"transparent",border:"1px solid "+T.border,color:T.muted,cursor:"pointer",fontSize:10,padding:"3px 7px",borderRadius:4,fontFamily:"monospace"}}>{l.excluded?"on":"off"}</button>
                    {l.custom&&<button onClick={()=>del(l.id)} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:18,padding:"0 2px",lineHeight:1}}>×</button>}
                  </div>
                </div>
                {!l.excluded&&(
                  <div style={{marginTop:8,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                    <div style={{flex:1,position:"relative",height:4,background:T.faint,borderRadius:2,minWidth:80}}>
                      <div style={{position:"absolute",left:0,top:0,height:"100%",width:Math.min(100,debtShare)+"%",background:T.red+"66",borderRadius:2,transition:"width 0.25s"}} />
                    </div>
                    <span style={{fontSize:10,color:T.red,fontFamily:"monospace",flexShrink:0}}>
                      ~{fmt(monthlyInterest)}/mo interest · {l.monthlyPayment>0?fmt(l.monthlyPayment)+"/mo payment":"no payment set"}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {adding?(
          <div style={{padding:"14px 18px",borderTop:"1px solid "+T.border,background:T.surface}}>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:8,marginBottom:8}}>
              <input placeholder="Liability name (e.g. Halifax Mortgage)" value={nName} onChange={e=>setNName(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&add()} style={{...inputS}} />
              <select value={nCat} onChange={e=>setNCat(e.target.value)} style={{...inputS,background:T.faint}}>
                {LIABILITY_CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.emoji} {c.label}</option>)}
              </select>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
              <div>
                <div style={{fontSize:9,color:T.muted,fontFamily:"monospace",letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Outstanding Balance</div>
                <input type="number" placeholder="e.g. 250000" value={nBal} onChange={e=>setNBal(e.target.value)} style={{...inputS,width:"100%"}} />
              </div>
              <div>
                <div style={{fontSize:9,color:T.muted,fontFamily:"monospace",letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Interest Rate %</div>
                <input type="number" placeholder="e.g. 4.5" value={nRate} onChange={e=>setNRate(e.target.value)} style={{...inputS,width:"100%"}} className="fc-no-spin" />
              </div>
              <div>
                <div style={{fontSize:9,color:T.muted,fontFamily:"monospace",letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Monthly Payment</div>
                <input type="number" placeholder="e.g. 1200" value={nPmt} onChange={e=>setNPmt(e.target.value)} style={{...inputS,width:"100%"}} />
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={add} style={{background:T.red,border:"none",color:"#fff",borderRadius:6,padding:"8px 14px",cursor:"pointer",fontSize:12,fontFamily:"monospace",fontWeight:700}}>Add</button>
              <button onClick={()=>setAdding(false)} style={{background:T.faint,border:"none",color:T.muted,borderRadius:6,padding:"8px 10px",cursor:"pointer",fontSize:12,fontFamily:"monospace"}}>Cancel</button>
            </div>
          </div>
        ):(
          <div style={{padding:"10px 18px",borderTop:"1px solid "+T.border}}>
            <button onClick={()=>setAdding(true)} style={{background:T.red+"18",border:"1px solid "+T.red+"44",color:T.red,borderRadius:6,padding:"7px 16px",cursor:"pointer",fontSize:11,fontFamily:"monospace",fontWeight:700}}>+ Add Liability</button>
          </div>
        )}
      </CollapsibleSection>

      {/* Debt breakdown */}
      {active.length>0&&(
        <CollapsibleSection title="Breakdown by Type" icon="📊" accentColor={T.amber} storeKey="lib-breakdown" defaultOpen={false}>
          <div style={{padding:"16px 18px"}}>
            {LIABILITY_CATEGORIES.filter(c=>active.some(l=>l.category===c.value)).map(c=>{
              const catTotal=active.filter(l=>l.category===c.value).reduce((s,l)=>s+(Number(l.balance)||0),0);
              const barPct=totalDebt>0?(catTotal/totalDebt)*100:0;
              return (
                <div key={c.value} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5,alignItems:"center"}}>
                    <span style={{fontSize:12,color:T.text,fontFamily:"monospace"}}>{c.emoji} {c.label}</span>
                    <div style={{display:"flex",gap:10,alignItems:"center"}}>
                      <span style={{fontSize:11,color:T.muted,fontFamily:"monospace"}}>{pct(barPct)}</span>
                      <span style={{fontSize:13,color:T.red,fontFamily:"monospace",fontWeight:700}}>{fmtK(catTotal)}</span>
                    </div>
                  </div>
                  <div style={{height:6,background:T.faint,borderRadius:3}}>
                    <div style={{height:"100%",width:barPct+"%",background:T.red+"88",borderRadius:3,transition:"width 0.3s"}} />
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {/* Insights */}
      <CollapsibleSection title="Liability Insights" icon="💡" storeKey="lib-insights" accentColor={T.purple} defaultOpen={true}>
        <div style={{padding:"14px 18px 18px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {insights.map((ins,i)=>(
              <div key={i} style={{background:ins.color+"0d",border:"1px solid "+ins.color+"33",borderRadius:10,padding:"12px 14px",display:"flex",gap:10,alignItems:"flex-start"}}>
                <span style={{fontSize:16,flexShrink:0}}>{ins.icon}</span>
                <p style={{margin:0,fontSize:11,color:T.muted,lineHeight:1.7}}>{ins.text}</p>
              </div>
            ))}
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ASSETS TAB — manage real-world assets and see projected growth
// ══════════════════════════════════════════════════════════════════════════════
function AssetsTab({ assets, setAssets, fmt, fmtK, targetNetWorth, weightedReturn }) {
  const T = useTheme();
  const [adding, setAdding] = useState(false);
  const [nName, setNName]   = useState("");
  const [nCat,  setNCat]    = useState("stocks");
  const [nVal,  setNVal]    = useState("");
  const [nRet,  setNRet]    = useState("7");
  const [nNote, setNNote]   = useState("");

  const active   = useMemo(()=>assets.filter(a=>!a.excluded), [assets]);
  const total    = useMemo(()=>active.reduce((s,a)=>s+(Number(a.value)||0),0), [active]);
  const wAvgRet  = useMemo(()=>{
    if(total<=0) return 0;
    return active.reduce((s,a)=>s+(Number(a.value)||0)*(Number(a.annualReturn)||0),0)/total;
  }, [active, total]);

  const upd  = (id,k,v) => setAssets(p=>p.map(a=>a.id===id?{...a,[k]:v}:a));
  const tog  = id        => setAssets(p=>p.map(a=>a.id===id?{...a,excluded:!a.excluded}:a));
  const del  = id        => setAssets(p=>p.filter(a=>a.id!==id));
  const add  = () => {
    const v = parseFloat(nVal);
    const r = parseFloat(nRet);
    if(!nName.trim()||isNaN(v)||v<0) return;
    setAssets(p=>[...p,{id:uid(),name:nName.trim(),category:nCat,value:v,annualReturn:isNaN(r)?0:r,notes:nNote.trim(),excluded:false,custom:true}]);
    setNName(""); setNVal(""); setNRet("7"); setNNote(""); setAdding(false);
  };

  const inputS = {background:T.faint,border:"1px solid "+T.border,borderRadius:6,padding:"7px 10px",color:T.text,fontFamily:"monospace",fontSize:14,outline:"none"};
  const catMap = Object.fromEntries(ASSET_CATEGORIES.map(c=>[c.value,c]));

  // Category breakdown for donut-style allocation
  const byCategory = useMemo(()=>{
    const map = {};
    active.forEach(a=>{
      const cat = a.category||"other";
      map[cat] = (map[cat]||0)+(Number(a.value)||0);
    });
    return Object.entries(map).sort(([,a],[,b])=>b-a);
  },[active]);

  // Projected asset values at 5, 10, 20 years
  const projections = useMemo(()=>[5,10,20].map(y=>({
    y,
    total: active.reduce((s,a)=>{
      const r=(Number(a.annualReturn)||0)/100;
      return s+Math.round((Number(a.value)||0)*Math.pow(1+r,y));
    },0),
  })),[active]);

  // Asset insights — computed from actual data
  const insights = useMemo(()=>{
    const list = [];
    if(total<=0) return [];

    // Concentration risk
    const largest = active.reduce((mx,a)=>!mx||a.value>mx.value?a:mx, null);
    if(largest && total>0) {
      const conc = (largest.value/total)*100;
      if(conc>60) list.push({icon:"⚠️",color:T.red,text:`${largest.name} represents ${pct(conc)} of your total assets. High concentration increases risk — diversifying even 20% would meaningfully reduce exposure to a single asset or sector.`});
      else if(conc>40) list.push({icon:"📊",color:T.amber,text:`${largest.name} at ${pct(conc)} is your dominant asset. Worth monitoring — if this asset underperforms, it will disproportionately impact your net worth.`});
      else list.push({icon:"✅",color:T.green,text:`Your largest single asset (${largest.name}) is ${pct(conc)} of total — a reasonably balanced concentration. Diversification across ${active.length} assets reduces single-asset risk.`});
    }

    // Return rate quality
    if(wAvgRet < 3) list.push({icon:"💡",color:T.amber,text:`Your weighted asset return of ${pct(wAvgRet)} is low. Even shifting ${pct(20)} of lower-yield holdings toward higher-growth assets could meaningfully improve your long-term trajectory.`});
    else if(wAvgRet >= 7) list.push({icon:"🚀",color:T.green,text:`Weighted return of ${pct(wAvgRet)} is strong. At this rate, your ${fmtK(total)} in assets is projected to reach ${fmtK(projections[1]?.total||0)} in 10 years through compounding alone.`});
    else list.push({icon:"📈",color:T.blue,text:`Weighted return of ${pct(wAvgRet)} across your assets. In 10 years at this rate, your portfolio grows to approximately ${fmtK(projections[1]?.total||0)} — before any new contributions.`});

    // Property check
    const propVal = active.filter(a=>a.category==="property").reduce((s,a)=>s+(Number(a.value)||0),0);
    if(propVal>0) {
      const propPct=(propVal/total)*100;
      if(propPct>70) list.push({icon:"🏠",color:T.amber,text:`Property is ${pct(propPct)} of your net worth — illiquid and hard to rebalance. Make sure your liquid assets (cash, investments) are sufficient for short-term needs.`});
      else list.push({icon:"🏠",color:T.green,text:`Property at ${pct(propPct)} of your portfolio provides stability. Property typically appreciates 3–5% annually in the long run, though it's illiquid compared to financial assets.`});
    }

    // Target gap
    if(targetNetWorth>0) {
      const gap = targetNetWorth - total;
      if(gap>0) list.push({icon:"🎯",color:T.blue,text:`You are ${fmtK(gap)} away from your ${fmtK(targetNetWorth)} wealth target. Your current assets alone will reach this in approximately ${(Math.log(targetNetWorth/Math.max(total,1))/Math.log(1+wAvgRet/100)).toFixed(0)} years at ${pct(wAvgRet)}.`});
      else list.push({icon:"🎯",color:T.green,text:`Your current asset value of ${fmtK(total)} already exceeds your ${fmtK(targetNetWorth)} wealth target. You've reached the milestone — focus on protecting and sustaining it.`});
    }

    return list.slice(0,4);
  },[active, total, wAvgRet, projections, targetNetWorth, T, fmtK]);

  return (
    <div>
      {/* Summary stat row */}
      <div className="fc-grid-3" style={{marginBottom:14}}>
        <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:14,padding:"16px 18px"}}>
          <div style={{fontSize:10,letterSpacing:1.5,textTransform:"uppercase",color:T.muted,marginBottom:7}}>Total Asset Value</div>
          <div style={{fontSize:26,fontFamily:"monospace",fontWeight:700,color:T.green}}>{fmtK(total)}</div>
          <div style={{fontSize:11,color:T.muted,marginTop:4}}>{active.length} active asset{active.length!==1?"s":""}</div>
        </div>
        <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:14,padding:"16px 18px"}}>
          <div style={{fontSize:10,letterSpacing:1.5,textTransform:"uppercase",color:T.muted,marginBottom:7}}>Weighted Return</div>
          <div style={{fontSize:26,fontFamily:"monospace",fontWeight:700,color:T.blue}}>{pct(wAvgRet)}</div>
          <div style={{fontSize:11,color:T.muted,marginTop:4}}>Avg annual across portfolio</div>
        </div>
        <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:14,padding:"16px 18px"}}>
          <div style={{fontSize:10,letterSpacing:1.5,textTransform:"uppercase",color:T.muted,marginBottom:7}}>Projected 10yr</div>
          <div style={{fontSize:26,fontFamily:"monospace",fontWeight:700,color:T.purple}}>{fmtK(projections[1]?.total||0)}</div>
          <div style={{fontSize:11,color:T.muted,marginTop:4}}>At current return rates</div>
        </div>
      </div>

      {/* Asset list */}
      <CollapsibleSection title="My Assets" icon="💼" storeKey="ast-list" accentColor={T.green} badge={fmtK(total)}>
        <div style={{padding:"10px 18px 6px"}}>
          {assets.map((a,idx)=>{
            const catInfo = catMap[a.category]||{emoji:"📦",label:"Other"};
            const share   = total>0&&!a.excluded?(a.value/total)*100:0;
            const proj10  = !a.excluded?Math.round((Number(a.value)||0)*Math.pow(1+(Number(a.annualReturn)||0)/100,10)):0;
            return (
              <div key={a.id} style={{marginBottom:16,opacity:a.excluded?0.35:1,transition:"opacity 0.2s"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,flexWrap:"wrap"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
                    <span style={{fontSize:18,flexShrink:0}}>{catInfo.emoji}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <InlineEdit value={a.name} onCommit={v=>upd(a.id,"name",v)}
                        style={{fontSize:13,color:T.text,fontFamily:"monospace",fontWeight:600}} />
                      <div style={{fontSize:10,color:T.muted,fontFamily:"monospace",marginTop:2}}>{catInfo.label}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0,flexWrap:"wrap"}}>
                    {!a.excluded&&<span style={{fontSize:10,color:T.muted,fontFamily:"monospace"}}>{pct(share)}</span>}
                    <div style={{display:"flex",alignItems:"center",gap:2}}>
                      <InlineEdit value={a.value} type="number" onCommit={v=>upd(a.id,"value",Math.max(0,v))}
                        style={{fontSize:14,color:T.green,fontFamily:"monospace",fontWeight:700,textAlign:"right",maxWidth:110}} />
                    </div>
                    {!a.excluded&&(
                      <div title="Annual return — drag to adjust" style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{position:"relative",width:64,height:18,flexShrink:0}}>
                          <div style={{position:"absolute",top:"50%",transform:"translateY(-50%)",left:0,right:0,height:4,background:T.faint,borderRadius:2}} />
                          <div style={{position:"absolute",top:"50%",transform:"translateY(-50%)",left:0,height:4,width:Math.min(100,(Number(a.annualReturn)||0)/25*100)+"%",background:T.blue+"88",borderRadius:2}} />
                          <input type="range" min={0} max={25} step={0.5} value={Number(a.annualReturn)||0}
                            onChange={e=>upd(a.id,"annualReturn",Number(e.target.value))}
                            style={{position:"absolute",top:"50%",transform:"translateY(-50%)",width:"100%",opacity:0,cursor:"pointer",height:18,margin:0}} />
                        </div>
                        <input type="number" value={Number(a.annualReturn)||0} min={0} max={25} step={0.5}
                          onChange={e=>upd(a.id,"annualReturn",Math.min(25,Math.max(0,Number(e.target.value))))}
                          className="fc-no-spin"
                          style={{width:36,background:"transparent",border:"none",color:T.blue,fontFamily:"monospace",fontSize:11,fontWeight:700,outline:"none",textAlign:"right",padding:0}} />
                        <span style={{fontSize:10,color:T.muted,fontFamily:"monospace"}}>%</span>
                      </div>
                    )}
                    <button onClick={()=>tog(a.id)} style={{background:"transparent",border:"1px solid "+T.border,color:T.muted,cursor:"pointer",fontSize:10,padding:"3px 7px",borderRadius:4,fontFamily:"monospace"}}>{a.excluded?"on":"off"}</button>
                    {a.custom&&<button onClick={()=>del(a.id)} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:18,padding:"0 2px",lineHeight:1}}>×</button>}
                  </div>
                </div>
                {!a.excluded&&(
                  <div style={{marginTop:8,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                    <div style={{flex:1,position:"relative",height:4,background:T.faint,borderRadius:2,minWidth:80}}>
                      <div style={{position:"absolute",left:0,top:0,height:"100%",width:Math.min(100,share)+"%",background:T.green+"88",borderRadius:2,transition:"width 0.25s"}} />
                    </div>
                    <span style={{fontSize:10,color:T.muted,fontFamily:"monospace",flexShrink:0}}>{pct(share)} · </span>
                    <span style={{fontSize:10,color:T.green,fontFamily:"monospace",fontWeight:700,flexShrink:0}}>→ {fmtK(proj10)} in 10yr @ {pct(Number(a.annualReturn)||0)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Add form */}
        {adding?(
          <div style={{padding:"14px 18px",borderTop:"1px solid "+T.border,background:T.surface}}>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:8,marginBottom:8}}>
              <input placeholder="Asset name (e.g. London Flat)" value={nName} onChange={e=>setNName(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&add()} style={{...inputS}} />
              <select value={nCat} onChange={e=>setNCat(e.target.value)} style={{...inputS,background:T.faint}}>
                {ASSET_CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.emoji} {c.label}</option>)}
              </select>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              <input type="number" placeholder="Current value" value={nVal} onChange={e=>setNVal(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&add()} style={{...inputS,flex:2,minWidth:120}} />
              <div style={{display:"flex",alignItems:"center",gap:4,flex:1,minWidth:80}}>
                <input type="number" placeholder="Return %" value={nRet} onChange={e=>setNRet(e.target.value)}
                  style={{...inputS,flex:1}} />
                <span style={{fontSize:12,color:T.muted,fontFamily:"monospace"}}>%/yr</span>
              </div>
              <button onClick={add} style={{background:T.green,border:"none",color:T.bg,borderRadius:6,padding:"8px 14px",cursor:"pointer",fontSize:12,fontFamily:"monospace",fontWeight:700}}>Add</button>
              <button onClick={()=>setAdding(false)} style={{background:T.faint,border:"none",color:T.muted,borderRadius:6,padding:"8px 10px",cursor:"pointer",fontSize:12,fontFamily:"monospace"}}>Cancel</button>
            </div>
          </div>
        ):(
          <div style={{padding:"10px 18px",borderTop:"1px solid "+T.border}}>
            <button onClick={()=>setAdding(true)} style={{background:T.green+"18",border:"1px solid "+T.green+"44",color:T.green,borderRadius:6,padding:"7px 16px",cursor:"pointer",fontSize:11,fontFamily:"monospace",fontWeight:700}}>+ Add Asset</button>
          </div>
        )}
      </CollapsibleSection>

      {/* Category allocation */}
      {active.length>0&&(
        <CollapsibleSection title="Allocation by Category" icon="📊" accentColor={T.blue} storeKey="ast-alloc" defaultOpen={true}>
          <div style={{padding:"16px 18px"}}>
            {byCategory.map(([cat,val])=>{
              const c2=catMap[cat]||{emoji:"📦",label:"Other"};
              const barPct=total>0?(val/total)*100:0;
              const catColor=[T.green,T.blue,T.amber,T.purple,T.red,T.muted,T.green+"88",T.blue+"88"][ASSET_CATEGORIES.findIndex(x=>x.value===cat)%8]||T.muted;
              return (
                <div key={cat} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5,alignItems:"center"}}>
                    <span style={{fontSize:12,color:T.text,fontFamily:"monospace"}}>{c2.emoji} {c2.label}</span>
                    <div style={{display:"flex",gap:10,alignItems:"center"}}>
                      <span style={{fontSize:11,color:T.muted,fontFamily:"monospace"}}>{pct(barPct)}</span>
                      <span style={{fontSize:13,color:catColor,fontFamily:"monospace",fontWeight:700}}>{fmtK(val)}</span>
                    </div>
                  </div>
                  <div style={{height:6,background:T.faint,borderRadius:3}}>
                    <div style={{height:"100%",width:barPct+"%",background:catColor+"aa",borderRadius:3,transition:"width 0.3s"}} />
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {/* Growth projection table */}
      {active.length>0&&(
        <CollapsibleSection title="Growth Projections" icon="📈" accentColor={T.purple} storeKey="ast-growth" defaultOpen={false}>
          <div style={{overflowX:"auto",padding:"0"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:"monospace"}}>
              <thead>
                <tr style={{background:T.surface}}>
                  {["Asset","Current","5 Years","10 Years","20 Years","Return"].map(h=>(
                    <th key={h} style={{padding:"10px 14px",textAlign:h==="Asset"?"left":"right",color:T.muted,fontSize:10,letterSpacing:1.2,textTransform:"uppercase",borderBottom:"1px solid "+T.border,whiteSpace:"nowrap",fontWeight:600}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {active.map((a,i)=>{
                  const r=(Number(a.annualReturn)||0)/100;
                  const v=Number(a.value)||0;
                  return (
                    <tr key={a.id} style={{background:i%2===0?T.surface:"transparent",borderBottom:"1px solid "+T.border}}>
                      <td style={{padding:"10px 14px",color:T.text,fontWeight:600}}>{(catMap[a.category]||{emoji:"📦"}).emoji} {a.name}</td>
                      <td style={{padding:"10px 14px",textAlign:"right",color:T.muted}}>{fmtK(v)}</td>
                      <td style={{padding:"10px 14px",textAlign:"right",color:T.green}}>{fmtK(Math.round(v*Math.pow(1+r,5)))}</td>
                      <td style={{padding:"10px 14px",textAlign:"right",color:T.blue,fontWeight:700}}>{fmtK(Math.round(v*Math.pow(1+r,10)))}</td>
                      <td style={{padding:"10px 14px",textAlign:"right",color:T.purple,fontWeight:700}}>{fmtK(Math.round(v*Math.pow(1+r,20)))}</td>
                      <td style={{padding:"10px 14px",textAlign:"right",color:T.amber}}>{pct(Number(a.annualReturn)||0)}</td>
                    </tr>
                  );
                })}
                <tr style={{background:T.surface,borderTop:"2px solid "+T.border}}>
                  <td style={{padding:"10px 14px",color:T.text,fontWeight:700,fontFamily:"monospace",textTransform:"uppercase",fontSize:10,letterSpacing:1}}>Total</td>
                  <td style={{padding:"10px 14px",textAlign:"right",color:T.green,fontWeight:700}}>{fmtK(total)}</td>
                  {projections.map(p=>(
                    <td key={p.y} style={{padding:"10px 14px",textAlign:"right",color:T.green,fontWeight:700}}>{fmtK(p.total)}</td>
                  ))}
                  <td style={{padding:"10px 14px",textAlign:"right",color:T.amber,fontWeight:700}}>{pct(wAvgRet)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CollapsibleSection>
      )}

      {/* Asset insights */}
      {insights.length>0&&(
        <CollapsibleSection title="Asset Insights" icon="💡" storeKey="ast-insights" accentColor={T.purple} defaultOpen={true}>
          <div style={{padding:"14px 18px 18px"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {insights.map((ins,i)=>(
                <div key={i} style={{background:ins.color+"0d",border:"1px solid "+ins.color+"33",borderRadius:10,padding:"12px 14px",display:"flex",gap:10,alignItems:"flex-start"}}>
                  <span style={{fontSize:16,flexShrink:0}}>{ins.icon}</span>
                  <p style={{margin:0,fontSize:11,color:T.muted,lineHeight:1.7}}>{ins.text}</p>
                </div>
              ))}
            </div>
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// SAVINGS GROWTH CHART — extracted as proper component to allow useState
// ══════════════════════════════════════════════════════════════════════════════
function SavingsGrowthChart({ buckets, fmt, fmtK }) {
  const T = useTheme();
  const SAV_POINTS = [1,2,3,4,6,9,12,18,24,36,48,60];
  const allBuckets = buckets.filter(b=>!b.excluded);
  const [hiddenIds, setHiddenIds] = useState(()=>new Set());
  const activeBuckets = allBuckets.filter(b=>!hiddenIds.has(b.id));

  const chartData = useMemo(()=>SAV_POINTS.map(mo=>{
    const bucketVals = activeBuckets.map(b=>{
      const r = (Number(b.annualReturn)||7)/100;
      return Math.round(fv(b.amount, r, mo/12));
    });
    return { mo, buckets:bucketVals, total:bucketVals.reduce((s,v)=>s+v,0) };
  }),[activeBuckets]);

  const yMax2   = Math.max(...chartData.map(d=>d.total),1);
  const yTicks2 = useMemo(()=>niceYTicks(yMax2, 5),[yMax2]);
  const yRange2 = Math.max(yTicks2[yTicks2.length-1],1);
  const CHART_H2 = 180;
  const YAXIS_W2 = 52;
  const formatMo = mo=>mo<12?mo+"m":mo===12?"1yr":mo<24?(mo/12).toFixed(1)+"yr":(mo/12)+"yr";

  return (
              <CollapsibleSection title="Savings Growth by Bucket" icon="📈" storeKey="sav-chart" accentColor={T.green} defaultOpen={true}>
              <div style={{padding:"20px 22px"}}>
                <div style={{marginBottom:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:8}}>
                    <Lbl color={T.green}>Savings Growth by Bucket</Lbl>
                    <span style={{fontSize:10,color:T.muted,fontFamily:"monospace"}}>Cumulative total · hover for breakdown</span>
                  </div>
                  <div style={{display:"flex",gap:12,flexWrap:"wrap",paddingBottom:10,borderBottom:"1px solid "+T.border}}>
                    {allBuckets.map((b,i)=>{
                      const hidden = hiddenIds.has(b.id);
                      const c = b.color||SAV_COLORS[i%SAV_COLORS.length];
                      return (
                        <div key={b.id} onClick={()=>setHiddenIds(s=>{const n=new Set(s); n.has(b.id)?n.delete(b.id):n.add(b.id); return n;})}
                          title={hidden?"Click to show":"Click to hide"}
                          style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",opacity:hidden?0.35:1,transition:"opacity 0.2s",userSelect:"none"}}>
                          <div style={{width:10,height:10,borderRadius:2,background:hidden?T.muted:c,flexShrink:0,transition:"background 0.2s"}} />
                          <span style={{fontSize:10,color:hidden?T.muted:T.text,fontFamily:"monospace",fontWeight:hidden?400:500,transition:"all 0.2s"}}>{b.name}</span>
                          {hidden&&<span style={{fontSize:9,color:T.muted,fontFamily:"monospace"}}>(hidden)</span>}
                        </div>
                      );
                    })}
                    <span style={{fontSize:9,color:T.muted+"88",fontFamily:"monospace",alignSelf:"center"}}>click to toggle</span>
                  </div>
                </div>
                {/* Chart: Y-axis + bars — extra bottom padding for x-axis labels */}
                <div style={{paddingBottom:24}}>
                  <SavingsChart
                    chartData={chartData} activeBuckets={activeBuckets}
                    yTicks={yTicks2} yRange={yRange2} CHART_H={CHART_H2} YAXIS_W={YAXIS_W2}
                    formatMo={formatMo} fmt={fmt} fmtK={fmtK} />
                </div>
              </div>
              </CollapsibleSection>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SAVINGS CHART — stacked bar chart showing cumulative savings by bucket
// Similar visual language to the cashflow chart: Y-axis labels + stacked bars
// Each bucket is a different colour stack from the bottom.
// ══════════════════════════════════════════════════════════════════════════════
function SavingsChart({ chartData, activeBuckets, yTicks, yRange, CHART_H, YAXIS_W, formatMo, fmt, fmtK }) {
  const T=useTheme();
  const [hovIdx,setHovIdx]=useState(null);
  return (
    <div style={{display:"flex",gap:0}}>
      {/* Y-axis labels */}
      <div style={{width:YAXIS_W,flexShrink:0,position:"relative",height:CHART_H,marginRight:4}}>
        {yTicks.map(tick=>{
          const fracFromTop=1-(tick/yRange);
          return (
            <div key={tick} style={{position:"absolute",right:6,top:fracFromTop*CHART_H,transform:"translateY(-50%)",
              fontSize:9,color:T.muted+"aa",fontFamily:"monospace",whiteSpace:"nowrap",textAlign:"right"}}>
              {tick>=1000?fmtK(tick):fmt(tick)}
            </div>
          );
        })}
      </div>
      {/* Bar area */}
      <div style={{flex:1,position:"relative",height:CHART_H}}>
        {/* Gridlines */}
        {yTicks.map(tick=>{
          const fracFromTop=1-(tick/yRange);
          return (
            <div key={tick} style={{position:"absolute",left:0,right:0,top:fracFromTop*CHART_H,
              borderTop:"1px dashed "+T.faint,pointerEvents:"none"}} />
          );
        })}
        {/* Bars */}
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"flex-end",gap:3,paddingBottom:0}}>
          {chartData.map((d,idx)=>{
            const totalH = Math.max(2,(d.total/yRange)*CHART_H);
            const isHov  = hovIdx===idx;
            return (
              <div key={d.mo} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",
                position:"relative",height:CHART_H,cursor:"crosshair",minWidth:0}}
                onMouseEnter={()=>setHovIdx(idx)} onMouseLeave={()=>setHovIdx(null)}>
                {/* Hover tooltip */}
                {isHov&&(
                  <div style={{position:"absolute",bottom:"105%",
                    ...(idx>chartData.length*0.65?{right:"0%"}:{left:"50%",transform:"translateX(-50%)"}),
                    background:T.surface,border:"1px solid "+T.green+"66",borderRadius:10,
                    padding:"10px 14px",zIndex:20,whiteSpace:"nowrap",boxShadow:"0 6px 24px #00000066",pointerEvents:"none",minWidth:160}}>
                    <div style={{fontSize:11,color:T.muted,fontFamily:"monospace",marginBottom:4}}>{formatMo(d.mo)}</div>
                    <div style={{fontSize:16,color:T.green,fontFamily:"monospace",fontWeight:700,marginBottom:6}}>{fmtK(d.total)}</div>
                    {activeBuckets.map((b,i)=>(
                      <div key={b.id} style={{display:"grid",gridTemplateColumns:"auto auto",gap:"2px 10px",fontSize:10,fontFamily:"monospace",marginBottom:2}}>
                        <span style={{color:b.color||SAV_COLORS[i%SAV_COLORS.length]}}>{b.name}:</span>
                        <span style={{color:T.text,fontWeight:700}}>{fmtK(d.buckets[i]||0)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Stacked bar — each bucket is a layer */}
                <div style={{position:"absolute",bottom:0,width:"100%",height:totalH,display:"flex",
                  flexDirection:"column-reverse",borderRadius:"3px 3px 0 0",overflow:"hidden",
                  border:"1px solid "+(isHov?T.green:T.green+"44"),transition:"border-color 0.1s"}}>
                  {activeBuckets.map((b,i)=>{
                    const bucketH = Math.max(0,(d.buckets[i]||0)/yRange*CHART_H);
                    const c = b.color||SAV_COLORS[i%SAV_COLORS.length];
                    return (
                      <div key={b.id} style={{width:"100%",height:bucketH,
                        background:isHov?c+"cc":c+"88",flexShrink:0,transition:"background 0.1s"}} />
                    );
                  })}
                </div>
                {/* X-axis label */}
                <div style={{position:"absolute",bottom:-18,fontSize:8,color:isHov?T.text:T.muted+"99",
                  fontFamily:"monospace",whiteSpace:"nowrap",textAlign:"center",width:"200%",left:"-50%"}}>
                  {formatMo(d.mo)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
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
  const updR=(id,v)=>setBuckets(p=>p.map(b=>b.id===id?{...b,annualReturn:Math.min(30,Math.max(0,v))}:b));
  const tog=(id)=>setBuckets(p=>p.map(b=>b.id===id?{...b,excluded:!b.excluded}:b));
  const del=(id)=>setBuckets(p=>p.filter(b=>b.id!==id));
  const add=()=>{ const a=parseFloat(nAmt); if(!nName.trim()||isNaN(a)||a<=0)return; setBuckets(p=>[...p,{id:uid(),name:nName.trim(),amount:a,excluded:false,annualReturn:7.0,custom:true}]); setNName("");setNAmt("");setAdding(false); };
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
                  {!b.excluded&&(
                    <div title="Annual return %" style={{display:"flex",alignItems:"center",gap:2,background:T.faint,border:"1px solid "+T.border+"88",borderRadius:5,padding:"2px 6px"}}>
                      <InlineEdit value={b.annualReturn??7} type="number" onCommit={v=>updR(b.id,v)} style={{fontSize:10,color:T.blue,fontFamily:"monospace",fontWeight:700,textAlign:"right",maxWidth:30}} />
                      <span style={{fontSize:10,color:T.muted,fontFamily:"monospace"}}>%</span>
                    </div>
                  )}
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
function ProjChart({ monthlySavings, netBonus, includeBonus, intervalMode, fmtK, targetNetWorth, weightedReturn, initialAssets }) {
  const T=useTheme();
  const [hovIdx,setHovIdx]=useState(null);
  const mode=useMemo(()=>INTERVAL_MODES.find(m=>m.id===intervalMode)||INTERVAL_MODES[2],[intervalMode]);
  const data=useMemo(()=>mode.steps.map(y=>calcProjRow(y,monthlySavings,netBonus,includeBonus,weightedReturn,initialAssets||0)),[mode,monthlySavings,netBonus,includeBonus,weightedReturn,initialAssets]);
  const tgt=Number(targetNetWorth)||DEFAULT_TARGET_NW;
  const ceiling=useMemo(()=>niceMax(Math.max(...data.map(d=>d.total),tgt*1.1)),[data,tgt]);
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
        <Pill label={"Target "+fmtK(tgt)} color={T.amber} />
      </div>
      <div style={{display:"flex",gap:0}}>
        <div style={{display:"flex",flexDirection:"column-reverse",justifyContent:"space-between",width:48,flexShrink:0,height:CHART_H,paddingBottom:2}}>
          {[0,...grids].map((v,i)=><div key={i} style={{fontSize:8,color:T.muted+"99",fontFamily:"monospace",textAlign:"right",paddingRight:6,lineHeight:1}}>{fmtK(v)}</div>)}
        </div>
        <div style={{flex:1,position:"relative",height:CHART_H}}>
          {grids.map((v,i)=><div key={i} style={{position:"absolute",left:0,right:0,bottom:toPct(v),borderTop:"1px dashed "+T.faint,pointerEvents:"none"}} />)}
          {tgt<=ceiling&&(
            <div style={{position:"absolute",left:0,right:0,bottom:toPct(tgt),borderTop:"1px dashed "+T.amber+"88",pointerEvents:"none"}}>
              <span style={{position:"absolute",right:4,top:-13,fontSize:8,color:T.amber,fontFamily:"monospace",whiteSpace:"nowrap"}}>target {fmtK(tgt)}</span>
            </div>
          )}
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"flex-end",gap:isCompact?2:5,padding:"0 2px"}}>
            {data.map((d,idx)=>{
              const barH=toH(d.total),invH=toH(d.inv),hit=d.total>=tgt,hov=hovIdx===idx;
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
// CASHFLOW TAB — v10
// Features:
//   • Stacked bar chart: surplus (green) + one-off (amber) + remaining balance context
//   • Dynamic Y-axis with "nice" rounded intervals (e.g. $5k, $10k, $25k)
//   • Dynamic X-axis: intuitive intervals depending on view period
//   • Table view selector: 6m | 12m | 18m | 24m — scrollable for longer periods
//   • 4 live financial insights that recalculate on every number change
// ══════════════════════════════════════════════════════════════════════════════

// ── Helper: compute "nice" Y-axis tick values for any data range ────────────
// This takes the max value on the chart and works out round numbers to label.
// E.g. max=$38,000 → ticks at $0, $10k, $20k, $30k, $40k (5 steps of $10k)
function niceYTicks(maxVal, targetSteps=5) {
  if(maxVal<=0) return [0];
  // Find a "nice" step size — rounds to nearest 1, 2, 5, 10 × a power of 10
  const rawStep = maxVal / targetSteps;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const niceStep = [1,2,5,10].map(f=>f*mag).find(s=>s>=rawStep) || 10*mag;
  // Generate ticks from 0 up to slightly above maxVal
  const ticks = [];
  for(let v=0; v<=maxVal*1.05; v+=niceStep) ticks.push(Math.round(v));
  return ticks;
}

// ── Helper: decide which months to show on X-axis given the view period ─────
// Avoids over-cluttering: short views show every month, long views skip months
function xAxisLabels(rows, numMonths) {
  if(numMonths<=12)  return rows.map((_,i)=>i);           // every month
  if(numMonths<=18)  return rows.map((_,i)=>i).filter(i=>i%2===0);  // every 2nd
  if(numMonths<=24)  return rows.map((_,i)=>i).filter(i=>i%3===0);  // every quarter
  if(numMonths<=48)  return rows.map((_,i)=>i).filter(i=>i%6===0);  // every 6m
  return rows.map((_,i)=>i).filter(i=>i%12===0||i===rows.length-1); // every year
}

function CashflowTab({ cashflow, setCashflow, monthlyIncome, monthlyExpenses, monthlySavings, fmt, fmtK }) {
  const T=useTheme();
  const [addingOneOff,setAddingOneOff]=useState(null); // which month's one-off panel is open
  const [nLabel,setNLabel]=useState(""); const [nAmount,setNAmount]=useState("");
  const [hovBar,setHovBar]=useState(null);          // index of hovered bar
  const [cfView,setCfView]=useState("12m");         // chart period: 12m|18m|2y|4y|5y
  const [tableView,setTableView]=useState("12m");   // table period: 6m|12m|18m|24m

  const { months: savedMonths, openingBalance } = cashflow;

  // ── Extend the months array to cover 60 months (5 years) if needed ──────
  // The user's saved cashflow might only have 12 months. We auto-generate
  // additional blank months so the chart can show longer views without errors.
  const extendedMonths = useMemo(()=>{
    const current=[...savedMonths];
    while(current.length<60){
      const lastDate=new Date();
      lastDate.setMonth(lastDate.getMonth()+current.length);
      current.push({
        id:uid(),
        label:lastDate.toLocaleString("default",{month:"short"})+" "+lastDate.getFullYear(),
        oneOffs:[],
      });
    }
    return current;
  },[savedMonths]);

  // ── Chart view config — controls how many months the chart shows ─────────
  const viewConfig = {
    "12m":{months:12,label:"12 Months"},
    "18m":{months:18,label:"18 Months"},
    "2y": {months:24,label:"2 Years"},
    "4y": {months:48,label:"4 Years"},
    "5y": {months:60,label:"5 Years"},
  };
  // Table view config — separate from chart view so they're independently controlled
  const tableViewConfig = {
    "6m": {months:6,  label:"6 Months"},
    "12m":{months:12, label:"12 Months"},
    "18m":{months:18, label:"18 Months"},
    "24m":{months:24, label:"24 Months"},
  };

  const numMonths       = viewConfig[cfView]?.months || 12;
  const tableNumMonths  = tableViewConfig[tableView]?.months || 12;
  const visibleMonths   = extendedMonths.slice(0, numMonths);

  // ── Calculate running cashflow for each month ────────────────────────────
  // Each month: opening + (income - expenses - savings) - one-offs = closing
  const rows = useMemo(()=>{
    let opening = openingBalance;
    return visibleMonths.map(mo=>{
      const oneOffTotal = (mo.oneOffs||[]).reduce((s,o)=>s+o.amount,0);
      // "surplus" = recurring monthly net (income minus all regular outgoings)
      const surplus    = monthlyIncome - monthlyExpenses - monthlySavings;
      // "netMonth" = what actually moves the balance this month (surplus minus one-offs)
      const netMonth   = surplus - oneOffTotal;
      const closing    = opening + netMonth;
      const r = { ...mo, surplus, oneOffTotal, netMonth, openingBal:opening, closingBal:closing };
      opening = closing;
      return r;
    });
  },[visibleMonths,openingBalance,monthlyIncome,monthlyExpenses,monthlySavings]);

  // Rows shown in the detail table (driven by tableView selector, independently of chart)
  // We compute separately from rows to cover the right period
  const tableRows = useMemo(()=>{
    let opening = openingBalance;
    return extendedMonths.slice(0,tableNumMonths).map(mo=>{
      const oneOffTotal = (mo.oneOffs||[]).reduce((s,o)=>s+o.amount,0);
      const surplus    = monthlyIncome - monthlyExpenses - monthlySavings;
      const netMonth   = surplus - oneOffTotal;
      const closing    = opening + netMonth;
      const r = { ...mo, surplus, oneOffTotal, netMonth, openingBal:opening, closingBal:closing };
      opening = closing;
      return r;
    });
  },[extendedMonths,tableNumMonths,openingBalance,monthlyIncome,monthlyExpenses,monthlySavings]);

  // ── Summary stats from chart data ────────────────────────────────────────
  const summary = useMemo(()=>({
    totalOneOffs:  rows.reduce((s,r)=>s+r.oneOffTotal,0),
    finalBalance:  rows.length?rows[rows.length-1].closingBal:openingBalance,
    lowestBalance: Math.min(...rows.map(r=>r.closingBal), openingBalance),
  }),[rows,openingBalance]);

  // ── One-off expense CRUD handlers ────────────────────────────────────────
  const addOneOff=(monthId)=>{
    const a=parseFloat(nAmount);
    if(!nLabel.trim()||isNaN(a))return;
    setCashflow(cf=>({
      ...cf,
      months: extendedMonths.map(m=>m.id===monthId?{...m,oneOffs:[...(m.oneOffs||[]),{id:uid(),label:nLabel.trim(),amount:a}]}:m)
    }));
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

  // ── Dynamic financial insights — recalculate when any number changes ─────
  // These are plain-English observations about the cashflow picture
  const insights = useMemo(()=>{
    const surplus = monthlyIncome - monthlyExpenses - monthlySavings;
    const redMonths = rows.filter(r=>r.closingBal<0).length;
    const lowMonths = rows.filter(r=>r.closingBal>=0&&r.closingBal<monthlyExpenses*2).length;
    const highOneOffMonths = rows.filter(r=>r.oneOffTotal>monthlyExpenses*0.5).length;
    const peakBalance = Math.max(...rows.map(r=>r.closingBal),0);
    const savingsRate = monthlyIncome>0?Math.round(monthlySavings/monthlyIncome*100):0;
    const list=[];

    // Insight 1: deficit vs buffer health
    if(redMonths>0) list.push({ color:T.red, icon:"⚠️", text:`${redMonths} month${redMonths>1?"s":""} go into deficit over this period. Could you increase your opening balance now to cover them?` });
    else if(lowMonths>0) list.push({ color:T.amber, icon:"📉", text:`${lowMonths} month${lowMonths>1?"s":""} drop below 2× monthly expenses in buffer. That's a thin cushion — consider what could go wrong in those months.` });
    else list.push({ color:T.green, icon:"✅", text:`Your balance stays positive across all ${numMonths} months. You have a stable cash position — consider whether any excess could be invested.` });

    // Insight 2: surplus deployment opportunity
    if(surplus>0) list.push({ color:T.blue, icon:"💡", text:`You're accumulating ${fmt(surplus)}/month. Over ${numMonths} months that's ${fmtK(surplus*numMonths)} in additional liquidity — could any of this be deployed into investments sooner?` });
    else if(surplus===0) list.push({ color:T.amber, icon:"⚖️", text:`Your income exactly covers expenses and savings. Any unexpected cost will require dipping into reserves — a small buffer cushion would help.` });
    else list.push({ color:T.red, icon:"🔴", text:`Monthly shortfall of ${fmt(Math.abs(surplus))}. Your balance is declining each month. Review fixed costs first — they're the easiest permanent wins.` });

    // Insight 3: one-off cost planning
    if(highOneOffMonths>0) list.push({ color:T.amber, icon:"📅", text:`${highOneOffMonths} month${highOneOffMonths>1?"s have":"has"} unusually high one-off cash movements. Planning ahead for these months — or smoothing them quarterly — can prevent cash stress.` });
    else list.push({ color:T.purple, icon:"🗓️", text:`No months have unusually high one-off cash movements. Add anticipated expenses (holidays, car service, gifts) to specific months to keep your forecast accurate.` });

    // Insight 4: savings rate commentary
    if(savingsRate<15) list.push({ color:T.red, icon:"💰", text:`Your savings rate is ${savingsRate}% — below the 20% benchmark for building long-term wealth. A ${fmt(monthlyIncome*0.05)}/month increase would meaningfully improve your trajectory.` });
    else if(savingsRate>=30) list.push({ color:T.green, icon:"🚀", text:`Strong savings rate of ${savingsRate}%. At this pace your peak balance could reach ${fmtK(peakBalance)} within ${numMonths} months. Hover any bar to see exact monthly figures.` });
    else list.push({ color:T.blue, icon:"📈", text:`${savingsRate}% savings rate. Pushing to 30% would accelerate your wealth target by years — even ${fmt(Math.round(monthlyIncome*0.05))}/month more compounds meaningfully over 5 years.` });

    return list.slice(0,4);
  },[rows,monthlyIncome,monthlyExpenses,monthlySavings,numMonths,T,fmt,fmtK]);

  // ── Chart geometry calculations ──────────────────────────────────────────
  // Scale is based ONLY on closing balances so bars fill the chart meaningfully.
  // We deliberately exclude openingBalance from yMax — it would dominate the
  // scale and flatten all monthly bars into unreadable slivers.
  const maxBal  = Math.max(...rows.map(r=>r.closingBal), 0);
  const minBal  = Math.min(...rows.map(r=>r.closingBal), 0);
  // yFloor: the baseline of the chart. If all balances are positive and clustered,
  // we lower the baseline to give bars more visual height (80% of minimum balance).
  // If data goes negative the floor is 0 (or below).
  const allPositive = minBal >= 0;
  // Floor = 80% of minimum closing balance, snapped to a nice round number, min 0
  const rawFloor = allPositive ? Math.max(0, minBal * 0.8) : Math.min(minBal * 1.1, 0);
  // Top = max balance + 10% headroom
  const rawCeil  = maxBal > 0 ? maxBal * 1.12 : 1000;
  // yMax and yMin are the axis extents
  const yMax     = rawCeil;
  const yMin     = rawFloor;
  const ySpan    = Math.max(yMax - yMin, 1);

  const CHART_H = 260; // taller chart for better readability
  const YAXIS_W = 56;  // pixel width of Y-axis label area

  // Compute nice Y-axis ticks across the visible span
  const yTicks  = useMemo(()=>{
    const ticks = niceYTicks(yMax, 5);
    // Filter to only ticks within or near visible range
    return ticks.filter(t => t >= yMin - ySpan*0.05);
  },[yMax, yMin, ySpan]);
  const yRange  = Math.max(yTicks[yTicks.length-1] ?? yMax, yMax, 1);

  // Helper: convert a dollar value to a pixel Y position from the BOTTOM of the chart
  // (we use flex-end alignment so bottom=0 corresponds to yMin)
  const valToPx = (val) => Math.max(0, ((val - yMin) / ySpan) * CHART_H);

  // $0 line position from top of chart (only drawn if data goes negative)
  const zeroFromTop = CHART_H - valToPx(0);

  // X-axis: indices to actually label (not every bar for long views)
  const xLabelIdxs = useMemo(()=>new Set(xAxisLabels(rows, numMonths)),[rows, numMonths]);

  return (
    <div>
      {/* ── CASH RUNWAY — moved here from Overview ─────────────────────── */}
      {(()=>{
        const rm=monthlyExpenses>0?openingBalance/monthlyExpenses:0;
        const rt=monthlyExpenses*6;
        const rp=rt>0?Math.min(100,(openingBalance/rt)*100):0;
        const rc=rm>=6?T.green:rm>=3?T.amber:T.red;
        const surplus=monthlyIncome-monthlyExpenses-monthlySavings;
        const toTarget=rm<6&&surplus>0?Math.max(0,(rt-openingBalance)/surplus):null;
        return (
          <CollapsibleSection title="Cash Runway — Liquid Balance" icon="🛡️" storeKey="cf-runway" accentColor={rc} defaultOpen={true}
            badge={(isFinite(rm)?rm:0).toFixed(1)+" mo"}>
          <div style={{padding:"16px 20px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12,flexWrap:"wrap",gap:10}}>
              <div>
                <Lbl color={rc}>Cash Runway — Liquid Balance</Lbl>
                <div style={{fontSize:11,color:T.muted,marginTop:2}}>{fmt(monthlyExpenses)}/mo burn · 6-month target = {fmt(rt)}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:11,color:T.muted,letterSpacing:1.5,textTransform:"uppercase"}}>Balance</span>
                <input type="number" value={openingBalance}
                  onChange={e=>setCashflow(cf=>({...cf,openingBalance:Math.max(0,Number(e.target.value))}))}
                  style={{background:T.faint,border:"1px solid "+rc+"55",borderRadius:8,padding:"6px 12px",color:rc,fontFamily:"monospace",fontSize:15,fontWeight:700,outline:"none",width:130,textAlign:"right"}} />
              </div>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5,fontSize:10,color:T.muted,letterSpacing:1}}>
                <span>0</span><span style={{color:T.amber}}>3 mo — {fmt(monthlyExpenses*3)}</span><span style={{color:T.green}}>6 mo — {fmt(rt)}</span>
              </div>
              <div style={{position:"relative",height:10,background:T.faint,borderRadius:5}}>
                <div style={{position:"absolute",left:"50%",top:0,width:1,height:"100%",background:T.amber+"55"}} />
                <div style={{position:"absolute",left:0,top:0,height:"100%",width:rp+"%",background:"linear-gradient(90deg,"+rc+"88,"+rc+")",borderRadius:5,transition:"width 0.3s"}} />
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:5,fontSize:11}}>
                <span style={{color:rc,fontWeight:700}}>{(isFinite(rm)?rm:0).toFixed(1)} mo · {pct(rp)} of target</span>
                {openingBalance<rt&&toTarget!==null&&<span style={{color:T.muted}}>~{toTarget.toFixed(1)} mo to target at current surplus</span>}
                {openingBalance>=rt&&<span style={{color:T.green}}>✓ Fully funded</span>}
              </div>
            </div>
            <div className="fc-runway4">
              {[
                {l:"Balance",       v:fmt(openingBalance),c:rc},
                {l:"Monthly Burn",  v:fmt(monthlyExpenses),c:T.red},
                {l:"To 6mo Target", v:openingBalance>=rt?"✓ Funded":fmt(rt-openingBalance),c:openingBalance>=rt?T.green:T.amber},
                {l:"Months",        v:(isFinite(rm)?rm:0).toFixed(1)+" mo",c:rc},
              ].map(s=>(
                <div key={s.l} style={{background:T.surface,borderRadius:10,padding:"10px 14px"}}>
                  <div style={{fontSize:10,color:T.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>{s.l}</div>
                  <div style={{fontSize:14,color:s.c,fontFamily:"monospace",fontWeight:700}}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>
          </CollapsibleSection>
        );
      })()}

      {/* ── SUMMARY KPIS ──────────────────────────────────────────────────── */}
      <div className="fc-cashflow-grid" style={{marginBottom:16}}>
        <StatCard label="Opening Balance"  value={fmt(openingBalance)}         color={T.blue}  sub="Starting cash position" />
        <StatCard label="Total One-Offs"   value={fmt(summary.totalOneOffs)}   color={T.amber} sub="Non-recurring costs" />
        <StatCard label="Closing Balance"  value={fmt(summary.finalBalance)}   color={summary.finalBalance>=0?T.green:T.red} sub={"End of "+viewConfig[cfView]?.label} />
        <StatCard label="Lowest Balance"   value={fmt(summary.lowestBalance)}  color={summary.lowestBalance<0?T.red:summary.lowestBalance<monthlyExpenses*2?T.amber:T.green} sub="Cash floor — watch this" />
      </div>

      {/* ── CHART VIEW SELECTOR ──────────────────────────────────────────── */}
      {/* Controls how many months the bar chart shows */}
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:10,color:T.muted,letterSpacing:1,textTransform:"uppercase",marginRight:4}}>Chart view:</span>
        {Object.entries(viewConfig).map(([key,v])=>(
          <button key={key} onClick={()=>setCfView(key)}
            style={{background:cfView===key?T.green+"33":T.faint,border:"1px solid "+(cfView===key?T.green+"66":T.border),
              color:cfView===key?T.green:T.muted,borderRadius:8,padding:"5px 12px",cursor:"pointer",
              fontSize:11,fontFamily:"monospace",fontWeight:cfView===key?700:400,transition:"all 0.15s"}}>
            {v.label}
          </button>
        ))}
      </div>

      {/* ── OPENING BALANCE EDITOR ───────────────────────────────────────── */}
      <CollapsibleSection title="Opening Balance" icon="💵" storeKey="cf-balance" accentColor={T.blue} defaultOpen={false}
        badge={fmt(openingBalance)}>
        <div style={{padding:"14px 18px",display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:200}}>
            <div style={{fontSize:11,color:T.muted,marginBottom:4}}>Current liquid savings — bank balance, not investments or pension.</div>
            <div style={{fontSize:10,color:T.muted,lineHeight:1.6}}>Cash you can access immediately. Starting point for all cashflow projections.</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
            {cashflow.openingBalance<0&&<span style={{fontSize:11,color:T.red,fontFamily:"monospace"}}>⚠ low</span>}
            <InlineEdit value={openingBalance} type="number" onCommit={v=>setCashflow(cf=>({...cf,openingBalance:v}))}
              style={{fontSize:20,color:T.blue,fontFamily:"monospace",fontWeight:700,minWidth:80,textAlign:"right"}} />
            <span style={{fontSize:12,color:T.muted,fontFamily:"monospace"}}>opening balance</span>
          </div>
        </div>
      </CollapsibleSection>

      {/* ══ STACKED BAR CHART ════════════════════════════════════════════════
          Each bar has three layers stacked from the bottom:
            1. Surplus (green)  — the recurring monthly positive flow
            2. One-offs (amber) — non-recurring costs drawn on top of surplus
          The bar height represents the CLOSING BALANCE for that month.
          The Y-axis shows dynamic $ labels at rounded intervals.
          The X-axis shows month labels at intervals that depend on the view.
      ══════════════════════════════════════════════════════════════════════ */}
      <CollapsibleSection title={"Cashflow Chart — "+viewConfig[cfView]?.label} icon="📊" accentColor={T.green} defaultOpen={true}>
      <div style={{padding:"20px 22px"}}>
        {/* Chart header + legend */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
          <Lbl color={T.green}>Closing Balance — {viewConfig[cfView]?.label} View</Lbl>
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            {[
              {l:"Healthy",c:T.green},
              {l:"Watch zone",c:T.amber},
              {l:"Deficit",c:T.red},
              {l:"One-off Cash Movements",c:T.amber+"99"},
            ].map(x=>(
              <div key={x.l} style={{display:"flex",alignItems:"center",gap:4}}>
                <div style={{width:8,height:8,borderRadius:2,background:x.c}} />
                <span style={{fontSize:9,color:T.muted,fontFamily:"monospace"}}>{x.l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Chart area: Y-axis labels on the left, bars on the right */}
        <div style={{display:"flex",gap:0}}>

          {/* ── Y-AXIS LABELS ───────────────────────────────────────────── */}
          {/* Positioned absolutely relative to chart height */}
          <div style={{width:YAXIS_W,flexShrink:0,position:"relative",height:CHART_H,marginRight:4}}>
            {yTicks.map(tick=>{
              // Convert $ value to pixel position from TOP of chart
              const yPxFromBottom = valToPx(tick);
              const yPxFromTop = CHART_H - yPxFromBottom;
              // Only render if within chart bounds
              if(yPxFromTop < -8 || yPxFromTop > CHART_H + 8) return null;
              return (
                <div key={tick} style={{position:"absolute",right:6,top:yPxFromTop,transform:"translateY(-50%)",
                  fontSize:9,color:T.muted+"aa",fontFamily:"monospace",whiteSpace:"nowrap",textAlign:"right",pointerEvents:"none"}}>
                  {tick>=1000?fmtK(tick):tick===0?"$0":fmt(tick)}
                </div>
              );
            })}
            {/* $0 marker if data goes negative */}
            {minBal<0&&(
              <div style={{position:"absolute",right:6,top:zeroFromTop,transform:"translateY(-50%)",
                fontSize:9,color:T.muted,fontFamily:"monospace",fontWeight:700}}>$0</div>
            )}
          </div>

          {/* ── BAR CHART AREA ──────────────────────────────────────────── */}
          <div style={{flex:1,position:"relative",height:CHART_H}}>

            {/* Horizontal gridlines at each Y-axis tick */}
            {yTicks.map(tick=>{
              const yPxFromTop = CHART_H - valToPx(tick);
              if(yPxFromTop < 0 || yPxFromTop > CHART_H) return null;
              return (
                <div key={tick} style={{position:"absolute",left:0,right:0,top:yPxFromTop,
                  borderTop:"1px dashed "+T.faint,pointerEvents:"none",zIndex:0}} />
              );
            })}

            {/* $0 baseline — only shown if some bars dip negative */}
            {minBal<0&&(
              <div style={{position:"absolute",left:0,right:0,top:zeroFromTop,
                borderTop:"2px solid "+T.muted+"66",zIndex:2,pointerEvents:"none"}}>
                <span style={{position:"absolute",left:2,top:-9,fontSize:8,color:T.muted,fontFamily:"monospace"}}>0</span>
              </div>
            )}

            {/* Floor reference line — subtle line showing the chart baseline (not $0) */}
            {allPositive && yMin > 0 && (
              <div style={{position:"absolute",left:0,right:0,bottom:0,
                borderTop:"1px solid "+T.border,zIndex:1,pointerEvents:"none"}} />
            )}

            {/* The actual bars */}
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"flex-end",gap:numMonths>36?1:numMonths>18?2:3,paddingBottom:0}}>
              {rows.map((row,idx)=>{
                const isPos   = row.closingBal >= 0;
                const isLow   = row.closingBal >= 0 && row.closingBal < monthlyExpenses * 2;
                const barColor = !isPos ? T.red : isLow ? T.amber : T.green;
                const isHov   = hovBar === idx;

                // ── Bar height: closing balance mapped to pixel height ──────────
                // For positive balances: bar goes from yMin (chart floor) to closingBal
                // For negative: bar goes from $0 downward
                const barPx = isPos
                  ? Math.max(3, valToPx(row.closingBal))
                  : Math.max(3, valToPx(0) - valToPx(row.closingBal));

                // ── Monthly movement cap ─────────────────────────────────────
                // A small colored stripe at the top of the bar shows direction of
                // monthly net movement (growing = green cap, shrinking = amber/red cap)
                const netMovement = row.netMonth; // positive = balance grew this month
                const capHeight = Math.min(12, Math.max(3, Math.abs(netMovement) / Math.max(ySpan, 1) * CHART_H));
                const capColor = netMovement >= 0
                  ? (isLow ? T.amber : T.green) + "cc"
                  : T.red + "aa";

                // ── One-off stripe ───────────────────────────────────────────
                // If there are one-offs this month, show a subtle amber band
                const hasOneOffs = row.oneOffTotal > 0;
                const oneOffPx = hasOneOffs
                  ? Math.min(barPx * 0.3, Math.max(4, row.oneOffTotal / ySpan * CHART_H))
                  : 0;

                return (
                  <div key={row.id} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",minWidth:0,
                    position:"relative",height:CHART_H,cursor:"crosshair",zIndex:1}}
                    onMouseEnter={()=>setHovBar(idx)} onMouseLeave={()=>setHovBar(null)}>

                    {/* ── Hover tooltip ────────────────────────────────── */}
                    {isHov&&(
                      <div style={{position:"absolute",bottom:"105%",
                        ...(idx > rows.length * 0.65 ? {right:"0%"} : {left:"50%",transform:"translateX(-50%)"}),
                        background:T.surface,border:"1px solid "+barColor+"66",borderRadius:10,
                        padding:"10px 14px",zIndex:20,whiteSpace:"nowrap",boxShadow:"0 6px 24px #00000066",
                        pointerEvents:"none",minWidth:170}}>
                        <div style={{fontSize:11,color:T.muted,fontFamily:"monospace",marginBottom:4}}>{row.label}</div>
                        <div style={{fontSize:16,color:barColor,fontFamily:"monospace",fontWeight:700,marginBottom:6}}>{fmt(row.closingBal)}</div>
                        <div style={{display:"grid",gridTemplateColumns:"auto auto",gap:"3px 10px",fontSize:10,fontFamily:"monospace"}}>
                          <span style={{color:T.muted}}>Recurring surplus:</span>
                          <span style={{color:row.surplus>=0?T.green:T.red,fontWeight:700}}>{fmt(row.surplus)}</span>
                          <span style={{color:T.muted}}>One-off Cash Movements:</span>
                          <span style={{color:row.oneOffTotal>0?T.amber:T.muted}}>{row.oneOffTotal>0?"-"+fmt(row.oneOffTotal):"—"}</span>
                          <span style={{color:T.muted}}>Net movement:</span>
                          <span style={{color:row.netMonth>=0?T.green:T.red,fontWeight:700}}>{row.netMonth>=0?"+":""}{fmt(row.netMonth)}</span>
                          <span style={{color:T.muted}}>Opening balance:</span>
                          <span style={{color:T.text}}>{fmt(row.openingBal)}</span>
                        </div>
                        {(row.oneOffs||[]).length>0&&(
                          <div style={{marginTop:6,paddingTop:6,borderTop:"1px solid "+T.border+"66"}}>
                            {(row.oneOffs||[]).map(o=>(
                              <div key={o.id} style={{fontSize:9,color:T.amber,fontFamily:"monospace"}}>• {o.label}: {fmt(o.amount)}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── The bar itself ───────────────────────────────── */}
                    {isPos ? (
                      <div style={{
                        position:"absolute",bottom:0,width:numMonths<=12?"72%":numMonths<=24?"80%":"90%",
                        height:barPx,
                        borderRadius:"3px 3px 0 0",
                        overflow:"hidden",
                        border:"1px solid "+(isHov ? barColor+"99" : barColor+"33"),
                        transition:"all 0.15s",
                        display:"flex",flexDirection:"column-reverse",
                      }}>
                        {/* Main body — solid fill proportional to closing balance */}
                        <div style={{
                          flex:1,
                          background: isHov ? barColor+"44" : barColor+"22",
                          transition:"background 0.15s",
                        }} />
                        {/* One-off stripe — amber band if there are one-offs this month */}
                        {hasOneOffs && (
                          <div style={{
                            width:"100%",height:Math.max(3, oneOffPx),flexShrink:0,
                            background: isHov ? T.amber+"bb" : T.amber+"77",
                          }} />
                        )}
                        {/* Net movement cap — colored stripe at top indicating monthly direction */}
                        <div style={{
                          width:"100%",height:Math.max(3, capHeight),flexShrink:0,
                          background:capColor,
                        }} />
                      </div>
                    ) : (
                      // Negative balance: red bar hanging down from $0 line
                      <div style={{
                        position:"absolute",
                        top: zeroFromTop,
                        width:numMonths<=12?"72%":numMonths<=24?"80%":"90%",
                        height:Math.max(3, barPx),
                        background: isHov ? T.red+"88" : T.red+"44",
                        border:"1px solid "+T.red+(isHov?"cc":"44"),
                        borderRadius:"0 0 3px 3px",
                      }} />
                    )}

                    {/* ── X-axis label ──────────────────────────────────── */}
                    {xLabelIdxs.has(idx)&&(
                      <div style={{
                        position:"absolute",
                        bottom: numMonths > 12 ? -14 : -20,
                        fontSize: numMonths > 36 ? 7 : numMonths > 18 ? 8 : 9,
                        color: isHov ? T.text : T.muted+"99",
                        fontFamily:"monospace",
                        whiteSpace:"nowrap",
                        textAlign:"center",
                        width:"200%",
                        left:"-50%",
                        overflow:"visible",
                        pointerEvents:"none",
                      }}>
                        {numMonths > 24
                          ? (row.label.split(" ")[0]||"").slice(0,3) + " " + ((row.label.split(" ")[1]||"").slice(2))
                          : (row.label.split(" ")[0]||"").slice(0,3)
                        }
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Extra bottom padding for X-axis labels */}
        <div style={{height:numMonths>12?18:26}} />

        {/* Baseline note — only when chart has a raised floor */}
        {allPositive && yMin > 0 && (
          <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}>
            <div style={{width:16,height:1,background:T.border}} />
            <span style={{fontSize:9,color:T.muted,fontFamily:"monospace"}}>
              Chart floor: {fmtK(yMin)} · bars show balance above this level
            </span>
          </div>
        )}

        <div style={{fontSize:10,color:T.muted,textAlign:"center",marginTop:6}}>
          Hover any bar for a full breakdown · Click a month row below to add one-off cash movements
        </div>
      </div>
      </CollapsibleSection>

      {/* ── CASHFLOW INSIGHTS ─────────────────────────────────────────────── */}
      <CollapsibleSection title={"Cashflow Insights — "+viewConfig[cfView]?.label} icon="💡" accentColor={T.purple} defaultOpen={true}>
        <div style={{padding:"14px 18px 18px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {insights.map((ins,i)=>(
              <div key={i} style={{background:ins.color+"0d",border:"1px solid "+ins.color+"33",borderRadius:10,padding:"12px 14px",display:"flex",gap:10,alignItems:"flex-start"}}>
                <span style={{fontSize:16,flexShrink:0}}>{ins.icon}</span>
                <p style={{margin:0,fontSize:11,color:T.muted,lineHeight:1.7}}>{ins.text}</p>
              </div>
            ))}
          </div>
        </div>
      </CollapsibleSection>

      {/* ══ MONTH-BY-MONTH DETAIL TABLE ═══════════════════════════════════════ */}
      <CollapsibleSection title="Month-by-Month Detail" icon="📅" storeKey="cf-table" accentColor={T.blue} defaultOpen={false}>
        <div style={{borderBottom:"1px solid "+T.border,padding:"10px 18px",display:"flex",gap:4,alignItems:"center",background:T.surface}}>
          <span style={{fontSize:9,color:T.muted,letterSpacing:1,textTransform:"uppercase",marginRight:6}}>Show:</span>
          {Object.entries(tableViewConfig).map(([key,v])=>(
            <button key={key} onClick={()=>setTableView(key)}
              style={{background:tableView===key?T.blue+"33":T.faint,border:"1px solid "+(tableView===key?T.blue+"66":T.border),
                color:tableView===key?T.blue:T.muted,borderRadius:6,padding:"4px 9px",cursor:"pointer",
                fontSize:10,fontFamily:"monospace",fontWeight:tableView===key?700:400,transition:"all 0.15s"}}>
              {v.label}
            </button>
          ))}
        </div>
        {/* The table container is scrollable vertically for > 12 months */}
        <div style={{overflowX:"auto",overflowY:"auto",maxHeight:tableNumMonths>12?"520px":undefined}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:480}}>
            <thead style={{position:tableNumMonths>12?"sticky":undefined,top:0,zIndex:2,background:T.surface}}>
              <tr style={{background:T.surface}}>
                {["Month","Surplus","One-offs","Net Move","Opening","Closing"].map(h=>(
                  <th key={h} style={{padding:"10px 12px",textAlign:"right",color:T.muted,fontSize:10,
                    letterSpacing:1.2,textTransform:"uppercase",borderBottom:"1px solid "+T.border,
                    whiteSpace:"nowrap",fontFamily:"monospace",fontWeight:600}}>
                    {h==="Month"?<span style={{textAlign:"left",display:"block"}}>{h}</span>:h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row,idx)=>{
                const pos    = row.closingBal>=0;
                const lowBal = row.closingBal<monthlyExpenses;
                const rowBg  = idx%2===0?T.surface:"transparent";
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
                        {row.oneOffTotal!==0?(row.oneOffTotal<0?"+":"-")+fmt(Math.abs(row.oneOffTotal)):"—"}
                      </td>
                      <td style={{padding:"10px 12px",textAlign:"right",color:row.netMonth>=0?T.green:T.red,fontWeight:700}}>{row.netMonth>=0?"+":""}{fmt(row.netMonth)}</td>
                      <td style={{padding:"10px 12px",textAlign:"right",color:T.muted}}>{fmt(row.openingBal)}</td>
                      <td style={{padding:"10px 12px",textAlign:"right",color:pos?(lowBal?T.amber:T.green):T.red,fontWeight:700}}>
                        {fmt(row.closingBal)}{!pos?" ⚠":""}
                      </td>
                    </tr>
                    {/* Expandable one-off panel for the clicked row */}
                    {addingOneOff===row.id&&(
                      <tr style={{background:T.faint}}>
                        <td colSpan={6} style={{padding:"0"}}>
                          <div style={{padding:"14px 18px",borderTop:"1px solid "+T.border,borderBottom:"1px solid "+T.border}}>
                            <div style={{fontSize:11,color:T.amber,fontFamily:"monospace",fontWeight:700,marginBottom:10,letterSpacing:1.2,textTransform:"uppercase"}}>One-off Cash Movements — {row.label}</div>
                            {(row.oneOffs||[]).length===0&&(
                              <div style={{fontSize:11,color:T.muted,marginBottom:10}}>No one-off cash movements this month. Add one below.</div>
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
                            {/* Add a new one-off expense */}
                            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginTop:8,paddingTop:10,borderTop:"1px solid "+T.border}}>
                              <input placeholder="Expense label (e.g. Holiday, Car service)" value={nLabel} onChange={e=>setNLabel(e.target.value)}
                                onKeyDown={e=>e.key==="Enter"&&addOneOff(row.id)}
                                style={{...inputS,flex:1,minWidth:180}} />
                              <input type="number" placeholder="Amount (negative = income)" value={nAmount} onChange={e=>setNAmount(e.target.value)}
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
            {/* Table footer: totals row for the selected period */}
            <tfoot>
              <tr style={{background:T.surface,borderTop:"2px solid "+T.border}}>
                <td style={{padding:"12px 12px",color:T.text,fontWeight:700,fontFamily:"monospace",letterSpacing:1.2,textTransform:"uppercase",fontSize:10}}>{tableViewConfig[tableView]?.label} Total</td>
                <td style={{padding:"12px",textAlign:"right",color:T.green,fontWeight:700}}>{fmt(tableRows.reduce((s,r)=>s+r.surplus,0))}</td>
                <td style={{padding:"12px",textAlign:"right",color:T.amber,fontWeight:700}}>{tableRows.reduce((s,r)=>s+r.oneOffTotal,0)>0?"-"+fmt(tableRows.reduce((s,r)=>s+r.oneOffTotal,0)):"—"}</td>
                <td style={{padding:"12px",textAlign:"right",color:T.green,fontWeight:700}}>{fmt(tableRows.reduce((s,r)=>s+r.netMonth,0))}</td>
                <td style={{padding:"12px",textAlign:"right",color:T.muted}}>{fmt(openingBalance)}</td>
                <td style={{padding:"12px",textAlign:"right",color:(tableRows[tableRows.length-1]?.closingBal||openingBalance)>=0?T.green:T.red,fontWeight:700,fontSize:14}}>{fmt(tableRows[tableRows.length-1]?.closingBal||openingBalance)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CollapsibleSection>

      {/* Tips — condensed, always visible */}
      <div style={{padding:"10px 18px",fontSize:10,color:T.muted,lineHeight:1.8,background:T.surface,borderRadius:12,border:"1px solid "+T.border}}>
        <span style={{color:T.amber,fontWeight:700}}>💡 </span>
        Hover bars for breakdown · Click month rows to add one-offs · Extend view from 12m to 5yr with the chart controls above.
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
    {icon:"🌍",title:"Multi-Country Tax Engine",      desc:"Accurate net income for US, UK, Canada, Australia, Germany & Nigeria — 2024/25 rates."},
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
          {IS_DEMO&&<span style={{fontSize:10,color:T.amber,background:T.amber+"22",padding:"3px 8px",borderRadius:8,fontFamily:"monospace"}}>DEMO</span>}
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
        <div style={{marginTop:22,fontSize:11,color:T.muted,letterSpacing:2,textTransform:"uppercase"}}>🇺🇸 US · 🇬🇧 UK · 🇨🇦 Canada · 🇦🇺 Australia · 🇩🇪 Germany · 🇳🇬 Nigeria</div>
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
      if(mode==="signup"&&!IS_DEMO&&!user?.confirmed_at&&!user?.email_confirmed_at){
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
    if(IS_DEMO) await onAuthSuccess();
    setLoading(false);
  };
  // Apple & Microsoft OAuth — commented out pending provider setup
  // const handleApple=async()=>{
  //   setLoading(true);setError("");
  //   if(!IS_CONFIGURED){ await onAuthSuccess(); setLoading(false); return; }
  //   try{ const sb=await getSb(); const{error:e}=await sb.auth.signInWithOAuth({provider:"apple",options:{redirectTo:window.location.origin}}); if(e)throw e; }
  //   catch(e){ setError(e?.message||"Apple sign-in failed."); setLoading(false); }
  // };
  // const handleAzure=async()=>{
  //   setLoading(true);setError("");
  //   if(!IS_CONFIGURED){ await onAuthSuccess(); setLoading(false); return; }
  //   try{ const sb=await getSb(); const{error:e}=await sb.auth.signInWithOAuth({provider:"azure",options:{redirectTo:window.location.origin,scopes:"email profile openid"}}); if(e)throw e; }
  //   catch(e){ setError(e?.message||"Microsoft sign-in failed."); setLoading(false); }
  // };

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
          {IS_DEMO&&<div style={{marginTop:10,fontSize:11,color:T.amber,background:T.amber+"18",padding:"6px 14px",borderRadius:8,fontFamily:"monospace",display:"inline-block"}}>Demo mode — auto logged in</div>}
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
                {/* Apple & Microsoft buttons commented out — providers not yet configured
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <button onClick={handleApple} disabled={loading}
                    style={{background:T.surface,border:"1px solid "+T.border,color:T.text,borderRadius:10,padding:"11px",cursor:loading?"not-allowed":"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:loading?0.7:1}}>
                    Apple
                  </button>
                  <button onClick={handleAzure} disabled={loading}
                    style={{background:T.surface,border:"1px solid "+T.border,color:T.text,borderRadius:10,padding:"11px",cursor:loading?"not-allowed":"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:loading?0.7:1}}>
                    Microsoft
                  </button>
                </div>
                */}
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
        {!IS_DEMO&&(
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
    const dashboard={inclBonus:false,annualBonus:0,customIncome:[],fixedItems:DEFAULT_FIXED(),varItems:DEFAULT_VAR(),savBuckets:DEFAULT_SAV(),assets:DEFAULT_ASSETS(),liabilities:DEFAULT_LIABILITIES(),projInterval:"1y",cashflow:DEFAULT_CASHFLOW(),targetNetWorth:DEFAULT_TARGET_NW,studentLoan:{enabled:false,plan:"plan2",postgrad:false}};
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

// ══════════════════════════════════════════════════════════════════
// HOW-TO GUIDE — v9: bottom panel, spotlight above, animated demos
// ══════════════════════════════════════════════════════════════════
function HowToGuide({ onClose }) {
  const T = useTheme();
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [animFrame, setAnimFrame] = useState(0);

  useEffect(() => { const t = setTimeout(() => setVisible(true), 30); return () => clearTimeout(t); }, []);

  // Cycle animation frames for demo illustrations
  useEffect(() => {
    const interval = setInterval(() => setAnimFrame(f => f + 1), 1200);
    return () => clearInterval(interval);
  }, [step]);

  // Animated demo illustrations per step
  const DemoIllustration = ({ stepId, accent, frame }) => {
    const demos = {
      slider: () => {
        const pos = [30, 55, 80, 55, 30][frame % 5];
        return (
          <div style={{padding:"14px 18px",background:T.surface+"cc",borderRadius:12,border:"1px solid "+accent+"33",marginTop:10}}>
            <div style={{fontSize:10,color:T.muted,marginBottom:8,letterSpacing:1}}>GROSS ANNUAL SALARY</div>
            <div style={{fontSize:20,color:accent,fontFamily:"monospace",fontWeight:700,marginBottom:10}}>
              ${[85,110,150,110,85][frame%5]}k
            </div>
            <div style={{position:"relative",height:6,background:T.faint,borderRadius:3,marginBottom:4}}>
              <div style={{position:"absolute",left:0,top:0,height:"100%",width:pos+"%",background:accent+"88",borderRadius:3,transition:"width 0.6s ease"}} />
              <div style={{position:"absolute",top:"50%",transform:"translateY(-50%)",left:"calc("+pos+"% - 7px)",width:14,height:14,borderRadius:"50%",background:accent,border:"2px solid "+T.bg,transition:"left 0.6s ease",boxShadow:"0 0 8px "+accent+"88"}} />
            </div>
            <div style={{fontSize:10,color:T.muted,marginTop:8}}>→ Net take-home: <span style={{color:accent,fontFamily:"monospace"}}>${[55,72,98,72,55][frame%5]}k/yr</span></div>
          </div>
        );
      },
      toggle: () => {
        const on = frame % 3 !== 0;
        return (
          <div style={{padding:"14px 18px",background:T.surface+"cc",borderRadius:12,border:"1px solid "+accent+"33",marginTop:10}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{position:"relative",width:36,height:20,borderRadius:10,background:on?accent:T.muted+"44",transition:"background 0.4s"}}>
                <div style={{position:"absolute",top:3,left:on?19:3,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left 0.4s",boxShadow:on?"0 0 6px "+accent+"88":"none"}} />
              </div>
              <div>
                <div style={{fontSize:12,color:T.text,fontFamily:"monospace",fontWeight:700}}>Include Bonus Income</div>
                <div style={{fontSize:10,color:T.muted,marginTop:2}}>{on ? "Bonus included in projections" : "Conservative baseline view"}</div>
              </div>
            </div>
            <div style={{marginTop:10,fontSize:11,color:T.muted,padding:"8px 10px",background:T.faint,borderRadius:8}}>
              Monthly income: <span style={{color:accent,fontFamily:"monospace",fontWeight:700}}>${on?"9,833":"8,333"}/mo</span>
            </div>
          </div>
        );
      },
      tabs: () => {
        const tabs = ["Overview","Cashflow","Income","Expenses","Savings"];
        const active = tabs[frame % tabs.length];
        return (
          <div style={{padding:"14px 18px",background:T.surface+"cc",borderRadius:12,border:"1px solid "+accent+"33",marginTop:10}}>
            <div style={{fontSize:10,color:T.muted,marginBottom:10,letterSpacing:1}}>TAB NAVIGATION</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {tabs.map(t => (
                <div key={t} style={{padding:"5px 10px",borderRadius:6,fontSize:10,fontFamily:"monospace",
                  background:t===active?accent+"33":T.faint,
                  border:"1px solid "+(t===active?accent+"66":T.border),
                  color:t===active?accent:T.muted,
                  fontWeight:t===active?700:400,
                  transition:"all 0.4s",cursor:"pointer"}}>
                  {t}
                </div>
              ))}
            </div>
            <div style={{marginTop:10,fontSize:11,color:T.muted}}>
              Viewing: <span style={{color:accent,fontFamily:"monospace",fontWeight:700}}>{active}</span>
            </div>
          </div>
        );
      },
      expense: () => {
        const items = [
          {name:"Rent / Mortgage",amt:2000,color:"#f87171"},
          {name:"Groceries",      amt:frame%4===0?280:frame%4===1?320:frame%4===2?450:380, color:"#fb923c"},
          {name:"Dining Out",     amt:300, color:"#fbbf24"},
        ];
        const editing = frame % 3 === 1 ? 1 : null;
        return (
          <div style={{padding:"14px 18px",background:T.surface+"cc",borderRadius:12,border:"1px solid "+accent+"33",marginTop:10}}>
            <div style={{fontSize:10,color:T.muted,marginBottom:10,letterSpacing:1}}>EXPENSES — click to edit</div>
            {items.map((item,i) => (
              <div key={item.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid "+T.faint}}>
                <span style={{fontSize:11,color:T.text,fontFamily:"monospace"}}>{item.name}</span>
                {editing===i ? (
                  <span style={{fontSize:12,color:item.color,fontFamily:"monospace",fontWeight:700,background:item.color+"22",border:"1px solid "+item.color,borderRadius:4,padding:"2px 6px"}}>|{item.amt}|</span>
                ) : (
                  <span style={{fontSize:12,color:item.color,fontFamily:"monospace",fontWeight:700,borderBottom:"1px dotted "+T.muted+"44",cursor:"pointer"}}>${item.amt}</span>
                )}
              </div>
            ))}
            <div style={{marginTop:8,fontSize:10,color:T.muted}}>Tap any amount to edit inline ✏️</div>
          </div>
        );
      },
      cashflow: () => {
        const months = ["Jan","Feb","Mar","Apr","May"];
        const balances = [12500, 14200, 11800, 16100, 18400];
        const highlight = frame % months.length;
        return (
          <div style={{padding:"14px 18px",background:T.surface+"cc",borderRadius:12,border:"1px solid "+accent+"33",marginTop:10}}>
            <div style={{fontSize:10,color:T.muted,marginBottom:10,letterSpacing:1}}>CASHFLOW — closing balance</div>
            <div style={{display:"flex",alignItems:"flex-end",gap:4,height:50}}>
              {balances.map((b,i) => {
                const h = (b / 20000) * 50;
                const isHl = i === highlight;
                return (
                  <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                    <div style={{width:"100%",height:h,background:isHl?accent:accent+"44",borderRadius:"2px 2px 0 0",transition:"background 0.4s"}} />
                    <div style={{fontSize:8,color:isHl?T.text:T.muted,fontFamily:"monospace"}}>{months[i]}</div>
                  </div>
                );
              })}
            </div>
            <div style={{marginTop:8,fontSize:10,color:accent,fontFamily:"monospace",fontWeight:700}}>
              {months[highlight]}: ${balances[highlight].toLocaleString()} closing
            </div>
          </div>
        );
      },
      savings: () => {
        const buckets = [
          {name:"Index Funds", amt:500, color:"#34d399"},
          {name:"Pension",     amt:300, color:"#4d9fff"},
          {name:"Emergency",   amt:200+frame%4*50, color:"#f5a623"},
        ];
        const total = buckets.reduce((s,b)=>s+b.amt,0);
        return (
          <div style={{padding:"14px 18px",background:T.surface+"cc",borderRadius:12,border:"1px solid "+accent+"33",marginTop:10}}>
            <div style={{fontSize:10,color:T.muted,marginBottom:10,letterSpacing:1}}>SAVINGS BUCKETS — monthly</div>
            {buckets.map(b => (
              <div key={b.name} style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontSize:11,color:T.text,fontFamily:"monospace"}}>{b.name}</span>
                  <span style={{fontSize:11,color:b.color,fontFamily:"monospace",fontWeight:700}}>${b.amt}/mo</span>
                </div>
                <div style={{height:3,background:T.faint,borderRadius:2}}>
                  <div style={{height:"100%",width:(b.amt/1200*100)+"%",background:b.color,borderRadius:2,transition:"width 0.4s"}} />
                </div>
              </div>
            ))}
            <div style={{marginTop:6,fontSize:10,color:T.muted}}>Total saving: <span style={{color:T.green,fontWeight:700,fontFamily:"monospace"}}>${total}/mo</span></div>
          </div>
        );
      },
      projections: () => {
        const views = ["Monthly","6-Month","Yearly","2-Year","5-Year"];
        const active = views[frame % views.length];
        const vals = [0.3,0.6,0.9,0.7,0.95];
        return (
          <div style={{padding:"14px 18px",background:T.surface+"cc",borderRadius:12,border:"1px solid "+accent+"33",marginTop:10}}>
            <div style={{fontSize:10,color:T.muted,marginBottom:8,letterSpacing:1}}>PROJECTIONS — view toggle</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:10}}>
              {views.map(v => (
                <div key={v} style={{padding:"4px 8px",borderRadius:5,fontSize:9,fontFamily:"monospace",
                  background:v===active?accent+"33":T.faint,border:"1px solid "+(v===active?accent+"66":T.border),
                  color:v===active?accent:T.muted,transition:"all 0.4s"}}>
                  {v}
                </div>
              ))}
            </div>
            <div style={{display:"flex",alignItems:"flex-end",gap:2,height:36}}>
              {vals.map((v,i) => (
                <div key={i} style={{flex:1,height:v*36,background:i===frame%5?accent:accent+"33",borderRadius:"1px 1px 0 0",transition:"background 0.4s"}} />
              ))}
            </div>
          </div>
        );
      },
      analysis: () => {
        const scores = [
          {l:"Savings Rate", score:frame%3===0?"Strong":"Moderate", color:frame%3===0?"#34d399":"#fbbf24"},
          {l:"Housing",      score:"Healthy",  color:"#34d399"},
          {l:"Expenses",     score:frame%3===2?"Watch":"Lean",   color:frame%3===2?"#f87171":"#34d399"},
        ];
        return (
          <div style={{padding:"14px 18px",background:T.surface+"cc",borderRadius:12,border:"1px solid "+accent+"33",marginTop:10}}>
            <div style={{fontSize:10,color:T.muted,marginBottom:10,letterSpacing:1}}>FINANCIAL HEALTH SCORE</div>
            {scores.map(s => (
              <div key={s.l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{fontSize:11,color:T.muted,fontFamily:"monospace"}}>{s.l}</span>
                <span style={{fontSize:10,color:s.color,background:s.color+"22",padding:"3px 10px",borderRadius:20,fontFamily:"monospace",fontWeight:700,transition:"all 0.4s"}}>{s.score}</span>
              </div>
            ))}
          </div>
        );
      },
      ai: () => {
        const msgs = [
          "Am I on track for retirement?",
          "What if rent drops $300?",
          "Analyse my biggest risks",
        ];
        const ai = [
          "Based on your $1,000/mo savings at 7%/yr, you'll reach $1.9M in approximately 22 years. 🎯",
          "Reducing rent by $300 would boost your monthly surplus by $300 and shave 14 months off your wealth target.",
          "Your top risk is housing cost at 38% of net income — above the 30% benchmark.",
        ];
        const idx = frame % msgs.length;
        return (
          <div style={{padding:"14px 18px",background:T.surface+"cc",borderRadius:12,border:"1px solid "+accent+"33",marginTop:10,minHeight:110}}>
            <div style={{background:T.faint,borderRadius:8,padding:"8px 10px",marginBottom:8}}>
              <div style={{fontSize:10,color:T.muted}}>You:</div>
              <div style={{fontSize:11,color:T.text,marginTop:2,fontFamily:"monospace"}}>{msgs[idx]}</div>
            </div>
            <div style={{background:accent+"18",border:"1px solid "+accent+"33",borderRadius:8,padding:"8px 10px"}}>
              <div style={{fontSize:10,color:accent}}>✨ AI:</div>
              <div style={{fontSize:11,color:T.text,marginTop:2,lineHeight:1.6}}>{ai[idx]}</div>
            </div>
          </div>
        );
      },
      welcome: () => (
        <div style={{padding:"18px",background:T.surface+"cc",borderRadius:12,border:"1px solid "+accent+"33",marginTop:10,textAlign:"center"}}>
          <div style={{fontSize:28,marginBottom:10}}>💰</div>
          <div style={{fontSize:13,color:T.text,fontWeight:700,marginBottom:6}}>FinCommand</div>
          <div style={{fontSize:11,color:T.muted,lineHeight:1.7}}>Your money dashboard — income, expenses, savings, projections and AI insights all in one place.</div>
          <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:12,flexWrap:"wrap"}}>
            {["Income","Expenses","Savings","Projections"].map(t=>(
              <div key={t} style={{fontSize:9,color:accent,background:accent+"18",border:"1px solid "+accent+"33",borderRadius:20,padding:"4px 10px",fontFamily:"monospace"}}>{t}</div>
            ))}
          </div>
        </div>
      ),
    };
    const map = {
      0:"welcome", 1:"slider", 2:"toggle", 3:"tabs", 4:"slider", 5:"tabs", 6:"expense",
      7:"cashflow", 8:"expense", 9:"toggle", 10:"savings", 11:"projections", 12:"analysis",
      13:"ai", 14:"ai", 15:"ai", 16:"welcome"
    };
    const key = map[stepId] || "welcome";
    return demos[key] ? demos[key]() : null;
  };

  const STEPS = [
    { group:"Welcome",    icon:"🗺️", accent:"#818cf8",
      title:"Welcome to FinCommand",
      body:"Your personal money dashboard — built for people who want real clarity on their finances without needing to be a financial expert. Everything updates live as you change your numbers.",
      tip:"This 3-minute guide walks you through every feature. Use → or tap Next to advance." },
    { group:"Salary",     icon:"💰", accent:"#34d399",
      title:"Setting Your Salary",
      body:"Drag the Gross Annual Salary slider at the top. The system automatically deducts the right taxes for your country (US, UK, Canada, Australia or Germany) and shows your real take-home pay instantly.",
      tip:"Your net income is the money that actually lands in your bank — this is what the whole budget is built on." },
    { group:"Bonus",      icon:"🎁", accent:"#34d399",
      title:"Bonus & What-If Planning",
      body:"Use the bonus slider and toggle to switch between 'with bonus' and 'without bonus' scenarios. Toggle it off to see your safe baseline — the budget you can rely on even in a quiet year.",
      tip:"Running your budget on base salary only is the smart, conservative approach most financial advisors recommend." },
    { group:"Navigation", icon:"📑", accent:"#fb923c",
      title:"Moving Between Sections",
      body:"The coloured tabs at the top split your dashboard into 7 sections: Overview, Cashflow, Income, Expenses, Savings, Projections, and Analysis. Start with Overview for the big picture, then drill into Expenses to enter real figures.",
      tip:"All sections are connected — a change in Expenses instantly updates Overview, Cashflow, and Projections." },
    { group:"Income",     icon:"📊", accent:"#f472b6",
      title:"Overview — Your Financial Snapshot",
      body:"Overview shows 5 key numbers at a glance: what you spend, what you save, your tax rate, your monthly surplus, and your cash runway. Monthly Surplus is the most important — if it's positive, you're building wealth.",
      tip:"Monthly Surplus = Income minus all Expenses minus all Savings goals. Even £100 surplus means you're moving forward." },
    { group:"Cashflow",   icon:"📅", accent:"#facc15",
      title:"Cashflow — Month by Month",
      body:"Cashflow shows a running picture of your money through the year. You can extend the view from 12 months out to 5 years. Add one-off cash movements like a holiday or car service to specific months — the chart updates instantly.",
      tip:"Look at the bar chart for any red months. These are months where your balance dips — plan ahead for them." },
    { group:"Expenses",   icon:"💸", accent:"#f87171",
      title:"Editing Your Expenses",
      body:"Go to the Expenses tab and click any number to change it. Your rent, groceries, subscriptions — all editable in seconds. Use the 'off' toggle next to any expense to exclude it temporarily without deleting it.",
      tip:"Try turning off your gym or subscription costs to see the immediate impact on your monthly surplus." },
    { group:"Cashflow2",  icon:"🗓️", accent:"#facc15",
      title:"One-off Cash Movements",
      body:"In Cashflow, click any month row to add a one-off cost — a holiday, car repair, moving costs, a special occasion. These sit outside your regular budget and are tracked separately so your monthly figures stay clean.",
      tip:"January and September are often expensive months. Plan for them by adding one-offs in advance." },
    { group:"Income Tab", icon:"➕", accent:"#34d399",
      title:"Extra Income Sources",
      body:"The Income tab lets you add rental income, freelance earnings, dividends, or any side income. Toggle each source on or off to model conservative or optimistic financial scenarios.",
      tip:"Use the 'off' toggle to stress-test your budget — what if that rental income stopped?" },
    { group:"Savings",    icon:"🏦", accent:"#60a5fa",
      title:"Savings Goals",
      body:"Savings shows your buckets — Emergency Fund, Investments, Pension/401k, and any custom goals. Set a monthly amount for each. These flow directly into your net worth projections.",
      tip:"Even a small regular saving compounds significantly over time. Add £50 to an existing bucket and watch the 30-year projection change." },
    { group:"Projections",icon:"📈", accent:"#818cf8",
      title:"Net Worth Projections",
      body:"Projections charts your expected net worth over time, assuming 7% annual return (historical average for diversified investments). Switch between views: Monthly, 6-Month, 1-Year, 2-Year, 4-Year, 5-Year. The dashed line is your $1.9M target.",
      tip:"Use the 5-year view to see your long-term trajectory, and hover over any bar to see the exact projected figures." },
    { group:"Analysis",   icon:"🔬", accent:"#c084fc",
      title:"Your Financial Health Score",
      body:"Analysis gives you three scores: Savings Rate, Housing Ratio, and Expense Ratio. Each is rated Strong / Moderate / Weak based on established personal finance benchmarks. Change a figure anywhere and these scores update live.",
      tip:"The benchmark targets shown are widely used rules of thumb — not rigid rules, but useful starting points for any income level." },
    { group:"AI",         icon:"✨", accent:"#e879f9",
      title:"Ask AI — Your Finance Advisor",
      body:"The AI Advisor has access to all your numbers. Ask it anything in plain English: 'Am I saving enough?', 'What if my rent goes up?', 'What's my biggest financial risk?'. It answers based on your real data.",
      tip:"Use the Quick Question chips for instant insights — you don't need to know what to ask." },
    { group:"Tax",        icon:"📋", accent:"#fb923c",
      title:"Tax Year Report",
      body:"The Tax Report button in the header generates a printable one-page annual summary — gross income, all deductions, effective tax rate, and net figures. Useful at tax time or when reviewing your finances with an accountant.",
      tip:"This report is based on your current inputs. Update your salary and bonus first for the most accurate snapshot." },
    { group:"Glossary",   icon:"💡", accent:"#fbbf24",
      title:"Finance Glossary",
      body:"Not sure what 'Cash Runway', 'Effective Tax Rate' or 'Net Worth' means? The 💡 Glossary button defines every financial term used in the dashboard in plain English. No jargon, no assumptions.",
      tip:"Anyone can understand their finances — the vocabulary is the only barrier. This is here to remove it." },
    { group:"Themes",     icon:"🎨", accent:"#a78bfa",
      title:"Personalise Your Dashboard",
      body:"Click the theme name in the header to switch between 13 visual themes — Dark, Light, Cities (Tokyo, LA, London, NYC), and Culture themes. Your choice saves automatically across sessions.",
      tip:"This is your financial dashboard — it should feel like yours. Pick a theme you'll actually want to open every day." },
    { group:"Done",       icon:"🎯", accent:"#34d399",
      title:"You're Ready",
      body:"Start by entering your real salary and filling in your actual expenses. The more accurate your numbers, the more useful every insight becomes. FinCommand auto-saves everything — come back any time.",
      tip:"5 minutes of real data entry gives you months of financial clarity. Start now." },
  ];

  const current = STEPS[step];
  const total   = STEPS.length;
  const isFirst = step === 0;
  const isLast  = step === total - 1;
  const progress = (step / (total - 1)) * 100;
  const groups   = [...new Set(STEPS.map(s => s.group))];

  const navigate = dir => setStep(s => Math.max(0, Math.min(total - 1, s + dir)));

  useEffect(() => {
    const h = e => {
      if (e.key==="ArrowRight"||e.key==="ArrowDown") navigate(1);
      if (e.key==="ArrowLeft" ||e.key==="ArrowUp")   navigate(-1);
      if (e.key==="Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [step]);

  return (
    <div style={{position:"fixed",inset:0,zIndex:900,opacity:visible?1:0,transition:"opacity 0.3s ease",pointerEvents:visible?"auto":"none"}}>

      {/* Semi-transparent backdrop — NOT fully blurred, so dashboard remains visible above */}
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.55)"}} />

      {/* BOTTOM PANEL — sits at bottom so it never covers the dashboard above */}
      <div style={{
        position:"absolute",bottom:0,left:0,right:0,
        background:T.card,
        borderTop:"2px solid "+current.accent+"66",
        borderRadius:"20px 20px 0 0",
        boxShadow:"0 -12px 48px #00000077",
        zIndex:10,
        maxHeight:"52vh",
        overflow:"hidden",
        display:"flex",
        flexDirection:"column",
        transform:visible?"translateY(0)":"translateY(100%)",
        transition:"transform 0.35s cubic-bezier(0.34,1.56,0.64,1)",
      }}>

        {/* Progress bar */}
        <div style={{height:3,background:T.faint,flexShrink:0}}>
          <div style={{height:"100%",width:progress+"%",background:"linear-gradient(90deg,"+current.accent+","+current.accent+"aa)",transition:"width 0.35s ease",borderRadius:"0 3px 3px 0"}} />
        </div>

        {/* Section pills — scrollable */}
        <div style={{display:"flex",gap:5,padding:"10px 16px 0",overflowX:"auto",flexShrink:0,scrollbarWidth:"none"}}>
          {groups.map((g,gi) => {
            const gStep = STEPS.findIndex(s=>s.group===g);
            const isActive = STEPS[step].group === g;
            const gAccent = STEPS[gStep]?.accent||current.accent;
            return (
              <button key={g} onClick={()=>setStep(gStep)}
                style={{background:isActive?gAccent+"33":"transparent",border:"1px solid "+(isActive?gAccent+"66":T.border+"44"),
                  color:isActive?gAccent:T.muted,borderRadius:20,padding:"4px 10px",cursor:"pointer",fontSize:10,fontFamily:"monospace",
                  fontWeight:isActive?700:400,whiteSpace:"nowrap",flexShrink:0,transition:"all 0.2s"}}>
                {STEPS[gStep]?.icon} {g}
              </button>
            );
          })}
        </div>

        {/* Main content row */}
        <div style={{display:"flex",flex:1,overflow:"hidden",gap:0,minHeight:0}}>

          {/* Left: Text content */}
          <div style={{flex:"0 0 55%",padding:"14px 18px",overflowY:"auto",minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <div style={{width:32,height:32,borderRadius:10,background:current.accent+"33",border:"1px solid "+current.accent+"44",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>
                {current.icon}
              </div>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:T.text,lineHeight:1.3}}>{current.title}</div>
                <div style={{fontSize:10,color:current.accent,fontFamily:"monospace"}}>{step+1} / {total}</div>
              </div>
            </div>

            <p style={{margin:"0 0 10px",fontSize:12,color:T.text,lineHeight:1.75}}>{current.body}</p>

            <div style={{background:current.accent+"12",border:"1px solid "+current.accent+"33",borderRadius:8,padding:"8px 12px",marginBottom:12}}>
              <span style={{fontSize:10,color:current.accent,fontWeight:700}}>💡 </span>
              <span style={{fontSize:11,color:T.muted,lineHeight:1.6}}>{current.tip}</span>
            </div>

            {/* Navigation buttons */}
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              {!isFirst&&(
                <button onClick={()=>navigate(-1)} style={{background:T.faint,border:"1px solid "+T.border,color:T.muted,borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:12,fontFamily:"monospace"}}>← Back</button>
              )}
              {isLast ? (
                <button onClick={onClose} style={{flex:1,background:current.accent,border:"none",color:T.bg,borderRadius:8,padding:"10px 18px",cursor:"pointer",fontSize:12,fontFamily:"monospace",fontWeight:700}}>✓ Got it — start using FinCommand</button>
              ) : (
                <button onClick={()=>navigate(1)} style={{flex:1,background:current.accent,border:"none",color:T.bg,borderRadius:8,padding:"10px 18px",cursor:"pointer",fontSize:12,fontFamily:"monospace",fontWeight:700}}>Next →</button>
              )}
              <button onClick={onClose} style={{background:"transparent",border:"1px solid "+T.border+"66",color:T.muted,borderRadius:8,padding:"8px 12px",cursor:"pointer",fontSize:11}}>Skip</button>
            </div>
          </div>

          {/* Right: Animated demo */}
          <div style={{flex:1,padding:"14px 16px 14px 0",overflowY:"auto",minWidth:0}}>
            <div style={{fontSize:10,color:T.muted,marginBottom:4,letterSpacing:1}}>LIVE DEMO</div>
            <DemoIllustration stepId={step} accent={current.accent} frame={animFrame} />

            {/* Dot scrubber */}
            <div style={{display:"flex",gap:4,marginTop:12,flexWrap:"wrap",justifyContent:"center"}}>
              {STEPS.map((_,i) => (
                <div key={i} onClick={()=>setStep(i)}
                  style={{width:i===step?16:6,height:6,borderRadius:3,background:i===step?current.accent:T.border+"66",cursor:"pointer",transition:"all 0.25s"}} />
              ))}
            </div>
          </div>
        </div>

        {/* Keyboard hint */}
        <div style={{padding:"6px 18px 10px",borderTop:"1px solid "+T.border+"33",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:9,color:T.muted,fontFamily:"monospace",opacity:0.6}}>← → arrow keys to navigate · ESC to close</span>
          <span style={{fontSize:9,color:T.muted,fontFamily:"monospace",opacity:0.6}}>{step+1}/{total}</span>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ user, profile, initialData, onSignOut, themeId, onThemeChange }) {
  const T=useTheme();
  const country=profile?.country||"US";
  const cfg=TAX_CONFIGS[country]||TAX_CONFIGS.US;
  const {fmt,fmtK}=useMemo(()=>buildFmt(cfg.symbol),[cfg.symbol]);

  // ── v7 overlay states ────────────────────────────────────────────────────
  const [showGlossary,  setShowGlossary ]=useState(false);
  const [showAI,        setShowAI       ]=useState(false);
  const [showTaxReport, setShowTaxReport]=useState(false);
  const [showGuide,     setShowGuide    ]=useState(false);

  const [tab,         setTab]        =useState("overview");
  const [inclBonus,   setInclBonus]  =useState(initialData?.inclBonus??false);
  const [grossSalary, setGrossSalary]=useState(profile?.grossSalary||80000);
  const [annualBonus, setAnnualBonus]=useState(initialData?.annualBonus||0);
  const [customIncome,setCustomIncome]=useState(initialData?.customIncome||[]);
  const [fixedItems,  setFixedItems] =useState(()=>initialData?.fixedItems||DEFAULT_FIXED());
  const [varItems,    setVarItems]   =useState(()=>initialData?.varItems  ||DEFAULT_VAR());
  const [savBuckets,  setSavBuckets] =useState(()=>initialData?.savBuckets||DEFAULT_SAV());
  const [assets,      setAssets]     =useState(()=>initialData?.assets||DEFAULT_ASSETS());
  const [liabilities, setLiabilities]=useState(()=>initialData?.liabilities||DEFAULT_LIABILITIES());
  const [targetNetWorth,setTargetNetWorth]=useState(()=>Number(initialData?.targetNetWorth)||DEFAULT_TARGET_NW);
  const [studentLoan,  setStudentLoan] =useState(()=>initialData?.studentLoan||{enabled:false,plan:"plan2",postgrad:false});
  const [projInterval, setProjInterval]=useState(initialData?.projInterval||"1y");
  const [cashflow,    setCashflow]   =useState(()=>{
    const cf = initialData?.cashflow || DEFAULT_CASHFLOW();
    if (initialData?.usdBalance && cf.openingBalance===5000) cf.openingBalance=initialData.usdBalance;
    return cf;
  });
  const [saveStatus,  setSaveStatus] =useState("idle");
  const saveTimer=useRef(null); const pendingSave=useRef(null);

  const {netSalary,netBonus,effectiveRate,monthlyStudentLoanRepayment=0}=useMemo(()=>calcTax(country,grossSalary,annualBonus,studentLoan),[country,grossSalary,annualBonus,studentLoan]);

  const STATUS_CFG=useMemo(()=>({
    idle:  {label:"",               color:T.muted},
    saving:{label:"● saving…",      color:T.blue},
    saved: {label:"✓ saved",        color:T.green},
    error: {label:"⚠ save failed",  color:T.red},
  }),[T.muted,T.green,T.blue,T.red]);

  useEffect(()=>{
    const h=()=>{ if(pendingSave.current) db.saveUserData(user.id,pendingSave.current); };
    window.addEventListener("beforeunload",h);
    return ()=>window.removeEventListener("beforeunload",h);
  },[user.id]);

  const getSnapshot=useCallback(()=>({
    profile:{...profile,grossSalary},
    dashboard:{inclBonus,annualBonus,customIncome,fixedItems,varItems,savBuckets,assets,liabilities,projInterval,cashflow,targetNetWorth,studentLoan},
  }),[profile,grossSalary,inclBonus,annualBonus,customIncome,fixedItems,varItems,savBuckets,assets,liabilities,projInterval,cashflow,targetNetWorth,studentLoan]);

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

  const openingBalance = cashflow.openingBalance;

  const derived=useMemo(()=>{
    const bonus    =inclBonus?netBonus:0;
    const extra    =sum(customIncome,"amount");
    const income   =netSalary+bonus+extra;
    const fixed    =sum(fixedItems,"amount");
    const variable =sum(varItems,"amount");
    const savings  =sum(savBuckets,"amount");
    const expenses =fixed+variable;
    const rem      =income-expenses-savings;
    const sRate    =income>0?(savings/income)*100:0;
    const rentAmt  =(fixedItems.find(i=>/rent|mortgage/i.test(i.name))?.amount)||0;
    const housing  =income>0?(rentAmt/income)*100:0;
    const totalAssets=(assets||[]).filter(a=>!a.excluded).reduce((s,a)=>s+(Number(a.value)||0),0);
    const totalLiabilities=(liabilities||[]).filter(l=>!l.excluded).reduce((s,l)=>s+(Number(l.balance)||0),0);
    const netWorth=totalAssets+openingBalance-totalLiabilities;
    const weightedAssetReturn=(()=>{
      const active=(assets||[]).filter(a=>!a.excluded&&a.value>0);
      const tot=active.reduce((s,a)=>s+(Number(a.value)||0),0);
      if(tot<=0) return 0;
      return active.reduce((s,a)=>s+(Number(a.value)||0)*(Number(a.annualReturn)||0),0)/tot;
    })();
    return {bonus,extra,income,fixed,variable,savings,expenses,rem,sRate,rentAmt,housing,totalAssets,weightedAssetReturn,totalLiabilities,netWorth};
  },[inclBonus,netBonus,netSalary,customIncome,fixedItems,varItems,savBuckets,assets,liabilities,openingBalance]);

  const {bonus,extra,income,fixed,variable,savings,expenses,rem,sRate,rentAmt,housing,totalAssets,weightedAssetReturn,totalLiabilities,netWorth}=derived;
  const weightedReturn = useMemo(()=>weightedAvgReturn(savBuckets),[savBuckets]);
  const runway=useMemo(()=>{
    const months=expenses>0?openingBalance/expenses:0;
    const target=expenses*6; const pctV=target>0?Math.min(100,(openingBalance/target)*100):0;
    const color=months>=6?T.green:months>=3?T.amber:T.red;
    const verdict=months>=6?"✓ Solid":months>=3?"~ Building":"⚠ Thin";
    const toTgt=rem>0?Math.max(0,(target-openingBalance)/rem):null;
    return {months,target,pct:pctV,color,verdict,toTarget:toTgt};
  },[expenses,openingBalance,rem,T.green,T.amber,T.red]);

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
              {/* How-To Guide */}
              <button onClick={()=>setShowGuide(true)} title="How-To Guide" style={{background:T.faint,border:"1px solid "+T.border,color:T.muted,borderRadius:8,padding:"5px 9px",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",width:32,height:32}} aria-label="Guide">
                📖
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
          {country==="UK"&&(
            <div style={{marginTop:10}}>
              <Toggle checked={studentLoan.enabled} onChange={v=>setStudentLoan(s=>({...s,enabled:v}))} color={T.purple}
                label="Student Loan Repayments"
                sublabel={studentLoan.enabled?"Deducting "+fmt(monthlyStudentLoanRepayment)+"/mo from net salary":"Toggle on if you have a UK student loan"} />
              {studentLoan.enabled&&(
                <div style={{background:T.surface,border:"1px solid "+T.purple+"33",borderRadius:10,padding:"14px 16px",marginTop:8}}>
                  <div style={{fontSize:10,color:T.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>Repayment Plan</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                    {Object.entries(cfg.studentLoanPlans||{}).filter(([k])=>k!=="postgrad").map(([key,plan])=>(
                      <div key={key} onClick={()=>setStudentLoan(s=>({...s,plan:key}))}
                        style={{padding:"10px 12px",borderRadius:8,cursor:"pointer",
                          background:studentLoan.plan===key?T.purple+"22":T.faint,
                          border:"1px solid "+(studentLoan.plan===key?T.purple+"66":T.border),transition:"all 0.15s"}}>
                        <div style={{fontSize:11,fontWeight:700,color:studentLoan.plan===key?T.purple:T.text,fontFamily:"monospace"}}>{plan.label}</div>
                        <div style={{fontSize:10,color:T.muted,marginTop:3}}>Repay {(plan.rate*100).toFixed(0)}% over £{plan.threshold.toLocaleString()}/yr</div>
                      </div>
                    ))}
                  </div>
                  <Toggle checked={studentLoan.postgrad||false} onChange={v=>setStudentLoan(s=>({...s,postgrad:v}))} color={T.blue}
                    label="Also repaying Postgraduate Loan"
                    sublabel="6% on earnings above £21,000/yr — stacks with main plan" />
                  <div style={{marginTop:10,padding:"8px 12px",background:T.purple+"0d",border:"1px solid "+T.purple+"22",borderRadius:8,fontSize:11,color:T.muted}}>
                    <span style={{color:T.purple,fontWeight:700}}>Deducting: </span>{fmt(monthlyStudentLoanRepayment)}/mo from net take-home
                  </div>
                </div>
              )}
            </div>
          )}
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
          <div className="fc-grid-3" style={{marginBottom:14}}>
            <StatCard label="Monthly Surplus" value={(rem>=0?"+":"")+fmt(rem)} color={rem>=0?T.green:T.red} bg={rem>=0?T.green+"14":T.red+"0f"} sub={pct(income>0?(rem/income)*100:0)+" of income"} />
            <StatCard label="Net Worth"  value={fmtK(netWorth)} color={netWorth>=0?T.purple:T.red} sub={fmtK(totalAssets)+" assets − "+fmtK(totalLiabilities)+" debt"} />
            <StatCard label="Cash Runway"     value={(isFinite(runway.months)?runway.months:0).toFixed(1)+" mo"} color={runway.color} bg={runway.color+"14"} sub={fmt(openingBalance)+" liquid · "+runway.verdict} />
          </div>
          <div className="fc-grid-3" style={{marginBottom:14}}>
            <StatCard label="Total Expenses"  value={fmt(expenses)} color={T.red}   sub={pct(income>0?(expenses/income)*100:0)+" of income"} />
            <StatCard label="Total Savings"   value={fmt(savings)}  color={T.green} sub={pct(sRate)+" savings rate"} />
            <StatCard label="Effective Tax"   value={effectiveRate+"%"} color={T.amber} sub={"~"+fmt(netSalary*12)+" net/yr"} />
          </div>

          {/* Runway mini-card — full detail in Cashflow tab */}
          <CollapsibleSection title="Cash Runway" icon="🛡️" accentColor={runway.color} storeKey="ov-runway" defaultOpen={true}
            badge={(isFinite(runway.months)?runway.months:0).toFixed(1)+" mo"}>
            <div style={{padding:"14px 18px"}}>
              <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
                <button onClick={()=>setTab("cashflow")} style={{background:T.faint,border:"1px solid "+T.border,color:T.muted,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10,fontFamily:"monospace"}}>Full detail in Cashflow →</button>
              </div>
              <div style={{position:"relative",height:8,background:T.faint,borderRadius:4,marginBottom:8}}>
                <div style={{position:"absolute",left:"50%",top:0,width:1,height:"100%",background:T.amber+"55"}} />
                <div style={{position:"absolute",left:0,top:0,height:"100%",width:runway.pct+"%",background:"linear-gradient(90deg,"+runway.color+"88,"+runway.color+")",borderRadius:4,transition:"width 0.3s"}} />
              </div>
              <div className="fc-runway4">
                {[
                  {l:"Liquid Balance", v:fmt(openingBalance),c:runway.color},
                  {l:"Monthly Burn",   v:fmt(expenses),c:T.red},
                  {l:"6-mo Shortfall", v:openingBalance>=runway.target?"✓ Funded":fmt(runway.target-openingBalance),c:openingBalance>=runway.target?T.green:T.amber},
                  {l:"Runway",         v:(isFinite(runway.months)?runway.months:0).toFixed(1)+" mo",c:runway.color},
                ].map(s=>(
                  <div key={s.l} style={{background:T.surface,borderRadius:10,padding:"10px 14px"}}>
                    <div style={{fontSize:10,color:T.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>{s.l}</div>
                    <div style={{fontSize:14,color:s.c,fontFamily:"monospace",fontWeight:700}}>{s.v}</div>
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleSection>
                    {/* Allocation bar */}
          <CollapsibleSection title="Income Allocation" icon="🧮" storeKey="ov-alloc" accentColor={T.muted} defaultOpen={true}>
          <div style={{padding:"14px 18px"}}>
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
          </CollapsibleSection>

          {/* P&L statement */}
          <CollapsibleSection title="Monthly P&L" icon="📋" storeKey="ov-pl" accentColor={T.accent} defaultOpen={false} badge={(rem>=0?"+":"")+fmt(rem)}>
            <div>
              {[
                {label:"Net Salary /mo",        val:netSalary,    color:T.green,   dim:false},
                {label:"Bonus /mo (avg)",        val:bonus,        color:inclBonus?T.amber:T.muted, dim:!inclBonus},
                {label:"Other Income",           val:extra,        color:extra>0?T.purple:T.muted,  dim:extra===0},
                {label:"Fixed Expenses",         val:-fixed,       color:T.red,     dim:false},
                {label:"Variable Expenses",      val:-variable,    color:T.red,     dim:false},
                {label:"Savings & Investments",  val:-savings,     color:T.blue,    dim:false},
                {label:"Monthly Surplus",        val:rem,          color:rem>=0?T.green:T.red, bold:true},
              ].map((r,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 18px",borderBottom:i<6?"1px solid "+T.border:"none",background:r.bold?T.surface:"transparent",opacity:r.dim?0.38:1}}>
                  <span style={{fontSize:r.bold?12:11,color:r.bold?T.text:T.muted,fontWeight:r.bold?700:400,textTransform:r.bold?"uppercase":"none",letterSpacing:r.bold?1.2:0}}>{r.label}</span>
                  <span style={{fontSize:r.bold?17:13,color:r.color,fontWeight:r.bold?700:500,fontFamily:"monospace"}}>{r.val>=0?fmt(r.val):"-"+fmt(Math.abs(r.val))}</span>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {/* Dynamic Overview Insights */}
          {income>0&&(
            <CollapsibleSection title="Financial Insights" icon="💡" accentColor={T.purple} defaultOpen={true} storeKey="ov-insights">
            <div style={{padding:"14px 18px 18px"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {[
                  rem<0?{icon:"🔴",color:T.red,text:"Your spending exceeds income by "+fmt(Math.abs(rem))+"/month. Identify your largest non-essential expense first — even cutting half of the shortfall changes the picture."}
                  :rem<income*0.1?{icon:"⚠️",color:T.amber,text:"Your "+fmt(rem)+" surplus is thin at "+pct(income>0?(rem/income)*100:0)+" of income. One unexpected cost could erase it. Cutting "+fmt(Math.round(expenses*0.05))+" in expenses would make a real difference."}
                  :{icon:"✅",color:T.green,text:fmt(rem)+"/mo surplus ("+pct(income>0?(rem/income)*100:0)+"). Over 12 months that's "+fmt(rem*12)+" available — consider whether any could be deployed into investments."},

                  sRate<10?{icon:"💸",color:T.red,text:pct(sRate)+" savings rate is well below the 20% benchmark. Even adding "+fmt(Math.round(income*0.05))+"/month would make a meaningful difference to your long-term wealth."}
                  :sRate<25?{icon:"📈",color:T.amber,text:pct(sRate)+" savings rate is a solid start. Pushing to 25% adds "+fmt(Math.round(income*0.25-savings))+"/month — significant compounding over a 10-year horizon."}
                  :{icon:"🚀",color:T.green,text:pct(sRate)+" savings rate — strong. At 7% annual return, your current savings pace projects to approximately "+fmtK(fv(savings,0.07,10))+" in 10 years."},

                  housing>38?{icon:"🏠",color:T.red,text:"Housing is "+pct(housing)+" of net income — above the 30% guideline. Each "+fmt(200)+" reduction in rent frees "+fmt(200*12)+" annually that could compound for your future."}
                  :housing>30?{icon:"🏠",color:T.amber,text:"Housing at "+pct(housing)+" is slightly above the 30% benchmark. It limits flexibility — worth watching as other expenses fluctuate."}
                  :{icon:"🏠",color:T.green,text:"Housing at "+pct(housing)+" is well within the 30% benchmark. This flexibility is valuable — consider whether any headroom could go into wealth-building."},

                  totalAssets>0
                    ?{icon:"💼",color:T.purple,text:"Your estimated net worth of "+fmtK(totalAssets+openingBalance)+" ("+fmtK(totalAssets)+" assets + "+fmt(openingBalance)+" liquid) is your real wealth position. Keep growing both sides — assets for long-term growth, liquid for resilience."}
                    :{icon:"💡",color:T.blue,text:"Add your assets (property, investments, pension) in the Assets tab to see your complete net worth picture. Cash and savings alone understate your financial position."},
                ].map((ins,i)=>(
                  <div key={i} style={{background:ins.color+"0d",border:"1px solid "+ins.color+"33",borderRadius:10,padding:"12px 14px",display:"flex",gap:10,alignItems:"flex-start"}}>
                    <span style={{fontSize:16,flexShrink:0}}>{ins.icon}</span>
                    <p style={{margin:0,fontSize:11,color:T.muted,lineHeight:1.7}}>{ins.text}</p>
                  </div>
                ))}
              </div>
            </div>
            </CollapsibleSection>
          )}
        </>)}

        {/* ══ ASSETS ══ */}
        {tab==="assets"&&(
          <AssetsTab assets={assets} setAssets={setAssets} fmt={fmt} fmtK={fmtK}
            targetNetWorth={targetNetWorth} weightedReturn={weightedAssetReturn} />
        )}

        {/* ══ LIABILITIES ══ */}
        {tab==="liabilities"&&(
          <LiabilitiesTab liabilities={liabilities} setLiabilities={setLiabilities}
            assets={assets} openingBalance={openingBalance} income={income} expenses={expenses}
            fmt={fmt} fmtK={fmtK} />
        )}

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
          <CollapsibleSection title="Income Sources" icon="💰" accentColor={T.green} storeKey="inc-sources" defaultOpen={true}>
            <IncomeTable items={incomeItems} setCustomIncome={setCustomIncome} inclBonus={inclBonus} setInclBonus={setInclBonus} totalIncome={income} fmt={fmt} />
          </CollapsibleSection>
          {income>0&&(
            <CollapsibleSection title="Income Insights" icon="💡" storeKey="inc-insights" accentColor={T.purple} defaultOpen={true}>
              <div style={{padding:"14px 18px 18px"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  {[
                    // Income concentration risk
                    (()=>{
                      const salaryPct=income>0?(netSalary/income)*100:0;
                      return salaryPct>90
                        ?{icon:"⚠️",color:T.amber,text:`Your income is ${pct(salaryPct)} salary-dependent — a single point of failure. Adding even one small income stream (freelance, dividends, rental) would reduce that concentration significantly.`}
                        :{icon:"✅",color:T.green,text:`Good income diversification: salary is ${pct(salaryPct)} of total. Multiple income sources create resilience against disruption to any single stream.`};
                    })(),
                    // Bonus impact
                    inclBonus&&netBonus>0
                      ?{icon:"🎁",color:T.amber,text:`Your ${fmt(netBonus)}/mo bonus adds ${fmt(netBonus*12)} annually — ${pct(income>0?(netBonus/income)*100:0)} of total income. Running your budget without it ensures you're not dependent on variable income.`}
                      :{icon:"💡",color:T.muted,text:`Toggle bonus income on in the sliders above to model your full earnings potential. This lets you compare conservative (base only) vs optimistic (with bonus) financial scenarios.`},
                    // Extra income
                    extra>0
                      ?{icon:"📈",color:T.green,text:`${fmt(extra)}/mo from other income sources is working hard for you. Over 12 months that's ${fmt(extra*12)} — and over 10 years invested at 7%, ${fmtK(fv(extra,0.07,10))}.`}
                      :{icon:"💡",color:T.blue,text:`The Income tab supports rental, dividend, freelance, and other sources. Adding additional income streams here allows the dashboard to model your complete financial picture accurately.`},
                    // Tax efficiency
                    {icon:"💰",color:Number(effectiveRate)<25?T.green:Number(effectiveRate)<35?T.amber:T.red,
                     text:`Your effective tax rate is ${effectiveRate}%. ${Number(effectiveRate)>35?"At this rate, tax-advantaged accounts like ISAs or pension contributions are especially valuable — each pound contributed reduces taxable income.":Number(effectiveRate)>25?"Consider whether any income could be shifted into lower-taxed structures (pensions, ISAs, dividends if self-employed).":"Good tax position. Maintaining this through tax-efficient saving will protect more of every additional pound you earn."}`},
                  ].map((ins,i)=>(
                    <div key={i} style={{background:ins.color+"0d",border:"1px solid "+ins.color+"33",borderRadius:10,padding:"12px 14px",display:"flex",gap:10,alignItems:"flex-start"}}>
                      <span style={{fontSize:16,flexShrink:0}}>{ins.icon}</span>
                      <p style={{margin:0,fontSize:11,color:T.muted,lineHeight:1.7}}>{ins.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </CollapsibleSection>
          )}
        </>)}

        {/* ══ EXPENSES ══ */}
        {tab==="expenses"&&(<>
          <div className="fc-grid-3" style={{marginBottom:14}}>
            <StatCard label="Fixed Expenses"    value={fmt(fixed)}    color={T.red}      sub={pct(income>0?(fixed/income)*100:0)+" of income"} />
            <StatCard label="Variable Expenses" value={fmt(variable)} color={T.red+"88"} sub={pct(income>0?(variable/income)*100:0)+" of income"} />
            <StatCard label="Total Outgoings"   value={fmt(expenses)} color={T.red}      sub={pct(income>0?(expenses/income)*100:0)+" of income"} />
          </div>
          <CollapsibleSection title="Fixed Expenses" icon="🔒" accentColor={T.red} badge={fmt(fixed)} storeKey="exp-fixed">
            <EditableTable title="Fixed Expenses" icon="🔒" items={fixedItems} setItems={setFixedItems} accentColor={T.red} sliderMax={8000} bare />
          </CollapsibleSection>
          <CollapsibleSection title="Variable Expenses" icon="🔄" accentColor={T.blue} badge={fmt(variable)} storeKey="exp-var">
            <EditableTable title="Variable Expenses" icon="🔄" items={varItems} setItems={setVarItems} accentColor={T.blue} sliderMax={3000} bare />
          </CollapsibleSection>
          {income>0&&(
            <CollapsibleSection title="Expense Insights" icon="💡" accentColor={T.purple} defaultOpen={true} storeKey="exp-insights">
            <div style={{padding:"14px 18px 18px"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {[
                  {icon:fixed/income>0.5?"🔴":fixed/income>0.35?"⚠️":"✅",color:fixed/income>0.5?T.red:fixed/income>0.35?T.amber:T.green,
                   text:"Fixed costs are "+pct(income>0?(fixed/income)*100:0)+" of income. These are the hardest to cut — but each reduction saves permanently. Your largest fixed item alone is "+pct(income>0?(Math.max(...fixedItems.filter(i=>!i.excluded).map(i=>i.amount),0)/income)*100:0)+"."},
                  {icon:"📊",color:T.blue,
                   text:"Variable expenses total "+fmt(variable)+" ("+pct(income>0?(variable/income)*100:0)+" of income). These are your most controllable costs — small, consistent reductions compound significantly over 12+ months."},
                  {icon:"🍽️",color:T.amber,
                   text:"Dining and entertainment often surprise people. If yours exceeds "+fmt(income*0.08)+"/month (8% of income), reviewing these categories first is typically where the quickest wins are found."},
                  {icon:"💡",color:T.green,
                   text:"Every "+fmt(100)+" you cut from monthly expenses equals "+fmt(1200)+" per year and "+fmtK(fv(100,0.07,10))+" in 10 years if invested at 7%. Small, boring cuts create significant long-term wealth."},
                ].map((ins,i)=>(
                  <div key={i} style={{background:ins.color+"0d",border:"1px solid "+ins.color+"33",borderRadius:10,padding:"12px 14px",display:"flex",gap:10,alignItems:"flex-start"}}>
                    <span style={{fontSize:16,flexShrink:0}}>{ins.icon}</span>
                    <p style={{margin:0,fontSize:11,color:T.muted,lineHeight:1.7}}>{ins.text}</p>
                  </div>
                ))}
              </div>
            </div>
            </CollapsibleSection>
          )}
        </>)}

        {/* ══ SAVINGS ══ */}
        {tab==="savings"&&(<>
          <div className="fc-grid-3" style={{marginBottom:14}}>
            <StatCard label="Monthly Savings"   value={fmt(savings)}            color={T.green} sub={pct(sRate)+" savings rate"} />
            <StatCard label="Annual Savings"    value={fmt(savings*12)}          color={T.green} sub="Excluding bonus" />
            <StatCard label="With Bonus (net)"  value={fmt(savings*12+netBonus*12)} color={T.amber} sub="Total annual capacity" />
          </div>
          <CollapsibleSection title="Savings Buckets" icon="💰" accentColor={T.green} storeKey="sav-buckets" defaultOpen={true} badge={fmt(savings)}>
            <SavingsSection buckets={savBuckets} setBuckets={setSavBuckets} />
          </CollapsibleSection>

          {/* ── SAVINGS GROWTH CHART ──────────────────────────────────────────
              Shows projected savings growth per bucket over 5 years.
              Each bucket is a stacked coloured layer — total height = cumulative savings.
              Dynamic Y-axis with "nice" intervals just like the cashflow chart.
          ───────────────────────────────────────────────────────────────────── */}

          {savBuckets.filter(b=>!b.excluded).length>0&&<SavingsGrowthChart buckets={savBuckets} fmt={fmt} fmtK={fmtK} />}
          {income>0&&(
            <CollapsibleSection title="Savings Insights" icon="💡" storeKey="sav-insights" accentColor={T.purple} defaultOpen={true}>
            <div style={{padding:"14px 18px 18px"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {[
                  {icon:sRate>=30?"🚀":sRate>=20?"📈":"⚠️",color:sRate>=30?T.green:sRate>=20?T.amber:T.red,
                   text:pct(sRate)+" savings rate. The 25–30% range is considered strong for long-term wealth building. You're saving "+fmt(savings)+"/month — over 10 years at your "+pct(weightedReturn)+" return, that becomes "+fmtK(fv(savings,weightedReturn/100,10))+"."},
                  {icon:"🎯",color:T.blue,
                   text:"To reach "+fmtK(targetNetWorth)+" from zero: saving "+fmt(savings)+"/month at "+pct(weightedReturn)+" takes approximately "+(savings>0?Math.ceil(Math.log(1+(weightedReturn/100)*(targetNetWorth/(savings*12)))/Math.log(1+weightedReturn/100)):"-")+" years. Each extra "+fmt(200)+"/month shortens that significantly."},
                  {icon:"🛡️",color:T.amber,
                   text:"Is your Emergency Fund bucket fully funded? The target is "+fmt(expenses*6)+" (6 months of expenses). Without it, any financial shock forces you to sell investments at potentially the worst time."},
                  {icon:"📅",color:T.green,
                   text:"Annual savings capacity: "+fmt(savings*12)+". With consistent investing, compounding works hardest in the first 5 years — even "+fmt(50)+" more per month now is worth far more than "+fmt(200)+" more in 5 years."},
                ].map((ins,i)=>(
                  <div key={i} style={{background:ins.color+"0d",border:"1px solid "+ins.color+"33",borderRadius:10,padding:"12px 14px",display:"flex",gap:10,alignItems:"flex-start"}}>
                    <span style={{fontSize:16,flexShrink:0}}>{ins.icon}</span>
                    <p style={{margin:0,fontSize:11,color:T.muted,lineHeight:1.7}}>{ins.text}</p>
                  </div>
                ))}
              </div>
            </div>
            </CollapsibleSection>
          )}
          <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:14,padding:"18px 20px",marginBottom:14}}>
            <Lbl color={T.blue}>📊 Global Index Average Returns — Reference</Lbl>
            <div style={{fontSize:11,color:T.muted,marginBottom:12}}>Historical nominal averages. Use as a benchmark when setting each bucket's return rate.</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[
                {name:"S&P 500 (US Large Cap)",        ret:10.7, note:"~7.5% real after inflation. Strongest long-run record.",   color:T.blue},
                {name:"MSCI World (Global Developed)", ret:9.2,  note:"Diversified across 23 developed markets.",                 color:T.green},
                {name:"FTSE 100 (UK Large Cap)",       ret:7.8,  note:"Dividend-heavy; lower growth, higher yield.",              color:T.purple},
                {name:"MSCI Emerging Markets",         ret:6.4,  note:"Higher volatility — China, India, Brazil.",               color:T.amber},
                {name:"Bloomberg Agg (Global Bonds)",  ret:4.1,  note:"Lower risk; capital preservation focus.",                 color:T.muted},
              ].map(idx=>(
                <div key={idx.name} style={{background:T.surface,border:"1px solid "+idx.color+"33",borderRadius:10,padding:"12px 14px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                    <span style={{fontSize:11,color:T.text,fontFamily:"monospace",fontWeight:700}}>{idx.name}</span>
                    <span style={{fontSize:15,color:idx.color,fontFamily:"monospace",fontWeight:700}}>{idx.ret}%</span>
                  </div>
                  <div style={{height:4,background:T.faint,borderRadius:2,marginBottom:6}}>
                    <div style={{height:"100%",width:(idx.ret/12*100)+"%",background:idx.color+"88",borderRadius:2}} />
                  </div>
                  <div style={{fontSize:10,color:T.muted,lineHeight:1.6}}>{idx.note}</div>
                </div>
              ))}
            </div>
            <div style={{marginTop:10,fontSize:10,color:T.muted,lineHeight:1.7}}>
              <span style={{color:T.amber,fontWeight:700}}>⚠ </span>Past returns don't guarantee future results. Edit each bucket's % rate to customise your projection.
            </div>
          </div>

          <CollapsibleSection title="Allocation Breakdown" icon="🥧" storeKey="sav-alloc" accentColor={T.green} defaultOpen={false}>
          <div style={{padding:"16px 18px"}}>
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
          </CollapsibleSection>
        </>)}

        {/* ══ PROJECTIONS ══ */}
        {tab==="projections"&&(<>
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",gap:4,background:T.card,padding:4,borderRadius:10,border:"1px solid "+T.border,flexWrap:"wrap"}}>
              {INTERVAL_MODES.map(m=>(
                <button key={m.id} onClick={()=>setProjInterval(m.id)}
                  style={{padding:"6px 12px",borderRadius:7,border:"none",background:projInterval===m.id?T.accent:"transparent",color:projInterval===m.id?T.bg:T.muted,cursor:"pointer",fontSize:10,fontFamily:"monospace",letterSpacing:1.5,textTransform:"uppercase",fontWeight:projInterval===m.id?700:400,transition:"all 0.15s",whiteSpace:"nowrap"}}>
                  {m.label}
                </button>
              ))}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,background:T.card,border:"1px solid "+T.amber+"44",borderRadius:10,padding:"8px 14px"}}>
                <span style={{fontSize:11,color:T.muted,fontFamily:"monospace"}}>🎯 Wealth target:</span>
                <InlineEdit value={targetNetWorth} type="number" onCommit={v=>setTargetNetWorth(Math.max(0,v))}
                  style={{fontSize:14,color:T.amber,fontFamily:"monospace",fontWeight:700,minWidth:80,textAlign:"right"}} />
              </div>
              <div style={{background:T.card,border:"1px solid "+T.blue+"33",borderRadius:10,padding:"8px 14px"}}>
                <span style={{fontSize:11,color:T.muted,fontFamily:"monospace"}}>Weighted return: </span>
                <span style={{fontSize:13,color:T.blue,fontFamily:"monospace",fontWeight:700}}>{pct(weightedReturn)}</span>
              </div>
            </div>
          </div>
          <CollapsibleSection title="Net Worth Projection" icon="📊" accentColor={T.blue} storeKey="proj-chart" defaultOpen={true}>
            <ProjChart monthlySavings={savings} netBonus={netBonus} includeBonus={inclBonus} intervalMode={projInterval} fmtK={fmtK} targetNetWorth={targetNetWorth} weightedReturn={weightedReturn} initialAssets={totalAssets} />
          </CollapsibleSection>
          <CollapsibleSection title="Detailed Projections" icon="📋" accentColor={T.green} storeKey="proj-table" defaultOpen={false}
            badge={INTERVAL_MODES.find(m=>m.id===projInterval)?.label}>
            <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
              <div style={{padding:"10px 18px 8px",borderBottom:"1px solid "+T.border}}>
                <span style={{fontSize:11,color:T.muted,fontFamily:"monospace"}}>{fmt(savings)}/mo @ {pct(weightedReturn)} return</span>
              </div>
              <table style={{width:"100%",minWidth:500,borderCollapse:"collapse",fontSize:11,fontFamily:"monospace"}}>
                <thead>
                  <tr>{["Period","Savings","Bonus","Assets","Total","vs Target"].map(h=>(
                    <th key={h} style={{padding:"10px 12px",textAlign:h==="Period"?"left":"right",color:T.muted,fontSize:10,letterSpacing:1.2,textTransform:"uppercase",borderBottom:"1px solid "+T.border,whiteSpace:"nowrap",fontWeight:600}}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {(()=>{const pm=INTERVAL_MODES.find(m=>m.id===projInterval)||INTERVAL_MODES[2]; return pm.steps.map((y,i)=>{
                    const row=calcProjRow(y,savings,netBonus,inclBonus,weightedReturn,totalAssets);
                    const gap=row.total-targetNetWorth,hit=row.total>=targetNetWorth;
                    const modeFmt=pm;
                    return (
                      <tr key={y} style={{background:i%2===0?T.surface:"transparent",borderBottom:"1px solid "+T.border}}>
                        <td style={{padding:"10px 12px",color:hit?T.amber:T.text,fontWeight:hit?700:400,whiteSpace:"nowrap"}}>{modeFmt?.fmt(y)||y+"yr"}{hit?" ✓":""}</td>
                        <td style={{padding:"10px 12px",textAlign:"right",color:T.blue}}>{fmtK(row.inv)}</td>
                        <td style={{padding:"10px 12px",textAlign:"right",color:inclBonus?T.amber:T.muted}}>{inclBonus?fmtK(row.bon):"—"}</td>
                        <td style={{padding:"10px 12px",textAlign:"right",color:T.purple}}>{row.existingAssets>0?fmtK(row.existingAssets):fmtK(row.car)}</td>
                        <td style={{padding:"10px 12px",textAlign:"right",color:hit?T.amber:T.green,fontWeight:700}}>{fmtK(row.total)}</td>
                        <td style={{padding:"10px 12px",textAlign:"right",color:hit?T.green:T.red,fontWeight:600}}>{gap>=0?"+":""}{fmtK(gap)}</td>
                      </tr>
                    );
                  })})()}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
          {/* ── PROJECTIONS INSIGHTS ── */}
          {(()=>{
            const activeMode=INTERVAL_MODES.find(m=>m.id===projInterval)||INTERVAL_MODES[2];
            const firstHit=activeMode.steps.find(y=>calcProjRow(y,savings,netBonus,inclBonus,weightedReturn,totalAssets).total>=targetNetWorth);
            const row30=calcProjRow(30,savings,netBonus,inclBonus,weightedReturn,totalAssets);
            const row10=calcProjRow(10,savings,netBonus,inclBonus,weightedReturn,totalAssets);
            const assetBoost=Math.round(totalAssets*Math.pow(1+weightedAssetReturn/100,10));
            const combinedNW10=row10.total+assetBoost;
            const ins=[
              firstHit
                ?{icon:"🎯",color:T.green,text:`At your current savings rate of ${fmt(savings)}/mo at ${pct(weightedReturn)}, you're projected to reach your ${fmtK(targetNetWorth)} target in approximately ${firstHit} ${firstHit===1?"year":"years"}. Keep this pace.`}
                :{icon:"📈",color:T.amber,text:`Your ${fmt(savings)}/mo at ${pct(weightedReturn)} doesn't reach your ${fmtK(targetNetWorth)} target within the modelled window. Increasing monthly savings by ${fmt(Math.round(savings*0.2))} could make a significant difference.`},
              {icon:"💡",color:T.blue,text:`In 10 years, your savings contributions alone project to ${fmtK(row10.total)}. Combined with your current asset portfolio growing at ${pct(weightedAssetReturn)}, your estimated total net worth could reach ${fmtK(combinedNW10)}.`},
              savings>0?{icon:"⚡",color:T.purple,text:`Compounding impact: at ${pct(weightedReturn)}, your ${fmt(savings)}/mo saved today is worth ${fmtK(fv(savings,weightedReturn/100,30))} at 30 years — compared to just ${fmtK(savings*12*30)} without growth. Time is your biggest lever.`}:{icon:"⚡",color:T.muted,text:`Start saving any amount consistently — even ${fmt(200)}/mo at 7% becomes ${fmtK(fv(200,0.07,30))} over 30 years. The amount matters less than starting.`},
              inclBonus&&netBonus>0
                ?{icon:"🎁",color:T.amber,text:`Including your ${fmt(netBonus)}/mo bonus contribution adds ${fmtK(row30.bon)} to your 30-year projection — a ${pct(row30.bon/Math.max(row30.inv,1)*100)} uplift on top of regular savings.`}
                :{icon:"🎁",color:T.muted,text:`If you include an annual bonus, you can model its compounding impact in the Projections chart. Even modest bonus contributions compound significantly over long time horizons.`},
            ];
            return (
              <CollapsibleSection title="Projection Insights" icon="💡" accentColor={T.purple} defaultOpen={true} storeKey="proj-insights">
                <div style={{padding:"14px 18px 18px"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    {ins.map((i,idx)=>(
                      <div key={idx} style={{background:i.color+"0d",border:"1px solid "+i.color+"33",borderRadius:10,padding:"12px 14px",display:"flex",gap:10,alignItems:"flex-start"}}>
                        <span style={{fontSize:16,flexShrink:0}}>{i.icon}</span>
                        <p style={{margin:0,fontSize:11,color:T.muted,lineHeight:1.7}}>{i.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CollapsibleSection>
            );
          })()}
        </>)}

        {/* ══ ANALYSIS ══ */}
        {tab==="analysis"&&(<>
          <CollapsibleSection title="Financial Health Score" icon="🏥" storeKey="ana-health" accentColor={T.purple} defaultOpen={true}>
            <div style={{padding:"0 0 4px"}}><HealthScore savingsRate={sRate} housingPct={housing} totalExpenses={expenses} netIncome={income} /></div>
          </CollapsibleSection>
          <CollapsibleSection title="Cash Runway Analysis" icon="🛡️" accentColor={runway.color} storeKey="ana-runway" defaultOpen={false}>
          <div style={{padding:"16px 18px"}}>
            <div className="fc-analysis" style={{marginTop:12}}>
              {[
                {label:"3-month floor",   score:runway.months>=3?"✓ Met":"⚠ Below",            color:runway.months>=3?T.green:T.red,    detail:runway.months>=3?"Above minimum. Current: "+runway.months.toFixed(1)+" months.":"Only "+runway.months.toFixed(1)+"mo. Need "+fmt(expenses*3-openingBalance)+" more for floor."},
                {label:"6-month target",  score:runway.months>=6?"✓ Funded":runway.months>=3?"~ In Progress":"⚠ Priority",color:runway.color,detail:runway.months>=6?"Fully funded. "+fmt(openingBalance-runway.target)+" above target.":fmt(runway.target-openingBalance)+" shortfall. "+(runway.toTarget!==null?"~"+runway.toTarget.toFixed(1)+" months to target.":"Increase surplus.")},
                {label:"Burn sensitivity",score:expenses<4000?"✓ Lean":expenses<7000?"~ Moderate":"⚠ High Burn",        color:expenses<4000?T.green:expenses<7000?T.amber:T.red,  detail:"Each "+cfg.symbol+"1k cut = "+(1000/Math.max(1,expenses)).toFixed(2)+" more months runway."},
                {label:"Balance vs income",score:openingBalance>=income*2?"✓ Strong":openingBalance>=income?"~ Adequate":"⚠ Low",color:openingBalance>=income*2?T.green:openingBalance>=income?T.amber:T.red,detail:fmt(openingBalance)+" = "+(income>0?(openingBalance/income).toFixed(1):"—")+"× monthly income."},
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
          </CollapsibleSection>
          <CollapsibleSection title="Objective Assessment" icon="📋" accentColor={T.purple} defaultOpen={true} storeKey="ana-obj">
            <div>
              {[
                {area:"Housing",          color:rentAmt>income*.35?T.red:rentAmt>income*.28?T.amber:T.green, verdict:rentAmt>income*.35?"⚠ Elevated":rentAmt>income*.28?"~ Borderline":"✓ Reasonable", detail:"At "+pct(housing)+" of net income. "+cfg.taxYearNote},
                {area:"Savings Rate",     color:sRate>=30?T.green:sRate>=20?T.amber:T.red,                   verdict:sRate>=30?"✓ Strong":sRate>=20?"~ Moderate":"⚠ Insufficient",                   detail:pct(sRate)+" savings rate. Target 30%+ for aggressive wealth building."},
                {area:"Expense Control",  color:expenses<income*.65?T.green:expenses<income*.80?T.amber:T.red,verdict:expenses<income*.65?"✓ Controlled":expenses<income*.80?"~ Moderate":"⚠ High",   detail:"Total "+fmt(expenses)+"/mo = "+pct(income>0?(expenses/income)*100:0)+" of net income."},
                {area:"Tax Efficiency",   color:Number(effectiveRate)<25?T.green:Number(effectiveRate)<35?T.amber:T.red,verdict:Number(effectiveRate)<25?"✓ Efficient":Number(effectiveRate)<35?"~ Average":"⚠ High",detail:effectiveRate+"% effective rate. "+cfg.rentalNotes},
                {area:"Wealth Trajectory",color:savings>0||totalAssets>0?T.green:T.muted,verdict:savings>0||totalAssets>0?"✓ Building":"⚠ No Savings",detail:"At "+fmt(savings)+"/mo at "+pct(weightedReturn)+", plus "+fmtK(totalAssets)+" in assets, your combined net worth trajectory points toward "+fmtK(targetNetWorth)+". Open Projections to model your timeline."},
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
          </CollapsibleSection>
        </>)}

        <footer style={{textAlign:"center",marginTop:28,fontSize:10,color:T.border,paddingBottom:20}}>
          For personal planning purposes only · Not financial advice · FinCommand 2026
        </footer>
      </div>

      {/* ── OVERLAYS ───────────────────────────────────────────────────────── */}
      {showGuide&&<HowToGuide onClose={()=>setShowGuide(false)} />}
      {showGlossary&&<GlossaryPanel onClose={()=>setShowGlossary(false)} country={country} />}

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
          openingBalance, emergencyFundTarget:Math.round(expenses*6),
          cashRunwayMonths:expenses>0?Math.round(openingBalance/expenses):0,
          housingPct:income>0?Math.round((fixedItems.find(f=>f.name?.toLowerCase().includes("rent")||f.name?.toLowerCase().includes("mortgage"))?.amount||0)/income*100):0,
          totalAssets:Math.round(totalAssets),
          weightedAssetReturn:Math.round(weightedAssetReturn*10)/10,
          totalLiabilities:Math.round(totalLiabilities),
          netWorth:Math.round(netWorth),
          netWorthProjection30yr:Math.round((totalAssets+openingBalance)*Math.pow(1+weightedAssetReturn/100,30)+savings*12*((Math.pow(1+weightedAssetReturn/100,30)-1)/(weightedAssetReturn/100||0.07))),
          assets:(assets||[]).filter(a=>!a.excluded).map(a=>({name:a.name,category:a.category,value:a.value,annualReturn:a.annualReturn})),
          liabilities:(liabilities||[]).filter(l=>!l.excluded).map(l=>({name:l.name,category:l.category,balance:l.balance,interestRate:l.interestRate,monthlyPayment:l.monthlyPayment})),
          fixedExpenses:fixedItems.map(i=>({name:i.name,amount:i.amount})),
          variableExpenses:varItems.map(i=>({name:i.name,amount:i.amount})),
          savingsBuckets:savBuckets.map(i=>({name:i.name,amount:i.amount,annualReturn:i.annualReturn})),
          cashflowOneOffs:cashflow.months.filter(m=>(m.oneOffs||[]).length>0).map(m=>({month:m.label,items:(m.oneOffs||[]).map(o=>({label:o.label,amount:o.amount}))})),
          monthlySurplus:Math.round(rem),
        },null,2)}
      />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// GLOSSARY — expanded, region-aware financial definitions
// Each term has: term, cat (category), def (always shown), and an optional
// "regional" object mapping country codes to region-specific addendums.
// The GlossaryPanel uses the user's selected country to show the right context.
// ══════════════════════════════════════════════════════════════════════════════

// ── Region-specific terminology labels ──────────────────────────────────────
// Some concepts have completely different names by country. This maps the
// concept to the local name so the glossary header shows the right term.
const REGIONAL_TERM_LABELS = {
  // "Concept key" → { US: "local name", UK: "local name", ... }
  "Retirement Account":  { US:"401(k)", UK:"Pension / ISA", CA:"RRSP", AU:"Super", DE:"Riester-Rente" },
  "Social Contributions":{ US:"FICA",   UK:"National Insurance", CA:"CPP/EI", AU:"Medicare Levy", DE:"Sozialversicherung" },
  "State/Provincial Tax":{ US:"State Income Tax", UK:"N/A", CA:"Provincial Tax", AU:"N/A", DE:"Solidarity Surcharge" },
  "Tax Filing":          { US:"Form 1040", UK:"Self Assessment", CA:"T1 Return", AU:"Tax Return (ATO)", DE:"Einkommensteuererklärung" },
  "Net Pay Slip Label":  { US:"Net Pay", UK:"Net Pay / Take-Home", CA:"Net Pay", AU:"Net Pay", DE:"Netto" },
};

const GLOSSARY_TERMS = [
  // ── Income terms ──────────────────────────────────────────────────────────
  { term:"Net Income", cat:"Income",
    def:"Your take-home pay after all taxes and deductions. The actual amount that lands in your bank account. Sometimes called 'take-home pay' or 'net pay' — it's what you actually have to spend.",
    regional:{ UK:"On a UK payslip this appears as 'Net Pay'. Your personal allowance (£12,570 for 2024/25) means the first chunk of your income is tax-free.", AU:"On your Australian payslip this is 'Net Pay'. Your tax-free threshold is A$18,200.", CA:"Your T4 slip shows 'Total Earnings' (gross) vs what you actually receive after CPP, EI, and income tax deductions.", DE:"On a German payslip this is 'Netto'. The gross (Brutto) minus Lohnsteuer and Sozialversicherungsbeiträge." }},
  { term:"Gross Salary", cat:"Income",
    def:"Your salary before any deductions — the number on your job offer. In the UK, contracts quote gross; in the US, offers are usually gross too. Your net (take-home) is significantly less.",
    regional:{ UK:"UK employment contracts always quote gross. With a £50k gross salary, your net is roughly £37k after income tax and National Insurance.", US:"Your W-2 shows Box 1 (taxable wages) which may differ slightly from gross due to pre-tax benefit deductions like 401(k) contributions.", AU:"Your employment contract quotes gross. Your employer also pays Super on top — so actual cost to employer exceeds your gross.", DE:"Bruttolohn — the agreed amount before taxes and social insurance. Actual cost to employer (Arbeitgeberkosten) is roughly 120% of gross." }},
  { term:"Bonus", cat:"Income",
    def:"Additional compensation beyond your base salary — typically tied to performance or company results. Bonuses are often taxed at a higher withholding rate but ultimately taxed at your marginal rate.",
    regional:{ US:"Bonuses are often withheld at a flat 22% federal rate (supplemental wages), but your actual liability depends on your bracket. The difference is reconciled at filing.", UK:"Bonuses are taxed as employment income — same rates as salary. If a bonus pushes you into a higher band, only the portion above the threshold pays the higher rate.", AU:"Bonuses are taxed as ordinary income via PAYG withholding. If the bonus is large, ATO may have overtaxed — claim the difference in your return.", CA:"Employment bonuses are subject to CPP, EI, and income tax. The ATO bonus method helps calculate correct withholding." }},
  { term:"Dividend Income", cat:"Income",
    def:"Payments made to shareholders from a company's profits. Treated differently from salary in most countries — often at a lower tax rate, making them tax-efficient for business owners.",
    regional:{ UK:"UK has a dividend allowance (£500 for 2024/25). Above that: 8.75% (basic rate), 33.75% (higher), 39.35% (additional). Much more tax-efficient than salary if you're a limited company director.", US:"'Qualified dividends' are taxed at 0%, 15%, or 20% depending on your income bracket — significantly lower than ordinary income rates.", AU:"Australia's franking credit system means you receive a credit for tax already paid by the company — often resulting in a refund if you're a low earner.", CA:"The dividend tax credit reduces tax on eligible Canadian dividends. Non-eligible dividends (small business) have a lower credit." }},

  // ── Tax terms ─────────────────────────────────────────────────────────────
  { term:"Effective Tax Rate", cat:"Tax",
    def:"The actual overall percentage of your total income that you pay in tax — not your highest bracket rate. If you earn $100k and pay $22k in tax, your effective rate is 22%. This is always lower than your marginal rate.",
    regional:{ US:"Your effective rate blends federal income tax, state tax, and FICA. Most people pay significantly less than their top marginal bracket.", UK:"UK effective rates are complicated by the personal allowance taper above £100k — between £100k–£125,140, the effective marginal rate is 60% as you lose £1 of allowance per £2 of income.", AU:"Australia has no flat personal tax allowance. Each bracket applies only to income within that range — your effective rate smooths this out.", CA:"Your effective rate blends federal and provincial taxes. Ontario residents around $80k face an effective rate of roughly 26–28%." }},
  { term:"Marginal Tax Rate", cat:"Tax",
    def:"The tax rate applied only to your next dollar/pound/dollar of income. Earning more doesn't mean ALL your income is taxed at the higher rate — only the amount above the threshold. This is the rate that matters when deciding whether overtime or a pay rise is worth it.",
    regional:{ UK:"At £50,270 you enter the 40% higher rate band. But only income ABOVE this is taxed at 40%. The common misconception that a pay rise 'pushes you into a new bracket' is mostly wrong.", US:"The US has 7 federal tax brackets (10%–37%). Add state tax (0%–13.3%) and FICA. Your combined marginal rate could be 35–50%+ in high-tax states.", AU:"Australia has 5 brackets. At A$120,000 you hit 37%. The 2% Medicare levy applies on top. High earners also face the Medicare Levy Surcharge if uninsured.", CA:"Federal rates 15%–33% plus provincial. Ontario's combined top rate is ~53.5%." }},
  { term:"FICA (US)", cat:"Tax",
    def:"US payroll taxes: Social Security (6.2%) and Medicare (1.45%) automatically deducted from your paycheck. Social Security caps at $160,200 of earnings. Your employer matches these amounts. If self-employed, you pay both sides (15.3%).",
    regional:{ US:"High earners (>$200k single/$250k joint) pay an extra 0.9% Medicare surtax. There's no cap on Medicare contributions — only Social Security." }},
  { term:"National Insurance (UK)", cat:"Tax",
    def:"UK payroll contributions (similar to US FICA) funding the state pension, NHS, and benefits system. You pay 8% on earnings between £12,570–£50,270 and 2% above that. Your employer also contributes 13.8%.",
    regional:{ UK:"Class 1 NI applies to employees. Class 2 and 4 apply to the self-employed. Gaps in your NI record reduce your state pension entitlement — you can buy missing years." }},
  { term:"CPP & EI (Canada)", cat:"Tax",
    def:"Canada Pension Plan (CPP) contributions build your retirement benefit. Employment Insurance (EI) premiums fund jobless benefits. Both are deducted from your paycheque and partially matched by your employer.",
    regional:{ CA:"CPP2 introduced an additional top-up contribution from 2024 on earnings between the Year's Maximum Pensionable Earnings and a higher ceiling. Maximum contribution rates increase periodically." }},
  { term:"Medicare Levy (Australia)", cat:"Tax",
    def:"A 2% levy on taxable income funding Australia's public healthcare system (Medicare). High earners without private hospital cover also pay the Medicare Levy Surcharge (1%–1.5%).",
    regional:{ AU:"If your income exceeds $93k (single, 2024) and you don't have private hospital insurance, you pay the Surcharge on top. Private insurance is often cheaper than the surcharge." }},
  { term:"Sozialversicherung (Germany)", cat:"Tax",
    def:"German social insurance contributions covering pension (Rentenversicherung), health (Krankenversicherung), care (Pflegeversicherung), and unemployment (Arbeitslosenversicherung). Both employer and employee contribute ~19.5% each.",
    regional:{ DE:"Contribution ceilings (Beitragsbemessungsgrenzen) mean high earners pay no additional contributions above the cap. Switching to private health insurance (PKV) can reduce contributions for higher earners." }},
  { term:"Self Assessment (UK)", cat:"Tax",
    def:"The UK's annual tax filing system for income not taxed at source — rental income, freelance work, overseas income, or income above £100k. Deadline: 31 January (online). Late filing: automatic £100 penalty.",
    regional:{ UK:"If you have rental income in the UK while living abroad, the Non-Resident Landlord Scheme (NRLS) applies — either your letting agent withholds basic rate tax, or you apply to receive rents gross via HMRC form NRL1." }},
  { term:"Capital Gains Tax", cat:"Tax",
    def:"Tax on profit from selling assets (shares, property, crypto) for more than you paid. Usually taxed at lower rates than income — the 'reward' for taking investment risk.",
    regional:{ US:"Short-term gains (<1 year held) taxed as ordinary income. Long-term gains taxed at 0%, 15%, or 20% depending on income. $3k annual loss deduction limit against income.", UK:"Annual CGT allowance reduced to £3,000 (2024/25). Rates: 10%/18% (basic rate) and 20%/24% (higher rate, higher for residential property).", AU:"If held >12 months: 50% CGT discount applies. So on a $20k gain, only $10k is added to taxable income.", CA:"50% of capital gains included in income (inclusion rate). Simple but less favourable than the old 50% inclusion for larger gains at higher brackets.", DE:"Final withholding tax (Abgeltungsteuer) of 25% on investment income including capital gains. Saver's lump-sum (Sparerpauschbetrag) of €1,000/€2,000 per year tax-free." }},
  { term:"Foreign Tax Credit", cat:"Tax",
    def:"A mechanism preventing you from being taxed twice on the same income in two countries. If you've paid UK tax on rental income, you can usually offset this against your US tax liability on the same income.",
    regional:{ US:"The US taxes citizens on worldwide income regardless of residence. The Foreign Tax Credit (Form 1116) or Foreign Earned Income Exclusion (Form 2555) are your main protections against double taxation.", UK:"The UK has tax treaties with 130+ countries. Non-residents with UK property must report and pay UK tax on rental profits — but can offset against home country tax via the treaty." }},
  { term:"Non-Resident Landlord Scheme", cat:"Tax",
    def:"(UK specific) If you live outside the UK but own UK rental property, your tenant or letting agent must deduct basic rate income tax (20%) from the rent unless HMRC approves you to receive rents gross. Apply on form NRL1.",
    regional:{ UK:"You can apply to HMRC to receive rental income gross (without deduction) if you're up-to-date with UK taxes. This simplifies cashflow. You still complete a UK Self Assessment and pay any tax owed annually." }},

  // ── Budgeting terms ───────────────────────────────────────────────────────
  { term:"Monthly Surplus", cat:"Budgeting",
    def:"What's left each month after paying all expenses AND hitting your savings targets. Positive = you're building wealth. Negative = spending more than you earn. Even a small consistent surplus compounds significantly.",
    regional:{}},
  { term:"Cash Runway", cat:"Budgeting",
    def:"How many months you could cover all expenses using only current liquid savings with no income. 3 months is the minimum; 6 months is the recommended 'gold standard'. A thin runway means any shock forces you to sell investments at the worst time.",
    regional:{ US:"US healthcare costs make a larger emergency fund more critical — a single hospitalisation can exceed $10k–$50k. 6 months is especially important here.", UK:"The UK's NHS and more generous statutory sick pay reduce the emergency fund threshold slightly, though redundancy notice periods make 3–6 months still prudent.", AU:"Australia's Super can't be accessed until preservation age — it doesn't count as emergency fund. Maintain liquid savings separately.", DE:"Germany's robust social safety net (Arbeitslosengeld I) provides up to 12–24 months of income replacement, somewhat reducing the urgency of a large personal emergency fund." }},
  { term:"Savings Rate", cat:"Budgeting",
    def:"The percentage of your net income saved each month. 20% is considered healthy; 30%+ is strong for wealth building. The FIRE movement targets 50%+ to retire early. Even moving from 10% to 15% meaningfully accelerates financial independence.",
    regional:{}},
  { term:"Housing Ratio", cat:"Budgeting",
    def:"Rent or mortgage as a percentage of net income. The traditional rule is <30%. In expensive cities (LA, London, Sydney) many people exceed this — but the higher the ratio, the less flexibility you have for saving and investing.",
    regional:{ US:"The 28% front-end ratio is the traditional US mortgage guideline. In LA, SF, NYC this is often impossible at median income.", UK:"UK lenders typically cap mortgages at 4.5× income. London renters paying 40%+ of income on housing is common — but compresses savings significantly.", AU:"Sydney and Melbourne renters commonly pay 35–45% of income on housing. Super contributions partly offset the reduced savings capacity.", CA:"Toronto and Vancouver housing costs mean the 30% rule is largely aspirational for renters. The 'stress test' for mortgages uses a qualifying rate 2% above the offered rate." }},
  { term:"Fixed vs Variable Costs", cat:"Budgeting",
    def:"Fixed costs are the same every month (rent, insurance, subscriptions). Variable costs fluctuate (groceries, dining, entertainment). Fixed costs are harder to cut but savings are permanent. Variable costs are easier to trim but require ongoing discipline.",
    regional:{}},
  { term:"50/30/20 Rule", cat:"Budgeting",
    def:"A simple budgeting framework: 50% of net income on needs (housing, food, transport), 30% on wants (dining out, entertainment, travel), 20% on savings and debt repayment. Not perfect — but a useful starting benchmark.",
    regional:{}},

  // ── Savings terms ─────────────────────────────────────────────────────────
  { term:"Emergency Fund", cat:"Savings",
    def:"A dedicated liquid cash reserve for unexpected events — job loss, medical bills, car breakdown, urgent repairs. Separate from investments. The goal is 3–6 months of total expenses. Without it, financial shocks force you to borrow or sell investments at the wrong time.",
    regional:{}},
  { term:"ISA (UK)", cat:"Savings",
    def:"Individual Savings Account — a UK tax wrapper allowing up to £20,000/year in savings and investments with zero UK tax on growth, interest, or withdrawals. Stocks and Shares ISA = invest; Cash ISA = save. Far more tax-efficient than a standard account.",
    regional:{ UK:"Lifetime ISA (LISA) offers a 25% government bonus on up to £4,000/year (max £1,000 bonus) — specifically for first-time property purchase or retirement from age 60." }},
  { term:"401(k) / Pension", cat:"Savings",
    def:"Tax-advantaged retirement savings. Contributions reduce taxable income now; money grows tax-deferred until retirement. Employer matching is 'free money' — always at least contribute enough to get the full match.",
    regional:{ US:"2024 401(k) contribution limit: $23,000 (+$7,500 catch-up if 50+). Traditional = pre-tax; Roth = post-tax growth. Consider Roth if you expect higher taxes in retirement.", UK:"UK pensions (workplace or SIPP) benefit from tax relief at your marginal rate. A £100 pension contribution costs a higher rate taxpayer only £60 after tax relief. Annual allowance: £60,000.", AU:"Compulsory Super is 11% employer contribution in 2024. You can 'salary sacrifice' additional amounts pre-tax. Total concessional cap: A$27,500.", CA:"RRSP contribution room: 18% of prior year earned income, max $31,560 (2024). Unused room carries forward indefinitely. TFSA (Tax-Free Savings Account): $7,000/year (2024), no tax on growth or withdrawal.", DE:"State pension (Rentenversicherung) is the main system. Additional options: Riester-Rente (government-subsidised, favours families) and Rürup-Rente (Basisrente, tax-deductible, suits self-employed)." }},
  { term:"TFSA (Canada)", cat:"Savings",
    def:"Tax-Free Savings Account — Canada's most flexible investment account. Contributions are not tax-deductible, but all growth, income, and withdrawals are tax-free. Unused room carries forward indefinitely and withdrawn amounts are re-added to room the following year.",
    regional:{ CA:"2024 TFSA annual contribution room: $7,000. Total cumulative room since 2009 is $95,000. Unlike RRSP, TFSA withdrawals don't affect income-tested benefits or credits." }},
  { term:"Superannuation (Australia)", cat:"Savings",
    def:"Australia's compulsory employer-funded retirement savings system. Employers must contribute at least 11% of your earnings into your Super fund. You can also make personal (after-tax) or salary sacrifice (pre-tax) contributions.",
    regional:{ AU:"The concessional (pre-tax) contribution cap is A$27,500. Non-concessional (after-tax) cap is A$110,000. Super can't be accessed until your preservation age (currently 60). Choosing a low-fee index fund Super can save tens of thousands over a career." }},

  // ── Investing terms ───────────────────────────────────────────────────────
  { term:"Compound Interest", cat:"Investing",
    def:"Earning returns on your returns. A £10k investment at 7%/year becomes £19.7k in 10 years without adding a single penny — purely from growth compounding on itself. The longer the time horizon, the more powerful this becomes.",
    regional:{}},
  { term:"Index Funds / ETFs", cat:"Investing",
    def:"Investment funds that track a market index (like the S&P 500 or global MSCI World). Low-cost, automatically diversified, and historically outperform most actively managed funds over the long term.",
    regional:{ US:"Vanguard, Fidelity, and Schwab offer zero-cost index funds. VOO (S&P 500 ETF) expense ratio: 0.03%.", UK:"Vanguard UK, iShares, and HSBC offer low-cost index trackers. In an ISA or SIPP they're especially powerful — all growth is tax-free.", AU:"Vanguard Australia and BetaShares offer ASX-listed ETFs (e.g. VAS, VGS). Inside Super, investment options vary by fund.", CA:"Vanguard Canada, iShares, and BMO ETFs. VGRO and XGRO are popular all-in-one balanced ETFs." }},
  { term:"7% Return Assumption", cat:"Investing",
    def:"The historical average annual real return of a globally diversified stock portfolio over long periods, after inflation. Used as a conservative planning benchmark. The S&P 500 has returned ~10% nominal (~7% real) over the last century.",
    regional:{}},
  { term:"Dollar-Cost Averaging", cat:"Investing",
    def:"Investing a fixed amount at regular intervals regardless of market price. Removes the impossible task of timing the market. Buys more shares when prices are low, fewer when high — smoothing your average cost over time.",
    regional:{}},
  { term:"Asset Allocation", cat:"Investing",
    def:"How you divide investments across categories: stocks, bonds, property, cash, alternatives. The classic rule of thumb: (100 minus your age) in stocks. Risk tolerance, time horizon, and income stability should all influence your allocation.",
    regional:{}},

  // ── Cashflow terms ────────────────────────────────────────────────────────
  { term:"One-off Cash Movements", cat:"Cashflow",
    def:"Non-recurring costs or income in a given month — holiday, car service, new appliance, medical bill, moving costs. They don't appear every month but can significantly dent your cash position. Adding them to specific months in FinCommand gives you an accurate forecast.",
    regional:{}},
  { term:"Closing Balance", cat:"Cashflow",
    def:"The projected amount of liquid cash at the end of a given month, after all income, regular expenses, savings, and one-off cash movements. Your cashflow is healthy when this stays positive and above 2× monthly expenses.",
    regional:{}},
  { term:"Cash Floor", cat:"Cashflow",
    def:"The lowest point your cash balance hits over the forecast period. This is the number to watch — if your cash floor goes negative, you'll need to borrow or break into savings at that moment.",
    regional:{}},
  { term:"Recurring Surplus", cat:"Cashflow",
    def:"Your monthly net: income minus all regular expenses and savings contributions. This is the baseline amount your cash balance should grow by each month, before any one-off cash movements hit.",
    regional:{}},

  // ── Wealth terms ──────────────────────────────────────────────────────────
  { term:"Net Worth", cat:"Wealth",
    def:"Everything you own (assets: savings, investments, property, car) minus everything you owe (liabilities: mortgage, loans, credit card debt). Your salary doesn't build wealth directly — your net worth does.",
    regional:{}},
  { term:"Liquidity", cat:"Wealth",
    def:"How quickly you can turn an asset into cash without significant loss of value. Cash: fully liquid. Stocks: liquid (1–2 days to sell). Property: illiquid (weeks to months). FinCommand's 'liquid balance' only counts immediately accessible cash.",
    regional:{}},
  { term:"Negative Gearing (AU)", cat:"Wealth",
    def:"(Australia-specific) When your investment property's costs (interest, maintenance, depreciation) exceed rental income, creating a loss. This loss offsets your taxable income, reducing your tax bill. Widely used in Australia as a property investment strategy.",
    regional:{ AU:"Negative gearing works best for high-income earners at the 37–45% marginal rate. The 50% CGT discount on eventual sale adds further tax efficiency, though critics argue it inflates property prices." }},
  { term:"$1.9M / Target", cat:"Wealth",
    def:"FinCommand's default wealth target — approximately enough to safely withdraw £60,000–$90,000/year using the 4% rule in retirement. Based on research showing 4% annual withdrawals from a diversified portfolio survive 30+ year retirements.",
    regional:{ UK:"In GBP terms this is approximately £1.5M — enough to generate ~£60k/yr. Inflation means this target should be revisited every few years.", AU:"In AUD terms: approximately A$2.9M at current rates. Your Super balance reduces the personal savings required.", CA:"In CAD terms: approximately CA$2.6M. CPP benefits and OAS payments in retirement reduce personal savings requirements." }},
  { term:"4% Safe Withdrawal Rate", cat:"Wealth",
    def:"The widely-cited guideline from the Trinity Study: retirees can withdraw 4% of their portfolio in year 1, then adjust for inflation each year, and the portfolio has historically lasted 30+ years. It's a planning tool — not a guarantee.",
    regional:{}},
];

function GlossaryPanel({ onClose, country }) {
  const T=useTheme();
  const [search,setSearch]=useState("");
  const [cat,setCat]=useState("All");
  // Dynamically build category list from the terms
  const cats=["All",...[...new Set(GLOSSARY_TERMS.map(g=>g.cat))]];
  const filtered=GLOSSARY_TERMS.filter(g=>{
    const matchCat=cat==="All"||g.cat===cat;
    const matchSearch=!search.trim()||g.term.toLowerCase().includes(search.toLowerCase())||g.def.toLowerCase().includes(search.toLowerCase());
    return matchCat&&matchSearch;
  });

  return (
    <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"flex-start",justifyContent:"flex-end",padding:"60px 20px 20px"}}>
      {/* Backdrop — click to close */}
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"#00000066",backdropFilter:"blur(4px)"}} />
      {/* Panel */}
      <div style={{position:"relative",width:"100%",maxWidth:540,maxHeight:"calc(100vh - 80px)",background:T.card,border:"1px solid "+T.border,borderRadius:16,display:"flex",flexDirection:"column",boxShadow:"0 24px 64px #00000077",overflow:"hidden"}}>
        {/* Header */}
        <div style={{padding:"18px 20px 14px",borderBottom:"1px solid "+T.border,background:T.surface,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:32,height:32,background:T.amber+"22",border:"1px solid "+T.amber+"44",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>💡</div>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:T.text}}>Finance Glossary</div>
                {/* Show how many terms and the active country for regional context */}
                <div style={{fontSize:11,color:T.muted}}>{filtered.length} of {GLOSSARY_TERMS.length} terms · {country?TAX_CONFIGS[country]?.flag+" ":""}regional context active</div>
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
          {filtered.map((g,i)=>{
            // Show regional context if this country has a specific addendum for this term
            const regionalNote = country && g.regional && g.regional[country];
            return (
              <div key={g.term} style={{padding:"14px 20px",borderBottom:i<filtered.length-1?"1px solid "+T.border+"44":"none"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <span style={{fontSize:12,fontWeight:700,color:T.text,fontFamily:"monospace"}}>{g.term}</span>
                  <span style={{fontSize:9,letterSpacing:1.2,textTransform:"uppercase",color:T.amber,background:T.amber+"18",padding:"2px 7px",borderRadius:10,fontFamily:"monospace"}}>{g.cat}</span>
                </div>
                {/* Main definition — always shown */}
                <p style={{margin:"0 0 0",fontSize:12,color:T.muted,lineHeight:1.75}}>{g.def}</p>
                {/* Regional addendum — shown only when relevant to user's country */}
                {regionalNote&&(
                  <div style={{marginTop:8,padding:"8px 12px",background:T.blue+"0d",border:"1px solid "+T.blue+"33",borderRadius:8}}>
                    <div style={{fontSize:9,color:T.blue,letterSpacing:1.5,textTransform:"uppercase",fontFamily:"monospace",marginBottom:4,fontWeight:700}}>
                      {TAX_CONFIGS[country]?.flag} {TAX_CONFIGS[country]?.name} context
                    </div>
                    <p style={{margin:0,fontSize:11,color:T.muted,lineHeight:1.7}}>{regionalNote}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{padding:"10px 20px",borderTop:"1px solid "+T.border,fontSize:10,color:T.muted,textAlign:"center",flexShrink:0}}>
          Definitions simplified for educational purposes · Not financial advice
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

    // ── Route: Edge Function (if deployed) or direct Anthropic API ──────────
    const useEdge = IS_CONFIGURED && IS_EDGE_DEPLOYED;

    try {
      // Get auth token to authenticate with the edge function
      let authHeader = {};
      if(IS_CONFIGURED && IS_EDGE_DEPLOYED){
        const sb = await getSb();
        if(sb){
          const { data:{ session } } = await sb.auth.getSession();
          if(session?.access_token) authHeader = { "Authorization": "Bearer " + session.access_token };
        }
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
        // Migrate old saves to current schema
        if(!data.dashboard.cashflow) data.dashboard.cashflow=DEFAULT_CASHFLOW();
        if(data.dashboard.usdBalance && data.dashboard.cashflow.openingBalance===5000)
          data.dashboard.cashflow.openingBalance=data.dashboard.usdBalance;
        if(!data.dashboard.targetNetWorth) data.dashboard.targetNetWorth=DEFAULT_TARGET_NW;
        if(!data.dashboard.studentLoan) data.dashboard.studentLoan={enabled:false,plan:"plan2",postgrad:false};
        if(!data.dashboard.assets) data.dashboard.assets=DEFAULT_ASSETS();
        if(!data.dashboard.liabilities) data.dashboard.liabilities=DEFAULT_LIABILITIES();
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
