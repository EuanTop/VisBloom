import { useEffect, useRef, type ReactNode } from 'react';

const focusable='button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]';
export function WorkbenchDialog({labelledBy,onClose,className='',children}:{labelledBy:string;onClose():void;className?:string;children:ReactNode}){
  const ref=useRef<HTMLDialogElement>(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const dialog=ref.current!,previous=document.activeElement as HTMLElement|null;
    dialog.showModal();
    return()=>{dialog.close();if(previous?.isConnected)previous.focus();};
  },[]);
  return <dialog ref={ref} className={`workbench-dialog ${className}`} aria-labelledby={labelledBy} onCancel={event=>{event.preventDefault();close.current();}} onClick={event=>{
    if(event.target!==event.currentTarget)return;
    const bounds=event.currentTarget.getBoundingClientRect();
    if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)close.current();
  }}>{children}</dialog>;
}
export function WorkbenchPopover({triggerId,labelledBy,onClose,className='',children}:{triggerId:string;labelledBy:string;onClose():void;className?:string;children:ReactNode}){
  const ref=useRef<HTMLDivElement>(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const popup=ref.current!,trigger=document.getElementById(triggerId);
    popup.querySelector<HTMLElement>(focusable)?.focus();
    const outside=(event:PointerEvent)=>{if(!popup.contains(event.target as Node)&&!trigger?.contains(event.target as Node))close.current();};
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current();return;}
      if(event.key!=='Tab')return;
      const elements=[...popup.querySelectorAll<HTMLElement>(focusable)].filter(element=>element.getClientRects().length);
      const first=elements[0],last=elements.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    document.addEventListener('pointerdown',outside);popup.addEventListener('keydown',key);
    return()=>{document.removeEventListener('pointerdown',outside);popup.removeEventListener('keydown',key);if(popup.contains(document.activeElement)||document.activeElement===document.body)trigger?.focus();};
  },[triggerId]);
  return <div ref={ref} className={`popover ${className}`} role="dialog" aria-labelledby={labelledBy}>{children}</div>;
}
