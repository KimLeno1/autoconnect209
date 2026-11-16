import {createPaymentPreparation} from './payment-preparation.mjs';
import {createListingBilling} from './listing-billing.mjs';
import {createBuyerOperations} from './buyer-operations.mjs';
import {createSellerOperations} from './seller-operations.mjs';
import {createAdminOperations} from './admin-operations.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, scrypt as scryptCb, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { initializeDatabase } from './db.mjs';
import { createExpressApp } from './express-server.mjs';

const scrypt = promisify(scryptCb);
const root = dirname(fileURLToPath(import.meta.url));
let staticRoot = root;
try { await stat(join(root,'dist','index.html')); staticRoot=join(root,'dist'); } catch {}
const port = Number(process.env.PORT || 3000);
const origin = process.env.PUBLIC_ORIGIN || process.env.APP_URL || `http://127.0.0.1:${port}`;
const trustProxy = process.env.TRUST_PROXY === 'true';
const prod = process.env.NODE_ENV === 'production';
const dataPath = resolve(root, process.env.DATABASE_PATH || './data/apex.sqlite');
await mkdir(dirname(dataPath), { recursive: true });
const db = initializeDatabase(dataPath);
const ensureColumn=(table,name,definition)=>{if(!db.prepare(`PRAGMA table_info(${table})`).all().some(column=>column.name===name))db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);};
if(!db.prepare('PRAGMA table_info(dealer_profiles)').all().some(column=>column.name==='phone'))db.exec("ALTER TABLE dealer_profiles ADD COLUMN phone TEXT NOT NULL DEFAULT ''");
for(const [name,definition] of Object.entries({
  seller_type:"TEXT NOT NULL DEFAULT 'dealer'",whatsapp:"TEXT NOT NULL DEFAULT ''",preferred_contact:"TEXT NOT NULL DEFAULT 'website'",
  public_phone:'INTEGER NOT NULL DEFAULT 0',public_whatsapp:'INTEGER NOT NULL DEFAULT 0',region:"TEXT NOT NULL DEFAULT ''",business_address:"TEXT NOT NULL DEFAULT ''",
  profile_photo_url:"TEXT NOT NULL DEFAULT ''",logo_url:"TEXT NOT NULL DEFAULT ''",years_in_business:'INTEGER',registration_number:"TEXT NOT NULL DEFAULT ''",
  opening_hours:"TEXT NOT NULL DEFAULT ''",socials_json:"TEXT NOT NULL DEFAULT '{}'"
}))ensureColumn('dealer_profiles',name,definition);
ensureColumn('vehicles','price','REAL NOT NULL DEFAULT 0');
ensureColumn('vehicles','location',"TEXT NOT NULL DEFAULT ''");
ensureColumn('vehicles','listing_data',"TEXT NOT NULL DEFAULT '{}'");
ensureColumn('vehicles','allow_offers','INTEGER NOT NULL DEFAULT 0');
ensureColumn('vehicles','offer_min_minor','INTEGER');
ensureColumn('vehicles','offer_max_minor','INTEGER');
ensureColumn('vehicles','allow_deposit','INTEGER NOT NULL DEFAULT 1');
ensureColumn('vehicles','deposit_amount_minor','INTEGER');
ensureColumn('reports','seller_id','TEXT');
ensureColumn('enquiries','original_message',"TEXT NOT NULL DEFAULT ''");
ensureColumn('enquiries','admin_status',"TEXT NOT NULL DEFAULT 'pending_admin'");
ensureColumn('enquiries','forwarded_to_seller','INTEGER NOT NULL DEFAULT 0');
ensureColumn('enquiries','admin_notes',"TEXT NOT NULL DEFAULT ''");
ensureColumn('enquiries','reviewed_by','TEXT');
ensureColumn('enquiries','forwarded_at','TEXT');

const nowIso = () => new Date().toISOString();
const hash = value => createHash('sha256').update(value).digest('hex');
const id = () => randomUUID();
const safeEqual = (a, b) => {
  const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
};
const demoImages = [
  'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1400&q=82',
  'https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1400&q=82',
  'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1400&q=82',
  'https://images.unsplash.com/photo-1648413653819-7c0fd93e8e6a?auto=format&fit=crop&w=1400&q=82',
  'https://images.unsplash.com/photo-1603584173870-7f23fdae1b7a?auto=format&fit=crop&w=1400&q=82',
  'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=1400&q=82'
];
const demoCars = [
  ['demo-porsche-911','Porsche','911','Carrera S',2022,295000000,'GHS',12900,'Petrol','Automatic','3.0L flat-six','RWD','GT Silver','Black',2,4,'Used','Accra','Ghana',demoImages[0]],
  ['demo-bmw-m4','BMW','M4','Competition',2023,245000000,'GHS',8200,'Petrol','Automatic','3.0L inline-six','RWD','Isle of Man Green','Black',2,4,'Used','Kumasi','Ghana',demoImages[1]],
  ['demo-audi-rs6','Audi','RS 6','Avant',2024,310000000,'GHS',4600,'Petrol','Automatic','4.0L V8','AWD','Nardo Grey','Black',4,5,'Used','Tema','Ghana',demoImages[2]],
  ['demo-mercedes-g','Mercedes-Benz','G-Class','G 550',2023,420000000,'GHS',7400,'Petrol','Automatic','4.0L V8','AWD','Obsidian Black','Black',4,5,'Used','Takoradi','Ghana',demoImages[3]],
  ['demo-taycan','Porsche','Taycan','4S',2024,270000000,'GHS',3200,'Electric','Automatic','Dual motor','AWD','Chalk','Black',4,4,'Used','Cape Coast','Ghana',demoImages[4]],
  ['demo-defender','Land Rover','Defender','110 X-Dynamic',2022,185000000,'GHS',18600,'Diesel','Automatic','3.0L inline-six','AWD','Santorini Black','Ebony',4,5,'Used','Tamale','Ghana',demoImages[5]]
];

const demoGalleries = {
  'demo-porsche-911': [
    [demoImages[0], '2022 Porsche 911 Carrera S — Front three-quarter exterior'],
    ['/assets/editorial/porsche-road.webp', '2022 Porsche 911 Carrera S — Open road profile'],
    ['/assets/editorial/car-detail.webp', '2022 Porsche 911 Carrera S — Showroom studio angle'],
    ['https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?auto=format&fit=crop&w=1400&q=82', '2022 Porsche 911 Carrera S — Rear & cockpit detail']
  ],
  'demo-bmw-m4': [
    [demoImages[1], '2023 BMW M4 Competition — Front exterior view'],
    ['https://images.unsplash.com/photo-1617531653332-bd46c24f2068?auto=format&fit=crop&w=1400&q=82', '2023 BMW M4 Competition — Side profile'],
    ['/assets/editorial/car-detail.webp', '2023 BMW M4 Competition — Studio detail'],
    ['https://images.unsplash.com/photo-1556189250-72ba954cfc2b?auto=format&fit=crop&w=1400&q=82', '2023 BMW M4 Competition — Driver cockpit']
  ],
  'demo-audi-rs6': [
    ['/assets/editorial/audi-rs6.webp', '2024 Audi RS 6 Avant — Editorial front profile'],
    [demoImages[2], '2024 Audi RS 6 Avant — Dynamic road stance'],
    ['https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=1400&q=82', '2024 Audi RS 6 Avant — Rear three-quarter'],
    ['/assets/editorial/car-detail.webp', '2024 Audi RS 6 Avant — Showroom detail']
  ],
  'demo-mercedes-g': [
    [demoImages[3], '2023 Mercedes-Benz G 550 — Front three-quarter'],
    ['/assets/editorial/defender.webp', '2023 Mercedes-Benz G 550 — Off-road stance'],
    ['https://images.unsplash.com/photo-1520031441872-265e4ff70366?auto=format&fit=crop&w=1400&q=82', '2023 Mercedes-Benz G 550 — Side exterior'],
    ['/assets/editorial/car-detail.webp', '2023 Mercedes-Benz G 550 — Luxury cabin & detail']
  ],
  'demo-taycan': [
    ['/assets/editorial/taycan.webp', '2024 Porsche Taycan 4S — Editorial hero view'],
    [demoImages[4], '2024 Porsche Taycan 4S — Side profile'],
    ['/assets/editorial/porsche-road.webp', '2024 Porsche Taycan 4S — Highway tour'],
    ['/assets/editorial/car-detail.webp', '2024 Porsche Taycan 4S — Showroom detail']
  ],
  'demo-defender': [
    ['/assets/editorial/defender.webp', '2022 Land Rover Defender 110 — Editorial hero view'],
    [demoImages[5], '2022 Land Rover Defender 110 — Side profile'],
    ['https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1400&q=82', '2022 Land Rover Defender 110 — Expedition angle'],
    ['/assets/editorial/car-detail.webp', '2022 Land Rover Defender 110 — Detail view']
  ]
};

function seed() {
  const count = db.prepare('SELECT count(*) n FROM vehicles WHERE is_demo=1').get().n;
  if (!count) {
    const addVehicle = db.prepare(`INSERT INTO vehicles
      (id,make,model,trim,year,price,price_minor,currency,location,mileage,fuel,transmission,engine,drivetrain,exterior,interior,doors,seats,condition,city,country,description,status,is_demo)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'active',1)`);
    const addImage = db.prepare('INSERT INTO vehicle_images(id,vehicle_id,image_url,alt_text,sort_order) VALUES(?,?,?,?,0)');
    for (const car of demoCars) {
      const [key,make,model,trim,year,priceMinor,currency,mileage,fuel,transmission,engine,drive,exterior,interior,doors,seats,condition,city,country,image] = car;
      addVehicle.run(key,make,model,trim,year,priceMinor/100,priceMinor,currency,`${city}, ${country}`,mileage,fuel,transmission,engine,drive,exterior,interior,doors,seats,condition,city,country,
        'Illustrative marketplace record for interface testing. Vehicle details, availability and price are not an offer for sale.');
      addImage.run(id(),key,image,`Representative demo photograph for ${year} ${make} ${model}`);
    }
    const categories = ['SUV','Coupe','Sedan','Wagon','Electric'];
    const addCategory = db.prepare('INSERT OR IGNORE INTO vehicle_categories(name) VALUES(?)');
    categories.forEach(name => addCategory.run(name));
  }
  const upsertGalleryImage = db.prepare('INSERT OR IGNORE INTO vehicle_images(id,vehicle_id,image_url,alt_text,sort_order) VALUES(?,?,?,?,?)');
  for (const [vehicleId, gallery] of Object.entries(demoGalleries)) {
    const exists = db.prepare('SELECT 1 FROM vehicles WHERE id=?').get(vehicleId);
    if (!exists) continue;
    gallery.forEach(([imgUrl, altText], idx) => {
      const alreadyHasUrl = db.prepare('SELECT 1 FROM vehicle_images WHERE vehicle_id=? AND image_url=?').get(vehicleId, imgUrl);
      if (!alreadyHasUrl) {
        upsertGalleryImage.run(`img-${vehicleId}-${idx}`, vehicleId, imgUrl, altText, idx);
      }
    });
  }
}
seed();
const localizeDemo=db.prepare("UPDATE vehicles SET price=?,price_minor=?,currency='GHS',location=?,city=?,country='Ghana' WHERE id=? AND is_demo=1");
for(const car of demoCars)localizeDemo.run(car[5]/100,car[5],`${car[17]}, Ghana`,car[17],car[0]);
const demoBodyTypes={ 'demo-porsche-911':'Coupe','demo-bmw-m4':'Coupe','demo-audi-rs6':'Wagon','demo-mercedes-g':'SUV','demo-taycan':'Sedan','demo-defender':'SUV' };
const setDemoBodyType=db.prepare("UPDATE vehicles SET body_type=? WHERE id=? AND is_demo=1 AND body_type=''");
for(const [vehicleId,bodyType] of Object.entries(demoBodyTypes))setDemoBodyType.run(bodyType,vehicleId);
db.prepare("UPDATE vehicles SET allow_offers=1, offer_min_minor=275000000, offer_max_minor=295000000 WHERE id='demo-porsche-911' AND is_demo=1").run();
db.prepare("UPDATE vehicles SET allow_offers=1, offer_min_minor=395000000, offer_max_minor=420000000 WHERE id='demo-mercedes-g' AND is_demo=1").run();
db.prepare("UPDATE vehicles SET allow_deposit=1, deposit_amount_minor=CAST(ROUND(price_minor * 0.10) AS INTEGER) WHERE deposit_amount_minor IS NULL AND price_minor > 0").run();

const adminEmail = String(process.env.APEX_ADMIN_EMAIL || '').trim().toLowerCase();
const adminPassword = String(process.env.APEX_ADMIN_PASSWORD || '');
if (adminEmail && adminPassword) {
  if (adminPassword.length < 16) throw new Error('APEX_ADMIN_PASSWORD must have at least 16 characters.');
  const existing = db.prepare('SELECT id FROM users WHERE email=?').get(adminEmail);
  if (!existing) {
    const salt = randomBytes(16).toString('hex');
    const digest = await scrypt(adminPassword, salt, 64);
    const userId = id();
    db.prepare("INSERT INTO users(id,email,password_hash,password_salt,role,email_verified) VALUES(?,?,?,?,'admin',1)")
      .run(userId,adminEmail,Buffer.from(digest).toString('hex'),salt);
    db.prepare('INSERT INTO admin_roles(user_id,permissions_json) VALUES(?,?)').run(userId,JSON.stringify(['vehicles:review','reports:review','dealers:review']));
  }
}

const seedCatalogAndAccounts = async () => {
  const catalog = {
    Porsche: ['911', 'Taycan', 'Cayenne', 'Macan', 'Panamera'],
    BMW: ['M4', 'X5', 'X7', '3 Series', '5 Series'],
    Audi: ['RS 6', 'Q8', 'Q7', 'A6', 'e-tron GT'],
    'Mercedes-Benz': ['G-Class', 'GLE', 'S-Class', 'C-Class', 'GLC'],
    'Land Rover': ['Defender', 'Range Rover', 'Range Rover Sport', 'Discovery'],
    Toyota: ['Land Cruiser', 'Hilux', 'Corolla', 'RAV4', 'Prado'],
    Honda: ['CR-V', 'Civic', 'Accord', 'HR-V'],
    Lexus: ['LX 600', 'RX 350', 'GX 460']
  };
  const insertMake = db.prepare('INSERT OR IGNORE INTO vehicle_makes(name) VALUES(?)');
  const getMake = db.prepare('SELECT id FROM vehicle_makes WHERE name=?');
  const insertModel = db.prepare('INSERT OR IGNORE INTO vehicle_models(make_id,name) VALUES(?,?)');
  for (const [make, models] of Object.entries(catalog)) {
    insertMake.run(make);
    const makeRow = getMake.get(make);
    if (makeRow) {
      for (const model of models) insertModel.run(makeRow.id, model);
    }
  }
  const customs = [
    ['GH', JSON.stringify({dutyRateBps: 2000, vatRateBps: 1500, notes: 'Ghana Revenue Authority (ICUMS) planning baseline: 5–20% import duty by engine cc, plus 15% VAT and statutory port levies at Tema/Takoradi.'}), 'https://gra.gov.gh', '2026-01-01'],
    ['CI', JSON.stringify({dutyRateBps: 2000, vatRateBps: 1800, notes: 'ECOWAS CET planning baseline for Côte d’Ivoire (Abidjan port): up to 20% import duty and 18% VAT.'}), 'https://www.douanes.ci', '2026-01-01'],
    ['NG', JSON.stringify({dutyRateBps: 2000, vatRateBps: 750, notes: 'Nigeria Customs Service planning baseline: 20% duty plus NAC levy and 7.5% VAT.'}), 'https://customs.gov.ng', '2026-01-01'],
    ['TG', JSON.stringify({dutyRateBps: 2000, vatRateBps: 1800, notes: 'Lomé Port planning baseline: ECOWAS CET duty bands plus 18% VAT.'}), 'https://otr.tg', '2026-01-01']
  ];
  const upsertCustoms = db.prepare('INSERT OR IGNORE INTO customs_rules(country_code,rule_json,source_url,effective_at) VALUES(?,?,?,?)');
  for (const [code, ruleJson, sourceUrl, effectiveAt] of customs) upsertCustoms.run(code, ruleJson, sourceUrl, effectiveAt);

  if (process.env.NODE_ENV !== 'test') {
    const ensureAccount = async (email, password, role, setupFn) => {
      const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email);
      if (existing) return existing.id;
      const salt = randomBytes(16).toString('hex');
      const digest = await scrypt(password, salt, 64);
      const userId = id();
      db.prepare('INSERT INTO users(id,email,password_hash,password_salt,role,email_verified) VALUES(?,?,?,?,?,1)')
        .run(userId, email, Buffer.from(digest).toString('hex'), salt, role);
      setupFn(userId);
      return userId;
    };
    const adminId = await ensureAccount('admin@autoconnect.gh', 'AutoConnect-Admin-2026!', 'admin', userId => {
      db.prepare('INSERT OR IGNORE INTO admin_roles(user_id,permissions_json) VALUES(?,?)')
        .run(userId, JSON.stringify(['*','vehicles:review','reports:review','dealers:review','billing:view','Refunds:approve']));
    });
    const dealerId = await ensureAccount('dealer@autoconnect.gh', 'AutoConnect-Dealer-2026!', 'dealer', userId => {
      db.prepare(`INSERT OR IGNORE INTO dealer_profiles(user_id,seller_type,business_name,description,city,region,country,contact_email,phone,whatsapp,public_phone,public_whatsapp,preferred_contact,years_in_business,opening_hours,status)
        VALUES(?,'dealer','Accra Premier Motors','Verified multi-brand showroom in Airport Residential, Accra specialising in inspected local and foreign-used vehicles.','Accra','Greater Accra','Ghana','dealer@autoconnect.gh','+233 30 274 8800','+233 24 800 9900',1,1,'whatsapp',9,'Mon–Sat 08:30–18:00','approved')`)
        .run(userId);
    });
    await ensureAccount('kumasi.motors@autoconnect.gh', 'AutoConnect-Kumasi-2026!', 'dealer', userId => {
      db.prepare(`INSERT OR IGNORE INTO dealer_profiles(user_id,seller_type,business_name,description,city,region,country,contact_email,phone,whatsapp,public_phone,public_whatsapp,preferred_contact,years_in_business,opening_hours,status)
        VALUES(?,'dealer','Kumasi Royal Auto','Suame Magazine & Ahodwo imported SUV and pickup specialist awaiting marketplace compliance review.','Kumasi','Ashanti','Ghana','kumasi.motors@autoconnect.gh','+233 32 202 4411','+233 24 911 2233',1,1,'whatsapp',5,'Mon–Sat 08:00–17:30','pending')`)
        .run(userId);
    });
    const buyerId = await ensureAccount('buyer@autoconnect.gh', 'AutoConnect-Buyer-2026!', 'buyer', userId => {
      db.prepare('INSERT OR IGNORE INTO buyer_profiles(user_id,display_name,phone) VALUES(?,?,?)')
        .run(userId, 'Kwame Mensah', '+233 24 555 0192');
    });
    return { adminId, dealerId, buyerId };
  }
  return null;
};
const seededAccounts = await seedCatalogAndAccounts();

const authAttempts = new Map();
const mime = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2' };
const send = (res,status,payload,headers={}) => {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});
  res.end(JSON.stringify(payload));
};
const fail = (res,status,message) => send(res,status,{error:message});
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [v.slice(0,i),decodeURIComponent(v.slice(i+1))];}));
}
function session(req) {
  const token=cookies(req).apex_session; if(!token) return null;
  const row=db.prepare(`SELECT u.id,u.email,u.role,u.status,u.email_verified, s.csrf_token,s.expires_at
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id_hash=?`).get(hash(token));
  if(!row || row.status!=='active' || Date.parse(row.expires_at)<Date.now()) return null;
  return row;
}
function setSession(res,userId,req) {
  const token=randomBytes(32).toString('base64url'); const csrf=randomBytes(24).toString('base64url');
  const expires=new Date(Date.now()+12*60*60*1000).toISOString();
  db.prepare('INSERT INTO sessions(id_hash,user_id,csrf_token,expires_at) VALUES(?,?,?,?)').run(hash(token),userId,csrf,expires);
  const https = prod || req?.headers?.['x-forwarded-proto'] === 'https';
  const cookieAttrs = https && !process.env.PUBLIC_ORIGIN ? 'SameSite=None; Secure; Partitioned' : `SameSite=Strict${prod ? '; Secure' : ''}`;
  res.setHeader('Set-Cookie',`apex_session=${encodeURIComponent(token)}; Path=/; HttpOnly; ${cookieAttrs}; Max-Age=43200`);
  return csrf;
}
async function body(req) {
  let data=''; for await (const chunk of req) { data+=chunk; if(data.length>4_500_000) throw Object.assign(new Error('Request is too large.'),{status:413}); }
  try { return data ? JSON.parse(data) : {}; } catch { throw Object.assign(new Error('Request body must be valid JSON.'),{status:400}); }
}
function requestOriginOK(req) {
  const incoming=req.headers.origin;
  const host=req.headers['x-forwarded-host']||req.headers.host;
  if(incoming) {
    if(incoming===origin) return true;
    if(!process.env.PUBLIC_ORIGIN && host) {
      try { if(new URL(incoming).host===host) return true; } catch {}
    }
    return false;
  }
  if(!incoming && host && process.env.PUBLIC_ORIGIN && !origin.endsWith(`://${host}`)) return false;
  return true;
}
function requireCsrf(req,res,user) {
  if(!requestOriginOK(req)) { fail(res,403,'Request origin is not allowed.'); return false; }
  if(user && !safeEqual(req.headers['x-csrf-token'] || '',user.csrf_token)) { fail(res,403,'Refresh the page and try again.'); return false; }
  return true;
}
function requireRole(user,role,res) {
  if(!user) { fail(res,401,'Sign in to continue.'); return false; }
  if(Array.isArray(role) ? !role.includes(user.role) : user.role!==role) { fail(res,403,'This account cannot perform that action.'); return false; }
  return true;
}
function carFromRow(row) {
  const images=db.prepare('SELECT image_url url,alt_text alt FROM vehicle_images WHERE vehicle_id=? ORDER BY sort_order').all(row.id);
  const {dealer_id,listing_data,offer_min_minor,offer_max_minor,dealer_phone,dealer_whatsapp,dealer_website,public_phone,public_whatsapp,...publicRow}=row;
  const data=row.listing_data?JSON.parse(row.listing_data):{};
  const allowOffers=Boolean(row.allow_offers||data.allowOffers);
  const allowDeposit=row.allow_deposit!==undefined&&row.allow_deposit!==null?Boolean(row.allow_deposit):data.allowDeposit!==undefined?Boolean(data.allowDeposit):true;
  const computedPrice = row.price_minor ? row.price_minor / 100 : Number(row.price || 0);
  const rawDepositMajor = row.deposit_amount_minor ? row.deposit_amount_minor / 100 : Number(data.depositAmount || 0);
  const depositAmount = allowDeposit ? (rawDepositMajor > 0 && (computedPrice <= 0 || rawDepositMajor < computedPrice) ? rawDepositMajor : Math.max(1, Math.round(computedPrice * 0.10))) : 0;
  delete data.vin;delete data.registrationNumber;delete data.businessAddress;
  delete data.offerMinPrice;delete data.offerMaxPrice;delete data.offer_min_minor;delete data.offer_max_minor;
  delete data.phone;delete data.whatsapp;delete data.email;delete data.contactEmail;
  // Auto Connect acts as the strict middleman: never expose direct seller phone, WhatsApp, or website to buyers
  const dealer=row.dealer_name ? { name:row.dealer_name, type:row.seller_type||'dealer', city:row.dealer_city, region:row.dealer_region||'', status:row.dealer_status, phone:'', whatsapp:'', website:'', profileId:dealer_id } : null;
  const computedLocation = row.location || [row.city, row.country].filter(Boolean).join(', ');
  return {...publicRow, allow_offers:allowOffers?1:0, allowOffers, allow_deposit:allowDeposit?1:0, allowDeposit, deposit_amount_minor:allowDeposit?Math.round(depositAmount*100):null, depositAmount:allowDeposit?depositAmount:null, listingData:data, price:computedPrice, location:computedLocation, images, dealer, is_demo:Boolean(row.is_demo)};
}
function parseDealerOfferRange(b = {}, current = null) {
  const ld = b.listingData && typeof b.listingData === 'object' ? b.listingData : {};
  const rawAllow = b.allowOffers ?? b.allow_offers ?? ld.allowOffers ?? (current ? Boolean(current.allow_offers) : false);
  const allowOffers = rawAllow === true || rawAllow === 1 || rawAllow === '1' || rawAllow === 'true' ? 1 : 0;
  if (!allowOffers) return { allowOffers: 0, offerMinMinor: null, offerMaxMinor: null };
  const toMinor = (majorVal, minorVal, fallback = null) => {
    if (minorVal !== undefined && minorVal !== null && minorVal !== '') {
      const n = Number(minorVal);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    }
    if (majorVal !== undefined && majorVal !== null && majorVal !== '') {
      const n = Number(majorVal);
      return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
    }
    return fallback;
  };
  const offerMinMinor = toMinor(b.offerMinPrice ?? ld.offerMinPrice, b.offer_min_minor ?? ld.offer_min_minor, current?.offer_min_minor ?? null);
  const offerMaxMinor = toMinor(b.offerMaxPrice ?? ld.offerMaxPrice, b.offer_max_minor ?? ld.offer_max_minor, current?.offer_max_minor ?? null);
  if (offerMinMinor !== null && offerMaxMinor !== null && offerMinMinor > offerMaxMinor) {
    throw Object.assign(new Error('Minimum offer price cannot exceed maximum offer price.'), { status: 400 });
  }
  return { allowOffers, offerMinMinor, offerMaxMinor };
}
function parseDealerDepositConfig(b = {}, current = null, askingPriceMajor = 0) {
  const ld = b.listingData && typeof b.listingData === 'object' ? b.listingData : {};
  let currentLd = {};
  if (current?.listing_data) {
    try { currentLd = JSON.parse(current.listing_data); } catch {}
  }
  const rawAllow = b.allowDeposit ?? b.allow_deposit ?? ld.allowDeposit ?? (current && current.allow_deposit !== undefined && current.allow_deposit !== null ? Boolean(current.allow_deposit) : currentLd.allowDeposit !== undefined ? Boolean(currentLd.allowDeposit) : true);
  const allowDeposit = rawAllow === false || rawAllow === 0 || rawAllow === '0' || rawAllow === 'false' ? 0 : 1;
  if (!allowDeposit) return { allowDeposit: 0, depositAmountMinor: null, depositAmountMajor: null };
  const rawMinor = b.deposit_amount_minor ?? ld.deposit_amount_minor;
  const rawMajor = b.depositAmount ?? b.deposit_amount ?? ld.depositAmount;
  let depositAmountMinor = null;
  if (rawMinor !== undefined && rawMinor !== null && rawMinor !== '') {
    const n = Number(rawMinor);
    if (!Number.isFinite(n) || n <= 0) throw Object.assign(new Error('Enter a valid reservation deposit amount greater than zero.'), { status: 400 });
    depositAmountMinor = Math.round(n);
  } else if (rawMajor !== undefined && rawMajor !== null && rawMajor !== '') {
    const n = Number(rawMajor);
    if (!Number.isFinite(n) || n <= 0) throw Object.assign(new Error('Enter a valid reservation deposit amount greater than zero.'), { status: 400 });
    depositAmountMinor = Math.round(n * 100);
  } else if (current?.deposit_amount_minor && Number(current.deposit_amount_minor) > 0) {
    depositAmountMinor = Math.round(Number(current.deposit_amount_minor));
  } else if (askingPriceMajor > 0) {
    depositAmountMinor = Math.max(100, Math.round(askingPriceMajor * 0.10 * 100));
  }
  const priceMinor = Math.round(Number(askingPriceMajor || 0) * 100);
  if (depositAmountMinor !== null && priceMinor > 0 && depositAmountMinor >= priceMinor) {
    throw Object.assign(new Error('Reservation deposit must be less than the vehicle asking price.'), { status: 400 });
  }
  return {
    allowDeposit: 1,
    depositAmountMinor,
    depositAmountMajor: depositAmountMinor ? depositAmountMinor / 100 : null
  };
}
function formatDealerOfferRow(row) {
  const amount = Math.round(Number(row.amount_minor || 0)) / 100;
  const minMinor = row.offer_min_minor ?? null;
  const maxMinor = row.offer_max_minor ?? null;
  const withinRange = !minMinor && !maxMinor ? 'no_range' : minMinor && row.amount_minor < minMinor ? 'below_range' : maxMinor && row.amount_minor > maxMinor ? 'above_range' : 'within_range';
  return {
    id: row.id,
    vehicle_id: row.vehicle_id,
    buyer_id: row.buyer_id,
    seller_id: row.seller_id,
    buyer_name: 'Verified Marketplace Buyer',
    buyer_email: '',
    amount,
    amount_minor: row.amount_minor,
    currency: row.currency || 'GHS',
    message: row.message || '',
    status: row.status,
    withinRange,
    isWithinRange: withinRange === 'within_range',
    offer_min_minor: minMinor,
    offer_max_minor: maxMinor,
    offerMinPrice: minMinor ? minMinor / 100 : null,
    offerMaxPrice: maxMinor ? maxMinor / 100 : null,
    make: row.make,
    model: row.model,
    year: row.year,
    asking_price_minor: row.price_minor,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}
function validateImageUploads(input) {
  if(input===undefined||input===null)return [];
  if(!Array.isArray(input)||input.length>6)throw Object.assign(new Error('Choose up to six vehicle photos.'),{status:400});
  let total=0;
  return input.map(image=>{
    const mime=String(image?.type||''),encoded=String(image?.data||'');
    if(!['image/jpeg','image/png','image/webp'].includes(mime)||!encoded||encoded.length>720000||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))throw Object.assign(new Error('Use JPEG, PNG or WebP images up to 500 KB each.'),{status:400});
    const data=Buffer.from(encoded,'base64');total+=data.length;
    if(data.length>512000||total>2_500_000)throw Object.assign(new Error('Keep each image under 500 KB and the gallery under 2.5 MB.'),{status:400});
    const valid=mime==='image/jpeg'?data.length>3&&data[0]===0xff&&data[1]===0xd8&&data[2]===0xff:mime==='image/png'?data.length>8&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):data.length>12&&data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP';
    if(!valid)throw Object.assign(new Error('The image file content does not match its file type.'),{status:400});
    return {mime,data};
  });
}
function storeVehicleImages(vehicleId,images) {
  const maxOrderRow = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM vehicle_images WHERE vehicle_id=?').get(vehicleId);
  let nextOrder = (maxOrderRow?.max_order ?? -1) + 1;
  for(const image of images){
    const mediaId=id();db.prepare('INSERT INTO vehicle_media(id,vehicle_id,mime_type,data) VALUES(?,?,?,?)').run(mediaId,vehicleId,image.mime,image.data);
    db.prepare('INSERT INTO vehicle_images(id,vehicle_id,image_url,alt_text,sort_order) VALUES(?,?,?,?,?)').run(id(),vehicleId,`/api/media/${mediaId}`,'Dealer supplied vehicle photo',nextOrder++);
  }
}
const publicSelect=`SELECT v.id,v.dealer_id,v.make,v.model,v.trim,v.year,v.price,v.price_minor,v.currency,v.location,v.mileage,v.fuel,v.transmission,v.engine,v.engine_cc,v.drivetrain,v.body_type,v.exterior,v.interior,v.doors,v.seats,v.condition,v.accident_history,v.ownership_history,v.registration_status,v.import_status,v.city,v.country,v.description,v.listing_data,v.allow_offers,v.allow_deposit,v.deposit_amount_minor,v.status,v.created_at,v.updated_at,v.is_demo,dp.business_name dealer_name,dp.seller_type,dp.city dealer_city,dp.region dealer_region,dp.status dealer_status,dp.phone dealer_phone,dp.whatsapp dealer_whatsapp,dp.public_phone,dp.public_whatsapp,dp.website dealer_website
  FROM vehicles v LEFT JOIN dealer_profiles dp ON dp.user_id=v.dealer_id LEFT JOIN users seller ON seller.id=v.dealer_id`;
const allowedSort={newest:'v.created_at DESC',oldest:'v.created_at ASC',priceAsc:'v.price_minor ASC',priceDesc:'v.price_minor DESC',mileage:'v.mileage ASC',year:'v.year DESC'};
function identitySql(){return listingBilling.publicationSql()+((process.env.REQUIRE_SELLER_IDENTITY==='true'||process.env.NODE_ENV==='production')?" AND (v.is_demo=1 OR v.dealer_id IN (SELECT seller_id FROM seller_identity WHERE status='verified'"+(process.env.NODE_ENV==='production'?" AND livemode=1":'')+"))":'');}
function sellerIdentityAllowed(owner){if(process.env.REQUIRE_SELLER_IDENTITY!=='true'&&process.env.NODE_ENV!=='production')return true;const verification=sellerOperations.identity(owner);return verification.status==='verified'&&(process.env.NODE_ENV!=='production'||verification.verifiedForProduction);}
function listVehicles(url) {
  const terms=["v.status='active'",'v.deleted_at IS NULL',"(v.is_demo=1 OR (dp.status='approved' AND seller.status='active'))"]; const values=[];
  const set=(sql,val)=>{if(val!==null && val!==undefined && val!==''){terms.push(sql);values.push(val);}};
  if(identitySql())terms.push(identitySql().replace(/^ AND /,''));
  const q=url.searchParams.get('q')?.trim(); if(q){const p=`%${q.slice(0,80)}%`;terms.push('(v.make LIKE ? OR v.model LIKE ? OR v.trim LIKE ? OR v.engine LIKE ? OR v.body_type LIKE ? OR v.exterior LIKE ? OR v.import_status LIKE ? OR v.city LIKE ? OR v.country LIKE ? OR dp.business_name LIKE ?)');values.push(p,p,p,p,p,p,p,p,p,p);}
  set('v.make=?',url.searchParams.get('make'));set('v.model LIKE ?',url.searchParams.get('model')?.trim()?`%${url.searchParams.get('model').trim().slice(0,80)}%`:null);
  set('v.fuel=?',url.searchParams.get('fuel'));set('v.transmission=?',url.searchParams.get('transmission'));set('v.condition=?',url.searchParams.get('condition'));
  set('v.body_type=?',url.searchParams.get('bodyType'));set('v.drivetrain=?',url.searchParams.get('drivetrain'));set('v.import_status=?',url.searchParams.get('importStatus'));
  set('v.exterior LIKE ?',url.searchParams.get('color')?.trim()?`%${url.searchParams.get('color').trim().slice(0,60)}%`:null);
  set('v.engine LIKE ?',url.searchParams.get('engine')?.trim()?`%${url.searchParams.get('engine').trim().slice(0,60)}%`:null);
  const range=(minimum,maximum,sqlMin,sqlMax,multiplier=1,lowest=1,highest=Number.MAX_SAFE_INTEGER)=>{
    const rawLow=url.searchParams.get(minimum),rawHigh=url.searchParams.get(maximum);
    const low=rawLow===null||rawLow===''?null:Number(rawLow),high=rawHigh===null||rawHigh===''?null:Number(rawHigh);
    if(low!==null&&(!Number.isFinite(low)||low<lowest||low>highest)||high!==null&&(!Number.isFinite(high)||high<lowest||high>highest)||low!==null&&high!==null&&low>high){terms.push('0=1');return;}
    if(low!==null)set(sqlMin,Math.round(low*multiplier));if(high!==null)set(sqlMax,Math.round(high*multiplier));
  };
  if(url.searchParams.has('minPrice')||url.searchParams.has('maxPrice'))range('minPrice','maxPrice','v.price_minor>=?','v.price_minor<=?',100,0,1000000000);
  if(url.searchParams.has('minYear')||url.searchParams.has('maxYear')||url.searchParams.has('year')){
    if(!url.searchParams.has('minYear')&&url.searchParams.has('year'))url.searchParams.set('minYear',url.searchParams.get('year'));
    range('minYear','maxYear','v.year>=?','v.year<=?',1,1900,2100);
  }
  if(url.searchParams.has('minMileage')||url.searchParams.has('maxMileage'))range('minMileage','maxMileage','v.mileage>=?','v.mileage<=?',1,0,10000000);
  const engineCc=Number(url.searchParams.get('engineCc'));if(Number.isInteger(engineCc)&&engineCc>=100&&engineCc<=20000)set('v.engine_cc>=?',engineCc);
  const seller=url.searchParams.get('seller');if(seller==='dealer')terms.push('v.dealer_id IS NOT NULL');else if(seller==='private')terms.push('v.dealer_id IS NULL AND v.is_demo=0');
  set('v.city LIKE ?',(url.searchParams.get('location')||'').trim()?`%${url.searchParams.get('location').trim().slice(0,80)}%`:null);
  const sort=allowedSort[url.searchParams.get('sort')]||allowedSort.newest;
  const page=Math.max(1,Math.min(100,Number(url.searchParams.get('page'))||1)); const limit=12;
  const where=terms.join(' AND '); const total=db.prepare(`SELECT count(*) n FROM vehicles v LEFT JOIN dealer_profiles dp ON dp.user_id=v.dealer_id LEFT JOIN users seller ON seller.id=v.dealer_id WHERE ${where}`).get(...values).n;
    const rows=db.prepare(`${publicSelect} WHERE ${where} ORDER BY ${sort},v.id LIMIT ? OFFSET ?`).all(...values,limit,(page-1)*limit);
  return {items:rows.map(carFromRow),page,limit,total,pages:Math.ceil(total/limit)};
}
function getVehicle(vehicleId) {
  const row=db.prepare(`${publicSelect} WHERE v.id=? AND v.status='active' AND v.deleted_at IS NULL AND (v.is_demo=1 OR (dp.status='approved' AND seller.status='active'))${identitySql()}`).get(vehicleId);
  return row?carFromRow(row):null;
}
function getPriceContext(vehicle) {
  const rows=vehicle.is_demo?[]:db.prepare(`SELECT price_minor FROM vehicles v JOIN dealer_profiles dp ON dp.user_id=v.dealer_id JOIN users seller ON seller.id=v.dealer_id
    WHERE v.status='active' AND v.deleted_at IS NULL AND v.is_demo=0 AND dp.status='approved' AND seller.status='active' AND v.currency=? AND lower(v.make)=lower(?) AND lower(v.model)=lower(?) AND v.year BETWEEN ? AND ? AND v.id<>? ORDER BY price_minor`)
    .all(vehicle.currency,vehicle.make,vehicle.model,Math.max(1900,vehicle.year-2),Math.min(2100,vehicle.year+2),vehicle.id);
  if(rows.length<5)return {label:'Insufficient market data',comparableCount:rows.length,currency:vehicle.currency,method:'Fewer than five active, approved, non-demo listings match this vehicle’s make, model and nearby model years.'};
  const middle=Math.floor(rows.length/2),median=rows.length%2?rows[middle].price_minor:(rows[middle-1].price_minor+rows[middle].price_minor)/2;
  return {label:'Comparable asking-price midpoint',comparableCount:rows.length,currency:vehicle.currency,medianPrice:median/100,lowPrice:rows[0].price_minor/100,highPrice:rows.at(-1).price_minor/100,method:'Median of current asking prices for the same make and model within two model years. This is not a valuation or inspection.'};
}
function adminLog(actor,action,type,subject,details={}) {
  db.prepare('INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,details_json) VALUES(?,?,?,?,?,?)').run(id(),actor.id,action,type,subject,JSON.stringify(details));
}
function addNotification(userId,kind,bodyText) {
  if(userId)db.prepare('INSERT INTO notifications(id,user_id,kind,body) VALUES(?,?,?,?)').run(id(),userId,kind,String(bodyText).slice(0,240));
}
function rateLimit(req,res) {
  const ip=String(req.socket.remoteAddress||'unknown'); const now=Date.now();
  const state=authAttempts.get(ip)||{count:0,start:now}; if(now-state.start>15*60*1000){state.count=0;state.start=now;}
  state.count++;authAttempts.set(ip,state);
  if(state.count>15){fail(res,429,'Too many attempts. Try again in 15 minutes.');return false;}
  return true;
}

const listingBilling=createListingBilling({db,send,body,requireCsrf,adminLog});
const adminOperations=createAdminOperations({db,send,fail,body,requireCsrf,adminLog});
const sellerOperations=createSellerOperations({db,send,fail,body,requireCsrf,adminLog});
const paymentPreparation=createPaymentPreparation({db,send,body,requireCsrf,adminLog});
const buyerOperations=createBuyerOperations({db,send,fail,body,requireCsrf,identityService:sellerOperations,adminLog});
const { app: expressApp } = createExpressApp(db);

function seedAdminAndSupplierPanelData(accounts) {
  if (!accounts || process.env.NODE_ENV === 'test') return;
  const { adminId, dealerId, buyerId } = accounts;
  const t = nowIso();

  db.prepare(
    `INSERT OR IGNORE INTO seller_identity (seller_id, provider, session_id, status, reason, last_event, updated_at, livemode)
     VALUES (?, 'sqlite_sandbox', 'vs_seed_accra_premier', 'verified', '', ?, ?, 0)`
  ).run(dealerId, Math.floor(Date.now() / 1000), t);

  const supplierVehicles = [
    {
      id: 'dealer-land-cruiser-300',
      make: 'Toyota',
      model: 'Land Cruiser',
      trim: '300 GR-Sport',
      year: 2023,
      price: 1850000,
      priceMinor: 185000000,
      currency: 'GHS',
      location: 'Accra, Ghana',
      mileage: 9400,
      fuel: 'Diesel',
      transmission: 'Automatic',
      engine: '3.3L Twin-Turbo V6',
      drivetrain: '4WD',
      bodyType: 'SUV',
      exterior: 'Pearl White',
      interior: 'Crimson/Black Leather',
      condition: 'Used',
      city: 'Accra',
      country: 'Ghana',
      status: 'active',
      image: 'https://images.unsplash.com/photo-1594502184342-2e12f877aa73?auto=format&fit=crop&w=1400&q=82',
      description: 'Showroom-inspected 2023 Toyota Land Cruiser 300 GR-Sport at Accra Premier Motors, Airport Residential. Full GRA ICUMS customs duty paid.'
    },
    {
      id: 'dealer-lexus-rx350',
      make: 'Lexus',
      model: 'RX 350',
      trim: 'F-Sport AWD',
      year: 2022,
      price: 920000,
      priceMinor: 92000000,
      currency: 'GHS',
      location: 'Accra, Ghana',
      mileage: 14800,
      fuel: 'Petrol',
      transmission: 'Automatic',
      engine: '2.4L Turbo',
      drivetrain: 'AWD',
      bodyType: 'SUV',
      exterior: 'Caviar Black',
      interior: 'Rioja Red',
      condition: 'Used',
      city: 'Accra',
      country: 'Ghana',
      status: 'active',
      image: 'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=1400&q=82',
      description: 'Clean-title 2022 Lexus RX 350 F-Sport inspected by Accra Premier Motors. Includes 150-point mechanical sheet and Tema port clearance.'
    },
    {
      id: 'dealer-range-rover-pending',
      make: 'Land Rover',
      model: 'Range Rover Sport',
      trim: 'P400 Dynamic SE',
      year: 2024,
      price: 2350000,
      priceMinor: 235000000,
      currency: 'GHS',
      location: 'Accra, Ghana',
      mileage: 4100,
      fuel: 'Petrol',
      transmission: 'Automatic',
      engine: '3.0L Ingenium I6',
      drivetrain: 'AWD',
      bodyType: 'SUV',
      exterior: 'Carpathian Grey',
      interior: 'Ebony Windsor',
      condition: 'Certified',
      city: 'Accra',
      country: 'Ghana',
      status: 'pending',
      image: 'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=1400&q=82',
      description: '2024 Range Rover Sport P400 Dynamic SE submitted by Accra Premier Motors with listing fee paid and ready for Admin approval.'
    },
    {
      id: 'dealer-hilux-unpaid',
      make: 'Toyota',
      model: 'Hilux',
      trim: '2.8 GD-6 Double Cab 4x4',
      year: 2023,
      price: 680000,
      priceMinor: 68000000,
      currency: 'GHS',
      location: 'Accra, Ghana',
      mileage: 11200,
      fuel: 'Diesel',
      transmission: 'Automatic',
      engine: '2.8L Turbo Diesel',
      drivetrain: '4WD',
      bodyType: 'Pickup',
      exterior: 'Oxide Bronze',
      interior: 'Black Leather',
      condition: 'Used',
      city: 'Accra',
      country: 'Ghana',
      status: 'pending',
      unpaid: true,
      image: 'https://images.unsplash.com/photo-1559416523-140ddc3d238c?auto=format&fit=crop&w=1400&q=82',
      description: '2023 Toyota Hilux 2.8 GD-6 4x4 Double Cab awaiting Paystack listing-fee payment to unlock marketplace review.'
    }
  ];

  const insertSupplierVehicle = db.prepare(`
    INSERT OR IGNORE INTO vehicles (
      id, dealer_id, make, model, trim, year, price, price_minor, currency, location, mileage,
      fuel, transmission, engine, drivetrain, body_type, exterior, interior, doors, seats,
      condition, city, country, description, listing_data, status, is_demo, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 4, 5, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `);
  const insertSupplierImage = db.prepare(
    'INSERT OR IGNORE INTO vehicle_images (id, vehicle_id, image_url, alt_text, sort_order) VALUES (?, ?, ?, ?, ?)'
  );
  const supplierExtraGalleries = {
    'dealer-land-cruiser-300': [
      ['/assets/editorial/defender.webp', '2023 Toyota Land Cruiser 300 GR-Sport — Off-road profile'],
      ['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1400&q=82', '2023 Toyota Land Cruiser 300 GR-Sport — Highway view'],
      ['/assets/editorial/car-detail.webp', '2023 Toyota Land Cruiser 300 GR-Sport — Showroom inspection']
    ],
    'dealer-lexus-rx350': [
      ['https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1400&q=82', '2022 Lexus RX 350 F-Sport — Front profile'],
      ['/assets/editorial/car-detail.webp', '2022 Lexus RX 350 F-Sport — Showroom detail'],
      ['https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1400&q=82', '2022 Lexus RX 350 F-Sport — Exterior finish']
    ],
    'dealer-range-rover-pending': [
      ['/assets/editorial/defender.webp', '2024 Range Rover Sport P400 — Side stance'],
      ['/assets/editorial/car-detail.webp', '2024 Range Rover Sport P400 — Showroom bay']
    ],
    'dealer-hilux-unpaid': [
      ['/assets/editorial/defender.webp', '2023 Toyota Hilux 2.8 GD-6 — 4x4 profile'],
      ['/assets/editorial/car-detail.webp', '2023 Toyota Hilux 2.8 GD-6 — Showroom inspection']
    ]
  };
  const insertSupplierFee = db.prepare(`
    INSERT OR IGNORE INTO listing_fee_payments (
      reference, seller_id, vehicle_id, amount_minor, currency, status, livemode, created_at, paid_at
    ) VALUES (?, ?, ?, 20000, 'GHS', 'paid', 0, ?, ?)
  `);

  for (const v of supplierVehicles) {
    insertSupplierVehicle.run(
      v.id,
      dealerId,
      v.make,
      v.model,
      v.trim,
      v.year,
      v.price,
      v.priceMinor,
      v.currency,
      v.location,
      v.mileage,
      v.fuel,
      v.transmission,
      v.engine,
      v.drivetrain,
      v.bodyType,
      v.exterior,
      v.interior,
      v.condition,
      v.city,
      v.country,
      v.description,
      JSON.stringify({ region: 'Greater Accra', customCleared: true, negotiable: true }),
      v.status,
      t,
      t
    );
    insertSupplierImage.run(`img-${v.id}`, v.id, v.image, `${v.year} ${v.make} ${v.model} — Main exterior`, 0);
    const extras = supplierExtraGalleries[v.id] || [];
    extras.forEach(([extraUrl, extraAlt], idx) => {
      insertSupplierImage.run(`img-${v.id}-${idx + 1}`, v.id, extraUrl, extraAlt, idx + 1);
    });
    if (!v.unpaid) {
      insertSupplierFee.run(`pay-${v.id}`, dealerId, v.id, t, t);
    }
  }

  db.prepare(
    "UPDATE vehicles SET allow_offers = 1, offer_min_minor = 172000000, offer_max_minor = 185000000 WHERE id = 'dealer-land-cruiser-300'"
  ).run();
  db.prepare(
    "UPDATE vehicles SET allow_offers = 1, offer_min_minor = 85000000, offer_max_minor = 92000000 WHERE id = 'dealer-lexus-rx350'"
  ).run();

  db.prepare(`
    INSERT OR IGNORE INTO vehicle_offers (
      id, vehicle_id, buyer_id, seller_id, buyer_name, buyer_email, amount_minor, currency, message, status, created_at, updated_at
    ) VALUES (
      'offer-seed-lc300-1', 'dealer-land-cruiser-300', ?, ?, 'Kwame Mensah', 'buyer@autoconnect.gh',
      178000000, 'GHS', 'Ready to close this week after Airport Residential showroom inspection.', 'pending', ?, ?
    )
  `).run(buyerId, dealerId, t, t);

  const insertSellerOp = db.prepare(`
    INSERT OR IGNORE INTO seller_operations (id, seller_id, kind, name, status, payload_json, created_at, updated_at, archived_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `);

  insertSellerOp.run(
    'sop-onboarding-accra',
    dealerId,
    'onboarding',
    'Accra Premier Motors Onboarding',
    'approved',
    JSON.stringify({
      sellerType: 'dealer',
      legalName: 'Accra Premier Motors Ltd',
      businessType: 'Registered Dealership',
      address: '14 Liberation Road, Airport Residential',
      city: 'Accra',
      region: 'Greater Accra',
      contactEmail: 'dealer@autoconnect.gh',
      phone: '+233 30 274 8800',
      categories: 'SUV, Luxury Sedan, 4x4 Pickup',
      deliveryLocations: 'Accra, Tema, Kumasi, Takoradi',
      termsAccepted: true,
      termsVersion: '2026-v1',
      completed: true
    }),
    t,
    t
  );

  insertSellerOp.run(
    'sop-business-accra',
    dealerId,
    'business',
    'Accra Premier Motors Ltd (RGD)',
    'approved',
    JSON.stringify({
      legalName: 'Accra Premier Motors Ltd',
      registrationNumber: 'CS-194820217',
      businessType: 'Limited Liability Company',
      taxCountry: 'Ghana',
      representative: 'Kofi Osei-Bonsu',
      ownershipNotes: 'Verified Ghana Registrar General Department dealership certificate.',
      providerReference: 'RGD-GH-2026-APM'
    }),
    t,
    t
  );

  insertSellerOp.run(
    'sop-store-accra',
    dealerId,
    'store',
    'Accra Premier Motors Showroom',
    'published',
    JSON.stringify({
      displayName: 'Accra Premier Motors',
      logoUrl: 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?auto=format&fit=crop&w=400&q=80',
      coverUrl: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1400&q=80',
      description: 'Authorized multi-brand luxury and 4x4 showroom in Airport Residential, Accra with GRA ICUMS duty verification.',
      openingHours: 'Mon–Sat 08:30–18:00',
      pickupLocations: 'Airport Residential Showroom, Tema Bonded Terminal',
      shippingPolicy: 'Nationwide flatbed delivery to Kumasi, Takoradi, and Tamale within 48 hours.',
      returnPolicy: '7-day mechanical inspection guarantee on showroom inventory.',
      cancellationPolicy: 'Full reservation refund prior to DVLA transfer.',
      warrantyPolicy: '6-month powertrain warranty on certified showroom vehicles.',
      vacationMode: 'false'
    }),
    t,
    t
  );

  insertSellerOp.run(
    'sop-stock-lc300',
    dealerId,
    'stock',
    'LC300-GR-2023-ACC',
    'in_stock',
    JSON.stringify({
      listingId: 'dealer-land-cruiser-300',
      sku: 'LC300-GR-2023-ACC',
      quantity: 2,
      threshold: 1,
      variants: 'Pearl White / Twin-Turbo Diesel',
      description: 'Airport Residential Showroom bay A1 & A2'
    }),
    t,
    t
  );

  insertSellerOp.run(
    'sop-stock-rx350',
    dealerId,
    'stock',
    'LEX-RX350-FSPORT-22',
    'low_stock',
    JSON.stringify({
      listingId: 'dealer-lexus-rx350',
      sku: 'LEX-RX350-FSPORT-22',
      quantity: 1,
      threshold: 1,
      variants: 'Caviar Black / Rioja Red Interior',
      description: 'Last unit on showroom floor — high enquiry velocity'
    }),
    t,
    t
  );

  insertSellerOp.run(
    'sop-order-1001',
    dealerId,
    'orders',
    'ORD-GH-202601 - Kwame Mensah',
    'accepted',
    JSON.stringify({
      buyerId,
      reference: 'ORD-GH-202601',
      listingId: 'dealer-land-cruiser-300',
      customerName: 'Kwame Mensah',
      deliveryCity: 'Accra (East Legon)',
      amount: 1850000,
      currency: 'GHS',
      deliveryMethod: 'Showroom Handover & DVLA Transfer',
      tracking: 'AC-TRK-88410',
      carrier: 'Accra Premier Concierge',
      items: '2023 Toyota Land Cruiser 300 GR-Sport',
      notes: 'Buyer requested pre-delivery inspection at Airport Residential.'
    }),
    t,
    t
  );

  insertSellerOp.run(
    'sop-order-1002',
    dealerId,
    'orders',
    'ORD-GH-202602 - Ama Serwaa',
    'pending',
    JSON.stringify({
      buyerId,
      reference: 'ORD-GH-202602',
      listingId: 'dealer-lexus-rx350',
      customerName: 'Ama Serwaa',
      deliveryCity: 'Kumasi (Ahodwo)',
      amount: 920000,
      currency: 'GHS',
      deliveryMethod: 'Flatbed Carrier Delivery',
      tracking: 'AC-TRK-88455',
      carrier: 'Ghana Corridor Auto Transport',
      items: '2022 Lexus RX 350 F-Sport AWD',
      notes: 'Awaiting showroom dispatch confirmation.'
    }),
    t,
    t
  );

  insertSellerOp.run(
    'sop-promo-2026',
    dealerId,
    'promotions',
    'Tema Port Clearance Special',
    'active',
    JSON.stringify({
      code: 'ACCRAVIP5',
      discountPercent: 5,
      startsAt: '2026-01-01',
      endsAt: '2026-12-31',
      eligibility: 'Verified buyers booking showroom inspection',
      budget: 50000,
      bundleListings: 'dealer-land-cruiser-300, dealer-lexus-rx350',
      description: '5% complimentary DVLA registration & comprehensive insurance package.'
    }),
    t,
    t
  );

  insertSellerOp.run(
    'sop-reply-inspection',
    dealerId,
    'replies',
    'Standard Showroom Viewing Confirmation',
    'active',
    JSON.stringify({
      category: 'Inspection',
      body: 'Thank you for contacting Accra Premier Motors. This vehicle is physically available at our Airport Residential showroom with full GRA ICUMS customs documentation. Let us know your preferred time for a test drive.'
    }),
    t,
    t
  );

  db.prepare(`
    INSERT OR IGNORE INTO enquiries (id, vehicle_id, buyer_id, dealer_id, message, original_message, admin_status, forwarded_to_seller, admin_notes, status, created_at, forwarded_at)
    VALUES ('enq-seed-lc300', 'dealer-land-cruiser-300', ?, ?, 'Is the 2023 Land Cruiser 300 GR-Sport available for inspection tomorrow morning? Also confirming GRA ICUMS duty papers are ready.', 'Good afternoon Accra Premier Motors, is the 2023 Land Cruiser 300 GR-Sport available for inspection tomorrow morning at Airport Residential? Call me on 0240000000. Also confirming ICUMS duty papers are ready.', 'forwarded', 1, 'Removed direct phone number and dealer name before forwarding to seller.', 'new', ?, ?)
  `).run(buyerId, dealerId, t, t);

  db.prepare(`
    INSERT OR IGNORE INTO enquiries (id, vehicle_id, buyer_id, dealer_id, message, original_message, admin_status, forwarded_to_seller, admin_notes, status, created_at)
    VALUES ('enq-seed-rx350-pending', 'dealer-lexus-rx350', ?, ?, 'Please confirm if the 2022 Lexus RX 350 F-Sport has complete service history and Tema port clearance documents.', 'Please confirm if the 2022 Lexus RX 350 F-Sport has complete service history and Tema port clearance documents.', 'pending_admin', 0, '', 'new', ?)
  `).run(buyerId, dealerId, t);

  db.prepare(`
    INSERT OR IGNORE INTO enquiry_messages (id, enquiry_id, sender_id, message, created_at)
    VALUES ('enq-msg-seed-1', 'enq-seed-lc300', ?, 'Is the 2023 Land Cruiser 300 GR-Sport available for inspection tomorrow morning? Also confirming GRA ICUMS duty papers are ready.', ?)
  `).run(buyerId, t);

  db.prepare(`
    INSERT OR IGNORE INTO reports (id, vehicle_id, seller_id, reporter_id, reason, details, status, created_at)
    VALUES ('rep-seed-mileage-check', 'dealer-lexus-rx350', ?, ?, 'Verify odometer certificate', 'Buyer requested verification of Japanese export auction sheet mileage against dashboard reading.', 'open', ?)
  `).run(dealerId, buyerId, t);

  const insertAdminOp = db.prepare(`
    INSERT OR IGNORE INTO operations_records (id, kind, name, status, payload_json, created_at, updated_at, archived_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
  `);

  insertAdminOp.run(
    'adm-org-accra',
    'organizations',
    'Accra Premier Motors Group',
    'active',
    JSON.stringify({
      ownerEmail: 'dealer@autoconnect.gh',
      region: 'Greater Accra',
      plan: 'Enterprise Showroom',
      seatLimit: 15,
      notes: 'Primary verified dealership partner in Accra.'
    }),
    t,
    t
  );

  insertAdminOp.run(
    'adm-team-compliance',
    'teams',
    'Ghana Customs & Dealer Compliance',
    'active',
    JSON.stringify({
      organization: 'AutoConnect Ghana',
      leadEmail: 'admin@autoconnect.gh',
      members: '4 compliance officers',
      scope: 'Dealer KYB, GRA ICUMS checks & vehicle approvals',
      notes: 'Covers Greater Accra, Ashanti, and Western corridors.'
    }),
    t,
    t
  );

  insertAdminOp.run(
    'adm-role-moderator',
    'roles',
    'Senior Marketplace Moderator',
    'active',
    JSON.stringify({
      permissions: 'vehicles:review, dealers:review, reports:review, billing:view',
      scope: 'National Marketplace',
      description: 'Approves paid supplier listings and resolves buyer trust reports.'
    }),
    t,
    t
  );

  insertAdminOp.run(
    'adm-ticket-kumasi',
    'tickets',
    'Kumasi Royal Auto Onboarding Review',
    'open',
    JSON.stringify({
      requesterEmail: 'kumasi.motors@autoconnect.gh',
      priority: 'high',
      assignee: 'admin@autoconnect.gh',
      category: 'Supplier KYB',
      summary: 'Verify Suame Magazine showroom trade license and approve supplier profile.',
      publicReply: 'Compliance team is reviewing your RGD business certificate.'
    }),
    t,
    t
  );

  insertAdminOp.run(
    'adm-flag-instant-verify',
    'flags',
    'ghana-icums-vin-lookup',
    'enabled',
    JSON.stringify({
      environment: 'production',
      rolloutPercent: 100,
      targetRole: 'dealer',
      description: 'Enables GRA ICUMS customs duty estimator and VIN validation on supplier listings.'
    }),
    t,
    t
  );

  insertAdminOp.run(
    'adm-setting-listing-fee',
    'settings',
    'standard_listing_fee_ghs',
    'active',
    JSON.stringify({
      key: 'standard_listing_fee_ghs',
      value: '250.00',
      category: 'Billing',
      description: 'Standard per-listing publication fee in Ghana Cedis (GHS).'
    }),
    t,
    t
  );
}
seedAdminAndSupplierPanelData(seededAccounts);

async function api(req,res,url) {
  const p=url.pathname; const method=req.method; const user=session(req);
  if(await paymentPreparation(req,res,url,user))return;
  if(await listingBilling(req,res,url,user))return;
  if(await adminOperations(req,res,url,user))return;
  if(await sellerOperations(req,res,url,user))return;
  if(await buyerOperations(req,res,url,user))return;
  if(p==='/' && method==='GET') return null;
  if(p==='/api/health'&&method==='GET') return send(res,200,{status:'ok',service:'apex-marketplace-mvp',database:'connected'});
  const mediaPath=p.match(/^\/api\/media\/([\w-]+)$/);
  if(mediaPath&&method==='GET'){
    const media=db.prepare(`SELECT m.id,m.vehicle_id,m.mime_type,m.data,v.status,v.deleted_at,v.is_demo,v.dealer_id,dp.status dealer_status,seller.status seller_status
      FROM vehicle_media m JOIN vehicles v ON v.id=m.vehicle_id LEFT JOIN dealer_profiles dp ON dp.user_id=v.dealer_id LEFT JOIN users seller ON seller.id=v.dealer_id WHERE m.id=?`).get(mediaPath[1]);
    if(!media)return fail(res,404,'Photo not found.');
    const publicListing=(media.is_demo===1||listingBilling.paid(media.vehicle_id||media.id)&&sellerIdentityAllowed(media.dealer_id))&&media.deleted_at===null&&media.status==='active'&&(media.is_demo===1||media.dealer_status==='approved'&&media.seller_status==='active');
    const privateOwner=user?.role==='admin'||user?.role==='dealer'&&user.id===media.dealer_id;
    if(!publicListing&&!privateOwner)return fail(res,404,'Photo not found.');
    res.writeHead(200,{'Content-Type':media.mime_type,'Content-Length':media.data.length,'X-Content-Type-Options':'nosniff','Cache-Control':publicListing?'public, max-age=300':'private, no-store'});return res.end(media.data);
  }
  if(
    p==='/api/vehicles' ||
    p.startsWith('/api/vehicles/') ||
    p.startsWith('/api/supplier/') ||
    p.startsWith('/api/paystack/') ||
    p==='/api/admin/summary' ||
    p==='/api/admin/panel' ||
    p==='/api/admin/suppliers' ||
    p.startsWith('/api/admin/suppliers/') ||
    p==='/api/admin/audit-logs'
  ) {
    expressApp(req,res);
    return;
  }
  if(p==='/api/listings'&&method==='GET') return send(res,200,listVehicles(url));
  const listingOfferRoute=p.match(/^\/api\/listings\/([\w-]+)\/offers$/);
  if(listingOfferRoute&&method==='POST') {
    if(!requestOriginOK(req))return fail(res,403,'Request origin is not allowed.');
    const vehicleRow=db.prepare('SELECT id,dealer_id,make,model,year,currency,allow_offers,listing_data,deleted_at FROM vehicles WHERE id=?').get(listingOfferRoute[1]);
    if(!vehicleRow||vehicleRow.deleted_at)return fail(res,404,'Vehicle not found.');
    let ld={};try{ld=JSON.parse(vehicleRow.listing_data||'{}');}catch{}
    if(!vehicleRow.allow_offers&&!ld.allowOffers)return fail(res,400,'This vehicle listing is not accepting offers.');
    const b=await body(req);
    const rawAmount=b.amount!==undefined?Number(b.amount):b.amountMinor!==undefined?Number(b.amountMinor)/100:NaN;
    const amountMinor=b.amountMinor!==undefined?Math.round(Number(b.amountMinor)):Math.round(rawAmount*100);
    if(!Number.isFinite(amountMinor)||amountMinor<=0)return fail(res,400,'Enter a valid offer amount greater than zero.');
    const buyerProfile=user?.id?db.prepare('SELECT display_name FROM buyer_profiles WHERE user_id=?').get(user.id):null;
    const buyerName=String(b.buyerName||buyerProfile?.display_name||user?.email||'Marketplace Buyer').trim().slice(0,120);
    const buyerEmail=String(b.buyerEmail||user?.email||'').trim().slice(0,160);
    const message=String(b.message||'').trim().slice(0,1000);
    const offerId=id();const t=nowIso();const currency=['GHS','USD'].includes(b.currency)?b.currency:vehicleRow.currency||'GHS';
    db.prepare('INSERT INTO vehicle_offers(id,vehicle_id,buyer_id,seller_id,buyer_name,buyer_email,amount_minor,currency,message,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,\'pending\',?,?)')
      .run(offerId,vehicleRow.id,user?.id||null,vehicleRow.dealer_id||null,buyerName,buyerEmail,amountMinor,currency,message,t,t);
    if(vehicleRow.dealer_id)addNotification(vehicleRow.dealer_id,'offer',`New offer of ${currency} ${(amountMinor/100).toLocaleString()} on ${vehicleRow.year} ${vehicleRow.make} ${vehicleRow.model}.`);
    return send(res,201,{offer:{id:offerId,vehicle_id:vehicleRow.id,amount:amountMinor/100,amount_minor:amountMinor,currency,message,status:'pending',created_at:t},notice:'Your offer has been sent to the seller.'});
  }
  const listingBuyRoute=p.match(/^\/api\/listings\/([\w-]+)\/buy$/);
  if(listingBuyRoute&&method==='POST') {
    if(!user)return fail(res,401,'Please sign in with a buyer account to purchase a vehicle.');
    if(!requireRole(user,'buyer',res)||!requireCsrf(req,res,user))return;
    const vehicleRow=db.prepare('SELECT id,dealer_id,make,model,trim,year,price,price_minor,currency,city,listing_data,allow_deposit,deposit_amount_minor,status,is_demo,deleted_at FROM vehicles WHERE id=?').get(listingBuyRoute[1]);
    if(!vehicleRow||vehicleRow.deleted_at)return fail(res,404,'Vehicle not found.');
    if(vehicleRow.status==='sold')return fail(res,409,'This vehicle has already been sold.');
    const b=await body(req);
    const askingMajor=vehicleRow.price&&Number(vehicleRow.price)>0?Number(vehicleRow.price):Math.round((Number(vehicleRow.price_minor)||0)/100);
    let ld={};try{ld=JSON.parse(vehicleRow.listing_data||'{}');}catch{}
    const allowDeposit=vehicleRow.allow_deposit!==undefined&&vehicleRow.allow_deposit!==null?Boolean(vehicleRow.allow_deposit):ld.allowDeposit!==undefined?Boolean(ld.allowDeposit):true;
    const paymentPlan=b.paymentPlan==='deposit'?'deposit':'full';
    if(paymentPlan==='deposit'&&!allowDeposit)return fail(res,400,'Reservation deposits are not enabled by the seller for this vehicle. Please select full payment.');
    const configuredDepositMajor=vehicleRow.deposit_amount_minor?Math.round(Number(vehicleRow.deposit_amount_minor))/100:Number(ld.depositAmount||0);
    const sellerDepositMajor=configuredDepositMajor>0&&configuredDepositMajor<askingMajor?configuredDepositMajor:Math.max(1,Math.round(askingMajor*0.10));
    const payableMajor=paymentPlan==='deposit'?sellerDepositMajor:askingMajor;
    const balanceMajor=Math.max(0,askingMajor-payableMajor);
    const payableMinor=Math.round(payableMajor*100);
    const currency=['GHS','USD'].includes(b.currency)?b.currency:vehicleRow.currency||'GHS';
    const channel=['mobile_money','card','bank_transfer'].includes(b.channel)?b.channel:'mobile_money';
    const provider=String(b.provider||(channel==='mobile_money'?'MTN MoMo':channel==='card'?'Visa / Mastercard':'Bank Transfer / USSD')).trim().slice(0,80);
    const deliveryMethod=String(b.deliveryMethod||b.deliveryOption||'Auto Connect Showroom Handover (Accra)').trim().slice(0,120);
    const deliveryCity=String(b.deliveryCity||vehicleRow.city||'Accra').trim().slice(0,80);
    const notes=String(b.notes||'').trim().slice(0,1000);
    const buyerProfile=db.prepare('SELECT display_name FROM buyer_profiles WHERE user_id=?').get(user.id);
    const buyerName=String(b.buyerName||buyerProfile?.display_name||user.email||'Verified Buyer').trim().slice(0,120);
    const orderId=id();
    const orderRef=`ORD-GH-${String(Date.now()).slice(-6)}`;
    const paystackRef=`ps_buy_${id().replace(/-/g,'').slice(0,12)}`;
    const t=nowIso();
    const fallbackSeller=db.prepare("SELECT id FROM users WHERE role='dealer' ORDER BY created_at ASC LIMIT 1").get();
    const sellerId=vehicleRow.dealer_id||fallbackSeller?.id||user.id;
    const vehicleTitle=`${vehicleRow.year} ${vehicleRow.make} ${vehicleRow.model}${vehicleRow.trim?` ${vehicleRow.trim}`:''}`;
    if(sellerId){
      db.prepare('INSERT INTO seller_operations(id,seller_id,kind,name,status,payload_json,created_at,updated_at,archived_at) VALUES(?,?,\'orders\',?,\'pending\',?,?,?,NULL)')
        .run(orderId,sellerId,`${orderRef} · ${vehicleTitle}`,JSON.stringify({
          buyerId:user.id,
          reference:orderRef,
          paystackReference:paystackRef,
          listingId:vehicleRow.id,
          customerName:`Verified Buyer (${buyerName.split(' ')[0]||'Buyer'})`,
          deliveryCity,
          deliveryMethod,
          amount:payableMajor,
          totalVehiclePrice:askingMajor,
          balanceDue:balanceMajor,
          paymentPlan,
          paymentChannel:channel,
          paymentProvider:provider,
          currency,
          carrier:'Auto Connect Escrow Logistics',
          tracking:`AC-TRK-${String(Date.now()).slice(-5)}`,
          items:`${vehicleTitle} (${paymentPlan==='deposit'?'Seller Reservation Deposit':'Full Vehicle Purchase'})`,
          notes
        }),t,t);
    }
    db.prepare('INSERT INTO payments(id,user_id,provider,external_payment_id,amount_minor,currency,status,created_at) VALUES(?,?,\'paystack\',?,?,?,\'paid\',?)')
      .run(id(),user.id,paystackRef,payableMinor,currency,t);
    addNotification(user.id,'order',`Order ${orderRef} confirmed for ${vehicleTitle} (${currency} ${payableMajor.toLocaleString()} paid via Paystack · Held in Auto Connect Escrow).`);
    if(vehicleRow.dealer_id){
      addNotification(vehicleRow.dealer_id,'order',`New Auto Connect Escrow order (${orderRef}) received for ${vehicleTitle} (${currency} ${payableMajor.toLocaleString()}).`);
    }
    for(const adminRow of db.prepare("SELECT id FROM users WHERE role='admin' AND status='active'").all()){
      addNotification(adminRow.id,'order',`New vehicle purchase ${orderRef} on ${vehicleTitle} (${currency} ${payableMajor.toLocaleString()} via Paystack ${provider}).`);
    }
    adminLog(user,'buyer.vehicle.purchase','vehicle',vehicleRow.id,{orderId,orderRef,paystackRef,paymentPlan,amount:payableMajor,currency,channel,provider});
    return send(res,201,{
      order:{
        id:orderId,
        reference:orderRef,
        paystackReference:paystackRef,
        vehicleId:vehicleRow.id,
        vehicleTitle,
        paymentPlan,
        amount:payableMajor,
        amountPaid:payableMajor,
        balanceDue:balanceMajor,
        amountMinor:payableMinor,
        totalVehiclePrice:askingMajor,
        currency,
        channel,
        provider,
        deliveryMethod,
        deliveryOption:deliveryMethod,
        deliveryCity,
        status:'paid_escrow',
        created_at:t
      },
      notice:`Payment approved via Paystack (${orderRef}). Funds are held safely in Auto Connect Escrow while our team coordinates inspection and handover.`
    });
  }
  if(p.startsWith('/api/listings/')&&method==='GET') {const vehicle=getVehicle(decodeURIComponent(p.slice('/api/listings/'.length)));if(!vehicle)return fail(res,404,'Vehicle not found.');db.prepare('INSERT INTO vehicle_views(id,vehicle_id) VALUES(?,?)').run(id(),vehicle.id);vehicle.price_context=getPriceContext(vehicle);return send(res,200,{vehicle});}
  const sellerRoute=p.match(/^\/api\/sellers\/([\w-]+)$/);
  if(sellerRoute&&method==='GET') {
    const profile=db.prepare(`SELECT dp.user_id,dp.seller_type,dp.business_name,dp.description,dp.city,dp.country,dp.region,dp.profile_photo_url,dp.logo_url,dp.years_in_business,dp.opening_hours,dp.created_at,dp.status,u.status user_status
      FROM dealer_profiles dp JOIN users u ON u.id=dp.user_id WHERE dp.user_id=? AND dp.status='approved' AND u.status='active'`).get(sellerRoute[1]);
    if(!profile)return fail(res,404,'Seller profile is not available.');
    const vehicles=db.prepare(`${publicSelect} WHERE v.dealer_id=? AND v.status='active' AND v.deleted_at IS NULL${identitySql()} ORDER BY v.created_at DESC`).all(profile.user_id).map(carFromRow);
    // Middleman privacy: never expose seller phone, WhatsApp, website, or email to buyers
    const publicProfile={id:profile.user_id,type:profile.seller_type,name:profile.business_name,description:profile.description,city:profile.city,region:profile.region,country:profile.country,phone:'',whatsapp:'',preferredContact:'website',website:'',profilePhoto:profile.profile_photo_url,logo:profile.logo_url,yearsInBusiness:profile.years_in_business,openingHours:profile.seller_type==='dealer'?profile.opening_hours:'',memberSince:profile.created_at,activeCount:vehicles.length,soldCount:db.prepare("SELECT count(*) n FROM vehicles WHERE dealer_id=? AND status='sold' AND deleted_at IS NULL AND is_demo=0").get(profile.user_id).n};
    const store=sellerOperations.publicStore(profile.user_id);Object.assign(publicProfile,{store,name:store.displayName||publicProfile.name,description:store.description||publicProfile.description,logo:store.logoUrl||publicProfile.logo,openingHours:store.openingHours||publicProfile.openingHours,phone:'',whatsapp:'',website:''});
    return send(res,200,{profile:publicProfile,vehicles});
  }
  if(p==='/api/buyer/recently-viewed'&&method==='GET') {
    if(!requireRole(user,'buyer',res))return;
    const rows=db.prepare(`${publicSelect} JOIN recently_viewed r ON r.vehicle_id=v.id WHERE r.user_id=? AND v.status='active' ORDER BY r.viewed_at DESC LIMIT 12`).all(user.id);
    return send(res,200,{items:rows.filter(row=>getVehicle(row.id)).map(carFromRow)});
  }
  const viewed=p.match(/^\/api\/buyer\/recently-viewed\/([\w-]+)$/);
  if(viewed&&method==='POST') {
    if(!requireRole(user,'buyer',res)||!requireCsrf(req,res,user))return;
    if(!getVehicle(viewed[1]))return fail(res,404,'Vehicle not found.');
    db.prepare(`INSERT INTO recently_viewed(user_id,vehicle_id,viewed_at) VALUES(?,?,?)
      ON CONFLICT(user_id,vehicle_id) DO UPDATE SET viewed_at=excluded.viewed_at`).run(user.id,viewed[1],nowIso());
    return send(res,200,{saved:true});
  }
  if(p==='/api/auth/me'&&method==='GET') return send(res,200,{user:user?{id:user.id,email:user.email,role:user.role,emailVerified:Boolean(user.email_verified)}:null,csrfToken:user?.csrf_token||null});
  if(p==='/api/auth/register'&&method==='POST') {
    if(!requireCsrf(req,res,null)||!rateLimit(req,res)) return;
    const b=await body(req); const email=String(b.email||'').trim().toLowerCase(); const password=String(b.password||''); const role=b.role==='dealer'?'dealer':'buyer';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254) return fail(res,400,'Enter a valid email address.');
    if(password.length<12||password.length>200) return fail(res,400,'Use a password between 12 and 200 characters.');
    if(b.confirmPassword!==undefined&&String(b.confirmPassword)!==password) return fail(res,400,'Passwords do not match.');
    const phoneInput=String(b.phone||b.contactNumber||'').trim().slice(0,32);
    const salt=randomBytes(16).toString('hex');const digest=await scrypt(password,salt,64);const userId=id();
    try {
      db.exec('BEGIN IMMEDIATE');
      db.prepare('INSERT INTO users(id,email,password_hash,password_salt,role) VALUES(?,?,?,?,?)').run(userId,email,Buffer.from(digest).toString('hex'),salt,role);
      if(role==='dealer'){
        const sellerType=b.sellerType==='private'?'private':'dealer';const name=String(sellerType==='private'?(b.fullName||b.name):(b.businessName||'')).trim().slice(0,120);const contact=String(b.contactEmail||email).trim().toLowerCase();
        if(name.length<2) throw Object.assign(new Error(sellerType==='private'?'Enter your full name.':'Enter a business name.'),{status:400});
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)||contact.length>254)throw Object.assign(new Error('Enter a valid contact email.'),{status:400});
        const phone=phoneInput,whatsapp=String(b.whatsapp||'').trim().slice(0,32),region=String(b.region||'').trim().slice(0,80),city=String(b.city||'Accra').trim().slice(0,80);
        const preferred=['website','phone','whatsapp','email'].includes(b.preferredContact)?b.preferredContact:'website';
        db.prepare('INSERT INTO dealer_profiles(user_id,seller_type,business_name,description,city,country,contact_email,phone,whatsapp,region,preferred_contact) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(userId,sellerType,name,String(b.description||'').slice(0,1000),city,'Ghana',contact,phone,whatsapp,region,preferred);
      } else db.prepare('INSERT INTO buyer_profiles(user_id,display_name,phone) VALUES(?,?,?)').run(userId,String(b.name||'').trim().slice(0,100),phoneInput);
      db.exec('COMMIT');
    } catch(e){db.exec('ROLLBACK');if((e.code==='ERR_SQLITE_ERROR'||String(e.code||'').startsWith('SQLITE_'))&&String(e.message).includes('UNIQUE'))return fail(res,409,'An account with that email already exists.');throw e;}
    const csrfToken=setSession(res,userId,req);return send(res,201,{user:{id:userId,email,role,emailVerified:false},csrfToken});
  }
  if(p==='/api/auth/login'&&method==='POST') {
    if(!requireCsrf(req,res,null)||!rateLimit(req,res)) return;
    const b=await body(req);const email=String(b.email||'').trim().toLowerCase();const password=String(b.password||'');
    const row=db.prepare('SELECT id,email,password_hash,password_salt,role,status,email_verified FROM users WHERE email=?').get(email);
    const salt=row?.password_salt||'invalid-user-salt';const digest=await scrypt(password,salt,64);const expected=Buffer.from(row?.password_hash||'00'.repeat(64),'hex');
    if(!row||row.status!=='active'||!safeEqual(Buffer.from(digest).toString('hex'),expected.toString('hex'))) return fail(res,401,'Email or password is incorrect.');
    const csrfToken=setSession(res,row.id,req);return send(res,200,{user:{id:row.id,email:row.email,role:row.role,emailVerified:Boolean(row.email_verified)},csrfToken});
  }
  if(p==='/api/auth/password'&&method==='POST') {
    if(!requireRole(user,['buyer','dealer','admin'],res)||!requireCsrf(req,res,user))return;
    const b=await body(req);const currentPassword=String(b.currentPassword||''),newPassword=String(b.newPassword||'');
    if(newPassword.length<12||newPassword.length>200)return fail(res,400,'Use a new password between 12 and 200 characters.');
    const account=db.prepare('SELECT password_hash,password_salt FROM users WHERE id=?').get(user.id);
    const currentDigest=await scrypt(currentPassword,account.password_salt,64);
    if(!safeEqual(Buffer.from(currentDigest).toString('hex'),account.password_hash))return fail(res,401,'Current password is incorrect.');
    const salt=randomBytes(16).toString('hex');const digest=await scrypt(newPassword,salt,64);
    db.prepare('UPDATE users SET password_hash=?,password_salt=? WHERE id=?').run(Buffer.from(digest).toString('hex'),salt,user.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
    const csrfToken=setSession(res,user.id,req);
    return send(res,200,{ok:true,csrfToken});
  }
  if(p==='/api/auth/logout'&&method==='POST') {
    if(!requireCsrf(req,res,user)) return;
    const token=cookies(req).apex_session;if(token)db.prepare('DELETE FROM sessions WHERE id_hash=?').run(hash(token));
    const https = prod || req?.headers?.['x-forwarded-proto'] === 'https';
    const cookieAttrs = https && !process.env.PUBLIC_ORIGIN ? 'SameSite=None; Secure; Partitioned' : `SameSite=Strict${prod ? '; Secure' : ''}`;
    res.setHeader('Set-Cookie',`apex_session=; Path=/; HttpOnly; ${cookieAttrs}; Max-Age=0`);return send(res,200,{ok:true});
  }
  if(p==='/api/buyer/profile'&&method==='GET') {
    if(!requireRole(user,'buyer',res))return;
    return send(res,200,{profile:db.prepare('SELECT display_name,phone,avatar_url FROM buyer_profiles WHERE user_id=?').get(user.id)});
  }
  if(p==='/api/buyer/profile'&&method==='PUT') {
    if(!requireRole(user,'buyer',res)||!requireCsrf(req,res,user))return;
    const b=await body(req);const displayName=String(b.displayName||'').trim();const phone=String(b.phone||'').trim();
    if(displayName.length<2||displayName.length>100)return fail(res,400,'Enter a name between 2 and 100 characters.');
    if(phone.length>32||phone&&!/^[+\d() .-]{7,32}$/.test(phone))return fail(res,400,'Enter a valid phone number or leave it blank.');
    db.prepare('UPDATE buyer_profiles SET display_name=?,phone=? WHERE user_id=?').run(displayName,phone,user.id);
    return send(res,200,{profile:{display_name:displayName,phone,avatar_url:''}});
  }
  if(p==='/api/notifications'&&method==='GET') {
    if(!requireRole(user,['buyer','dealer','admin'],res))return;
    const items=db.prepare('SELECT id,kind,body,read_at,created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 30').all(user.id);
    return send(res,200,{items,unreadCount:items.filter(item=>!item.read_at).length});
  }
  if(p==='/api/notifications/read-all'&&method==='PATCH') {
    if(!requireRole(user,['buyer','dealer','admin'],res)||!requireCsrf(req,res,user))return;
    db.prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').run(nowIso(),user.id);
    return send(res,200,{ok:true});
  }
  const notification=p.match(/^\/api\/notifications\/([\w-]+)\/read$/);
  if(notification&&method==='PATCH') {
    if(!requireRole(user,['buyer','dealer','admin'],res)||!requireCsrf(req,res,user))return;
    const result=db.prepare('UPDATE notifications SET read_at=? WHERE id=? AND user_id=? AND read_at IS NULL').run(nowIso(),notification[1],user.id);
    if(!result.changes)return fail(res,404,'Unread notification not found.');
    return send(res,200,{ok:true});
  }
  if(p==='/api/favourites'&&method==='GET') {
    if(!requireRole(user,'buyer',res))return;
    const rows=db.prepare(`${publicSelect} JOIN favourites f ON f.vehicle_id=v.id WHERE f.user_id=? ORDER BY f.created_at DESC`).all(user.id);
    return send(res,200,{items:rows.map(row=>{const baseline=db.prepare('SELECT price_minor FROM buyer_saved_prices WHERE buyer_id=? AND vehicle_id=?').get(user.id,row.id);return {...carFromRow(row),available:!!getVehicle(row.id),priceChange:baseline?(row.price_minor-baseline.price_minor)/100:null};})});
  }
  const fav=p.match(/^\/api\/favourites\/([\w-]+)$/);
  if(fav&&['PUT','DELETE'].includes(method)) {
    if(!requireRole(user,'buyer',res)||!requireCsrf(req,res,user))return;
    const vehicle=method==='DELETE'||getVehicle(fav[1]);if(!vehicle)return fail(res,404,'Vehicle not found.');
    if(method==='PUT'){db.prepare('INSERT OR IGNORE INTO favourites(user_id,vehicle_id) VALUES(?,?)').run(user.id,fav[1]);db.prepare('INSERT OR IGNORE INTO buyer_saved_prices(buyer_id,vehicle_id,price_minor) VALUES(?,?,?)').run(user.id,fav[1],Math.round(vehicle.price*100));}
    else {db.prepare('DELETE FROM favourites WHERE user_id=? AND vehicle_id=?').run(user.id,fav[1]);db.prepare('DELETE FROM buyer_saved_prices WHERE buyer_id=? AND vehicle_id=?').run(user.id,fav[1]);}
    return send(res,200,{saved:method==='PUT'});
  }
  if(p==='/api/saved-searches'&&method==='GET') {
    if(!requireRole(user,'buyer',res))return;
    return send(res,200,{items:db.prepare('SELECT id,label,query_json,alerts_enabled,created_at FROM saved_searches WHERE user_id=? ORDER BY created_at DESC').all(user.id)});
  }
  if(p==='/api/saved-searches'&&method==='POST') {
    if(!requireRole(user,'buyer',res)||!requireCsrf(req,res,user))return;
    const b=await body(req);const label=String(b.label||'Saved search').trim().slice(0,80);const search=JSON.stringify(b.search||{});
    const savedId=id();db.prepare('INSERT INTO saved_searches(id,user_id,label,query_json,alerts_enabled) VALUES(?,?,?,?,0)').run(savedId,user.id,label,search);
    return send(res,201,{id:savedId,label});
  }
  const savedSearch=p.match(/^\/api\/saved-searches\/([\w-]+)$/);
  if(savedSearch&&method==='DELETE') {
    if(!requireRole(user,'buyer',res)||!requireCsrf(req,res,user))return;
    const result=db.prepare('DELETE FROM saved_searches WHERE id=? AND user_id=?').run(savedSearch[1],user.id);
    if(!result.changes)return fail(res,404,'Saved search not found.');
    return send(res,200,{deleted:true});
  }
  if(p==='/api/enquiries'&&method==='POST') {
    if(!requireRole(user,'buyer',res)||!requireCsrf(req,res,user))return;
    const b=await body(req);const vehicle=getVehicle(String(b.vehicleId||''));const message=String(b.message||'').trim();
    if(!vehicle)return fail(res,404,'Vehicle not found.');
    if(message.length<12||message.length>2000)return fail(res,400,'Write an enquiry between 12 and 2,000 characters.');
    const dealerId=db.prepare('SELECT dealer_id FROM vehicles WHERE id=?').get(vehicle.id)?.dealer_id||null;
    if(dealerId&&sellerOperations.isBlocked(dealerId,user.id))return fail(res,403,'This seller is not accepting messages from this account.');
    if(dealerId&&sellerOperations.isVacation(dealerId))return fail(res,409,'This seller is temporarily away. Try again when their store reopens.');
    const enquiryId=id();
    db.prepare("INSERT INTO enquiries(id,vehicle_id,buyer_id,dealer_id,message,original_message,admin_status,forwarded_to_seller) VALUES(?,?,?,?,?,?,'pending_admin',0)").run(enquiryId,vehicle.id,user.id,dealerId,message,message);
    if(b.isInspection||/inspection/i.test(message)){
      db.prepare('INSERT INTO inspections(id,vehicle_id,provider_id,status,report_key,created_at) VALUES(?,?,?,?,?,?)').run(id(),vehicle.id,user.id,'requested',enquiryId,nowIso());
    }
    for(const adminRow of db.prepare("SELECT id FROM users WHERE role='admin' AND status='active'").all()){
      addNotification(adminRow.id,'admin_enquiry',`New buyer enquiry awaiting admin review for ${vehicle.year} ${vehicle.make} ${vehicle.model}.`);
    }
    return send(res,201,{id:enquiryId,status:'new',adminStatus:'pending_admin',forwardedToSeller:false,notice:'Received by Auto Connect Admin for review and forwarding to the seller. Email delivery is not configured.'});
  }
  if(p==='/api/buyer/enquiries'&&method==='GET') {
    if(!requireRole(user,'buyer',res))return;
    const items=db.prepare(`SELECT e.id,e.vehicle_id,e.message,e.original_message,e.admin_status,e.forwarded_to_seller,e.status,e.created_at,v.make,v.model,v.year,'Auto Connect Middleman Desk' dealer_name
      FROM enquiries e JOIN vehicles v ON v.id=e.vehicle_id
      WHERE e.buyer_id=? ORDER BY e.created_at DESC`).all(user.id).map(e=>({...e,forwardedToSeller:Boolean(e.forwarded_to_seller)}));
    return send(res,200,{items});
  }
  const enquiryThread=p.match(/^\/api\/enquiries\/([\w-]+)\/messages$/);
  if(enquiryThread&&['GET','POST'].includes(method)) {
    if(!requireRole(user,['buyer','dealer','admin'],res))return;
    const enquiry=db.prepare('SELECT id,buyer_id,dealer_id,message,original_message,admin_status,forwarded_to_seller,created_at,status FROM enquiries WHERE id=?').get(enquiryThread[1]);
    if(!enquiry)return fail(res,404,'Enquiry not found.');
    if(user.role==='buyer'&&enquiry.buyer_id!==user.id)return fail(res,404,'Enquiry not found.');
    if(user.role==='dealer'&&(enquiry.dealer_id!==user.id||!enquiry.forwarded_to_seller))return fail(res,404,'Enquiry not found.');
    if(method==='POST'&&user.role==='buyer'&&sellerOperations.isBlocked(enquiry.dealer_id,user.id))return fail(res,403,'This conversation is no longer accepting messages.');
    if(method==='GET') {
      const replies=db.prepare(`SELECT m.id,m.sender_id,u.role sender_role,m.message,m.created_at FROM enquiry_messages m JOIN users u ON u.id=m.sender_id WHERE m.enquiry_id=? ORDER BY m.created_at,m.id`).all(enquiry.id);
      return send(res,200,{items:[{id:enquiry.id,sender_id:enquiry.buyer_id,sender_role:'buyer',message:enquiry.message,created_at:enquiry.created_at},...replies],adminStatus:enquiry.admin_status,forwardedToSeller:Boolean(enquiry.forwarded_to_seller)});
    }
    if(!requireCsrf(req,res,user))return;
    const b=await body(req);const message=String(b.message||'').trim();
    if(message.length<2||message.length>2000)return fail(res,400,'Write a reply between 2 and 2,000 characters.');
    db.prepare('INSERT INTO enquiry_messages(id,enquiry_id,sender_id,message) VALUES(?,?,?,?)').run(id(),enquiry.id,user.id,message);
    db.prepare('UPDATE enquiries SET status=? WHERE id=?').run(user.role==='dealer'?'replied':'read',enquiry.id);
    const recipient=user.role==='dealer'?enquiry.buyer_id:(enquiry.forwarded_to_seller?enquiry.dealer_id:null);
    if(recipient){const vehicle=db.prepare('SELECT year,make,model FROM vehicles WHERE id=(SELECT vehicle_id FROM enquiries WHERE id=?)').get(enquiry.id);addNotification(recipient,'message',`New reply about ${vehicle.year} ${vehicle.make} ${vehicle.model}.`);}
    return send(res,201,{status:user.role==='dealer'?'replied':'read'});
  }
  if(p==='/api/reports'&&method==='POST') {
    if(!requireRole(user,'buyer',res)||!requireCsrf(req,res,user))return;
    const b=await body(req);const reason=String(b.reason||'Other').slice(0,80),details=String(b.details||'').slice(0,1000),sellerId=String(b.sellerId||'');
    if(sellerId){const profile=db.prepare("SELECT dp.user_id FROM dealer_profiles dp JOIN users u ON u.id=dp.user_id WHERE dp.user_id=? AND dp.status='approved' AND u.status='active'").get(sellerId);if(!profile)return fail(res,404,'Seller profile not found.');}
    else if(!getVehicle(String(b.vehicleId||'')))return fail(res,404,'Vehicle not found.');
    const reportId=id();db.prepare('INSERT INTO reports(id,reporter_id,vehicle_id,seller_id,reason,details) VALUES(?,?,?,?,?,?)').run(reportId,user.id,sellerId?null:b.vehicleId||null,sellerId||null,reason,details);
    return send(res,201,{id:reportId,status:'open'});
  }
  if(p==='/api/dealer/profile'&&method==='PUT') {
    if(!requireRole(user,'dealer',res)||!requireCsrf(req,res,user))return;
    const current=db.prepare('SELECT seller_type,business_name,city,region,contact_email,phone,whatsapp,preferred_contact,public_phone,public_whatsapp,business_address,website,description,years_in_business,registration_number,opening_hours,status FROM dealer_profiles WHERE user_id=?').get(user.id);
    if(!current)return fail(res,404,'Dealer profile not found.');
    const b=await body(req);const businessName=String(b.businessName||'').trim().slice(0,120),city=String(b.city||'').trim().slice(0,80),region=String(b.region||'').trim().slice(0,80),contactEmail=String(b.contactEmail||'').trim().toLowerCase(),phone=String(b.phone||'').trim().slice(0,32),whatsapp=String(b.whatsapp||'').trim().slice(0,32),preferred=['website','phone','whatsapp','email'].includes(b.preferredContact)?b.preferredContact:'website',publicPhone=b.publicPhone===true||b.publicPhone==='on'||b.publicPhone==='true'?1:0,publicWhatsapp=b.publicWhatsapp===true||b.publicWhatsapp==='on'||b.publicWhatsapp==='true'?1:0,businessAddress=String(b.businessAddress||'').trim().slice(0,240),website=String(b.website||'').trim().slice(0,2048),description=String(b.description||'').trim().slice(0,2000),years=b.yearsInBusiness===''||b.yearsInBusiness===undefined?null:Number(b.yearsInBusiness),registrationNumber=String(b.registrationNumber||'').trim().slice(0,100),openingHours=String(b.openingHours||'').trim().slice(0,500);
    if(businessName.length<2||!city)return fail(res,400,'Enter your seller name and city or town.');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)||contactEmail.length>254)return fail(res,400,'Enter a valid contact email.');
    if(phone&&!/^[+\d() .-]{7,32}$/.test(phone))return fail(res,400,'Enter a valid contact phone number.');
    if(whatsapp&&!/^[+\d() .-]{7,32}$/.test(whatsapp))return fail(res,400,'Enter a valid WhatsApp number.');
    if(years!==null&&(!Number.isInteger(years)||years<0||years>100))return fail(res,400,'Enter years in business from 0 to 100.');
    if(website){try{const parsed=new URL(website);if(parsed.protocol!=='https:')return fail(res,400,'Dealer websites must use HTTPS.');}catch{return fail(res,400,'Enter a valid HTTPS website address.');}}
    const needsReview=current.business_name!==businessName||current.city!==city||current.region!==region||current.contact_email!==contactEmail||current.registration_number!==registrationNumber;
    const status=needsReview&&current.status==='approved'?'pending':current.status;
    db.prepare("UPDATE dealer_profiles SET business_name=?,city=?,region=?,country='Ghana',contact_email=?,phone=?,whatsapp=?,preferred_contact=?,public_phone=?,public_whatsapp=?,business_address=?,website=?,description=?,years_in_business=?,registration_number=?,opening_hours=?,status=? WHERE user_id=?").run(businessName,city,region,contactEmail,phone,whatsapp,preferred,publicPhone,publicWhatsapp,businessAddress,website,description,years,registrationNumber,openingHours,status,user.id);
    if(needsReview&&current.status==='approved')addNotification(user.id,'dealer_review','Your updated business details have been sent for admin review.');
    return send(res,200,{profile:{...current,business_name:businessName,city,region,country:'Ghana',contact_email:contactEmail,phone,whatsapp,preferred_contact:preferred,public_phone:publicPhone,public_whatsapp:publicWhatsapp,business_address:businessAddress,website,description,years_in_business:years,registration_number:registrationNumber,opening_hours:openingHours,status},needsReview});
  }
  if(p==='/api/dealer/dashboard'&&method==='GET') {
    if(!requireRole(user,'dealer',res))return;
    const profile=db.prepare('SELECT seller_type,business_name,description,city,country,region,contact_email,phone,whatsapp,preferred_contact,public_phone,public_whatsapp,business_address,website,years_in_business,registration_number,opening_hours,status,created_at FROM dealer_profiles WHERE user_id=?').get(user.id);
    const vehicles=db.prepare(`SELECT v.id,v.make,v.model,v.trim,v.year,v.price_minor,v.currency,v.mileage,v.fuel,v.transmission,v.engine,v.engine_cc,v.drivetrain,v.body_type,v.condition,v.import_status,v.exterior,v.city,v.country,v.description,v.listing_data,v.allow_offers,v.offer_min_minor,v.offer_max_minor,v.allow_deposit,v.deposit_amount_minor,v.status,v.created_at,v.deleted_at,
      (SELECT count(*) FROM vehicle_views vw WHERE vw.vehicle_id=v.id) views,
      (SELECT count(*) FROM favourites f WHERE f.vehicle_id=v.id) favourites,
      (SELECT count(*) FROM enquiries e WHERE e.vehicle_id=v.id AND e.forwarded_to_seller=1) enquiries,
      (SELECT count(*) FROM vehicle_offers vo WHERE vo.vehicle_id=v.id) offer_count,
      (SELECT image_url FROM vehicle_images i WHERE i.vehicle_id=v.id ORDER BY i.sort_order,i.created_at LIMIT 1) image_url
      FROM vehicles v WHERE v.dealer_id=? ORDER BY v.created_at DESC`).all(user.id);
    for(const vehicle of vehicles){
      vehicle.images=db.prepare('SELECT id,image_url url,alt_text alt FROM vehicle_images WHERE vehicle_id=? ORDER BY sort_order,created_at').all(vehicle.id);
      try{vehicle.listingData=JSON.parse(vehicle.listing_data||'{}');}catch{vehicle.listingData={};}
      delete vehicle.listing_data;
      vehicle.allowOffers=Boolean(vehicle.allow_offers||vehicle.listingData.allowOffers);
      vehicle.offerMinPrice=vehicle.offer_min_minor?vehicle.offer_min_minor/100:null;
      vehicle.offerMaxPrice=vehicle.offer_max_minor?vehicle.offer_max_minor/100:null;
      vehicle.allowDeposit=vehicle.allow_deposit!==undefined&&vehicle.allow_deposit!==null?Boolean(vehicle.allow_deposit):vehicle.listingData.allowDeposit!==undefined?Boolean(vehicle.listingData.allowDeposit):true;
      vehicle.depositAmount=vehicle.deposit_amount_minor?vehicle.deposit_amount_minor/100:(vehicle.listingData.depositAmount?Number(vehicle.listingData.depositAmount):null);
    }
    const enquiries=db.prepare('SELECT e.id,e.vehicle_id,e.message,e.status,e.admin_status,e.forwarded_at,e.created_at,v.year,v.make,v.model FROM enquiries e JOIN vehicles v ON v.id=e.vehicle_id WHERE e.dealer_id=? AND e.forwarded_to_seller=1 ORDER BY e.created_at DESC').all(user.id);
    const offers=db.prepare(`SELECT o.*,v.year,v.make,v.model,v.price_minor,v.offer_min_minor,v.offer_max_minor FROM vehicle_offers o JOIN vehicles v ON v.id=o.vehicle_id WHERE v.dealer_id=? ORDER BY o.created_at DESC`).all(user.id).map(formatDealerOfferRow);
    const totalViews=db.prepare('SELECT count(*) n FROM vehicle_views vw JOIN vehicles v ON v.id=vw.vehicle_id WHERE v.dealer_id=?').get(user.id).n;
    const drafts=db.prepare('SELECT id,vehicle_id,payload_json,created_at,updated_at FROM seller_listing_drafts WHERE seller_id=? ORDER BY updated_at DESC').all(user.id).map(d=>({id:d.id,vehicleId:d.vehicle_id,payload:JSON.parse(d.payload_json),created_at:d.created_at,updated_at:d.updated_at}));
    return send(res,200,{profile,vehicles,enquiries,offers,drafts,stats:{totalViews}});
  }
  if(p==='/api/dealer/offers'&&method==='GET') {
    if(!requireRole(user,'dealer',res))return;
    const offers=db.prepare(`SELECT o.*,v.year,v.make,v.model,v.price_minor,v.offer_min_minor,v.offer_max_minor FROM vehicle_offers o JOIN vehicles v ON v.id=o.vehicle_id WHERE v.dealer_id=? ORDER BY o.created_at DESC`).all(user.id).map(formatDealerOfferRow);
    return send(res,200,{items:offers,offers});
  }
  const dealerOfferStatus=p.match(/^\/api\/dealer\/offers\/([\w-]+)\/status$/);
  if(dealerOfferStatus&&method==='PATCH') {
    if(!requireRole(user,'dealer',res)||!requireCsrf(req,res,user))return;
    const b=await body(req);const nextStatus=String(b.status||'').trim();
    if(!['accepted','declined','pending'].includes(nextStatus))return fail(res,400,'Choose accepted, declined, or pending.');
    const offer=db.prepare(`SELECT o.*,v.dealer_id,v.year,v.make,v.model,v.price_minor,v.offer_min_minor,v.offer_max_minor FROM vehicle_offers o JOIN vehicles v ON v.id=o.vehicle_id WHERE o.id=? AND v.dealer_id=?`).get(dealerOfferStatus[1],user.id);
    if(!offer)return fail(res,404,'Offer not found.');
    db.prepare('UPDATE vehicle_offers SET status=?,updated_at=? WHERE id=?').run(nextStatus,nowIso(),offer.id);
    if(offer.buyer_id)addNotification(offer.buyer_id,'offer',`Your offer on ${offer.year} ${offer.make} ${offer.model} was ${nextStatus} by the seller.`);
    const updated=db.prepare(`SELECT o.*,v.year,v.make,v.model,v.price_minor,v.offer_min_minor,v.offer_max_minor FROM vehicle_offers o JOIN vehicles v ON v.id=o.vehicle_id WHERE o.id=?`).get(offer.id);
    return send(res,200,{offer:formatDealerOfferRow(updated)});
  }
  if(p==='/api/dealer/drafts'&&method==='POST') {
    if(!requireRole(user,'dealer',res)||!requireCsrf(req,res,user))return;
    const b=await body(req);const payload=b.payload&&typeof b.payload==='object'?b.payload:{};const payloadJson=JSON.stringify(payload);if(payloadJson.length>50000)return fail(res,400,'Draft details are too large.');
    const images=validateImageUploads(b.images);const vehicleId=b.vehicleId?String(b.vehicleId):null;if(vehicleId&&!db.prepare('SELECT id FROM vehicles WHERE id=? AND dealer_id=? AND deleted_at IS NULL').get(vehicleId,user.id))return fail(res,404,'Vehicle record not found.');
    const draftId=id();db.prepare('INSERT INTO seller_listing_drafts(id,seller_id,vehicle_id,payload_json,photos_json) VALUES(?,?,?,?,?)').run(draftId,user.id,vehicleId,payloadJson,JSON.stringify(images.map(image=>({type:image.mime,data:image.data.toString('base64')}))));
    return send(res,201,{id:draftId});
  }
  const sellerDraft=p.match(/^\/api\/dealer\/drafts\/([\w-]+)$/);
  if(sellerDraft&&method==='GET') {
    if(!requireRole(user,'dealer',res))return;
    const draft=db.prepare('SELECT id,vehicle_id,payload_json,photos_json,updated_at FROM seller_listing_drafts WHERE id=? AND seller_id=?').get(sellerDraft[1],user.id);if(!draft)return fail(res,404,'Draft not found.');
    return send(res,200,{id:draft.id,vehicleId:draft.vehicle_id,payload:JSON.parse(draft.payload_json),images:JSON.parse(draft.photos_json),updated_at:draft.updated_at});
  }
  if(sellerDraft&&method==='PUT') {
    if(!requireRole(user,'dealer',res)||!requireCsrf(req,res,user))return;
    const draft=db.prepare('SELECT id,vehicle_id FROM seller_listing_drafts WHERE id=? AND seller_id=?').get(sellerDraft[1],user.id);if(!draft)return fail(res,404,'Draft not found.');
    const b=await body(req);const payload=b.payload&&typeof b.payload==='object'?b.payload:{};const payloadJson=JSON.stringify(payload);if(payloadJson.length>50000)return fail(res,400,'Draft details are too large.');
    const images=b.images===undefined?null:validateImageUploads(b.images);db.prepare(`UPDATE seller_listing_drafts SET payload_json=?,photos_json=COALESCE(?,photos_json),updated_at=? WHERE id=? AND seller_id=?`).run(payloadJson,images===null?null:JSON.stringify(images.map(image=>({type:image.mime,data:image.data.toString('base64')}))),nowIso(),draft.id,user.id);
    return send(res,200,{id:draft.id,updated:true});
  }
  if(sellerDraft&&method==='DELETE') {
    if(!requireRole(user,'dealer',res)||!requireCsrf(req,res,user))return;
    const result=db.prepare('DELETE FROM seller_listing_drafts WHERE id=? AND seller_id=?').run(sellerDraft[1],user.id);if(!result.changes)return fail(res,404,'Draft not found.');return send(res,200,{deleted:true});
  }
  if(p==='/api/dealer/vehicles'&&method==='POST') {
    if(!requireRole(user,'dealer',res)||!requireCsrf(req,res,user))return;
    const b=await body(req);const intent=b.intent==='draft'?'draft':'submit';const images=validateImageUploads(b.images);const required=['make','model','year','price','mileage','city'];
    if(intent==='submit'&&images.length===0)return fail(res,400,'Add at least one vehicle photo before submitting for review.');
    for(const key of required)if(intent==='submit'&&(b[key]===undefined||String(b[key]).trim()===''))return fail(res,400,`Enter ${key}.`);
    const year=Number(b.year||1900),price=Number(b.price||0),mileage=Number(b.mileage||0);
    if(!Number.isInteger(year)||year<1900||year>2100||!Number.isFinite(price)||price<0||price>1e9||intent==='submit'&&price===0||!Number.isInteger(mileage)||mileage<0)return fail(res,400,'Check the year, price and mileage.');
    const {allowOffers,offerMinMinor,offerMaxMinor}=parseDealerOfferRange(b);
    const {allowDeposit,depositAmountMinor,depositAmountMajor}=parseDealerDepositConfig(b,null,price);
    const image=String(b.imageUrl||'');if(image&&!/^https:\/\/images\.unsplash\.com\//.test(image))return fail(res,400,'Vehicle photographs must use the approved image storage service.');if(image&&images.length>=6)return fail(res,400,'A listing can have up to six photos.');
    const vehicleId=id();const status=intent==='draft'?'draft':'pending';
    const engineCc=b.engineCc===''||b.engineCc===undefined?null:Number(b.engineCc);if(engineCc!==null&&(!Number.isInteger(engineCc)||engineCc<100||engineCc>20000))return fail(res,400,'Engine capacity must be between 100 and 20,000 cc.');
    const listingData={...(b.listingData&&typeof b.listingData==='object'?b.listingData:{})};delete listingData.vin;delete listingData.offerMinPrice;delete listingData.offerMaxPrice;delete listingData.offer_min_minor;delete listingData.offer_max_minor;listingData.allowOffers=Boolean(allowOffers);listingData.allowDeposit=Boolean(allowDeposit);listingData.depositAmount=depositAmountMajor;const listingJson=JSON.stringify(listingData);if(listingJson.length>50000)return fail(res,400,'Listing details are too large.');
    const make=String(b.make||'').trim().slice(0,80)||'Draft';const model=String(b.model||'').trim().slice(0,80)||'Untitled vehicle';const currency=['GHS','USD'].includes(b.currency)?b.currency:'GHS';
    const condition=['New','Certified'].includes(b.condition)?b.condition:'Used';
    const cityVal=String(b.city||b.location||'').trim().slice(0,80);const locationVal=String(b.location||`${cityVal}, Ghana`).trim().slice(0,120);
    db.prepare(`INSERT INTO vehicles(id,dealer_id,make,model,trim,year,price,price_minor,currency,location,mileage,fuel,transmission,engine,engine_cc,drivetrain,body_type,condition,accident_history,ownership_history,registration_status,import_status,vin,exterior,interior,doors,seats,city,country,description,listing_data,allow_offers,offer_min_minor,offer_max_minor,allow_deposit,deposit_amount_minor,status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(vehicleId,user.id,make,model,String(b.trim||'').trim().slice(0,100),year,price,Math.round(price*100),currency,locationVal,mileage,String(b.fuel||'Petrol').slice(0,40),String(b.transmission||'Automatic').slice(0,40),String(b.engine||'').trim().slice(0,60),engineCc,String(b.drivetrain||'').trim().slice(0,30),String(b.bodyType||'').trim().slice(0,40),condition,String(listingData.accident||'Not supplied'),String(listingData.ownership||'Not supplied'),String(b.registrationStatus||'Not supplied').slice(0,40),String(b.importStatus||'Not supplied').slice(0,40),String(b.vin||'').trim().slice(0,40),String(b.color||'').trim().slice(0,60),String(listingData.interiorColor||'').trim().slice(0,60),Number(b.doors)||4,Number(b.seats)||5,cityVal,'Ghana',String(b.description||'').trim().slice(0,5000),listingJson,allowOffers,offerMinMinor,offerMaxMinor,allowDeposit,depositAmountMinor,status);
    if(image)db.prepare('INSERT INTO vehicle_images(id,vehicle_id,image_url,alt_text) VALUES(?,?,?,?)').run(id(),vehicleId,image,`Dealer supplied image of ${b.make} ${b.model}`);
    storeVehicleImages(vehicleId,images);
    return send(res,201,{id:vehicleId,status});
  }
  const dealerVehicle=p.match(/^\/api\/dealer\/vehicles\/([\w-]+)$/);
  if(dealerVehicle&&method==='PUT') {
    if(!requireRole(user,'dealer',res)||!requireCsrf(req,res,user))return;
    const current=db.prepare('SELECT id,status,make,model,year,price_minor,mileage,city,listing_data,allow_offers,offer_min_minor,offer_max_minor,allow_deposit,deposit_amount_minor FROM vehicles WHERE id=? AND dealer_id=? AND deleted_at IS NULL').get(dealerVehicle[1],user.id);
    if(!current)return fail(res,404,'Vehicle record not found.');
    if(current.status==='sold')return fail(res,409,'Sold vehicle records cannot be edited.');
    const b=await body(req);const intent=b.intent==='draft'?'draft':'submit';const images=validateImageUploads(b.images);const required=['make','model','year','price','mileage','city'];
    if(intent==='submit'&&images.length===0&&db.prepare('SELECT count(*) n FROM vehicle_images WHERE vehicle_id=?').get(current.id).n===0)return fail(res,400,'Add at least one vehicle photo before submitting for review.');
    for(const key of required)if(intent==='submit'&&(b[key]===undefined||String(b[key]).trim()===''))return fail(res,400,`Enter ${key}.`);
    const year=Number(b.year||current.year),price=Number(b.price||current.price_minor/100),mileage=Number(b.mileage||current.mileage);
    if(!Number.isInteger(year)||year<1900||year>2100||!Number.isFinite(price)||price<0||price>1e9||intent==='submit'&&price===0||!Number.isInteger(mileage)||mileage<0)return fail(res,400,'Check the year, price and mileage.');
    const {allowOffers,offerMinMinor,offerMaxMinor}=parseDealerOfferRange(b,current);
    const {allowDeposit,depositAmountMinor,depositAmountMajor}=parseDealerDepositConfig(b,current,price);
    const currency=['GHS','USD'].includes(b.currency)?b.currency:'GHS';
    const currentImageCount=db.prepare('SELECT count(*) n FROM vehicle_images WHERE vehicle_id=?').get(current.id).n;
    if(currentImageCount+images.length>6)return fail(res,400,'A listing can have up to six photos. Remove a photo before adding another.');
    const image=String(b.imageUrl||'').trim();if(image&&!/^https:\/\/images\.unsplash\.com\//.test(image))return fail(res,400,'Vehicle photographs must use the approved image storage service.');
    const engineCc=b.engineCc===''||b.engineCc===undefined?null:Number(b.engineCc);if(engineCc!==null&&(!Number.isInteger(engineCc)||engineCc<100||engineCc>20000))return fail(res,400,'Engine capacity must be between 100 and 20,000 cc.');
    const listingData={...(current.listing_data?JSON.parse(current.listing_data):{}),...(b.listingData&&typeof b.listingData==='object'?b.listingData:{})};delete listingData.vin;delete listingData.offerMinPrice;delete listingData.offerMaxPrice;delete listingData.offer_min_minor;delete listingData.offer_max_minor;listingData.allowOffers=Boolean(allowOffers);listingData.allowDeposit=Boolean(allowDeposit);listingData.depositAmount=depositAmountMajor;const listingJson=JSON.stringify(listingData);if(listingJson.length>50000)return fail(res,400,'Listing details are too large.');const status=intent==='draft'?'draft':'pending';
    const updatedCity=String(b.city||current.city).trim().slice(0,80);const updatedLocation=String(b.location||`${updatedCity}, Ghana`).trim().slice(0,120);
    db.prepare(`UPDATE vehicles SET make=?,model=?,trim=?,year=?,price=?,price_minor=?,currency=?,location=?,mileage=?,fuel=?,transmission=?,engine=?,engine_cc=?,drivetrain=?,body_type=?,condition=?,accident_history=?,ownership_history=?,registration_status=?,import_status=?,vin=?,exterior=?,interior=?,doors=?,seats=?,city=?,country=?,description=?,listing_data=?,allow_offers=?,offer_min_minor=?,offer_max_minor=?,allow_deposit=?,deposit_amount_minor=?,status=?,updated_at=? WHERE id=? AND dealer_id=?`)
      .run(String(b.make||current.make).trim().slice(0,80),String(b.model||current.model).trim().slice(0,80),String(b.trim||'').trim().slice(0,100),year,price,Math.round(price*100),currency,updatedLocation,mileage,String(b.fuel||'Petrol').slice(0,40),String(b.transmission||'Automatic').slice(0,40),String(b.engine||'').trim().slice(0,60),engineCc,String(b.drivetrain||'').trim().slice(0,30),String(b.bodyType||'').trim().slice(0,40),['New','Certified'].includes(b.condition)?b.condition:'Used',String(listingData.accident||'Not supplied'),String(listingData.ownership||'Not supplied'),String(b.registrationStatus||'Not supplied').slice(0,40),String(b.importStatus||'Not supplied').slice(0,40),String(b.vin||'').trim().slice(0,40),String(b.color||'').trim().slice(0,60),String(listingData.interiorColor||'').trim().slice(0,60),Number(b.doors)||4,Number(b.seats)||5,updatedCity,'Ghana',String(b.description||'').trim().slice(0,5000),listingJson,allowOffers,offerMinMinor,offerMaxMinor,allowDeposit,depositAmountMinor,status,nowIso(),current.id,user.id);
    if(image){const existing=db.prepare('SELECT id FROM vehicle_images WHERE vehicle_id=? ORDER BY sort_order,created_at LIMIT 1').get(current.id);if(existing)db.prepare('UPDATE vehicle_images SET image_url=?,alt_text=? WHERE id=?').run(image,`Dealer supplied image of ${b.make} ${b.model}`,existing.id);else db.prepare('INSERT INTO vehicle_images(id,vehicle_id,image_url,alt_text) VALUES(?,?,?,?)').run(id(),current.id,image,`Dealer supplied image of ${b.make} ${b.model}`);}
    storeVehicleImages(current.id,images);
    return send(res,200,{id:current.id,status});
  }
  const dealerImage=p.match(/^\/api\/dealer\/vehicles\/([\w-]+)\/images\/([\w-]+)$/);
  if(dealerImage&&method==='DELETE'){
    if(!requireRole(user,'dealer',res)||!requireCsrf(req,res,user))return;
    const image=db.prepare('SELECT i.id,m.id media_id FROM vehicle_images i JOIN vehicles v ON v.id=i.vehicle_id LEFT JOIN vehicle_media m ON m.vehicle_id=v.id AND i.image_url=(\'/api/media/\'||m.id) WHERE i.id=? AND v.id=? AND v.dealer_id=? AND v.deleted_at IS NULL').get(dealerImage[2],dealerImage[1],user.id);
    if(!image)return fail(res,404,'Photo not found.');
    db.prepare('DELETE FROM vehicle_images WHERE id=?').run(image.id);if(image.media_id)db.prepare('DELETE FROM vehicle_media WHERE id=?').run(image.media_id);
    return send(res,200,{removed:true});
  }
  const dealerVehicleStatus=p.match(/^\/api\/dealer\/vehicles\/([\w-]+)\/status$/);
  if(dealerVehicleStatus&&method==='PATCH') {
    if(!requireRole(user,'dealer',res)||!requireCsrf(req,res,user))return;
    const current=db.prepare('SELECT id,status FROM vehicles WHERE id=? AND dealer_id=? AND deleted_at IS NULL').get(dealerVehicleStatus[1],user.id);
    if(!current)return fail(res,404,'Vehicle record not found.');
    const {status}=await body(req);if(status==='active'&&!listingBilling.paid(current.id))return fail(res,402,'Pay the listing publishing fee before making this listing public.');if(status==='active'&&!sellerIdentityAllowed(user.id))return fail(res,409,'Provider identity verification is required before this listing can be published.');const transitions={active:['paused','sold'],paused:['active','sold']};
    if(!transitions[current.status]?.includes(status))return fail(res,409,'That availability change is not allowed for this listing.');
    db.prepare('UPDATE vehicles SET status=?,updated_at=? WHERE id=? AND dealer_id=?').run(status,nowIso(),current.id,user.id);
    if(status==='sold'){for(const row of db.prepare('SELECT DISTINCT buyer_id FROM enquiries WHERE vehicle_id=?').all(current.id))addNotification(row.buyer_id,'availability','A vehicle you enquired about has been marked sold.');}
    return send(res,200,{id:current.id,status});
  }
  const dealerVehicleArchive=p.match(/^\/api\/dealer\/vehicles\/([\w-]+)\/(delete|restore)$/);
  if(dealerVehicleArchive&&method==='POST') {
    if(!requireRole(user,'dealer',res)||!requireCsrf(req,res,user))return;
    const current=db.prepare('SELECT id,deleted_at FROM vehicles WHERE id=? AND dealer_id=?').get(dealerVehicleArchive[1],user.id);
    if(!current)return fail(res,404,'Vehicle record not found.');
    if(dealerVehicleArchive[2]==='delete'){
      if(current.deleted_at)return fail(res,404,'Vehicle record not found.');
      db.prepare('UPDATE vehicles SET deleted_at=?,updated_at=? WHERE id=? AND dealer_id=?').run(nowIso(),nowIso(),current.id,user.id);
      return send(res,200,{deleted:true});
    }
    if(!current.deleted_at)return fail(res,409,'Vehicle record is not in the archive.');
    db.prepare("UPDATE vehicles SET deleted_at=NULL,status='pending',updated_at=? WHERE id=? AND dealer_id=?").run(nowIso(),current.id,user.id);
    return send(res,200,{restored:true,status:'pending'});
  }
  if(p==='/api/dealer/enquiries'&&method==='GET') {
    if(!requireRole(user,'dealer',res))return;
    return send(res,200,{items:db.prepare('SELECT e.id,e.vehicle_id,e.message,e.status,e.admin_status,e.forwarded_at,e.created_at,v.make,v.model,v.year FROM enquiries e JOIN vehicles v ON v.id=e.vehicle_id WHERE e.dealer_id=? AND e.forwarded_to_seller=1 ORDER BY e.created_at DESC').all(user.id)});
  }
  if(p==='/api/admin/enquiries'&&method==='GET') {
    if(!requireRole(user,'admin',res))return;
    const items=db.prepare(`SELECT e.*,v.make,v.model,v.year,u.email buyer_email,COALESCE(bp.display_name,u.email) buyer_name,dp.business_name seller_name
      FROM enquiries e JOIN vehicles v ON v.id=e.vehicle_id LEFT JOIN users u ON u.id=e.buyer_id LEFT JOIN buyer_profiles bp ON bp.user_id=e.buyer_id LEFT JOIN dealer_profiles dp ON dp.user_id=e.dealer_id
      ORDER BY e.created_at DESC`).all().map(e=>({...e,original_message:e.original_message||e.message,forwardedToSeller:Boolean(e.forwarded_to_seller)}));
    return send(res,200,{items,enquiries:items,total:items.length});
  }
  const adminEnquiryAction=p.match(/^\/api\/admin\/enquiries\/([\w-]+)(?:\/(forward|reject))?$/);
  if(adminEnquiryAction&&['POST','PATCH'].includes(method)) {
    if(!requireRole(user,'admin',res)||!requireCsrf(req,res,user))return;
    const enquiry=db.prepare('SELECT e.*,v.year,v.make,v.model FROM enquiries e JOIN vehicles v ON v.id=e.vehicle_id WHERE e.id=?').get(adminEnquiryAction[1]);
    if(!enquiry)return fail(res,404,'Enquiry not found.');
    const b=await body(req);
    const nextMessage=b.message!==undefined?String(b.message).trim().slice(0,2000):enquiry.message;
    if(nextMessage.length<2)return fail(res,400,'Enquiry message must be at least 2 characters.');
    const adminNotes=b.adminNotes!==undefined?String(b.adminNotes).trim().slice(0,1000):(b.notes!==undefined?String(b.notes).trim().slice(0,1000):enquiry.admin_notes||'');
    const action=adminEnquiryAction[2]||(b.action==='reject'||b.adminStatus==='rejected'?'reject':'forward');
    if(action==='reject'){
      db.prepare("UPDATE enquiries SET message=?,admin_status='rejected',forwarded_to_seller=0,admin_notes=?,reviewed_by=? WHERE id=?").run(nextMessage,adminNotes,user.id,enquiry.id);
      adminLog(user,'enquiry.reject','enquiry',enquiry.id,{adminNotes});
      return send(res,200,{id:enquiry.id,status:enquiry.status,adminStatus:'rejected',forwardedToSeller:false,message:nextMessage,adminNotes});
    }
    const t=nowIso();
    db.prepare("UPDATE enquiries SET message=?,admin_status='forwarded',forwarded_to_seller=1,admin_notes=?,reviewed_by=?,forwarded_at=? WHERE id=?").run(nextMessage,adminNotes,user.id,t,enquiry.id);
    if(enquiry.dealer_id&&!enquiry.forwarded_to_seller){
      addNotification(enquiry.dealer_id,'enquiry',`New enquiry for ${enquiry.year} ${enquiry.make} ${enquiry.model}.`);
    }
    adminLog(user,'enquiry.forward','enquiry',enquiry.id,{edited:nextMessage!==(enquiry.original_message||enquiry.message),adminNotes});
    return send(res,200,{id:enquiry.id,status:enquiry.status,adminStatus:'forwarded',forwardedToSeller:true,message:nextMessage,originalMessage:enquiry.original_message||enquiry.message,adminNotes,forwardedAt:t});
  }
  if(p==='/api/admin/dashboard'&&method==='GET') {
    if(!requireRole(user,'admin',res))return;
    const counts={totalUsers:db.prepare("SELECT count(*) n FROM users WHERE status!='deleted'").get().n,buyers:db.prepare("SELECT count(*) n FROM users WHERE role='buyer' AND status!='deleted'").get().n,dealers:db.prepare("SELECT count(*) n FROM dealer_profiles").get().n,totalVehicles:db.prepare("SELECT count(*) n FROM vehicles WHERE deleted_at IS NULL").get().n,activeVehicles:db.prepare("SELECT count(*) n FROM vehicles WHERE status='active' AND deleted_at IS NULL").get().n,pendingVehicles:db.prepare("SELECT count(*) n FROM vehicles WHERE status='pending' AND deleted_at IS NULL").get().n,rejectedVehicles:db.prepare("SELECT count(*) n FROM vehicles WHERE status='rejected' AND deleted_at IS NULL").get().n,pendingDealers:db.prepare("SELECT count(*) n FROM dealer_profiles WHERE status='pending'").get().n,approvedDealerProfiles:db.prepare("SELECT count(*) n FROM dealer_profiles WHERE status='approved'").get().n,openReports:db.prepare("SELECT count(*) n FROM reports WHERE status IN ('open','reviewing')").get().n,pendingEnquiries:db.prepare("SELECT count(*) n FROM enquiries WHERE admin_status='pending_admin'").get().n};
    const pendingVehicles=db.prepare("SELECT id,make,model,year,price_minor,currency,created_at FROM vehicles WHERE status='pending' AND deleted_at IS NULL ORDER BY created_at").all();
    const pendingDealers=db.prepare("SELECT user_id id,business_name,city,country,created_at FROM dealer_profiles WHERE status='pending' ORDER BY created_at").all();
    const reports=db.prepare("SELECT r.id,r.vehicle_id,r.seller_id,r.reason,r.details,r.status,r.created_at,dp.business_name seller_name FROM reports r LEFT JOIN dealer_profiles dp ON dp.user_id=r.seller_id WHERE r.status IN ('open','reviewing') ORDER BY r.created_at").all();
    const enquiries=db.prepare(`SELECT e.*,v.make,v.model,v.year,u.email buyer_email,COALESCE(bp.display_name,u.email) buyer_name,dp.business_name seller_name
      FROM enquiries e JOIN vehicles v ON v.id=e.vehicle_id LEFT JOIN users u ON u.id=e.buyer_id LEFT JOIN buyer_profiles bp ON bp.user_id=e.buyer_id LEFT JOIN dealer_profiles dp ON dp.user_id=e.dealer_id
      ORDER BY e.created_at DESC`).all().map(e=>({...e,original_message:e.original_message||e.message,forwardedToSeller:Boolean(e.forwarded_to_seller)}));
    const users=db.prepare("SELECT id,email,role,status,created_at FROM users WHERE role!='admin' AND status!='deleted' ORDER BY created_at DESC LIMIT 100").all();
    return send(res,200,{counts,pendingVehicles,pendingDealers,reports,enquiries,users});
  }
  const dealerApprove=p.match(/^\/api\/admin\/dealers\/([\w-]+)\/approve$/);
  if(dealerApprove&&method==='POST') {
    if(!requireRole(user,'admin',res)||!requireCsrf(req,res,user))return;
    const result=db.prepare("UPDATE dealer_profiles SET status='approved' WHERE user_id=? AND status='pending'").run(dealerApprove[1]);
    if(!result.changes)return fail(res,404,'Pending dealer profile not found.');
    addNotification(dealerApprove[1],'dealer_review','Your dealer profile has been approved for marketplace listings.');
    adminLog(user,'dealer.approve','dealer',dealerApprove[1]);return send(res,200,{status:'approved'});
  }
  const dealerReject=p.match(/^\/api\/admin\/dealers\/([\w-]+)\/reject$/);
  if(dealerReject&&method==='POST') {
    if(!requireRole(user,'admin',res)||!requireCsrf(req,res,user))return;
    const result=db.prepare("UPDATE dealer_profiles SET status='rejected' WHERE user_id=? AND status='pending'").run(dealerReject[1]);
    if(!result.changes)return fail(res,404,'Pending dealer profile not found.');
    addNotification(dealerReject[1],'dealer_review','Your dealer profile was not approved. Update your business details and contact marketplace support before resubmitting.');
    adminLog(user,'dealer.reject','dealer',dealerReject[1]);return send(res,200,{status:'rejected'});
  }
  const approve=p.match(/^\/api\/admin\/vehicles\/([\w-]+)\/approve$/);
  if(approve&&method==='POST') {
    if(!requireRole(user,'admin',res)||!requireCsrf(req,res,user))return;
    const vehicle=db.prepare('SELECT dealer_id,make,model,year FROM vehicles WHERE id=? AND status=\'pending\' AND deleted_at IS NULL').get(approve[1]);
    if(!vehicle)return fail(res,404,'Pending vehicle not found.');
    if(!listingBilling.paid(approve[1]))return fail(res,402,'This seller must pay the listing publishing fee before approval can publish it.');
    if((process.env.REQUIRE_SELLER_IDENTITY==='true'||process.env.NODE_ENV==='production')&&vehicle.dealer_id&&(sellerOperations.identity(vehicle.dealer_id).status!=='verified'||process.env.NODE_ENV==='production'&&!sellerOperations.identity(vehicle.dealer_id).verifiedForProduction))return fail(res,409,'Provider identity verification is required before publishing this seller’s listings.');
    db.prepare("UPDATE vehicles SET status='active',updated_at=? WHERE id=?").run(nowIso(),approve[1]);
    addNotification(vehicle.dealer_id,'listing_review',`Your ${vehicle.year} ${vehicle.make} ${vehicle.model} listing is approved.`);
    adminLog(user,'vehicle.approve','vehicle',approve[1]);return send(res,200,{status:'active'});
  }
  const reject=p.match(/^\/api\/admin\/vehicles\/([\w-]+)\/reject$/);
  if(reject&&method==='POST') {
    if(!requireRole(user,'admin',res)||!requireCsrf(req,res,user))return;
    const vehicle=db.prepare("SELECT dealer_id,make,model,year FROM vehicles WHERE id=? AND status='pending' AND deleted_at IS NULL").get(reject[1]);
    if(!vehicle)return fail(res,404,'Pending vehicle not found.');
    db.prepare("UPDATE vehicles SET status='rejected',updated_at=? WHERE id=?").run(nowIso(),reject[1]);
    addNotification(vehicle.dealer_id,'listing_review',`Your ${vehicle.year} ${vehicle.make} ${vehicle.model} listing needs changes before approval.`);
    adminLog(user,'vehicle.reject','vehicle',reject[1]);return send(res,200,{status:'rejected'});
  }
  const userStatus=p.match(/^\/api\/admin\/users\/([\w-]+)\/status$/);
  if(userStatus&&method==='PATCH') {
    if(!requireRole(user,'admin',res)||!requireCsrf(req,res,user))return;
    const b=await body(req);if(!['active','suspended'].includes(b.status))return fail(res,400,'Choose active or suspended.');
    if(userStatus[1]===user.id)return fail(res,409,'You cannot change your own administrator account here.');
    const target=db.prepare('SELECT id,role,status FROM users WHERE id=?').get(userStatus[1]);
    if(!target||target.role==='admin')return fail(res,404,'User record not found.');
    if(target.status==='deleted')return fail(res,409,'Deleted accounts cannot be changed.');
    db.prepare('UPDATE users SET status=? WHERE id=?').run(b.status,target.id);
    if(b.status==='suspended')db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
    adminLog(user,`user.${b.status}`,'user',target.id,{role:target.role});return send(res,200,{status:b.status});
  }
  const reportAction=p.match(/^\/api\/admin\/reports\/([\w-]+)\/(review|resolve|dismiss)$/);
  if(reportAction&&method==='POST') {
    if(!requireRole(user,'admin',res)||!requireCsrf(req,res,user))return;
    const next={review:'reviewing',resolve:'resolved',dismiss:'dismissed'}[reportAction[2]];
    const result=db.prepare("UPDATE reports SET status=? WHERE id=? AND status IN ('open','reviewing')").run(next,reportAction[1]);
    if(!result.changes)return fail(res,404,'Open report not found.');adminLog(user,`report.${reportAction[2]}`,'report',reportAction[1]);return send(res,200,{status:next});
  }
  if(p==='/api/shipping-estimates'&&method==='POST') {
    if(!requireCsrf(req,res,null))return;
    const b=await body(req);const originName=String(b.origin||'').trim().slice(0,80),dest=String(b.destination||'').trim().slice(0,80);const type=String(b.vehicleType||'').slice(0,40);const methodName=String(b.method||'RoRo').slice(0,40);
    if(!originName||!dest||!type)return fail(res,400,'Enter the origin, destination and vehicle type.');
    // Planning values only: this is not a live carrier quote or an official import-duty calculation.
    const base=methodName==='Container' ? 690000 : 420000;const vehicleFactor=type==='SUV'?1.18:type==='Van'?1.28:1;
    const amount=Math.round(base*vehicleFactor);const assumptions='Illustrative fixed-rate sample: USD 4,200 RoRo or USD 6,900 container, adjusted by vehicle type. Excludes customs, taxes, port fees, inland delivery, insurance and carrier surcharges.';
    const estimateId=id();db.prepare('INSERT INTO shipping_estimates(id,user_id,origin,destination,vehicle_type,method,estimate_minor,assumptions) VALUES(?,?,?,?,?,?,?,?)').run(estimateId,user?.id||null,originName,dest,type,methodName,amount,assumptions);
    const rule=db.prepare('SELECT country_code,rule_json,source_url,effective_at FROM customs_rules WHERE lower(country_code)=lower(?)').get(dest.slice(0,2));
    return send(res,200,{id:estimateId,currency:'USD',estimate:amount/100,assumptions,officialDutyAvailable:false,customsRule:rule?{countryCode:rule.country_code,...JSON.parse(rule.rule_json),sourceUrl:rule.source_url,effectiveAt:rule.effective_at}:null});
  }
  if(p==='/api/makes'&&method==='GET') {
    const makes=db.prepare('SELECT id,name FROM vehicle_makes ORDER BY name').all();
    const models=db.prepare('SELECT make_id,name FROM vehicle_models ORDER BY name').all();
    return send(res,200,{items:makes.map(m=>({...m,models:models.filter(x=>x.make_id===m.id).map(x=>x.name)}))});
  }
  if(p==='/api/customs-rules'&&method==='GET') {
    return send(res,200,{items:db.prepare('SELECT country_code,rule_json,source_url,effective_at FROM customs_rules ORDER BY country_code').all().map(r=>({countryCode:r.country_code,...JSON.parse(r.rule_json),sourceUrl:r.source_url,effectiveAt:r.effective_at}))});
  }
  if(p==='/api/inspections'&&method==='GET') {
    if(!requireRole(user,['buyer','dealer','admin'],res))return;
    const rows=user.role==='admin'
      ? db.prepare('SELECT i.*,v.year,v.make,v.model FROM inspections i JOIN vehicles v ON v.id=i.vehicle_id ORDER BY i.created_at DESC').all()
      : user.role==='dealer'
        ? db.prepare('SELECT i.*,v.year,v.make,v.model FROM inspections i JOIN vehicles v ON v.id=i.vehicle_id WHERE v.dealer_id=? ORDER BY i.created_at DESC').all(user.id)
        : db.prepare('SELECT i.*,v.year,v.make,v.model FROM inspections i JOIN vehicles v ON v.id=i.vehicle_id WHERE i.provider_id=? ORDER BY i.created_at DESC').all(user.id);
    return send(res,200,{items:rows});
  }
  return fail(res,404,'Route not found.');
}

async function serveStatic(req,res,url) {
  let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{return fail(res,400,'Invalid path.');}
  if(pathname==='/')pathname='/index.html';
  if(pathname==='/admin')pathname='/index.html';
  const candidate=resolve(staticRoot,'.'+pathname);
  if(candidate!==staticRoot && !candidate.startsWith(staticRoot+sep))return fail(res,404,'Not found.');
  let file=candidate;
  try { const st=await import('node:fs/promises').then(m=>m.stat(file)); if(!st.isFile())throw new Error(); }
  catch {
    // App routes share one shell; private data is still checked by API role guards.
    if(pathname.startsWith('/api/'))return fail(res,404,'Route not found.');
    file=join(staticRoot,'index.html');
  }
  const headers={
    'Content-Type':mime[extname(file)]||'application/octet-stream',
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',
    'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy':"default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://*.google.com https://*.gstatic.com https://*.run.app *; object-src 'none'; connect-src 'self'; img-src 'self' data: blob: https://images.unsplash.com https:; font-src 'self' https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self'"+(prod?'; upgrade-insecure-requests; block-all-mixed-content':''),
    ...(prod?{'Strict-Transport-Security':'max-age=31536000; includeSubDomains'}:{}),
    'Cache-Control':extname(file)==='.html'?'no-cache':'public, max-age=3600'
  };
  res.writeHead(200,headers);
  if(req.method==='HEAD'){res.end();return;}
  createReadStream(file).pipe(res);
}

const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url||'/',origin);
    if(url.pathname.startsWith('/api/')) {
      if(req.method==='OPTIONS')return send(res,204,{});
      const result=await api(req,res,url);if(result===null)return serveStatic(req,res,url);return;
    }
    if(!['GET','HEAD'].includes(req.method))return fail(res,405,'Method not allowed.');
    if(prod&&trustProxy&&req.headers['x-forwarded-proto']!=='https') {res.writeHead(308,{Location:`${origin}${url.pathname}${url.search}`,'Cache-Control':'no-store'});return res.end();}
    return await serveStatic(req,res,url);
  } catch(error) {
    console.error('request failed:',error.message);
    return fail(res,error.status||500,error.status?error.message:'The request could not be completed.');
  }
});
server.listen(port,process.env.HOST||'0.0.0.0',()=>console.log(`Apex marketplace listening on ${process.env.HOST||'0.0.0.0'}:${port}`));
process.on('SIGINT',()=>{server.close(()=>{db.close();process.exit(0);});});
process.on('SIGTERM',()=>{server.close(()=>{db.close();process.exit(0);});});




