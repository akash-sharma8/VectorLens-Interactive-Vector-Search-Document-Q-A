'use client';
import {useEffect,useRef,useState} from 'react';
import {api,errorMessage} from './api';
import type {Context} from '@vectordb/core/types';
type Conversation={id:string;title:string};
type Settings={documentIds:number[]|null;documentsOnly:boolean;k:number};
type Message={id:string;role:'user'|'assistant';content:string;status:'pending'|'complete'|'failed';request_id:string;settings:Settings;error:string|null;contexts:(Context&{deleted:boolean})[];generated:boolean;model:string};
export type SourceProjection = {question:string;contexts:Context[];state:'loading'|'ready'|'failed'};
export default function ChatPanel({documentIds,onProjectionChange}:{documentIds:number[];onProjectionChange:(projection:SourceProjection|null)=>void}) {
  const [projectionSelection,setProjectionSelection]=useState<{messageId:string;sourceId?:number}|null>(null);
  const [generating,setGenerating]=useState(false),[submittedQuestion,setSubmittedQuestion]=useState('');
  const [conversations,setConversations]=useState<Conversation[]>([]),[active,setActive]=useState<string|null>(null),[messages,setMessages]=useState<Message[]>([]);
  const [question,setQuestion]=useState(''),[only,setOnly]=useState(true),[k,setK]=useState(3),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [rename,setRename]=useState('');
  const lock=useRef(false);
  const pending=useRef<{id:string;question:string;requestId:string;documentIds?:number[];documentsOnly:boolean;k:number}|null>(null);
  async function refresh(){setConversations(await api<Conversation[]>('/conversations'));}
  useEffect(()=>{void refresh().catch(e=>setError(errorMessage(e)));},[]);
  useEffect(()=>{
    if(generating){onProjectionChange({question:submittedQuestion,contexts:[],state:'loading'});return;}
    const message=projectionSelection?messages.find(m=>m.id===projectionSelection.messageId):messages.at(-1);
    if(!message){onProjectionChange(null);return;}
    const question=messages.find(m=>m.role==='user'&&m.request_id===message.request_id)?.content??'';
    onProjectionChange({question,contexts:message.role==='assistant'?(projectionSelection?.sourceId?message.contexts.filter(s=>s.id===projectionSelection.sourceId):message.contexts):[],state:message.status==='complete'?'ready':'failed'});
  },[messages,projectionSelection,generating,submittedQuestion,onProjectionChange]);
  async function open(id:string){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const rows=await api<Message[]>(`/conversations/${id}/messages`);setActive(id);setMessages(rows);setProjectionSelection(null);setRename(conversations.find(c=>c.id===id)?.title??'');pending.current=null;}catch(e){setError(errorMessage(e));}finally{lock.current=false;setBusy(false);}}
  async function send(retry?:Message){
    if(lock.current)return;
    const text=retry?.content??question.trim();if(!text)return;
    setProjectionSelection(null);setSubmittedQuestion(text);setGenerating(true);
    lock.current=true;setBusy(true);setError('');
    let id=active;
    try{
      if(!id){const chat=await api<Conversation>('/conversations',{title:text.slice(0,100)});id=chat.id;setActive(id);setRename(chat.title);}
      const payload=retry?{id,question:retry.content,requestId:retry.request_id,documentIds:retry.settings.documentIds??undefined,documentsOnly:retry.settings.documentsOnly,k:retry.settings.k}:pending.current??{id,question:text,requestId:crypto.randomUUID(),documentIds:documentIds.length?documentIds:undefined,documentsOnly:only,k};
      pending.current=payload;
      const result=await api<{messages:Message[]}>(`/conversations/${id}/messages`,{...payload,retry:!!retry});
      setMessages(result.messages);pending.current=null;setQuestion('');await refresh();
    }catch(e){setError(errorMessage(e));if(id){try{const rows=await api<Message[]>(`/conversations/${id}/messages`);setMessages(rows);setProjectionSelection(null);if(rows.some(m=>m.request_id===pending.current?.requestId)){pending.current=null;setQuestion('');}}catch{/* preserve the original error and retry request ID */}}}
    finally{lock.current=false;setBusy(false);setGenerating(false);}
  }
  return <div className="persistent-chat"><aside className="conversation-list" aria-label="Previous conversations"><button className="btn-p" disabled={busy} onClick={()=>{setActive(null);setMessages([]);setProjectionSelection(null);setQuestion('');setRename('');setError('');pending.current=null;}}>New chat</button>
    {conversations.map(c=><button key={c.id} aria-current={active===c.id?'page':undefined} disabled={busy} onClick={()=>void open(c.id)}>{c.title}</button>)}
  </aside><section className="chat-thread">
    {active&&<div className="inline-row conversation-toolbar"><input type="text" aria-label="Conversation title" value={rename} maxLength={200} onChange={e=>setRename(e.target.value)}/><button disabled={busy||!rename.trim()} onClick={async()=>{setBusy(true);try{await api(`/conversations/${active}`,{title:rename},'PATCH');await refresh();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}}>Rename</button><button disabled={busy} onClick={async()=>{if(!window.confirm('Delete this conversation and all its messages?'))return;setBusy(true);try{await api(`/conversations/${active}`,undefined,'DELETE');setActive(null);setMessages([]);setProjectionSelection(null);pending.current=null;await refresh();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}}>Delete chat</button></div>}
    <div className="chat-history" aria-live="polite">{!messages.length&&<p className="muted">Start a conversation. Your messages and citations will be saved.</p>}{messages.map(m=><article key={m.id} className={m.role==='user'?'chat-q':'chat-a'}><strong>{m.role==='user'?'You':m.generated===false?'No matching source':m.model??'Assistant'}</strong>
      <p className="chat-a-text">{m.content.split(/(\[\d+\])/g).map((part,i)=>{const match=/^\[(\d+)\]$/.exec(part);const n=match?Number(match[1]):0;return m.role==='assistant'&&m.contexts[n-1]?<button key={i} className="inline-citation" aria-label={`Open source ${n} for this answer`} onClick={()=>{setProjectionSelection({messageId:m.id,sourceId:m.contexts[n-1].id});const el=document.getElementById(`source-${m.id}-${n}`) as HTMLDetailsElement|null;if(el){el.open=true;el.scrollIntoView({block:'nearest'});el.querySelector('summary')?.focus();}}}>{part}</button>:<span key={i}>{part}</span>;})}</p>
      {m.role==='assistant'&&<button type="button" className="source-map-button" onClick={()=>{setProjectionSelection({messageId:m.id});document.querySelector('.rag-projection')?.scrollIntoView({block:'nearest'});}}>Show sources on PCA</button>}
      {m.role==='user'&&<small className="muted">{m.settings.documentsOnly?'Document-only':'General knowledge allowed'} · {m.settings.documentIds?.length??'All'} documents</small>}
      {m.status!=='complete'&&<div><p role="status">{m.error??'This message was interrupted or is still processing. Retry if it has stopped.'}</p><button disabled={busy} onClick={()=>void send(m)}>Retry message</button></div>}
      {m.contexts.map((s,i)=><details key={i} id={`source-${m.id}-${i+1}`} className="source-card"><summary>[{i+1}] {s.title} · {s.pageStart==null?'Pasted text':`PDF pages ${s.pageStart}–${s.pageEnd}`} · chunk {s.id}{s.deleted?' · Deleted source (saved snapshot)':''}</summary><p className="source-text">{s.text}</p></details>)}
    </article>)}</div>
    <form className="panel-stack" onSubmit={e=>{e.preventDefault();void send();}}><label><input type="checkbox" checked={only} disabled={busy} onChange={e=>setOnly(e.target.checked)}/> Only answer from my documents</label><textarea aria-label="Question for AI" rows={3} maxLength={10000} value={question} disabled={busy} onChange={e=>setQuestion(e.target.value)} placeholder="Ask a question or follow up on an earlier answer"/><div className="inline-row"><select aria-label="Retrieved chunks" value={k} disabled={busy} onChange={e=>setK(Number(e.target.value))}>{[2,3,5].map(n=><option key={n} value={n}>Top {n}</option>)}</select><button className="btn-g" disabled={busy||!question.trim()}>{busy?'Thinking…':'Ask AI'}</button></div></form>
    {busy&&<p role="status">Saving and processing…</p>}{error&&<p role="alert">{error}</p>}
  </section></div>;
}

