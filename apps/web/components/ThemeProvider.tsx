'use client';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';

type Theme = 'dark' | 'light';
const ThemeContext = createContext<{theme:Theme;toggle:()=>void}>({theme:'dark',toggle:()=>{}});
const storageKey = 'vectordb-theme';

export function ThemeProvider({children}:{children:ReactNode}) {
  const [theme,setTheme]=useState<Theme>('dark');
  function applyTheme(next:Theme){document.documentElement.dataset.theme=next;setTheme(next);}
  useEffect(()=>{
    try { const saved=localStorage.getItem(storageKey); applyTheme(saved==='light'?'light':'dark'); } catch { applyTheme('dark'); }
    const sync=(event:StorageEvent)=>{if(event.key===storageKey)applyTheme(event.newValue==='light'?'light':'dark');};
    window.addEventListener('storage',sync);
    return()=>window.removeEventListener('storage',sync);
  },[]);
  function toggle(){const next=theme==='dark'?'light':'dark';applyTheme(next);try{localStorage.setItem(storageKey,next);}catch{/* Theme still works for this visit. */}}
  return <ThemeContext.Provider value={{theme,toggle}}>{children}</ThemeContext.Provider>;
}
export const useTheme=()=>useContext(ThemeContext);

export function ThemeToggle(){
  const {theme,toggle}=useTheme();
  return <button type="button" className="theme-toggle" onClick={toggle} aria-label={`Switch to ${theme==='dark'?'light':'dark'} theme`} title={`Switch to ${theme==='dark'?'light':'dark'} theme`}>
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {theme==='dark'?<><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>:<path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z"/>}
    </svg><span>{theme==='dark'?'Light':'Dark'}</span>
  </button>;
}
