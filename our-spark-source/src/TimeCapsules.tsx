import {useCallback,useEffect,useRef,useState} from 'react';
import {Mail,LockKeyhole,PenLine,Check,X,ArrowRight,LoaderCircle} from 'lucide-react';
import {toast} from 'sonner';
import {getCapsules,sealCapsule} from './cloud.mjs';

type Capsule={day:number;role:number;createdAt:string;openedAt:string|null;message:string|null};
type Room={roomId:string;role:number;streak:number;names:string[]};
export default function TimeCapsules({room}:{room:Room}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [open,setOpen]=useState(false),[capsules,setCapsules]=useState<Capsule[]>([]),[day,setDay]=useState(room.streak<60?60:100);
 const [draft,setDraft]=useState(''),[saving,setSaving]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const draftKey=`our-spark-capsule-draft-v1:${room.roomId}:${room.role}:${day}`;
 const refresh=useCallback(async()=>{setLoading(true);try{const result=await getCapsules();setCapsules(result.capsules);setError('');}catch(e){setError((e as Error).message);}finally{setLoading(false);}},[room.roomId,room.role]);
 useEffect(()=>{void refresh();},[refresh,room.streak]);
 useEffect(()=>{if(!open)return;const timer=setInterval(()=>{if(!document.hidden&&navigator.onLine)void refresh();},15000);return()=>clearInterval(timer);},[open,refresh]);
 useEffect(()=>{try{setDraft(localStorage.getItem(draftKey)||'');}catch{setDraft('');}},[draftKey]);
 function edit(value:string){setDraft(value);try{localStorage.setItem(draftKey,value);}catch{}}
 function show(){setOpen(true);dialog.current?.showModal();void refresh();}
 async function seal(e:React.FormEvent){
  e.preventDefault();setSaving(true);setError('');
  try{const result=await sealCapsule(day,draft.trim());setCapsules(result.capsules);setDraft('');try{localStorage.removeItem(draftKey);}catch{}toast.success(`已封存，等第${day}天再打开。`);}
  catch(e){setError((e as Error).message);}finally{setSaving(false);}
 }
 const selected=capsules.filter(c=>c.day===day),own=selected.find(c=>c.role===room.role),revealed=selected.filter(c=>c.message!==null);
 const future=room.streak<day,ready=capsules.filter(c=>c.message!==null).length;
 const summary=ready?'有来自过去的信，可以打开了':capsules.length?`${capsules.length} 封信已封存，等约定的那一天`:`留一句话，等第${room.streak<60?60:100}天一起读`;
 return <><button type="button" className={'capsule-entry '+(ready?'has-letter':'')} onClick={show}><span className="capsule-entry-icon"><Mail size={22} strokeWidth={1.5}/></span><span><strong>时间胶囊</strong><small>{summary}</small></span><ArrowRight size={17}/></button>
 <dialog ref={dialog} className="space-dialog capsule-dialog" aria-labelledby="capsule-title" onClose={()=>setOpen(false)} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}>
 {open&&<div className="space-dialog-inner"><header className="space-dialog-heading"><div><span className="section-kicker">给未来的我们</span><h2 id="capsule-title">时间胶囊</h2></div><button type="button" className="icon-button" aria-label="关闭时间胶囊" onClick={()=>dialog.current?.close()}><X size={19}/></button></header>
 <p className="capsule-intro">你愿意留下一封信，就够了。<br/>到了约定的那天，两个人一起读。</p>
 <div className="capsule-tabs" role="group" aria-label="选择时间胶囊里程碑">{[60,100].map(n=><button type="button" key={n} aria-pressed={day===n} onClick={()=>setDay(n)}><span>第 <strong>{n}</strong> 天</span><small>{capsules.some(c=>c.day===n&&c.message!==null)?'来信已抵达':capsules.some(c=>c.day===n)?'已有封存的信':'留一点期待'}</small></button>)}</div>
 <section className="capsule-content" aria-label={`第${day}天的时间胶囊`}>
 {revealed.map(c=><article className="opened-letter" key={c.role}><header><Mail size={16}/><span>{room.names[c.role]} 留给这一天的话</span></header><p>{c.message}</p><time dateTime={c.createdAt}>{new Date(c.createdAt).toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',timeZone:'Asia/Shanghai'})} 封存</time></article>)}
 {selected.filter(c=>c.message===null).map(c=><div className="sealed-letter" key={c.role}><span className="sealed-letter-icon"><LockKeyhole size={21}/></span><div><strong>{c.role===room.role?'你':room.names[c.role]}已封存一封信</strong><p>连续点亮 {day} 天后，正文才会揭晓。</p></div><Check size={16}/></div>)}
 {future&&!own?<form className="capsule-compose" onSubmit={e=>void seal(e)}><label htmlFor="capsule-message"><PenLine size={15}/>写给第{day}天的我们</label><textarea id="capsule-message" maxLength={500} value={draft} onChange={e=>edit(e.target.value)} placeholder="留一句现在想说、愿意到那天再被读到的话。" required disabled={saving}/><div className="capsule-draft-meta"><span>草稿保存在此设备</span><span>{draft.length}/500</span></div><p className="capsule-seal-note">封存后不能修改。达到约定连续天数后，双方都能读到。</p><button className="primary" disabled={saving||!draft.trim()}>{saving?<LoaderCircle size={17} className="spin"/>:<LockKeyhole size={17}/>}封存到第{day}天</button></form>:!selected.length?<div className="capsule-empty"><Mail size={30} strokeWidth={1.2}/><p>这一天，没有封存的信。<br/><span>把下一份期待，留给未来。</span></p></div>:null}
 {future&&own&&<p className="capsule-wait">还差 {day-room.streak} 天，信会和新的火光一起抵达。</p>}
 </section>
 {loading&&!capsules.length&&<p className="capsule-loading" role="status">正在取回你们的信…</p>}
 {error&&<div className="error" role="alert">{error}<button type="button" onClick={()=>void refresh()}>重试</button></div>}
 <p className="capsule-footer-note">写信是自愿的，不影响每天添柴。</p>
 </div>}
 </dialog></>;
}
