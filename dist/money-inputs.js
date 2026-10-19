export function parseDollarValue(value){
 const raw=String(value).replaceAll(',','').trim();
 return /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)?Number(raw):NaN;
}
export function formatDollarValue(value){
 const raw=String(value).replaceAll(',','').trim();
 const match=raw.match(/^(-?)(\d*)(\.\d*)?$/);
 if(!match||(!match[2]&&!match[3]))return raw;
 return match[1]+match[2].replace(/\B(?=(\d{3})+(?!\d))/g,',')+(match[3]??'');
}
export function stepDollarValue(value,direction,min=0,max=Infinity){
 const parsed=parseDollarValue(value),current=Number.isFinite(parsed)?parsed:0;
 return Math.min(max,Math.max(min,Math.round((current+direction*1000)*100)/100));
}
export function formatMoneyFields(form){
 for(const input of form.querySelectorAll('input[data-money]'))input.value=formatDollarValue(input.value);
}
export function attachMoneyInputs(form){
 for(const input of form.querySelectorAll('input[data-money]')){
  function step(direction){
   input.value=formatDollarValue(stepDollarValue(input.value,direction,Number(input.getAttribute('min')??0),Number(input.getAttribute('max')??Infinity)));
   input.dispatchEvent(new Event('input',{bubbles:true}));
  }
  input.addEventListener('input',()=>{
   const caret=input.selectionStart??input.value.length,characters=input.value.slice(0,caret).replaceAll(',','').length;
   const formatted=formatDollarValue(input.value);
   if(input.value===formatted)return;
   input.value=formatted;
   let position=0,count=0;
   while(position<formatted.length&&count<characters){if(formatted[position]!==',')count++;position++;}
   input.setSelectionRange(position,position);
  });
  input.addEventListener('blur',()=>{input.value=formatDollarValue(input.value);});
  input.addEventListener('keydown',event=>{
   if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();step(event.key==='ArrowUp'?1:-1);}
  });
  const controls=input.parentElement.querySelector('.money-stepper');
  controls.querySelector('[data-direction="up"]').addEventListener('click',()=>step(1));
  controls.querySelector('[data-direction="down"]').addEventListener('click',()=>step(-1));
 }
}
