import {randomUUID,createHmac,timingSafeEqual} from 'node:crypto';
export const listingFeeBands=[{maxPriceMinor:10000000,amountMinor:6000,label:'Up to GHS 100,000'},{maxPriceMinor:50000000,amountMinor:8000,label:'Above GHS 100,000 to 500,000'},{maxPriceMinor:100000000,amountMinor:10000,label:'Above GHS 500,000 to 1,000,000'},{maxPriceMinor:null,amountMinor:20000,label:'Above GHS 1,000,000'}];
export function listingFee(priceMinor,currency='GHS'){if(currency!=='GHS'||!Number.isSafeInteger(priceMinor)||priceMinor<=0)return null;return listingFeeBands.find(b=>b.maxPriceMinor===null||priceMinor<=b.maxPriceMinor).amountMinor;}
export function createListingBilling({db,send,body,requireCsrf,adminLog,env=process.env,fetchProvider=fetch}){
 db.exec(`CREATE TABLE IF NOT EXISTS listing_fee_payments(reference TEXT PRIMARY KEY,seller_id TEXT NOT NULL REFERENCES users(id),vehicle_id TEXT NOT NULL REFERENCES vehicles(id),amount_minor INTEGER NOT NULL,currency TEXT NOT NULL,status TEXT NOT NULL,livemode INTEGER NOT NULL DEFAULT 0,checkout_url TEXT,created_at TEXT NOT NULL,paid_at TEXT);CREATE INDEX IF NOT EXISTS fee_vehicle ON listing_fee_payments(vehicle_id,status);CREATE UNIQUE INDEX IF NOT EXISTS fee_one_pending ON listing_fee_payments(vehicle_id) WHERE status='pending';`);
 const one=(s,...a)=>db.prepare(s).get(...a),all=(s,...a)=>db.prepare(s).all(...a);
 const currency='GHS';
 const connected=env.LISTING_PAYMENT_PROVIDER==='paystack'&&!!env.PAYSTACK_SECRET_KEY;
 const feeSql="CASE WHEN v.currency='GHS' AND v.price_minor>0 THEN CASE WHEN v.price_minor<=10000000 THEN 6000 WHEN v.price_minor<=50000000 THEN 8000 WHEN v.price_minor<=100000000 THEN 10000 ELSE 20000 END ELSE NULL END";
 const paid=id=>{const v=one('SELECT price_minor,currency FROM vehicles WHERE id=?',id);const fee=v?listingFee(v.price_minor,v.currency):null;return fee!==null&&!!one("SELECT reference FROM listing_fee_payments WHERE vehicle_id=? AND currency='GHS' AND amount_minor>=? AND status='paid'"+(env.NODE_ENV==='production'?' AND livemode=1':''),id,fee);};
 async function verify(reference){
  const row=one('SELECT * FROM listing_fee_payments WHERE reference=?',reference);if(!row)return false;
  const response=await fetchProvider('https://api.paystack.co/transaction/verify/'+encodeURIComponent(reference),{headers:{Authorization:'Bearer '+env.PAYSTACK_SECRET_KEY},signal:AbortSignal.timeout(15000)});const result=await response.json(),d=result.data;
  if(!response.ok||!result.status||d?.reference!==reference||d.status!=='success'||d.amount!==row.amount_minor||d.currency!==row.currency||env.NODE_ENV==='production'&&d.domain!=='live')return false;
  if(row.status!=='paid'){const changed=db.prepare("UPDATE listing_fee_payments SET status='paid',livemode=?,paid_at=? WHERE reference=? AND status!='paid'").run(d.domain==='live'?1:0,new Date().toISOString(),reference);if(changed.changes)adminLog({id:row.seller_id},'listing.fee.paid','vehicle',row.vehicle_id,{reference,amount:row.amount_minor,currency:row.currency});}return true;
 }
 const handler=async(req,res,url,user)=>{
  if(!url.pathname.startsWith('/api/listing-billing'))return false;
  const reply=(status,data)=>{send(res,status,data);return true;},fail=(status,error)=>reply(status,{error});
  if(url.pathname==='/api/listing-billing/webhook'&&req.method==='POST'){
   if(!connected)return fail(503,'Listing payment service is not configured.');const chunks=[];let size=0;for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>1000000)return fail(413,'Event too large.');chunks.push(bytes);}const raw=Buffer.concat(chunks);
   const signature=String(req.headers['x-paystack-signature']||''),expected=createHmac('sha512',env.PAYSTACK_SECRET_KEY).update(raw).digest('hex');if(!/^[a-f0-9]{128}$/i.test(signature)||!timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(expected,'hex')))return fail(400,'Invalid payment signature.');
   let event;try{event=JSON.parse(raw.toString('utf8'));}catch{return fail(400,'Invalid event.');}if(event.event==='charge.success')await verify(String(event.data?.reference||''));return reply(200,{received:true});
  }
  if(!user||!['dealer','admin'].includes(user.role))return fail(403,'Listing fees are for seller accounts only.');
  if(req.method==='GET'){
   if(user.role==='admin'){
    const ops=all("SELECT id,kind,payload_json FROM operations_records WHERE archived_at IS NULL AND status='active'").map(r=>({...JSON.parse(r.payload_json),id:r.id,kind:r.kind}));const grant=ops.find(r=>r.kind==='memberships'&&r.userId===user.id&&r.adminRole);
    const role=grant?one("SELECT payload_json FROM operations_records WHERE id=? AND kind='roles' AND archived_at IS NULL",grant.adminRole):null;const permissions=String(role?JSON.parse(role.payload_json).permissions||'':'').split(/[\s,]+/);
    if(grant&&!permissions.some(p=>['*','billing:*','billing:view'].includes(p)))return fail(403,'Your role cannot view seller listing fees.');
    const rows=all('SELECT reference,seller_id,vehicle_id,amount_minor,currency,status,livemode,created_at,paid_at FROM listing_fee_payments ORDER BY created_at DESC');const items=grant?.organization?rows.filter(r=>ops.some(m=>m.kind==='memberships'&&m.userId===r.seller_id&&m.organization===grant.organization)):rows;
    return reply(200,{items,connected,testMode:!env.PAYSTACK_SECRET_KEY||env.PAYSTACK_SECRET_KEY.startsWith('sk_test_'),bands:listingFeeBands,currency});}
   return reply(200,{items:all('SELECT id,make,model,year,status,price_minor,currency FROM vehicles WHERE dealer_id=? AND deleted_at IS NULL ORDER BY created_at DESC',user.id).map(v=>({...v,feePaid:paid(v.id),feeAmountMinor:listingFee(v.price_minor,v.currency)})),payments:all('SELECT reference,vehicle_id,amount_minor,currency,status,livemode,created_at,paid_at FROM listing_fee_payments WHERE seller_id=? ORDER BY created_at DESC',user.id),connected,testMode:!env.PAYSTACK_SECRET_KEY||env.PAYSTACK_SECRET_KEY.startsWith('sk_test_'),bands:listingFeeBands,currency});
  }
  if(!requireCsrf(req,res,user))return true;if(user.role!=='dealer')return fail(403,'Only a seller can pay their listing fee.');
  if(url.pathname==='/api/listing-billing/sandbox-pay'&&env.NODE_ENV!=='production'){
   const b=await body(req);if(!b||typeof b!=='object')return fail(400,'Choose a listing.');
   const listing=one('SELECT * FROM vehicles WHERE id=? AND dealer_id=? AND deleted_at IS NULL',String(b.listingId||''),user.id);if(!listing)return fail(404,'Listing not found.');if(paid(listing.id))return fail(409,'This listing fee is already paid.');
   const amount=listingFee(listing.price_minor,listing.currency);if(amount===null)return fail(409,'Listing fees are currently defined for GHS asking prices only. Set a GHS price before paying.');
   if(!['pending','active','paused'].includes(listing.status))return fail(409,'Submit your listing for review before paying its publishing fee.');
   db.prepare("UPDATE listing_fee_payments SET status='superseded' WHERE vehicle_id=? AND status='pending'").run(listing.id);
   const reference='sqlite_fee_'+randomUUID().replaceAll('-',''),t=new Date().toISOString();
   db.prepare('INSERT INTO listing_fee_payments(reference,seller_id,vehicle_id,amount_minor,currency,status,livemode,created_at,paid_at) VALUES(?,?,?,?,?,?,0,?,?)').run(reference,user.id,listing.id,amount,currency,'paid',t,t);
   adminLog({id:user.id},'listing.fee.paid','vehicle',listing.id,{reference,amount,currency,provider:'sqlite_sandbox'});
   return reply(200,{paid:true,reference,amountMinor:amount,currency});
  }
  if(url.pathname==='/api/listing-billing/paystack-simulate/initialize'&&env.NODE_ENV!=='production'){
   const b=await body(req);if(!b||typeof b!=='object')return fail(400,'Choose a listing.');
   const listing=one('SELECT * FROM vehicles WHERE id=? AND dealer_id=? AND deleted_at IS NULL',String(b.listingId||''),user.id);if(!listing)return fail(404,'Listing not found.');if(paid(listing.id))return fail(409,'This listing fee is already paid.');
   const amount=listingFee(listing.price_minor,listing.currency);if(amount===null)return fail(409,'Listing fees are currently defined for GHS asking prices only. Set a GHS price before paying.');
   if(!['pending','active','paused'].includes(listing.status))return fail(409,'Submit your listing for review before paying its publishing fee.');
   const existing=one("SELECT * FROM listing_fee_payments WHERE seller_id=? AND vehicle_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1",user.id,listing.id);
   if(existing&&existing.amount_minor===amount&&existing.currency===currency&&String(existing.reference).startsWith('pstk_sim_')){
    return reply(200,{simulated:true,reference:existing.reference,accessCode:'sim_'+existing.reference.slice(-10),authorizationUrl:existing.checkout_url,amountMinor:amount,currency,email:user.email,listing:{id:listing.id,year:listing.year,make:listing.make,model:listing.model}});
   }
   db.prepare("UPDATE listing_fee_payments SET status='superseded' WHERE vehicle_id=? AND status='pending'").run(listing.id);
   const reference='pstk_sim_'+randomUUID().replaceAll('-',''),t=new Date().toISOString(),checkoutUrl=`https://checkout.paystack.com/sim_${reference.slice(-12)}`;
   db.prepare('INSERT INTO listing_fee_payments(reference,seller_id,vehicle_id,amount_minor,currency,status,livemode,checkout_url,created_at) VALUES(?,?,?,?,?,?,0,?,?)').run(reference,user.id,listing.id,amount,currency,'pending',checkoutUrl,t);
   adminLog({id:user.id},'listing.fee.paystack_sim_init','vehicle',listing.id,{reference,amount,currency,provider:'paystack_simulator'});
   return reply(200,{simulated:true,reference,accessCode:'sim_'+reference.slice(-10),authorizationUrl:checkoutUrl,amountMinor:amount,currency,email:user.email,listing:{id:listing.id,year:listing.year,make:listing.make,model:listing.model}});
  }
  if(url.pathname==='/api/listing-billing/paystack-simulate/complete'&&env.NODE_ENV!=='production'){
   const b=await body(req);if(!b||typeof b!=='object')return fail(400,'Provide a Paystack transaction reference.');
   const reference=String(b.reference||'').trim();
   const row=one('SELECT * FROM listing_fee_payments WHERE reference=? AND seller_id=?',reference,user.id);
   if(!row)return fail(404,'Simulated Paystack transaction not found.');
   if(row.status==='paid')return reply(200,{paid:true,status:'paid',reference:row.reference,amountMinor:row.amount_minor,currency:row.currency,paidAt:row.paid_at,receiptNumber:'PSTK-GH-'+row.reference.slice(-8).toUpperCase()});
   const outcome=String(b.outcome||'success'),channel=String(b.channel||'mobile_money'),network=String(b.network||'MTN MoMo'),t=new Date().toISOString();
   if(outcome==='declined'){
    db.prepare("UPDATE listing_fee_payments SET status='failed' WHERE reference=?").run(reference);
    adminLog({id:user.id},'listing.fee.failed','vehicle',row.vehicle_id,{reference,amount:row.amount_minor,currency:row.currency,provider:'paystack_simulator',channel,outcome});
    return fail(402,'Simulated Paystack charge was declined by the customer bank or mobile money wallet.');
   }
   if(outcome==='abandoned'){
    return reply(200,{paid:false,status:'pending',reference});
   }
   db.prepare("UPDATE listing_fee_payments SET status='paid',livemode=0,paid_at=? WHERE reference=?").run(t,reference);
   adminLog({id:user.id},'listing.fee.paid','vehicle',row.vehicle_id,{reference,amount:row.amount_minor,currency:row.currency,provider:'paystack_simulator',channel,network});
   return reply(200,{paid:true,status:'paid',reference,channel,network,amountMinor:row.amount_minor,currency:row.currency,paidAt:t,receiptNumber:'PSTK-GH-'+reference.slice(-8).toUpperCase()});
  }
  if(!connected)return fail(503,'The listing fee and payment service need to be configured. No charge was made.');
  const b=await body(req);if(!b||typeof b!=='object')return fail(400,'Choose a listing.');
  if(url.pathname.endsWith('/verify')){const row=one('SELECT seller_id FROM listing_fee_payments WHERE reference=?',String(b.reference||''));if(row?.seller_id!==user.id)return fail(404,'Payment not found.');const ok=await verify(b.reference);return reply(ok?200:409,ok?{paid:true}:{error:'Payment has not been confirmed. You can check again after completing payment.'});}
  if(url.pathname!=='/api/listing-billing/checkout')return fail(404,'Action not found.');
  const listing=one('SELECT * FROM vehicles WHERE id=? AND dealer_id=? AND deleted_at IS NULL',String(b.listingId||''),user.id);if(!listing)return fail(404,'Listing not found.');if(paid(listing.id))return fail(409,'This listing fee is already paid.');
  const amount=listingFee(listing.price_minor,listing.currency);if(amount===null)return fail(409,'Listing fees are currently defined for GHS asking prices only. Set a GHS price before paying.');if(one("SELECT reference FROM listing_fee_payments WHERE vehicle_id=? AND currency='GHS' AND status='paid'"+(env.NODE_ENV==='production'?' AND livemode=1':''),listing.id))return fail(409,'Your asking price now requires a higher fee. Contact support to adjust the previous payment; do not pay a second full listing fee.');
  if(!['pending','active','paused'].includes(listing.status))return fail(409,'Submit your listing for review before paying its publishing fee.');
  const existing=one("SELECT * FROM listing_fee_payments WHERE seller_id=? AND vehicle_id=? AND status='pending' AND checkout_url IS NOT NULL ORDER BY created_at DESC LIMIT 1",user.id,listing.id);if(existing&&existing.amount_minor===amount&&existing.currency===currency)return reply(200,{url:existing.checkout_url,reference:existing.reference});if(existing)db.prepare("UPDATE listing_fee_payments SET status='superseded' WHERE reference=? AND status='pending'").run(existing.reference);
  const reference='listing_'+randomUUID().replaceAll('-',''),t=new Date().toISOString();try{db.prepare('INSERT INTO listing_fee_payments(reference,seller_id,vehicle_id,amount_minor,currency,status,created_at) VALUES(?,?,?,?,?,?,?)').run(reference,user.id,listing.id,amount,currency,'pending',t);}catch(e){if(String(e.message).includes('UNIQUE'))return fail(409,'A payment is already being prepared for this listing. Refresh in a moment.');throw e;}
  try{const response=await fetchProvider('https://api.paystack.co/transaction/initialize',{method:'POST',headers:{Authorization:'Bearer '+env.PAYSTACK_SECRET_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:user.email,amount,currency,reference,callback_url:(env.PUBLIC_ORIGIN||'http://127.0.0.1:4287')+'/dealer/dashboard?seller=billing',metadata:{listingId:listing.id,sellerId:user.id,purpose:'listing_publication'}}),signal:AbortSignal.timeout(15000)});const result=await response.json(),url=result.data?.authorization_url;if(!response.ok||!result.status||!/^https:\/\/checkout\.paystack\.com\//.test(url||''))throw Error('The payment service could not open checkout. Try again.');db.prepare('UPDATE listing_fee_payments SET checkout_url=? WHERE reference=?').run(url,reference);return reply(200,{url,reference});}catch(e){db.prepare("UPDATE listing_fee_payments SET status='failed' WHERE reference=?").run(reference);return fail(502,'The payment service could not open checkout. No payment was confirmed.');}
 };
 return Object.assign(handler,{paid,publicationSql:()=>" AND (v.is_demo=1 OR EXISTS (SELECT 1 FROM listing_fee_payments lf WHERE lf.vehicle_id=v.id AND lf.seller_id=v.dealer_id AND lf.status='paid' AND lf.currency='GHS' AND lf.amount_minor>=("+feeSql+")"+(env.NODE_ENV==='production'?' AND lf.livemode=1':'')+'))'});
}

