const $=(s,r=document)=>r.querySelector(s);
const peso=c=>'₱'+(c/100).toLocaleString('en-PH',{minimumFractionDigits:2});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const csrf=()=>(document.cookie.match(/(?:^|; )csrf=([^;]+)/)||[])[1]||'';
async function api(path,method='GET',body){
  const r=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf()},body:body?JSON.stringify(body):undefined,credentials:'same-origin'});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Something went wrong');return d}
