// Apply before the stylesheet loads; preferences stay in this browser only.
(()=>{
 const root=document.documentElement,key='northstar.theme.v1';
 let preference=null,system=null;
 try{const saved=window.localStorage.getItem(key);if(saved==='light'||saved==='dark')preference=saved;}catch{}
 try{system=window.matchMedia('(prefers-color-scheme: dark)');}catch{}
 function apply(theme){
  const dark=theme==='dark';root.dataset.theme=dark?'dark':'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#111a17':'#254f42');
  const button=document.querySelector('#theme-toggle');
  if(button){button.setAttribute('aria-pressed',String(dark));button.title=dark?'Switch to light mode':'Switch to dark mode';}
 }
 apply(preference??(system?.matches?'dark':'light'));
 system?.addEventListener('change',event=>{if(preference===null)apply(event.matches?'dark':'light');});
 function connect(){
  const button=document.querySelector('#theme-toggle');if(!button)return;
  apply(root.dataset.theme);
  button.addEventListener('click',()=>{
   preference=root.dataset.theme==='dark'?'light':'dark';apply(preference);
   try{window.localStorage.setItem(key,preference);}catch{}
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',connect,{once:true});else connect();
})();
