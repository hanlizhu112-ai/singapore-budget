import { useEffect, useId, useRef } from 'react';
import { FIRE_STAGES } from './stages.mjs';

type Stage = typeof FIRE_STAGES[number];

function Embers({stage,burst}:{stage:Stage;burst:number}) {
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const canvas=ref.current,context=canvas?.getContext('2d');
    if(!canvas||!context)return;
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    let frame=0,tick=0;
    const count=stage.particles+(burst?14:0);
    const spread=stage.id==='wildfire'?250:stage.id==='blaze'?205:stage.id==='bonfire'?160:90;
    const particles=Array.from({length:count},()=>({x:180+(Math.random()-.5)*spread,y:30+Math.random()*250,speed:.35+Math.random()*.65,radius:.7+Math.random()*1.3,alpha:.25+Math.random()*.55}));
    function draw(){
      context!.clearRect(0,0,360,320);
      particles.forEach(p=>{
        p.y-=p.speed;p.x+=Math.sin(tick/65+p.radius)*.13;
        if(p.y<12){p.y=268;p.x=180+(Math.random()-.5)*spread;}
        const opacity=p.alpha*Math.min(1,p.y/80)*Math.min(1,(290-p.y)/35);
        context!.fillStyle=`rgba(255,${stage.id==='wildfire'?222:170},${stage.id==='wildfire'?145:87},${opacity})`;
        context!.beginPath();context!.arc(p.x,p.y,p.radius,0,Math.PI*2);context!.fill();
      });
      tick++;frame=requestAnimationFrame(draw);
    }
    function resume(){cancelAnimationFrame(frame);if(!document.hidden&&!media.matches)draw();else context!.clearRect(0,0,360,320);}
    resume();document.addEventListener('visibilitychange',resume);media.addEventListener('change',resume);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',resume);media.removeEventListener('change',resume);};
  },[stage.id,burst]);
  return <canvas ref={ref} width={360} height={320} className="fire-embers" aria-hidden="true"/>;
}

export default function FireArtwork({stage,burst=0,quiet=false}:{stage:Stage;burst?:number;quiet?:boolean}) {
  const id=useId().replace(/[^a-zA-Z0-9]/g,'');
  const [top,bottom,core]=stage.id==='wildfire'?['#fff0ad','#ff9a35','#fffbea']:stage.id==='blaze'?['#ffdf7c','#f64630','#fff2b3']:['#ffda8c','#f86a2d','#ffe8a1'];
  const fire=`url(#${id}fire)`,heart=`url(#${id}heart)`,wood=`url(#${id}wood)`;
  const logs=stage.day>=30;
  return <div className={`fire-artwork art-${stage.id}${quiet?' is-quiet':''}`} role="img" aria-label={`${stage.title}：${stage.description}`}>
    <div className="fire-aura"/>
    <Embers stage={stage} burst={burst}/>
    <svg viewBox="0 0 360 320" className="fire-illustration" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}fire`} x1="0" y1="0" x2="0" y2="1"><stop stopColor={top}/><stop offset=".48" stopColor={stage.id==='blaze'?'#ff9b38':'#ffbd50'}/><stop offset="1" stopColor={bottom}/></linearGradient>
        <linearGradient id={`${id}heart`} x1="0" y1="0" x2="0" y2="1"><stop stopColor={core}/><stop offset="1" stopColor={stage.id==='wildfire'?'#ffe6a1':'#ffd071'}/></linearGradient>
        <linearGradient id={`${id}wood`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#b27345"/><stop offset=".48" stopColor="#643a2a"/><stop offset="1" stopColor="#352126"/></linearGradient>
        <radialGradient id={`${id}ground`}><stop stopColor="#ffad4f" stopOpacity=".42"/><stop offset="1" stopColor="#ff7040" stopOpacity="0"/></radialGradient>
      </defs>
      <ellipse cx="180" cy="276" rx={stage.day>=100?152:logs?113:59} ry={logs?17:9} fill={`url(#${id}ground)`}/>
      {stage.id==='wildfire'&&<g className="fire-halo"><ellipse cx="180" cy="226" rx="151" ry="65" fill="none" stroke="#ffcf73" strokeOpacity=".25" strokeWidth="1"/><ellipse cx="180" cy="226" rx="133" ry="52" fill="none" stroke="#ffe2a2" strokeOpacity=".12"/><path d="M43 231Q180 285 317 231" fill="none" stroke="#ffcf73" strokeWidth="1.5" strokeDasharray="2 20"/></g>}
      {logs&&<g className="fire-logs">
        <g transform="rotate(-15 180 265)"><rect x="102" y="252" width="156" height="23" rx="11.5" fill={wood}/><ellipse cx="253" cy="263.5" rx="9" ry="11.5" fill="#ac7047"/><ellipse cx="253" cy="263.5" rx="4" ry="6.5" fill="none" stroke="#57362c" strokeWidth="2"/><path d="M118 259H219M124 268H195" stroke="#d69654" strokeOpacity=".38" strokeWidth="2" strokeLinecap="round"/></g>
        <g transform="rotate(15 180 266)"><rect x="100" y="254" width="160" height="24" rx="12" fill={wood}/><ellipse cx="106" cy="266" rx="9" ry="12" fill="#bd8050"/><ellipse cx="106" cy="266" rx="4" ry="6.5" fill="none" stroke="#65382a" strokeWidth="2"/><path d="M125 262H225M155 271H242" stroke="#e3a15a" strokeOpacity=".35" strokeWidth="2" strokeLinecap="round"/></g>
        {stage.day>=60&&<path d="M137 279L228 254" stroke="#e39a4b" strokeWidth="7" strokeLinecap="round" opacity=".55"/>}
      </g>}
      {(stage.id==='spark'||stage.id==='flame')&&<g className="flame-body">
        <path d="M180 259C143 259 126 234 135 207C139 218 149 222 157 213C176 193 148 177 177 135C182 164 202 177 216 197C243 233 221 259 180 259Z" fill={fire}/>
        <path className="flame-heart" d="M181 249C160 250 152 232 163 218C166 228 177 226 174 215C171 204 181 195 184 187C185 207 205 217 202 232C200 244 191 249 181 249Z" fill={heart}/>
      </g>}
      {stage.id==='bonfire'&&<g>
        <path className="flame-left" d="M158 260C126 259 102 239 113 211C119 195 132 190 132 170C155 185 140 204 158 218C169 228 180 250 158 260Z" fill="#ff843d"/>
        <path className="flame-right" d="M204 260C238 255 256 229 241 205C235 195 229 191 231 178C210 188 219 208 202 220C184 235 184 252 204 260Z" fill="#ffa444"/>
        <path className="flame-body" d="M181 262C145 264 124 239 143 208C155 187 169 173 157 151C171 157 173 169 178 173C184 152 173 130 190 105C188 137 216 152 213 177C210 194 236 213 223 238C214 255 197 262 181 262Z" fill={fire}/>
        <path className="flame-heart" d="M182 254C158 254 148 238 160 219C165 211 172 209 173 196C188 208 179 219 190 226C201 219 196 204 203 198C220 224 215 253 182 254Z" fill={heart}/>
      </g>}
      {stage.id==='blaze'&&<g>
        <path className="flame-left" d="M162 262C111 270 81 235 99 200C111 178 106 162 97 147C133 159 137 184 131 201C127 216 155 217 162 237Z" fill="#f94b39"/>
        <path className="flame-right" d="M201 262C247 264 280 227 262 192C251 173 257 160 267 145C236 151 222 175 232 198C242 219 206 220 201 243Z" fill="#ff6937"/>
        <path className="flame-body" d="M179 263C134 266 108 236 131 195C145 170 159 159 144 129C163 136 172 154 173 164C188 131 159 111 184 63C187 103 216 116 211 142C223 132 225 120 225 108C251 143 232 162 224 177C213 199 245 210 234 236C225 257 204 263 179 263Z" fill={fire}/>
        <path className="flame-heart" d="M180 254C150 255 137 235 154 210C164 195 173 182 166 165C188 178 181 194 190 202C207 181 194 164 202 153C226 190 206 201 215 220C226 243 202 255 180 254Z" fill={heart}/>
        <path d="M183 247C168 247 162 235 172 224C180 215 183 207 181 201C202 220 204 243 183 247Z" fill="#fff7d6"/>
      </g>}
      {stage.id==='wildfire'&&<g>
        <path className="flame-left" d="M119 263C78 273 48 244 61 215C70 197 70 187 64 175C92 184 98 204 92 217C88 231 118 227 129 249Z" fill="#f89a38"/>
        <path className="flame-right" d="M239 263C283 272 313 245 299 213C292 196 291 184 297 171C268 182 261 202 268 218C273 232 244 228 233 247Z" fill="#ffad46"/>
        <path className="flame-left" d="M146 265C111 269 83 236 101 201C110 182 115 169 105 147C127 155 136 176 132 187C149 162 130 142 146 119C151 148 173 168 164 192C154 219 173 246 146 265Z" fill={fire}/>
        <path className="flame-right" d="M220 264C250 270 278 238 262 204C254 185 244 177 253 148C233 158 226 175 232 189C215 169 231 151 217 129C211 154 195 173 200 194C207 222 190 251 220 264Z" fill={fire}/>
        <path className="flame-body" d="M180 265C138 265 122 235 140 203C155 179 174 163 157 136C174 141 181 152 183 162C198 126 163 105 188 39C188 82 219 102 211 129C222 119 224 109 222 97C250 134 224 158 221 180C218 200 246 215 230 242C219 261 201 266 180 265Z" fill={fire}/>
        <path className="flame-heart" d="M181 255C151 257 141 236 157 211C165 198 170 187 166 177C182 187 179 201 187 210C204 185 189 168 199 146C204 174 223 187 215 207C205 230 225 249 181 255Z" fill={heart}/>
        <path d="M180 249C165 248 160 236 171 221C178 211 181 205 179 198C199 213 206 246 180 249Z" fill="#fffef4"/>
        <path d="M119 246C106 245 108 231 117 223C120 219 121 215 121 211C135 229 133 245 119 246ZM247 246C232 246 231 230 244 215C243 228 260 237 247 246Z" fill="#fff0bc"/>
        <g className="fire-stars" fill="#ffe5a1"><path d="M85 128l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/><path d="M271 111l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z"/><circle cx="137" cy="81" r="2"/><circle cx="239" cy="67" r="1.5"/></g>
      </g>}
    </svg>
  </div>;
}
