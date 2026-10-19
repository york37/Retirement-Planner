// Browser-only storage. Unlike cookies, this data is never attached to HTTP requests.
export const INPUT_STORAGE_KEY='northstar.inputs.v1';
export function saveInputs(storage,values){
 try{storage.setItem(INPUT_STORAGE_KEY,JSON.stringify({version:1,values}));return true;}
 catch{return false;}
}
export function loadInputs(storage){
 try{
  const raw=storage.getItem(INPUT_STORAGE_KEY);
  if(raw===null)return {values:null,failed:false};
  const saved=JSON.parse(raw);
  if(saved?.version!==1||!saved.values||typeof saved.values!=='object'||Array.isArray(saved.values))return {values:null,failed:true};
  const values=Object.fromEntries(Object.entries(saved.values).filter(([,value])=>typeof value==='string'||typeof value==='boolean'));
  return {values,failed:false};
 }catch{return {values:null,failed:true};}
}
export function clearInputs(storage){
 try{storage.removeItem(INPUT_STORAGE_KEY);return true;}
 catch{return false;}
}
