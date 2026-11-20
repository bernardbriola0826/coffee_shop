let me,menu=[],cart={},tab='pos',timer;
const TABS={pos:['POS',0],orders:['Orders',0],menu:['Menu & stock',1],report:['Reports',1],staff:['Staff',2],audit:['Audit log',2]};
const lvl={cashier:0,manager:1,owner:2};
async function start(){try{me=await api('/auth/me')}catch{$('#login').hidden=false;$('#app').hidden=true;return}
 $('#login').hidden=true;$('#app').hidden=false;$('#who').textContent=`${me.name} · ${me.role}`;
 $('#tabs').innerHTML=Object.entries(TABS).filter(([,t])=>lvl[me.role]>=t[1]).map(([k,t])=>`<button data-t="${k}" class="${k===tab?'on':''}">${t[0]}</button>`).join('');show()}
$('#go').onclick=async()=>{try{await api('/auth/login','POST',{email:$('#em').value,password:$('#pw').value});$('#pw').value='';start()}catch(e){$('#lerr').textContent=e.message}};
$('#out').onclick=async()=>{await api('/auth/logout','POST').catch(()=>{});location.reload()};
$('#tabs').onclick=e=>{if(e.target.dataset.t){tab=e.target.dataset.t;start()}};
async function show(){clearInterval(timer);const v=$('#view');try{await VIEWS[tab](v)}catch(e){v.innerHTML=`<p class="err">${esc(e.message)}</p>`}}
const VIEWS={
async pos(v){menu=await api('/menu');const draw=()=>{let t=0;const ls=Object.entries(cart);
 v.innerHTML=`<div class="layout" style="padding:0"><div class="grid">${menu.map(p=>`<button class="item" data-id="${p.id}" ${p.available?'':'disabled'}><b>${esc(p.name)}</b><span class="price">${peso(p.price_cents)}</span></button>`).join('')}</div>
 <aside class="panel stack"><h2>Sale</h2>${ls.map(([id,q])=>{const p=menu.find(x=>x.id==id);t+=p.price_cents*q;return`<div class="row"><span>${esc(p.name)} × ${q}</span><button class="alt" data-m="${id}">−</button></div>`}).join('')||'<p>Tap items to add.</p>'}
 <div class="row"><b>Total</b><b>${peso(t)}</b></div><select id="pt"><option value="dine-in">Dine in</option><option value="takeout">Takeout</option></select><select id="pm"><option value="cash">Cash</option><option value="gcash">GCash</option><option value="card">Card</option></select>
 <button id="pay" ${ls.length?'':'disabled'}>Charge ${peso(t)}</button><p id="pmsg" class="err"></p></aside></div>`};
 v.onclick=async e=>{const b=e.target.closest('[data-id]'),m=e.target.dataset.m;if(b){cart[b.dataset.id]=(cart[b.dataset.id]||0)+1;draw()}else if(m){if(--cart[m]<=0)delete cart[m];draw()}
  else if(e.target.id==='pay'){try{const o=await api('/orders','POST',{customer:'Walk-in',type:$('#pt').value,payment:$('#pm').value,items:Object.entries(cart).map(([id,qty])=>({id:+id,qty}))});cart={};draw();$('#pmsg').className='ok';$('#pmsg').textContent='Sale '+o.code+' recorded'}catch(x){$('#pmsg').textContent=x.message}}};draw()},
async orders(v){const load=async()=>{const os=await api('/orders');v.innerHTML=`<table><tr><th>Code</th><th>Items</th><th>Total</th><th>Source</th><th>Status</th><th>Paid</th></tr>${os.map(o=>`<tr><td>${esc(o.code.slice(0,7))}<br>${esc(o.customer||'')}</td><td>${o.items.map(i=>esc(i.name)+' ×'+i.qty).join('<br>')}</td><td>${peso(o.total_cents)}</td><td>${esc(o.source)}<br>${esc(o.type)}</td>
 <td><select data-o="${o.id}" data-k="status">${['new','preparing','ready','completed','cancelled'].map(s=>`<option ${s===o.status?'selected':''}>${s}</option>`).join('')}</select></td><td><input type="checkbox" data-o="${o.id}" data-k="paid" ${o.paid?'checked':''} aria-label="Paid"></td></tr>`).join('')}</table>`};
 v.onchange=async e=>{const d=e.target.dataset;if(!d.o)return;try{await api('/orders/'+d.o,'PATCH',{[d.k]:d.k==='paid'?e.target.checked:e.target.value})}catch(x){alert(x.message);load()}};
 await load();timer=setInterval(load,15000)},
async menu(v){const ps=await api('/admin/products');v.innerHTML=`<table><tr><th>Name</th><th>Category</th><th>Price (₱)</th><th>Stock (blank = unlimited)</th><th>On sale</th><th></th></tr>
 ${[...ps,{id:'',name:'',category:'',price_cents:0,stock:null,available:1}].map(p=>`<tr data-p="${p.id}"><td><input value="${esc(p.name)}" placeholder="New item"></td><td><input value="${esc(p.category)}"></td><td><input type="number" step="0.01" min="0" value="${p.price_cents/100}"></td><td><input type="number" min="0" value="${p.stock??''}"></td><td><input type="checkbox" ${p.available?'checked':''}></td><td><button>${p.id?'Save':'Add'}</button></td></tr>`).join('')}</table><p id="mm" class="err"></p>`;
 v.onclick=async e=>{const tr=e.target.closest('tr[data-p]');if(!tr||e.target.tagName!=='BUTTON')return;const i=tr.querySelectorAll('input');
  const body={name:i[0].value,category:i[1].value,price_cents:Math.round(i[2].value*100),stock:i[3].value===''?null:+i[3].value,available:i[4].checked};
  try{await api('/admin/products'+(tr.dataset.p?'/'+tr.dataset.p:''),tr.dataset.p?'PUT':'POST',body);show()}catch(x){$('#mm').textContent=x.message}}},
async report(v){const r=await api('/admin/report');v.innerHTML=`<div class="grid"><div class="item"><span>Today</span><b>${peso(r.today.sales)}</b><span>${r.today.n} orders</span></div><div class="item"><span>Last 7 days</span><b>${peso(r.week.sales)}</b><span>${r.week.n} orders</span></div></div>
 <h3 class="cat">Best sellers (7 days)</h3>${r.top.map(t=>`<div class="row"><span>${esc(t.name)}</span><b>${t.qty}</b></div>`).join('')||'<p>No sales yet.</p>'}
 <h3 class="cat">Low stock</h3>${r.low.map(t=>`<div class="row"><span>${esc(t.name)}</span><b>${t.stock}</b></div>`).join('')||'<p>Nothing running low.</p>'}`},
async staff(v){const us=await api('/admin/users');v.innerHTML=`<table><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr>${us.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td>${u.role!=='owner'?`<button class="${u.active?'bad':'alt'}" data-u="${u.id}" data-a="${u.active?0:1}">${u.active?'Disable':'Enable'}</button>`:''}</td></tr>`).join('')}</table>
 <h3 class="cat">Add staff</h3><div class="stack" style="max-width:360px"><input id="un" placeholder="Name"><input id="ue" type="email" placeholder="Email"><select id="ur"><option>cashier</option><option>manager</option></select><input id="up" type="password" placeholder="Password (12+ characters)" autocomplete="new-password"><button id="ua">Add staff</button><p id="um" class="err"></p></div>`;
 v.onclick=async e=>{try{if(e.target.dataset.u){await api('/admin/users/'+e.target.dataset.u,'PATCH',{active:e.target.dataset.a==='1'});show()}
  else if(e.target.id==='ua'){await api('/admin/users','POST',{name:$('#un').value,email:$('#ue').value,role:$('#ur').value,password:$('#up').value});show()}}catch(x){$('#um').textContent=x.message}}},
async audit(v){const a=await api('/admin/audit');v.innerHTML=`<table><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th><th>IP</th></tr>${a.map(r=>`<tr><td>${new Date(r.ts).toLocaleString()}</td><td>${esc(r.name||'—')}</td><td>${esc(r.action)}</td><td>${esc(r.detail)}</td><td>${esc(r.ip)}</td></tr>`).join('')}</table>`}};
start();
