import type {CSSProperties} from 'react';
export type PrankEffect={id:string;kind:'popcorn'|'sneeze'|'gust'};
export default function PrankEffects({effect}:{effect:PrankEffect}){
 return <div key={effect.id} className={`prank-effect effect-${effect.kind}`} aria-hidden="true">
 {effect.kind==='popcorn'&&<><span className="corn-grain"/><span className="pop-flash"/><svg className="popcorn-kernel" viewBox="0 0 80 80"><path d="M24 60C12 61 7 49 13 40C5 28 16 16 28 21C34 8 50 11 54 24C68 18 79 32 70 44C77 57 63 68 52 62C44 73 29 72 24 60Z" fill="#fff0ca" stroke="#dbac66" strokeWidth="2"/><path d="M28 26C22 34 25 40 33 41M52 29C43 31 41 38 47 44M27 53C36 47 43 48 48 56" fill="none" stroke="#e4bc7d" strokeWidth="4" strokeLinecap="round"/><path d="M33 58L40 42L48 59Z" fill="#d59744" opacity=".8"/></svg><div className="pop-crumbs">{[-1,0,1].map((n,i)=><i key={i} style={{'--dx':`${n*48}px`,'--dy':`${-30-i*18}px`} as CSSProperties}/>)}</div></>}
 {effect.kind==='sneeze'&&<><div className="sneeze-puff"><i/><i/><i/></div><div className="sneeze-sparks">{Array.from({length:9},(_,i)=><i key={i} style={{'--dx':`${(i-4)*24}px`,'--dy':`${-50-(i%3)*26}px`,'--turn':`${i*32}deg`} as CSSProperties}/>)}</div></>}
 {effect.kind==='gust'&&<svg className="prank-wind" viewBox="0 0 360 320"><path d="M18 172C75 132 111 165 169 151S264 124 335 145"/><path d="M3 197C64 171 108 199 166 181S274 172 352 192"/><path d="M30 222C88 201 124 224 180 210S269 205 325 219"/></svg>}
 </div>;
}
