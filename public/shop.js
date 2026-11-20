let menu=[],cart={},trackTimer;
const MAX=20;
const iconFor=c=>{c=c.toLowerCase();return /non|tea|matcha|iced|cold|juice|soda/.test(c)?'i-glass':/pastr|cake|bread|bake|dessert|sweet|cookie/.test(c)?'i-slice':'i-cup'};
const store={get:k=>{try{return localStorage.getItem(k)}catch{return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch{}}};
const slug=n=>String(n).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const find=id=>menu.find(p=>p.id==id);
const lastItems=()=>{try{return Object.entries(JSON.parse(store.get('den.last')||'{}')).filter(([id])=>find(id)?.available)}catch{return[]}};
const count=()=>Object.values(cart).reduce((a,b)=>a+b,0);
const total=()=>Object.entries(cart).reduce((t,[id,q])=>t+(find(id)?.price_cents||0)*q,0);

/* ---------- menu ---------- */
const stepper=(id,q,name,cls='')=>`<div class="step ${cls}"><button type="button" data-a="dec" data-id="${id}" aria-label="Remove one ${esc(name)}">−</button><output aria-label="Quantity of ${esc(name)}">${q}</output><button type="button" data-a="inc" data-id="${id}" aria-label="Add one ${esc(name)}" ${q>=MAX?'disabled':''}>+</button></div>`;
const act=p=>{if(!p.available)return'<span class="tag out">Sold out</span>';const q=cart[p.id]||0;
  return q?stepper(p.id,q,p.name):`<button type="button" class="add" data-a="add" data-id="${p.id}" aria-label="Add ${esc(p.name)} to order">Add to order</button>`};
const card=p=>`<article class="item" data-p="${p.id}" ${cart[p.id]?'data-in':''} ${p.available?'':'data-out'}><div class="art"><svg aria-hidden="true"><use href="#${iconFor(p.category)}"/></svg><img src="img/${slug(p.name)}.jpg" alt="${esc(p.name)}" loading="lazy" width="400" height="300"></div><div class="meta"><h3>${esc(p.name)}</h3><span class="price">${peso(p.price_cents)}</span></div><div class="act">${act(p)}</div></article>`;

function renderMenu(){
  const by={};menu.forEach(p=>(by[p.category]??=[]).push(p));const cats=Object.keys(by);
  if(!cats.length){$('#menu').innerHTML='<p class="loading">The menu is empty right now. Please check back soon.</p>';return}
  $('#cats').innerHTML=cats.map((c,i)=>`<a href="#cat-${i}" data-cat="${i}">${esc(c)}</a>`).join('');
  $('#menu').innerHTML=cats.map((c,i)=>`<section class="cat tone-${i%3}" id="cat-${i}" aria-labelledby="h-${i}"><h2 id="h-${i}">${esc(c)}</h2><div class="grid">${by[c].map(card).join('')}</div></section>`).join('');
  spy()}

/* highlight the category being read */
let io;function spy(){io?.disconnect();const links=[...document.querySelectorAll('#cats a')];if(!links.length||!('IntersectionObserver'in window))return;
  io=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;const i=e.target.id.slice(4);
    links.forEach(a=>{const on=a.dataset.cat===i;if(on){a.setAttribute('aria-current','true');const bar=$('#cats');bar.scrollTo({left:a.offsetLeft-16,behavior:'smooth'})}else a.removeAttribute('aria-current')})}),{rootMargin:'-30% 0px -65% 0px'});
  document.querySelectorAll('.menu .cat').forEach(s=>io.observe(s))}

document.addEventListener('error',e=>{if(e.target.tagName==='IMG'&&e.target.closest('.art'))e.target.remove()},true);

/* ---------- cart ---------- */
function renderCart(){
  const lines=Object.entries(cart).filter(([id])=>find(id));
  $('#cart').innerHTML=lines.length
   ?`<ul class="lines">${lines.map(([id,q])=>{const p=find(id);return`<li class="line"><div><b>${esc(p.name)}</b><small>${peso(p.price_cents)} each</small></div>${stepper(id,q,p.name)}<span class="lt">${peso(p.price_cents*q)}</span></li>`}).join('')}</ul><div class="row total"><b>Total</b><b>${peso(total())}</b></div>`
   :'<p class="empty">Nothing yet. Pick something from the menu and it will show up here.</p>'+(lastItems().length?`<button type="button" class="alt usual" data-a="usual">Order your usual: ${lastItems().map(([id,q])=>q+' × '+esc(find(id).name)).join(', ')}</button>`:'');
  $('#co').hidden=!lines.length||!$('#done').hidden;
  const n=count();$('#count').textContent=n;$('#bn').textContent=n;$('#bt').textContent=peso(total());
  $('#bar').hidden=!n||!$('#done').hidden}

function bump(){const b=$('#count');b.classList.remove('bump');void b.offsetWidth;b.classList.add('bump')}

document.addEventListener('click',e=>{
  const b=e.target.closest('[data-a]');if(!b)return;
  const id=b.dataset.id,a=b.dataset.a,fromCart=!!b.closest('#cart');
  if(a==='usual'){lastItems().forEach(([i,q])=>cart[i]=q);renderMenu();renderCart();bump();return}
  if(a==='add'||a==='inc')cart[id]=Math.min(MAX,(cart[id]||0)+1);
  else if(a==='dec'&&(cart[id]=(cart[id]||1)-1)<=0)delete cart[id];
  const p=find(id),el=$(`.item[data-p="${id}"]`);
  if(el){el.querySelector('.act').innerHTML=act(p);cart[id]?el.setAttribute('data-in',''):el.removeAttribute('data-in')}
  renderCart();if(a!=='dec')bump();
  // keep keyboard focus on the control the person was using
  const sel=fromCart?`#cart [data-id="${id}"][data-a="${cart[id]?a==='dec'?'dec':'inc':'x'}"]`:`.item[data-p="${id}"] [data-a="${cart[id]?(a==='dec'?'dec':'inc'):'add'}"]`;
  const next=$(sel);if(next)next.focus();else if(fromCart&&!count())$('#ph').focus();
  $('#err').textContent=''});

/* segmented radio controls (order type, payment) */
function seg(id,hid){$(id).addEventListener('click',e=>{const b=e.target.closest('[data-v]');if(!b)return;
  $(id).querySelectorAll('[data-v]').forEach(x=>x.setAttribute('aria-checked',x===b));$(hid).value=b.dataset.v});
  $(id).addEventListener('keydown',e=>{if(!['ArrowRight','ArrowLeft'].includes(e.key))return;const bs=[...$(id).querySelectorAll('[data-v]')],i=bs.indexOf(document.activeElement);if(i<0)return;
    const n=bs[(i+(e.key==='ArrowRight'?1:bs.length-1))%bs.length];n.focus();n.click();e.preventDefault()})}
seg('#typeseg','#type');seg('#payseg','#pay');

/* ---------- mobile sheet ---------- */
const sheet=on=>{$('#panel').classList.toggle('open',on);document.body.classList.toggle('sheet',on);if(on)$('#ph').focus();else if(matchMedia('(max-width:900px)').matches)$('#cartbtn').focus()};
$('#cartbtn').onclick=()=>sheet(true);$('#bar').onclick=()=>sheet(true);$('#close').onclick=()=>sheet(false);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#panel').classList.contains('open'))sheet(false)});
matchMedia('(min-width:901px)').addEventListener('change',e=>{if(e.matches)sheet(false)});
document.querySelectorAll('a[href="#track"]').forEach(a=>a.addEventListener('click',()=>{if(matchMedia('(max-width:900px)').matches)sheet(true)}));

/* ---------- place an order ---------- */
$('#co').addEventListener('submit',async e=>{e.preventDefault();const err=$('#err'),btn=$('#place');err.textContent='';
  const name=$('#name').value.trim();
  if(!name){err.textContent='Enter your name so we know who to call.';$('#name').focus();return}
  const ph=$('#phone').value.trim();if(ph&&!/^[0-9+\-\s]{7,16}$/.test(ph)){err.textContent='Check your mobile number. Use digits only, 7 to 16 characters.';$('#phone').focus();return}
  btn.disabled=true;btn.textContent='Placing order…';
  try{
    const o=await api('/orders','POST',{customer:name,phone:$('#phone').value.trim()||undefined,type:$('#type').value,payment:$('#pay').value,items:Object.entries(cart).map(([id,qty])=>({id:+id,qty}))});
    store.set('den.last',JSON.stringify(cart));cart={};renderMenu();showDone(o);$('#tcode').value=o.code;store.set('den.code',o.code);track(o.code)
  }catch(x){err.textContent=x.message}
  finally{btn.disabled=false;btn.textContent='Place order'}});

function showDone(o){
  $('#done').hidden=false;$('#co').hidden=true;$('#cart').hidden=true;$('#ph').textContent='Order placed';
  $('#done').innerHTML=`<div class="done"><div class="tick"><svg aria-hidden="true"><use href="#i-check"/></svg></div><h3>We've got your order</h3><p>Show this code at the counter.</p><div class="codebox"><b id="codev">${esc(o.code)}</b><button type="button" class="alt" id="copy">Copy</button></div><p>Total ${peso(o.total_cents)}. Pay at the counter.</p><button type="button" class="alt" id="again">Start a new order</button></div>`;
  $('#done .tick').parentElement.setAttribute('tabindex','-1');$('#done .done').focus();
  renderCart()}
$('#done').addEventListener('click',async e=>{
  if(e.target.id==='copy'){try{await navigator.clipboard.writeText($('#codev').textContent);e.target.textContent='Copied'}catch{e.target.textContent='Select and copy'}setTimeout(()=>e.target.textContent='Copy',1800)}
  if(e.target.id==='again'){$('#done').hidden=true;$('#done').innerHTML='';$('#cart').hidden=false;$('#ph').textContent='Your order';renderCart();$('#ph').focus()}});

/* ---------- track an order ---------- */
const STEPS=[['new','Received'],['preparing','Being made'],['ready','Ready for pickup'],['completed','Completed']];
const SAY={new:"We've got your order.",preparing:'Your order is being made.',ready:'Ready. Pick it up at the counter.',completed:'All done. Thanks for stopping by.',cancelled:'This order was cancelled. Ask at the counter if you need help.'};
function statusHTML(s){
  if(s==='cancelled')return`<p class="say">${SAY.cancelled}</p><span class="tag">Cancelled</span>`;
  const at=STEPS.findIndex(x=>x[0]===s);
  return`<p class="say">${esc(SAY[s]||'Status: '+s)}</p><ol class="steps" aria-label="Order progress">${STEPS.map(([k,l],i)=>`<li class="${i<at?'done-s':i===at?'now':''}" ${i===at?'aria-current="step"':''}>${l}</li>`).join('')}</ol>`}
async function track(code){
  clearTimeout(trackTimer);code=(code||'').trim();if(!code)return;
  try{const o=await api('/orders/track/'+encodeURIComponent(code));$('#tout').innerHTML=statusHTML(o.status);store.set('den.code',code);
    if(!['completed','cancelled'].includes(o.status))trackTimer=setTimeout(()=>track(code),10000)}
  catch(x){$('#tout').innerHTML=`<p class="err">${esc(x.message)}</p>`}}
$('#tbtn').onclick=()=>track($('#tcode').value);
$('#tcode').addEventListener('keydown',e=>{if(e.key==='Enter')track($('#tcode').value)});

/* ---------- boot ---------- */
const saved=store.get('den.code');if(saved){$('#tcode').value=saved;track(saved)}
renderCart();
(function load(){api('/menu').then(m=>{menu=m;renderMenu();renderCart()})
  .catch(e=>{$('#menu').innerHTML=`<p class="err">${esc(e.message)}</p><button type="button" class="alt" id="retry">Try again</button>`;$('#retry').onclick=()=>{$('#menu').innerHTML='<p class="loading">Loading menu…</p>';load()}})})();
