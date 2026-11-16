import {useEffect,useRef} from 'react';
import {X} from 'lucide-react';

// A single mobile navigation contract for buyer, seller and administration.
export default function WorkspaceNavigation({open,onClose,label,children}) {
 const panel=useRef(null), close=useRef(onClose);
 close.current=onClose;
 useEffect(()=>{
  if(!open)return;
  const media=window.matchMedia('(max-width: 900px)');
  if(!media.matches)return;
  const previous=document.activeElement, body=document.querySelector('.ac-body');
  const overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  if(body)body.inert=true;
  panel.current.querySelector('button').focus();
  const key=e=>{
   if(e.key==='Escape'){e.preventDefault();close.current();}
   if(e.key==='Tab'){
    const nodes=[...panel.current.querySelectorAll('a[href],button:not(:disabled),input,select,[tabindex="0"]')].filter(n=>n.getClientRects().length);
    const first=nodes[0],last=nodes[nodes.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
   }
  };
  const resize=()=>{if(!media.matches)close.current();};
  document.addEventListener('keydown',key);media.addEventListener('change',resize);
  return()=>{document.removeEventListener('keydown',key);media.removeEventListener('change',resize);document.body.style.overflow=overflow;if(body)body.inert=false;if(previous?.isConnected)previous.focus();};
 },[open]);
 return <>{open&&<button className="ac-nav-backdrop" tabIndex={-1} aria-label="Close navigation" onClick={onClose}/>}<aside id="workspace-navigation" ref={panel} className={`ac-sidebar ${open?'open':''}`} aria-label={label}><button className="ac-nav-close ac-icon" aria-label="Close navigation" onClick={onClose}><X size={20}/></button>{children}</aside></>;
}
