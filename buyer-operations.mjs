import {randomUUID} from 'node:crypto';

// Buyer records never establish payment or ownership. Orders originate in seller operations.
export function createBuyerOperations({db,send,fail,body,requireCsrf,identityService,adminLog=()=>{}}) {
 db.exec(`CREATE TABLE IF NOT EXISTS buyer_records(id TEXT PRIMARY KEY,buyer_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS buyer_record_owner ON buyer_records(buyer_id,kind); CREATE TABLE IF NOT EXISTS buyer_saved_prices(buyer_id TEXT NOT NULL,vehicle_id TEXT NOT NULL,price_minor INTEGER NOT NULL,PRIMARY KEY(buyer_id,vehicle_id));`);
 const one=(s,...a)=>db.prepare(s).get(...a),all=(s,...a)=>db.prepare(s).all(...a);
 const records=(owner,kind)=>all('SELECT * FROM buyer_records WHERE buyer_id=? AND kind=? ORDER BY updated_at DESC',owner,kind).map(r=>({...JSON.parse(r.payload_json),id:r.id,created_at:r.created_at,status:JSON.parse(r.payload_json).status||'saved'}));
 const orders=owner=>all("SELECT * FROM seller_operations WHERE kind='orders' AND archived_at IS NULL").filter(r=>JSON.parse(r.payload_json).buyerId===owner).map(r=>({...Object.fromEntries(['reference','listingId','items','amount','currency','deliveryCity','deliveryMethod','carrier','tracking'].map(k=>[k,JSON.parse(r.payload_json)[k]||''])),id:r.id,status:r.status==='canceled'?'cancelled':r.status,name:r.name,created_at:r.created_at}));
 const allowed={addresses:['label','recipient','phone','line1','line2','city','region','postalCode','country','instructions','default'],preferences:['language','currency','timezone','marketingEmail','marketingSms','marketingPush','priceAlerts','restockAlerts','reviewReminders'],cart:['listingId'],lists:['name','listingIds'],support:['subject','description','orderId','category'],privacy:['type','description'],returns:['orderId','reason','description'],reviews:['orderId','rating','description']};
 function save(owner,kind,value,id=randomUUID()){const t=new Date().toISOString();db.prepare('INSERT INTO buyer_records VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at').run(id,owner,kind,JSON.stringify(value),t,t);return id;}
 return async function(req,res,url,user){
  if(!url.pathname.startsWith('/api/buyer/workspace'))return false;
  const reply=(status,data)=>{send(res,status,data);return true;},reject=(status,error,fields)=>reply(status,{error,fields});
  if(!user||user.role!=='buyer')return reject(403,'Sign in with your buyer account.');
  const [,kind='home',id,action]=url.pathname.slice('/api/buyer/workspace'.length).split('/');
  if(['payments','cart'].includes(kind))return reject(410,'Auto Connect is a listing service. Buyers arrange purchases directly with sellers.');
  const owner=user.id,ownOrders=orders(owner);
  const verification=all("SELECT * FROM operations_records WHERE kind='privacy' AND archived_at IS NULL").map(r=>({...JSON.parse(r.payload_json),status:r.status})).find(r=>r.userId===owner&&r.type==='verification'&&r.status==='verification_required');
  if(req.method==='GET'){
   if(kind==='home')return reply(200,{profile:one('SELECT * FROM buyer_profiles WHERE user_id=?',owner)||{},orders:ownOrders,verification:verification?{reason:verification.description,...identityService.identity(owner)}:null});
   if(kind==='orders')return reply(200,{items:ownOrders});
   if(kind==='profile')return reply(200,{profile:one('SELECT * FROM buyer_profiles WHERE user_id=?',owner)||{},email:user.email,emailVerified:!!user.email_verified,preferences:records(owner,'preferences')[0]||{language:'en',currency:'GHS',timezone:'Africa/Accra'}});
   if(kind==='sessions')return reply(200,{items:all('SELECT rowid id,csrf_token,created_at,expires_at FROM sessions WHERE user_id=? AND expires_at>?',owner,new Date().toISOString()).map(r=>({id:r.id,created_at:r.created_at,expires_at:r.expires_at,current:r.csrf_token===user.csrf_token}))});
   if(kind==='payments')return reply(200,{items:all('SELECT id,provider,amount_minor,currency,status,created_at FROM payments WHERE user_id=? ORDER BY created_at DESC',owner),connected:false});
   if(allowed[kind])return reply(200,{items:records(owner,kind).map(r=>{if(['support','returns','privacy'].includes(kind)){const ticket=one('SELECT status,payload_json FROM operations_records WHERE id=?',r.id);if(ticket)return {...r,status:ticket.status,publicReply:JSON.parse(ticket.payload_json).publicReply||''};}return r;})});
   return reject(404,'Page not found.');
  }
  if(!requireCsrf(req,res,user))return true;
  if(kind==='sessions'&&req.method==='DELETE'){const row=one('SELECT csrf_token FROM sessions WHERE rowid=? AND user_id=?',Number(id),owner);if(!row)return reject(404,'Session not found.');if(row.csrf_token===user.csrf_token)return reject(409,'Use Sign out for this session.');db.prepare('DELETE FROM sessions WHERE rowid=? AND user_id=?').run(Number(id),owner);return reply(200,{ok:true});}
  if(req.method==='DELETE'&&allowed[kind]){const row=one('SELECT id FROM buyer_records WHERE id=? AND buyer_id=? AND kind=?',id,owner,kind);if(!row)return reject(404,'Record not found.');if(!['addresses','cart','lists'].includes(kind))return reject(409,'Contact support to change this request.');db.prepare('DELETE FROM buyer_records WHERE id=? AND buyer_id=?').run(id,owner);return reply(200,{ok:true});}
  const b=await body(req);if(!b||typeof b!=='object'||Array.isArray(b))return reject(400,'Send a valid form.');
  if(kind==='verification'){if(!verification)return reject(409,'No identity check is required for your account.');try{return reply(200,await identityService.startHostedIdentity(user,b,'buyer'));}catch(e){return reject(e.status||502,e.message);}}
  if(kind==='profile'){
   const fields={};if(String(b.display_name||'').trim().length<2)fields.display_name='Enter at least two characters.';if(b.phone&&!/^[+\d ()-]{7,32}$/.test(b.phone))fields.phone='Enter a valid contact number.';
   if(b.avatar_url&&!/^https:\/\/[^\s]+$/.test(b.avatar_url))fields.avatar_url='Use an HTTPS image URL.';
   if(Object.keys(fields).length)return reject(400,'Check the highlighted details.',fields);
   db.prepare('INSERT INTO buyer_profiles(user_id,display_name,phone,avatar_url) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,phone=excluded.phone,avatar_url=excluded.avatar_url').run(owner,String(b.display_name).trim().slice(0,100),String(b.phone||''),String(b.avatar_url||'').slice(0,2000));return reply(200,{ok:true});
  }
  if(kind==='orders'&&action==='cancel'){
   const order=ownOrders.find(r=>r.id===id);if(!order)return reject(404,'Order not found.');if(!['pending','accepted'].includes(order.status))return reject(409,'This order has moved into fulfillment. Contact support.');
   const t=new Date().toISOString();db.exec('BEGIN');try{const current=one('SELECT * FROM seller_operations WHERE id=?',id);const result=db.prepare("UPDATE seller_operations SET status='canceled',updated_at=? WHERE id=? AND status IN ('pending','accepted')").run(t,id);if(!result.changes){db.exec('ROLLBACK');return reject(409,'The order changed. Refresh and try again.');}db.prepare('INSERT INTO seller_operation_history VALUES(?,?,?,?,?)').run(randomUUID(),id,current.seller_id,JSON.stringify(current),t);adminLog(user,'buyer.order.cancel','orders',id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return reply(200,{ok:true});
  }
  if(!allowed[kind])return reject(404,'Action not found.');
  if(id&&!one('SELECT id FROM buyer_records WHERE id=? AND buyer_id=? AND kind=?',id,owner,kind))return reject(404,'Record not found.');
  if(JSON.stringify(b).length>20000)return reject(400,'This entry is too long.');
  const value=Object.fromEntries(allowed[kind].filter(k=>b[k]!==undefined).map(k=>[k,b[k]]));
  if(Object.values(value).some(v=>!['string','boolean','number'].includes(typeof v)))return reject(400,'Use text values for these fields.');
  if(kind==='addresses'){
   const errors={};for(const key of ['recipient','line1','city','country'])if(!String(value[key]||'').trim())errors[key]='This detail is required.';
   if(Object.keys(errors).length)return reject(400,'Complete your delivery address.',errors);
  }
  if(['returns','reviews'].includes(kind)){
   const order=ownOrders.find(r=>r.id===value.orderId);if(!order||order.status!=='delivered')return reject(409,'Choose one of your delivered orders.');
   if(records(owner,kind).some(r=>r.orderId===value.orderId&&r.id!==id))return reject(409,'You already submitted this request for this order.');
   if(kind==='reviews'&&(!Number.isInteger(Number(value.rating))||Number(value.rating)<1||Number(value.rating)>5))return reject(400,'Choose a rating from 1 to 5.');
   if(!String(value.description||'').trim())return reject(400,'Add a description.');value.status='pending_review';
  }
  if(kind==='cart'){const listing=one("SELECT id FROM vehicles WHERE id=? AND status='active'",value.listingId);if(!listing)return reject(409,'This listing is unavailable.');if(records(owner,'cart').some(r=>r.listingId===value.listingId))return reject(409,'This item is already in your cart.');}
  if(kind==='privacy'&&!['data_export','account_deletion'].includes(value.type))return reject(400,'Choose a data request type.');
  const key=id||randomUUID();
  db.exec('BEGIN');try{
   if(kind==='addresses'&&value.default)for(const r of records(owner,'addresses'))if(r.default)save(owner,kind,{...r,default:false},r.id);
   save(owner,kind,value,key);adminLog(user,'buyer.'+kind+(id?'.update':'.create'),kind,key);
   if(['support','privacy','returns'].includes(kind)){
    const t=new Date().toISOString(),payload={userId:owner,customerMessage:value.description||value.reason||value.type,publicReply:'',description:'',relatedId:value.orderId||'',category:kind};
    db.prepare("INSERT INTO operations_records(id,kind,name,status,payload_json,created_at,updated_at) VALUES(?,'tickets',?,'open',?,?,?) ON CONFLICT(id) DO UPDATE SET payload_json=json_set(operations_records.payload_json,'$.customerMessage',json_extract(excluded.payload_json,'$.customerMessage')),updated_at=excluded.updated_at").run(key,value.subject||`Buyer ${kind}`,JSON.stringify(payload),t,t);
   }
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  return reply(id?200:201,{id:key,ok:true});
 };
}


