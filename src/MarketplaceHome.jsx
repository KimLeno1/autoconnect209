import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowRight,ArrowUpRight,Search,ShieldCheck,MessageCircle,Heart,Check,Plus,X} from 'lucide-react';
import './marketplace.css';
const road='/assets/editorial/porsche-road.webp';
const showroom='/assets/editorial/car-detail.webp';
const money=(n,c='GHS')=>new Intl.NumberFormat('en-GH',{style:'currency',currency:c,maximumFractionDigits:0}).format(n||0);
const name=c=>`${c.year} ${c.make} ${c.model}`;

function matchesKeyword(car, rawKeyword) {
 const query = String(rawKeyword || '').trim().toLowerCase();
 if (!query) return true;
 const searchable = `${car.make || ''} ${car.model || ''} ${car.trim || ''} ${car.year || ''} ${car.city || ''} ${car.location || ''} ${car.body_type || ''} ${car.fuel || ''}`.toLowerCase();
 return query.split(/\s+/).every(token => searchable.includes(token));
}

function matchesCategory(car, category) {
 if (!category || category === 'all') return true;
 const body = String(car.body_type || '').toLowerCase();
 const fuel = String(car.fuel || '').toLowerCase();
 if (category === 'suv') return body.includes('suv') || body.includes('wagon') || body.includes('pickup');
 if (category === 'sedan') return body.includes('sedan') || body.includes('coupe');
 if (category === 'electric') return fuel.includes('electric') || fuel.includes('hybrid') || body.includes('electric');
 if (category === 'offers') return Boolean(car.allowOffers || car.allow_offers || car.listingData?.allowOffers);
 return true;
}

export function CarLoader({label='Loading showroom inventory…', compact=false}) {
 return (
  <div className="ac-car-loader py-6 text-center" role="status" aria-live="polite">
   <div className="ac-car-loader__stage">
    <svg
     className="ac-car-loader__svg"
     width={compact ? 220 : 320}
     height={compact ? 98 : 142}
     viewBox="0 0 360 156"
     fill="none"
     aria-hidden="true"
    >
     <defs>
      {/* 3D Liquid Sapphire & Titanium Metallic Body Gradient */}
      <linearGradient id="ac3dBodyPaint" x1="40" y1="30" x2="300" y2="118" gradientUnits="userSpaceOnUse">
       <stop offset="0%" stopColor="#93c5fd"/>
       <stop offset="18%" stopColor="#3b82f6"/>
       <stop offset="46%" stopColor="#1d4ed8"/>
       <stop offset="72%" stopColor="#0f172a"/>
       <stop offset="100%" stopColor="#1e3a8a"/>
      </linearGradient>
      {/* Sculpted Upper Hood & Shoulder Specular Gradient */}
      <linearGradient id="ac3dUpperDeck" x1="65" y1="34" x2="295" y2="86" gradientUnits="userSpaceOnUse">
       <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.95"/>
       <stop offset="28%" stopColor="#60a5fa" stopOpacity="0.9"/>
       <stop offset="65%" stopColor="#1e40af" stopOpacity="0.85"/>
       <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.92"/>
      </linearGradient>
      {/* 3D Lower Door & Flank Sculpt Shadow */}
      <linearGradient id="ac3dFlankSculpt" x1="90" y1="68" x2="265" y2="112" gradientUnits="userSpaceOnUse">
       <stop offset="0%" stopColor="#090d16"/>
       <stop offset="45%" stopColor="#172554"/>
       <stop offset="85%" stopColor="#1e3a8a"/>
       <stop offset="100%" stopColor="#0a0f1d"/>
      </linearGradient>
      {/* Carbon Fiber Aero Splitter, Side Skirt & Diffuser */}
      <linearGradient id="ac3dCarbon" x1="30" y1="100" x2="310" y2="118" gradientUnits="userSpaceOnUse">
       <stop offset="0%" stopColor="#090d16"/>
       <stop offset="50%" stopColor="#1e293b"/>
       <stop offset="100%" stopColor="#090d16"/>
      </linearGradient>
      {/* Panoramic Tinted Glass Canopy */}
      <linearGradient id="ac3dCanopyGlass" x1="110" y1="34" x2="245" y2="76" gradientUnits="userSpaceOnUse">
       <stop offset="0%" stopColor="#0f172a"/>
       <stop offset="35%" stopColor="#1e293b"/>
       <stop offset="75%" stopColor="#0ea5e9" stopOpacity="0.45"/>
       <stop offset="100%" stopColor="#bae6fd" stopOpacity="0.7"/>
      </linearGradient>
      {/* Sweeping Studio Softbox Reflection */}
      <linearGradient id="ac3dStudioSheen" x1="0" y1="0" x2="56" y2="0" gradientUnits="userSpaceOnUse">
       <stop offset="0%" stopColor="#ffffff" stopOpacity="0"/>
       <stop offset="50%" stopColor="#e0f2fe" stopOpacity="0.58"/>
       <stop offset="100%" stopColor="#ffffff" stopOpacity="0"/>
      </linearGradient>
      {/* Forged Alloy Metallic Rim */}
      <radialGradient id="ac3dAlloyRim" cx="50%" cy="42%" r="55%">
       <stop offset="0%" stopColor="#f8fafc"/>
       <stop offset="45%" stopColor="#94a3b8"/>
       <stop offset="80%" stopColor="#334155"/>
       <stop offset="100%" stopColor="#0f172a"/>
      </radialGradient>
      {/* Volumetric Matrix LED Headlight Beam */}
      <linearGradient id="ac3dHeadlightBeam" x1="296" y1="84" x2="358" y2="96" gradientUnits="userSpaceOnUse">
       <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.88"/>
       <stop offset="38%" stopColor="#38bdf8" stopOpacity="0.42"/>
       <stop offset="100%" stopColor="#38bdf8" stopOpacity="0"/>
      </linearGradient>
      {/* Crimson LED Taillight Trail */}
      <linearGradient id="ac3dTaillightTrail" x1="4" y1="74" x2="54" y2="74" gradientUnits="userSpaceOnUse">
       <stop offset="0%" stopColor="#f43f5e" stopOpacity="0"/>
       <stop offset="65%" stopColor="#fb7185" stopOpacity="0.48"/>
       <stop offset="100%" stopColor="#ffe4e6" stopOpacity="0.95"/>
      </linearGradient>
      {/* 3D Underbody Contact Shadow & Neon Studio Glow */}
      <radialGradient id="ac3dGroundShadow" cx="50%" cy="50%" r="50%">
       <stop offset="0%" stopColor="#020617" stopOpacity="0.95"/>
       <stop offset="58%" stopColor="#090d16" stopOpacity="0.72"/>
       <stop offset="82%" stopColor="#38bdf8" stopOpacity="0.22"/>
       <stop offset="100%" stopColor="#020617" stopOpacity="0"/>
      </radialGradient>
      {/* Clip path for studio reflection across the 3D body */}
      <clipPath id="ac3dBodyClip">
       <path d="M40 94 L44 72 C47 64 56 59 68 57 L108 42 C126 34 150 31 178 32 C202 33 224 41 244 54 L292 64 C306 67 315 75 318 85 L320 97 C320 103 314 107 305 108 L48 108 C42 108 39 102 40 94 Z"/>
      </clipPath>
     </defs>

     {/* 3D Perspective Showroom Floor Grid & Speed Lanes */}
     <g opacity="0.75">
      <ellipse className="ac-car-loader__shadow" cx="178" cy="121" rx="142" ry="15" fill="url(#ac3dGroundShadow)"/>
      <ellipse cx="178" cy="122" rx="112" ry="6" fill="#38bdf8" fillOpacity="0.16"/>
      <line className="ac-car-loader__road" x1="12" y1="128" x2="348" y2="128" stroke="#60a5fa" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round"/>
      <line className="ac-car-loader__road" x1="34" y1="136" x2="326" y2="136" stroke="#38bdf8" strokeOpacity="0.26" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="24" y1="115" x2="336" y2="115" stroke="#94a3b8" strokeOpacity="0.16" strokeWidth="1"/>
     </g>

     {/* Far-Side 3D Perspective Wheels (Back Plane for 3/4 Isometric Depth) */}
     <g transform="translate(8, -7)" opacity="0.55">
      <ellipse cx="102" cy="105" rx="22" ry="20" fill="#020617" stroke="#1e293b" strokeWidth="2"/>
      <ellipse cx="262" cy="105" rx="22" ry="20" fill="#020617" stroke="#1e293b" strokeWidth="2"/>
     </g>

     {/* Main 3D Suspended Supercar / GT Coupe Body Assembly */}
     <g className="ac-car-loader__body">
      {/* Aerodynamic Wind-Tunnel Slipstream Lines */}
      <path
       className="ac-car-loader__aero"
       d="M22 46 Q145 14 334 56"
       stroke="#7dd3fc"
       strokeOpacity="0.42"
       strokeWidth="1.4"
       strokeLinecap="round"
      />
      <path
       className="ac-car-loader__aero"
       d="M10 82 L46 82"
       stroke="url(#ac3dTaillightTrail)"
       strokeWidth="2.6"
       strokeLinecap="round"
      />

      {/* Volumetric Matrix LED Headlight Beam Cone */}
      <polygon
       className="ac-car-loader__beam"
       points="306,77 358,64 358,108 312,92"
       fill="url(#ac3dHeadlightBeam)"
      />

      {/* Active Swan-Neck GT Rear Wing (3D Isometric Dual Pylons + Top Blade) */}
      <g>
       <path d="M54 58 L46 42 L56 42 L62 57 Z" fill="#1e293b" stroke="#475569" strokeWidth="1"/>
       <path d="M66 56 L59 44 L67 44 L72 56 Z" fill="#0f172a" stroke="#334155" strokeWidth="0.9"/>
       {/* 3D Wing Main Foil */}
       <path
        d="M36 41 C45 38 62 38 75 41 L71 45 C58 44 45 44 34 45 Z"
        fill="url(#ac3dUpperDeck)"
        stroke="#bae6fd"
        strokeWidth="1"
       />
       {/* Wing Carbon Endplate */}
       <polygon points="34,38 43,39 40,48 31,47" fill="#0f172a" stroke="#60a5fa" strokeWidth="0.9"/>
      </g>

      {/* Far-Side 3D Hood & Fender Crest (Isometric Top Plane) */}
      <path
       d="M236 53 C262 55 288 60 309 69 L292 64 L240 55 Z"
       fill="#93c5fd"
       fillOpacity="0.45"
      />

      {/* Primary 3D Sculpted GT Coachwork Shell */}
      <path
       d="M40 94 L44 72 C47 63 56 58 68 56 L108 41 C126 33 151 30 179 31 C203 32 225 40 245 53 L293 63 C307 66 316 74 319 84 L321 96 C321 102 315 106 306 107 L48 107 C42 107 39 101 40 94 Z"
       fill="url(#ac3dBodyPaint)"
       stroke="#93c5fd"
       strokeOpacity="0.45"
       strokeWidth="1.4"
      />

      {/* 3D Upper Shoulder & Muscular Rear Haunch Plane */}
      <path
       d="M46 72 C55 64 72 60 94 59 L168 56 C198 55 228 57 254 62 L309 73 C314 75 317 79 318 83 C296 78 268 74 238 72 L92 71 C69 71 54 73 46 72 Z"
       fill="url(#ac3dUpperDeck)"
       opacity="0.72"
      />

      {/* Deep Sculpted Door Scallop & Side Air Intake Channel */}
      <path
       d="M126 68 L224 69 C234 73 238 82 232 94 L124 94 C116 86 116 75 126 68 Z"
       fill="url(#ac3dFlankSculpt)"
       stroke="#60a5fa"
       strokeOpacity="0.28"
       strokeWidth="1"
      />
      {/* 3D Side Aero Intake Scoop Behind Door */}
      <path
       d="M134 70 L152 70 L144 92 L128 92 Z"
       fill="#050811"
       stroke="#38bdf8"
       strokeOpacity="0.4"
       strokeWidth="0.9"
      />
      {/* Carbon-Fiber Lower Splitter, Side Sill Skirt & Rear Diffuser Fin */}
      <path
       d="M36 98 L324 98 L327 105 C327 107 323 109 316 109 L42 109 C36 109 34 105 36 98 Z"
       fill="url(#ac3dCarbon)"
       stroke="#475569"
       strokeWidth="1"
      />
      {/* Front Carbon Aero Canard */}
      <path d="M298 92 L322 95 L320 99 L295 96 Z" fill="#0f172a" stroke="#7dd3fc" strokeWidth="0.9"/>

      {/* Panoramic 3D Wrap-Around Glasshouse & Cockpit Interior */}
      <path
       d="M104 56 L124 41 C138 35 159 33 182 34 C202 35 220 42 237 54 L225 58 L104 56 Z"
       fill="url(#ac3dCanopyGlass)"
       stroke="#bae6fd"
       strokeOpacity="0.75"
       strokeWidth="1.3"
      />
      {/* Interior 3D Sport Bucket Seat & Roll Hoop Silhouette */}
      <path d="M154 55 L161 41 C163 39 167 39 168 42 L165 56 Z" fill="#0f172a" stroke="#60a5fa" strokeOpacity="0.45" strokeWidth="0.9"/>
      {/* B-Pillar & Rear Quarter Louver Window */}
      <line x1="176" y1="34" x2="167" y2="57" stroke="#090d16" strokeWidth="3.2"/>
      <line x1="177" y1="34" x2="168" y2="57" stroke="#93c5fd" strokeOpacity="0.5" strokeWidth="1"/>
      {/* Aerodynamic Wing Mirror */}
      <path d="M214 54 L226 51 C229 51 231 54 228 57 L215 58 Z" fill="#3b82f6" stroke="#e0f2fe" strokeWidth="0.9"/>

      {/* Sweeping Studio Softbox Highlight Across 3D Coachwork */}
      <g clipPath="url(#ac3dBodyClip)">
       <rect className="ac-car-loader__sheen" x="60" y="24" width="54" height="95" fill="url(#ac3dStudioSheen)"/>
      </g>

      {/* Animated Specular Rim-Light Trace Along Roofline & Bonnet */}
      <path
       className="ac-car-loader__trace"
       d="M44 72 C47 63 56 58 68 56 L108 41 C126 33 151 30 179 31 C203 32 225 40 245 53 L293 63 C307 66 316 74 319 84"
       stroke="#e0f2fe"
       strokeWidth="2.2"
       strokeLinecap="round"
      />

      {/* Quad-Matrix 3D LED Headlight Assembly */}
      <path
       d="M294 69 L315 75 C317 79 316 83 311 84 L291 78 Z"
       fill="#090d16"
       stroke="#bae6fd"
       strokeWidth="1.2"
      />
      <line x1="297" y1="73" x2="312" y2="77" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round"/>
      <line x1="296" y1="77" x2="309" y2="80" stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round"/>

      {/* Wrap-Around 3D Crimson LED Taillight Bar & Quad Exhaust Glow */}
      <path
       d="M41 72 L55 71 L53 81 L39 81 Z"
       fill="#ef4444"
       stroke="#fecdd3"
       strokeWidth="1.2"
      />
      <ellipse cx="43" cy="99" rx="4.5" ry="2.5" fill="#38bdf8" stroke="#e0f2fe" strokeWidth="0.8"/>

      {/* 3D Recessed Wheel Arch Flares */}
      <path d="M65 108 A31 31 0 0 1 129 108" fill="#030712" stroke="#60a5fa" strokeOpacity="0.45" strokeWidth="1.6"/>
      <path d="M229 108 A31 31 0 0 1 293 108" fill="#030712" stroke="#60a5fa" strokeOpacity="0.45" strokeWidth="1.6"/>
     </g>

     {/* Rear 3D Deep-Dish Forged Alloy Wheel + Stationary Performance Brake Caliper */}
     <g>
      {/* 3D Wide Tire Cylinder Shoulder */}
      <ellipse cx="94" cy="105" rx="25" ry="25" fill="#020617"/>
      <circle cx="97" cy="105" r="25" fill="#0b1120" stroke="#1e293b" strokeWidth="2.5"/>
      <circle cx="97" cy="105" r="21" fill="#090d16" stroke="url(#ac3dAlloyRim)" strokeWidth="2.4"/>
      {/* Cross-Drilled Brake Disc Rotor */}
      <circle cx="97" cy="105" r="14.5" fill="#1e293b" stroke="#64748b" strokeWidth="1.2" strokeDasharray="3 3"/>
      {/* Stationary Crimson Brembo Brake Caliper */}
      <path d="M82 97 C83 92 87 89 91 90 L93 96 L85 101 Z" fill="#ef4444" stroke="#fca5a5" strokeWidth="0.8"/>
      {/* Spinning 10-Spoke Forged Y-Alloy Rim */}
      <g className="ac-car-loader__wheel">
       <circle cx="97" cy="105" r="18.5" stroke="#e2e8f0" strokeOpacity="0.65" strokeWidth="1.2"/>
       <line x1="97" y1="86" x2="97" y2="124" stroke="#cbd5e1" strokeWidth="1.8"/>
       <line x1="78" y1="105" x2="116" y2="105" stroke="#cbd5e1" strokeWidth="1.8"/>
       <line x1="83.5" y1="91.5" x2="110.5" y2="118.5" stroke="#94a3b8" strokeWidth="1.5"/>
       <line x1="110.5" y1="91.5" x2="83.5" y2="118.5" stroke="#94a3b8" strokeWidth="1.5"/>
       <circle cx="97" cy="105" r="5.5" fill="#0f172a" stroke="#60a5fa" strokeWidth="1.6"/>
       <circle cx="97" cy="105" r="2.2" fill="#e0f2fe"/>
      </g>
      {/* Top 3D Specular Rim Highlight */}
      <path d="M81 92 A20 20 0 0 1 113 92" stroke="#f8fafc" strokeOpacity="0.5" strokeWidth="1.2" strokeLinecap="round"/>
     </g>

     {/* Front 3D Deep-Dish Forged Alloy Wheel + Stationary Performance Brake Caliper */}
     <g>
      {/* 3D Wide Tire Cylinder Shoulder */}
      <ellipse cx="258" cy="105" rx="25" ry="25" fill="#020617"/>
      <circle cx="261" cy="105" r="25" fill="#0b1120" stroke="#1e293b" strokeWidth="2.5"/>
      <circle cx="261" cy="105" r="21" fill="#090d16" stroke="url(#ac3dAlloyRim)" strokeWidth="2.4"/>
      {/* Cross-Drilled Brake Disc Rotor */}
      <circle cx="261" cy="105" r="14.5" fill="#1e293b" stroke="#64748b" strokeWidth="1.2" strokeDasharray="3 3"/>
      {/* Stationary Crimson Brembo Brake Caliper */}
      <path d="M246 97 C247 92 251 89 255 90 L257 96 L249 101 Z" fill="#ef4444" stroke="#fca5a5" strokeWidth="0.8"/>
      {/* Spinning 10-Spoke Forged Y-Alloy Rim */}
      <g className="ac-car-loader__wheel">
       <circle cx="261" cy="105" r="18.5" stroke="#e2e8f0" strokeOpacity="0.65" strokeWidth="1.2"/>
       <line x1="261" y1="86" x2="261" y2="124" stroke="#cbd5e1" strokeWidth="1.8"/>
       <line x1="242" y1="105" x2="280" y2="105" stroke="#cbd5e1" strokeWidth="1.8"/>
       <line x1="247.5" y1="91.5" x2="274.5" y2="118.5" stroke="#94a3b8" strokeWidth="1.5"/>
       <line x1="274.5" y1="91.5" x2="247.5" y2="118.5" stroke="#94a3b8" strokeWidth="1.5"/>
       <circle cx="261" cy="105" r="5.5" fill="#0f172a" stroke="#60a5fa" strokeWidth="1.6"/>
       <circle cx="261" cy="105" r="2.2" fill="#e0f2fe"/>
      </g>
      {/* Top 3D Specular Rim Highlight */}
      <path d="M245 92 A20 20 0 0 1 277 92" stroke="#f8fafc" strokeOpacity="0.5" strokeWidth="1.2" strokeLinecap="round"/>
     </g>
    </svg>
   </div>
   <span className="font-mono text-xs tracking-wide text-slate-700 dark:text-zinc-200">{label}</span>
  </div>
 );
}

export function VehicleCardSkeleton({count=6}) {
 return <>
  {Array.from({length:count},(_,i)=>(
   <div key={i} className="overflow-hidden rounded-xl border border-slate-200 bg-white p-0 dark:border-white/10 dark:bg-[#101722]" aria-hidden="true">
    <div className="ac-skeleton aspect-[1.65] w-full"/>
    <div className="space-y-3.5 p-5">
     <div className="flex items-center justify-between gap-4">
      <div className="ac-skeleton h-5 w-2/3 rounded"/>
      <div className="ac-skeleton h-5 w-1/4 rounded"/>
     </div>
     <div className="ac-skeleton h-3.5 w-1/2 rounded"/>
     <div className="flex gap-3 pt-2">
      <div className="ac-skeleton h-3.5 w-16 rounded"/>
      <div className="ac-skeleton h-3.5 w-16 rounded"/>
      <div className="ac-skeleton h-3.5 w-16 rounded"/>
     </div>
     <div className="ac-skeleton mt-3 h-11 w-full rounded-md"/>
    </div>
   </div>
  ))}
 </>;
}

const defaultHeroGallery=[
 {url:road,alt:'Porsche 911 Carrera S driving along an open road'},
 {url:'/assets/editorial/defender.webp',alt:'Land Rover Defender 110 exterior profile'},
 {url:'/assets/editorial/taycan.webp',alt:'Porsche Taycan 4S electric saloon'},
 {url:'/assets/editorial/audi-rs6.webp',alt:'Audi RS 6 Avant front three-quarter'},
 {url:showroom,alt:'Showroom inspection bay detail'}
];
const demoLeadMap={'demo-defender':'/assets/editorial/defender.webp','demo-taycan':'/assets/editorial/taycan.webp','demo-audi-rs6':'/assets/editorial/audi-rs6.webp','demo-porsche-911':road};

function getHeroCarPhotos(car) {
 if (!car) return defaultHeroGallery;
 const list = [];
 const seen = new Set();
 const pushPhoto = (url, alt) => {
  if (!url || seen.has(url)) return;
  seen.add(url);
  list.push({ url, alt: alt || `${name(car)} photo ${list.length + 1}` });
 };
 if (car.is_demo && demoLeadMap[car.id]) {
  pushPhoto(demoLeadMap[car.id], `${name(car)} — Editorial view`);
 }
 for (const img of car.images || []) {
  const rawUrl = typeof img === 'string' ? img : img?.url;
  pushPhoto(rawUrl, img?.alt || `${name(car)} — Gallery view`);
 }
 if (list.length < 3) {
  pushPhoto(road, `${name(car)} — Road profile`);
  pushPhoto(showroom, `${name(car)} — Showroom detail`);
  pushPhoto('/assets/editorial/defender.webp', `${name(car)} — Exterior angle`);
 }
 return list;
}

// Cinematic techniques: masked hero entrance, three depth planes and one pointer-led type moment.
// All account controls retain their spatial position; scenes remain readable without motion.
export default function MarketplaceHome({cars,busy,onSearch,renderCar,importSection,user}) {
 const statement=useRef(null);
 const [keyword,setKeyword]=useState('');
 const [category,setCategory]=useState('all');
 const [categoryBusy,setCategoryBusy]=useState(false);
 const [heroPhotoIndex,setHeroPhotoIndex]=useState(0);
 const selectCategory=nextCategory=>{
  if(nextCategory===category)return;
  setCategory(nextCategory);
  setCategoryBusy(true);
 };
 useEffect(()=>{
  if(!categoryBusy)return;
  const timer=setTimeout(()=>setCategoryBusy(false),320);
  return()=>clearTimeout(timer);
 },[categoryBusy]);
 useEffect(()=>{
  let disposed=false,moments,generation=0;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarse=window.matchMedia('(pointer: coarse)');
  import('../public/assets/taste/motion/motion.js').then(m=>{if(!disposed)m.refresh();}).catch(()=>{});
  const mountHeading=async()=>{
   const version=++generation;
   const url=new URL('/assets/taste/moments/moments.js',window.location.origin).href;
   try {
    const m=await import(/* @vite-ignore */ url);
    if(disposed||version!==generation)return;
    moments=m;m.unmountAll(document);
    if(statement.current){delete statement.current.dataset.momentStill;await m.mount(statement.current);}
   }catch{}
  };
  mountHeading();
  reduced.addEventListener('change',mountHeading);coarse.addEventListener('change',mountHeading);
  return()=>{disposed=true;generation++;reduced.removeEventListener('change',mountHeading);coarse.removeEventListener('change',mountHeading);moments?.unmountAll(document);};
 },[]);
 const filteredCars=useMemo(()=>cars.filter(c=>matchesKeyword(c,keyword)&&matchesCategory(c,category)),[cars,keyword,category]);
 const isFiltering=Boolean(keyword.trim()||category!=='all');
 const displayedCars=isFiltering?filteredCars:filteredCars.slice(0,6);
 const compare=cars.slice(0,2);
 const activeSpotlight=cars[0]||null;
 const heroPhotos=useMemo(()=>getHeroCarPhotos(activeSpotlight),[activeSpotlight]);
 const safePhotoIndex=heroPhotoIndex%Math.max(1,heroPhotos.length);
 const activeHeroPhoto=heroPhotos[safePhotoIndex]||defaultHeroGallery[0];
 const switchHeroPhoto=delta=>{
  if(heroPhotos.length<=1)return;
  setHeroPhotoIndex(i=>(i+delta+heroPhotos.length)%heroPhotos.length);
 };
 const isGridLoading=busy||categoryBusy;
 const categories=[
  ['all','All vehicles'],
  ['suv','SUVs & 4x4'],
  ['sedan','Sedans & Coupes'],
  ['electric','Electric & Hybrid'],
  ['offers','Accepts Offers']
 ];
 return <>
  <section className="hero mk-hero scene" data-scene="hero" data-enter="" aria-labelledby="market-heading">
   <div className="mk-ground depth-0" data-depth="0" aria-hidden="true"/>
   <div className="wrap mk-wrap mk-hero-grid">
    <div className="mk-hero-copy depth-4" data-depth="4">
     <h1 id="market-heading">Cars for your<br/> next <span>chapter.</span></h1>
     <p>Find your next car in Ghana. Compare the details, build a shortlist and review verified listings through Auto Connect.</p>
     <form className="mk-search" onSubmit={onSearch} role="search"><label><Search size={20} aria-hidden="true"/><span className="sr-only">Search makes, models or locations</span><input name="q" value={keyword} onChange={e=>setKeyword(e.target.value)} aria-label="Search makes, models or locations" placeholder="Search or filter by make, model, or location (e.g. Toyota, Porsche, RX 350)"/>{keyword&&<button type="button" aria-label="Clear search filter" onClick={()=>setKeyword('')} className="rounded p-1 text-zinc-400 hover:text-white"><X size={15}/></button>}</label><button className="btn-primary" type="submit">Search<ArrowRight size={18} aria-hidden="true"/></button></form>
     <div className="mk-quick-links" aria-label="Popular vehicle searches"><a href="/browse?bodyType=SUV">SUVs<ArrowUpRight size={15}/></a><a href="/browse?bodyType=Sedan">Sedans<ArrowUpRight size={15}/></a><a href="/browse?fuel=Electric">Electric<ArrowUpRight size={15}/></a></div>
     <p className="mk-hero-fact"><ShieldCheck size={17} aria-hidden="true"/>Buyers browse free. Sellers pay to advertise.</p>
    </div>
    <div
     className="mk-hero-media hero__media depth-3 group"
     data-depth="3"
     data-enter-media=""
     tabIndex={0}
     aria-label="Featured vehicle multi-photo hero gallery"
     onKeyDown={e=>{if(e.key==='ArrowLeft'){e.preventDefault();switchHeroPhoto(-1);}else if(e.key==='ArrowRight'){e.preventDefault();switchHeroPhoto(1);}}}
    >
     <img
      key={activeHeroPhoto.url}
      src={activeHeroPhoto.url}
      onError={e=>{e.currentTarget.src=road;}}
      width="1600"
      height="1067"
      fetchPriority="high"
      alt={activeHeroPhoto.alt||'Featured vehicle photograph'}
      data-source="Unsplash"
      data-subject="automotive editorial photograph"
      className="ac-photo-fade transition-transform duration-700 group-hover:scale-[1.03]"
     />
     {heroPhotos.length>1&&(
      <div className="absolute inset-x-5 bottom-5 z-10 flex items-center gap-2 overflow-x-auto pb-1" role="group" aria-label="Select car photo angle">
       {heroPhotos.map((photo,idx)=>(
        <button
         key={photo.url+idx}
         type="button"
         aria-label={`View photo ${idx+1} of ${activeSpotlight?name(activeSpotlight):'featured vehicle'}`}
         aria-pressed={safePhotoIndex===idx}
         onClick={()=>setHeroPhotoIndex(idx)}
         className={`relative h-12 w-16 shrink-0 overflow-hidden rounded-md border-2 transition-all ${safePhotoIndex===idx?'scale-105 border-sky-400 shadow-lg':'border-white/25 opacity-75 hover:opacity-100'}`}
        >
         <img src={photo.url} onError={e=>{e.currentTarget.src=road;}} alt="" className="h-full w-full object-cover"/>
        </button>
       ))}
      </div>
     )}
    </div>
   </div>
  </section>

  <section id="browse" className="mk-section mk-collection" aria-labelledby="collection-heading">
   <div className="wrap mk-wrap">
    <div className="mk-section-head flex-wrap">
     <div>
      <h2 id="collection-heading">Find cars for your shortlist.</h2>
      <p role="status" aria-live="polite">{isFiltering?`Showing ${filteredCars.length} matching vehicle${filteredCars.length===1?'':'s'}${keyword.trim()?` for "${keyword.trim()}"`:''}.`:'Explore the collection by make, model, price, location and the details that matter to you.'}</p>
      <div className="mt-5 flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-white/10 dark:bg-[#121a26]" role="group" aria-label="Filter collection by category">
       {categories.map(([id,label])=>(
        <button
         key={id}
         type="button"
         aria-pressed={category===id}
         onClick={()=>selectCategory(id)}
         className={`min-h-9 rounded-md px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-all duration-150 ${category===id?'bg-blue-600 text-white shadow-sm dark:bg-market-blue dark:text-[#0b0f14]':'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white'}`}
        >
         {label}
        </button>
       ))}
      </div>
     </div>
     <a href="/browse" className="btn-secondary">Browse all cars<ArrowUpRight size={18}/></a>
    </div>
    <div className="mk-car-grid" aria-busy={isGridLoading}>
     {isGridLoading?(
      <>
       <div className="col-span-full flex justify-center py-2"><CarLoader label="Loading verified Ghana showroom vehicles…"/></div>
       <VehicleCardSkeleton count={6}/>
      </>
     ):(
      displayedCars.map((car,index)=>renderCar(car,index))
     )}
     {!isGridLoading&&!displayedCars.length&&(
      <div className="mk-empty" role="status">
       <h3>{isFiltering?`No vehicles match ${keyword.trim()?`"${keyword}"`:'this category'}`:'The collection could not be loaded'}</h3>
       <p>{isFiltering?'Try another make, model, or category tab, or reset the filter to view all vehicles.':'Open vehicle search to try again.'}</p>
       {isFiltering?<button type="button" onClick={()=>{setKeyword('');selectCategory('all');}} className="btn-secondary">Clear filter</button>:<a href="/browse" className="btn-secondary">Browse vehicles<ArrowRight size={16}/></a>}
      </div>
     )}
    </div>
    <p className="mk-disclosure">Prototype collection: listings, availability, prices and stock photographs are illustrative. Confirm every vehicle through Auto Connect.</p>
   </div>
  </section>

  <section id="about" className="mk-section mk-compare" aria-labelledby="compare-heading"><div className="wrap mk-wrap">
   <div className="mk-section-head"><div><h2 id="compare-heading">Compare your next car.</h2><p>Keep up to three cars side by side. See how price, mileage and specifications compare before you start a conversation.</p></div><a className="btn-secondary" href="/browse">Build your comparison<ArrowRight size={18}/></a></div>
   <div className="mk-compare-layout"><div className="mk-steps"><div><Heart size={22}/><h3>Save your shortlist.</h3><p>Save cars to return to later.</p></div><div><ShieldCheck size={22}/><h3>Check vehicle details.</h3><p>Confirm condition, records and seller identity.</p></div><div><MessageCircle size={22}/><h3>Ask through Auto Connect.</h3><p>Send questions or offers mediated by our team.</p></div></div>
   <div className="mk-comparison app-frame" aria-label="Sample vehicle comparison"><div className="mk-comparison-head"><span>Side by side</span><span>{compare.length} vehicles</span></div>{compare.length===2?<><table className="mk-compare-table"><caption className="sr-only">Sample vehicle details side by side</caption><thead><tr><th scope="col">Vehicle</th>{compare.map(c=><th scope="col" key={c.id}><a href={`/vehicle/${c.id}`}>{name(c)}<ArrowUpRight size={16}/></a></th>)}</tr></thead><tbody>{[['Asking price',c=>money(c.price,c.currency)],['Mileage',c=>new Intl.NumberFormat('en').format(c.mileage)+' '+(c.listingData?.mileageUnit||'mi')],['Transmission',c=>c.transmission],['Location',c=>c.city]].map(([label,value])=><tr key={label}><th scope="row">{label}</th>{compare.map(c=><td key={c.id}>{value(c)}</td>)}</tr>)}</tbody></table></>:<p className="mk-comparison-empty">Select cars in the collection to compare them.</p>}<div className="mk-comparison-bottom"><Check size={16}/>Your decision, with the details in view.</div></div>
   </div>
  </div></section>

  <section id="dealers" className="mk-section mk-seller scene" data-scene="seller" aria-labelledby="seller-heading"><div className="wrap mk-wrap">
   <div className="mk-seller-layout"><div className="mk-seller-image depth-0" data-depth="0"><img src={showroom} loading="lazy" width="1400" height="827" alt="White sports car in a vehicle showroom" data-source="Unsplash" data-subject="vehicle showroom editorial photograph"/></div><div className="mk-seller-copy depth-4" data-depth="4"><h2 ref={statement} id="seller-heading" data-moment="liquid-type">Your car.<br/>Its next owner.</h2><p>Create your seller profile, prepare a listing and receive verified buyer offers in one workspace.</p><a className="btn-primary" href={user?.role==='dealer'?'/dealer/dashboard':'/register?role=dealer'}>{user?.role==='dealer'?'Open seller workspace':'Start selling'}<ArrowUpRight size={18}/></a><div className="mk-fee-fact"><strong>GHS 60–200</strong><span>Publishing fee based on the vehicle’s asking price.</span></div></div></div>
   <ol className="mk-seller-process depth-3" data-depth="3"><li><span>01</span><div><h3>Prepare your listing</h3><p>Save a draft with photos, details, and an optional private offer range.</p></div></li><li><span>02</span><div><h3>Complete the checks</h3><p>Review the profile and listing requirements.</p></div></li><li><span>03</span><div><h3>Publish after approval</h3><p>Pay the required listing fee to advertise.</p></div></li></ol>
   <p className="mk-disclosure">Payment collection is awaiting provider setup. Drafts are free; this preview includes a Paystack simulator for testing listing fees.</p>
  </div></section>

  {importSection}
  <section id="faq" className="mk-section mk-faq" aria-labelledby="faq-heading"><div className="wrap mk-wrap mk-faq-layout"><div><h2 id="faq-heading">Questions before<br/>your next car.</h2><p>Get to know how Auto Connect works.</p><a href="/browse" className="btn-primary">Explore vehicles<ArrowRight size={18}/></a></div><div className="mk-questions">{[['Do buyers pay Auto Connect?','Browsing and submitting enquiries or offers through Auto Connect are free. Auto Connect charges sellers to publish listings.'],['How do enquiries and offers work?','Auto Connect acts as the middleman between buyers and sellers. When you ask about a car, our administrators review, edit if necessary, and forward your enquiry to the seller.'],['Are these vehicles available to buy?','The current prototype contains illustrative vehicle records and stock photos. They demonstrate the experience and are not verified offers.'],['What does seller approval mean?','Marketplace profile approval, identity verification and listing review have separate statuses. A profile approval does not verify the condition or history of a vehicle.'],['Where do replies appear?','Open Messages in your account to view updates linked to the vehicle. External email and text delivery are not connected.']].map(([q,a])=><details key={q}><summary>{q}<Plus size={19} aria-hidden="true"/></summary><p>{a}</p></details>)}</div></div></section>
 </>;
}

