// HTTP smoke against a disposable schema in TEST_DATABASE_URL.
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test'))throw new Error('Set TEST_DATABASE_URL to a separate database ending in _test.');
const children=[];
function start(args,cwd=root,env={}){const child=spawn(process.execPath,args,{cwd,env:{...process.env,...env},stdio:'inherit',windowsHide:true});children.push(child);return child;}
async function ready(url){for(let i=0;i<120;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw new Error(`Server did not become ready: ${url}`);}
let cookie='';
async function api(path,body,method){const response=await fetch('http://127.0.0.1:13000/api'+path,{method:method??(body===undefined?'GET':'POST'),headers:{'Content-Type':'application/json','X-Requested-With':'VectorDB',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});const next=response.headers.get('set-cookie');if(next)cookie=next.split(';')[0];return {status:response.status,data:await response.json()};}
try{
  start(['scripts/ollama-fixture.mjs']);await ready('http://127.0.0.1:11435/api/tags');
  start(['--import','tsx','scripts/browser-test-api.mts'],root,{OLLAMA_BASE_URL:'http://127.0.0.1:11435',WEB_ORIGIN:'http://127.0.0.1:13000'});await ready('http://127.0.0.1:18080/health/db');
  start([resolve(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','13000'],resolve(root,'apps/web'),{API_ORIGIN:'http://127.0.0.1:18080',NEXT_DIST_DIR:'.next-test'});await ready('http://127.0.0.1:13000');
  assert.equal((await api('/items')).status,401);
  assert.equal((await api('/auth/register',{email:`smoke-${randomUUID()}@example.com`,password:'smoke-password-123'})).status,201);
  const items=(await api('/items')).data;assert.equal(items.length,20);
  for(const algo of ['hnsw','kdtree','bruteforce'])assert.equal((await api(`/search?v=${items[0].embedding.join(',')}&algo=${algo}&k=5`)).data.results[0].id,items[0].id);
  assert.equal((await api('/search?v=1,2')).status,400);
  const saved=await api('/doc/insert',{title:'Smoke document',text:'Dynamic programming uses memoization.'});assert.equal(saved.status,201);
  const conversation=(await api('/conversations',{title:'Smoke chat'})).data;
  const answer=await api(`/conversations/${conversation.id}/messages`,{question:'What is dynamic programming?',requestId:randomUUID(),documentIds:[saved.data.documentId],documentsOnly:true});
  assert.equal(answer.status,200);assert.equal(answer.data.messages.length,2);assert.equal(answer.data.messages[1].contexts.length,1);
  assert.equal((await api('/doc/delete/'+saved.data.ids[0],undefined,'DELETE')).data.ok,true);
  assert.equal((await api(`/conversations/${conversation.id}/messages`)).data[1].contexts[0].deleted,true);
  await api('/auth/logout',{});assert.equal((await api('/items')).status,401);
  console.log('PASS: cookie auth, Next.js proxy, algorithms, document ingestion, saved chat, citation snapshot and logout.');
}catch(e){console.error(e);process.exitCode=1;}
finally{for(const child of children.reverse())child.kill('SIGTERM');}
