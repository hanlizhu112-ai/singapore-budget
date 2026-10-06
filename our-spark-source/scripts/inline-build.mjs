import {readFileSync,writeFileSync,unlinkSync,readdirSync,existsSync} from 'node:fs';
let html=readFileSync('dist/index.html','utf8');
html=html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,(_,src)=>`<script type="module">${readFileSync('dist/'+src.replace(/^\.\//,''),'utf8').replace(/<\/script/gi,'<\\/script')}</script>`);
html=html.replace(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,(_,src)=>`<style>${readFileSync('dist/'+src.replace(/^\.\//,''),'utf8')}</style>`);
html=html.replace(/<link rel="icon"[^>]*>/,`<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(readFileSync('public/favicon.svg','utf8'))}">`);
writeFileSync('dist/index.html',html);
writeFileSync('dist/spark-config.json',existsSync('public/spark-config.json')?readFileSync('public/spark-config.json','utf8'):JSON.stringify({url:'',publishableKey:''},null,2)+'\n');
for(const file of readdirSync('dist/assets'))unlinkSync('dist/assets/'+file);
console.log('Built one self-contained page and one public configuration file.');
