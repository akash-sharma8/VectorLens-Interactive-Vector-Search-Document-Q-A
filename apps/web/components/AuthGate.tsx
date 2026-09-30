'use client';
import {useEffect,useState} from 'react';
import {api,errorMessage} from './api';
import Dashboard from './Dashboard';
import {ThemeToggle} from './ThemeProvider';
export default function AuthGate({initialMode='login'}:{initialMode?:'login'|'register'}) {
  const [user,setUser]=useState<{id:string;email:string}|null>(null);
  const [loading,setLoading]=useState(true),[mode,setMode]=useState(initialMode);
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{
    let active=true;
    api<{user:{id:string;email:string}}>('/auth/me').then(r=>{if(active)setUser(r.user);}).catch(e=>{if(active && !String(e.message).includes('sign in'))setError(errorMessage(e));}).finally(()=>{if(active)setLoading(false);});
    const expired=()=>{setUser(null);setMode('login');setPassword('');setError('Session expired. Please sign in again.');};
    window.addEventListener('session-expired',expired);
    return()=>{active=false;window.removeEventListener('session-expired',expired);};
  },[]);
  if(loading) return <main className="auth-card" role="status">Checking session…</main>;

  if(user) return <Dashboard key={user.id} accountControls={<>
    <span className="navbar-email" title={user.email} aria-label={`Signed in as ${user.email}`}>{user.email}</span>
    <button className="navbar-logout inline-flex w-auto shrink-0 items-center justify-center rounded-[9px] border border-red-500 bg-red-600 px-3 py-[9px] text-xs font-semibold text-white hover:border-red-600 hover:bg-red-700 focus-visible:outline-red-500 disabled:cursor-wait disabled:opacity-50" disabled={busy} onClick={async()=>{setBusy(true);try{await api('/auth/logout',{});setUser(null);setMode('login');setPassword('');}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}}>Log out</button>
    {error&&<span className="navbar-error" role="alert">{error}</span>}
  </>}/>;
  return <main className="auth-card"><div className="auth-theme"><ThemeToggle/></div><h1>{mode==='login'?'Welcome back':'Create your account'}</h1><p>Your documents and conversations are private to your account.</p><form className="panel-stack" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const r=await api<{user:{id:string;email:string}}>(`/auth/${mode}`,{email,password});setUser(r.user);setPassword('');window.history.replaceState(null,'','/');}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}}>
    <label>Email<input aria-label="Email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <label>Password<input aria-label="Password" type="password" autoComplete={mode==='login'?'current-password':'new-password'} required minLength={12} maxLength={256} value={password} onChange={e=>setPassword(e.target.value)}/></label><p className="muted">Use at least 12 characters.</p>
    <button className="btn-p" disabled={busy}>{busy?'Please wait…':mode==='login'?'Log in':'Register'}</button>
    {error&&<p role="alert">{error}</p>}
  </form><button disabled={busy} onClick={()=>{setMode(mode==='login'?'register':'login');setError('');}}>{mode==='login'?'Create an account':'Already registered? Log in'}</button></main>;
}

