const express=require('express'),helmet=require('helmet'),rateLimit=require('express-rate-limit'),cookieParser=require('cookie-parser');
const bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),crypto=require('crypto'),{z}=require('zod'),Database=require('better-sqlite3');
const PROD=process.env.NODE_ENV==='production';
const SECRET=process.env.JWT_SECRET||(()=>{if(PROD){console.error('Set JWT_SECRET');process.exit(1)}return crypto.randomBytes(48).toString('hex')})();
const db=new Database(process.env.DB_PATH||'den.db');db.pragma('journal_mode=WAL');db.pragma('foreign_keys=ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN('owner','manager','cashier')),active INTEGER DEFAULT 1,fails INTEGER DEFAULT 0,locked_until INTEGER DEFAULT 0,tv INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,price_cents INTEGER NOT NULL CHECK(price_cents>=0),stock INTEGER,available INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY,code TEXT UNIQUE NOT NULL,secret TEXT NOT NULL,source TEXT NOT NULL,customer TEXT,phone TEXT,type TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'new',payment TEXT NOT NULL,paid INTEGER DEFAULT 0,total_cents INTEGER NOT NULL,staff_id INTEGER,created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES orders(id),product_id INTEGER NOT NULL,name TEXT NOT NULL,qty INTEGER NOT NULL,price_cents INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,ts INTEGER,user_id INTEGER,action TEXT,detail TEXT,ip TEXT);`);
const audit=(req,a,d)=>db.prepare('INSERT INTO audit(ts,user_id,action,detail,ip)VALUES(?,?,?,?,?)').run(Date.now(),req.user?.id||null,a,String(d||'').slice(0,300),req.ip);
// seed
if(!db.prepare('SELECT 1 FROM users').get()){
 const pw=process.env.ADMIN_PASSWORD||crypto.randomBytes(9).toString('base64url');
 db.prepare('INSERT INTO users(email,name,hash,role)VALUES(?,?,?,?)').run((process.env.ADMIN_EMAIL||'owner@collectorsden.local').toLowerCase(),'Owner',bcrypt.hashSync(pw,12),'owner');
 if(!process.env.ADMIN_PASSWORD)console.log('FIRST-RUN OWNER PASSWORD (shown once):',pw);
 const s=db.prepare('INSERT INTO products(name,category,price_cents,stock)VALUES(?,?,?,?)');
 [['Espresso','Coffee',9000],['Americano','Coffee',11000],['Cappuccino','Coffee',13500],['Spanish Latte','Coffee',15000],['Iced Matcha','Non-Coffee',16000],['Butter Croissant','Pastry',9500],['Ube Cheesecake','Pastry',14000]].forEach(p=>s.run(p[0],p[1],p[2],null));
}
const app=express();app.set('trust proxy',1);app.disable('x-powered-by');
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","https://fonts.googleapis.com"],fontSrc:["https://fonts.gstatic.com"],imgSrc:["'self'","data:"],objectSrc:["'none'"],frameAncestors:["'none'"],baseUri:["'self'"],formAction:["'self'"]}},hsts:PROD?{maxAge:31536000,includeSubDomains:true}:false}));
app.use(express.json({limit:'20kb'}));app.use(cookieParser());
app.use('/api',rateLimit({windowMs:60000,limit:120,standardHeaders:true,legacyHeaders:false}));
const cookieOpts={httpOnly:true,secure:PROD,sameSite:'strict',path:'/'};
// CSRF: double-submit token + origin check on mutating requests
app.use('/api',(req,res,next)=>{
 if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
 const o=req.get('origin');if(o&&new URL(o).host!==req.get('host'))return res.status(403).json({error:'Bad origin'});
 if(req.path==='/auth/login'||req.path==='/orders'&&!req.cookies.token)return next();
 if(!req.cookies.csrf||req.cookies.csrf!==req.get('x-csrf-token'))return res.status(403).json({error:'CSRF check failed'});next();});
const auth=(...roles)=>(req,res,next)=>{try{const p=jwt.verify(req.cookies.token||'',SECRET,{algorithms:['HS256']});
 const u=db.prepare('SELECT id,name,role,active,tv FROM users WHERE id=?').get(p.id);
 if(!u||!u.active||u.tv!==p.tv)throw 0;if(roles.length&&!roles.includes(u.role))return res.status(403).json({error:'Not allowed'});req.user=u;next()}catch{res.status(401).json({error:'Sign in required'})}};
const ROLE={cashier:['cashier','manager','owner'],manager:['manager','owner'],owner:['owner']};
const parse=(schema,data,res)=>{const r=schema.safeParse(data);if(!r.success){res.status(400).json({error:r.error.issues[0].message});return null}return r.data};
const money=c=>Math.round(c);
// ---- auth
const loginLimit=rateLimit({windowMs:15*60000,limit:20,standardHeaders:true,legacyHeaders:false});
const DUMMY=bcrypt.hashSync('x',12);
app.post('/api/auth/login',loginLimit,(req,res)=>{
 const b=parse(z.object({email:z.string().email().max(120),password:z.string().min(1).max(200)}),req.body,res);if(!b)return;
 const u=db.prepare('SELECT * FROM users WHERE email=?').get(b.email.toLowerCase());
 if(u&&u.locked_until>Date.now())return res.status(423).json({error:'Account locked. Try again in 15 minutes.'});
 const ok=bcrypt.compareSync(b.password,u?u.hash:DUMMY)&&u&&u.active;
 if(!ok){if(u){const f=u.fails+1;db.prepare('UPDATE users SET fails=?,locked_until=? WHERE id=?').run(f>=5?0:f,f>=5?Date.now()+15*60000:0,u.id)}audit({ip:req.ip},'login_fail',b.email);return res.status(401).json({error:'Wrong email or password'})}
 db.prepare('UPDATE users SET fails=0,locked_until=0 WHERE id=?').run(u.id);
 res.cookie('token',jwt.sign({id:u.id,tv:u.tv},SECRET,{algorithm:'HS256',expiresIn:'8h'}),{...cookieOpts,maxAge:8*3600e3});
 res.cookie('csrf',crypto.randomBytes(24).toString('hex'),{...cookieOpts,httpOnly:false,maxAge:8*3600e3});
 audit({user:u,ip:req.ip,id:u.id},'login','');res.json({name:u.name,role:u.role})});
app.post('/api/auth/logout',auth(),(req,res)=>{db.prepare('UPDATE users SET tv=tv+1 WHERE id=?').run(req.user.id);res.clearCookie('token',cookieOpts);res.clearCookie('csrf');res.json({ok:1})});
app.get('/api/auth/me',auth(),(req,res)=>res.json(req.user));
// ---- public menu + online ordering
app.get('/api/menu',(req,res)=>res.json(db.prepare('SELECT id,name,category,price_cents,CASE WHEN stock IS NOT NULL AND stock<=0 THEN 0 ELSE available END available FROM products ORDER BY category,name').all()));
const orderSchema=z.object({customer:z.string().trim().min(1).max(60).optional(),phone:z.string().trim().regex(/^[0-9+\-\s]{7,16}$/).optional(),type:z.enum(['pickup','dine-in','takeout']),payment:z.enum(['cash','card','gcash']).default('cash'),
 items:z.array(z.object({id:z.number().int().positive(),qty:z.number().int().min(1).max(20)})).min(1).max(40)});
const createOrder=db.transaction((b,source,staffId)=>{
 let total=0;const lines=[];
 for(const it of b.items){const p=db.prepare('SELECT * FROM products WHERE id=?').get(it.id);
  if(!p||!p.available)throw new Error('An item is unavailable');
  if(p.stock!==null){if(p.stock<it.qty)throw new Error(p.name+' is out of stock');db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(it.qty,p.id)}
  total+=p.price_cents*it.qty;lines.push([p,it.qty])}
 const code='CD-'+crypto.randomInt(1000,9999),secret=crypto.randomBytes(8).toString('hex');
 const id=db.prepare('INSERT INTO orders(code,secret,source,customer,phone,type,payment,paid,total_cents,staff_id,created)VALUES(?,?,?,?,?,?,?,?,?,?,?)')
  .run(code+'-'+secret.slice(0,4),secret,source,b.customer||null,b.phone||null,b.type,b.payment,source==='pos'?1:0,money(total),staffId,Date.now()).lastInsertRowid;
 for(const[p,q]of lines)db.prepare('INSERT INTO items(order_id,product_id,name,qty,price_cents)VALUES(?,?,?,?,?)').run(id,p.id,p.name,q,p.price_cents);
 return db.prepare('SELECT id,code,secret,total_cents FROM orders WHERE id=?').get(id)});
const orderLimit=rateLimit({windowMs:10*60000,limit:15});
app.post('/api/orders',orderLimit,(req,res)=>{ // online (public) or POS (staff cookie)
 const b=parse(orderSchema,req.body,res);if(!b)return;
 let staff=null;if(req.cookies.token){try{const p=jwt.verify(req.cookies.token,SECRET);staff=db.prepare('SELECT id FROM users WHERE id=? AND active=1').get(p.id)}catch{}}
 if(staff&&(!req.cookies.csrf||req.cookies.csrf!==req.get('x-csrf-token')))return res.status(403).json({error:'CSRF check failed'});
 if(!staff&&!b.customer)return res.status(400).json({error:'Name is required'});
 try{const o=createOrder(b,staff?'pos':'online',staff?.id||null);req.user=staff;audit(req,'order_create',o.code);res.json(o)}catch(e){res.status(409).json({error:e.message})}});
app.get('/api/orders/track/:code',rateLimit({windowMs:60000,limit:30}),(req,res)=>{
 const o=db.prepare('SELECT code,status,type,total_cents,created FROM orders WHERE code=?').get(String(req.params.code).slice(0,30));
 if(!o)return res.status(404).json({error:'Order not found'});res.json(o)});
// ---- staff: orders
app.get('/api/orders',auth(...ROLE.cashier),(req,res)=>{
 const os=db.prepare("SELECT * FROM orders WHERE created>? ORDER BY id DESC LIMIT 200").all(Date.now()-48*3600e3);
 const it=db.prepare('SELECT name,qty FROM items WHERE order_id=?');res.json(os.map(o=>({...o,secret:undefined,items:it.all(o.id)})))});
app.patch('/api/orders/:id',auth(...ROLE.cashier),(req,res)=>{
 const b=parse(z.object({status:z.enum(['new','preparing','ready','completed','cancelled']).optional(),paid:z.boolean().optional()}),req.body,res);if(!b)return;
 const id=parseInt(req.params.id);if(b.status==='cancelled'&&req.user.role==='cashier')return res.status(403).json({error:'Managers cancel orders'});
 if(b.status)db.prepare('UPDATE orders SET status=? WHERE id=?').run(b.status,id);if(b.paid!==undefined)db.prepare('UPDATE orders SET paid=? WHERE id=?').run(+b.paid,id);
 if(b.status==='cancelled')for(const i of db.prepare('SELECT product_id,qty FROM items WHERE order_id=?').all(id))db.prepare('UPDATE products SET stock=stock+? WHERE id=? AND stock IS NOT NULL').run(i.qty,i.product_id);
 audit(req,'order_update',id+' '+JSON.stringify(b));res.json({ok:1})});
// ---- admin: products
const prod=z.object({name:z.string().trim().min(1).max(80),category:z.string().trim().min(1).max(40),price_cents:z.number().int().min(0).max(10000000),stock:z.number().int().min(0).nullable().default(null),available:z.boolean().default(true)});
app.get('/api/admin/products',auth(...ROLE.manager),(req,res)=>res.json(db.prepare('SELECT * FROM products ORDER BY category,name').all()));
app.post('/api/admin/products',auth(...ROLE.manager),(req,res)=>{const b=parse(prod,req.body,res);if(!b)return;
 const r=db.prepare('INSERT INTO products(name,category,price_cents,stock,available)VALUES(?,?,?,?,?)').run(b.name,b.category,b.price_cents,b.stock,+b.available);audit(req,'product_add',b.name);res.json({id:r.lastInsertRowid})});
app.put('/api/admin/products/:id',auth(...ROLE.manager),(req,res)=>{const b=parse(prod,req.body,res);if(!b)return;
 db.prepare('UPDATE products SET name=?,category=?,price_cents=?,stock=?,available=? WHERE id=?').run(b.name,b.category,b.price_cents,b.stock,+b.available,parseInt(req.params.id));audit(req,'product_edit',req.params.id);res.json({ok:1})});
app.delete('/api/admin/products/:id',auth(...ROLE.manager),(req,res)=>{db.prepare('UPDATE products SET available=0 WHERE id=?').run(parseInt(req.params.id));audit(req,'product_hide',req.params.id);res.json({ok:1})});
// ---- admin: reports
app.get('/api/admin/report',auth(...ROLE.manager),(req,res)=>{const d=new Date();d.setHours(0,0,0,0);const t=d.getTime(),w=t-6*864e5;
 const q=(s,a)=>db.prepare(s).get(a);
 res.json({today:q("SELECT COUNT(*)n,COALESCE(SUM(total_cents),0)sales FROM orders WHERE created>=? AND status!='cancelled'",t),
 week:q("SELECT COUNT(*)n,COALESCE(SUM(total_cents),0)sales FROM orders WHERE created>=? AND status!='cancelled'",w),
 top:db.prepare("SELECT i.name,SUM(i.qty)qty FROM items i JOIN orders o ON o.id=i.order_id WHERE o.created>=? AND o.status!='cancelled' GROUP BY i.name ORDER BY qty DESC LIMIT 5").all(w),
 low:db.prepare('SELECT name,stock FROM products WHERE stock IS NOT NULL AND stock<=5').all()})});
// ---- owner: staff + audit
app.get('/api/admin/users',auth(...ROLE.owner),(req,res)=>res.json(db.prepare('SELECT id,email,name,role,active FROM users').all()));
app.post('/api/admin/users',auth(...ROLE.owner),(req,res)=>{
 const b=parse(z.object({email:z.string().email().max(120),name:z.string().trim().min(1).max(60),role:z.enum(['manager','cashier']),password:z.string().min(12).max(100)}),req.body,res);if(!b)return;
 try{db.prepare('INSERT INTO users(email,name,hash,role)VALUES(?,?,?,?)').run(b.email.toLowerCase(),b.name,bcrypt.hashSync(b.password,12),b.role);audit(req,'user_add',b.email);res.json({ok:1})}catch{res.status(409).json({error:'Email already exists'})}});
app.patch('/api/admin/users/:id',auth(...ROLE.owner),(req,res)=>{const id=parseInt(req.params.id);if(id===req.user.id)return res.status(400).json({error:"You can't disable yourself"});
 db.prepare('UPDATE users SET active=?,tv=tv+1 WHERE id=?').run(+!!req.body.active,id);audit(req,'user_toggle',id);res.json({ok:1})});
app.get('/api/admin/audit',auth(...ROLE.owner),(req,res)=>res.json(db.prepare('SELECT a.ts,u.name,a.action,a.detail,a.ip FROM audit a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 150').all()));
app.use('/api',(req,res)=>res.status(404).json({error:'Not found'}));
app.use(express.static('public',{extensions:['html']}));
app.use((e,req,res,next)=>{console.error(e);res.status(500).json({error:'Server error'})});
app.listen(process.env.PORT||3000,()=>console.log('Collectors Den running on :'+(process.env.PORT||3000)));
