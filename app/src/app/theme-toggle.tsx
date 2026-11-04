"use client";
import { useEffect, useState } from "react";
type Preference = "system" | "light" | "dark";
const KEY="cft-theme-v1";
function read():Preference{
 try { const saved=localStorage.getItem(KEY);return saved==="dark"||saved==="light"||saved==="system"?saved:"system"; }
 catch{return "system";}
}
function apply(preference:Preference){
 const dark=preference==="dark"||(preference==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
 document.documentElement.dataset.cftTheme=dark?"dark":"light";
 document.documentElement.style.colorScheme=dark?"dark":"light";
}
export default function ThemeToggle(){
 const [preference,setPreference]=useState<Preference>("system");
 useEffect(()=>{
  const value=read();setPreference(value);apply(value);
  const media=window.matchMedia("(prefers-color-scheme: dark)");
  const changed=()=>{if(read()==="system")apply("system");};
  media.addEventListener?.("change",changed);
  const synced=(event:StorageEvent)=>{if(event.key===KEY){const v=read();setPreference(v);apply(v);}};
  window.addEventListener("storage",synced);
  return ()=>{media.removeEventListener?.("change",changed);window.removeEventListener("storage",synced);};
 },[]);
 function change(){
  const order:Preference[]=["system","light","dark"];
  const next=order[(order.indexOf(preference)+1)%3];
  setPreference(next);try{localStorage.setItem(KEY,next);}catch{}apply(next);
 }
 const titles={system:"Auto",light:"Light",dark:"Dark"};
 return <button type="button" className="cft-theme-toggle" onClick={change} aria-label={`Appearance: ${titles[preference]}. Select next mode`} title={`Appearance: ${titles[preference]} (system, light, dark)`}>
  <span aria-hidden="true">{preference==="dark"?"☾":preference==="light"?"☀":"◐"}</span><span>{titles[preference]} mode</span>
 </button>;
}
