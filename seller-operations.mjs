import {randomUUID,createHmac,timingSafeEqual} from 'node:crypto';

const fields={
 onboarding:['sellerType','legalName','businessType','address','city','region','contactEmail','phone','categories','deliveryLocations','termsAccepted','termsVersion','completed'],
 business:['legalName','registrationNumber','businessType','taxCountry','representative','ownershipNotes','providerReference'],
 store:['displayName','logoUrl','coverUrl','description','openingHours','pickupLocations','shippingPolicy','returnPolicy','cancellationPolicy','warrantyPolicy','vacationMode'],
 stock:['listingId','sku','quantity','threshold','variants','description'],
 orders:['buyerId','reference','listingId','customerName','deliveryCity','amount','currency','deliveryMethod','tracking','carrier','items','notes'],
 returns:['orderId','reason','requestedAmount','currency','tracking','evidenceNotes','deadline','resolution'],
 disputes:['orderId','reason','evidenceNotes','deadline','requestedAmount','currency'],
 promotions:['code','discountPercent','startsAt','endsAt','eligibility','budget','bundleListings','description'],
 replies:['body','category'],
 preferences:['emailAlerts','messageAlerts','stockAlerts','orderAlerts','timezone','locale'],
 staff:['email','permissions','description'],
 support:['category','description','priority','deadline','relatedId'],
 appeals:['category','description','relatedId'],
 blocks:['buyerId','description']
};
const sensitive=/^(?:idNumber|passportNumber|nationalId|driverLicense|selfie|biometric|bankAccount|accountNumber|routingNumber|taxId|documentImage|password|secret|apiKey)$/i;
export function createSellerOperations({db,send,fail,body,requireCsrf,adminLog,fetchProvider=fetch,env=process.env}){
 db.exec(`CREATE TABLE IF NOT EXISTS seller_operations (id TEXT PRIMARY KEY,seller_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,name TEXT NOT NULL,status TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,archived_at TEXT);
 CREATE INDEX IF NOT EXISTS seller_ops_owner ON seller_operations(seller_id,kind,updated_at);
 CREATE TABLE IF NOT EXISTS seller_operation_history(id TEXT PRIMARY KEY,record_id TEXT NOT NULL,seller_id TEXT NOT NULL,snapshot_json TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS seller_identity(seller_id TEXT PRIMARY KEY REFERENCES users(id),provider TEXT NOT NULL DEFAULT 'stripe_identity',session_id TEXT,status TEXT NOT NULL DEFAULT 'not_started',reason TEXT NOT NULL DEFAULT '',last_event INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS seller_provider_events(id TEXT PRIMARY KEY,created_at TEXT NOT NULL);`);
 if(!db.prepare('PRAGMA table_info(seller_identity)').all().some(c=>c.name==='livemode'))db.exec('ALTER TABLE seller_identity ADD COLUMN livemode INTEGER NOT NULL DEFAULT 0');
 const now=()=>new Date().toISOString(),one=(sql,...args)=>db.prepare(sql).get(...args),all=(sql,...args)=>db.prepare(sql).all(...args);
 const unpack=r=>({...JSON.parse(r.payload_json),id:r.id,name:r.name,status:r.status,created_at:r.created_at,updated_at:r.updated_at,archived_at:r.archived_at});
 const rows=(owner,kind)=>all('SELECT * FROM seller_operations WHERE seller_id=? AND kind=? ORDER BY updated_at DESC',owner,kind).map(unpack);
 const identity=owner=>{const row=one('SELECT provider,status,reason,updated_at,livemode FROM seller_identity WHERE seller_id=?',owner);const productionNeedsLive=env.NODE_ENV==='production'&&row?.status==='verified'&&!row.livemode;return {...(row||{provider:'stripe_identity',status:'not_started',reason:''}),...(productionNeedsLive?{status:'not_started',reason:'A live identity check is required. Test results do not verify this account.'}:{}),verifiedForProduction:row?.status==='verified'&&row.livemode===1,connected:!!(env.STRIPE_IDENTITY_SECRET_KEY&&env.STRIPE_IDENTITY_WEBHOOK_SECRET),testMode:row?!row.livemode:!env.STRIPE_IDENTITY_SECRET_KEY||env.STRIPE_IDENTITY_SECRET_KEY.startsWith('sk_test_')};};
 const isBlocked=(seller,buyer)=>rows(seller,'blocks').some(r=>r.buyerId===buyer&&!r.archived_at);
 const log=(user,action,kind,id,details={})=>adminLog(user,'seller.'+action,kind,id,details);
 function storeRecord(owner,kind,id,name,status,payload,current=null){const t=now();if(current)db.prepare('INSERT INTO seller_operation_history VALUES(?,?,?,?,?)').run(randomUUID(),id,owner,JSON.stringify(unpack(current)),t);db.prepare('INSERT INTO seller_operations VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,status=excluded.status,payload_json=excluded.payload_json,updated_at=excluded.updated_at,archived_at=excluded.archived_at').run(id,owner,kind,name,status,JSON.stringify(payload),current?.created_at||t,t,current?.archived_at||null);return unpack(one('SELECT * FROM seller_operations WHERE id=?',id));}
 const count=(table,where,...args)=>one(`SELECT count(*) n FROM ${table} WHERE ${where}`,...args).n;
 async function providerSession(params,idempotency){const response=await fetchProvider('https://api.stripe.com/v1/identity/verification_sessions',{method:'POST',headers:{Authorization:'Bearer '+env.STRIPE_IDENTITY_SECRET_KEY,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':idempotency},body:params,signal:AbortSignal.timeout(15000)});const result=await response.json();if(!response.ok)throw Object.assign(Error('The identity provider could not start this check. Contact verification support or try again.'),{status:502});return result;}
 async function startHostedIdentity(user,b,flow='seller'){
  const owner=user.id;const reject=(status,message)=>{throw Object.assign(new Error(message),{status});};
  if(flow==='buyer'?user.role!=='buyer':user.role!=='dealer')return reject(403,'Account role does not match this verification flow.');

   if(!identity(owner).connected)return reject(503,'Stripe Identity is not connected. Use verification support; do not upload identity documents to this app.');
   if(b.consent!==true)return reject(400,'Read the provider information and consent before starting.');
   if(!['passport','id_card','driving_license'].includes(b.documentType))return reject(400,'Choose a supported government document type.');
   const current=one('SELECT * FROM seller_identity WHERE seller_id=?',owner);
   let session;
   if(current?.session_id&&['in_progress','unsuccessful'].includes(current.status)){
    const response=await fetchProvider('https://api.stripe.com/v1/identity/verification_sessions/'+encodeURIComponent(current.session_id),{headers:{Authorization:'Bearer '+env.STRIPE_IDENTITY_SECRET_KEY},signal:AbortSignal.timeout(15000)});if(!response.ok)return reject(502,'Could not resume the provider session. Ask verification support for help.');session=await response.json();
   }else{
    if(current?.status==='verified'&&!(env.NODE_ENV==='production'&&!current.livemode))return reject(409,'This account is already verified. Request reverification through support when details change.');
    const params=new URLSearchParams({type:'document','options[document][require_matching_selfie]':'true','options[document][require_live_capture]':'true','options[document][allowed_types][0]':b.documentType,'client_reference_id':owner,return_url:(env.PUBLIC_ORIGIN||'http://127.0.0.1:4287')+(flow==='buyer'?'/account?view=verification':'/dealer/dashboard?seller=verification')});
    session=await providerSession(params,`seller-identity-${owner}-${current?.updated_at||'first'}`);
   }
   if(!session?.id||!/^https:\/\/verify\.stripe\.com\//.test(session.url||''))return reject(502,'The provider did not return a valid hosted verification link.');
   db.prepare("INSERT INTO seller_identity(seller_id,session_id,status,updated_at,livemode) VALUES(?,?,'in_progress',?,?) ON CONFLICT(seller_id) DO UPDATE SET session_id=excluded.session_id,status='in_progress',reason='',updated_at=excluded.updated_at,livemode=excluded.livemode").run(owner,session.id,now(),session.livemode?1:0);
   adminLog(user,flow+'.identity.start','identity',owner,{provider:'stripe_identity',consent:true,noticeVersion:'identity_notice_v1'});return {url:session.url,testMode:!session.livemode};
  
 }
 async function handler(req,res,url,user){
  const p=url.pathname;
  if(['/api/seller/identity/webhook','/api/identity/webhook'].includes(p)&&req.method==='POST'){
   if(!env.STRIPE_IDENTITY_WEBHOOK_SECRET){fail(res,503,'Identity webhook is not configured.');return true;}
   const signature=String(req.headers['stripe-signature']||''),pieces=signature.split(',').map(x=>x.split('=')),timestamp=pieces.find(([k])=>k==='t')?.[1],signatures=pieces.filter(([k])=>k==='v1').map(([,v])=>v);
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1_000_000){fail(res,413,'Event is too large.');return true;}}
   const expected=createHmac('sha256',env.STRIPE_IDENTITY_WEBHOOK_SECRET).update(timestamp+'.'+raw).digest();
   const valid=timestamp&&Math.abs(Date.now()/1000-Number(timestamp))<=300&&signatures.some(s=>{if(!/^[a-f0-9]{64}$/.test(s))return false;return timingSafeEqual(Buffer.from(s,'hex'),expected);});
   if(!valid){fail(res,400,'Invalid webhook signature.');return true;}
   let event;try{event=JSON.parse(raw);}catch{fail(res,400,'Invalid event.');return true;}
   if(!event.id||!Number.isFinite(event.created)){fail(res,400,'Invalid event envelope.');return true;}
   if(one('SELECT id FROM seller_provider_events WHERE id=?',event.id)){send(res,200,{received:true});return true;}
   const session=event.data?.object,current=session?.id?one('SELECT * FROM seller_identity WHERE session_id=?',session.id):null;
   if(env.NODE_ENV==='production'&&event.livemode!==true){send(res,200,{received:true,ignored:'test_event'});return true;}
   if(current&&String(event.type).startsWith('identity.verification_session.')&&event.created>=current.last_event){
    const state={verified:'verified',processing:'under_review',requires_input:session.last_error?.code==='document_expired'?'expired':session.last_error?'unsuccessful':'in_progress',canceled:'not_started'}[session.status];
    if(state&&!(current.status==='verified'&&state!=='verified'&&event.created===current.last_event)){db.prepare('UPDATE seller_identity SET status=?,reason=?,last_event=?,updated_at=?,livemode=? WHERE seller_id=?').run(state,String(session.last_error?.reason||'').slice(0,800),event.created,now(),event.livemode===true?1:0,current.seller_id);}
   }
   db.prepare('INSERT INTO seller_provider_events VALUES(?,?)').run(event.id,now());send(res,200,{received:true});return true;
  }
  if(!p.startsWith('/api/seller/operations'))return false;
  const reply=(status,data)=>{send(res,status,data);return true;},reject=(status,error)=>{fail(res,status,error);return true;};
  if(!user||user.role!=='dealer')return reject(403,'Sign in with a seller account.');
  const [,kind='overview',recordId,action]=p.slice('/api/seller/operations'.length).split('/');
  if(!['GET','POST','PATCH'].includes(req.method))return reject(405,'Method not allowed.');
  if(req.method!=='GET'&&!requireCsrf(req,res,user))return true;
  const owner=user.id;
  if(req.method==='GET'&&kind==='overview'){
   const days=Math.max(1,Math.min(366,Number(url.searchParams.get('days'))||30));const start=new Date();start.setUTCHours(0,0,0,0);start.setUTCDate(start.getUTCDate()-days+1);const from=start.toISOString();
   const profile=one('SELECT seller_type,business_name,city,country,region,status,contact_email,phone,description,opening_hours FROM dealer_profiles WHERE user_id=?',owner);
   const orders=rows(owner,'orders').filter(r=>!r.archived_at&&r.created_at>=from),stock=rows(owner,'stock').filter(r=>!r.archived_at),returns=rows(owner,'returns').filter(r=>!r.archived_at);
   const metrics={activeListings:count('vehicles',"dealer_id=? AND status='active' AND deleted_at IS NULL",owner),pendingListings:count('vehicles',"dealer_id=? AND status='pending' AND deleted_at IS NULL",owner),drafts:count('seller_listing_drafts','seller_id=?',owner),sold:count('vehicles',"dealer_id=? AND status='sold' AND deleted_at IS NULL",owner),views:count('vehicle_views','vehicle_id IN (SELECT id FROM vehicles WHERE dealer_id=?) AND viewed_at>=?',owner,from),saves:count('favourites','vehicle_id IN (SELECT id FROM vehicles WHERE dealer_id=?)',owner),enquiries:count('enquiries','dealer_id=? AND created_at>=?',owner,from),unread:count('enquiries',"dealer_id=? AND status='new'",owner),orders:orders.length,pendingOrders:orders.filter(r=>r.status==='pending').length,lowStock:stock.filter(r=>Number(r.quantity)<=Number(r.threshold)).length,returns:returns.filter(r=>!['closed','rejected'].includes(r.status)).length};
   const periodOrders=orders.filter(r=>!['canceled','declined'].includes(r.status));const currencies=[...new Set(periodOrders.map(r=>r.currency||'GHS'))];const gross=currencies.map(currency=>({currency,amount:periodOrders.filter(r=>(r.currency||'GHS')===currency).reduce((sum,r)=>sum+Number(r.amount||0),0)}));
   const daily=all("SELECT substr(viewed_at,1,10) day,count(*) count FROM vehicle_views WHERE vehicle_id IN (SELECT id FROM vehicles WHERE dealer_id=?) AND viewed_at>=? GROUP BY day ORDER BY day",owner,from);
   const best=all('SELECT v.id,v.make,v.model,v.year,count(vw.id) views FROM vehicles v LEFT JOIN vehicle_views vw ON vw.vehicle_id=v.id AND vw.viewed_at>=? WHERE v.dealer_id=? GROUP BY v.id ORDER BY views DESC LIMIT 5',from,owner);
   return reply(200,{profile,metrics,gross,daily,best,days,identity:identity(owner),verification:{identity:identity(owner).status,business:rows(owner,'business').find(r=>!r.archived_at)?.status==='under_review'?'under_review':'not_started',payout:'not_connected',marketplace:profile?.status||'pending'},onboarding:rows(owner,'onboarding')[0]||null,store:rows(owner,'store')[0]||null,preferences:rows(owner,'preferences')[0]||null,emailVerified:!!one('SELECT email_verified FROM users WHERE id=?',owner)?.email_verified,activity:all('SELECT action,subject_type,created_at FROM audit_logs WHERE actor_id=? ORDER BY created_at DESC LIMIT 15',owner),alerts:profile?.status!=='approved'?[{title:'Marketplace profile review pending',description:'Complete your seller profile. Listings stay private until your profile and each listing are approved.'}]:[],policy:{publication:'A paid listing-publication fee, marketplace profile approval and listing approval are required'+((env.REQUIRE_SELLER_IDENTITY==='true'||env.NODE_ENV==='production')?'; provider identity verification is also required.':'. Provider identity is not enforced for publishing in this local test environment.'),payout:'Buyers arrange physical purchases directly with sellers. Auto Connect collects only seller listing-publication fees.'},wallet:{connected:false,available:null,pending:null,held:null,earnings:[],payouts:[]},capabilities:{identity:identity(owner).connected,email:false,phone:false,payments:false,businessVerification:false,ads:false,staffInvites:false,mfa:false}});
  }
  if(kind==='wallet')return reject(410,'Seller wallets and payouts are not part of Auto Connect. Use listing fees.');
  if(req.method==='GET'&&kind==='verification')return reply(200,{identity:identity(owner)});
  if(req.method==='GET'&&kind==='sessions')return reply(200,{items:all('SELECT rowid id,created_at,expires_at,CASE WHEN csrf_token=? THEN 1 ELSE 0 END current FROM sessions WHERE user_id=? AND expires_at>? ORDER BY created_at DESC',user.csrf_token||'',owner,now()).map(r=>({...r,name:r.current?'Current session':'Other session',status:'active'}))});
  if(req.method==='GET'&&kind==='customers')return reply(200,{items:all("SELECT DISTINCT e.buyer_id id,coalesce(nullif(b.display_name,''),'Buyer') name FROM enquiries e LEFT JOIN buyer_profiles b ON b.user_id=e.buyer_id WHERE e.dealer_id=?",owner)});
  if(req.method==='GET'&&kind==='messages')return reply(200,{items:all('SELECT e.id,e.buyer_id buyerId,e.message,e.status,e.created_at,v.year,v.make,v.model FROM enquiries e JOIN vehicles v ON v.id=e.vehicle_id WHERE e.dealer_id=? ORDER BY e.created_at DESC',owner)});
  if(req.method==='GET'&&fields[kind]){
   let items=rows(owner,kind);if(['support','appeals'].includes(kind)){items=items.map(r=>{const mirrored=one('SELECT status,payload_json FROM operations_records WHERE id=?',r.id);return mirrored?{...r,status:mirrored.status,publicReply:JSON.parse(mirrored.payload_json).publicReply||''}:r;});}
   if(recordId){const item=items.find(r=>r.id===recordId);if(!item)return reject(404,'Record not found.');return reply(200,{item,history:all('SELECT id,snapshot_json,created_at FROM seller_operation_history WHERE record_id=? AND seller_id=? ORDER BY created_at DESC',recordId,owner).map(v=>({...v,snapshot:JSON.parse(v.snapshot_json)}))});}
   return reply(200,{items});
  }
  if(req.method==='GET')return reject(404,'Seller collection not found.');
  const b=await body(req);if(!b||typeof b!=='object'||Array.isArray(b))return reject(400,'Send a JSON object.');
  if(Object.keys(b).some(k=>sensitive.test(k)))return reject(400,'Do not submit identity images, biometric data, bank details or secrets here. Use the hosted provider flow.');
  if(kind==='verification'&&action==='start'){try{return reply(200,await startHostedIdentity(user,b));}catch(e){return reject(e.status||502,e.message);}}
  if(kind==='verification'&&action==='sandbox-verify'&&env.NODE_ENV!=='production'){
   if(b.consent!==true)return reject(400,'Read the provider information and consent before starting.');
   if(!['passport','id_card','driving_license'].includes(b.documentType))return reject(400,'Choose a supported government document type.');
   const sessionId='vs_sqlite_'+randomUUID().replaceAll('-',''),t=now();
   db.prepare("INSERT INTO seller_identity(seller_id,provider,session_id,status,reason,last_event,updated_at,livemode) VALUES(?,?,?,'verified','',?, ?,0) ON CONFLICT(seller_id) DO UPDATE SET session_id=excluded.session_id,status='verified',reason='',last_event=excluded.last_event,updated_at=excluded.updated_at,livemode=0").run(owner,'sqlite_sandbox',sessionId,Math.floor(Date.now()/1000),t);
   log(user,'identity.sandbox_verified','identity',owner,{documentType:b.documentType});
   return reply(200,{verified:true,identity:identity(owner)});
  }
  if(kind==='sessions'&&recordId&&action==='revoke'){
   const current=one('SELECT rowid id,csrf_token FROM sessions WHERE rowid=? AND user_id=?',Number(recordId),owner);if(!current)return reject(404,'Session not found.');
   if(current.csrf_token===user.csrf_token)return reject(409,'Use Sign out to end your current session.');
   db.prepare('DELETE FROM sessions WHERE rowid=? AND user_id=?').run(Number(recordId),owner);log(user,'session.revoke','session',recordId);return reply(200,{ok:true});
  }
  if(kind==='messages'&&recordId&&action==='read'){
   const result=db.prepare("UPDATE enquiries SET status='read' WHERE id=? AND dealer_id=? AND status='new'").run(recordId,owner);return reply(200,{updated:result.changes});
  }
  if(kind==='inventory'&&recordId&&action==='duplicate'){
   const current=one('SELECT * FROM vehicles WHERE id=? AND dealer_id=?',recordId,owner);if(!current)return reject(404,'Vehicle not found.');
   const payload={...JSON.parse(current.listing_data),make:current.make,model:current.model,year:String(current.year),price:String(current.price_minor/100),currency:current.currency,mileage:String(current.mileage),title:`${current.year} ${current.make} ${current.model} copy`,description:current.description,city:current.city};const id=randomUUID();db.prepare('INSERT INTO seller_listing_drafts(id,seller_id,payload_json) VALUES(?,?,?)').run(id,owner,JSON.stringify(payload));log(user,'listing.duplicate','draft',id);return reply(201,{id});
  }
  if(kind==='import'&&['preview','commit'].includes(action)){
   if(!Array.isArray(b.items)||b.items.length>50)return reject(400,'Import up to 50 vehicle drafts.');const errors=[];
   b.items.forEach((r,i)=>{if(!r||!String(r.make||'').trim()||!String(r.model||'').trim()||!Number.isInteger(Number(r.year))||Number(r.year)<1900||Number(r.year)>2100)errors.push({row:i+1,error:'Make, model and a valid year are required.'});});
   if(action==='preview'||errors.length)return reply(200,{valid:!errors.length,rows:b.items.length,errors,preview:b.items.slice(0,5)});
   db.exec('BEGIN');try{for(const r of b.items){const payload=Object.fromEntries(Object.entries(r).filter(([k,v])=>!sensitive.test(k)&&['string','number','boolean'].includes(typeof v)));db.prepare('INSERT INTO seller_listing_drafts(id,seller_id,payload_json) VALUES(?,?,?)').run(randomUUID(),owner,JSON.stringify(payload));}log(user,'inventory.import','draft','batch',{count:b.items.length});db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return reply(201,{imported:b.items.length});
  }
  if(action==='export'){if(!fields[kind]&&!['sessions','messages','analytics','wallet'].includes(kind))return reject(400,'Unknown collection.');log(user,'export',kind,'collection');return reply(200,{ok:true});}
  if(!fields[kind])return reject(404,'Seller collection not found.');
  let current=recordId?one('SELECT * FROM seller_operations WHERE id=? AND seller_id=? AND kind=?',recordId,owner,kind):null;
  if(recordId&&!current)return reject(404,'Record not found.');
  if(current?.archived_at&&!['restore','duplicate'].includes(action))return reject(409,'Restore this archived record before changing it.');
  const previous=current?unpack(current):{};
  const safe=Object.fromEntries(fields[kind].filter(k=>b[k]!==undefined).map(k=>[k,b[k]]));
  const value={...Object.fromEntries(fields[kind].filter(k=>previous[k]!==undefined).map(k=>[k,previous[k]])),...safe};
  if(Object.values(value).some(v=>v!==null&&typeof v==='object'))return reject(400,'Record fields must contain text, numbers or boolean values.');
  if(JSON.stringify(value).length>50000)return reject(400,'Record is too large.');
  for(const k of ['amount','requestedAmount','quantity','threshold','budget','discountPercent'])if(value[k]!==undefined&&value[k]!==''&&(!Number.isFinite(Number(value[k]))||Number(value[k])<0||k==='discountPercent'&&Number(value[k])>100))return reject(400,'Enter valid non-negative amounts, quantities and percentages.');
  for(const k of ['quantity','threshold'])if(value[k]!==undefined&&value[k]!==''&&!Number.isInteger(Number(value[k])))return reject(400,'Stock quantities and thresholds must be whole numbers.');
  if(kind==='orders'&&previous.buyerId&&value.buyerId!==previous.buyerId)return reject(409,'A linked buyer cannot be reassigned. Contact support to correct this order.');
  if(kind==='orders'&&value.buyerId&&!one('SELECT id FROM enquiries WHERE buyer_id=? AND dealer_id=?',value.buyerId,owner))return reject(400,'Choose a buyer account that has contacted your store.');
  if(kind==='blocks'&&(!value.buyerId||!one('SELECT id FROM enquiries WHERE buyer_id=? AND dealer_id=?',value.buyerId,owner)))return reject(400,'Choose a buyer who has contacted your seller account.');
  if(value.currency&&!['GHS','USD'].includes(value.currency))return reject(400,'Choose GHS or USD.');
  if(kind==='stock'&&(value.quantity===''||value.quantity===undefined||value.quantity===null))return reject(400,'Enter the available stock quantity.');
  if(value.listingId&&!one('SELECT id FROM vehicles WHERE id=? AND dealer_id=?',value.listingId,owner))return reject(400,'Choose one of your own vehicle listings.');
  if(value.orderId&&!one("SELECT id FROM seller_operations WHERE id=? AND seller_id=? AND kind='orders'",value.orderId,owner))return reject(400,'Choose one of your own order records.');
  for(const key of ['logoUrl','coverUrl'])if(value[key]&&!/^https?:\/\//.test(value[key]))return reject(400,'Images must use an HTTP or HTTPS URL.');
  if(value.vacationMode&&!['true','false'].includes(String(value.vacationMode)))return reject(400,'Choose a valid vacation setting.');
  if(kind==='onboarding'&&value.termsAccepted===true&&!value.termsVersion)return reject(400,'A seller terms version is required.');
  if(['business','onboarding','store','preferences'].includes(kind)&&!current){const existing=one('SELECT * FROM seller_operations WHERE seller_id=? AND kind=? AND archived_at IS NULL',owner,kind);if(existing)current=existing;}
  let status=current?.status||(['orders','returns','disputes','support','appeals'].includes(kind)?'pending':kind==='staff'?'invitation_draft':'draft');
  if(action&&kind==='orders'&&!['archive','restore','duplicate'].includes(action)){
   const transitions={pending:['accepted','declined','canceled'],accepted:['packing','canceled'],packing:['shipped','ready_pickup','partial','canceled'],partial:['shipped','exception'],shipped:['delivered','exception'],ready_pickup:['delivered','canceled'],exception:['shipped','delivered','canceled']};if(!transitions[status]?.includes(action))return reject(409,'This order cannot move to that status.');status=action;
  }else if(action&&['returns','disputes'].includes(kind)&&!['archive','restore','duplicate'].includes(action)){if(!['approved','rejected','received','closed','escalated'].includes(action))return reject(400,'Choose a valid case action.');status=action;}
  else if(action&&!['archive','restore','duplicate','publish','submit-review'].includes(action))return reject(400,'Unknown action.');
  if(action==='publish'){if(kind!=='store'||!value.displayName)return reject(400,'Complete your store name before publishing.');status='published';}
  if(action==='submit-review'){if(kind!=='business'||!value.legalName||!value.registrationNumber||!value.representative)return reject(400,'Complete the legal business name, registration reference and representative before requesting review.');status='under_review';}
  if(action==='duplicate'){current=null;status='draft';}
  const name=String(b.name||previous.name||(kind==='store'?value.displayName:kind+' setup')||'').trim().slice(0,200);if(!name)return reject(400,'A name is required.');
  const key=current?.id||randomUUID();const result=storeRecord(owner,kind,key,name,status,value,current);
  if(kind==='onboarding'&&value.legalName){
   const currentProfile=one('SELECT business_name,status FROM dealer_profiles WHERE user_id=?',owner);
   if(currentProfile?.business_name!==value.legalName&&identity(owner).status==='verified')db.prepare("UPDATE seller_identity SET status='not_started',reason='Your identity details changed. Complete a new identity check.',session_id=NULL,last_event=0,livemode=0,updated_at=? WHERE seller_id=?").run(now(),owner);
   db.prepare('UPDATE dealer_profiles SET business_name=?,business_address=?,city=?,region=?,contact_email=?,phone=?,seller_type=?,status=? WHERE user_id=?').run(String(value.legalName).slice(0,150),String(value.address||'').slice(0,500),String(value.city||'').slice(0,100),String(value.region||'').slice(0,100),String(value.contactEmail||'').slice(0,200),String(value.phone||'').slice(0,60),value.sellerType==='individual'?'private':'dealer',currentProfile?.business_name!==value.legalName?'pending':currentProfile?.status||'pending',owner);
  }
  if(action==='archive'||action==='restore'){db.prepare('UPDATE seller_operations SET archived_at=? WHERE id=? AND seller_id=?').run(action==='archive'?now():null,key,owner);result.archived_at=action==='archive'?now():null;}
  if(['support','appeals'].includes(kind)||kind==='business'&&action==='submit-review'){
   const existing=one('SELECT id,payload_json FROM operations_records WHERE id=?',key);
   const customerMessage=kind==='business'?`Business information review requested for ${value.legalName}. Identity and document checks must be handled by the configured secure provider.`:value.description;
   if(!existing)db.prepare('INSERT INTO operations_records(id,kind,name,status,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(key,'tickets',name,'open',JSON.stringify({userId:owner,category:value.category||'business_verification',customerMessage,description:'',priority:value.priority||'normal',source:'seller_'+kind}),now(),now());
   else db.prepare('UPDATE operations_records SET payload_json=?,updated_at=? WHERE id=?').run(JSON.stringify({...JSON.parse(existing.payload_json),customerMessage}),now(),key);
  }
  if(kind==='stock'&&value.listingId&&Number(value.quantity)===0)db.prepare("UPDATE vehicles SET status='paused',updated_at=? WHERE id=? AND dealer_id=? AND status='active'").run(now(),value.listingId,owner);
  log(user,action|| (current?'update':'create'),kind,key,{name,status});return reply(current?200:201,{item:result});
 }
 return Object.assign(handler,{isBlocked,identity,startHostedIdentity,publicStore:owner=>{const item=rows(owner,'store').find(r=>r.status==='published'&&!r.archived_at);return item?Object.fromEntries(fields.store.map(k=>[k,item[k]??''])):{};},isVacation:owner=>rows(owner,'store').some(r=>!r.archived_at&&String(r.vacationMode)==='true')});
}



