import React, { useState, useEffect, useMemo } from "react";

const T = { bg:"#07090D", panel:"#0E1218", raised:"#131A23", border:"#1C2530",
  text:"#F2F5F8", muted:"#7A8699", dim:"#4C5564", cyan:"#2DE2E6", cyanDeep:"#12B6BC",
  gain:"#3DDC97", loss:"#FF5C6C", warn:"#F5B544" };
const usd=(n,sign=false)=>{const x=Number(n)||0;const s=x<0?"-":sign?"+":"";return s+"$"+Math.abs(x).toFixed(2);};
const num={fontVariantNumeric:"tabular-nums"};
const mono={fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace"};

function I({d,size=18,color="currentColor",fill="none"}){
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>);
}
const Ic={
  activity:(p)=><I {...p} d={<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>}/>,
  pause:(p)=><I {...p} d={<g><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></g>}/>,
  play:(p)=><I {...p} fill={p.color} d={<polygon points="6 3 20 12 6 21 6 3"/>}/>,
  power:(p)=><I {...p} d={<g><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></g>}/>,
  shield:(p)=><I {...p} d={<g><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></g>}/>,
  cpu:(p)=><I {...p} d={<g><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/></g>}/>,
  zap:(p)=><I {...p} fill={p.color} d={<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>}/>,
  check:(p)=><I {...p} d={<polyline points="20 6 9 17 4 12"/>}/>,
  x:(p)=><I {...p} d={<g><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></g>}/>,
  up:(p)=><I {...p} d={<g><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></g>}/>,
  down:(p)=><I {...p} d={<g><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></g>}/>,
  gauge:(p)=><I {...p} d={<g><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></g>}/>,
  server:(p)=><I {...p} d={<g><rect x="2" y="3" width="20" height="8" rx="2"/><rect x="2" y="13" width="20" height="8" rx="2"/><line x1="6" y1="7" x2="6.01" y2="7"/><line x1="6" y1="17" x2="6.01" y2="17"/></g>}/>,
  radio:(p)=><I {...p} d={<g><circle cx="12" cy="12" r="2"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14M19.07 4.93a10 10 0 0 1 0 14.14M7.76 16.24a6 6 0 0 1 0-8.49M16.24 7.76a6 6 0 0 1 0 8.49"/></g>}/>,
};

const HISTORY=[100,104,99,112,121,118,108,96,113,142,168,159,187,214,236,261,298,324,342.18].map((v,i)=>({day:i,v}));
const SEED=[
  {id:"dp",name:"Digital products",alloc:90,ret:106,win:.62,trades:21,enabled:true,spark:[3,5,4,7,9,8,12,14],note:"exploiting"},
  {id:"sa",name:"Service arbitrage",alloc:64,ret:41,win:.55,trades:14,enabled:true,spark:[2,3,5,4,6,8,7,9],note:"exploiting"},
  {id:"ca",name:"Content & affiliate",alloc:28,ret:9,win:.40,trades:6,enabled:true,spark:[0,1,1,2,2,3,4,5],note:"slow fuse"},
  {id:"cr",name:"Curated reselling",alloc:20,ret:14,win:.50,trades:5,enabled:true,spark:[1,0,2,3,2,4,5,6],note:"exploring"},
  {id:"pod",name:"Print on demand",alloc:12,ret:-7,win:.21,trades:9,enabled:true,spark:[2,1,0,-1,-2,-2,-3,-3],note:"throttled"},
];
const PRODUCTS=["Notion Founder OS","Pitch Deck Pack","Cold Email Kit","Brand Starter","Resume Engine","SEO Brief Pack"];
const NICHES=["solo founders","real-estate agents","fitness coaches","etsy sellers","indie devs"];

function Panel({title,icon,right,children,span}){
  return (<div className={span||""} style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:16}}>
    {title&&<div className="flex items-center justify-between px-4 pt-3 pb-2"><div className="flex items-center gap-2">{icon}<span className="text-xs font-bold uppercase tracking-widest" style={{color:T.muted}}>{title}</span></div>{right}</div>}
    <div className="px-4 pb-4">{children}</div></div>);
}
function Spark({data,color}){
  const w=88,h=28,pad=2;if(!data||data.length<2)data=[0,0];
  const min=Math.min(...data),max=Math.max(...data),rng=max-min||1;
  const pts=data.map((d,i)=>{const x=pad+(i/(data.length-1))*(w-pad*2);const y=h-pad-((d-min)/rng)*(h-pad*2);return `${x},${y}`;}).join(" ");
  return <svg width={w} height={h}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/></svg>;
}
function Ring({pct,size=120,stroke=10}){
  const r=(size-stroke)/2,c=2*Math.PI*r,off=c*(1-pct);
  return (<svg width={size} height={size} style={{transform:"rotate(-90deg)"}}><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={T.border} strokeWidth={stroke}/><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={T.cyan} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" style={{transition:"stroke-dashoffset 700ms ease",filter:`drop-shadow(0 0 6px ${T.cyan}66)`}}/></svg>);
}
function Bar({value,cap,color}){const pct=Math.min(1,(value||0)/(cap||1));return <div className="w-full rounded-full overflow-hidden" style={{height:6,background:T.border}}><div style={{width:`${pct*100}%`,height:"100%",background:color,borderRadius:999,transition:"width 500ms ease"}}/></div>;}
function AreaChart({data,goal=1000,height=232}){
  const W=600,H=height,padL=34,padB=18,padT=8,max=goal;
  const xs=data.map(d=>d.day),xmin=Math.min(...xs),xmax=Math.max(...xs)||1;
  const X=d=>padL+((d-xmin)/((xmax-xmin)||1))*(W-padL-6),Y=v=>padT+(1-v/max)*(H-padT-padB);
  const line=data.map(d=>`${X(d.day)},${Y(d.v)}`).join(" ");
  const area=`${X(data[0].day)},${H-padB} `+line+` ${X(data[data.length-1].day)},${H-padB}`;
  const ticks=[0,.25,.5,.75,1].map(f=>f*max);
  return (<svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.cyan} stopOpacity=".5"/><stop offset="100%" stopColor={T.cyan} stopOpacity="0"/></linearGradient></defs>
    {ticks.map((t,i)=><g key={i}><line x1={padL} y1={Y(t)} x2={W-6} y2={Y(t)} stroke={T.border} strokeWidth="1" vectorEffect="non-scaling-stroke"/><text x="2" y={Y(t)+3} fill={T.dim} fontSize="11">${t}</text></g>)}
    <line x1={padL} y1={Y(goal)} x2={W-6} y2={Y(goal)} stroke={T.gain} strokeDasharray="4 4" strokeOpacity=".6" vectorEffect="non-scaling-stroke"/>
    <text x={W-8} y={Y(goal)-4} fill={T.gain} fontSize="10" textAnchor="end">goal</text>
    <polygon points={area} fill="url(#g)"/><polyline points={line} fill="none" stroke={T.cyan} strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
  </svg>);
}
function Donut({segs,size=132,stroke=20}){
  const r=(size-stroke)/2,c=2*Math.PI*r,total=segs.reduce((a,s)=>a+s.value,0)||1;let acc=0;
  return (<svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>{segs.map((s,i)=>{const f=s.value/total,dash=f*c,off=-acc*c;acc+=f;return <circle key={i} cx={size/2} cy={size/2} r={r} fill="none" stroke={s.color} strokeWidth={stroke} strokeDasharray={`${dash} ${c-dash}`} strokeDashoffset={off}/>;})}</svg>);
}
const ACT={rev:{c:T.gain,label:"SALE"},spend:{c:T.cyan,label:"SPEND"},dec:{c:T.muted,label:"DECISION"},res:{c:T.muted,label:"RESEARCH"},block:{c:T.loss,label:"BLOCKED"}};

function Kpi({label,value,sub,accent,icon}){return (<div style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:16}} className="p-4"><div className="flex items-center gap-1.5 mb-2"><span className="text-xs font-bold uppercase tracking-widest" style={{color:T.dim}}>{label}</span>{icon}</div><div className="text-3xl font-black tracking-tight leading-none" style={{color:accent,...num}}>{value}</div><div className="text-xs mt-2" style={{color:T.muted,...num}}>{sub}</div></div>);}
function Velo({label,v,cap}){const over=(v||0)/(cap||1)>0.8;return (<div><div className="flex items-center justify-between mb-1.5"><span className="text-sm" style={{color:T.muted}}>{label}</span><span className="text-sm font-bold" style={{color:over?T.warn:T.text,...num}}>{usd(v)} / {usd(cap)}</span></div><Bar value={v} cap={cap} color={over?T.warn:T.cyan}/></div>);}
function Row({k,v}){return (<div className="flex items-center justify-between py-1.5"><span className="text-sm" style={{color:T.muted}}>{k}</span><span className="text-sm font-bold" style={{color:T.text}}>{v}</span></div>);}

export default function App(){
  const [systemState,setSystemState]=useState("live");
  const [mode,setMode]=useState("full");
  const [killArmed,setKillArmed]=useState(false);
  const [range,setRange]=useState("all");
  const [balance,setBalance]=useState(342.18);
  const [today,setToday]=useState(18.4);
  const [strategies,setStrategies]=useState(SEED);
  const [inflight]=useState(16);
  const [vel,setVel]=useState({hour:3.2,hourCap:8,day:22.4,dayCap:40});
  const [hbAgo,setHbAgo]=useState(8);
  const [blocks,setBlocks]=useState(3);
  const [activity,setActivity]=useState([
    {t:"09:42:11",k:"rev",m:"Sold 'Notion Founder OS' kit",v:12.0},
    {t:"09:41:50",k:"dec",m:"Decision Core reweighted toward Digital products"},
    {t:"09:40:02",k:"res",m:"Scored 4 niches, 1 viable"},
    {t:"09:38:33",k:"spend",m:"Spent on ad test · Service arbitrage",v:-2.5},
    {t:"09:36:09",k:"block",m:"Blocked: ad spend would exceed hourly cap"},
  ]);
  const [pending,setPending]=useState([
    {id:1,m:"Run $8 ad set · Digital products",cost:8,ev:19},
    {id:2,m:"List 'Pitch Deck Pack' on storefront",cost:0,ev:31},
    {id:3,m:"Buy resale unit, est. flip",cost:14,ev:22},
  ]);
  const running=systemState==="live";

  useEffect(()=>{if(!running)return;const id=setInterval(()=>{
    setHbAgo(0);const ts=new Date().toTimeString().slice(0,8);const roll=Math.random();
    const en=strategies.filter(s=>s.enabled);const pick=en[Math.floor(Math.random()*en.length)]||strategies[0];
    if(roll<0.34){const v=+(Math.random()*16+4).toFixed(2);const p=PRODUCTS[Math.floor(Math.random()*PRODUCTS.length)];setBalance(b=>+(b+v).toFixed(2));setToday(t=>+(t+v).toFixed(2));push({t:ts,k:"rev",m:`Sold '${p}'`,v});}
    else if(roll<0.52){const v=+(Math.random()*4+0.5).toFixed(2);setBalance(b=>+(b-v).toFixed(2));setVel(x=>({...x,hour:+(x.hour+v).toFixed(2),day:+(x.day+v).toFixed(2)}));push({t:ts,k:"spend",m:`Spent on promotion · ${pick.name}`,v:-v});}
    else if(roll<0.70){push({t:ts,k:"dec",m:`Decision Core reweighted toward ${pick.name}`});}
    else if(roll<0.86){const n=NICHES[Math.floor(Math.random()*NICHES.length)];push({t:ts,k:"res",m:`Researched ${n}, scored ${Math.ceil(Math.random()*5)} ideas`});}
    else {setBlocks(b=>b+1);push({t:ts,k:"block",m:"Blocked: action outside guardrails, skipped"});}
  },2600);return ()=>clearInterval(id);},[running,strategies]);
  useEffect(()=>{const id=setInterval(()=>setHbAgo(a=>running?Math.min(a+1,99):a),1000);return ()=>clearInterval(id);},[running]);
  function push(a){setActivity(l=>[a,...l].slice(0,40));}
  function approve(p,ok){setPending(l=>l.filter(x=>x.id!==p.id));const ts=new Date().toTimeString().slice(0,8);if(ok){if(p.cost>0){setBalance(b=>+(b-p.cost).toFixed(2));setVel(x=>({...x,hour:+(x.hour+p.cost).toFixed(2),day:+(x.day+p.cost).toFixed(2)}));}push({t:ts,k:"spend",m:`Approved: ${p.m}`,v:p.cost?-p.cost:undefined});}else push({t:ts,k:"block",m:`Rejected: ${p.m}`});}
  function toggle(id){setStrategies(l=>l.map(s=>s.id===id?{...s,enabled:!s.enabled}:s));}
  function kill(){if(!killArmed){setKillArmed(true);return;}setSystemState("stopped");setKillArmed(false);push({t:new Date().toTimeString().slice(0,8),k:"block",m:"Emergency stop engaged by operator"});}

  const deployed=useMemo(()=>strategies.filter(s=>s.enabled).reduce((a,s)=>a+s.alloc,0),[strategies]);
  const available=Math.max(0,+(balance-deployed-inflight).toFixed(2));
  const multiple=(balance/100).toFixed(2);
  const missionPct=Math.min(1,(balance-100)/(1000-100));
  const chartData=range==="7d"?HISTORY.slice(-7):HISTORY;
  const donut=[{name:"Available",value:available,color:T.dim},{name:"Deployed",value:deployed,color:T.cyan},{name:"In flight",value:inflight,color:T.warn}];
  const stateColor=running?T.gain:systemState==="paused"?T.warn:T.loss;
  const stateLabel=running?"LIVE":systemState==="paused"?"PAUSED":"STOPPED";

  return (<div style={{background:T.bg,color:T.text,minHeight:"100%"}}>
    <div className="mx-auto p-4 lg:p-6" style={{maxWidth:1320}}>
      <div className="px-3 py-2 mb-4 rounded-lg text-xs" style={{background:`${T.cyan}14`,border:`1px solid ${T.cyan}40`,color:T.cyan}}>Preview with simulated data — this is the UI. The live version reads your real ledger from the Centurion backend. (Open in a browser to make it interactive.)</div>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3"><div className="flex items-center justify-center" style={{width:38,height:38,borderRadius:10,background:T.raised,border:`1px solid ${T.border}`}}><Ic.activity color={T.cyan} size={20}/></div>
          <div><div className="flex items-center gap-2"><span className="text-xl font-black tracking-tight">CENTURION</span><span className="livedot" style={{width:8,height:8,borderRadius:999,background:stateColor,boxShadow:`0 0 8px ${stateColor}`}}/><span className="text-xs font-bold tracking-widest" style={{color:stateColor}}>{stateLabel}</span></div><div className="text-xs" style={{color:T.dim,...mono}}>uptime 18d 04h · host vps-sfo-01 · cycle 45m</div></div></div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg overflow-hidden" style={{border:`1px solid ${T.border}`}}>{["full","guarded","review"].map(m=><button key={m} onClick={()=>setMode(m)} className="text-xs font-bold uppercase tracking-wider px-3 py-2 transition" style={{background:mode===m?T.cyan:"transparent",color:mode===m?T.bg:T.muted}}>{m}</button>)}</div>
          <button onClick={()=>setSystemState(s=>s==="live"?"paused":"live")} disabled={systemState==="stopped"} className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-3 py-2 rounded-lg" style={{background:T.raised,border:`1px solid ${T.border}`,color:systemState==="stopped"?T.dim:T.text,opacity:systemState==="stopped"?.5:1}}>{running?<Ic.pause size={14}/>:<Ic.play size={14}/>}{running?"Pause":"Resume"}</button>
          <button onClick={kill} className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-3 py-2 rounded-lg" style={{background:killArmed?T.loss:"transparent",border:`1px solid ${T.loss}`,color:killArmed?T.bg:T.loss}}><Ic.power size={14}/>{killArmed?"Confirm stop":"Emergency stop"}</button>
          {systemState==="stopped"&&<button onClick={()=>setSystemState("live")} className="text-xs font-bold uppercase tracking-wider px-3 py-2 rounded-lg" style={{background:T.cyan,color:T.bg}}>Reactivate</button>}
        </div></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Kpi label="Balance" value={usd(balance)} sub="from $100 funded" accent={T.text}/>
        <Kpi label="Multiple" value={`${multiple}x`} sub="return on capital" accent={T.cyan}/>
        <Kpi label="Today" value={usd(today,true)} sub="net so far" accent={today>=0?T.gain:T.loss} icon={today>=0?<Ic.up size={14} color={T.gain}/>:<Ic.down size={14} color={T.loss}/>}/>
        <Kpi label="Deployed" value={usd(deployed)} sub={`${usd(available)} available`} accent={T.text}/>
      </div>
      {mode!=="full"&&<div className="mb-3" style={{background:T.panel,border:`1px solid ${T.warn}55`,borderRadius:16}}>
        <div className="flex items-center gap-2 px-4 pt-3 pb-2"><Ic.shield size={15} color={T.warn}/><span className="text-xs font-bold uppercase tracking-widest" style={{color:T.warn}}>Awaiting approval · {mode} mode</span></div>
        <div className="px-4 pb-4 space-y-2">{pending.length===0&&<div className="text-sm" style={{color:T.dim}}>Nothing waiting. The agent is acting within your set limits.</div>}
          {pending.map(p=><div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg" style={{background:T.raised}}><div className="min-w-0"><div className="text-sm font-semibold truncate">{p.m}</div><div className="text-xs" style={{color:T.muted,...num}}>cost {usd(p.cost)} · est. return {usd(p.ev,true)}</div></div><div className="flex items-center gap-2 shrink-0"><button onClick={()=>approve(p,true)} className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-md" style={{background:T.gain,color:T.bg}}><Ic.check size={13}/>Approve</button><button onClick={()=>approve(p,false)} className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-md" style={{background:"transparent",border:`1px solid ${T.border}`,color:T.muted}}><Ic.x size={13}/>Reject</button></div></div>)}
        </div></div>}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mb-3">
        <Panel span="xl:col-span-2" title="Mission · $100 to $1,000" icon={<Ic.up size={15} color={T.cyan}/>} right={<div className="flex rounded-md overflow-hidden" style={{border:`1px solid ${T.border}`}}>{["7d","all"].map(r=><button key={r} onClick={()=>setRange(r)} className="text-xs font-bold uppercase px-2.5 py-1" style={{background:range===r?T.border:"transparent",color:range===r?T.text:T.dim}}>{r}</button>)}</div>}>
          <AreaChart data={chartData}/></Panel>
        <Panel title="Where the money is" icon={<Ic.gauge size={15} color={T.cyan}/>}>
          <div className="flex items-center gap-4"><div className="relative" style={{width:132,height:132}}><Donut segs={donut}/><div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-lg font-black" style={num}>{usd(balance)}</span><span className="text-xs" style={{color:T.dim}}>total</span></div></div>
            <div className="flex-1 space-y-2">{donut.map((d,i)=><div key={i} className="flex items-center justify-between"><div className="flex items-center gap-2"><span style={{width:9,height:9,borderRadius:2,background:d.color}}/><span className="text-sm" style={{color:T.muted}}>{d.name}</span></div><span className="text-sm font-bold" style={num}>{usd(d.value)}</span></div>)}</div></div>
          <div className="flex items-center justify-between mt-4 pt-3" style={{borderTop:`1px solid ${T.border}`}}><div><div className="text-xs uppercase tracking-widest" style={{color:T.dim}}>Downside floor</div><div className="text-sm font-bold" style={{color:T.gain}}>$100 funded · protected</div></div>
            <div className="flex items-center gap-2"><Ring pct={missionPct} size={56} stroke={7}/><div><div className="text-sm font-black" style={num}>{Math.round(missionPct*100)}%</div><div className="text-xs" style={{color:T.dim}}>to goal</div></div></div></div></Panel>
      </div>
      <Panel title="Strategies · what it's doing and how each is paying" icon={<Ic.cpu size={15} color={T.cyan}/>}>
        <div className="hidden lg:grid grid-cols-12 gap-3 px-2 pb-2 text-xs uppercase tracking-widest" style={{color:T.dim}}><div className="col-span-3">Strategy</div><div className="col-span-3">Capital allocated</div><div className="col-span-2 text-right">Return</div><div className="col-span-1 text-right">Win</div><div className="col-span-2">Trend</div><div className="col-span-1 text-right">On</div></div>
        <div className="space-y-1">{strategies.map(s=>{const roi=s.alloc?(s.ret/s.alloc)*100:0;const pos=s.ret>=0;const maxA=Math.max(1,...strategies.map(x=>x.alloc));
          return (<div key={s.id} className="grid grid-cols-12 gap-3 items-center px-2 py-2.5 rounded-lg" style={{background:T.raised,opacity:s.enabled?1:.45}}>
            <div className="col-span-6 lg:col-span-3 min-w-0"><div className="text-sm font-bold truncate">{s.name}</div><div className="text-xs" style={{color:s.note==="throttled"?T.warn:T.dim}}>{s.note} · {s.trades} trades</div></div>
            <div className="hidden lg:block col-span-3"><div className="flex items-center justify-between mb-1"><span className="text-xs" style={{color:T.muted,...num}}>{usd(s.alloc)}</span></div><Bar value={s.alloc/maxA} cap={1} color={s.enabled?T.cyan:T.dim}/></div>
            <div className="col-span-3 lg:col-span-2 text-right"><div className="text-sm font-black" style={{color:pos?T.gain:T.loss,...num}}>{usd(s.ret,true)}</div><div className="text-xs" style={{color:T.dim,...num}}>{pos?"+":""}{roi.toFixed(0)}% roi</div></div>
            <div className="hidden lg:block col-span-1 text-right text-sm font-bold" style={num}>{Math.round(s.win*100)}%</div>
            <div className="hidden lg:block col-span-2"><Spark data={s.spark} color={pos?T.gain:T.loss}/></div>
            <div className="col-span-3 lg:col-span-1 flex justify-end"><button onClick={()=>toggle(s.id)} style={{width:38,height:22,borderRadius:999,background:s.enabled?T.cyanDeep:T.border,position:"relative",transition:"background 200ms"}}><span style={{position:"absolute",top:3,left:s.enabled?19:3,width:16,height:16,borderRadius:999,background:s.enabled?T.cyan:T.dim,transition:"left 200ms"}}/></button></div>
          </div>);})}</div>
        <div className="text-xs mt-3" style={{color:T.dim}}>The Decision Core concentrates capital on what's working and throttles what isn't. Toggling a strategy off returns its capital to available.</div></Panel>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
        <Panel span="lg:col-span-2" title="Live activity" icon={<Ic.radio size={15} color={T.cyan}/>} right={<span className="text-xs" style={{color:T.dim,...mono}}>{running?"streaming":"paused"}</span>}>
          <div className="overflow-y-auto" style={{maxHeight:320}}>{activity.map((a,i)=>{const m=ACT[a.k];return (<div key={i} className="feedline flex items-center gap-3 py-2" style={{borderBottom:`1px solid ${T.border}`}}><span className="text-xs shrink-0" style={{color:T.dim,...mono}}>{a.t}</span><span className="text-xs font-bold shrink-0" style={{color:m.c,width:72}}>{m.label}</span><span className="text-sm flex-1 min-w-0 truncate" style={{color:T.text}}>{a.m}</span>{a.v!=null&&<span className="text-sm font-bold shrink-0" style={{color:a.v>=0?T.gain:T.cyan,...num}}>{usd(a.v,true)}</span>}</div>);})}</div></Panel>
        <div className="space-y-3">
          <Panel title="Spend velocity" icon={<Ic.zap size={15} color={T.cyan}/>}><div className="space-y-3"><Velo label="This hour" v={vel.hour} cap={vel.hourCap}/><Velo label="Today" v={vel.day} cap={vel.dayCap}/></div><div className="text-xs mt-3" style={{color:T.dim}}>Caps stop it draining the budget in one bad hour while you sleep.</div></Panel>
          <Panel title="System" icon={<Ic.server size={15} color={T.cyan}/>}><Row k="Heartbeat" v={<span style={{color:running?T.gain:T.warn,...mono}}>{running?`${hbAgo}s ago`:"stalled"}</span>}/><Row k="Last cycle" v="3m ago"/><Row k="Model" v="Qwen2.5-14B · local"/><Row k="Compute budget" v={<span style={num}>$14.20 / $30</span>}/><div className="flex items-center justify-between py-1.5"><span className="text-sm" style={{color:T.muted}}>Guardrails</span><span className="flex items-center gap-1.5 text-sm font-bold" style={{color:T.gain}}><Ic.shield size={14}/> {blocks} blocked · 0 anomalies</span></div></Panel>
        </div></div>
      <div className="text-xs text-center mt-5" style={{color:T.dim}}>Centurion runs on its own decision algorithm and a self-hosted model. No third-party AI service in the loop. Preview data.</div>
    </div></div>);
}
