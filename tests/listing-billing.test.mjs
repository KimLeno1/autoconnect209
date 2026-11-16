import {createAdminOperations} from '../admin-operations.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import Database from 'better-sqlite3';import {readFileSync} from 'node:fs';import {createHmac} from 'node:crypto';import {createListingBilling,listingFee} from '../listing-billing.mjs';import {initializeDatabase} from '../db.mjs';
test('only verified seller advertising fees unlock a listing; buyer, forged, mismatched and test/live payments stay blocked',async()=>{
 const db=new Database(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));for(const [id,role] of [['seller','dealer'],['other','dealer'],['buyer','buyer']])db.prepare('INSERT INTO users(id,email,password_hash,password_salt,role) VALUES(?,?,?,?,?)').run(id,id+'@example.test','x','x',role);db.prepare("INSERT INTO dealer_profiles(user_id,business_name,contact_email) VALUES('seller','Seller','seller@example.test')").run();db.prepare("INSERT INTO vehicles(id,dealer_id,make,model,year,price,price_minor,currency,location,mileage,status) VALUES('listing','seller','Toyota','Corolla',2022,1000,100000,'GHS','Accra, Ghana',12000,'pending')").run();
 const env={LISTING_PAYMENT_PROVIDER:'paystack',LISTING_FEE_AMOUNT_MINOR:'6000',LISTING_FEE_CURRENCY:'GHS',PAYSTACK_SECRET_KEY:'sk_test_mock',PUBLIC_ORIGIN:'http://localhost'};let reference,providerAmount=6000,providerCurrency='GHS',domain='test',calls=0;
 const handler=createListingBilling({db,env,send:(r,status,data)=>Object.assign(r,{status,data}),body:async r=>r.payload,requireCsrf:(r,s)=>{if(r.csrf)return true;Object.assign(s,{status:403});return false;},adminLog:()=>{},fetchProvider:async(url,o)=>{calls++;if(url.endsWith('/initialize')){const b=JSON.parse(o.body);assert.equal(b.amount,6000);assert.equal(b.currency,'GHS');assert.equal(b.email,'seller@example.test');reference=b.reference;return {ok:true,json:async()=>({status:true,data:{authorization_url:'https://checkout.paystack.com/test'}})};}return {ok:true,json:async()=>({status:true,data:{reference,status:'success',amount:providerAmount,currency:providerCurrency,domain}})};}});
 const seller={id:'seller',role:'dealer',email:'seller@example.test'};
 const call=async(path,method='GET',payload={},user=seller,csrf=true)=>{const res={};await handler({method,payload,csrf,headers:{}},res,new URL('http://localhost/api/listing-billing'+path),user);return res;};
 assert.equal(handler.paid('listing'),false);assert.equal((await call('','GET',{}, {id:'buyer',role:'buyer'})).status,403);assert.equal((await call('/checkout','POST',{listingId:'listing'},seller,false)).status,403);assert.equal((await call('/checkout','POST',{listingId:'listing'}, {...seller,id:'other'})).status,404);
 const started=await call('/checkout','POST',{listingId:'listing',amount:1,status:'paid'});assert.equal(started.status,200);assert.equal(handler.paid('listing'),false);await call('/checkout','POST',{listingId:'listing'});assert.equal(calls,1);
 assert.equal((await call('/verify','POST',{reference}, {...seller,id:'other'})).status,404);providerAmount=1;assert.equal((await call('/verify','POST',{reference})).status,409);assert.equal(handler.paid('listing'),false);providerAmount=6000;providerCurrency='USD';assert.equal((await call('/verify','POST',{reference})).status,409);providerCurrency='GHS';
 const raw=JSON.stringify({event:'charge.success',data:{reference}});let res={};await handler({method:'POST',headers:{'x-paystack-signature':'0'.repeat(128)},async *[Symbol.asyncIterator](){yield raw;}},res,new URL('http://localhost/api/listing-billing/webhook'),null);assert.equal(res.status,400);assert.equal(handler.paid('listing'),false);
 const signature=createHmac('sha512',env.PAYSTACK_SECRET_KEY).update(raw).digest('hex');res={};await handler({method:'POST',headers:{'x-paystack-signature':signature},async *[Symbol.asyncIterator](){yield raw;}},res,new URL('http://localhost/api/listing-billing/webhook'),null);assert.equal(res.status,200);assert.equal(handler.paid('listing'),true);env.NODE_ENV='production';assert.equal(handler.paid('listing'),false);assert.equal((await call('/verify','POST',{reference})).status,409);db.prepare('DELETE FROM listing_fee_payments').run();domain='live';await call('/checkout','POST',{listingId:'listing'});await call('/verify','POST',{reference});assert.equal(handler.paid('listing'),true);
 db.prepare("UPDATE vehicles SET price_minor=110000000 WHERE id='listing'").run();assert.equal(handler.paid('listing'),false);assert.equal(db.prepare("SELECT count(*) n FROM vehicles v WHERE v.id='listing'"+handler.publicationSql()).get().n,0);db.prepare("UPDATE vehicles SET price_minor=100000 WHERE id='listing'").run();assert.equal(handler.paid('listing'),true);
 createAdminOperations({db});const stamp=new Date().toISOString();const add=(id,kind,payload)=>db.prepare("INSERT INTO operations_records(id,kind,name,status,payload_json,created_at,updated_at) VALUES(?,?,?,'active',?,?,?)").run(id,kind,id,JSON.stringify(payload),stamp,stamp);
 add('role','roles',{permissions:'tickets:view'});add('grant','memberships',{userId:'staff',adminRole:'role',organization:'one'});const staff={id:'staff',role:'admin'};assert.equal((await call('','GET',{},staff)).status,403);
 db.prepare('UPDATE operations_records SET payload_json=? WHERE id=?').run(JSON.stringify({permissions:'billing:view'}),'role');assert.equal((await call('','GET',{},staff)).data.items.length,0);add('seller_membership','memberships',{userId:'seller',organization:'one'});assert.equal((await call('','GET',{},staff)).data.items.length,1);db.close();
});

test('approved price bands include every boundary and exclude undefined currencies',()=>{for(const [price,fee] of [[1,6000],[10000000,6000],[10000001,8000],[50000000,8000],[50000001,10000],[100000000,10000],[100000001,20000],[110000000,20000]])assert.equal(listingFee(price,'GHS'),fee);assert.equal(listingFee(10000000,'USD'),null);assert.equal(listingFee(0,'GHS'),null);});

test('initializeDatabase creates a better-sqlite3 connection and vehicles table with make, model, year, price, location, and mileage, and Express GET /api/vehicles fetches all listings',async()=>{
 const db=initializeDatabase(':memory:');
 const cols=db.prepare('PRAGMA table_info(vehicles)').all().map(c=>c.name);
 for(const field of ['make','model','year','price','location','mileage'])assert.ok(cols.includes(field),`Missing ${field} column in vehicles table`);
 db.prepare("INSERT INTO vehicles (id, make, model, year, price, location, mileage, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')").run('v-1', 'Toyota', 'Land Cruiser', 2023, 895000, 'Accra, Ghana', 14200);
 const row=db.prepare('SELECT make, model, year, price, location, mileage FROM vehicles WHERE id = ?').get('v-1');
 assert.deepEqual(row,{make:'Toyota',model:'Land Cruiser',year:2023,price:895000,location:'Accra, Ghana',mileage:14200});
 const {createExpressApp}=await import('../express-server.mjs');
 const {app}=createExpressApp(db);
 const srv=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{
  const {port}=srv.address();
  const res=await fetch(`http://127.0.0.1:${port}/api/vehicles`);
  assert.equal(res.status,200);
  const body=await res.json();
  assert.equal(body.total,1);
  assert.equal(body.vehicles[0].make,'Toyota');
  assert.equal(body.vehicles[0].model,'Land Cruiser');
  assert.equal(body.vehicles[0].price,895000);
  assert.equal(body.vehicles[0].location,'Accra, Ghana');

  // Seed a supplier and admin in the SQLite db to verify Supplier and Admin Panel routes
  db.prepare("INSERT INTO users (id, email, password_hash, password_salt, role, status, email_verified) VALUES ('sup-1', 'supplier@autoconnect.gh', 'x', 'x', 'dealer', 'active', 1)").run();
  db.prepare("INSERT INTO dealer_profiles (user_id, business_name, city, country, contact_email, status) VALUES ('sup-1', 'Tema Harbour Motors', 'Tema', 'Ghana', 'supplier@autoconnect.gh', 'pending')").run();
  db.prepare("INSERT INTO users (id, email, password_hash, password_salt, role, status, email_verified) VALUES ('adm-1', 'admin@autoconnect.gh', 'x', 'x', 'admin', 'active', 1)").run();

  // 1. Supplier creates a pending vehicle listing with paid listing fee
  const createVehicleRes=await fetch(`http://127.0.0.1:${port}/api/supplier/vehicles`,{
   method:'POST',
   headers:{'Content-Type':'application/json','x-supplier-id':'sup-1'},
   body:JSON.stringify({make:'Lexus',model:'LX 600',year:2024,price:1950000,mileage:3100,city:'Tema',country:'Ghana'})
  });
  assert.equal(createVehicleRes.status,201);
  const createdVehicle=(await createVehicleRes.json()).vehicle;
  assert.equal(createdVehicle.make,'Lexus');
  assert.equal(createdVehicle.status,'pending');
  assert.equal(createdVehicle.feePaid,true);

  // 2. Supplier creates an order and stock item
  const createOrderRes=await fetch(`http://127.0.0.1:${port}/api/supplier/orders`,{
   method:'POST',
   headers:{'Content-Type':'application/json','x-supplier-id':'sup-1'},
   body:JSON.stringify({reference:'ORD-GH-500',listingId:createdVehicle.id,customerName:'Kofi Boateng',amount:1950000,currency:'GHS'})
  });
  assert.equal(createOrderRes.status,201);

  const createStockRes=await fetch(`http://127.0.0.1:${port}/api/supplier/stock`,{
   method:'POST',
   headers:{'Content-Type':'application/json','x-supplier-id':'sup-1'},
   body:JSON.stringify({listingId:createdVehicle.id,sku:'LX600-TEMA-01',quantity:1,threshold:1})
  });
  assert.equal(createStockRes.status,201);

  // 3. Supplier dashboard returns metrics, vehicles, orders, and stock
  const supDashRes=await fetch(`http://127.0.0.1:${port}/api/supplier/dashboard?supplierId=sup-1`);
  assert.equal(supDashRes.status,200);
  const supDash=await supDashRes.json();
  assert.equal(supDash.metrics.totalVehicles,1);
  assert.equal(supDash.metrics.orders,1);
  assert.equal(supDash.metrics.lowStock,1);

  // 4. Admin summary shows pending supplier and pending vehicle, then approves both
  const adminSumRes=await fetch(`http://127.0.0.1:${port}/api/admin/summary`);
  assert.equal(adminSumRes.status,200);
  const adminSum=await adminSumRes.json();
  assert.equal(adminSum.counts.pendingDealers,1);
  assert.equal(adminSum.counts.pendingVehicles,1);

  const approveSupRes=await fetch(`http://127.0.0.1:${port}/api/admin/suppliers/sup-1/approve`,{method:'POST'});
  assert.equal(approveSupRes.status,200);
  const approveVehRes=await fetch(`http://127.0.0.1:${port}/api/admin/vehicles/${createdVehicle.id}/approve`,{method:'POST'});
  assert.equal(approveVehRes.status,200);

  const vehiclesAfterApprove=await (await fetch(`http://127.0.0.1:${port}/api/vehicles`)).json();
  assert.equal(vehiclesAfterApprove.total,2);
  const filteredByMake=await (await fetch(`http://127.0.0.1:${port}/api/vehicles?q=Lexus`)).json();
  assert.equal(filteredByMake.total,1);
  assert.equal(filteredByMake.vehicles[0].make,'Lexus');

  // 5. Simulate a Paystack checkout on an unpaid supplier vehicle
  const unpaidRes=await fetch(`http://127.0.0.1:${port}/api/supplier/vehicles`,{
   method:'POST',
   headers:{'Content-Type':'application/json','x-supplier-id':'sup-1'},
   body:JSON.stringify({make:'Toyota',model:'Hilux',year:2023,price:680000,mileage:11200,city:'Tema',country:'Ghana',payListingFee:false})
  });
  assert.equal(unpaidRes.status,201);
  const unpaidVehicle=(await unpaidRes.json()).vehicle;
  assert.equal(unpaidVehicle.feePaid,false);

  const simInitRes=await fetch(`http://127.0.0.1:${port}/api/paystack/simulate/initialize`,{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({listingId:unpaidVehicle.id})
  });
  assert.equal(simInitRes.status,200);
  const simSession=await simInitRes.json();
  assert.equal(simSession.simulated,true);
  assert.equal(simSession.amountMinor,10000);
  assert.ok(simSession.reference.startsWith('pstk_sim_'));

  const simVerifyRes=await fetch(`http://127.0.0.1:${port}/api/paystack/simulate/verify`,{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({reference:simSession.reference,outcome:'success',channel:'mobile_money',network:'MTN MoMo'})
  });
  assert.equal(simVerifyRes.status,200);
  const simVerified=await simVerifyRes.json();
  assert.equal(simVerified.paid,true);
  assert.ok(simVerified.receiptNumber.startsWith('PSTK-GH-'));

  // 6. Seller creates a vehicle with "Tick for bid / allowOffers" and a private price range; buyers never see the range
  const bidVehRes=await fetch(`http://127.0.0.1:${port}/api/supplier/vehicles`,{
   method:'POST',
   headers:{'Content-Type':'application/json','x-supplier-id':'sup-1'},
   body:JSON.stringify({
    make:'Porsche',
    model:'Cayenne',
    year:2024,
    price:580000,
    mileage:3500,
    city:'Accra',
    country:'Ghana',
    status:'active',
    allowOffers:true,
    offerMinPrice:520000,
    offerMaxPrice:560000
   })
  });
  assert.equal(bidVehRes.status,201);
  const sellerViewVehicle=(await bidVehRes.json()).vehicle;
  assert.equal(sellerViewVehicle.allowOffers,true);
  assert.equal(sellerViewVehicle.offerMinPrice,520000);
  assert.equal(sellerViewVehicle.offerMaxPrice,560000);

  // Public vehicle detail & list MUST NEVER expose the seller's hidden price range
  const publicVehRes=await fetch(`http://127.0.0.1:${port}/api/vehicles/${sellerViewVehicle.id}`);
  assert.equal(publicVehRes.status,200);
  const publicVehicle=(await publicVehRes.json()).vehicle;
  assert.equal(publicVehicle.allowOffers,true);
  assert.equal(publicVehicle.offerMinPrice,undefined);
  assert.equal(publicVehicle.offerMaxPrice,undefined);
  assert.equal(publicVehicle.offer_min_minor,undefined);
  assert.equal(publicVehicle.offer_max_minor,undefined);
  assert.equal(publicVehicle.listingData?.offerMinPrice,undefined);
  assert.equal(publicVehicle.listingData?.offerMaxPrice,undefined);

  // Buyer submits an offer on the vehicle without seeing the range
  const makeOfferRes=await fetch(`http://127.0.0.1:${port}/api/vehicles/${sellerViewVehicle.id}/offers`,{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({
    amount:540000,
    buyerName:'Kofi Boateng',
    buyerEmail:'kofi@example.com',
    message:'Cash buyer ready for immediate inspection in Accra.'
   })
  });
  assert.equal(makeOfferRes.status,201);
  const buyerOfferPayload=await makeOfferRes.json();
  assert.equal(buyerOfferPayload.offer.amount,540000);
  assert.equal(buyerOfferPayload.offer.status,'pending');
  assert.equal(buyerOfferPayload.offer.offerMinPrice,undefined);
  assert.equal(buyerOfferPayload.offer.offerMaxPrice,undefined);
  assert.equal(buyerOfferPayload.offer.withinRange,undefined);

  // Seller views incoming offers with hidden range comparison and accepts the offer
  const sellerOffersRes=await fetch(`http://127.0.0.1:${port}/api/supplier/offers?supplierId=sup-1`);
  assert.equal(sellerOffersRes.status,200);
  const sellerOffers=(await sellerOffersRes.json()).offers;
  assert.equal(sellerOffers.length,1);
  assert.equal(sellerOffers[0].amount,540000);
  assert.equal(sellerOffers[0].withinRange,'within_range');
  assert.equal(sellerOffers[0].offerMinPrice,520000);
  assert.equal(sellerOffers[0].offerMaxPrice,560000);

  const acceptOfferRes=await fetch(`http://127.0.0.1:${port}/api/supplier/offers/${sellerOffers[0].id}/status?supplierId=sup-1`,{
   method:'PATCH',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({status:'accepted'})
  });
  assert.equal(acceptOfferRes.status,200);
  const acceptedOffer=(await acceptOfferRes.json()).offer;
  assert.equal(acceptedOffer.status,'accepted');
  assert.equal(sellerOffers[0].buyerEmail,undefined);

  // 7. Middleman Enquiry Moderation: Buyer "Ask about this car" goes to Admin first, supplier cannot see it until Admin edits & forwards
  db.prepare("INSERT INTO users (id, email, password_hash, password_salt, role, status, email_verified) VALUES ('buy-1', 'ama@buyer.gh', 'x', 'x', 'buyer', 'active', 1)").run();
  db.prepare("INSERT INTO enquiries (id, vehicle_id, buyer_id, dealer_id, message, original_message, status, admin_status, forwarded_to_seller) VALUES ('enq-mid-1', ?, 'buy-1', 'sup-1', 'Call me on 0240000000 about inspection', 'Call me on 0240000000 about inspection', 'new', 'pending_admin', 0)").run(sellerViewVehicle.id);
  const supEnqBefore=await (await fetch(`http://127.0.0.1:${port}/api/supplier/enquiries?supplierId=sup-1`)).json();
  assert.equal(supEnqBefore.enquiries.length,0);

  const adminEnqList=await (await fetch(`http://127.0.0.1:${port}/api/admin/enquiries`)).json();
  assert.equal(adminEnqList.enquiries.some(e=>e.id==='enq-mid-1'&&e.admin_status==='pending_admin'),true);

  const forwardRes=await fetch(`http://127.0.0.1:${port}/api/admin/enquiries/enq-mid-1/forward`,{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({message:'Buyer asks: Is this Cayenne available for inspection this week?',adminNotes:'Removed direct phone number'})
  });
  assert.equal(forwardRes.status,200);
  const forwardedPayload=await forwardRes.json();
  assert.equal(forwardedPayload.forwardedToSeller,true);
  assert.equal(forwardedPayload.adminStatus,'forwarded');
  assert.equal(forwardedPayload.message,'Buyer asks: Is this Cayenne available for inspection this week?');

  const supEnqAfter=await (await fetch(`http://127.0.0.1:${port}/api/supplier/enquiries?supplierId=sup-1`)).json();
  assert.equal(supEnqAfter.enquiries.length,1);
  assert.equal(supEnqAfter.enquiries[0].message,'Buyer asks: Is this Cayenne available for inspection this week?');
  assert.equal(supEnqAfter.enquiries[0].buyer_email,undefined);
 }finally{
  await new Promise(resolve=>srv.close(resolve));
  db.close();
 }
});


