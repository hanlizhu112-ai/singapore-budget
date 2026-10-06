const tokenPattern = /^[a-f0-9]{64}$/;
const keyPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.[a-f0-9]{64}$/;
export function normalizeConfig(value) {
  const url = String(value?.url ?? '').trim().replace(/\/$/, '');
  const publishableKey = String(value?.publishableKey ?? '').trim();
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url)) throw new Error('请填写 Supabase 的 Project URL。');
  if (!/^sb_publishable_[A-Za-z0-9_-]{10,250}$/.test(publishableKey)) throw new Error('请使用 Publishable key，不能使用后台 Secret key。');
  return { url, publishableKey };
}
export function parseEntry(href) {
  const params = new URLSearchParams(new URL(href).hash.slice(1));
  const key = params.get('key'), setup = params.get('setup');
  if (key && !keyPattern.test(key)) throw new Error('专属入口格式不正确，请重新复制完整链接。');
  if (setup && !tokenPattern.test(setup)) throw new Error('创建入口格式不正确，请重新复制完整链接。');
  const config = params.has('project') || params.has('public_key')
    ? normalizeConfig({url:params.get('project'),publishableKey:params.get('public_key')}) : null;
  return {key,setup,config};
}
export function makeEntryLink(href, config, key, kind='key') {
  if (kind==='key' ? !keyPattern.test(key) : kind!=='setup' || !tokenPattern.test(key)) throw new Error('入口格式不正确。');
  const normalized = normalizeConfig(config);
  const url = new URL(href); url.search='';
  url.hash = new URLSearchParams({project:normalized.url,public_key:normalized.publishableKey,[kind]:key}).toString();
  return url.href;
}
export function secureToken(cryptoApi=globalThis.crypto) {
  return Array.from(cryptoApi.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
}
export function createCloudClient({config,fetchImpl=globalThis.fetch,storage,href}) {
  let active=normalizeConfig(config);
  const prefix=()=>`our-spark-v11:${active.url}:${new URL(href).pathname}`;
  const read=(name)=>{try{return storage?.getItem(prefix()+':'+name) ?? null;}catch{return null;}};
  const write=(name,value)=>{try{value===null?storage?.removeItem(prefix()+':'+name):storage?.setItem(prefix()+':'+name,value);}catch{ /* User can retain their private entry link if browser storage is disabled. */ }};
  let credential=read('key');
  let setup=read('setup');
  async function rpc(name, body={}) {
    let r;
    try {
      r=await fetchImpl(`${active.url}/rest/v1/rpc/our_spark_${name}`,{
        method:'POST',mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',
        headers:{apikey:active.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(body),
        signal:AbortSignal.timeout(15000)
      });
    } catch {
      throw new Error('暂时连不上共享记录。请换手机流量或 Wi-Fi 后，再点连接测试。');
    }
    const d=await r.json().catch(()=>null);
    if (!r.ok) {
      const message = d?.code==='PGRST202' ? '数据库还没有配置好，请等待配置完成。' :
        /^PT(400|401|403|409)$/.test(d?.code) ? d.message :
        r.status===401 || r.status===403 ? '数据库连接配置无效，请联系创建空间的人。' : '共享记录暂时不可用，请稍后重试。';
      throw Object.assign(new Error(message),{status:r.status,code:d?.code});
    }
    return d;
  }
  return {
    config:active,
    async importEntry(entry) {
      // Verify a new key before replacing the existing device credential.
      if(entry.setup){setup=entry.setup;write('setup',setup);}
      if(entry.key){const d=await rpc('state',{p_key:entry.key});credential=entry.key;write('key',credential);return d;}
      return credential ? rpc('state',{p_key:credential}) : null;
    },
    hasSetup:()=>!!setup,
    async api(payload) {
      if(payload?.action==='create') {
        if(!setup)throw new Error('请使用你的专属创建入口。');
        let pending;try{pending=JSON.parse(read('pending')||'null');}catch{pending=null;}
        if(!pending) {pending={owner:secureToken(),partner:secureToken()};write('pending',JSON.stringify(pending));}
        const d=await rpc('create',{p_setup_token:setup,p_owner:payload.owner,p_partner:payload.partner,p_owner_token:pending.owner,p_partner_token:pending.partner});
        credential=d.resumeKey;write('key',credential);write('pending',null);setup=null;write('setup',null);return d;
      }
      if(!credential)throw Object.assign(new Error('请创建空间，或打开你的专属入口。'),{status:401});
      return rpc(payload?.action==='checkin'?'checkin':'state',{p_key:credential});
    },
    async probe(){return rpc('probe');},
    async export(){if(!credential)throw new Error('请先打开你的专属入口。');return rpc('export',{p_key:credential});},
    makeLink:(key)=>makeEntryLink(href,active,key)
  };
}
let client;
let entry;
let initialization;
export async function initializeCloud() {
  if(initialization)return initialization;
  initialization=(async()=>{
    entry=parseEntry(location.href);
    const originalHref=location.href;
    // Fragments never reach the host; also remove private entry values from the address bar.
    if(location.hash)history.replaceState(null,'',location.pathname+location.search);
    let config=entry.config;
    if(!config){try{const r=await fetch('./spark-config.json',{cache:'no-store'});if(r.ok){const d=await r.json();if(d.url)config=normalizeConfig(d);}}catch{ /* Config may still be pending. */ }}
    if(!config){try{const d=JSON.parse(localStorage.getItem('our-spark-config-v11')||'null');if(d)config=normalizeConfig(d);}catch{}}
    if(!config)return {configured:false,hasSetup:false,state:null};
    try{localStorage.setItem('our-spark-config-v11',JSON.stringify(config));}catch{}
    let safeStorage;try{safeStorage=localStorage;}catch{}
    client=createCloudClient({config,storage:safeStorage,href:originalHref});
    const state=await client.importEntry(entry);
    return {configured:true,hasSetup:client.hasSetup(),state};
  })();
  return initialization;
}
export async function api(payload){if(!client)throw new Error('共享记录正在配置，暂时不能创建空间。');return client.api(payload);}
export async function connectionProbe(){if(!client)return null;return client.probe();}
export function entryLink(key){if(!client)throw new Error('共享记录正在配置。');return client.makeLink(key);}
export async function exportRecords(){if(!client)throw new Error('请先打开你的专属入口。');return client.export();}
