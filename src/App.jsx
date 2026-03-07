import React, { useState, useMemo, useEffect, useRef, useCallback, useContext, createContext } from "react";

// ── Inject responsive global styles ──────────────────────────────────────────
const GLOBAL_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body, #root { height: 100%; margin: 0; padding: 0; }
  body { overflow-x: hidden; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #2a3040; border-radius: 3px; }
  input[type=range] { -webkit-appearance: none; appearance: none; }
  input[type=range]:focus { outline: none; }

  /* Responsive grid helpers */
  .fc-grid-2  { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .fc-grid-3  { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
  .fc-grid-5  { display: grid; grid-template-columns: repeat(5,1fr); gap: 10px; }
  .fc-health  { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; }
  .fc-runway4 { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; }
  .fc-analysis{ display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

  @media (max-width: 1100px) {
    .fc-grid-5  { grid-template-columns: repeat(3,1fr); }
  }
  @media (max-width: 860px) {
    .fc-grid-2  { grid-template-columns: 1fr; }
    .fc-grid-3  { grid-template-columns: 1fr 1fr; }
    .fc-grid-5  { grid-template-columns: 1fr 1fr; }
    .fc-health  { grid-template-columns: 1fr 1fr; }
    .fc-runway4 { grid-template-columns: 1fr 1fr; }
    .fc-analysis{ grid-template-columns: 1fr; }
  }
  @media (max-width: 560px) {
    .fc-grid-2  { grid-template-columns: 1fr; }
    .fc-grid-3  { grid-template-columns: 1fr; }
    .fc-grid-5  { grid-template-columns: 1fr; }
    .fc-health  { grid-template-columns: 1fr; }
    .fc-runway4 { grid-template-columns: 1fr 1fr; }
    .fc-analysis{ grid-template-columns: 1fr; }
  }
`;
function GlobalStyles() {
  return <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />;
}

// ══════════════════════════════════════════════════════════════════════════════
// SUPABASE ADAPTER
// ══════════════════════════════════════════════════════════════════════════════
const MOCK_MODE     = true;
const SUPABASE_URL  = "https://cjgazhrxexjvztkzaujk.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqZ2F6aHJ4ZXhqdnp0a3phdWprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MTY0OTgsImV4cCI6MjA4ODQ5MjQ5OH0.2CB4zj-1z5RrS728vM87mq4rM1vnnxuahqE09HGuOXM";


const MOCK_STORE_KEY = "fincommand_mock_v1";
function getMockStore() { try { return JSON.parse(localStorage.getItem(MOCK_STORE_KEY) || "{}"); } catch { return {}; } }
function setMockStore(d) { try { localStorage.setItem(MOCK_STORE_KEY, JSON.stringify(d)); } catch {} }
const MOCK_USER = { id:"mock-user-001", email:"demo@fincommand.app", user_metadata:{ full_name:"Demo User" } };

const mockDb = {
  async getSession()          { const s=getMockStore(); return s.authed?{user:MOCK_USER}:null; },
  async signInEmail()         { setMockStore({...getMockStore(),authed:true}); return {user:MOCK_USER,error:null}; },
  async signUpEmail()         { setMockStore({...getMockStore(),authed:true}); return {user:MOCK_USER,error:null}; },
  async signInGoogle()        { setMockStore({...getMockStore(),authed:true}); return {user:MOCK_USER,error:null}; },
  async signOut()             { setMockStore({}); return {error:null}; },
  async loadUserData()        { const s=getMockStore(); return s.userData?{data:s.userData,error:null}:{data:null,error:null}; },
  async saveUserData(_,payload){ setMockStore({...getMockStore(),userData:payload}); return {error:null}; },
};

let _supabase = null;
async function getSupabase() {
  if (_supabase) return _supabase;
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  _supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
  return _supabase;
}
const realDb = {
  async getSession()          { const sb=await getSupabase(); const {data:{session}}=await sb.auth.getSession(); return session?{user:session.user}:null; },
  async signInEmail(e,p)      { const sb=await getSupabase(); const {data,error}=await sb.auth.signInWithPassword({email:e,password:p}); return {user:data?.user||null,error}; },
  async signUpEmail(e,p)      { const sb=await getSupabase(); const {data,error}=await sb.auth.signUp({email:e,password:p}); return {user:data?.user||null,error}; },
  async signInGoogle()        { const sb=await getSupabase(); const {error}=await sb.auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.origin}}); return {error}; },
  async signOut()             { const sb=await getSupabase(); return sb.auth.signOut(); },
  async loadUserData(uid)     { const sb=await getSupabase(); const {data,error}=await sb.from("user_data").select("*").eq("user_id",uid).maybeSingle(); return {data:data||null,error}; },
  async saveUserData(uid,payload){ const sb=await getSupabase(); const {error}=await sb.from("user_data").upsert({user_id:uid,...payload,updated_at:new Date().toISOString()}); return {error}; },
};
const db = MOCK_MODE ? mockDb : realDb;

// ══════════════════════════════════════════════════════════════════════════════
// THEME SYSTEM
// Bug fixes: T was module-level constant — all components used stale colour refs.
// Now T is reactive via ThemeContext. Every component reads theme via useTheme().
// ══════════════════════════════════════════════════════════════════════════════
const THEMES = {
  terminal: {
    id:"terminal", name:"Terminal", emoji:"🖥️",
    bg:"#08090b", surface:"#0f1114", card:"#141719", border:"#1e2329",
    text:"#e8eaf0", muted:"#4a5568", faint:"#1a1f26",
    green:"#00c896", red:"#ff4d6d", amber:"#f5a623", blue:"#4d9fff", purple:"#b57bee",
    accent:"#00c896",
  },
  spring: {
    id:"spring", name:"Spring", emoji:"🌸",
    bg:"#f7f4f0", surface:"#ede8e2", card:"#ffffff", border:"#d9cfc6",
    text:"#2d2420", muted:"#8a7d74", faint:"#e8e0d8",
    green:"#5a9e6f", red:"#c96b6b", amber:"#c8883a", blue:"#5b8fb9", purple:"#9b72b0",
    accent:"#d4699e",
  },
  autumn: {
    id:"autumn", name:"Autumn", emoji:"🍂",
    bg:"#1a1208", surface:"#251a0a", card:"#2e2010", border:"#3d2e15",
    text:"#f0e0c0", muted:"#8a7050", faint:"#3a2a12",
    green:"#8ab840", red:"#e05030", amber:"#e08020", blue:"#7090c0", purple:"#b06890",
    accent:"#e08020",
  },
  westafrica: {
    id:"westafrica", name:"Kente", emoji:"🇬🇭",
    bg:"#0e0a02", surface:"#1a1404", card:"#221c06", border:"#332a08",
    text:"#fef0c0", muted:"#907840", faint:"#2a2208",
    green:"#40a840", red:"#e03010", amber:"#f0a800", blue:"#2080c0", purple:"#9840c0",
    accent:"#f0a800",
  },
};

const ThemeContext = createContext(THEMES.terminal);
const useTheme = () => useContext(ThemeContext);

// ══════════════════════════════════════════════════════════════════════════════
// TAX ENGINE
// ══════════════════════════════════════════════════════════════════════════════
const TAX_CONFIGS = {
  US:{ name:"United States",  flag:"🇺🇸", currency:"USD", symbol:"$",   fxToUSD:1,
       brackets:[{up:11600,rate:.10},{up:47150,rate:.12},{up:100525,rate:.22},{up:191950,rate:.24},{up:243725,rate:.32},{up:609350,rate:.35},{up:Infinity,rate:.37}],
       stateRate:0.093, ficaRate:0.0765, ficaCap:160200,
       rentalNotes:"Declare worldwide income. US-UK tax treaty prevents double-taxation via foreign tax credit.",
       taxYearNote:"Tax year: Jan 1 – Dec 31. Filing deadline: April 15." },
  UK:{ name:"United Kingdom", flag:"🇬🇧", currency:"GBP", symbol:"£",   fxToUSD:1.27,
       brackets:[{up:12570,rate:0},{up:50270,rate:.20},{up:125140,rate:.40},{up:Infinity,rate:.45}],
       niRate:0.08, niUpperThreshold:50270, niLowerThreshold:12570, niAboveUpperRate:0.02,
       rentalNotes:"Rental income taxed at marginal rate. £1,000 property allowance. NRLS applies if non-resident.",
       taxYearNote:"Tax year: Apr 6 – Apr 5. Self Assessment deadline: Jan 31." },
  CA:{ name:"Canada",         flag:"🇨🇦", currency:"CAD", symbol:"CA$", fxToUSD:0.74,
       brackets:[{up:55867,rate:.15},{up:111733,rate:.205},{up:154906,rate:.26},{up:220000,rate:.29},{up:Infinity,rate:.33}],
       provincialRate:0.1115, cppRate:0.0595, cppCap:68500, eiRate:0.0166, eiCap:63200,
       rentalNotes:"Rental income added to total income. 50% of capital gains included. Principal residence exempt.",
       taxYearNote:"Tax year: Jan 1 – Dec 31. Filing deadline: April 30." },
  AU:{ name:"Australia",      flag:"🇦🇺", currency:"AUD", symbol:"A$",  fxToUSD:0.65,
       brackets:[{up:18200,rate:0},{up:45000,rate:.19},{up:120000,rate:.325},{up:180000,rate:.37},{up:Infinity,rate:.45}],
       medicareLevy:0.02,
       rentalNotes:"Negative gearing allowed. Rental losses offset other income. 50% CGT discount for assets held >12 months.",
       taxYearNote:"Tax year: Jul 1 – Jun 30. Filing deadline: Oct 31." },
  DE:{ name:"Germany",        flag:"🇩🇪", currency:"EUR", symbol:"€",   fxToUSD:1.09,
       brackets:[{up:11604,rate:0},{up:17006,rate:.14},{up:66761,rate:.24},{up:277826,rate:.42},{up:Infinity,rate:.45}],
       solidarityRate:0.055, socialInsuranceRate:0.195,
       rentalNotes:"Rental income (Vermietung) taxed at marginal rate. Depreciation (AfA) at 2% pa on building value.",
       taxYearNote:"Tax year: Jan 1 – Dec 31. Filing deadline: Jul 31." },
};

function calcTax(country, grossAnnual, bonusAnnual) {
  const cfg = TAX_CONFIGS[country] || TAX_CONFIGS.US;
  const totalGross = grossAnnual + bonusAnnual;
  if (totalGross <= 0) return { netSalary:0, netBonus:0, effectiveRate:"0.0", annualTax:0 };
  let incomeTax=0, prev=0;
  for (const b of cfg.brackets) {
    if (totalGross<=prev) break;
    incomeTax += (Math.min(totalGross,b.up)-prev)*b.rate;
    prev = b.up;
  }
  let extraTax=0;
  if (country==="US")    { extraTax+=totalGross*cfg.stateRate; extraTax+=Math.min(grossAnnual,cfg.ficaCap)*cfg.ficaRate; }
  else if (country==="UK"){ const niBase=Math.max(0,Math.min(grossAnnual,cfg.niUpperThreshold)-cfg.niLowerThreshold); extraTax+=niBase*cfg.niRate+Math.max(0,grossAnnual-cfg.niUpperThreshold)*cfg.niAboveUpperRate; }
  else if (country==="CA"){ extraTax+=totalGross*cfg.provincialRate; extraTax+=Math.min(grossAnnual,cfg.cppCap)*cfg.cppRate; extraTax+=Math.min(grossAnnual,cfg.eiCap)*cfg.eiRate; }
  else if (country==="AU"){ extraTax+=totalGross*cfg.medicareLevy; }
  else if (country==="DE"){ extraTax+=incomeTax*cfg.solidarityRate; extraTax+=totalGross*cfg.socialInsuranceRate; }
  const totalTax = incomeTax+extraTax;
  const netRatio = Math.max(0, 1-totalTax/totalGross);
  return { netSalary:Math.round((grossAnnual/12)*netRatio), netBonus:Math.round((bonusAnnual/12)*netRatio), effectiveRate:(totalTax/totalGross*100).toFixed(1), annualTax:Math.round(totalTax) };
}

// ══════════════════════════════════════════════════════════════════════════════
// PURE HELPERS & CONSTANTS (theme-independent)
// ══════════════════════════════════════════════════════════════════════════════
const TARGET_USD = 1900000;
const fv  = (mo,rate,yrs) => { if(mo<=0||yrs<=0)return 0; const r=rate/12; return mo*((Math.pow(1+r,yrs*12)-1)/r)*(1+r); };
const sum = (arr,key) => arr.filter(i=>!i.excluded).reduce((s,i)=>s+(i[key]||0),0);
const pct = n => (typeof n==="number"&&isFinite(n)&&!isNaN(n))?n.toFixed(1)+"%":"—";

const INTERVAL_MODES = [
  {id:"1m",label:"Monthly", steps:Array.from({length:12},(_,i)=>(i+1)/12),  fmt:y=>"M"+Math.round(y*12)},
  {id:"6m",label:"6-Month", steps:Array.from({length:10},(_,i)=>(i+1)*0.5), fmt:y=>y<1?"6m":y+"yr"},
  {id:"1y",label:"Yearly",  steps:[1,2,3,4,5,6,7,8,10,12,15],               fmt:y=>y+"yr"},
  {id:"2y",label:"2-Year",  steps:[2,4,6,8,10,12,15,20],                    fmt:y=>y+"yr"},
  {id:"5y",label:"5-Year",  steps:[5,10,15,20,25,30],                       fmt:y=>y+"yr"},
];
const TABS         = [{id:"overview",label:"Overview"},{id:"income",label:"Income"},{id:"expenses",label:"Expenses"},{id:"savings",label:"Savings"},{id:"projections",label:"Projections"},{id:"analysis",label:"Analysis"}];
const INCOME_TYPES = [{value:"salary",label:"Salary"},{value:"bonus",label:"Bonus"},{value:"rental",label:"Rental"},{value:"dividend",label:"Dividend"},{value:"freelance",label:"Freelance"},{value:"other",label:"Other"}];

const DEFAULT_FIXED = () => [
  {id:1, name:"Rent / Mortgage",  amount:2000,excluded:false},
  {id:2, name:"Health Insurance", amount:200, excluded:false},
  {id:3, name:"Internet",         amount:60,  excluded:false},
  {id:4, name:"Phone",            amount:60,  excluded:false},
  {id:5, name:"Electricity",      amount:100, excluded:false},
  {id:6, name:"Subscriptions",    amount:80,  excluded:false},
  {id:7, name:"Gym & Wellness",   amount:80,  excluded:false},
  {id:8, name:"Transport / Car",  amount:200, excluded:false},
];
const DEFAULT_VAR = () => [
  {id:10,name:"Groceries",   amount:400,excluded:false},{id:11,name:"Dining Out",   amount:300,excluded:false},
  {id:12,name:"Entertainment",amount:200,excluded:false},{id:13,name:"Clothing",     amount:100,excluded:false},
  {id:14,name:"Travel Fund",  amount:200,excluded:false},{id:15,name:"Miscellaneous",amount:150,excluded:false},
];
// Bug fix: DEFAULT_SAV no longer bakes T.* colours — colours assigned from SAV_COLORS at render time
const DEFAULT_SAV = () => [
  {id:1,name:"Index Funds",   amount:500,excluded:false},
  {id:2,name:"Pension / 401k",amount:300,excluded:false},
  {id:3,name:"Emergency Fund", amount:200,excluded:false},
];

function buildFmt(symbol) {
  const fmt  = n => symbol+Math.abs(Math.round(n)).toLocaleString();
  const fmtK = n => { const abs=Math.abs(n); const s=abs>=1000000?symbol+(abs/1e6).toFixed(2)+"M":symbol+Math.round(abs/1000).toLocaleString()+"k"; return (n<0?"-":"")+s; };
  return { fmt, fmtK };
}

function calcProjRow(y,monthlySavings,netBonus,includeBonus) {
  const inv=Math.round(fv(monthlySavings,0.07,y));
  const bon=includeBonus?Math.round(fv(netBonus,0.07,y)):0;
  const car=Math.max(0,Math.round(30000*Math.pow(0.85,y)));
  return {y,inv,bon,car,total:inv+bon+car};
}
function niceMax(v) { if(v<=0)return 1; const mag=Math.pow(10,Math.floor(Math.log10(v))); for(const s of [1,1.5,2,2.5,3,4,5,6,7,8,10])if(s*mag>=v)return s*mag; return 10*mag; }
const gridLines = (ceil,n) => Array.from({length:n},(_,i)=>ceil*((i+1)/n));

// ══════════════════════════════════════════════════════════════════════════════
// PRIMITIVE COMPONENTS — all read T from ThemeContext
// ══════════════════════════════════════════════════════════════════════════════
function Lbl({ children, color }) {
  const T = useTheme();
  return <div style={{fontSize:10,letterSpacing:1.5,textTransform:"uppercase",color:color||T.muted,marginBottom:6}}>{children}</div>;
}

function Pill({ label, color }) {
  const c = color;
  return <span style={{fontSize:10,letterSpacing:1.5,textTransform:"uppercase",color:c,background:c+"33",padding:"2px 8px",borderRadius:20,fontFamily:"monospace",fontWeight:700,whiteSpace:"nowrap"}}>{label}</span>;
}

function StatCard({ label, value, sub, color, size, bg }) {
  const T = useTheme();
  return (
    <div style={{background:bg||T.card,border:"1px solid "+T.border,borderRadius:12,padding:"16px 18px"}}>
      <div style={{fontSize:10,letterSpacing:1.5,textTransform:"uppercase",color:T.muted,marginBottom:7}}>{label}</div>
      <div style={{fontSize:size||24,fontFamily:"monospace",fontWeight:700,color:color||T.text,lineHeight:1.1}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:T.muted,marginTop:6,lineHeight:1.5}}>{sub}</div>}
    </div>
  );
}

function Toggle({ checked, onChange, label, sublabel, color }) {
  const T = useTheme();
  const c = color||T.green;
  return (
    <div onClick={()=>onChange(!checked)} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",
      background:checked?c+"22":T.faint+"80",border:"1px solid "+(checked?c+"66":T.border),
      borderRadius:8,padding:"8px 12px",transition:"all 0.2s",userSelect:"none"}}>
      <div style={{position:"relative",width:32,height:18,flexShrink:0}}>
        <div style={{position:"absolute",inset:0,borderRadius:9,background:checked?c:T.muted+"44",transition:"background 0.2s"}} />
        <div style={{position:"absolute",top:2,left:checked?16:2,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left 0.2s",boxShadow:checked?"0 0 6px "+c+"88":"none"}} />
      </div>
      <div>
        <div style={{fontSize:11,color:checked?T.text:T.muted,fontFamily:"monospace",fontWeight:checked?700:400}}>{label}</div>
        {sublabel&&<div style={{fontSize:11,color:T.muted,fontFamily:"monospace",marginTop:1}}>{sublabel}</div>}
      </div>
    </div>
  );
}

function SliderRow({ label, value, min, max, step, onChange, format, color, sublabel }) {
  const T = useTheme();
  const c = color||T.blue;
  const w = ((value-min)/(max-min))*100;
  return (
    <div style={{marginBottom:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:7}}>
        <div>
          <span style={{fontSize:12,color:T.text,fontFamily:"monospace"}}>{label}</span>
          {sublabel&&<span style={{fontSize:11,color:T.muted,fontFamily:"monospace",marginLeft:8}}>{sublabel}</span>}
        </div>
        <span style={{fontSize:18,color:c,fontFamily:"monospace",fontWeight:700}}>{format(value)}</span>
      </div>
      <div style={{position:"relative",height:5,background:T.faint,borderRadius:3}}>
        <div style={{position:"absolute",left:0,top:0,height:"100%",width:w+"%",background:"linear-gradient(90deg,"+c+"88,"+c+")",borderRadius:3}} />
        <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))}
          style={{position:"absolute",top:"50%",transform:"translateY(-50%)",width:"100%",opacity:0,cursor:"pointer",height:18,margin:0}} />
        <div style={{position:"absolute",top:"50%",transform:"translateY(-50%)",left:"calc("+w+"% - 7px)",width:14,height:14,borderRadius:"50%",background:c,border:"2px solid "+T.bg,boxShadow:"0 0 10px "+c+"66",pointerEvents:"none"}} />
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:3,fontSize:11,color:T.muted+"88",fontFamily:"monospace"}}>
        <span>{format(min)}</span><span>{format(max)}</span>
      </div>
    </div>
  );
}

function MiniBar({ value, max, color }) {
  const T = useTheme();
  const w = max>0?Math.min(100,Math.max(0,(value/max)*100)):0;
  return <div style={{height:4,background:T.faint,borderRadius:2}}><div style={{height:"100%",width:w+"%",background:color,borderRadius:2,transition:"width 0.2s"}} /></div>;
}

// ══════════════════════════════════════════════════════════════════════════════
// THEME PICKER — shown in dashboard header
// ══════════════════════════════════════════════════════════════════════════════
function ThemePicker({ current, onChange }) {
  const T = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <div style={{position:"relative"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{background:T.faint,border:"1px solid "+T.border,color:T.text,borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:11,fontFamily:"monospace",display:"flex",alignItems:"center",gap:6}}>
        <span>{THEMES[current].emoji}</span>
        <span style={{color:T.muted}}>{THEMES[current].name}</span>
        <span style={{color:T.muted,fontSize:9}}>▼</span>
      </button>
      {open&&(
        <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:T.card,border:"1px solid "+T.border,borderRadius:10,padding:6,zIndex:100,minWidth:160,boxShadow:"0 8px 32px #00000044"}}>
          {Object.values(THEMES).map(th=>(
            <div key={th.id} onClick={()=>{onChange(th.id);setOpen(false);}}
              style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:7,cursor:"pointer",
                background:current===th.id?th.accent+"22":"transparent",
                border:current===th.id?"1px solid "+th.accent+"44":"1px solid transparent",marginBottom:3}}>
              <span style={{fontSize:16}}>{th.emoji}</span>
              <span style={{fontSize:11,fontFamily:"monospace",color:current===th.id?th.accent:T.text,fontWeight:current===th.id?700:400}}>{th.name}</span>
              <div style={{marginLeft:"auto",display:"flex",gap:3}}>
                {[th.green,th.accent,th.amber,th.red].map((c,i)=>(
                  <div key={i} style={{width:8,height:8,borderRadius:"50%",background:c}} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// EDITABLE TABLE
// ══════════════════════════════════════════════════════════════════════════════
function EditableTable({ title, icon, items, setItems, accentColor, sliderMax }) {
  const T    = useTheme();
  const sMax = sliderMax||5000;
  const [adding,setAdding] = useState(false);
  const [nName,setNName]   = useState("");
  const [nAmt,setNAmt]     = useState("");
  const [nType,setNType]   = useState("other");

  const activeTotal = useMemo(()=>sum(items,"amount"),[items]);
  const upd = useCallback((id,v)=>setItems(p=>p.map(i=>i.id===id?{...i,amount:v}:i)),[setItems]);
  const tog = useCallback((id)  =>setItems(p=>p.map(i=>i.id===id?{...i,excluded:!i.excluded}:i)),[setItems]);
  const del = useCallback((id)  =>setItems(p=>p.filter(i=>i.id!==id)),[setItems]);
  const add = useCallback(()=>{ const amt=Number(nAmt); if(!nName.trim()||amt<=0)return; setItems(p=>[...p,{id:Date.now(),name:nName.trim(),amount:amt,type:nType,excluded:false,custom:true}]); setNName("");setNAmt("");setAdding(false); },[nName,nAmt,nType,setItems]);

  const inputS = {background:T.faint,border:"1px solid "+T.border,borderRadius:6,padding:"7px 10px",color:T.text,fontFamily:"monospace",fontSize:12,outline:"none"};

  return (
    <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:14,overflow:"hidden",marginBottom:14}}>
      <div style={{background:accentColor+"18",borderBottom:"1px solid "+T.border,padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:16}}>{icon}</span>
          <span style={{fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:T.text,fontFamily:"monospace"}}>{title}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:20,fontFamily:"monospace",fontWeight:700,color:accentColor}}>{activeTotal.toLocaleString()}</span>
          <button onClick={()=>setAdding(!adding)} style={{background:adding?accentColor+"33":T.faint,border:"1px solid "+(adding?accentColor:T.border),color:adding?accentColor:T.muted,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontFamily:"monospace"}}>+ Add</button>
        </div>
      </div>
      <div style={{padding:"10px 18px 4px"}}>
        {items.map(item=>{
          const rowCol=item.color||accentColor;
          const share=activeTotal>0&&!item.excluded?(item.amount/activeTotal)*100:0;
          return (
            <div key={item.id} style={{marginBottom:14,opacity:item.excluded?0.35:1,transition:"opacity 0.2s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:item.excluded?0:5}}>
                <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                  <div style={{width:8,height:8,borderRadius:2,background:rowCol,flexShrink:0}} />
                  <span style={{fontSize:12,color:T.text,fontFamily:"monospace",textDecoration:item.excluded?"line-through":"none"}}>{item.name}</span>
                  {item.type&&item.type!=="other"&&<Pill label={item.type} color={rowCol} />}
                  {item.excluded&&<Pill label="excluded" color={T.muted} />}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  {!item.excluded&&<span style={{fontSize:11,color:T.muted,fontFamily:"monospace"}}>{pct(share)}</span>}
                  <span style={{fontSize:14,color:item.excluded?T.muted:rowCol,fontFamily:"monospace",fontWeight:700,minWidth:70,textAlign:"right"}}>{item.amount.toLocaleString()}</span>
                  {item.auto
                    ?<span style={{fontSize:11,color:T.muted,padding:"2px 7px",border:"1px solid "+T.border,borderRadius:4,fontFamily:"monospace"}}>auto</span>
                    :<>
                      <button onClick={()=>tog(item.id)} style={{background:"transparent",border:"1px solid "+T.border,color:T.muted,cursor:"pointer",fontSize:10,padding:"2px 7px",borderRadius:4,fontFamily:"monospace"}}>{item.excluded?"on":"off"}</button>
                      {item.custom&&<button onClick={()=>del(item.id)} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:16,padding:"0 2px",lineHeight:1}}>×</button>}
                    </>}
                </div>
              </div>
              {!item.excluded&&!item.auto&&(
                <div style={{position:"relative",height:4,background:T.faint,borderRadius:2}}>
                  <div style={{position:"absolute",left:0,top:0,height:"100%",width:Math.min(100,(item.amount/sMax)*100)+"%",background:rowCol+"88",borderRadius:2,transition:"width 0.1s"}} />
                  <input type="range" min={0} max={sMax} step={10} value={item.amount} onChange={e=>upd(item.id,Number(e.target.value))}
                    style={{position:"absolute",top:"50%",transform:"translateY(-50%)",width:"100%",opacity:0,cursor:"pointer",height:16,margin:0}} />
                </div>
              )}
              {!item.excluded&&item.auto&&<MiniBar value={item.amount} max={sMax} color={rowCol+"44"} />}
              {item.sub&&<div style={{fontSize:11,color:T.muted,fontFamily:"monospace",marginTop:3,paddingLeft:16}}>{item.sub}</div>}
            </div>
          );
        })}
      </div>
      {adding&&(
        <div style={{padding:"12px 18px",borderTop:"1px solid "+T.border,display:"flex",gap:8,flexWrap:"wrap",background:T.surface,alignItems:"center"}}>
          <input placeholder="Name" value={nName} onChange={e=>setNName(e.target.value)} style={{...inputS,flex:1,minWidth:110}} />
          <select value={nType} onChange={e=>setNType(e.target.value)} style={inputS}>{INCOME_TYPES.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
          <input type="number" placeholder="amount/mo" value={nAmt} onChange={e=>setNAmt(e.target.value)} style={{...inputS,width:110}} />
          <button onClick={add} style={{background:accentColor,border:"none",color:T.bg,borderRadius:6,padding:"7px 14px",cursor:"pointer",fontSize:12,fontFamily:"monospace",fontWeight:700}}>Add</button>
          <button onClick={()=>setAdding(false)} style={{background:T.faint,border:"none",color:T.muted,borderRadius:6,padding:"7px 10px",cursor:"pointer",fontSize:12,fontFamily:"monospace"}}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SAVINGS SECTION
// ══════════════════════════════════════════════════════════════════════════════
function SavingsSection({ buckets, setBuckets }) {
  const T     = useTheme();
  const SAV_COLORS = [T.green,T.blue,T.purple,T.amber,T.red]; // Bug fix: derived from live theme
  const [adding,setAdding]=useState(false);
  const [nName,setNName]  =useState("");
  const [nAmt,setNAmt]    =useState("");

  const total = useMemo(()=>sum(buckets,"amount"),[buckets]);
  const upd = useCallback((id,v)=>setBuckets(p=>p.map(b=>b.id===id?{...b,amount:v}:b)),[setBuckets]);
  const tog = useCallback((id)  =>setBuckets(p=>p.map(b=>b.id===id?{...b,excluded:!b.excluded}:b)),[setBuckets]);
  const del = useCallback((id)  =>setBuckets(p=>p.filter(b=>b.id!==id)),[setBuckets]);
  const add = useCallback(()=>{ const amt=Number(nAmt); if(!nName.trim()||amt<=0)return; setBuckets(p=>[...p,{id:Date.now(),name:nName.trim(),amount:amt,excluded:false}]); setNName("");setNAmt("");setAdding(false); },[nName,nAmt,setBuckets]);

  const inputS = {background:T.faint,border:"1px solid "+T.border,borderRadius:6,padding:"7px 10px",color:T.text,fontFamily:"monospace",fontSize:12,outline:"none"};

  return (
    <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:14,overflow:"hidden",marginBottom:14}}>
      <div style={{background:T.green+"18",borderBottom:"1px solid "+T.border,padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:16}}>📈</span>
          <span style={{fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:T.text,fontFamily:"monospace"}}>Savings & Investments</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:20,fontFamily:"monospace",fontWeight:700,color:T.green}}>{total.toLocaleString()}</span>
          <button onClick={()=>setAdding(!adding)} style={{background:adding?T.green+"33":T.faint,border:"1px solid "+(adding?T.green:T.border),color:adding?T.green:T.muted,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontFamily:"monospace"}}>+ Add</button>
        </div>
      </div>
      <div style={{padding:"10px 18px 4px"}}>
        {buckets.map((b,idx)=>{
          const col  =b.color||SAV_COLORS[idx%SAV_COLORS.length];
          const share=total>0&&!b.excluded?(b.amount/total)*100:0;
          return (
            <div key={b.id} style={{marginBottom:14,opacity:b.excluded?0.35:1,transition:"opacity 0.2s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:b.excluded?0:5}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:8,height:8,borderRadius:2,background:col,flexShrink:0}} />
                  <span style={{fontSize:12,color:T.text,fontFamily:"monospace",textDecoration:b.excluded?"line-through":"none"}}>{b.name}</span>
                  {b.excluded&&<Pill label="excluded" color={T.muted} />}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  {!b.excluded&&<span style={{fontSize:11,color:T.muted,fontFamily:"monospace"}}>{pct(share)}</span>}
                  <span style={{fontSize:14,color:b.excluded?T.muted:col,fontFamily:"monospace",fontWeight:700,minWidth:70,textAlign:"right"}}>{b.amount.toLocaleString()}</span>
                  <button onClick={()=>tog(b.id)} style={{background:"transparent",border:"1px solid "+T.border,color:T.muted,cursor:"pointer",fontSize:10,padding:"2px 7px",borderRadius:4,fontFamily:"monospace"}}>{b.excluded?"on":"off"}</button>
                  <button onClick={()=>del(b.id)} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:16,padding:"0 2px",lineHeight:1}}>×</button>
                </div>
              </div>
              {!b.excluded&&(
                <div style={{position:"relative",height:4,background:T.faint,borderRadius:2}}>
                  <div style={{position:"absolute",left:0,top:0,height:"100%",width:Math.min(100,(b.amount/5000)*100)+"%",background:col+"99",borderRadius:2}} />
                  <input type="range" min={0} max={5000} step={50} value={b.amount} onChange={e=>upd(b.id,Number(e.target.value))}
                    style={{position:"absolute",top:"50%",transform:"translateY(-50%)",width:"100%",opacity:0,cursor:"pointer",height:16,margin:0}} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {adding&&(
        <div style={{padding:"12px 18px",borderTop:"1px solid "+T.border,display:"flex",gap:8,flexWrap:"wrap",background:T.surface}}>
          <input placeholder="Bucket name" value={nName} onChange={e=>setNName(e.target.value)} style={{...inputS,flex:1,minWidth:120}} />
          <input type="number" placeholder="amount/mo" value={nAmt} onChange={e=>setNAmt(e.target.value)} style={{...inputS,width:110}} />
          <button onClick={add} style={{background:T.green,border:"none",color:T.bg,borderRadius:6,padding:"7px 14px",cursor:"pointer",fontSize:12,fontFamily:"monospace",fontWeight:700}}>Add</button>
          <button onClick={()=>setAdding(false)} style={{background:T.faint,border:"none",color:T.muted,borderRadius:6,padding:"7px 10px",cursor:"pointer",fontSize:12,fontFamily:"monospace"}}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PROJECTION CHART
// ══════════════════════════════════════════════════════════════════════════════
function ProjChart({ monthlySavings, netBonus, includeBonus, intervalMode, fmtK }) {
  const T = useTheme();
  const [hoveredIdx,setHoveredIdx]=useState(null);
  const CHART_H=180;

  const mode=useMemo(()=>INTERVAL_MODES.find(m=>m.id===intervalMode)||INTERVAL_MODES[2],[intervalMode]);
  const {data,ceiling,grids,isCompact}=useMemo(()=>{
    const d=mode.steps.map(y=>calcProjRow(y,monthlySavings,netBonus,includeBonus));
    const cel=niceMax(Math.max(...d.map(x=>x.total),1)*1.08);
    return {data:d,ceiling:cel,grids:gridLines(cel,4),isCompact:intervalMode==="1m"};
  },[mode,monthlySavings,netBonus,includeBonus,intervalMode]);

  const toH  =v=>Math.max(0,Math.round((v/ceiling)*CHART_H));
  const toPct=v=>((v/ceiling)*100).toFixed(2)+"%";

  return (
    <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:14,padding:"20px 22px",marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
        <div>
          <Lbl color={T.green}>Net Worth Projection</Lbl>
          <div style={{fontSize:11,color:T.muted,fontFamily:"monospace"}}>7% annualised · {mode.label} intervals</div>
        </div>
        <Pill label="Target $1.9M" color={T.amber} />
      </div>
      <div style={{display:"flex",gap:0}}>
        <div style={{display:"flex",flexDirection:"column-reverse",justifyContent:"space-between",width:52,flexShrink:0,height:CHART_H,paddingBottom:2}}>
          {[0,...grids].map((v,i)=><div key={i} style={{fontSize:8,color:T.muted+"99",fontFamily:"monospace",textAlign:"right",paddingRight:6,lineHeight:1}}>{fmtK(v)}</div>)}
        </div>
        <div style={{flex:1,position:"relative",height:CHART_H}}>
          {grids.map((v,i)=><div key={i} style={{position:"absolute",left:0,right:0,bottom:toPct(v),borderTop:"1px dashed "+T.faint,pointerEvents:"none"}} />)}
          {TARGET_USD<=ceiling&&(
            <div style={{position:"absolute",left:0,right:0,bottom:toPct(TARGET_USD),borderTop:"1px dashed "+T.amber+"99",pointerEvents:"none"}}>
              <span style={{position:"absolute",right:4,top:-14,fontSize:8,color:T.amber,fontFamily:"monospace",whiteSpace:"nowrap"}}>target</span>
            </div>
          )}
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"flex-end",gap:isCompact?3:6,padding:"0 2px"}}>
            {data.map((d,idx)=>{
              const barH=toH(d.total),invH=toH(d.inv),hit=d.total>=TARGET_USD,isHov=hoveredIdx===idx;
              const nonInv=d.total-d.inv,invPct=d.total>0?((d.inv/d.total)*100).toFixed(1):"0.0";
              return (
                <div key={d.y} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",minWidth:0,position:"relative"}}
                  onMouseEnter={()=>setHoveredIdx(idx)} onMouseLeave={()=>setHoveredIdx(null)}>
                  {isHov&&(
                    <div style={{position:"absolute",bottom:barH+10,left:"50%",transform:"translateX(-50%)",background:T.surface,
                      border:"1px solid "+(hit?T.amber:T.green)+"88",borderRadius:8,padding:"10px 12px",zIndex:10,whiteSpace:"nowrap",boxShadow:"0 4px 20px #00000066",pointerEvents:"none"}}>
                      <div style={{fontSize:11,color:T.muted,fontFamily:"monospace",letterSpacing:1.5,textTransform:"uppercase",marginBottom:7}}>{mode.fmt(d.y)}{hit?"  ✓ target":""}</div>
                      <div style={{display:"flex",justifyContent:"space-between",gap:20,marginBottom:5,alignItems:"baseline"}}>
                        <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:8,height:8,borderRadius:2,background:hit?T.amber:T.green}} /><span style={{fontSize:11,color:T.muted,fontFamily:"monospace"}}>Total</span></div>
                        <span style={{fontSize:14,color:hit?T.amber:T.green,fontFamily:"monospace",fontWeight:700}}>{fmtK(d.total)}</span>
                      </div>
                      <div style={{borderTop:"1px solid "+T.border,margin:"7px 0"}} />
                      <div style={{display:"flex",justifyContent:"space-between",gap:20,marginBottom:4,alignItems:"baseline"}}>
                        <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:8,height:8,borderRadius:2,background:T.blue}} /><span style={{fontSize:11,color:T.muted,fontFamily:"monospace"}}>Investments</span></div>
                        <div><span style={{fontSize:12,color:T.blue,fontFamily:"monospace",fontWeight:700}}>{fmtK(d.inv)}</span><span style={{fontSize:11,color:T.muted,fontFamily:"monospace",marginLeft:5}}>{invPct}%</span></div>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",gap:20,alignItems:"baseline"}}>
                        <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:8,height:8,borderRadius:2,background:T.purple}} /><span style={{fontSize:11,color:T.muted,fontFamily:"monospace"}}>Other</span></div>
                        <span style={{fontSize:12,color:T.purple,fontFamily:"monospace",fontWeight:700}}>{fmtK(nonInv)}</span>
                      </div>
                      <div style={{marginTop:9,height:4,borderRadius:2,background:T.faint,overflow:"hidden",display:"flex"}}>
                        <div style={{width:invPct+"%",background:T.blue}} /><div style={{flex:1,background:T.purple}} />
                      </div>
                    </div>
                  )}
                  {!isCompact&&!isHov&&<div style={{fontSize:8,color:hit?T.amber:T.green,fontFamily:"monospace",fontWeight:700,whiteSpace:"nowrap",marginBottom:3,lineHeight:1}}>{fmtK(d.total)}</div>}
                  {!isCompact&&isHov &&<div style={{height:13,marginBottom:3}} />}
                  <div style={{width:"100%",height:barH,background:isHov?(hit?T.amber+"55":T.green+"44"):(hit?T.amber+"33":T.green+"22"),
                    border:"1px solid "+(hit?T.amber:T.green)+(isHov?"cc":"55"),borderRadius:"3px 3px 0 0",display:"flex",flexDirection:"column",
                    justifyContent:"flex-end",overflow:"hidden",flexShrink:0,transition:"background 0.15s,border-color 0.15s",cursor:"crosshair"}}>
                    <div style={{width:"100%",height:invH,background:isHov?T.blue+"cc":T.blue+"88",flexShrink:0}} />
                  </div>
                  <div style={{fontSize:isCompact?7:9,color:isHov?T.text:(hit?T.amber:T.muted),fontFamily:"monospace",whiteSpace:"nowrap",marginTop:4,lineHeight:1,fontWeight:isHov?700:400}}>
                    {mode.fmt(d.y)}{hit?"✓":""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{display:"flex",gap:16,flexWrap:"wrap",marginTop:12}}>
        {[{l:"Investments",c:T.blue},{l:"Other assets",c:T.purple},{l:"Total",c:T.green},{l:"Target",c:T.amber}].map(x=>(
          <div key={x.l} style={{display:"flex",alignItems:"center",gap:5}}>
            <div style={{width:8,height:8,borderRadius:2,background:x.c}} />
            <span style={{fontSize:11,color:T.muted,fontFamily:"monospace"}}>{x.l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ADD INLINE INCOME
// ══════════════════════════════════════════════════════════════════════════════
function AddInline({ onAdd }) {
  const T=useTheme();
  const [open,setOpen]=useState(false);
  const [name,setName]=useState("");
  const [amount,setAmount]=useState("");
  const [type,setType]=useState("other");
  const inputS={background:T.faint,border:"1px solid "+T.border,borderRadius:6,padding:"7px 10px",color:T.text,fontFamily:"monospace",fontSize:12,outline:"none"};

  const submit=()=>{ const amt=Number(amount); if(!name.trim()||amt<=0)return; onAdd(name.trim(),amt,type); setName("");setAmount("");setOpen(false); };
  if(!open)return <button onClick={()=>setOpen(true)} style={{width:"100%",padding:"10px 18px",background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:11,fontFamily:"monospace",textAlign:"left",letterSpacing:1}}>+ Add income source</button>;
  return (
    <div style={{padding:"12px 18px",display:"flex",gap:8,flexWrap:"wrap",background:T.surface,alignItems:"center"}}>
      <input placeholder="Source name" value={name} onChange={e=>setName(e.target.value)} style={{...inputS,flex:1,minWidth:110}} />
      <select value={type} onChange={e=>setType(e.target.value)} style={inputS}>{INCOME_TYPES.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
      <input type="number" placeholder="amount/mo" value={amount} onChange={e=>setAmount(e.target.value)} style={{...inputS,width:85}} />
      <button onClick={submit} style={{background:T.green,border:"none",color:T.bg,borderRadius:6,padding:"7px 14px",cursor:"pointer",fontSize:12,fontFamily:"monospace",fontWeight:700}}>Add</button>
      <button onClick={()=>setOpen(false)} style={{background:T.faint,border:"none",color:T.muted,borderRadius:6,padding:"7px 10px",cursor:"pointer",fontSize:12,fontFamily:"monospace"}}>Cancel</button>
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
    {label:"Savings Rate",       val:savingsRate,      score:savingsRate>=30?"Strong":savingsRate>=20?"Moderate":"Weak",     color:savingsRate>=30?T.green:savingsRate>=20?T.amber:T.red, bench:"Target: 25–35%",      detail:pct(savingsRate)+" of net income"},
    {label:"Housing Ratio",      val:housingPct,       score:housingPct<=30?"Healthy":housingPct<=40?"Elevated":"High",     color:housingPct<=30?T.green:housingPct<=40?T.amber:T.red,  bench:"Rule: <30% of net",   detail:pct(housingPct)+" of net income"},
    {label:"Expense Efficiency", val:100-expRatio*100, score:expRatio<.65?"Efficient":expRatio<.80?"Moderate":"Inflated",  color:expRatio<.65?T.green:expRatio<.80?T.amber:T.red,       bench:"Target: <70% of net", detail:pct(expRatio*100)+" expenses-to-income"},
  ];
  return (
    <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:14,padding:"20px 22px",marginBottom:16}}>
      <Lbl color={T.purple}>Financial Health Assessment</Lbl>
      <div className="fc-health" style={{marginTop:12}}>
        {cards.map(s=>(
          <div key={s.label} style={{background:T.surface,border:"1px solid "+s.color+"44",borderRadius:12,padding:16}}>
            <div style={{fontSize:11,color:T.muted,marginBottom:7}}>{s.label}</div>
            <div style={{fontSize:20,color:s.color,fontFamily:"monospace",fontWeight:700,marginBottom:5}}>{s.score}</div>
            <div style={{fontSize:12,color:s.color,marginBottom:7}}>{s.detail}</div>
            <MiniBar value={Math.abs(s.val)} max={100} color={s.color} />
            <div style={{fontSize:11,color:T.muted,lineHeight:1.5,marginTop:7}}>{s.bench}</div>
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
    {icon:"🌍",title:"Multi-Country Tax Engine", desc:"Accurate net income for US, UK, Canada, Australia & Germany — 2024/25 rates."},
    {icon:"📊",title:"Full Financial Dashboard", desc:"Income, expenses, savings, projections and health analysis in one place."},
    {icon:"☁️",title:"Cloud Sync",              desc:"Auto-saves and syncs across every device. Never lose a number."},
    {icon:"🔒",title:"Private & Secure",         desc:"Row-level security means only you can ever see your data."},
    {icon:"📈",title:"30-Year Projections",      desc:"Configurable intervals with hover-to-inspect bars and target tracking."},
    {icon:"🎨",title:"5 Colour Themes",          desc:"Terminal, Spring, Autumn, Kente — pick what feels right."},
  ];
  return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",display:"flex",flexDirection:"column"}}>
      <nav style={{padding:"18px clamp(20px,5vw,60px)",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid "+T.border}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:20,fontWeight:700,color:T.accent,letterSpacing:-0.5,fontFamily:"monospace"}}>FinCommand</span>
          <span style={{fontSize:11,color:T.muted,letterSpacing:2,textTransform:"uppercase",display:"none"}}></span>
          {MOCK_MODE&&<span style={{fontSize:10,color:T.amber,background:T.amber+"22",padding:"3px 10px",borderRadius:10,fontFamily:"monospace"}}>DEMO</span>}
        </div>
        <button onClick={onGetStarted} style={{background:"transparent",border:"1px solid "+T.accent+"66",color:T.accent,borderRadius:8,padding:"9px 22px",cursor:"pointer",fontSize:12,letterSpacing:1.2}}>Sign In</button>
      </nav>
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"clamp(48px,8vh,100px) clamp(20px,5vw,60px)",textAlign:"center",width:"100%"}}>
        <div style={{fontSize:10,letterSpacing:4,color:T.accent,textTransform:"uppercase",marginBottom:24}}>Personal Finance OS</div>
        <h1 style={{fontSize:"clamp(32px,6vw,56px)",fontWeight:700,margin:"0 0 22px",letterSpacing:-1.5,lineHeight:1.1,color:T.text,maxWidth:700}}>
          Your money.<br /><span style={{color:T.accent}}>Completely clear.</span>
        </h1>
        <p style={{fontSize:"clamp(13px,1.5vw,16px)",color:T.muted,lineHeight:1.8,maxWidth:520,margin:"0 0 40px"}}>
          A professional-grade financial dashboard that speaks your country's tax language.
        </p>
        <div style={{display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center"}}>
          <button onClick={onGetStarted} style={{background:T.accent,border:"none",color:T.bg,borderRadius:12,padding:"15px 36px",cursor:"pointer",fontSize:14,fontWeight:700,letterSpacing:0.5}}>Get Started — Free</button>
          <button onClick={onGetStarted} style={{background:"transparent",border:"1px solid "+T.border,color:T.muted,borderRadius:12,padding:"15px 28px",cursor:"pointer",fontSize:14}}>Sign In</button>
        </div>
        <div style={{marginTop:24,fontSize:11,color:T.muted,letterSpacing:1.5,textTransform:"uppercase"}}>🇺🇸 US · 🇬🇧 UK · 🇨🇦 Canada · 🇦🇺 Australia · 🇩🇪 Germany</div>
      </div>
      <div style={{padding:"clamp(40px,6vh,80px) clamp(20px,5vw,60px)",width:"100%",maxWidth:1400,margin:"0 auto",boxSizing:"border-box"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:18}}>
          {features.map(f=>(
            <div key={f.title} style={{background:T.card,border:"1px solid "+T.border,borderRadius:14,padding:"22px 24px"}}>
              <div style={{fontSize:28,marginBottom:12}}>{f.icon}</div>
              <div style={{fontSize:14,fontWeight:700,color:T.text,marginBottom:9}}>{f.title}</div>
              <div style={{fontSize:12,color:T.muted,lineHeight:1.8}}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{textAlign:"center",padding:"20px",fontSize:10,color:T.border}}>For personal planning purposes only · Not financial advice</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH PAGE
// ══════════════════════════════════════════════════════════════════════════════
function AuthPage({ onBack, onAuthSuccess }) {
  const T=useTheme();
  const [mode,setMode]        =useState("signin");
  const [email,setEmail]      =useState("");
  const [password,setPassword]=useState("");
  const [loading,setLoading]  =useState(false);
  const [error,setError]      =useState("");
  const [message,setMessage]  =useState("");

  const handleEmail=async()=>{
    if(!email.trim()||!password.trim())return;
    setLoading(true);setError("");setMessage("");
    try {
      const res=mode==="signup"?await db.signUpEmail(email,password):await db.signInEmail(email,password);
      if(res.error)throw res.error;
      if(mode==="signup"&&!MOCK_MODE){setMessage("Check your email to confirm your account.");setLoading(false);return;}
      await onAuthSuccess();
    } catch(e){ setError(typeof e==="string"?e:e?.message||"Authentication failed."); }
    finally { setLoading(false); }
  };

  const handleGoogle=async()=>{
    setLoading(true);setError("");
    const {error}=await db.signInGoogle();
    if(error){setError(typeof error==="string"?error:error?.message||"Google sign-in failed.");setLoading(false);return;}
    if(MOCK_MODE)await onAuthSuccess();
    setLoading(false);
  };

  const inputS={background:T.faint,border:"1px solid "+T.border,borderRadius:6,padding:"12px 14px",color:T.text,fontFamily:"monospace",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"};

  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"}}>
      <button onClick={onBack} style={{position:"absolute",top:24,left:24,background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:11,fontFamily:"monospace",letterSpacing:1}}>← Back</button>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:22,fontWeight:700,color:T.accent,marginBottom:6}}>FinCommand</div>
          <div style={{fontSize:11,color:T.muted}}>{mode==="signup"?"Create your account":"Welcome back"}</div>
          {MOCK_MODE&&<div style={{marginTop:8,fontSize:10,color:T.amber,fontFamily:"monospace"}}>Demo mode — any email/password works</div>}
        </div>
        <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:16,padding:"28px"}}>
          <button onClick={handleGoogle} disabled={loading} style={{width:"100%",background:T.surface,border:"1px solid "+T.border,color:T.text,borderRadius:10,padding:"12px",cursor:"pointer",fontSize:12,fontFamily:"monospace",display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:20}}>
            <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
            <div style={{flex:1,height:1,background:T.border}} /><span style={{fontSize:11,color:T.muted,letterSpacing:2,textTransform:"uppercase"}}>or</span><div style={{flex:1,height:1,background:T.border}} />
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:20}}>
            <input placeholder="Email address" type="email" value={email} onChange={e=>setEmail(e.target.value)} style={inputS} />
            <input placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleEmail()} style={inputS} />
          </div>
          {error  &&<div style={{background:T.red+"18",border:"1px solid "+T.red+"44",borderRadius:8,padding:"10px 12px",fontSize:11,color:T.red,marginBottom:16}}>{error}</div>}
          {message&&<div style={{background:T.green+"18",border:"1px solid "+T.green+"44",borderRadius:8,padding:"10px 12px",fontSize:11,color:T.green,marginBottom:16}}>{message}</div>}
          <button onClick={handleEmail} disabled={loading||!email||!password} style={{width:"100%",background:T.accent,border:"none",color:T.bg,borderRadius:10,padding:"13px",cursor:"pointer",fontSize:13,fontFamily:"monospace",fontWeight:700,opacity:(!email||!password||loading)?0.5:1}}>
            {loading?"…":mode==="signup"?"Create Account":"Sign In"}
          </button>
          <div style={{textAlign:"center",marginTop:16,fontSize:11,color:T.muted}}>
            {mode==="signup"?"Already have an account? ":"No account yet? "}
            <button onClick={()=>{setMode(mode==="signup"?"signin":"signup");setError("");setMessage("");}} style={{background:"transparent",border:"none",color:T.blue,cursor:"pointer",fontSize:11,fontFamily:"monospace",textDecoration:"underline"}}>
              {mode==="signup"?"Sign in":"Create one"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ONBOARDING
// ══════════════════════════════════════════════════════════════════════════════
function OnboardingPage({ user, onComplete }) {
  const T=useTheme();
  const [step,setStep]      =useState(0);
  const [country,setCountry]=useState("US");
  const [name,setName]      =useState(user?.user_metadata?.full_name?.split(" ")[0]||"");
  const [gross,setGross]    =useState(80000);
  const [saving,setSaving]  =useState(false);
  const [error,setError]    =useState("");

  const cfg=TAX_CONFIGS[country];
  const {netSalary,effectiveRate}=useMemo(()=>calcTax(country,gross,0),[country,gross]);

  const handleComplete=async()=>{
    setSaving(true);setError("");
    const profile  ={country,name:name.trim(),grossSalary:gross,currency:cfg.currency};
    const dashboard={inclBonus:true,annualBonus:0,customIncome:[],fixedItems:DEFAULT_FIXED(),varItems:DEFAULT_VAR(),savBuckets:DEFAULT_SAV(),usdBalance:5000,projInterval:"1y"};
    const {error:e}=await db.saveUserData(user.id,{profile,dashboard});
    if(e){setError("Could not save. Please try again.");setSaving(false);return;}
    onComplete(profile,dashboard);
  };

  const steps=["Country","About You","Income"];
  const inputS={background:T.faint,border:"1px solid "+T.border,borderRadius:6,padding:"12px 14px",color:T.text,fontFamily:"monospace",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"};

  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"}}>
      <div style={{width:"100%",maxWidth:520}}>
        <div style={{display:"flex",gap:8,marginBottom:32,justifyContent:"center",flexWrap:"wrap"}}>
          {steps.map((s,i)=>(
            <div key={s} style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:28,height:28,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:i<=step?T.accent:T.faint,border:"1px solid "+(i<=step?T.accent:T.border),fontSize:11,color:i<=step?T.bg:T.muted,fontWeight:700}}>{i+1}</div>
              <span style={{fontSize:10,color:i===step?T.text:T.muted,letterSpacing:1.5,textTransform:"uppercase"}}>{s}</span>
              {i<steps.length-1&&<div style={{width:24,height:1,background:T.border}} />}
            </div>
          ))}
        </div>
        <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:16,padding:"32px"}}>
          {error&&<div style={{background:T.red+"18",border:"1px solid "+T.red+"44",borderRadius:8,padding:"10px 12px",fontSize:11,color:T.red,marginBottom:16}}>{error}</div>}
          {step===0&&(
            <div>
              <Lbl color={T.accent}>Step 1 of 3</Lbl>
              <h2 style={{margin:"0 0 8px",fontSize:20,color:T.text}}>Where are you based?</h2>
              <p style={{margin:"0 0 24px",fontSize:11,color:T.muted,lineHeight:1.7}}>Determines tax calculations, currency, and financial benchmarks throughout your dashboard.</p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {Object.entries(TAX_CONFIGS).map(([code,c])=>(
                  <div key={code} onClick={()=>setCountry(code)} style={{background:country===code?T.accent+"18":T.surface,border:"1px solid "+(country===code?T.accent+"66":T.border),borderRadius:10,padding:"14px 16px",cursor:"pointer",transition:"all 0.15s"}}>
                    <div style={{fontSize:22,marginBottom:6}}>{c.flag}</div>
                    <div style={{fontSize:12,fontWeight:700,color:T.text}}>{c.name}</div>
                    <div style={{fontSize:11,color:T.muted,marginTop:2}}>{c.currency} · {c.symbol}</div>
                  </div>
                ))}
              </div>
              <button onClick={()=>setStep(1)} style={{marginTop:20,width:"100%",background:T.accent,border:"none",color:T.bg,borderRadius:10,padding:"13px",cursor:"pointer",fontSize:13,fontFamily:"monospace",fontWeight:700}}>Continue →</button>
            </div>
          )}
          {step===1&&(
            <div>
              <Lbl color={T.accent}>Step 2 of 3</Lbl>
              <h2 style={{margin:"0 0 8px",fontSize:20,color:T.text}}>What should we call you?</h2>
              <p style={{margin:"0 0 24px",fontSize:11,color:T.muted,lineHeight:1.7}}>First name only is fine.</p>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" onKeyDown={e=>e.key==="Enter"&&name.trim()&&setStep(2)} style={inputS} />
              <div style={{display:"flex",gap:10,marginTop:20}}>
                <button onClick={()=>setStep(0)} style={{flex:1,background:T.faint,border:"1px solid "+T.border,color:T.muted,borderRadius:10,padding:"13px",cursor:"pointer",fontSize:12,fontFamily:"monospace"}}>← Back</button>
                <button onClick={()=>setStep(2)} disabled={!name.trim()} style={{flex:2,background:T.accent,border:"none",color:T.bg,borderRadius:10,padding:"13px",cursor:"pointer",fontSize:13,fontFamily:"monospace",fontWeight:700,opacity:!name.trim()?0.5:1}}>Continue →</button>
              </div>
            </div>
          )}
          {step===2&&(
            <div>
              <Lbl color={T.accent}>Step 3 of 3</Lbl>
              <h2 style={{margin:"0 0 8px",fontSize:20,color:T.text}}>Your gross annual salary</h2>
              <p style={{margin:"0 0 24px",fontSize:11,color:T.muted,lineHeight:1.7}}>We'll calculate net take-home using {cfg.flag} {cfg.name} tax rules.</p>
              <SliderRow label="Gross Annual Salary" value={gross} min={20000} max={500000} step={5000} onChange={setGross} format={v=>cfg.symbol+(v/1000).toFixed(0)+"k"} color={T.accent} />
              <div style={{background:T.surface,borderRadius:10,padding:"14px 16px",marginTop:8}}>
                <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:11,color:T.muted,fontFamily:"monospace"}}>Estimated net/mo</span><span style={{fontSize:16,color:T.green,fontFamily:"monospace",fontWeight:700}}>{cfg.symbol}{netSalary.toLocaleString()}</span></div>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}><span style={{fontSize:11,color:T.muted,fontFamily:"monospace"}}>Effective tax rate</span><span style={{fontSize:12,color:T.amber,fontFamily:"monospace"}}>{effectiveRate}%</span></div>
                <div style={{fontSize:11,color:T.muted,marginTop:8,lineHeight:1.6}}>{cfg.taxYearNote}</div>
              </div>
              <div style={{display:"flex",gap:10,marginTop:20}}>
                <button onClick={()=>setStep(1)} style={{flex:1,background:T.faint,border:"1px solid "+T.border,color:T.muted,borderRadius:10,padding:"13px",cursor:"pointer",fontSize:12,fontFamily:"monospace"}}>← Back</button>
                <button onClick={handleComplete} disabled={saving} style={{flex:2,background:T.accent,border:"none",color:T.bg,borderRadius:10,padding:"13px",cursor:"pointer",fontSize:13,fontFamily:"monospace",fontWeight:700,opacity:saving?0.6:1}}>{saving?"Setting up…":"Launch Dashboard →"}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
function Dashboard({ user, profile, initialData, onSignOut, themeId, onThemeChange }) {
  const T      = useTheme();
  const country= profile?.country||"US";
  const cfg    = TAX_CONFIGS[country]||TAX_CONFIGS.US;
  const {fmt,fmtK}=useMemo(()=>buildFmt(cfg.symbol),[cfg.symbol]);

  const [tab,          setTab]         =useState("overview");
  const [inclBonus,    setInclBonus]   =useState(initialData?.inclBonus??true);
  const [grossSalary,  setGrossSalary] =useState(profile?.grossSalary||80000);
  const [annualBonus,  setAnnualBonus] =useState(initialData?.annualBonus||0);
  const [customIncome, setCustomIncome]=useState(initialData?.customIncome||[]);
  const [fixedItems,   setFixedItems]  =useState(()=>initialData?.fixedItems||DEFAULT_FIXED());
  const [varItems,     setVarItems]    =useState(()=>initialData?.varItems  ||DEFAULT_VAR());
  const [savBuckets,   setSavBuckets]  =useState(()=>initialData?.savBuckets||DEFAULT_SAV());
  const [usdBalance,   setUsdBalance]  =useState(initialData?.usdBalance||5000);
  const [projInterval, setProjInterval]=useState(initialData?.projInterval||"1y");
  const [saveStatus,   setSaveStatus]  =useState("idle");
  const saveTimer=useRef(null);
  const pendingSave=useRef(null);

  const {netSalary,netBonus,effectiveRate}=useMemo(()=>calcTax(country,grossSalary,annualBonus),[country,grossSalary,annualBonus]);

  // Bug fix: STATUS_CFG now computed per-render from live theme colours
  const STATUS_CFG=useMemo(()=>({
    idle:  {label:"",               color:T.muted},
    saving:{label:"● saving…",     color:T.muted},
    saved: {label:"✓ saved",       color:T.green},
    error: {label:"⚠ save failed", color:T.amber},
  }),[T.muted,T.green,T.amber]);

  useEffect(()=>{
    const handleUnload=()=>{ if(pendingSave.current)db.saveUserData(user.id,pendingSave.current); };
    window.addEventListener("beforeunload",handleUnload);
    return ()=>window.removeEventListener("beforeunload",handleUnload);
  },[user.id]);

  const getSnapshot=useCallback(()=>({
    profile:{...profile,grossSalary},
    dashboard:{inclBonus,annualBonus,customIncome,fixedItems,varItems,savBuckets,usdBalance,projInterval},
  }),[profile,grossSalary,inclBonus,annualBonus,customIncome,fixedItems,varItems,savBuckets,usdBalance,projInterval]);

  useEffect(()=>{
    setSaveStatus("saving");
    if(saveTimer.current)clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(async()=>{
      const snap=getSnapshot(); pendingSave.current=snap;
      const {error}=await db.saveUserData(user.id,snap);
      pendingSave.current=null;
      setSaveStatus(error?"error":"saved");
      setTimeout(()=>setSaveStatus("idle"),2000);
    },800);
    return ()=>{ if(saveTimer.current)clearTimeout(saveTimer.current); };
  },[getSnapshot,user.id]);

  const statusInfo=STATUS_CFG[saveStatus]||STATUS_CFG.idle;

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
    const rentAmt=fixedItems.find(i=>i.name.toLowerCase().includes("rent"))?.amount||0;
    const housing=income>0?(rentAmt/income)*100:0;
    return {bonusIncome:bonus,extraIncome:extra,totalIncome:income,totalFixed:fixed,totalVar:variable,totalSavings:savings,totalExpenses:expenses,remainder:rem,savingsRate:sRate,rent:rentAmt,housingPct:housing};
  },[inclBonus,netBonus,netSalary,customIncome,fixedItems,varItems,savBuckets]);

  const {bonusIncome,extraIncome,totalIncome,totalFixed,totalVar,totalSavings,totalExpenses,remainder,savingsRate,rent,housingPct}=derived;

  // Bug fix: runway colours read from live theme
  const runway=useMemo(()=>{
    const months=totalExpenses>0?usdBalance/totalExpenses:0;
    const target=totalExpenses*6;
    const pctVal=target>0?Math.min(100,(usdBalance/target)*100):0;
    const color =months>=6?T.green:months>=3?T.amber:T.red;
    const verdict=months>=6?"✓ Solid":months>=3?"~ Building":"⚠ Thin";
    const toTgt  =remainder>0?Math.max(0,(target-usdBalance)/remainder):null;
    return {months,target,pct:pctVal,color,verdict,toTarget:toTgt};
  },[totalExpenses,usdBalance,remainder,T.green,T.amber,T.red]);

  const incomeTableItems=useMemo(()=>[
    {id:"sal",name:"Base Salary (net/mo)",    amount:netSalary,color:T.green,type:"salary",auto:true,excluded:false,sub:cfg.symbol+(grossSalary/1000).toFixed(0)+"k gross · ~"+effectiveRate+"% effective tax"},
    {id:"bon",name:"Annual Bonus (net avg/mo)",amount:netBonus, color:T.amber,type:"bonus", auto:true,excluded:!inclBonus,sub:cfg.symbol+(annualBonus/1000).toFixed(0)+"k gross annual"},
    ...customIncome,
  ],[netSalary,netBonus,grossSalary,annualBonus,effectiveRate,inclBonus,customIncome,cfg.symbol,T.green,T.amber]);

  const projMode=useMemo(()=>INTERVAL_MODES.find(m=>m.id===projInterval)||INTERVAL_MODES[2],[projInterval]);

  const cardS={background:T.card,border:"1px solid "+T.border,borderRadius:12,overflow:"hidden",marginBottom:14};

  return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",padding:"clamp(16px,3vw,32px) clamp(16px,4vw,48px)"}}>
      <div style={{maxWidth:1400,margin:"0 auto"}}>

        {/* Header */}
        <div style={{marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{fontSize:11,letterSpacing:3,color:T.accent,textTransform:"uppercase",marginBottom:6,fontFamily:"monospace"}}>{cfg.flag} {cfg.name} · FinCommand</div>
            <h1 style={{margin:0,fontSize:"clamp(20px,3vw,28px)",fontWeight:700,color:T.text,letterSpacing:-0.5,lineHeight:1.1}}>{profile?.name?profile.name+"'s ":""}Financial Dashboard</h1>
            <p style={{margin:"6px 0 0",fontSize:12,color:T.muted}}>{cfg.currency} · {cfg.taxYearNote}</p>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8}}>
            <div style={{fontSize:10,letterSpacing:1.5,color:statusInfo.color,minHeight:14,transition:"color 0.3s",fontFamily:"monospace"}}>{statusInfo.label}</div>
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",justifyContent:"flex-end"}}>
              <ThemePicker current={themeId} onChange={onThemeChange} />
              <span style={{fontSize:11,color:T.muted}}>{user?.email}</span>
              <button onClick={onSignOut} style={{background:"transparent",border:"1px solid "+T.border+"66",color:T.muted,borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:11}}>Sign Out</button>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:11,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:3}}>Net Income</div>
                <div style={{fontSize:"clamp(22px,3vw,30px)",fontFamily:"monospace",fontWeight:700,color:T.green}}>{fmt(totalIncome)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Income controls */}
        <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:16,padding:"clamp(14px,2vw,22px) clamp(16px,2.5vw,28px)",marginBottom:16}}>
          <Lbl>Income Controls</Lbl>
          <div className="fc-grid-2" style={{marginBottom:16,marginTop:12}}>
            <SliderRow label="Gross Annual Salary" value={grossSalary} min={20000} max={500000} step={5000} onChange={setGrossSalary} format={v=>cfg.symbol+(v/1000).toFixed(0)+"k"} color={T.green} sublabel={"Net ≈ "+fmt(netSalary)+"/mo"} />
            <SliderRow label="Annual Bonus"        value={annualBonus} min={0}     max={300000} step={5000} onChange={setAnnualBonus} format={v=>cfg.symbol+(v/1000).toFixed(0)+"k"} color={T.amber} sublabel={"Net ≈ "+fmt(netBonus)+"/mo avg"} />
          </div>
          <Toggle checked={inclBonus} onChange={setInclBonus} color={T.amber} label="Include Bonus Income" sublabel={inclBonus?"+"+fmt(netBonus)+"/mo in income":"Bonus excluded from all calculations"} />
          <div style={{display:"flex",gap:20,flexWrap:"wrap",padding:"12px 16px",background:T.surface,borderRadius:10,marginTop:16}}>
            {[
              {l:"Net Salary",   v:fmt(netSalary),                         c:T.green},
              {l:"Bonus /mo",    v:inclBonus?fmt(netBonus):"—",             c:inclBonus?T.amber:T.muted},
              {l:"Extra Income", v:extraIncome>0?fmt(extraIncome):"—",      c:extraIncome>0?T.purple:T.muted},
              {l:"Total Income", v:fmt(totalIncome),                        c:T.text},
              {l:"Effective Tax",v:effectiveRate+"%",                       c:T.amber},
              {l:"Remainder",    v:(remainder>=0?"+":"")+fmt(remainder),    c:remainder>=0?T.green:T.red},
            ].map(s=>(
              <div key={s.l}>
                <div style={{fontSize:11,color:T.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>{s.l}</div>
                <div style={{fontSize:15,color:s.c,fontWeight:700,fontFamily:"monospace"}}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tax banner */}
        <div style={{background:T.amber+"18",border:"1px solid "+T.amber+"33",borderRadius:12,padding:"14px 18px",fontSize:12,color:T.muted,lineHeight:1.8,marginBottom:16}}>
          <span style={{color:T.amber,fontWeight:700}}>{cfg.flag} Tax Note: </span>{cfg.rentalNotes} {cfg.taxYearNote}
        </div>

        {/* Tabs */}
        <div style={{display:"flex",gap:3,marginBottom:20,background:T.card,padding:5,borderRadius:12,border:"1px solid "+T.border,overflowX:"auto",WebkitOverflowScrolling:"touch",scrollbarWidth:"none"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"9px 12px",borderRadius:9,border:"none",background:tab===t.id?T.accent:"transparent",color:tab===t.id?T.bg:T.muted,cursor:"pointer",fontSize:11,letterSpacing:1.2,textTransform:"uppercase",fontWeight:tab===t.id?700:500,transition:"all 0.15s",whiteSpace:"nowrap",minWidth:80}}>{t.label}</button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {tab==="overview"&&(
          <>
            <div className="fc-grid-5" style={{marginBottom:16}}>
              <StatCard label="Total Expenses"  value={fmt(totalExpenses)} color={T.red}                         sub={pct(totalIncome>0?(totalExpenses/totalIncome)*100:0)+" of income"} />
              <StatCard label="Total Savings"   value={fmt(totalSavings)}  color={T.green}                       sub={pct(savingsRate)+" savings rate"} />
              <StatCard label="Effective Tax"   value={effectiveRate+"%"}  color={T.amber}                       sub={"~"+fmt(netSalary*12)+" net/yr"} />
              <StatCard label="Monthly Surplus" value={(remainder>=0?"+":"")+fmt(remainder)} color={remainder>=0?T.green:T.red} bg={remainder>=0?T.green+"18":T.red+"14"} sub="After all goals" />
              <StatCard label="Cash Runway"     value={runway.months.toFixed(1)+" mo"} color={runway.color} bg={runway.color+"18"} sub={fmt(usdBalance)+" liquid · "+runway.verdict} />
            </div>

            {/* Runway */}
            <div style={{background:T.card,border:"1px solid "+runway.color+"44",borderRadius:14,padding:"18px 20px",marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,flexWrap:"wrap",gap:10}}>
                <div>
                  <Lbl color={runway.color}>Cash Runway — Liquid Balance</Lbl>
                  <div style={{fontSize:12,color:T.muted,marginTop:3}}>{fmt(totalExpenses)}/mo burn · 6-month target = {fmt(runway.target)}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:11,color:T.muted,letterSpacing:1.5,textTransform:"uppercase"}}>Balance</span>
                  <input type="number" value={usdBalance} onChange={e=>setUsdBalance(Math.max(0,Number(e.target.value)))}
                    style={{background:T.faint,border:"1px solid "+runway.color+"66",borderRadius:8,padding:"7px 12px",color:runway.color,fontFamily:"monospace",fontSize:15,fontWeight:700,outline:"none",width:140,textAlign:"right"}} />
                </div>
              </div>
              <div style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:11,color:T.muted,letterSpacing:1}}>
                  <span>0</span>
                  <span style={{color:T.amber}}>3 months — {fmt(totalExpenses*3)}</span>
                  <span style={{color:T.green}}>6 months — {fmt(runway.target)}</span>
                </div>
                <div style={{position:"relative",height:12,background:T.faint,borderRadius:6}}>
                  <div style={{position:"absolute",left:"50%",top:0,width:1,height:"100%",background:T.amber+"66"}} />
                  <div style={{position:"absolute",left:0,top:0,height:"100%",width:runway.pct+"%",background:"linear-gradient(90deg,"+runway.color+"88,"+runway.color+")",borderRadius:6,transition:"width 0.3s"}} />
                </div>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:6,fontSize:11}}>
                  <span style={{color:runway.color,fontWeight:700}}>{runway.months.toFixed(1)} months · {pct(runway.pct)} of target</span>
                  {usdBalance<runway.target&&runway.toTarget!==null&&<span style={{color:T.muted}}>~{runway.toTarget.toFixed(1)} months to target</span>}
                  {usdBalance>=runway.target&&<span style={{color:T.green}}>✓ Fully funded</span>}
                </div>
              </div>
              <div className="fc-runway4" style={{marginTop:6}}>
                {[
                  {l:"Current Balance",  v:fmt(usdBalance),                                                      c:runway.color},
                  {l:"Monthly Burn",     v:fmt(totalExpenses),                                                   c:T.red},
                  {l:"Shortfall to 6mo", v:usdBalance>=runway.target?"✓ Funded":fmt(runway.target-usdBalance),  c:usdBalance>=runway.target?T.green:T.amber},
                  {l:"Months Covered",   v:runway.months.toFixed(1)+" mo",                                       c:runway.color},
                ].map(s=>(
                  <div key={s.l} style={{background:T.surface,borderRadius:10,padding:"12px 14px"}}>
                    <div style={{fontSize:11,color:T.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:5}}>{s.l}</div>
                    <div style={{fontSize:15,color:s.c,fontFamily:"monospace",fontWeight:700}}>{s.v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Allocation bar */}
            <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:12,padding:"16px 18px",marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                <Lbl>Monthly Allocation — {fmt(totalIncome)} total</Lbl>
                <span style={{fontSize:10,color:T.green,fontFamily:"monospace"}}>Savings rate: {pct(savingsRate)}</span>
              </div>
              <div style={{height:16,background:T.faint,borderRadius:8,overflow:"hidden",display:"flex"}}>
                {[{val:totalFixed,color:T.red},{val:totalVar,color:T.red+"88"},{val:totalSavings,color:T.green},{val:Math.max(0,remainder),color:T.muted}].map((s,i)=>(
                  <div key={i} style={{height:"100%",width:(totalIncome>0?Math.max(0,(s.val/totalIncome)*100):0)+"%",background:s.color,transition:"width 0.3s"}} />
                ))}
              </div>
              <div style={{display:"flex",gap:14,marginTop:10,flexWrap:"wrap"}}>
                {[{l:"Fixed",v:totalFixed,c:T.red},{l:"Variable",v:totalVar,c:T.red+"88"},{l:"Savings",v:totalSavings,c:T.green},{l:"Surplus",v:Math.max(0,remainder),c:T.muted}].map(s=>(
                  <div key={s.l} style={{display:"flex",alignItems:"center",gap:5}}>
                    <div style={{width:8,height:8,borderRadius:2,background:s.c}} />
                    <span style={{fontSize:11,color:T.muted}}>{s.l}: {fmt(s.v)} ({pct(totalIncome>0?(s.v/totalIncome)*100:0)})</span>
                  </div>
                ))}
              </div>
            </div>

            {/* P&L */}
            <div style={cardS}>
              {[
                {label:"Net Salary /mo",       val:netSalary,    color:T.green,                         dim:false},
                {label:"Bonus /mo (avg)",       val:bonusIncome,  color:inclBonus?T.amber:T.muted,       dim:!inclBonus},
                {label:"Other Income",          val:extraIncome,  color:extraIncome>0?T.purple:T.muted,  dim:extraIncome===0},
                {label:"Fixed Expenses",        val:-totalFixed,  color:T.red,                           dim:false},
                {label:"Variable Expenses",     val:-totalVar,    color:T.red,                           dim:false},
                {label:"Savings & Investments", val:-totalSavings,color:T.blue,                          dim:false},
                {label:"Monthly Surplus",       val:remainder,    color:remainder>=0?T.green:T.red,      bold:true},
              ].map((r,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"10px 18px",borderBottom:i<6?"1px solid "+T.border:"none",background:r.bold?T.surface:"transparent",opacity:r.dim?0.4:1}}>
                  <span style={{fontSize:r.bold?13:12,color:r.bold?T.text:T.muted,fontWeight:r.bold?700:400,textTransform:r.bold?"uppercase":"none",letterSpacing:r.bold?1:0}}>{r.label}</span>
                  <span style={{fontSize:r.bold?18:14,color:r.color,fontWeight:r.bold?700:400}}>{r.val>=0?fmt(r.val):"-"+fmt(Math.abs(r.val))}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── INCOME ── */}
        {tab==="income"&&(
          <>
            <div className="fc-grid-3" style={{marginBottom:16}}>
              <StatCard label="Net Salary /mo"   value={fmt(netSalary)}   color={T.green} sub={cfg.symbol+(grossSalary/1000).toFixed(0)+"k gross"} />
              <StatCard label="Bonus /mo (avg)"  value={inclBonus?fmt(netBonus):"Excluded"} color={inclBonus?T.amber:T.muted} sub={inclBonus?cfg.symbol+(annualBonus/1000).toFixed(0)+"k gross annual":"Toggle on above"} />
              <StatCard label="Total Net Income" value={fmt(totalIncome)} color={T.text}  sub="All active sources" />
            </div>
            <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:14,overflow:"hidden",marginBottom:14}}>
              <div style={{background:T.green+"18",borderBottom:"1px solid "+T.border,padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:16}}>💰</span>
                  <span style={{fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:T.text,fontFamily:"monospace"}}>Income Sources</span>
                </div>
                <span style={{fontSize:20,fontFamily:"monospace",fontWeight:700,color:T.green}}>{fmt(totalIncome)}</span>
              </div>
              <div style={{padding:"10px 18px 4px"}}>
                {(()=>{
                  const activeTotal=incomeTableItems.filter(i=>!i.excluded).reduce((s,i)=>s+i.amount,0);
                  return incomeTableItems.map(item=>{
                    const col=item.color||T.green;
                    const isExcluded=item.id==="bon"?!inclBonus:item.excluded;
                    const share=activeTotal>0&&!isExcluded?(item.amount/activeTotal)*100:0;
                    return (
                      <div key={item.id} style={{marginBottom:14,opacity:isExcluded?0.35:1,transition:"opacity 0.2s"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                          <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                            <div style={{width:8,height:8,borderRadius:2,background:col,flexShrink:0}} />
                            <span style={{fontSize:12,color:T.text,fontFamily:"monospace",textDecoration:isExcluded?"line-through":"none"}}>{item.name}</span>
                            <Pill label={item.type||"other"} color={col} />
                            {item.auto&&<Pill label="auto" color={T.muted} />}
                            {isExcluded&&<Pill label="excluded" color={T.muted} />}
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            {!isExcluded&&<span style={{fontSize:11,color:T.muted,fontFamily:"monospace"}}>{pct(share)}</span>}
                            <span style={{fontSize:14,color:isExcluded?T.muted:col,fontFamily:"monospace",fontWeight:700,minWidth:70,textAlign:"right"}}>{fmt(item.amount)}</span>
                            {item.id==="bon"&&<button onClick={()=>setInclBonus(!inclBonus)} style={{background:"transparent",border:"1px solid "+T.border,color:T.muted,cursor:"pointer",fontSize:10,padding:"2px 7px",borderRadius:4,fontFamily:"monospace"}}>{inclBonus?"off":"on"}</button>}
                            {item.id==="sal"&&<span style={{fontSize:11,color:T.muted,padding:"2px 7px",border:"1px solid "+T.border,borderRadius:4,fontFamily:"monospace"}}>slider ↑</span>}
                            {!item.auto&&<>
                              <button onClick={()=>setCustomIncome(p=>p.map(i=>i.id===item.id?{...i,excluded:!i.excluded}:i))} style={{background:"transparent",border:"1px solid "+T.border,color:T.muted,cursor:"pointer",fontSize:10,padding:"2px 7px",borderRadius:4,fontFamily:"monospace"}}>{item.excluded?"on":"off"}</button>
                              <button onClick={()=>setCustomIncome(p=>p.filter(i=>i.id!==item.id))} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:16,padding:"0 2px",lineHeight:1}}>×</button>
                            </>}
                          </div>
                        </div>
                        {!isExcluded&&!item.auto&&(
                          <div style={{position:"relative",height:4,background:T.faint,borderRadius:2}}>
                            <div style={{position:"absolute",left:0,top:0,height:"100%",width:Math.min(100,(item.amount/20000)*100)+"%",background:col+"88",borderRadius:2}} />
                            <input type="range" min={0} max={20000} step={50} value={item.amount} onChange={e=>setCustomIncome(p=>p.map(i=>i.id===item.id?{...i,amount:Number(e.target.value)}:i))}
                              style={{position:"absolute",top:"50%",transform:"translateY(-50%)",width:"100%",opacity:0,cursor:"pointer",height:16,margin:0}} />
                          </div>
                        )}
                        {!isExcluded&&item.auto&&<MiniBar value={item.amount} max={totalIncome||1} color={col+"44"} />}
                        {item.sub&&<div style={{fontSize:11,color:T.muted,fontFamily:"monospace",marginTop:3,paddingLeft:16}}>{item.sub}</div>}
                      </div>
                    );
                  });
                })()}
              </div>
              <div style={{borderTop:"1px solid "+T.border}}>
                <AddInline onAdd={(name,amount,type)=>setCustomIncome(p=>[...p,{id:Date.now(),name,amount,type,excluded:false,color:T.purple}])} />
              </div>
            </div>
          </>
        )}

        {/* ── EXPENSES ── */}
        {tab==="expenses"&&(
          <>
            <div className="fc-grid-3" style={{marginBottom:16}}>
              <StatCard label="Fixed Expenses"    value={fmt(totalFixed)}    color={T.red}      sub={pct(totalIncome>0?(totalFixed/totalIncome)*100:0)+" of income"} />
              <StatCard label="Variable Expenses" value={fmt(totalVar)}      color={T.red+"88"} sub={pct(totalIncome>0?(totalVar/totalIncome)*100:0)+" of income"} />
              <StatCard label="Total Outgoings"   value={fmt(totalExpenses)} color={T.red}      sub={pct(totalIncome>0?(totalExpenses/totalIncome)*100:0)+" of income"} />
            </div>
            <EditableTable title="Fixed Expenses"    icon="🔒" items={fixedItems} setItems={setFixedItems} accentColor={T.red}  sliderMax={8000} />
            <EditableTable title="Variable Expenses" icon="🔄" items={varItems}   setItems={setVarItems}   accentColor={T.blue} sliderMax={3000} />
          </>
        )}

        {/* ── SAVINGS ── */}
        {tab==="savings"&&(
          <>
            <div className="fc-grid-3" style={{marginBottom:16}}>
              <StatCard label="Monthly Savings"  value={fmt(totalSavings)}             color={T.green} sub={pct(savingsRate)+" savings rate"} />
              <StatCard label="Annual Savings"   value={fmt(totalSavings*12)}           color={T.green} sub="Excluding bonus" />
              <StatCard label="With Bonus (net)" value={fmt(totalSavings*12+netBonus*12)} color={T.amber} sub="Total annual capacity" />
            </div>
            <SavingsSection buckets={savBuckets} setBuckets={setSavBuckets} />
            <div style={{background:T.card,border:"1px solid "+T.border,borderRadius:12,padding:"16px 18px",marginBottom:14}}>
              <Lbl color={T.green}>Allocation Breakdown</Lbl>
              <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:10}}>
                {savBuckets.filter(b=>!b.excluded).map((b,idx)=>{
                  const SAV_COLORS=[T.green,T.blue,T.purple,T.amber,T.red];
                  const col=b.color||SAV_COLORS[idx%SAV_COLORS.length];
                  const share=totalSavings>0?(b.amount/totalSavings)*100:0;
                  return (
                    <div key={b.id} style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:80,fontSize:11,color:T.muted,textAlign:"right",flexShrink:0}}>{fmt(b.amount)}</div>
                      <div style={{flex:1}}><MiniBar value={b.amount} max={totalSavings||1} color={col} /></div>
                      <div style={{fontSize:10,color:col,width:36,flexShrink:0}}>{pct(share)}</div>
                      <div style={{fontSize:11,color:T.text,flex:1}}>{b.name}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ── PROJECTIONS ── */}
        {tab==="projections"&&(
          <>
            <div style={{display:"flex",gap:6,marginBottom:14,background:T.card,padding:4,borderRadius:10,border:"1px solid "+T.border,width:"fit-content"}}>
              {INTERVAL_MODES.map(m=>(
                <button key={m.id} onClick={()=>setProjInterval(m.id)} style={{padding:"6px 14px",borderRadius:7,border:"none",background:projInterval===m.id?T.accent:"transparent",color:projInterval===m.id?T.bg:T.muted,cursor:"pointer",fontSize:10,fontFamily:"monospace",letterSpacing:1.5,textTransform:"uppercase",fontWeight:projInterval===m.id?700:400,transition:"all 0.15s",whiteSpace:"nowrap"}}>{m.label}</button>
              ))}
            </div>
            <ProjChart monthlySavings={totalSavings} netBonus={netBonus} includeBonus={inclBonus} intervalMode={projInterval} fmtK={fmtK} />
            <div style={cardS}>
              <div style={{padding:"12px 18px",background:T.surface,borderBottom:"1px solid "+T.border,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <Lbl color={T.green}>Detailed Projections — {fmt(totalSavings)}/mo @ 7% return</Lbl>
                <Pill label={projMode.label+" view"} color={T.green} />
              </div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:"monospace"}}>
                  <thead>
                    <tr>{["Period","Investments","Bonus Invested","Car","Total","vs Target"].map(h=>(
                      <th key={h} style={{padding:"10px 12px",textAlign:"right",color:T.muted,fontSize:10,letterSpacing:1.5,textTransform:"uppercase",borderBottom:"1px solid "+T.border,whiteSpace:"nowrap"}}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {projMode.steps.map((y,i)=>{
                      const row=calcProjRow(y,totalSavings,netBonus,inclBonus);
                      const gap=row.total-TARGET_USD,hit=row.total>=TARGET_USD;
                      return (
                        <tr key={y} style={{background:i%2===0?T.surface:"transparent",borderBottom:"1px solid "+T.border}}>
                          <td style={{padding:"10px 12px",color:hit?T.amber:T.text,fontWeight:hit?700:400,whiteSpace:"nowrap"}}>{projMode.fmt(y)}{hit?" ✓":""}</td>
                          <td style={{padding:"10px 12px",textAlign:"right",color:T.blue}}>{fmtK(row.inv)}</td>
                          <td style={{padding:"10px 12px",textAlign:"right",color:inclBonus?T.amber:T.muted}}>{inclBonus?fmtK(row.bon):"—"}</td>
                          <td style={{padding:"10px 12px",textAlign:"right",color:T.muted}}>{fmtK(row.car)}</td>
                          <td style={{padding:"10px 12px",textAlign:"right",color:hit?T.amber:T.green,fontWeight:700}}>{fmtK(row.total)}</td>
                          <td style={{padding:"10px 12px",textAlign:"right",color:hit?T.green:T.red}}>{gap>=0?"+":""}{fmtK(gap)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── ANALYSIS ── */}
        {tab==="analysis"&&(
          <>
            <HealthScore savingsRate={savingsRate} housingPct={housingPct} totalExpenses={totalExpenses} netIncome={totalIncome} />
            <div style={{background:T.card,border:"1px solid "+runway.color+"44",borderRadius:12,padding:"16px 18px",marginBottom:14}}>
              <Lbl color={runway.color}>Cash Runway Analysis — {fmt(usdBalance)} liquid</Lbl>
              <div className="fc-analysis" style={{marginTop:12}}>
                {[
                  {label:"3-month benchmark",  score:runway.months>=3?"✓ Met":"⚠ Below",                                                          color:runway.months>=3?T.green:T.red,  detail:runway.months>=3?fmt(usdBalance)+" covers "+runway.months.toFixed(1)+" months. Above minimum.":"Only "+runway.months.toFixed(1)+"mo covered. "+fmt(runway.target/2-usdBalance)+" needed for 3-month floor."},
                  {label:"6-month target",     score:runway.months>=6?"✓ Funded":runway.months>=3?"~ In Progress":"⚠ Priority",                    color:runway.color,                    detail:runway.months>=6?"Fully funded. "+fmt(usdBalance-runway.target)+" above target — consider deploying into investments.":fmt(runway.target-usdBalance)+" shortfall. "+(runway.toTarget!==null?"Reachable in ~"+runway.toTarget.toFixed(1)+" months at current surplus.":"Increase surplus to accelerate.")},
                  {label:"Expense sensitivity",score:totalExpenses<4000?"✓ Lean":totalExpenses<7000?"~ Moderate":"⚠ High Burn",                    color:totalExpenses<4000?T.green:totalExpenses<7000?T.amber:T.red, detail:"Monthly burn "+fmt(totalExpenses)+". Each "+cfg.symbol+"1,000 cut adds "+(1000/Math.max(1,totalExpenses)).toFixed(2)+" months of runway."},
                  {label:"Balance vs income",  score:usdBalance>=totalIncome*2?"✓ Strong":usdBalance>=totalIncome?"~ Adequate":"⚠ Low",            color:usdBalance>=totalIncome*2?T.green:usdBalance>=totalIncome?T.amber:T.red, detail:fmt(usdBalance)+" is "+(totalIncome>0?(usdBalance/totalIncome).toFixed(1):"—")+"× monthly income. Target: 2×+ as liquid buffer."},
                ].map(item=>(
                  <div key={item.label} style={{background:T.surface,border:"1px solid "+item.color+"33",borderRadius:10,padding:"12px 14px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
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
                {area:"Housing",          color:rent>totalIncome*.35?T.red:rent>totalIncome*.28?T.amber:T.green, verdict:rent>totalIncome*.35?"⚠ Elevated":rent>totalIncome*.28?"~ Borderline":"✓ Reasonable",  detail:"At "+pct(housingPct)+" of net income. "+cfg.taxYearNote},
                {area:"Savings Rate",     color:savingsRate>=30?T.green:savingsRate>=20?T.amber:T.red,           verdict:savingsRate>=30?"✓ Strong":savingsRate>=20?"~ Moderate":"⚠ Insufficient",               detail:pct(savingsRate)+" savings rate. Target 30%+ for aggressive wealth building."},
                {area:"Expense Control",  color:totalExpenses<totalIncome*.65?T.green:totalExpenses<totalIncome*.80?T.amber:T.red, verdict:totalExpenses<totalIncome*.65?"✓ Controlled":totalExpenses<totalIncome*.80?"~ Moderate":"⚠ High", detail:"Total outgoings "+fmt(totalExpenses)+"/mo = "+pct(totalIncome>0?(totalExpenses/totalIncome)*100:0)+" of net income."},
                {area:"Tax Efficiency",   color:Number(effectiveRate)<25?T.green:Number(effectiveRate)<35?T.amber:T.red, verdict:Number(effectiveRate)<25?"✓ Efficient":Number(effectiveRate)<35?"~ Average":"⚠ High Burden", detail:effectiveRate+"% effective rate under "+cfg.flag+" "+cfg.name+" rules. "+cfg.rentalNotes},
                {area:"Wealth Trajectory",color:T.green,verdict:"✓ On Track",detail:"At "+fmt(totalSavings)+"/mo + bonus, compounding at 7% puts you on track for the $1.9M target within 7–12 years depending on income growth."},
              ].map((r,i)=>(
                <div key={i} style={{padding:"14px 18px",borderBottom:i<4?"1px solid "+T.border:"none"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <span style={{fontSize:12,color:T.text,fontWeight:700}}>{r.area}</span>
                    <Pill label={r.verdict} color={r.color} />
                  </div>
                  <p style={{margin:0,fontSize:11,color:T.muted,lineHeight:1.7}}>{r.detail}</p>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{textAlign:"center",marginTop:28,fontSize:11,color:T.border,paddingBottom:24}}>
          For personal planning purposes only · Not financial advice · FinCommand 2026
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ERROR BOUNDARY
// ══════════════════════════════════════════════════════════════════════════════
class ErrorBoundary extends React.Component {
  constructor(props){super(props);this.state={error:null};}
  static getDerivedStateFromError(e){return {error:e};}
  render(){
    if(this.state.error)return(
      <div style={{minHeight:"100vh",background:"#08090b",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace",color:"#ff4d6d",flexDirection:"column",gap:16,padding:20}}>
        <div style={{fontSize:32}}>⚠</div>
        <div style={{fontSize:14,fontWeight:700}}>Something went wrong</div>
        <div style={{fontSize:11,color:"#4a5568",maxWidth:400,textAlign:"center",lineHeight:1.7}}>{this.state.error?.message||"An unexpected error occurred."}</div>
        <button onClick={()=>this.setState({error:null})} style={{background:"#ff4d6d",border:"none",color:"#fff",borderRadius:8,padding:"10px 20px",cursor:"pointer",fontSize:12,fontFamily:"monospace"}}>Try Again</button>
      </div>
    );
    return this.props.children;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [screen,   setScreen]  =useState("loading");
  const [user,     setUser]    =useState(null);
  const [profile,  setProfile] =useState(null);
  const [dashData, setDashData]=useState(null);
  // Theme persisted to localStorage so it survives refresh
  const [themeId,  setThemeId] =useState(()=>{ try{return localStorage.getItem("fincommand_theme")||"terminal";}catch{return "terminal";} });

  const handleThemeChange=useCallback(id=>{
    setThemeId(id);
    try{localStorage.setItem("fincommand_theme",id);}catch{}
  },[]);

  const loadUserData=useCallback(async(u)=>{
    try {
      const {data}=await db.loadUserData(u.id);
      if(data?.profile&&data?.dashboard){setProfile(data.profile);setDashData(data.dashboard);setScreen("dashboard");}
      else setScreen("onboarding");
    } catch{setScreen("onboarding");}
  },[]);

  useEffect(()=>{
    db.getSession().then(session=>{
      if(session?.user){setUser(session.user);loadUserData(session.user);}
      else setScreen("landing");
    });
  },[loadUserData]);

  useEffect(()=>{
    if(!MOCK_MODE){
      let sub;
      getSupabase().then(sb=>{
        const {data}=sb.auth.onAuthStateChange((_,session)=>{
          if(session?.user){setUser(session.user);loadUserData(session.user);}
          else{setUser(null);setProfile(null);setDashData(null);setScreen("landing");}
        });
        sub=data.subscription;
      });
      return ()=>sub?.unsubscribe();
    }
  },[loadUserData]);

  const refreshSession=useCallback(async()=>{
    const session=await db.getSession();
    if(session?.user){setUser(session.user);await loadUserData(session.user);}
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
    <div style={{minHeight:"100vh",background:"#08090b",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace",color:"#4a5568",fontSize:11,letterSpacing:2}}>LOADING…</div>
  );

  return (
    <ErrorBoundary>
      <GlobalStyles />
      <ThemeContext.Provider value={theme}>
        {screen==="landing"    &&<LandingPage onGetStarted={()=>setScreen("auth")} />}
        {screen==="auth"       &&<AuthPage onBack={()=>setScreen("landing")} onAuthSuccess={refreshSession} />}
        {screen==="onboarding" &&<OnboardingPage user={user} onComplete={handleOnboardingComplete} />}
        {screen==="dashboard"  &&<Dashboard user={user} profile={profile} initialData={dashData} onSignOut={handleSignOut} themeId={themeId} onThemeChange={handleThemeChange} />}
      </ThemeContext.Provider>
    </ErrorBoundary>
  );
}
