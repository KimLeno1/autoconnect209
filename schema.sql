PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('buyer','dealer','admin')),
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0,1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS buyer_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS dealer_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  seller_type TEXT NOT NULL DEFAULT 'dealer' CHECK (seller_type IN ('private','dealer')),
  business_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '',
  preferred_contact TEXT NOT NULL DEFAULT 'website' CHECK (preferred_contact IN ('website','phone','whatsapp','email')),
  public_phone INTEGER NOT NULL DEFAULT 0 CHECK (public_phone IN (0,1)),
  public_whatsapp INTEGER NOT NULL DEFAULT 0 CHECK (public_whatsapp IN (0,1)),
  region TEXT NOT NULL DEFAULT '',
  business_address TEXT NOT NULL DEFAULT '',
  profile_photo_url TEXT NOT NULL DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT '',
  years_in_business INTEGER,
  registration_number TEXT NOT NULL DEFAULT '',
  opening_hours TEXT NOT NULL DEFAULT '',
  socials_json TEXT NOT NULL DEFAULT '{}',
  website TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS seller_listing_drafts (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES dealer_profiles(user_id) ON DELETE CASCADE,
  vehicle_id TEXT REFERENCES vehicles(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL,
  photos_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_seller_drafts ON seller_listing_drafts(seller_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS dealer_verifications (
  id TEXT PRIMARY KEY,
  dealer_id TEXT NOT NULL REFERENCES dealer_profiles(user_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  document_ref TEXT,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS vehicle_categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS vehicle_makes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS vehicle_models (
  id INTEGER PRIMARY KEY,
  make_id INTEGER NOT NULL REFERENCES vehicle_makes(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  UNIQUE(make_id,name)
);
CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  dealer_id TEXT REFERENCES dealer_profiles(user_id) ON DELETE SET NULL,
  category_id INTEGER REFERENCES vehicle_categories(id) ON DELETE SET NULL,
  make_id INTEGER REFERENCES vehicle_makes(id) ON DELETE SET NULL,
  model_id INTEGER REFERENCES vehicle_models(id) ON DELETE SET NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  trim TEXT NOT NULL DEFAULT '',
  year INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 2100),
  price REAL NOT NULL DEFAULT 0 CHECK (price >= 0),
  price_minor INTEGER NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  location TEXT NOT NULL DEFAULT '',
  mileage INTEGER NOT NULL DEFAULT 0 CHECK (mileage >= 0),
  fuel TEXT NOT NULL DEFAULT 'Petrol',
  transmission TEXT NOT NULL DEFAULT 'Automatic',
  engine TEXT NOT NULL DEFAULT '',
  engine_cc INTEGER,
  drivetrain TEXT NOT NULL DEFAULT '',
  body_type TEXT NOT NULL DEFAULT '',
  exterior TEXT NOT NULL DEFAULT '',
  interior TEXT NOT NULL DEFAULT '',
  doors INTEGER NOT NULL DEFAULT 4,
  seats INTEGER NOT NULL DEFAULT 5,
  condition TEXT NOT NULL DEFAULT 'Used' CHECK (condition IN ('New','Used','Certified')),
  accident_history TEXT NOT NULL DEFAULT 'Not supplied',
  ownership_history TEXT NOT NULL DEFAULT 'Not supplied',
  registration_status TEXT NOT NULL DEFAULT 'Not supplied',
  import_status TEXT NOT NULL DEFAULT 'Not supplied',
  vin TEXT,
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  listing_data TEXT NOT NULL DEFAULT '{}',
  allow_offers INTEGER NOT NULL DEFAULT 0 CHECK (allow_offers IN (0,1)),
  offer_min_minor INTEGER,
  offer_max_minor INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('draft','pending','active','paused','reserved','sold','rejected')),
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1)),
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS vehicle_offers (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  buyer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  seller_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  buyer_name TEXT NOT NULL DEFAULT '',
  buyer_email TEXT NOT NULL DEFAULT '',
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'GHS',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','countered')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_vehicle_offers_vehicle ON vehicle_offers(vehicle_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_offers_seller ON vehicle_offers(seller_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS vehicle_images (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  alt_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS vehicle_media (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  data BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_vehicle_media_vehicle ON vehicle_media(vehicle_id,created_at);
CREATE TABLE IF NOT EXISTS vehicle_views (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  viewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_vehicle_views_vehicle_time ON vehicle_views(vehicle_id,viewed_at DESC);
CREATE TABLE IF NOT EXISTS vehicle_videos (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS vehicle_documents (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  access_level TEXT NOT NULL DEFAULT 'private'
);
CREATE TABLE IF NOT EXISTS favourites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(user_id,vehicle_id)
);
CREATE TABLE IF NOT EXISTS recently_viewed (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  viewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(user_id,vehicle_id)
);
CREATE INDEX IF NOT EXISTS idx_recently_viewed_user_time ON recently_viewed(user_id,viewed_at DESC);
CREATE TABLE IF NOT EXISTS saved_searches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  query_json TEXT NOT NULL,
  alerts_enabled INTEGER NOT NULL DEFAULT 0 CHECK (alerts_enabled IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS enquiries (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dealer_id TEXT REFERENCES dealer_profiles(user_id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  original_message TEXT NOT NULL DEFAULT '',
  admin_status TEXT NOT NULL DEFAULT 'pending_admin' CHECK (admin_status IN ('pending_admin','forwarded','rejected')),
  forwarded_to_seller INTEGER NOT NULL DEFAULT 0 CHECK (forwarded_to_seller IN (0,1)),
  admin_notes TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  forwarded_at TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','replied','closed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dealer_id TEXT NOT NULL REFERENCES dealer_profiles(user_id) ON DELETE CASCADE,
  vehicle_id TEXT REFERENCES vehicles(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(buyer_id,dealer_id,vehicle_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS enquiry_messages (
  id TEXT PRIMARY KEY,
  enquiry_id TEXT NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (length(message) BETWEEN 2 AND 2000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_enquiry_messages_thread ON enquiry_messages(enquiry_id,created_at);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  vehicle_id TEXT REFERENCES vehicles(id) ON DELETE CASCADE,
  seller_id TEXT REFERENCES dealer_profiles(user_id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS vehicle_verifications (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT
);
CREATE TABLE IF NOT EXISTS inspections (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  provider_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  report_key TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS import_records (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id TEXT REFERENCES vehicles(id) ON DELETE SET NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'vehicle_purchased',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS shipping_estimates (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  vehicle_type TEXT NOT NULL,
  method TEXT NOT NULL,
  estimate_minor INTEGER,
  assumptions TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS customs_rules (
  id INTEGER PRIMARY KEY,
  country_code TEXT NOT NULL,
  rule_json TEXT NOT NULL,
  source_url TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  UNIQUE(country_code,effective_at)
);
CREATE TABLE IF NOT EXISTS dealer_subscriptions (
  id TEXT PRIMARY KEY,
  dealer_id TEXT NOT NULL REFERENCES dealer_profiles(user_id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'inactive',
  external_subscription_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL,
  external_payment_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(provider,external_payment_id)
);
CREATE TABLE IF NOT EXISTS admin_roles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  permissions_json TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_vehicles_public ON vehicles(status,year DESC,price_minor);
CREATE INDEX IF NOT EXISTS idx_vehicles_make_model ON vehicles(make,model,year);
CREATE INDEX IF NOT EXISTS idx_vehicles_discovery ON vehicles(status,make,year,mileage,price_minor);
CREATE INDEX IF NOT EXISTS idx_vehicles_dealer ON vehicles(dealer_id,status);
CREATE INDEX IF NOT EXISTS idx_images_vehicle ON vehicle_images(vehicle_id,sort_order);
CREATE INDEX IF NOT EXISTS idx_enquiries_dealer_status ON enquiries(dealer_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id,created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status,created_at DESC);

-- Seller advertising fees; never vehicle purchase payments.
CREATE TABLE IF NOT EXISTS listing_fee_payments (
 reference TEXT PRIMARY KEY, seller_id TEXT NOT NULL REFERENCES users(id),
 vehicle_id TEXT NOT NULL REFERENCES vehicles(id), amount_minor INTEGER NOT NULL,
 currency TEXT NOT NULL, status TEXT NOT NULL, livemode INTEGER NOT NULL DEFAULT 0,
 checkout_url TEXT, created_at TEXT NOT NULL, paid_at TEXT
);
CREATE INDEX IF NOT EXISTS fee_vehicle ON listing_fee_payments(vehicle_id,status);
