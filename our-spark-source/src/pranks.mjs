export const PRANKS=Object.freeze([
 Object.freeze({kind:'popcorn',label:'蹦个爆米花',hint:'啪，跳出一颗小惊喜。',reaction:'谁往火里放了颗玉米？'}),
 Object.freeze({kind:'sneeze',label:'打个喷嚏',hint:'憋一下，再抖出几颗火星。',reaction:'啊——嚏！'}),
 Object.freeze({kind:'gust',label:'来阵小风',hint:'吹歪一点，再慢慢站直。',reaction:'这阵风，来得有点可疑。'}),
]);
export function reservePrankPlayback(state,reserved,storage){
 const effect=state?.prank;
 if(!effect||typeof effect.id!=='string'||!PRANKS.some(p=>p.kind===effect.kind))return null;
 const key=`our-spark-prank-seen-v1:${state.roomId}:${state.role}:${effect.id}`;
 if(reserved.has(key))return null;
 try{if(storage?.getItem(key))return null;}catch{}
 reserved.add(key);
 return {effect:{id:effect.id,kind:effect.kind},key};
}
export function rememberPrankPlayback(key,storage){try{storage?.setItem(key,'1');}catch{}}
