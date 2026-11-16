import {listingFee} from '../listing-billing.mjs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = 4187 + Math.floor(Math.random() * 400);
const origin = `http://127.0.0.1:${port}`;
let temp, server;

async function request(path, { method='GET', body, cookie, csrf, originHeader=origin }={}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  if (csrf) headers['x-csrf-token'] = csrf;
  if (originHeader) headers.origin = originHeader;
  const response = await fetch(`${origin}${path}`, { method, headers, body:body===undefined?undefined:JSON.stringify(body) });
  const data = await response.json().catch(()=>({}));
  const setCookie = response.headers.getSetCookie?.()[0] || response.headers.get('set-cookie') || '';
  return { response, data, cookie:setCookie.split(';')[0] };
}

async function signUp(email, role='buyer', extra={}) {
  const details = role==='dealer' ? { businessName:'Northline Motors', city:'Accra', country:'Ghana', phone:'+233 24 123 4567', whatsapp:'+233 24 123 4567', region:'Greater Accra' } : {};
  const result = await request('/api/auth/register',{method:'POST',body:{email,password:'a-long-test-password-123',role,...details,...extra}});
  return {...result,csrf:result.data.csrfToken};
}

test('marketplace API supports safe buyer, dealer and admin flows', async t => {
  temp = await mkdtemp(join(tmpdir(),'apex-market-'));
  server = spawn(process.execPath,[join(root,'server.mjs')],{
    cwd:root,stdio:['ignore','pipe','pipe'],
    env:{...process.env,HOST:'127.0.0.1',PORT:String(port),PUBLIC_ORIGIN:origin,DATABASE_PATH:join(temp,'test.sqlite'),
      APEX_ADMIN_EMAIL:'admin@example.test',APEX_ADMIN_PASSWORD:'admin-password-long-12345',NODE_ENV:'test'}
  });
  let startup=''; server.stdout.on('data',chunk=>startup+=chunk); server.stderr.on('data',chunk=>startup+=chunk);
  t.after(async()=>{
    if(server&&!server.killed) {
      await new Promise(resolve=>{ server.once('exit',resolve); server.kill(); setTimeout(resolve,1500).unref(); });
    }
    await rm(temp,{recursive:true,force:true});
  });
  let ready=false;
  for(let i=0;i<80;i++) { try { if((await fetch(`${origin}/api/health`)).ok){ready=true;break;} } catch {} await new Promise(r=>setTimeout(r,100)); }
  assert.equal(ready,true,`server failed to start: ${startup}`);

  const health=await request('/api/health'); assert.equal(health.data.database,'connected');
  const listings=await request('/api/listings?make=Porsche&maxMileage=15000');
  assert.equal(listings.data.total,2); assert.ok(listings.data.items.every(v=>v.make==='Porsche'&&v.mileage<=15000));
  assert.equal('dealer_id' in listings.data.items[0],false);assert.equal('vin' in listings.data.items[0],false);
  const sorted=await request('/api/listings?minPrice=2600000&maxPrice=3000000&sort=priceAsc');
  assert.equal(sorted.data.total,2);assert.ok(sorted.data.items[0].price<=sorted.data.items[1].price);
  assert.equal((await request('/api/listings?location=Accra')).data.items[0].city,'Accra');
  const combined=await request('/api/listings?make=Porsche&minYear=2024&maxYear=2024&bodyType=Sedan&drivetrain=AWD');
  assert.equal(combined.data.total,1);assert.equal(combined.data.items[0].id,'demo-taycan');
  const demoDetail=await request('/api/listings/demo-taycan');assert.equal(demoDetail.data.vehicle.price_context.label,'Insufficient market data');assert.equal(demoDetail.data.vehicle.price_context.comparableCount,0);
  assert.equal((await request('/api/listings?minYear=2024&maxYear=2020')).data.total,0);
  assert.equal((await request('/api/listings?color=Green&drivetrain=RWD')).data.items[0].id,'demo-bmw-m4');
  assert.equal((await request('/api/listings?seller=private')).data.total,0);
  assert.ok((await request('/api/listings')).data.items.every(v=>v.currency==='GHS'&&v.country==='Ghana'));
  assert.equal((await request('/api/admin/dashboard')).response.status,401);

  const buyer=await signUp('buyer@example.test');
  assert.equal(buyer.response.status,201); assert.match(buyer.cookie,/apex_session=/);
  assert.equal((await request('/api/buyer/profile',{cookie:buyer.cookie})).data.profile.display_name,'');
  assert.equal((await request('/api/buyer/profile',{method:'PUT',cookie:buyer.cookie,body:{displayName:'Buyer Name'}})).response.status,403);
  assert.equal((await request('/api/buyer/profile',{method:'PUT',cookie:buyer.cookie,csrf:buyer.csrf,body:{displayName:'Buyer Name',phone:'+233 24 123 4567'}})).response.status,200);
  assert.equal((await request('/api/buyer/profile',{cookie:buyer.cookie})).data.profile.phone,'+233 24 123 4567');
  assert.equal((await request('/api/auth/password',{method:'POST',cookie:buyer.cookie,csrf:buyer.csrf,body:{currentPassword:'wrong-password',newPassword:'a-new-test-password-456'}})).response.status,401);
  const oldBuyerCookie=buyer.cookie;const passwordChanged=await request('/api/auth/password',{method:'POST',cookie:buyer.cookie,csrf:buyer.csrf,body:{currentPassword:'a-long-test-password-123',newPassword:'a-new-test-password-456'}});
  assert.equal(passwordChanged.response.status,200);buyer.cookie=passwordChanged.cookie;buyer.csrf=passwordChanged.data.csrfToken;
  assert.equal((await request('/api/auth/me',{cookie:oldBuyerCookie})).data.user,null);
  assert.equal((await request('/api/auth/login',{method:'POST',body:{email:'buyer@example.test',password:'a-long-test-password-123'}})).response.status,401);
  assert.equal((await request('/api/auth/login',{method:'POST',body:{email:'buyer@example.test',password:'a-new-test-password-456'}})).response.status,200);
  assert.equal((await request('/api/notifications')).response.status,401);
  assert.equal((await request('/api/notifications',{cookie:buyer.cookie})).data.unreadCount,0);
  assert.equal((await request('/api/buyer/recently-viewed')).response.status,401);
  assert.equal((await request('/api/buyer/recently-viewed/demo-porsche-911',{method:'POST',cookie:buyer.cookie})).response.status,403);
  assert.equal((await request('/api/buyer/recently-viewed/demo-porsche-911',{method:'POST',cookie:buyer.cookie,csrf:buyer.csrf})).response.status,200);
  assert.equal((await request('/api/buyer/recently-viewed',{cookie:buyer.cookie})).data.items[0].id,'demo-porsche-911');
  assert.equal((await request('/api/favourites/demo-porsche-911',{method:'PUT',cookie:buyer.cookie})).response.status,403);
  assert.equal((await request('/api/favourites/demo-porsche-911',{method:'PUT',cookie:buyer.cookie,csrf:buyer.csrf})).response.status,200);
  assert.equal((await request('/api/favourites',{cookie:buyer.cookie})).data.items.length,1);
  const report=await request('/api/reports',{method:'POST',cookie:buyer.cookie,csrf:buyer.csrf,body:{vehicleId:'demo-porsche-911',reason:'Incorrect vehicle details',details:'Please confirm the listed mileage.'}});
  assert.equal(report.response.status,201);
  const saved=await request('/api/saved-searches',{method:'POST',cookie:buyer.cookie,csrf:buyer.csrf,body:{label:'Porsche',search:{make:'Porsche'}}});
  assert.equal(saved.response.status,201);
  assert.equal((await request('/api/saved-searches',{cookie:buyer.cookie})).data.items[0].label,'Porsche');
  assert.equal((await request(`/api/saved-searches/${saved.data.id}`,{method:'DELETE',cookie:buyer.cookie})).response.status,403);
  assert.equal((await request(`/api/saved-searches/${saved.data.id}`,{method:'DELETE',cookie:buyer.cookie,csrf:buyer.csrf})).response.status,200);
  assert.equal((await request('/api/saved-searches',{cookie:buyer.cookie})).data.items.length,0);
  const enquiry=await request('/api/enquiries',{method:'POST',cookie:buyer.cookie,csrf:buyer.csrf,body:{vehicleId:'demo-porsche-911',message:'Please share the complete service history.'}});
  assert.equal(enquiry.response.status,201); assert.match(enquiry.data.notice,/Email delivery is not configured/);
  assert.equal((await request('/api/shipping-estimates',{method:'POST',body:{origin:'Los Angeles',destination:'Auckland',vehicleType:'SUV',method:'RoRo'}})).data.officialDutyAvailable,false);
  assert.equal((await request('/api/shipping-estimates',{method:'POST',body:{origin:'Los Angeles',destination:'Auckland',vehicleType:'SUV'},originHeader:'https://bad.example'})).response.status,403);

  const dealer=await signUp('dealer@example.test','dealer');
  assert.equal(dealer.response.status,201);
  const privateSeller=await signUp('private-seller@example.test','dealer',{sellerType:'private',fullName:'Kwame Seller'});
  assert.equal(privateSeller.response.status,201);
  assert.equal((await request('/api/dealer/dashboard',{cookie:privateSeller.cookie})).data.profile.seller_type,'private');
  const draft=await request('/api/dealer/drafts',{method:'POST',cookie:dealer.cookie,csrf:dealer.csrf,body:{payload:{make:'Draft',model:'Resume test',vin:'PRIVATE-CHASSIS'},images:[]}});
  assert.equal(draft.response.status,201);
  assert.equal((await request('/api/dealer/dashboard',{cookie:dealer.cookie})).data.drafts[0].payload.model,'Resume test');
  assert.equal((await request(`/api/dealer/drafts/${draft.data.id}`,{cookie:buyer.cookie})).response.status,403);
  assert.equal((await request(`/api/dealer/drafts/${draft.data.id}`,{cookie:dealer.cookie})).data.payload.vin,'PRIVATE-CHASSIS');
  assert.equal((await request(`/api/dealer/drafts/${draft.data.id}`,{method:'DELETE',cookie:dealer.cookie,csrf:dealer.csrf})).response.status,200);
  const testPng='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx0UAAAAASUVORK5CYII=';
  const submitted=await request('/api/dealer/vehicles',{method:'POST',cookie:dealer.cookie,csrf:dealer.csrf,body:{make:'Volvo',model:'V60',year:2022,price:420000,mileage:18000,city:'Accra',bodyType:'Wagon',engineCc:1969,importStatus:'Foreign used',color:'Silver',drivetrain:'AWD',images:[{type:'image/png',data:testPng}]}});
  assert.equal(submitted.response.status,201); assert.equal(submitted.data.status,'pending');
  assert.equal((await request('/api/dealer/vehicles',{method:'POST',cookie:dealer.cookie,csrf:dealer.csrf,body:{make:'Bad',model:'Upload',year:2022,price:420000,mileage:18000,city:'Accra',images:[{type:'image/jpeg',data:testPng}]}})).response.status,400);
  const privateImages=(await request('/api/dealer/dashboard',{cookie:dealer.cookie})).data.vehicles.find(v=>v.id===submitted.data.id).images;
  assert.equal(privateImages.length,1);const mediaUrl=privateImages[0].url;
  assert.equal((await request(mediaUrl)).response.status,404);
  const ownerMedia=await request(mediaUrl,{cookie:dealer.cookie});assert.equal(ownerMedia.response.status,200);assert.equal(ownerMedia.response.headers.get('content-type'),'image/png');
  const rejectedSubmission=await request('/api/dealer/vehicles',{method:'POST',cookie:dealer.cookie,csrf:dealer.csrf,body:{make:'Volvo',model:'XC60',year:2021,price:385000,mileage:24000,city:'Accra',images:[{type:'image/png',data:testPng}]}});
  assert.equal(rejectedSubmission.response.status,201);
  assert.equal((await request('/api/dealer/dashboard',{cookie:dealer.cookie})).data.vehicles[0].currency,'GHS');

  const admin=await request('/api/auth/login',{method:'POST',body:{email:'admin@example.test',password:'admin-password-long-12345'}});
  assert.equal(admin.response.status,200);
  const dash=await request('/api/admin/dashboard',{cookie:admin.cookie}); assert.equal(dash.response.status,200);
  assert.ok(dash.data.pendingVehicles.some(v=>v.id===submitted.data.id));
  assert.ok(dash.data.pendingDealers.some(d=>d.id===dealer.data.user.id));
  assert.ok(dash.data.counts.totalUsers>=2);assert.ok(dash.data.users.some(u=>u.id===buyer.data.user.id));
  const reportReview=await request(`/api/admin/reports/${report.data.id}/review`,{method:'POST',cookie:admin.cookie,csrf:admin.data.csrfToken});assert.equal(reportReview.response.status,200);
  assert.equal((await request('/api/admin/dashboard',{cookie:admin.cookie})).data.reports[0].status,'reviewing');
  const reportResolved=await request(`/api/admin/reports/${report.data.id}/resolve`,{method:'POST',cookie:admin.cookie,csrf:admin.data.csrfToken});assert.equal(reportResolved.response.status,200);
  const dealerApproved=await request(`/api/admin/dealers/${dealer.data.user.id}/approve`,{method:'POST',cookie:admin.cookie,csrf:admin.data.csrfToken});
  assert.equal(dealerApproved.response.status,200);
  const sellerReport=await request('/api/reports',{method:'POST',cookie:buyer.cookie,csrf:buyer.csrf,body:{sellerId:dealer.data.user.id,reason:'Misleading business information',details:'QA seller report.'}});
  assert.equal(sellerReport.response.status,201);
  assert.equal((await request('/api/admin/dashboard',{cookie:admin.cookie})).data.reports.some(r=>r.id===sellerReport.data.id&&r.seller_name==='Northline Motors'),true);
  assert.match((await request('/api/notifications',{cookie:dealer.cookie})).data.items[0].body,/dealer profile has been approved/i);
  const rejected=await request(`/api/admin/vehicles/${rejectedSubmission.data.id}/reject`,{method:'POST',cookie:admin.cookie,csrf:admin.data.csrfToken});assert.equal(rejected.response.status,200);
  assert.match((await request('/api/notifications',{cookie:dealer.cookie})).data.items[0].body,/needs changes/i);
  const unpaid=await request(`/api/admin/vehicles/${submitted.data.id}/approve`,{method:'POST',cookie:admin.cookie,csrf:admin.data.csrfToken});assert.equal(unpaid.response.status,402);
  const recordTestFee=vehicleId=>{const fixture=new DatabaseSync(join(temp,'test.sqlite'));const v=fixture.prepare('SELECT dealer_id,price_minor,currency FROM vehicles WHERE id=?').get(vehicleId);fixture.prepare("INSERT INTO listing_fee_payments(reference,seller_id,vehicle_id,amount_minor,currency,status,created_at) VALUES(?,?,?,?,?,'paid',?)").run('fixture_'+vehicleId,v.dealer_id,vehicleId,listingFee(v.price_minor,v.currency),'GHS',new Date().toISOString());fixture.close();};
  recordTestFee(submitted.data.id);
  const approved=await request(`/api/admin/vehicles/${submitted.data.id}/approve`,{method:'POST',cookie:admin.cookie,csrf:admin.data.csrfToken});
  assert.equal(approved.response.status,200);
  assert.equal((await request(mediaUrl)).response.status,200);
  assert.match((await request('/api/notifications',{cookie:dealer.cookie})).data.items[0].body,/listing is approved/i);
  const publicListings=await request('/api/listings?q=Volvo'); assert.equal(publicListings.data.total,1);
  const detailedSearch=await request('/api/listings?model=V60&minYear=2020&maxYear=2024&minPrice=400000&maxPrice=450000&bodyType=Wagon&engineCc=1800&importStatus=Foreign%20used&color=Silver&seller=dealer');
  assert.equal(detailedSearch.data.total,1);assert.equal(detailedSearch.data.items[0].engine_cc,1969);
  const updateBody={make:'Volvo',model:'V60 Cross Country',trim:'B5',year:2022,price:430000,mileage:17500,city:'Kumasi',country:'US',fuel:'Hybrid',transmission:'Automatic',description:'Updated dealer description.'};
  const edited=await request(`/api/dealer/vehicles/${submitted.data.id}`,{method:'PUT',cookie:dealer.cookie,csrf:dealer.csrf,body:updateBody});
  assert.equal(edited.response.status,200);assert.equal(edited.data.status,'pending');
  assert.equal((await request('/api/listings?q=Volvo')).data.total,0);
  const reapproved=await request(`/api/admin/vehicles/${submitted.data.id}/approve`,{method:'POST',cookie:admin.cookie,csrf:admin.data.csrfToken});assert.equal(reapproved.response.status,200);
  const localizedListing=(await request('/api/listings?q=Volvo')).data.items[0];assert.equal(localizedListing.currency,'GHS');assert.equal(localizedListing.country,'Ghana');assert.equal(localizedListing.city,'Kumasi');
  const sellerPage=await request(`/api/sellers/${dealer.data.user.id}`);assert.equal(sellerPage.response.status,200);assert.equal(sellerPage.data.profile.phone,'');assert.equal(sellerPage.data.profile.whatsapp,'');assert.equal('email' in sellerPage.data.profile,false);
  const profileUpdate=await request('/api/dealer/profile',{method:'PUT',cookie:dealer.cookie,csrf:dealer.csrf,body:{businessName:'Northline Motors',city:'Accra',region:'Greater Accra',contactEmail:'dealer@example.test',phone:'+233 24 123 4567',whatsapp:'+233 24 123 4567',publicPhone:true,publicWhatsapp:true,businessAddress:'Private residential address'}});assert.equal(profileUpdate.response.status,200);
  const sellerContact=await request(`/api/sellers/${dealer.data.user.id}`);assert.equal(sellerContact.data.profile.phone,'');assert.equal(sellerContact.data.profile.whatsapp,'');assert.equal(sellerContact.data.profile.website,'');assert.equal('businessAddress' in sellerContact.data.profile,false);assert.equal('registrationNumber' in sellerContact.data.profile,false);assert.equal('email' in sellerContact.data.profile,false);
  await request(`/api/listings/${submitted.data.id}`);
  const dealerStats=(await request('/api/dealer/dashboard',{cookie:dealer.cookie})).data;assert.equal(dealerStats.stats.totalViews,1);assert.equal(dealerStats.vehicles.find(v=>v.id===submitted.data.id).views,1);
  for(let i=0;i<12;i++){
    const pageVehicle=await request('/api/dealer/vehicles',{method:'POST',cookie:dealer.cookie,csrf:dealer.csrf,body:{make:'Volvo',model:`V${70+i}`,year:2020+i%5,price:420000+i*1000,mileage:20000+i*100,city:'Accra',images:[{type:'image/png',data:testPng}]}});
    assert.equal(pageVehicle.response.status,201);
    recordTestFee(pageVehicle.data.id);
    const pageApproved=await request(`/api/admin/vehicles/${pageVehicle.data.id}/approve`,{method:'POST',cookie:admin.cookie,csrf:admin.data.csrfToken});assert.equal(pageApproved.response.status,200);
  }
  const firstPage=await request('/api/listings?make=Volvo&minPrice=400000&maxPrice=450000&page=1');assert.equal(firstPage.data.total,13);assert.equal(firstPage.data.pages,2);assert.equal(firstPage.data.items.length,12);
  const secondPage=await request('/api/listings?make=Volvo&minPrice=400000&maxPrice=450000&page=2');assert.equal(secondPage.data.total,13);assert.equal(secondPage.data.page,2);assert.equal(secondPage.data.items.length,1);assert.ok(secondPage.data.items.every(v=>v.make==='Volvo'));
  const listedEnquiry=await request('/api/enquiries',{method:'POST',cookie:buyer.cookie,csrf:buyer.csrf,body:{vehicleId:submitted.data.id,message:'Could you share the service history and inspection details?'}});assert.equal(listedEnquiry.response.status,201);assert.equal(listedEnquiry.data.adminStatus,'pending_admin');
  const threadPath=`/api/enquiries/${listedEnquiry.data.id}/messages`;
  assert.equal((await request(threadPath,{cookie:dealer.cookie})).response.status,404);
  assert.equal((await request('/api/dealer/enquiries',{cookie:dealer.cookie})).data.items.some(e=>e.id===listedEnquiry.data.id),false);
  assert.equal((await request('/api/notifications',{cookie:dealer.cookie})).data.items.some(n=>/New enquiry/i.test(n.body)),false);
  const adminForwarded=await request(`/api/admin/enquiries/${listedEnquiry.data.id}/forward`,{method:'POST',cookie:admin.cookie,csrf:admin.data.csrfToken,body:{message:'Reviewed by Admin: Could you share the service history and inspection details?',adminNotes:'Verified buyer enquiry'}});
  assert.equal(adminForwarded.response.status,200);assert.equal(adminForwarded.data.adminStatus,'forwarded');
  assert.ok((await request('/api/notifications',{cookie:dealer.cookie})).data.items.some(n=>/New enquiry/i.test(n.body)));
  const buyerHistory=await request('/api/buyer/enquiries',{cookie:buyer.cookie});assert.equal(buyerHistory.data.items.length,2);
  assert.equal((await request(threadPath,{cookie:buyer.cookie})).data.items.length,1);
  const buyerFollowup=await request(threadPath,{method:'POST',cookie:buyer.cookie,csrf:buyer.csrf,body:{message:'Please include the service dates.'}});assert.equal(buyerFollowup.response.status,201);
  assert.equal((await request(threadPath,{cookie:dealer.cookie})).data.items.length,2);
  const dealerReply=await request(threadPath,{method:'POST',cookie:dealer.cookie,csrf:dealer.csrf,body:{message:'We will share the service records before any viewing.'}});assert.equal(dealerReply.response.status,201);assert.equal(dealerReply.data.status,'replied');
  const buyerNotifications=await request('/api/notifications',{cookie:buyer.cookie});assert.match(buyerNotifications.data.items[0].body,/New reply/i);assert.equal(buyerNotifications.data.unreadCount,1);
  assert.equal((await request(`/api/notifications/${buyerNotifications.data.items[0].id}/read`,{method:'PATCH',cookie:buyer.cookie})).response.status,403);
  assert.equal((await request(`/api/notifications/${buyerNotifications.data.items[0].id}/read`,{method:'PATCH',cookie:buyer.cookie,csrf:buyer.csrf})).response.status,200);
  assert.equal((await request('/api/notifications',{cookie:buyer.cookie})).data.unreadCount,0);
  assert.equal((await request(threadPath,{cookie:buyer.cookie})).data.items.length,3);
  const paused=await request(`/api/dealer/vehicles/${submitted.data.id}/status`,{method:'PATCH',cookie:dealer.cookie,csrf:dealer.csrf,body:{status:'paused'}});
  assert.equal(paused.response.status,200);assert.equal((await request('/api/listings?q=Volvo')).data.items.some(v=>v.id===submitted.data.id),false);
  const resumed=await request(`/api/dealer/vehicles/${submitted.data.id}/status`,{method:'PATCH',cookie:dealer.cookie,csrf:dealer.csrf,body:{status:'active'}});assert.equal(resumed.response.status,200);
  const sold=await request(`/api/dealer/vehicles/${submitted.data.id}/status`,{method:'PATCH',cookie:dealer.cookie,csrf:dealer.csrf,body:{status:'sold'}});assert.equal(sold.response.status,200);
  const invalidTransition=await request(`/api/dealer/vehicles/${submitted.data.id}/status`,{method:'PATCH',cookie:dealer.cookie,csrf:dealer.csrf,body:{status:'active'}});assert.equal(invalidTransition.response.status,409);
  const soldEdit=await request(`/api/dealer/vehicles/${submitted.data.id}`,{method:'PUT',cookie:dealer.cookie,csrf:dealer.csrf,body:updateBody});assert.equal(soldEdit.response.status,409);
  const dealerProfile=await request('/api/dealer/profile',{method:'PUT',cookie:dealer.cookie,csrf:dealer.csrf,body:{businessName:'Northline Motors',city:'Kumasi',contactEmail:'sales@northline.example',phone:'+233 24 111 2222',website:'https://northline.example',description:'Independent vehicle sales in Ghana.'}});
  assert.equal(dealerProfile.response.status,200);assert.equal(dealerProfile.data.needsReview,true);assert.equal(dealerProfile.data.profile.status,'pending');
  assert.equal((await request('/api/dealer/dashboard',{cookie:dealer.cookie})).data.profile.phone,'+233 24 111 2222');
  assert.equal((await request(`/api/dealer/vehicles/${submitted.data.id}/delete`,{method:'POST',cookie:buyer.cookie,csrf:buyer.csrf})).response.status,403);
  assert.equal((await request(`/api/dealer/vehicles/${submitted.data.id}/delete`,{method:'POST',cookie:dealer.cookie})).response.status,403);
  assert.equal((await request(`/api/dealer/vehicles/${submitted.data.id}/delete`,{method:'POST',cookie:dealer.cookie,csrf:dealer.csrf})).response.status,200);
  assert.equal((await request('/api/listings?q=Volvo')).data.items.some(v=>v.id===submitted.data.id),false);
  assert.ok((await request('/api/dealer/dashboard',{cookie:dealer.cookie})).data.vehicles.find(v=>v.id===submitted.data.id).deleted_at);
  assert.equal((await request(`/api/dealer/vehicles/${submitted.data.id}/restore`,{method:'POST',cookie:dealer.cookie})).response.status,403);
  const restored=await request(`/api/dealer/vehicles/${submitted.data.id}/restore`,{method:'POST',cookie:dealer.cookie,csrf:dealer.csrf});assert.equal(restored.response.status,200);assert.equal(restored.data.status,'pending');
  const photoDeletePath=`/api/dealer/vehicles/${submitted.data.id}/images/${privateImages[0].id}`;
  assert.equal((await request(photoDeletePath,{method:'DELETE',cookie:dealer.cookie})).response.status,403);
  assert.equal((await request(photoDeletePath,{method:'DELETE',cookie:buyer.cookie,csrf:buyer.csrf})).response.status,403);
  assert.equal((await request(photoDeletePath,{method:'DELETE',cookie:dealer.cookie,csrf:dealer.csrf})).response.status,200);
  assert.equal((await request(mediaUrl,{cookie:dealer.cookie})).response.status,404);
  assert.equal((await request(`/api/admin/users/${buyer.data.user.id}/status`,{method:'PATCH',cookie:admin.cookie,body:{status:'suspended'}})).response.status,403);
  const suspended=await request(`/api/admin/users/${buyer.data.user.id}/status`,{method:'PATCH',cookie:admin.cookie,csrf:admin.data.csrfToken,body:{status:'suspended'}});assert.equal(suspended.response.status,200);
  assert.equal((await request('/api/auth/me',{cookie:buyer.cookie})).data.user,null);
  const reactivated=await request(`/api/admin/users/${buyer.data.user.id}/status`,{method:'PATCH',cookie:admin.cookie,csrf:admin.data.csrfToken,body:{status:'active'}});assert.equal(reactivated.response.status,200);
  assert.equal((await request('/api/auth/login',{method:'POST',body:{email:'buyer@example.test',password:'a-new-test-password-456'}})).response.status,200);
});
