import {useEffect,useRef,useState} from 'react';
import {WandSparkles,ArrowRight,Sparkles,Wind,LoaderCircle,Check,X,Play} from 'lucide-react';
import {toast} from 'sonner';
import FireArtwork from './FireArtwork';
import type {PrankEffect} from './PrankEffects';
import {PRANKS} from './pranks.mjs';
import {getFireStage} from './stages.mjs';
import {setPrank} from './cloud.mjs';
type Room={roomId:string;role:number;names:string[];streak:number;pendingPrank?:{id:string;kind:string}|null};
export default function PrankPanel({room,onArmed}:{room:Room;onArmed:(state:any)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),counter=useRef(0);
 const [open,setOpen]=useState(false),[kind,setKind]=useState(room.pendingPrank?.kind||'popcorn'),[preview,setPreview]=useState<PrankEffect|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!preview)return;const timer=setTimeout(()=>setPreview(null),3400);return()=>clearTimeout(timer);},[preview?.id]);
 function show(){setKind(room.pendingPrank?.kind||'popcorn');setError('');setOpen(true);dialog.current?.showModal();}
 function select(value:string){setKind(value);setPreview(null);}
 async function arm(){setBusy(true);setError('');try{const state=await setPrank(kind);onArmed(state);toast.success('小机关已埋好，等对方添柴。');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const same=room.pendingPrank?.kind===kind;
 const selected=PRANKS.find(p=>p.kind===kind)!;
 return <><button type="button" className="capsule-entry prank-entry" onClick={show}><span className="capsule-entry-icon"><WandSparkles size={22} strokeWidth={1.5}/></span><span><strong>埋个小机关</strong><small>{room.pendingPrank?'机关已就位，等对方下一次添柴':'给对方的下一根柴，加一点意外'}</small></span>{room.pendingPrank?<span className="prank-ready-dot" aria-label="已就位"/>:<ArrowRight size={17}/>}</button>
 <dialog ref={dialog} className="space-dialog prank-dialog" aria-labelledby="prank-title" onClose={()=>{setOpen(false);setPreview(null);}} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}>
 {open&&<div className="space-dialog-inner"><header className="space-dialog-heading"><div><span className="section-kicker">添柴的时候，顺便捣个乱</span><h2 id="prank-title">埋个小机关</h2></div><button type="button" className="icon-button" aria-label="关闭小机关" onClick={()=>dialog.current?.close()}><X size={19}/></button></header>
 <div className="prank-preview" aria-label="小机关预演"><FireArtwork stage={getFireStage(room.streak)} prank={preview}/></div>
 <div className="prank-options" role="group" aria-label="选择小机关">{PRANKS.map(p=><button type="button" key={p.kind} aria-pressed={kind===p.kind} onClick={()=>select(p.kind)} disabled={busy}>{p.kind==='gust'?<Wind size={20} strokeWidth={1.4}/>:<Sparkles size={20} strokeWidth={1.4}/>}<strong>{p.label}</strong><small>{p.kind==='popcorn'?'啪，蹦一下':p.kind==='sneeze'?'火星抖一抖':'歪一下，再站好'}</small></button>)}</div>
 <div className="prank-try-row"><span>{selected.hint}</span><button type="button" className="prank-try" onClick={()=>setPreview({id:`preview-${++counter.current}`,kind:kind as PrankEffect['kind']})}><Play size={12}/>自己先试一下</button></div>
 <button type="button" className="primary prank-arm" disabled={busy||same} onClick={()=>void arm()}>{busy?<LoaderCircle size={17} className="spin"/>:same?<Check size={17}/>:<WandSparkles size={17}/>} {same?'已就位，等待触发':room.pendingPrank?'换成这个机关':'埋好这个机关'}</button>
 <p className="prank-explainer">{room.names[1-room.role]}下次添柴时，悄悄触发一次。<br/><span>每人留一个，触发前可以替换。预演只给自己看。</span></p>
 {error&&<div className="error" role="alert">{error}</div>}
 </div>}
 </dialog></>;
}
