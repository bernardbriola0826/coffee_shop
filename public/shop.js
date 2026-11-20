let menu=[],cart={};
const render=()=>{const by={};menu.forEach(p=>(by[p.category]??=[]).push(p));
$('#menu').innerHTML=Object.entries(by).map(([c,ps])=>`<h2 class="cat">${esc(c)}</h2><div class="grid">${ps.map(p=>`<button class="item" data-id="${p.id}" ${p.available?'':'disabled'}><b>${esc(p.name)}</b><span class="price">${peso(p.price_cents)}</span><span>${p.available?'Add to order':'Sold out'}</span></button>`).join('')}</div>`).join('');
const lines=Object.entries(cart);let t=0;
$('#cart').innerHTML=lines.length?lines.map(([id,q])=>{const p=menu.find(x=>x.id==id);t+=p.price_cents*q;return`<div class="row"><span>${esc(p.name)} × ${q}</span><span><button class="alt" data-m="${id}" aria-label="Remove one ${esc(p.name)}">−</button></span></div>`}).join('')+`<div class="row"><b>Total</b><b>${peso(t)}</b></div>`:'<p>Add something from the menu.</p>';
$('#co').hidden=!lines.length};
$('#menu').addEventListener('click',e=>{const b=e.target.closest('[data-id]');if(b){cart[b.dataset.id]=Math.min(20,(cart[b.dataset.id]||0)+1);render()}});
$('#cart').addEventListener('click',e=>{const id=e.target.dataset.m;if(id){if(--cart[id]<=0)delete cart[id];render()}});
$('#place').onclick=async()=>{$('#err').textContent='';try{
 const o=await api('/orders','POST',{customer:$('#name').value,phone:$('#phone').value||undefined,type:$('#type').value,payment:$('#pay').value,items:Object.entries(cart).map(([id,qty])=>({id:+id,qty}))});
 cart={};render();$('#cart').innerHTML=`<p class="ok">Order placed! Your code: <b>${esc(o.code)}</b><br>Total ${peso(o.total_cents)}. Pay at the counter.</p>`;$('#co').hidden=true;$('#tcode').value=o.code}catch(e){$('#err').textContent=e.message}};
$('#tbtn').onclick=async()=>{try{const o=await api('/orders/track/'+encodeURIComponent($('#tcode').value.trim()));$('#tout').innerHTML=`Status: <span class="tag">${esc(o.status)}</span>`}catch(e){$('#tout').textContent=e.message}};
api('/menu').then(m=>{menu=m;render()}).catch(e=>$('#menu').textContent=e.message);
