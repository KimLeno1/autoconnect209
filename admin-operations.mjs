import {randomUUID} from 'node:crypto';

// Local operations records are intentionally separate from payment or identity providers.
export function createAdminOperations({db,send,fail,body,requireCsrf,adminLog}) {
  const started=Date.now();
  db.exec(`CREATE TABLE IF NOT EXISTS operations_records (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
    payload_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    archived_at TEXT);
    CREATE INDEX IF NOT EXISTS idx_operations_kind ON operations_records(kind,updated_at);
    CREATE TABLE IF NOT EXISTS operations_versions (
    id TEXT PRIMARY KEY, record_id TEXT NOT NULL, snapshot_json TEXT NOT NULL, actor_id TEXT, created_at TEXT NOT NULL);`);
  const ensureEnquiryCol=(name,def)=>{const cols=db.prepare('PRAGMA table_info(enquiries)').all();if(cols.length&&!cols.some(c=>c.name===name))db.exec(`ALTER TABLE enquiries ADD COLUMN ${name} ${def}`);};
  ensureEnquiryCol('original_message',"TEXT NOT NULL DEFAULT ''");
  ensureEnquiryCol('admin_status',"TEXT NOT NULL DEFAULT 'pending_admin'");
  ensureEnquiryCol('forwarded_to_seller','INTEGER NOT NULL DEFAULT 0');
  ensureEnquiryCol('admin_notes',"TEXT NOT NULL DEFAULT ''");
  ensureEnquiryCol('reviewed_by','TEXT');
  ensureEnquiryCol('forwarded_at','TEXT');
  const kinds=new Set(['organizations','teams','memberships','invitations','roles','content','tickets','jobs','incidents','plans','subscriptions','invoices','discounts','integrations','webhooks','flags','settings','privacy','backups','saved-views','scheduled-reports','service-accounts']);
  const all=(sql,...args)=>db.prepare(sql).all(...args);
  const one=(sql,...args)=>db.prepare(sql).get(...args);
  const n=(table,where='1=1',...args)=>one(`SELECT count(*) n FROM ${table} WHERE ${where}`,...args).n;
  const unpack=r=>({...JSON.parse(r.payload_json),id:r.id,name:r.name,status:r.status,created_at:r.created_at,updated_at:r.updated_at,archived_at:r.archived_at});
  const records=kind=>all('SELECT * FROM operations_records WHERE kind=? ORDER BY updated_at DESC',kind).map(unpack);
  const log=(user,action,kind,id,details={})=>adminLog(user,action,kind,id,details);
  const stamp=()=>new Date().toISOString();
  const summary=u=>({id:u.id,name:u.display_name||u.business_name||u.email,email:u.email,role:u.role,status:u.status,verified:!!u.email_verified,created_at:u.created_at,sessions:n('sessions','user_id=? AND expires_at>?',u.id,stamp()),listings:n('vehicles','dealer_id=? AND deleted_at IS NULL',u.id),organization:records('memberships').find(m=>m.userId===u.id&&!m.archived_at)?.organization||'Unassigned'});
  const users=()=>all(`SELECT u.id,u.email,u.role,u.status,u.email_verified,u.created_at,bp.display_name,dp.business_name FROM users u LEFT JOIN buyer_profiles bp ON bp.user_id=u.id LEFT JOIN dealer_profiles dp ON dp.user_id=u.id ORDER BY u.created_at DESC`).map(summary);
  function overview(url) {
    const days=Math.max(1,Math.min(366,Number(url.searchParams.get('days'))||30));
    const finish=url.searchParams.get('to')?new Date(url.searchParams.get('to')+'T23:59:59.999Z'):new Date();
    const begin=url.searchParams.get('from')?new Date(url.searchParams.get('from')+'T00:00:00Z'):new Date(finish-days*86400000);
    if(!Number.isFinite(+begin)||!Number.isFinite(+finish)||begin>finish)throw Object.assign(Error('Choose a valid date range.'),{status:400});
    const from=begin.toISOString(),to=finish.toISOString(),previous=new Date(+begin-(finish-begin)).toISOString();
    const inRange='created_at>=? AND created_at<=?';
    const current=n('users',inRange,from,to), prior=n('users','created_at>=? AND created_at<?',previous,from);
    const revenue=all(`SELECT currency,sum(amount_minor)/100 amount FROM listing_fee_payments WHERE status='paid' AND livemode=1 AND ${inRange} GROUP BY currency`,from,to);
    const daily=all(`SELECT substr(created_at,1,10) day,count(*) count FROM users WHERE ${inRange} GROUP BY day ORDER BY day`,from,to);
    const views=n('vehicle_views','viewed_at>=? AND viewed_at<=?',from,to),enquiries=n('enquiries',inRange,from,to);
    const active=n('users',`id IN (SELECT user_id FROM sessions WHERE created_at>=? AND created_at<=?) AND status='active'`,from,to);
    return {range:{from,to,days},metrics:{users:n('users',"status!='deleted'"),active,newUsers:current,previousUsers:prior,growth:prior?Math.round((current-prior)/prior*100):null,views,enquiries,pendingEnquiries:n('enquiries',"admin_status='pending_admin'"),revenue,listings:n('vehicles','deleted_at IS NULL'),pendingListings:n('vehicles',"status='pending' AND deleted_at IS NULL"),pendingSellers:n('dealer_profiles',"status='pending'"),reports:n('reports',"status IN ('open','reviewing')")},daily,
      health:{api:'Operational',database:one('SELECT 1 ok').ok?'Connected':'Unavailable',uptime:Math.floor((Date.now()-started)/1000),environment:process.env.NODE_ENV==='production'?'Production':'Local test',email:'Not connected',payments:'Not connected',sso:'Not connected',backup:'Not configured'},
      activity:all('SELECT a.id,a.action,a.subject_type,a.subject_id,a.created_at,u.email actor FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 30'),
      cohorts:all(`SELECT substr(created_at,1,7) month,count(*) accounts FROM users GROUP BY month ORDER BY month DESC LIMIT 12`),
      adoption:{savedCars:n('favourites'),savedSearches:n('saved_searches'),shippingEstimates:n('shipping_estimates'),conversations:n('enquiries')},
      capabilities:{billing:false,sso:false,mfa:false,email:false,impersonation:'Read-only support preview',retention:'Manual requests',schedules:'Recorded only; worker not configured'}};
  }
  const getRows=kind=>kind==='users'?users():kind==='listings'?all('SELECT id,make,model,year,price_minor,currency,status,city,dealer_id,created_at,updated_at,deleted_at FROM vehicles ORDER BY created_at DESC').map(v=>({...v,name:`${v.year} ${v.make} ${v.model}`,price:v.price_minor/100,archived_at:v.deleted_at,organization:records('memberships').find(m=>m.userId===v.dealer_id&&!m.archived_at)?.organization||'Unassigned'})):kind==='approvals'?[
    ...all("SELECT user_id id,business_name name,status,created_at FROM dealer_profiles WHERE status='pending'").map(x=>({...x,type:'Seller profile'})),
    ...all("SELECT id,make,model,year,status,created_at FROM vehicles WHERE status='pending' AND deleted_at IS NULL").map(x=>({...x,name:`${x.year} ${x.make} ${x.model}`,type:'Vehicle listing'}))
  ]:kind==='moderation'?all('SELECT r.*,dp.business_name seller_name FROM reports r LEFT JOIN dealer_profiles dp ON dp.user_id=r.seller_id ORDER BY r.created_at DESC').map(r=>({...r,name:r.reason,description:r.details})):kind==='enquiries'?all(`SELECT e.*,v.make,v.model,v.year,u.email buyer_email,COALESCE(bp.display_name,u.email) buyer_name,dp.business_name seller_name FROM enquiries e JOIN vehicles v ON v.id=e.vehicle_id LEFT JOIN users u ON u.id=e.buyer_id LEFT JOIN buyer_profiles bp ON bp.user_id=e.buyer_id LEFT JOIN dealer_profiles dp ON dp.user_id=e.dealer_id ORDER BY e.created_at DESC`).map(e=>({...e,name:`${e.year} ${e.make} ${e.model}`,status:e.admin_status||'pending_admin',original_message:e.original_message||e.message,forwarded_to_seller:Boolean(e.forwarded_to_seller),description:e.message})):kind==='audit'?all('SELECT a.id,a.action name,a.subject_type,a.subject_id,a.details_json,a.created_at,u.email actor FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 2000').map(a=>({...a,status:'Recorded',details:JSON.parse(a.details_json)})):kind==='sessions'?all('SELECT s.rowid id,s.user_id,s.created_at,s.expires_at,u.email name FROM sessions s JOIN users u ON u.id=s.user_id WHERE expires_at>? ORDER BY s.created_at DESC',stamp()).map(s=>({...s,status:'Active'})):kind==='payments'?all('SELECT id,provider name,amount_minor,currency,status,created_at FROM payments ORDER BY created_at DESC'):records(kind);
  function scoped(user,rows){
    const grant=records('memberships').find(m=>m.userId===user.id&&m.adminRole&&!m.archived_at&&m.status==='active');
    return grant?.organization?rows.filter(r=>r.organization===grant.organization):rows;
  }
  function permitted(user,module,verb){
    const grant=records('memberships').find(m=>m.userId===user.id&&m.adminRole&&!m.archived_at&&m.status==='active');
    if(!grant)return true; // Existing environment-provisioned administrators are owners.
    const role=records('roles').find(r=>r.id===grant.adminRole&&!r.archived_at);
    const permissions=String(role?.permissions||'').split(/[\s,]+/);
    return permissions.includes('*')||permissions.includes(`${module}:${verb}`)||permissions.includes(`${module}:*`);
  }
  function protectUserFields(user,row){
    const grant=records('memberships').find(m=>m.userId===user.id&&m.adminRole&&!m.archived_at&&m.status==='active');
    const role=grant?records('roles').find(r=>r.id===grant.adminRole):null;
    if(grant&&!String(role?.sensitiveFields||'').split(/[\s,]+/).includes('email')&&!String(role?.permissions||'').split(/[\s,]+/).includes('*')){
      const [local,domain]=row.email.split('@');return {...row,email:local.slice(0,1)+'***@'+domain,name:row.name===row.email?'Restricted account':row.name};
    }
    return row;
  }
  return async function operations(req,res,url,user){
    if(url.pathname==='/api/content'&&req.method==='GET'){
      send(res,200,{items:records('content').filter(r=>r.status==='published'&&!r.archived_at&&(!r.scheduledAt||Date.parse(r.scheduledAt)<=Date.now())).map(r=>({id:r.id,title:r.name,type:r.type,body:r.body||''}))});return true;
    }
    if(!url.pathname.startsWith('/api/admin/'))return false;
    if(!url.pathname.startsWith('/api/admin/operations')){
      if(user?.role==='admin'){
        const segment=url.pathname.split('/')[3];
        const mapped=segment==='vehicles'?'approvals':segment==='dealers'?'approvals':segment==='reports'||segment==='enquiries'?'moderation':segment==='users'?'users':'overview';
        if(!permitted(user,mapped,req.method==='GET'?'view':'edit')){fail(res,403,'Your staff role cannot perform this action.');return true;}
        const grant=records('memberships').find(m=>m.userId===user.id&&m.adminRole&&!m.archived_at&&m.status==='active');
        if(grant?.organization){fail(res,403,'Organization-scoped staff cannot use workspace-wide review endpoints.');return true;}
      }
      return false;
    }
    const answer=(status,payload)=>{send(res,status,payload);return true;};
    const reject=(status,message)=>{fail(res,status,message);return true;};
    if(!user||user.role!=='admin')return reject(403,'Administrator access is required.');
    const [,module='overview',recordId,action]=url.pathname.slice('/api/admin/operations'.length).split('/');
    if(['plans','subscriptions','invoices','payments','discounts'].includes(module)){send(res,410,{error:'Auto Connect collects seller listing fees only. Open Seller listing fees.'});return true;}
    if(!['GET','POST','PATCH'].includes(req.method))return reject(405,'Method not allowed.');
    const verb=req.method==='GET'?'view':action==='export'?'export':req.method==='POST'&&!recordId?'create':'edit';
    if(!permitted(user,module==='enquiries'?'moderation':module,verb))return reject(403,`Your role cannot ${verb} ${module}.`);
    if(req.method!=='GET'&&!requireCsrf(req,res,user))return true;
    if(module==='overview'&&req.method==='GET'){
      const grant=records('memberships').find(m=>m.userId===user.id&&m.adminRole&&!m.archived_at&&m.status==='active');
      if(grant?.organization)return reject(403,'Workspace-wide analytics are restricted to workspace-scoped staff. Open your scoped record collection instead.');
      return answer(200,overview(url));
    }
    if(module==='profile'&&recordId&&req.method==='GET'){
      const target=users().find(u=>u.id===recordId);if(!target)return reject(404,'Account not found.');
      if(!scoped(user,[target]).length)return reject(403,'This account is outside your organization scope.');
      log(user,'support.preview','user',recordId,{mode:'read-only'});
      return answer(200,{user:protectUserFields(user,target),activity:all('SELECT action,subject_type,created_at FROM audit_logs WHERE subject_id=? OR actor_id=? ORDER BY created_at DESC LIMIT 40',recordId,recordId),tickets:records('tickets').filter(t=>t.userId===recordId),subscriptions:records('subscriptions').filter(t=>t.userId===recordId),note:'Read-only support preview. No user session is created.'});
    }
    if(req.method==='GET'){
      if(!kinds.has(module)&&!['users','listings','approvals','moderation','enquiries','audit','sessions','payments'].includes(module))return reject(404,'Unknown collection.');
      let rows=scoped(user,getRows(module));
      if(module==='users')rows=rows.map(row=>protectUserFields(user,row));
      if(recordId){const row=rows.find(r=>String(r.id)===recordId);if(!row)return reject(404,'Record not found.');return answer(200,{item:row,history:all('SELECT id,snapshot_json,actor_id,created_at FROM operations_versions WHERE record_id=? ORDER BY created_at DESC',recordId).map(v=>({...v,snapshot:JSON.parse(v.snapshot_json)}))});}
      return answer(200,{items:rows});
    }
    const b=await body(req);
    if(!b||typeof b!=='object'||Array.isArray(b))return reject(400,'Send a JSON object.');
    const actorGrant=records('memberships').find(m=>m.userId===user.id&&m.adminRole&&!m.archived_at&&m.status==='active');
    if(actorGrant?.organization&&kinds.has(module)){
      if(b.organization&&b.organization!==actorGrant.organization)return reject(403,'You cannot move records outside your organization scope.');
      b.organization=actorGrant.organization;
    }
    if(action==='export'){
      if(!kinds.has(module)&&!['users','listings','approvals','moderation','enquiries','audit','sessions','payments'].includes(module))return reject(400,'Unknown collection.');
      log(user,`${module}.export`,module,'collection');return answer(200,{ok:true});
    }
    if(module==='enquiries'&&recordId){
      const current=one('SELECT e.*,v.year,v.make,v.model FROM enquiries e JOIN vehicles v ON v.id=e.vehicle_id WHERE e.id=?',recordId);
      if(!current)return reject(404,'Enquiry not found.');
      const nextMsg=b.message!==undefined?String(b.message).trim().slice(0,2000):current.message;
      if(nextMsg.length<2)return reject(400,'Enquiry message must be at least 2 characters.');
      const notes=b.adminNotes!==undefined?String(b.adminNotes).trim().slice(0,1000):(b.reason!==undefined?String(b.reason).trim().slice(0,1000):current.admin_notes||'');
      if(action==='reject'){
        db.prepare("UPDATE enquiries SET message=?,admin_status='rejected',forwarded_to_seller=0,admin_notes=?,reviewed_by=? WHERE id=?").run(nextMsg,notes,user.id,recordId);
        log(user,'enquiry.reject','enquiry',recordId,{notes});
        return answer(200,{id:recordId,status:'rejected',adminStatus:'rejected',forwardedToSeller:false});
      }
      const now=stamp();
      db.prepare("UPDATE enquiries SET message=?,admin_status='forwarded',forwarded_to_seller=1,admin_notes=?,reviewed_by=?,forwarded_at=? WHERE id=?").run(nextMsg,notes,user.id,now,recordId);
      if(current.dealer_id&&!current.forwarded_to_seller){
        db.prepare('INSERT INTO notifications(id,user_id,kind,body,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),current.dealer_id,'enquiry',`New enquiry for ${current.year} ${current.make} ${current.model}.`,now);
      }
      log(user,'enquiry.forward','enquiry',recordId,{edited:nextMsg!==current.original_message,notes});
      return answer(200,{id:recordId,status:'forwarded',adminStatus:'forwarded',forwardedToSeller:true,message:nextMsg});
    }
    if(module==='users'&&recordId){
      const target=users().find(u=>u.id===recordId);if(!target||!scoped(user,[target]).length)return reject(404,'Account not found.');
      if(target.role==='admin')return reject(409,'Administrator credentials and ownership must be managed outside this console.');
      if(!['suspend','restore','deactivate','delete','revoke-sessions','verify','reset-verification'].includes(action))return reject(400,'Unknown account action.');
      if(!String(b.reason||'').trim())return reject(400,'A reason is required for account actions.');
      if(['suspend','deactivate','delete'].includes(action)){db.prepare('UPDATE users SET status=? WHERE id=?').run(action==='suspend'?'suspended':'deleted',recordId);db.prepare('DELETE FROM sessions WHERE user_id=?').run(recordId);}
      if(action==='restore')db.prepare("UPDATE users SET status='active' WHERE id=?").run(recordId);
      if(action==='revoke-sessions')db.prepare('DELETE FROM sessions WHERE user_id=?').run(recordId);
      if(['verify','reset-verification'].includes(action))db.prepare('UPDATE users SET email_verified=? WHERE id=?').run(action==='verify'?1:0,recordId);
      log(user,`user.${action}`,'user',recordId,{reason:b.reason,previousStatus:target.status});return answer(200,{ok:true});
    }
    if(module==='sessions'&&recordId&&action==='revoke'){
      const row=getRows('sessions').find(r=>String(r.id)===recordId);if(!row)return reject(404,'Session not found.');
      const target=users().find(u=>u.id===row.user_id);if(!target||!scoped(user,[target]).length)return reject(403,'This session is outside your organization scope.');
      if(row.user_id===user.id)return reject(409,'Use Sign out to end your own session.');
      db.prepare('DELETE FROM sessions WHERE rowid=?').run(Number(recordId));log(user,'session.revoke','user',row.user_id);return answer(200,{ok:true});
    }
    if(module==='listings'&&recordId){
      const current=one('SELECT * FROM vehicles WHERE id=?',recordId);if(!current)return reject(404,'Listing not found.');
      if(actorGrant?.organization){
        const owner=users().find(u=>u.id===current.dealer_id);if(!owner||owner.organization!==actorGrant.organization)return reject(403,'This listing is outside your organization scope.');
      }
      if(!['archive','restore','edit','duplicate'].includes(action))return reject(400,'Use the approval queue to approve or reject listings.');
      if(action==='duplicate'){
        const copy={...current,id:randomUUID(),status:'draft',deleted_at:null,created_at:stamp(),updated_at:stamp()};
        const columns=Object.keys(copy);db.prepare(`INSERT INTO vehicles (${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...columns.map(c=>copy[c]));
        log(user,'listing.duplicate','vehicle',copy.id,{source:recordId});return answer(201,{id:copy.id});
      }
      if(action==='archive')db.prepare('UPDATE vehicles SET deleted_at=?,updated_at=? WHERE id=?').run(stamp(),stamp(),recordId);
      if(action==='restore')db.prepare("UPDATE vehicles SET deleted_at=NULL,status='pending',updated_at=? WHERE id=?").run(stamp(),recordId);
      if(action==='edit'){
        const amount=Number(b.price);if(!Number.isFinite(amount)||amount<0||!String(b.make||'').trim()||!String(b.model||'').trim())return reject(400,'Supply a make, model and valid price.');
        db.prepare("UPDATE vehicles SET make=?,model=?,price_minor=?,city=?,status='pending',updated_at=? WHERE id=?").run(String(b.make).slice(0,80),String(b.model).slice(0,80),Math.round(amount*100),String(b.city||'').slice(0,100),stamp(),recordId);
      }
      log(user,`listing.${action}`,'vehicle',recordId,{reason:b.reason||'Admin update'});return answer(200,{ok:true});
    }
    if(module==='listings'&&!recordId&&req.method==='POST'){
      const year=Number(b.year),price=Number(b.price);
      if(!b.make||!b.model||!Number.isInteger(year)||year<1900||year>2100||!Number.isFinite(price)||price<0)return reject(400,'Supply a make, model, valid year and non-negative asking price.');
      if(!one('SELECT user_id FROM dealer_profiles WHERE user_id=?',b.dealer_id))return reject(400,'Select an existing seller account ID.');
      const key=randomUUID();db.prepare("INSERT INTO vehicles(id,dealer_id,make,model,year,price_minor,currency,city,status) VALUES(?,?,?,?,?,?,?,?,'draft')").run(key,b.dealer_id,String(b.make).slice(0,80),String(b.model).slice(0,80),year,Math.round(price*100),['GHS','USD'].includes(b.currency)?b.currency:'GHS',String(b.city||'').slice(0,100));
      log(user,'listing.create','vehicle',key);return answer(201,{id:key});
    }
    if(module==='audit'&&action==='export'){log(user,'audit.export','audit','all');return answer(200,{ok:true});}
    if(!kinds.has(module))return reject(400,'This collection cannot be edited here.');
    if(action==='export'){log(user,`${module}.export`,module,'collection');return answer(200,{ok:true});}
    if(action==='import-preview'||action==='import'){
      if(['memberships','roles','service-accounts'].includes(module))return reject(400,'Create access-control records individually so permissions can be validated.');
      if(!Array.isArray(b.items)||b.items.length>500)return reject(400,'Import up to 500 JSON records.');
      const errors=b.items.flatMap((row,i)=>!row||typeof row.name!=='string'||!row.name.trim()?[{row:i+1,error:'A name is required.'}]:[]);
      if(action==='import-preview'||errors.length)return answer(200,{valid:errors.length===0,rows:b.items.length,errors,preview:b.items.slice(0,5)});
      db.exec('BEGIN');try{for(const row of b.items){const key=randomUUID(),now=stamp();db.prepare('INSERT INTO operations_records(id,kind,name,status,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(key,module,row.name.slice(0,200),'draft',JSON.stringify(row),now,now);}log(user,`${module}.import`,module,'collection',{count:b.items.length});db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return answer(200,{imported:b.items.length});
    }
    let current=recordId?one('SELECT * FROM operations_records WHERE kind=? AND id=?',module,recordId):null;
    if(recordId&&!current)return reject(404,'Record not found.');
    if(current&&!scoped(user,[unpack(current)]).length)return reject(403,'Record is outside your organization scope.');
    const prior=current?unpack(current):{};
    let value={...prior,...b};
    if(action==='rollback'){
      const version=one('SELECT snapshot_json FROM operations_versions WHERE id=? AND record_id=?',b.versionId,recordId);if(!version)return reject(404,'Version not found.');value=JSON.parse(version.snapshot_json);
    }
    if(action==='duplicate'){value={...prior,name:prior.name+' copy',status:'draft'};current=null;}
    if(!String(value.name||'').trim())return reject(400,'A name is required.');
    for(const key of ['price','amount','percent','rollout','trialDays']){
      if(value[key]!==undefined&&value[key]!==''&&(!Number.isFinite(Number(value[key]))||Number(value[key])<0||(['percent','rollout'].includes(key)&&Number(value[key])>100)))return reject(400,`Supply a valid non-negative ${key}${['percent','rollout'].includes(key)?' from 0 to 100':''}.`);
    }
    if(value.userId&&!one('SELECT id FROM users WHERE id=?',value.userId))return reject(400,'Account ID does not match an existing user.');
    if(module==='memberships'&&value.adminRole){
      const target=one('SELECT role FROM users WHERE id=?',value.userId);if(!target||target.role!=='admin')return reject(400,'Staff role assignments require an existing administrator account.');
      if(value.userId===user.id)return reject(409,'You cannot change your own administrative access.');
    }
    if(module==='webhooks'&&value.endpoint&&!/^https:\/\//.test(value.endpoint))return reject(400,'Webhook destinations must use HTTPS.');
    if(module==='settings'&&value.timezone){try{new Intl.DateTimeFormat('en',{timeZone:value.timezone});}catch{return reject(400,'Use a valid IANA time zone.');}}
    if(module==='roles'&&String(value.permissions||'').length>4000)return reject(400,'Permissions are too long.');
    const key=current?.id||randomUUID(),now=stamp(),archived=action==='archive'?now:action==='restore'?null:current?.archived_at||null;
    const status=action==='publish'?'published':action==='resolve'?'resolved':action==='retry'?'queued':value.status||'draft';
    // Scheduling and provider configurations are stored, never falsely marked delivered/executed.
    if(current)db.prepare('INSERT INTO operations_versions VALUES(?,?,?,?,?)').run(randomUUID(),key,JSON.stringify(prior),user.id,now);
    const payload=JSON.stringify(value);if(payload.length>100000)return reject(400,'Record is too large.');
    db.prepare('INSERT INTO operations_records(id,kind,name,status,payload_json,created_at,updated_at,archived_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,status=excluded.status,payload_json=excluded.payload_json,updated_at=excluded.updated_at,archived_at=excluded.archived_at').run(key,module,String(value.name).trim().slice(0,200),status,payload,current?.created_at||now,now,archived);
    log(user,`${module}.${action|| (current?'update':'create')}`,module,key,{name:value.name,status,reason:b.reason||''});
    return answer(current?200:201,{item:unpack(one('SELECT * FROM operations_records WHERE id=?',key))});
  };
}
