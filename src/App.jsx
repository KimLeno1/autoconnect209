import MarketplaceHome, { CarLoader, VehicleCardSkeleton } from './MarketplaceHome.jsx';

import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, BookmarkPlus, Check, ChevronDown,
  CircleAlert, CircleCheck, ClipboardCheck, Fuel, Gauge, Heart, KeyRound,
  Menu, MessageCircle, Search, Shield, SlidersHorizontal, Plus, X
} from 'lucide-react';
import {SellerPublicProfile,SellerWorkspace} from './SellerWorkspace.jsx';


const BuyerConsole=lazy(()=>import('./BuyerConsole.jsx'));
const AdminWorkspace=lazy(()=>import('./AdminWorkspace.jsx'));
const fallback = '/assets/images/car-fallback.svg';
const money = (n, currency='GHS') => new Intl.NumberFormat('en-GH',{style:'currency',currency,maximumFractionDigits:0}).format(Number(n)||0);
const number = n => new Intl.NumberFormat('en-US').format(Number(n)||0);
const demoPhotos={'demo-defender':'defender','demo-taycan':'taycan','demo-audi-rs6':'audi-rs6'};
const carTitle = c => `${c?.year||''} ${c?.make||''} ${c?.model||''}`.trim();

function optimizeImageUrl(src, width=1200) {
  if(!src) return fallback;
  if(!src.startsWith('https://images.unsplash.com/')) return src;
  try {
    const url=new URL(src);
    url.searchParams.set('w',String(width));
    url.searchParams.set('q','82');
    url.searchParams.set('fm','webp');
    return url.href;
  } catch {
    return src;
  }
}

const vehicleImages = c => {
  if (!c) return [];
  const list = [];
  const seen = new Set();
  const push = (url, alt) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    list.push({ url, alt: alt || `${carTitle(c)} — Photo ${list.length + 1}` });
  };
  if (c.is_demo && demoPhotos[c.id]) {
    push(`/assets/editorial/${demoPhotos[c.id]}.webp`, `${carTitle(c)} — Editorial view`);
  }
  for (const item of c.images || []) {
    const rawUrl = typeof item === 'string' ? item : item?.url || item?.image_url;
    push(rawUrl, item?.alt || item?.alt_text);
  }
  if (c.image_url) {
    push(c.image_url, `${carTitle(c)} — Main photo`);
  }
  if (c.is_demo && list.length < 3) {
    push('/assets/editorial/porsche-road.webp', `${carTitle(c)} — Road profile`);
    push('/assets/editorial/car-detail.webp', `${carTitle(c)} — Showroom detail`);
    push('/assets/editorial/defender.webp', `${carTitle(c)} — Exterior stance`);
  }
  return list;
};

const listingPhoto = (c, index=0) => {
  const imgs = vehicleImages(c);
  const src = imgs[index]?.url || imgs[0]?.url || fallback;
  return optimizeImageUrl(src, 800);
};
const readSet = k => { try { return new Set(JSON.parse(localStorage.getItem(k)||'[]')); } catch { return new Set(); } };
const saveSet = (k,v) => localStorage.setItem(k,JSON.stringify([...v]));

function FullPageCarLoader({label='Opening workspace…'}) {
  return <div className="grid min-h-[75svh] place-items-center bg-slate-50 px-5 dark:bg-[#0b0f14]"><CarLoader label={label}/></div>;
}

async function request(path,{method='GET',body,csrf}={}) {
  const headers={}; if(body!==undefined)headers['Content-Type']='application/json'; if(csrf&&method!=='GET')headers['X-CSRF-Token']=csrf;
  const res=await fetch(path,{method,headers,credentials:'same-origin',body:body===undefined?undefined:JSON.stringify(body)});
  const data=await res.json().catch(()=>({})); if(!res.ok)throw Object.assign(new Error(data.error||'That request could not be completed.'),{fields:data.fields,status:res.status}); return data;
}
async function preparePhoto(file) {
  if(!file.type.startsWith('image/'))throw new Error('Choose an image file.');
  const bitmap=await createImageBitmap(file);const scale=Math.min(1,1280/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  let quality=.82,blob;
  do { blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));quality-=.1; } while(blob&&blob.size>480_000&&quality>=.42);
  if(!blob||blob.size>512_000)throw new Error(`${file.name} is too large to prepare. Choose a smaller image.`);
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Could not read the selected photo.'));reader.readAsDataURL(blob);});
  return {type:'image/jpeg',data};
}

function App() {
  const [path,setPath]=useState(location.pathname);
  const [searchString,setSearchString]=useState(location.search);
  const [user,setUser]=useState(null); const [csrf,setCsrf]=useState(null);
  const [cars,setCars]=useState([]); const [resultCount,setResultCount]=useState(0); const [resultPages,setResultPages]=useState(1); const [favorites,setFavorites]=useState(readSet('apex:favorites'));
  const [compared,setCompared]=useState(readSet('apex:compare'));
  const [toast,setToast]=useState(''); const [mobileOpen,setMobileOpen]=useState(false);
  const [modal,setModal]=useState(null); const [checkoutCar,setCheckoutCar]=useState(null); const [activeCar,setActiveCar]=useState(null);
  const [busy,setBusy]=useState(()=>location.pathname==='/'||location.pathname==='/index.html'||location.pathname==='/browse');
  const [vehicleBusy,setVehicleBusy]=useState(()=>location.pathname.startsWith('/vehicle/'));
  const [listingError,setListingError]=useState('');

  const go=useCallback((to,{scroll=true}={})=>{
    const url=new URL(to,location.origin); history.pushState({},'',url.pathname+url.search+url.hash);
    setPath(url.pathname); setSearchString(url.search); setMobileOpen(false);
    const behavior=window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
    if(scroll)window.scrollTo({top:0,behavior});
    if(url.hash)setTimeout(()=>document.querySelector(url.hash)?.scrollIntoView({behavior}),80);
  },[]);
  useEffect(()=>{const pop=()=>{setPath(location.pathname);setSearchString(location.search);};const click=e=>{const a=e.target.closest('a[href]');if(!a||a.target||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;const u=new URL(a.href,location.href);if(u.origin!==location.origin)return;const anchorTarget=u.hash&&u.pathname===location.pathname&&u.search===location.search?document.getElementById(decodeURIComponent(u.hash.slice(1))):null;if(anchorTarget?.matches('main[tabindex]')){e.preventDefault();anchorTarget.focus({preventScroll:true});anchorTarget.scrollIntoView({behavior:'auto'});return;}e.preventDefault();go(u.pathname+u.search+u.hash,{scroll:!u.hash});};window.addEventListener('popstate',pop);document.addEventListener('click',click);return()=>{window.removeEventListener('popstate',pop);document.removeEventListener('click',click);};},[go]);
  useEffect(()=>{request('/api/auth/me').then(async d=>{setUser(d.user);setCsrf(d.csrfToken);if(d.user?.role==='buyer'){try{const {items}=await request('/api/favourites');const ids=new Set(items.map(c=>c.id));setFavorites(ids);saveSet('apex:favorites',ids);}catch{}}}).catch(()=>{});},[]);
  const notify=msg=>{setToast(msg);setTimeout(()=>setToast(''),3000);};

  const loadCars=useCallback(async(query='')=>{
    const params=new URLSearchParams(query);if(!params.has('page'))params.set('page','1');
    setBusy(true);setListingError('');
    try{
      const [{items,total,pages}]=await Promise.all([
        request(`/api/listings?${params.toString()}`),
        new Promise(resolve=>setTimeout(resolve,380))
      ]);
      setCars(items);setResultCount(total);setResultPages(pages||1);
    }
    catch(e){setListingError(e.message);setCars([]);notify(e.message);}finally{setBusy(false);}
  },[]);
  useEffect(()=>{if(path==='/'||path==='/browse')loadCars(searchString.replace(/^\?/,'').replace(/^return=.*$/,''));},[path,searchString,loadCars]);

  const toggleFavorite=async car=>{
    const next=new Set(favorites),on=!next.has(car.id); if(on)next.add(car.id);else next.delete(car.id);
    if(user?.role==='buyer') {try{await request(`/api/favourites/${encodeURIComponent(car.id)}`,{method:on?'PUT':'DELETE',csrf});}catch(e){notify(e.message);return;}}
    else if(user&&user.role!=='buyer'){notify('Sign in with a buyer account to save cars.');return;}
    setFavorites(next);saveSet('apex:favorites',next);notify(on?'Car saved to your shortlist.':'Removed from your shortlist.');
  };
  const toggleCompare=id=>{const next=new Set(compared);if(next.has(id))next.delete(id);else if(next.size<3)next.add(id);else {notify('Compare up to three cars at a time.');return;}setCompared(next);saveSet('apex:compare',next);};

  useEffect(()=>{if(path.startsWith('/vehicle/')){const vehicleId=encodeURIComponent(path.split('/')[2]);setVehicleBusy(true);Promise.all([request(`/api/listings/${vehicleId}`),new Promise(resolve=>setTimeout(resolve,360))]).then(([d])=>{setActiveCar(d.vehicle);if(user?.role==='buyer'&&csrf)request(`/api/buyer/recently-viewed/${vehicleId}`,{method:'POST',csrf}).catch(()=>{});if(user?.role==='buyer'&&new URLSearchParams(location.search).get('buy')==='1'){setCheckoutCar(d.vehicle);history.replaceState({},'',location.pathname);setSearchString('');}}).catch(()=>setActiveCar(null)).finally(()=>setVehicleBusy(false));}else{setActiveCar(null);setVehicleBusy(false);}},[path,user?.id,user?.role,csrf]);
  useEffect(()=>{
    if(path!=='/favorites')return;
    if(user?.role==='buyer')request('/api/favourites').then(d=>{const ids=new Set(d.items.map(c=>c.id));setFavorites(ids);saveSet('apex:favorites',ids);setCars(d.items);}).catch(e=>notify(e.message));
    else Promise.all([...favorites].map(id=>request(`/api/listings/${encodeURIComponent(id)}`).then(x=>x.vehicle).catch(()=>null))).then(list=>setCars(list.filter(Boolean)));
  },[path,user?.id,user?.role]);

  const login=async(form,role='buyer')=>{
    const data=Object.fromEntries(new FormData(form));
    const endpoint=form.dataset.mode==='register'?'/api/auth/register':'/api/auth/login';
    const result=await request(endpoint,{method:'POST',body:{...data,role}});setUser(result.user);setCsrf(result.csrfToken);if(result.user.role==='buyer'){try{const {items}=await request('/api/favourites');const ids=new Set(items.map(c=>c.id));setFavorites(ids);saveSet('apex:favorites',ids);}catch{}}
    const returnTo=new URLSearchParams(searchString).get('return');
    go(role==='admin'?'/admin':result.user.role==='dealer'?'/dealer/dashboard':returnTo?.startsWith('/')&&!returnTo.startsWith('//')?returnTo:'/account');
  };
  const logout=async()=>{try{await request('/api/auth/logout',{method:'POST',csrf});}catch{}setUser(null);setCsrf(null);setCheckoutCar(null);go('/');};

  const browse=(query='')=>go(`/browse${query?`?${query}`:''}`);
  const submitSearch=e=>{e.preventDefault();const q=new URLSearchParams(new FormData(e.currentTarget));for(const [low,high,label] of [['minPrice','maxPrice','price'],['minYear','maxYear','year'],['minMileage','maxMileage','mileage']]){const min=Number(q.get(low)),max=Number(q.get(high));if(min>0&&max>0&&min>max){notify(`Minimum ${label} must not exceed maximum ${label}.`);return;}}browse(q.toString());};
  const changePage=page=>{const params=new URLSearchParams(searchString);params.set('page',String(page));browse(params.toString());};
  const saveSearch=async()=>{if(user?.role!=='buyer'){go('/login?return=%2Faccount');return;}try{const search=Object.fromEntries(new URLSearchParams(searchString));const label=search.q||search.make||search.location||'Vehicle search';await request('/api/saved-searches',{method:'POST',csrf,body:{label:`${label} search`,search}});notify('Search saved to your account. Alerts are not connected yet.');}catch(e){notify(e.message);}};
  const enquire=car=>{if(user?.role!=='buyer'){go('/login?return='+encodeURIComponent(`/vehicle/${car.id}`));return;}setModal({type:'enquiry',car});};
  const inspection=car=>{if(user?.role!=='buyer'){go('/login?return='+encodeURIComponent(`/vehicle/${car.id}`));return;}setModal({type:'inspection',car});};
  const share=async car=>{const url=new URL(`/vehicle/${encodeURIComponent(car.id)}`,location.origin).toString();try{if(navigator.share)await navigator.share({title:`${carTitle(car)} · Auto Connect`,url});else{await navigator.clipboard.writeText(url);notify('Listing link copied.');}}catch(e){if(e.name!=='AbortError')notify('Unable to share this listing from this browser.');}};
  const openPath=(to)=>go(to);

  const buy=car=>{
    if(!user||user.role!=='buyer'){
      notify('Please sign in with a buyer account to purchase this vehicle.');
      go('/login?return='+encodeURIComponent(`/vehicle/${car.id}?buy=1`));
      return;
    }
    setCheckoutCar(car);
  };

  let page;
  if(path==='/'||path==='/index.html')page=<Home cars={cars} busy={busy} user={user} favorites={favorites} compared={compared} onSearch={submitSearch} onFavorite={toggleFavorite} onCompare={toggleCompare} onBuy={buy} onNotice={()=>notify('All six listings and their prices are illustrative sample data.')} onShipping={async body=>{const r=await request('/api/shipping-estimates',{method:'POST',csrf,body});return r;}} onNavigate={openPath} />;
  else if(path==='/browse')page=<Browse cars={cars} total={resultCount} pages={resultPages} searchString={searchString} error={listingError} busy={busy} favorites={favorites} compared={compared} onSearch={submitSearch} onRetry={()=>loadCars(searchString.replace(/^\?/,''))} onPageChange={changePage} onFavorite={toggleFavorite} onCompare={toggleCompare} onBuy={buy} onSaveSearch={saveSearch} />;
  else if(path.startsWith('/vehicle/'))page=<Vehicle car={activeCar} busy={vehicleBusy} user={user} favorite={favorites.has(activeCar?.id)} onFavorite={toggleFavorite} onBuy={buy} onEnquire={enquire} onOffer={car=>setModal({type:'offer',car})} onInspection={inspection} onShare={share} onReport={car=>{if(user?.role==='buyer')setModal({type:'report',car});else go('/login?return='+encodeURIComponent(`/vehicle/${car.id}`));}} />;
  else if(path==='/favorites')page=<Favorites cars={cars} favorites={favorites} compared={compared} onFavorite={toggleFavorite} onCompare={toggleCompare} onBuy={buy} />;
  else if(path==='/compare')page=<Compare ids={compared} onBuy={buy} onClear={()=>{setCompared(new Set());saveSet('apex:compare',new Set());}} />;
  else if(path==='/login'||path==='/register')page=<Auth path={path} search={searchString} onSubmit={login} />;
  else if(path==='/account')page=!user?<Auth path="/login" search="?return=%2Faccount" onSubmit={login}/>:<Account user={user} csrf={csrf} onCsrf={setCsrf} onNotify={notify} onFavorite={toggleFavorite} favorites={favorites} compared={compared} onCompare={toggleCompare} onBuy={buy} />;
  else if(path==='/dealer/dashboard')page=<SellerWorkspace user={user} csrf={csrf} onCsrf={setCsrf} onNotify={notify} request={request} />;
  else if(path.startsWith('/seller/'))page=<SellerPublicProfile sellerId={decodeURIComponent(path.split('/')[2]||'')} request={request} user={user} csrf={csrf} onLogin={login}/>;
  else if(path==='/admin')page=<Admin user={user} csrf={csrf} onNotify={notify} onRefresh={()=>setPath('/admin')} onLogin={login} />;
  else if(path==='/privacy'||path==='/terms')page=<Legal kind={path.slice(1)} />;
  else if(path==='/credits'||path==='/credits.html')page=<Credits />;
  else page=<NotFound />;

  if(path==='/dealer/dashboard'&&user?.role==='dealer')return <SellerWorkspace user={user} csrf={csrf} onNotify={notify} request={request} onLogout={logout}/>;
  if(path==='/account'&&user?.role==='buyer')return <Suspense fallback={<FullPageCarLoader label="Loading your buyer console…"/>}><BuyerConsole user={user} csrf={csrf} onCsrf={setCsrf} request={request} onLogout={logout} Conversation={EnquiryThread} Password={PasswordSettings} Inbox={NotificationInbox}/></Suspense>;
  if(path==='/admin'&&user?.role==='admin')return <Suspense fallback={<FullPageCarLoader label="Loading administrator console…"/>}><AdminWorkspace user={user} csrf={csrf} request={request} onNotify={notify} onLogout={logout}/></Suspense>;
  const selectedCars=cars.filter(c=>compared.has(c.id));
  return <>
    {(busy||vehicleBusy)&&<div className="ac-top-progress" role="progressbar" aria-label="Loading marketplace data"/>}
    <a className="fixed -top-20 left-3 z-[100] rounded bg-white px-4 py-3 text-black focus:top-3" href="#main">Skip to content</a>
    <Header user={user} path={path} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} onLogout={logout} />
    <main id="main" className={path==='/'||path==='/index.html'?'market-home':'market-public'} tabIndex={-1}>{page}</main>
    <Footer />
    {compared.size>0&&<div className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-xl items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white/95 p-3 text-slate-900 shadow-2xl backdrop-blur-xl dark:border-white/15 dark:bg-[#191919]/95 dark:text-white sm:inset-x-6 sm:p-4"><span className="text-sm"><b className="mr-2 text-blue-600 dark:text-market-blue">{compared.size}</b>cars selected</span><button onClick={()=>{setCompared(new Set());saveSet('apex:compare',new Set());}} className="min-h-11 px-3 text-xs text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white">Clear</button><button onClick={()=>go('/compare')} className="btn-primary min-h-11 px-4">Compare<ArrowRight size={16}/></button></div>}
    {checkoutCar&&user?.role==='buyer'&&<VehiclePaystackCheckout car={checkoutCar} user={user} csrf={csrf} onClose={()=>setCheckoutCar(null)} onNotify={notify} onNavigate={openPath} />}
    {modal&&<Dialog modal={modal} onClose={()=>setModal(null)} csrf={csrf} onNotify={notify} />}
    {toast&&<div role="status" aria-live="polite" className="ac-toast fixed bottom-5 left-1/2 z-[100] -translate-x-1/2 rounded-lg border border-slate-200 bg-slate-900 px-5 py-3 text-sm text-white shadow-xl dark:border-white/15 dark:bg-[#242424]">{toast}</div>}
  </>;
}

function Header({user,mobileOpen,setMobileOpen,path,onLogout}) {
  return <header className="nav market-header sticky top-0 z-50 border-b border-slate-200 bg-white/95 text-slate-900 backdrop-blur-xl dark:border-white/10 dark:bg-[#111]/95 dark:text-white">
    <div className="mx-auto flex h-[68px] max-w-[1312px] items-center justify-between px-4 sm:px-8">
      <a href="/" aria-label="Auto Connect home" className="flex items-center gap-2.5 font-mono text-[13px] font-semibold tracking-[.12em]"><span className="grid size-8 place-items-center rounded-full border border-slate-300 text-blue-600 dark:border-white/20 dark:text-market-blue">AC</span><span>AUTO<span className="ml-1 text-slate-500 dark:text-zinc-400">CONNECT</span></span></a>
      <nav aria-label="Main navigation" className="hidden items-center gap-8 text-sm text-slate-600 dark:text-zinc-400 lg:flex"><a className="hover:text-slate-900 dark:hover:text-white" href="/browse">Cars</a><a className="hover:text-slate-900 dark:hover:text-white" href="/#import">Import</a><a className="hover:text-slate-900 dark:hover:text-white" href="/#dealers">For dealers</a><a className="hover:text-slate-900 dark:hover:text-white" href="/#about">About</a></nav>
      <div className="hidden items-center gap-4 sm:flex">{!user&&['/login','/register','/admin'].includes(path)?<><a className="text-sm text-slate-600 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white" href="/browse">Browse cars</a><a className="btn-secondary min-h-10 px-3 text-xs" href="/register?role=dealer">Sell a car</a></>:<><a className="text-sm text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white" href={user?.role==='admin'?'/admin':user?.role==='dealer'?'/dealer/dashboard':user?'/account':'/login'}>{user?user.email:'Sign in'}</a>{user&&<button onClick={onLogout} className="min-h-10 px-1 text-xs text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white">Sign out</button>}<a className="btn-primary min-h-10 px-4 text-xs" href="/browse">Find a car<ArrowUpRight size={14}/></a></>}</div>
      <button aria-label={mobileOpen?'Close navigation':'Open navigation'} aria-expanded={mobileOpen} aria-controls="mobile-navigation" className="grid size-11 place-items-center rounded-md border border-slate-300 dark:border-white/15 lg:hidden" onClick={()=>setMobileOpen(!mobileOpen)}>{mobileOpen?<X size={19}/>:<Menu size={19}/>}</button>
    </div>
    {mobileOpen&&<nav id="mobile-navigation" aria-label="Mobile navigation" className="grid gap-1 border-t border-slate-200 bg-white px-5 py-3 text-sm dark:border-white/10 dark:bg-[#151515] lg:hidden">{[['Cars','/browse'],['Import','/#import'],['Sell a car','/register?role=dealer'],['About','/#about'],[user?.role==='dealer'?'Seller workspace':user?'Account':'Sign in',user?.role==='dealer'?'/dealer/dashboard':user?'/account':'/login']].map(([x,y])=><a key={y} className="flex min-h-11 items-center justify-between border-b border-slate-100 text-slate-700 dark:border-white/5 dark:text-zinc-300" href={y}>{x}<ArrowUpRight size={14}/></a>)}{user&&<button onClick={onLogout} className="min-h-11 border-b border-slate-100 text-left text-slate-700 dark:border-white/5 dark:text-zinc-300">Sign out</button>}</nav>}
  </header>;
}

function Home(props) { return <MarketplaceHome {...props} renderCar={(c,index=0)=><CarCard key={c.id} car={c} index={index} favorite={props.favorites.has(c.id)} compared={props.compared.has(c.id)} onFavorite={props.onFavorite} onCompare={props.onCompare} onBuy={props.onBuy}/>} importSection={<ImportSection onEstimate={props.onShipping}/>}/>; }

function SectionHead({eyebrow,title,copy,action}) { return <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><h2 className="mt-4 font-display text-3xl font-medium tracking-[-.03em] sm:text-4xl">{title}</h2>{copy&&<p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">{copy}</p>}</div>{action}</div>; }
function PreviewLine({title,status}) {return <div className="mt-4 flex min-h-12 items-center justify-between gap-2 border-t border-white/10 pt-3"><span className="text-xs text-zinc-300">{title}</span><span className="text-[10px] text-zinc-400">{status}</span></div>;}

function CarCard({car,index=0,favorite,compared,onFavorite,onCompare,onBuy}) {
  const [cardPhotoIndex,setCardPhotoIndex]=useState(0);
  const photos=useMemo(()=>vehicleImages(car),[car]);
  const safeIdx=cardPhotoIndex%Math.max(1,photos.length);
  const acceptsOffers=Boolean(car.allowOffers||car.allow_offers||car.listingData?.allowOffers);
  return <article style={{'--card-index':Math.min(index,8)}} className="vehicle-card group overflow-hidden rounded-xl border border-white/10 bg-[#171717]">
    <div className="relative overflow-hidden">
      <a href={`/vehicle/${encodeURIComponent(car.id)}`} aria-label={`View ${carTitle(car)}`}>
        <img key={photos[safeIdx]?.url||safeIdx} src={listingPhoto(car,safeIdx)} onError={e=>{e.currentTarget.src=fallback;}} alt={photos[safeIdx]?.alt||`Illustrative photo for ${carTitle(car)}`} loading="lazy" className="vehicle-photo vehicle-card__image ac-photo-fade w-full object-cover"/>
      </a>
      {photos.length>1&&(
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 backdrop-blur">
          {photos.map((p,idx)=>(
            <button
              key={p.url+idx}
              type="button"
              aria-label={`Photo ${idx+1} of ${carTitle(car)}`}
              onClick={e=>{e.preventDefault();e.stopPropagation();setCardPhotoIndex(idx);}}
              className={`h-1.5 rounded-full transition-all ${safeIdx===idx?'w-3.5 bg-market-blue':'w-1.5 bg-white/45 hover:bg-white/80'}`}
            />
          ))}
        </div>
      )}
      <button aria-label={favorite?'Remove from saved cars':`Save ${carTitle(car)}`} aria-pressed={favorite} onClick={()=>onFavorite(car)} className="absolute right-3 top-3 grid size-11 place-items-center rounded-full border border-white/20 bg-black/75 text-white backdrop-blur transition hover:border-market-blue hover:text-market-blue">{favorite?<Heart size={17} fill="currentColor" className="ac-heart-pop text-market-blue"/>:<Heart size={17}/>}</button>
    </div>
    <div className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><a href={`/vehicle/${encodeURIComponent(car.id)}`} className="font-display text-lg font-medium tracking-[-.03em] hover:text-market-blue">{car.year} {car.make} {car.model}</a><p className="mt-1 text-xs text-zinc-400">{car.trim||car.condition} · {car.drivetrain||'Details vary'}</p></div><strong className="whitespace-nowrap font-mono text-sm">{money(car.price,car.currency)}</strong></div><div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-zinc-400"><span className="flex items-center gap-1.5"><Gauge size={13}/>{number(car.mileage)} mi</span><span className="size-1 rounded-full bg-zinc-700"/><span className="flex items-center gap-1.5"><Fuel size={13}/>{car.fuel}</span><span className="size-1 rounded-full bg-zinc-700"/><span>{car.transmission}</span></div><div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3"><span className="text-xs text-zinc-400">{[car.city,car.country].filter(Boolean).join(', ')}</span><label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-zinc-400"><input aria-label={`Compare ${carTitle(car)}`} className="accent-[#60a5fa]" type="checkbox" checked={compared} onChange={()=>onCompare(car.id)}/>Compare</label></div><div className="mt-3 grid grid-cols-2 gap-2">{onBuy&&<button type="button" onClick={()=>onBuy(car)} className="btn-primary min-h-11 justify-between px-3.5 text-xs">Buy now<ArrowRight size={14}/></button>}<a href={`/vehicle/${encodeURIComponent(car.id)}`} className={`${onBuy?'btn-secondary':'btn-primary col-span-2'} min-h-11 justify-between px-3.5 text-xs`}>{acceptsOffers?'View & offer':'View vehicle'}<ArrowRight size={14} className="vehicle-card__cta-arrow"/></a></div></div>
  </article>;
}

function matchesMakeOrModel(car, rawKeyword) {
  const query = String(rawKeyword || '').trim().toLowerCase();
  if (!query) return true;
  const searchable = `${car.make || ''} ${car.model || ''} ${car.trim || ''} ${car.year || ''} ${car.city || ''} ${car.location || ''}`.toLowerCase();
  return query.split(/\s+/).every(token => searchable.includes(token));
}

function SearchFilters({onSearch,initial='',keyword='',onKeywordChange}) {
  const values=useMemo(()=>new URLSearchParams(initial),[initial]);
  const advancedKeys=['model','minYear','maxYear','minMileage','maxMileage','fuel','transmission','bodyType','condition','drivetrain','importStatus','color','engine','engineCc','seller','location'];
  const [more,setMore]=useState(advancedKeys.some(key=>values.has(key)));
  const active=[...values.entries()].filter(([key,value])=>value&&key!=='sort'&&key!=='page');
  const labelFor=key=>({q:'Search',make:'Make',model:'Model',minPrice:'Min price',maxPrice:'Max price',minYear:'From year',maxYear:'To year',minMileage:'Min mileage',maxMileage:'Max mileage',fuel:'Fuel',transmission:'Transmission',bodyType:'Body type',condition:'Condition',drivetrain:'Drivetrain',importStatus:'Import status',color:'Colour',engine:'Engine',engineCc:'Min cc',seller:'Seller',location:'Location'}[key]||key);
  return <form onSubmit={onSearch} className="mt-8 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-white/10 dark:bg-white/[.025] sm:grid-cols-2 sm:p-4 lg:grid-cols-6">
    <label className="relative flex flex-col justify-end sm:col-span-2 lg:col-span-2"><span className="filter-label">Filter by make or model</span><Search size={16} aria-hidden="true" className="pointer-events-none absolute bottom-4 left-3.5 z-10 text-slate-400 dark:text-zinc-400"/><input className="field h-12 !pl-10 !pr-9" name="q" value={keyword} onChange={e=>onKeywordChange?.(e.target.value)} aria-label="Filter by make or model" placeholder="Filter by make or model (e.g. Toyota, Porsche, RX 350)"/>{keyword&&<button type="button" aria-label="Clear keyword filter" onClick={()=>onKeywordChange?.('')} className="absolute bottom-2.5 right-2.5 z-10 grid size-7 place-items-center rounded text-slate-400 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"><X size={15}/></button>}</label>
    <label><span className="filter-label">Make</span><select className="field" name="make" defaultValue={values.get('make')||''}><option value="">Any make</option>{['Audi','BMW','Land Rover','Lexus','Mercedes-Benz','Porsche','Toyota'].map(x=><option key={x}>{x}</option>)}</select></label>
    <label><span className="filter-label">Minimum price in Ghana cedis</span><input className="field" name="minPrice" type="number" min="0" step="50000" defaultValue={values.get('minPrice')||''} placeholder="Min price · GHS"/></label>
    <label><span className="filter-label">Maximum price in Ghana cedis</span><input className="field" name="maxPrice" type="number" min="0" step="50000" defaultValue={values.get('maxPrice')||''} placeholder="Max price · GHS"/></label>
    <label><span className="filter-label">Sort results</span><select className="field" name="sort" defaultValue={values.get('sort')||'newest'}><option value="newest">Newest first</option><option value="priceAsc">Price: low to high</option><option value="priceDesc">Price: high to low</option><option value="mileage">Lowest mileage</option><option value="year">Newest model year</option></select></label>
    {more&&<div className="grid gap-3 sm:col-span-2 sm:grid-cols-2 lg:col-span-6 lg:grid-cols-4">
      <label><span className="filter-label">Model</span><input className="field" name="model" defaultValue={values.get('model')||''} placeholder="Model"/></label>
      <label><span className="filter-label">City or region in Ghana</span><input className="field" name="location" defaultValue={values.get('location')||''} placeholder="City or region in Ghana"/></label>
      <label><span className="filter-label">Year from</span><input className="field" name="minYear" type="number" min="1900" max="2100" defaultValue={values.get('minYear')||values.get('year')||''} placeholder="Year from"/></label>
      <label><span className="filter-label">Year to</span><input className="field" name="maxYear" type="number" min="1900" max="2100" defaultValue={values.get('maxYear')||''} placeholder="Year to"/></label>
      <label><span className="filter-label">Mileage from</span><input className="field" name="minMileage" type="number" min="0" defaultValue={values.get('minMileage')||''} placeholder="Mileage from"/></label>
      <label><span className="filter-label">Mileage to</span><input className="field" name="maxMileage" type="number" min="0" defaultValue={values.get('maxMileage')||values.get('maxMileage')||''} placeholder="Mileage to"/></label>
      <label><span className="filter-label">Fuel type</span><select className="field" name="fuel" defaultValue={values.get('fuel')||''}><option value="">Any fuel</option>{['Petrol','Diesel','Electric','Hybrid'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span className="filter-label">Transmission</span><select className="field" name="transmission" defaultValue={values.get('transmission')||''}><option value="">Any transmission</option><option>Automatic</option><option>Manual</option></select></label>
      <label><span className="filter-label">Body type</span><select className="field" name="bodyType" defaultValue={values.get('bodyType')||''}><option value="">Any body type</option>{['SUV','Coupe','Sedan','Wagon','Hatchback','Pickup','Van','Electric'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span className="filter-label">Condition</span><select className="field" name="condition" defaultValue={values.get('condition')||''}><option value="">Any condition</option><option>New</option><option>Used</option><option>Certified</option></select></label>
      <label><span className="filter-label">Drivetrain</span><select className="field" name="drivetrain" defaultValue={values.get('drivetrain')||''}><option value="">Any drivetrain</option>{['FWD','RWD','AWD','4WD'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span className="filter-label">Import status</span><select className="field" name="importStatus" defaultValue={values.get('importStatus')||''}><option value="">Any import status</option><option>Locally used</option><option>Foreign used</option><option>Brand new</option></select></label>
      <label><span className="filter-label">Exterior colour</span><input className="field" name="color" defaultValue={values.get('color')||''} placeholder="Exterior colour"/></label>
      <label><span className="filter-label">Engine description</span><input className="field" name="engine" defaultValue={values.get('engine')||''} placeholder="Engine, e.g. V8"/></label>
      <label><span className="filter-label">Minimum engine capacity in cc</span><input className="field" name="engineCc" type="number" min="100" max="20000" defaultValue={values.get('engineCc')||''} placeholder="Minimum engine cc"/></label>
      <label><span className="filter-label">Seller type</span><select className="field" name="seller" defaultValue={values.get('seller')||''}><option value="">Any seller</option><option value="dealer">Dealer</option></select></label>
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2 lg:col-span-6"><div className="flex flex-wrap gap-2"><button type="button" aria-expanded={more} onClick={()=>setMore(!more)} className="inline-flex min-h-11 items-center gap-2 px-2 text-xs text-slate-600 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white"><SlidersHorizontal size={14} aria-hidden="true"/>{more?'Fewer filters':'More filters'}<ChevronDown size={13} aria-hidden="true" className={more?'rotate-180':''}/></button><button className="btn-primary min-h-11">Apply filters<ArrowRight size={15}/></button><a href="/browse" onClick={()=>onKeywordChange?.('')} className="inline-flex min-h-11 items-center px-2 text-xs text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white">Clear all</a></div><span className="font-mono text-[10px] uppercase tracking-[.08em] text-slate-500 dark:text-zinc-400">Prices are illustrative</span></div>
    {active.length>0&&<div aria-label="Active filters" className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-6">{active.map(([key,value])=><span key={key} className="rounded-full border border-slate-300 px-3 py-1.5 text-[11px] text-slate-700 dark:border-white/10 dark:text-zinc-300">{labelFor(key)} · {value}</span>)}</div>}
  </form>;
}

function Browse({cars,total,pages,searchString,error,busy,favorites,compared,onSearch,onRetry,onPageChange,onFavorite,onCompare,onBuy,onSaveSearch}) {
  const page=Number(new URLSearchParams(searchString).get('page'))||1;
  const [keyword,setKeyword]=useState(()=>new URLSearchParams(searchString).get('q')||'');
  useEffect(()=>{setKeyword(new URLSearchParams(searchString).get('q')||'');},[searchString]);
  const filteredCars=useMemo(()=>cars.filter(c=>matchesMakeOrModel(c,keyword)),[cars,keyword]);
  const displayedTotal=keyword.trim()?filteredCars.length:total;
  return <section className="min-h-[70vh] border-b border-slate-200 py-16 dark:border-white/10 sm:py-20"><div className="mx-auto max-w-[1312px] px-5 sm:px-8"><SectionHead eyebrow="Vehicle marketplace" title="Browse the collection" copy="Search by the details that matter. Confirm availability and vehicle records directly with the seller."/><SearchFilters key={searchString} onSearch={onSearch} initial={searchString.replace(/^\?/,'')} keyword={keyword} onKeywordChange={setKeyword}/><div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-white/10"><p role="status" aria-live="polite" className="text-sm text-slate-600 dark:text-zinc-300">{busy?'Updating listings…':`${displayedTotal} listing${displayedTotal===1?'':'s'}${keyword.trim()?` matching "${keyword.trim()}"`:''}`}</p><button onClick={onSaveSearch} className="inline-flex min-h-11 items-center gap-2 px-2 text-sm text-slate-600 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white"><BookmarkPlus size={15} aria-hidden="true"/>Save search</button></div>{error&&!busy&&<div role="alert" className="surface mt-7 flex flex-wrap items-center justify-between gap-4 p-5"><p className="text-sm text-rose-600 dark:text-rose-200">Listings could not be loaded: {error}</p><button onClick={onRetry} className="btn-secondary min-h-10">Try again</button></div>}<div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3" aria-busy={busy}>{busy?<><div className="col-span-full flex justify-center py-4"><CarLoader label="Searching verified Ghana vehicle listings…"/></div><VehicleCardSkeleton count={6}/></>:filteredCars.map((c,idx)=><CarCard key={c.id} car={c} index={idx} favorite={favorites.has(c.id)} compared={compared.has(c.id)} onFavorite={onFavorite} onCompare={onCompare} onBuy={onBuy}/>)}</div>{!busy&&!error&&!filteredCars.length&&<div className="surface mt-7 p-8 text-center"><h2 className="font-display text-xl">No listings match these filters</h2><p className="mt-2 text-sm text-slate-500 dark:text-zinc-400">Adjust your make or model keyword or clear the filters to see all vehicles.</p>{keyword.trim()?<button type="button" onClick={()=>setKeyword('')} className="btn-secondary mt-5">Clear keyword filter</button>:<a href="/browse" className="btn-secondary mt-5">Clear filters</a>}</div>}{pages>1&&!keyword.trim()&&<nav aria-label="Listing pages" className="mt-8 flex items-center justify-center gap-4"><button disabled={busy||page<=1} onClick={()=>onPageChange(page-1)} className="btn-secondary min-h-11 disabled:opacity-40">Previous</button><span className="text-sm text-slate-500 dark:text-zinc-400">Page {page} of {pages}</span><button disabled={busy||page>=pages} onClick={()=>onPageChange(page+1)} className="btn-secondary min-h-11 disabled:opacity-40">Next</button></nav>}</div></section>;
}

function Vehicle({car,busy,user,favorite,onFavorite,onBuy,onEnquire,onOffer,onInspection,onReport,onShare}) {
  const [photoIndex,setPhotoIndex]=useState(0);useEffect(()=>setPhotoIndex(0),[car?.id]);
  if(busy)return <div className="mx-auto max-w-4xl px-5 py-24 text-center"><CarLoader label="Loading vehicle inspection record & gallery…"/></div>;
  if(!car)return <div className="mx-auto max-w-4xl px-5 py-24 text-center"><CircleAlert className="mx-auto text-blue-600 dark:text-market-blue"/><h1 className="mt-5 font-display text-3xl">Vehicle record not found</h1><a href="/browse" className="btn-secondary mt-6">Back to listings</a></div>;
  const photos=vehicleImages(car);
  const safeIndex=photoIndex%Math.max(1,photos.length);
  const activePhoto=photos[safeIndex]||{url:fallback,alt:`${carTitle(car)} vehicle photo`};
  const stepPhoto=delta=>{if(photos.length<=1)return;setPhotoIndex(i=>(i+delta+photos.length)%photos.length);};
  const specs=[['Mileage',`${number(car.mileage)} ${car.listingData?.mileageUnit||'km'}`],['Fuel',car.fuel||'Not supplied'],['Transmission',car.transmission||'Not supplied'],['Engine',car.engine||'Not supplied'],['Engine capacity',car.engine_cc?`${number(car.engine_cc)} cc`:'Not supplied'],['Body type',car.body_type||'Not supplied'],['Drivetrain',car.drivetrain||'Not supplied'],['Exterior colour',car.exterior||'Not supplied'],['Condition',car.listingData?.condition||car.condition||'Not supplied'],['Import status',car.import_status||'Not supplied'],['Accident history',car.listingData?.accident||car.accident_history||'Not supplied'],['Ownership history',car.listingData?.ownership||car.ownership_history||'Not supplied'],['Registration',[car.registration_status,car.city,car.country].filter(Boolean).join(' · ')||'Not supplied']];
  const context=car.price_context;
  const acceptsOffers=Boolean(car.allowOffers||car.allow_offers||car.listingData?.allowOffers);
  return <section className="mx-auto max-w-[1312px] px-5 py-12 sm:px-8 sm:py-16"><a href="/browse" className="mb-8 inline-flex min-h-11 items-center gap-2 text-xs text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"><ArrowLeft size={15}/>Vehicle listings</a><div className="grid gap-9 lg:grid-cols-[1.15fr_.85fr] lg:gap-12"><div>
    <div
      className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-[#141414]"
      tabIndex={0}
      aria-label={`${carTitle(car)} photo gallery (${photos.length} photos)`}
      onKeyDown={e=>{if(e.key==='ArrowLeft'){e.preventDefault();stepPhoto(-1);}else if(e.key==='ArrowRight'){e.preventDefault();stepPhoto(1);}}}
    >
      <img
        key={activePhoto.url||safeIndex}
        src={optimizeImageUrl(activePhoto.url,1400)}
        onError={e=>{e.currentTarget.src=fallback;}}
        alt={activePhoto.alt||`${carTitle(car)} vehicle photo ${safeIndex+1}`}
        className="ac-photo-fade aspect-[1.52] w-full object-cover"
      />
    </div>
    <div className="mt-3 grid grid-cols-4 gap-2.5 sm:grid-cols-6" role="group" aria-label="Vehicle photo thumbnails">
      {photos.map((i,index)=>(
        <button
          key={(i.url||index)+index}
          type="button"
          onClick={()=>setPhotoIndex(index)}
          aria-label={`Show photo ${index+1} of ${carTitle(car)}`}
          aria-pressed={safeIndex===index}
          className={`relative h-20 overflow-hidden rounded-md border-2 transition-all ${safeIndex===index?'border-blue-600 ring-2 ring-blue-600/30 dark:border-market-blue dark:ring-market-blue/30':'border-slate-200 opacity-75 hover:border-slate-400 hover:opacity-100 dark:border-white/10 dark:hover:border-white/30'}`}
        >
          <img src={optimizeImageUrl(i.url,400)} onError={e=>{e.currentTarget.src=fallback;}} alt={i.alt||`Thumbnail ${index+1}`} className="h-full w-full object-cover"/>
        </button>
      ))}
      {photos.length===0&&<p className="col-span-full py-3 text-xs text-slate-500 dark:text-zinc-500">Photos have not been supplied.</p>}
    </div>
    <div className="surface mt-7 p-5"><p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700 dark:text-zinc-300">{car.description||'No description supplied.'}</p>{car.listingData?.conditionDescription&&<><h2 className="mt-5 font-display text-lg">Seller condition notes</h2><p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700 dark:text-zinc-300">{car.listingData.conditionDescription}</p></>}</div></div><div><h1 className="mt-4 font-display text-4xl font-medium tracking-[-.03em] sm:text-5xl">{car.listingData?.title||carTitle(car)}</h1><p className="mt-2 text-slate-500 dark:text-zinc-400">{[car.trim,car.body_type,car.drivetrain].filter(Boolean).join(' · ')}</p><div className="mt-6 flex flex-wrap items-center gap-3"><p className="font-mono text-2xl">{money(car.price,car.currency)}</p>{acceptsOffers&&<span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs text-sky-800 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200">Accepts buyer offers</span>}</div><p className="mt-2 text-xs text-slate-500 dark:text-zinc-400">Listed {car.created_at?new Date(car.created_at).toLocaleDateString('en-GH',{day:'numeric',month:'short',year:'numeric'}):'date unavailable'}</p>{acceptsOffers&&<div className="mt-4 rounded-lg border border-sky-500/20 bg-sky-500/[.06] p-3.5 text-xs leading-5 text-slate-700 dark:border-sky-400/20 dark:bg-sky-400/[.04] dark:text-zinc-300">This listing accepts buyer offers through Auto Connect. The seller’s target price range is private and never shown to buyers.</div>}{context&&<div className="surface mt-5 p-4"><p className="text-sm font-medium">{context.label}</p><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-zinc-400">{context.comparableCount>=5?`${money(context.lowPrice,context.currency)} – ${money(context.highPrice,context.currency)} · midpoint ${money(context.medianPrice,context.currency)} from ${context.comparableCount} similar listings.`:context.method}</p></div>}<div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 dark:border-white/10 dark:bg-white/10">{specs.map(([k,v])=><div key={k} className="bg-white p-3 dark:bg-[#151515]"><span className="block text-[10px] uppercase tracking-[.08em] text-slate-500 dark:text-zinc-400">{k}</span><b className="mt-1 block text-sm font-medium">{v}</b></div>)}</div>{car.listingData?.features?.length>0&&<div className="surface mt-5 p-4"><h2 className="font-display text-lg">Included features</h2><ul className="mt-3 flex flex-wrap gap-2">{[...car.listingData.features,...String(car.listingData.customFeatures||'').split(',').map(x=>x.trim()).filter(Boolean)].map(feature=><li key={feature} className="rounded border border-slate-200 px-3 py-2 text-xs text-slate-700 dark:border-white/10 dark:text-zinc-300">{feature}</li>)}</ul></div>}<p className="mt-5 border-l-2 border-blue-600 bg-slate-100 p-3 text-xs leading-5 text-slate-600 dark:border-market-blue dark:bg-white/[.035] dark:text-zinc-400">{car.is_demo?'Sample record for interface testing, not an offer for sale. No seller, condition, availability, history or inspection has been verified.':'Auto Connect acts as the middleman for all listings. Direct buyer-to-seller contact is disabled — enquiries go to Auto Connect Admins first for review, editing, and forwarding, and buyers can report any seller or listing concern for Admin case review.'}</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><button onClick={()=>onBuy(car)} className="btn-primary sm:col-span-2 justify-between px-5"><span>{user?.role==='buyer'?`Buy now · ${money(car.price,car.currency)}`:`Sign in to buy · ${money(car.price,car.currency)}`}</span><span className="inline-flex items-center gap-1.5 text-xs font-normal opacity-90">{user?.role==='buyer'?'Paystack Checkout':'Buyer sign-in'}<ArrowRight size={15}/></span></button>{acceptsOffers&&<button onClick={()=>onOffer(car)} className="btn-secondary sm:col-span-2">Make an offer<ArrowRight size={15}/></button>}<button onClick={()=>onEnquire(car)} className="btn-secondary">Ask about this car<MessageCircle size={15}/></button><button onClick={()=>onFavorite(car)} className="btn-secondary">{favorite?'Saved':'Save this car'}<Heart size={15} className={favorite?'ac-heart-pop text-blue-600 dark:text-market-blue':''}/></button><button onClick={()=>onInspection(car)} className="btn-secondary">Request inspection<ClipboardCheck size={15}/></button><button onClick={()=>onShare(car)} className="btn-secondary">Share listing<ArrowUpRight size={15}/></button></div><button onClick={()=>onReport(car)} className="mt-4 inline-flex min-h-11 items-center gap-2 text-xs text-slate-600 underline underline-offset-4 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white">Report seller or listing (Admin case review)</button></div></div></section>;
}

function Favorites({cars,favorites,compared,onFavorite,onCompare,onBuy}) {const items=cars.filter(c=>favorites.has(c.id));return <section className="mx-auto min-h-[70vh] max-w-[1312px] px-5 py-16 sm:px-8"><SectionHead eyebrow="Your shortlist" title="Saved vehicles" copy="A personal shortlist kept on this device or in your buyer account."/><div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{items.map(c=><CarCard key={c.id} car={c} favorite={true} compared={compared.has(c.id)} onFavorite={onFavorite} onCompare={onCompare} onBuy={onBuy}/>)}</div>{!items.length&&<div className="surface mt-8 p-8 text-center"><p className="text-sm text-zinc-400">You haven’t saved any cars yet.</p><a href="/browse" className="btn-primary mt-5">Browse the collection<ArrowRight size={15}/></a></div>}</section>;}

function Compare({ids,onBuy,onClear}) {
  const [items,setItems]=useState([]);const [loading,setLoading]=useState(ids.size>0);const [error,setError]=useState('');const [retry,setRetry]=useState(0);
  useEffect(()=>{let active=true;setError('');setItems([]);setLoading(ids.size>0);Promise.all([...ids].map(id=>request(`/api/listings/${encodeURIComponent(id)}`).then(x=>x.vehicle))).then(result=>{if(active)setItems(result);}).catch(()=>{if(active)setError('The selected vehicle details could not be loaded. Try again.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[ids,retry]);
  const fields=[['Price',c=>money(c.price,c.currency)],['Year',c=>c.year],['Mileage',c=>`${number(c.mileage)} mi`],['Body type',c=>c.body_type||'Not supplied'],['Fuel',c=>c.fuel],['Transmission',c=>c.transmission],['Engine',c=>c.engine||'Not supplied'],['Drivetrain',c=>c.drivetrain||'Not supplied'],['Condition',c=>c.condition],['Import status',c=>c.import_status||'Not supplied'],['Location',c=>[c.city,c.country].filter(Boolean).join(', ')]];
  return <section className="mx-auto min-h-[70vh] max-w-[1312px] px-5 py-16 sm:px-8">
    <SectionHead eyebrow="Side by side" title="Compare your shortlist" copy="Compare price and vehicle details in one view." action={items.length>0&&<button className="btn-secondary" onClick={onClear}>Clear comparison</button>}/>
    {loading?<div role="status" aria-live="polite" className="surface mt-8 flex justify-center p-8 text-center text-sm text-zinc-400"><CarLoader label="Loading selected vehicles for side-by-side comparison…"/></div>:error?<div role="alert" className="surface mt-8 flex flex-wrap items-center justify-between gap-4 p-6"><p className="text-sm text-rose-200">{error}</p><button className="btn-secondary" onClick={()=>setRetry(value=>value+1)}>Try again</button></div>:!items.length ? <div className="surface mt-8 p-8 text-center"><p className="text-sm text-zinc-400">Choose cars from the listing cards to compare them here.</p><a className="btn-primary mt-5" href="/browse">Browse cars</a></div> : <div className="mt-8 overflow-x-auto rounded-xl border border-white/10"><div className="grid min-w-[620px]" style={{gridTemplateColumns:`180px repeat(${items.length},minmax(160px,1fr))`}}>
      <div className="border-b border-white/10 bg-white/[.03] p-4 font-mono text-[9px] uppercase text-zinc-400">Vehicle details</div>
      {items.map(c=><div key={c.id} className="border-b border-l border-white/10 p-4"><img src={listingPhoto(c)} alt="" className="aspect-[1.6] w-full rounded object-cover"/><h3 className="mt-3 font-display font-medium">{carTitle(c)}</h3><div className="mt-2.5 flex flex-wrap gap-2">{onBuy&&<button type="button" onClick={()=>onBuy(c)} className="btn-primary min-h-9 px-3 text-xs">Buy now<ArrowRight size={13}/></button>}<a href={`/vehicle/${encodeURIComponent(c.id)}`} className="btn-secondary min-h-9 px-3 text-xs">View</a></div></div>)}
      {fields.flatMap(([label,get])=>{const values=items.map(c=>String(get(c)));const differs=new Set(values).size>1;return [
        <div key={`${label}-label`} className="border-b border-white/10 bg-white/[.025] p-4 text-xs text-zinc-400">{label}</div>,
        ...items.map((c,index)=><div key={`${label}-${c.id}`} className={`border-b border-l border-white/10 p-4 text-sm ${differs?'text-market-blue':''}`}>{values[index]}</div>)
      ];})}
    </div></div>}
  </section>;
}

function Auth({path,search,onSubmit}) {
  const register=path==='/register',params=new URLSearchParams(search),role=params.get('role')==='dealer'?'dealer':params.get('return')==='/admin'?'admin':'buyer';
  const [error,setError]=useState(''),[sellerType,setSellerType]=useState('dealer');
  const submit=async e=>{
    e.preventDefault();
    setError('');
    const form=e.currentTarget;
    if(register){
      const fd=new FormData(form);
      if(String(fd.get('password')||'')!==String(fd.get('confirmPassword')||'')){
        setError('Passwords do not match.');
        return;
      }
    }
    try{await onSubmit(form,role);}catch(x){setError(x.message);}
  };
  const quickSignIn=async(demoEmail,demoPassword,demoRole)=>{setError('');const form=document.createElement('form');form.dataset.mode='login';const eInput=document.createElement('input');eInput.name='email';eInput.value=demoEmail;const pInput=document.createElement('input');pInput.name='password';pInput.value=demoPassword;form.append(eInput,pInput);try{await onSubmit(form,demoRole);}catch(x){setError(x.message);}};
  return <section className="grid min-h-[75svh] place-items-center px-5 py-14"><div className="surface w-full max-w-xl p-6 sm:p-8"><p className="text-sm text-slate-600 dark:text-zinc-300">{role==='admin'?'Administrator':register?role==='dealer'?'Seller registration':'Buyer registration':'Buyer sign in'}</p><h1 className="mt-4 font-display text-3xl font-medium tracking-[-.03em]">{role==='admin'?'Administrator sign in':register?role==='dealer'?'Create your seller profile':'Create your account':'Sign in'}</h1><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-zinc-300">{role==='admin'?'Admin access is limited to accounts configured by the server operator.':register?'Tell buyers who is selling and where the vehicle is located.':'Manage saved cars, searches and seller conversations'}</p><div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-white/10 dark:bg-white/[.03]"><p className="font-mono text-[10px] uppercase tracking-[.08em] text-slate-500 dark:text-zinc-400">Demo Login Credentials (click to sign in)</p><div className="mt-2.5 grid gap-2 sm:grid-cols-3"><button type="button" onClick={()=>quickSignIn('buyer@autoconnect.gh','AutoConnect-Buyer-2026!','buyer')} className="btn-secondary min-h-10 justify-center px-3 text-xs">Buyer workspace</button><button type="button" onClick={()=>quickSignIn('dealer@autoconnect.gh','AutoConnect-Dealer-2026!','dealer')} className="btn-secondary min-h-10 justify-center px-3 text-xs">Seller workspace</button><button type="button" onClick={()=>quickSignIn('admin@autoconnect.gh','AutoConnect-Admin-2026!','admin')} className="btn-secondary min-h-10 justify-center px-3 text-xs">Admin workspace</button></div><div className="mt-3 grid gap-1.5 border-t border-slate-200 pt-2.5 text-xs text-slate-600 dark:border-white/10 dark:text-zinc-300"><div><b>Buyer:</b> <code className="font-mono">buyer@autoconnect.gh</code> / <code className="font-mono">AutoConnect-Buyer-2026!</code></div><div><b>Seller:</b> <code className="font-mono">dealer@autoconnect.gh</code> / <code className="font-mono">AutoConnect-Dealer-2026!</code></div><div><b>Admin:</b> <code className="font-mono">admin@autoconnect.gh</code> / <code className="font-mono">AutoConnect-Admin-2026!</code></div></div></div><form data-mode={register?'register':'login'} onSubmit={submit} className="mt-7 grid gap-4">{register&&role==='dealer'&&<><fieldset className="grid gap-2"><legend className="mb-2 text-sm text-slate-700 dark:text-zinc-300">I’m registering as</legend><div className="grid gap-3 sm:grid-cols-2"><label className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-md border px-4 text-sm ${sellerType==='private'?'border-blue-600 bg-blue-600/[.06] dark:border-market-blue dark:bg-market-blue/[.06]':'border-slate-200 dark:border-white/10'}`}><input type="radio" name="sellerType" value="private" checked={sellerType==='private'} onChange={()=>setSellerType('private')} className="accent-blue-600 dark:accent-[#60a5fa]"/>Private seller</label><label className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-md border px-4 text-sm ${sellerType==='dealer'?'border-blue-600 bg-blue-600/[.06] dark:border-market-blue dark:bg-market-blue/[.06]':'border-slate-200 dark:border-white/10'}`}><input type="radio" name="sellerType" value="dealer" checked={sellerType==='dealer'} onChange={()=>setSellerType('dealer')} className="accent-blue-600 dark:accent-[#60a5fa]"/>Registered dealership</label></div></fieldset>{sellerType==='private'?<label className="grid gap-2 text-sm text-slate-700 dark:text-zinc-300">Full name<input className="field" name="fullName" required minLength="2" autoComplete="name"/></label>:<label className="grid gap-2 text-sm text-slate-700 dark:text-zinc-300">Dealership name<input className="field" name="businessName" required minLength="2" autoComplete="organization"/></label>}</>}{register&&role==='buyer'&&<label className="grid gap-2 text-sm text-slate-700 dark:text-zinc-300">Your name<input className="field" name="name" required minLength="2" autoComplete="name"/></label>}<label className="grid gap-2 text-sm text-slate-700 dark:text-zinc-300">Email address<input className="field" name="email" type="email" required autoComplete="email"/></label>{register&&role==='buyer'&&<label className="grid gap-2 text-sm text-slate-700 dark:text-zinc-300">Contact number<input className="field" name="phone" type="tel" required autoComplete="tel" placeholder="+233 24 000 0000"/></label>}{register&&role==='dealer'&&<><label className="grid gap-2 text-sm text-slate-700 dark:text-zinc-300">Public contact email<input className="field" name="contactEmail" type="email" autoComplete="email"/></label><label className="grid gap-2 text-sm text-slate-700 dark:text-zinc-300">Contact number<input className="field" name="phone" type="tel" required autoComplete="tel" placeholder="+233 24 000 0000"/></label><label className="grid gap-2 text-sm text-slate-700 dark:text-zinc-300">WhatsApp number<input className="field" name="whatsapp" type="tel" autoComplete="tel"/></label><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm text-slate-700 dark:text-zinc-300">Region<input className="field" name="region"/></label><label className="grid gap-2 text-sm text-slate-700 dark:text-zinc-300">City or town<input className="field" name="city" defaultValue="Accra" required autoComplete="address-level2"/></label></div><label className="grid gap-2 text-sm text-slate-700 dark:text-zinc-300">Preferred contact<select className="field" name="preferredContact"><option value="website">Auto Connect messages</option><option value="phone">Phone call</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select></label><p className="-mt-2 text-xs text-slate-500 dark:text-zinc-400">Your contact details remain private until you choose to show them on your public profile.</p></>}<label className="grid gap-2 text-sm text-slate-700 dark:text-zinc-300">Password<input className="field" name="password" type="password" required minLength={register?'12':'1'} autoComplete={register?'new-password':'current-password'}/>{register&&<span className="text-xs text-slate-500 dark:text-zinc-500">Use at least 12 characters</span>}</label>{register&&<label className="grid gap-2 text-sm text-slate-700 dark:text-zinc-300">Confirm password<input className="field" name="confirmPassword" type="password" required minLength="12" autoComplete="new-password"/></label>}<p role="alert" className="min-h-5 text-sm text-rose-600 dark:text-rose-300">{error}</p><button className="btn-primary w-full">{register?role==='dealer'?'Create seller account':'Create account':'Sign in'}<ArrowRight size={16}/></button></form><p className="mt-5 text-sm text-slate-600 dark:text-zinc-300">{register?<>Already have an account? <a className="font-medium text-slate-900 underline underline-offset-4 dark:text-white" href="/login">Sign in</a></>:<>New to Auto Connect? <a className="font-medium text-slate-900 underline underline-offset-4 dark:text-white" href="/register">Create an account</a></>}</p><p className="mt-4 text-xs leading-5 text-slate-500 dark:text-zinc-400">Email verification and password recovery are not connected yet</p></div></section>;
}

function EnquiryThread({enquiry,csrf,user,onNotify}) {
  const [open,setOpen]=useState(false);const [items,setItems]=useState([]);const [draft,setDraft]=useState('');const [error,setError]=useState('');
  const load=async()=>{const result=await request(`/api/enquiries/${enquiry.id}/messages`);setItems(result.items);};
  const toggle=async()=>{if(open){setOpen(false);return;}setOpen(true);setError('');try{await load();}catch(e){setError(e.message);}};
  const submit=async e=>{e.preventDefault();const message=draft.trim();if(!message)return;setError('');try{await request(`/api/enquiries/${enquiry.id}/messages`,{method:'POST',csrf,body:{message}});setDraft('');await load();onNotify('Reply saved to this enquiry.');}catch(x){setError(x.message);}};
  const adminBadge=enquiry.admin_status==='forwarded'||enquiry.forwarded_to_seller?'Forwarded to seller by Admin':enquiry.admin_status==='rejected'?'Held by Admin':'Pending Admin review';
  return <div className="surface mt-3 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-medium">{enquiry.year} {enquiry.make} {enquiry.model}</p><p className="mt-1 text-xs text-zinc-400">Auto Connect Middleman Desk · {new Date(enquiry.created_at).toLocaleDateString()}</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 font-mono text-[9px] uppercase text-sky-200">{adminBadge}</span><span className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[9px] uppercase text-zinc-400">{enquiry.status}</span></div></div><p className="mt-3 text-sm leading-6 text-zinc-300">{enquiry.message}</p><button className="btn-secondary mt-4 min-h-10 text-xs" onClick={toggle}>{open?'Close updates':'View enquiry status & updates'}</button>{open&&<div className="mt-4 border-t border-white/10 pt-4"><div className="grid gap-3">{items.map((m,i)=><div key={m.id||`${enquiry.id}-${i}`} className={`max-w-[90%] rounded-lg border border-white/10 p-3 ${m.sender_role===user.role?'ml-auto bg-white/[.06]':'bg-black/20'}`}><p className="mb-1 font-mono text-[9px] uppercase tracking-wide text-zinc-400">{m.sender_role===user.role?'You':'Via Auto Connect Admin'} · {new Date(m.created_at).toLocaleString()}</p><p className="whitespace-pre-wrap text-sm leading-6 text-zinc-300">{m.message}</p></div>)}</div>{user.role==='dealer'?<form onSubmit={submit} className="mt-4 grid gap-3"><label className="grid gap-2 text-xs text-zinc-300">Write a reply (mediated by Auto Connect)<textarea className="field h-auto py-3" rows="3" minLength="2" maxLength="2000" value={draft} onChange={e=>setDraft(e.target.value)} required/></label>{error&&<p role="alert" className="text-xs text-rose-300">{error}</p>}<button className="btn-primary w-fit min-h-10 text-xs">Send reply<ArrowRight size={14}/></button></form>:<p className="mt-3 text-xs text-zinc-400">Direct buyer-to-seller chat is disabled. Auto Connect Admins review, edit if necessary, and forward your enquiry to the seller.</p>}</div>}</div>;
}

function NotificationInbox({csrf}) {
  const [data,setData]=useState({items:[],unreadCount:0});const [error,setError]=useState('');
  const refresh=()=>request('/api/notifications').then(setData).catch(e=>setError(e.message));
  useEffect(()=>{refresh();},[csrf]);
  const markRead=async path=>{try{await request(path,{method:'PATCH',csrf});await refresh();}catch(e){setError(e.message);}};
  return <section aria-label="Notifications" className="surface mt-8 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-lg">Notifications</h2><p className="mt-1 text-xs text-zinc-400">{data.unreadCount?`${data.unreadCount} unread`:'You’re up to date'}</p></div>{data.unreadCount>0&&<button className="btn-secondary min-h-10 px-3 text-xs" onClick={()=>markRead('/api/notifications/read-all')}>Mark all read</button>}</div>{error&&<p role="alert" className="mt-3 text-xs text-rose-300">{error}</p>}{data.items.length>0?<ul className="mt-4 divide-y divide-white/10">{data.items.map(item=><li key={item.id} className="flex items-start justify-between gap-4 py-3"><div className="flex items-start gap-3"><span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${item.read_at?'bg-zinc-700':'bg-market-blue'}`}/><div><p className="text-sm text-zinc-200">{item.body}</p><p className="mt-1 text-xs text-zinc-500">{new Date(item.created_at).toLocaleString()}</p></div></div>{!item.read_at&&<button className="min-h-9 shrink-0 px-2 text-xs text-zinc-400 hover:text-white" onClick={()=>markRead(`/api/notifications/${item.id}/read`)}>Mark read</button>}</li>)}</ul>:<p className="mt-4 text-sm text-zinc-400">Enquiry replies and listing updates will appear here.</p>}</section>;
}

function BuyerProfileSettings({csrf}) {
  const [profile,setProfile]=useState({display_name:'',phone:''});const [error,setError]=useState('');const [saved,setSaved]=useState(false);
  useEffect(()=>{request('/api/buyer/profile').then(d=>setProfile(d.profile)).catch(e=>setError(e.message));},[csrf]);
  const submit=async e=>{e.preventDefault();setError('');setSaved(false);const data=Object.fromEntries(new FormData(e.currentTarget));try{const result=await request('/api/buyer/profile',{method:'PUT',csrf,body:data});setProfile(result.profile);setSaved(true);}catch(x){setError(x.message);}};
  return <section className="surface mt-8 p-5"><h2 className="font-display text-lg">Profile settings</h2><p className="mt-1 text-xs text-zinc-400">Your account name and contact number.</p><form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2"><label className="grid gap-2 text-xs">Your name<input className="field" name="displayName" required minLength="2" maxLength="100" value={profile.display_name||''} onChange={e=>setProfile({...profile,display_name:e.target.value})}/></label><label className="grid gap-2 text-xs">Phone number<input className="field" name="phone" type="tel" autoComplete="tel" value={profile.phone||''} onChange={e=>setProfile({...profile,phone:e.target.value})} placeholder="Optional"/></label><div className="sm:col-span-2 flex items-center gap-4"><button className="btn-secondary min-h-10 px-4 text-xs">Save profile</button>{saved&&<span role="status" className="text-xs text-emerald-300">Profile saved</span>}{error&&<span role="alert" className="text-xs text-rose-300">{error}</span>}</div></form></section>;
}

function PasswordSettings({csrf,onChanged}) {
  const [error,setError]=useState('');const [saved,setSaved]=useState(false);
  const submit=async e=>{e.preventDefault();setError('');setSaved(false);const form=e.currentTarget;const data=Object.fromEntries(new FormData(form));try{const result=await request('/api/auth/password',{method:'POST',csrf,body:data});form.reset();onChanged(result.csrfToken);setSaved(true);}catch(x){setError(x.message);}};
  return <section className="surface mt-5 p-5"><h2 className="font-display text-lg">Change password</h2><form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2"><label className="grid gap-2 text-xs">Current password<input className="field" name="currentPassword" type="password" required autoComplete="current-password"/></label><label className="grid gap-2 text-xs">New password<input className="field" name="newPassword" type="password" required minLength="12" maxLength="200" autoComplete="new-password"/><span className="text-[11px] text-zinc-500">Use at least 12 characters</span></label><div className="sm:col-span-2 flex items-center gap-4"><button className="btn-secondary min-h-10 px-4 text-xs">Update password</button>{saved&&<span role="status" className="text-xs text-emerald-300">Password updated. Other sessions were signed out.</span>}{error&&<span role="alert" className="text-xs text-rose-300">{error}</span>}</div></form></section>;
}

function DealerProfileSettings({profile,csrf,onNotify,onSaved}) {
  const [error,setError]=useState('');
  if(!profile)return null;
  const submit=async e=>{e.preventDefault();setError('');const data=Object.fromEntries(new FormData(e.currentTarget));try{const result=await request('/api/dealer/profile',{method:'PUT',csrf,body:data});onNotify(result.needsReview?'Business details sent for admin review.':'Dealer profile saved.');await onSaved();}catch(x){setError(x.message);}};
  return <section className="surface mt-8 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-lg">Business profile</h2><p className="mt-1 text-xs text-zinc-400">Changes to the business name, city or contact email need admin review.</p></div><span className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-300">{profile.status}</span></div><form key={`${profile.business_name}-${profile.city}-${profile.contact_email}`} onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2"><label className="grid gap-2 text-xs">Business name<input className="field" name="businessName" required maxLength="120" defaultValue={profile.business_name}/></label><label className="grid gap-2 text-xs">City or town<input className="field" name="city" required maxLength="80" defaultValue={profile.city}/></label><label className="grid gap-2 text-xs">Contact email<input className="field" name="contactEmail" type="email" required defaultValue={profile.contact_email}/></label><label className="grid gap-2 text-xs">Contact phone<input className="field" name="phone" type="tel" defaultValue={profile.phone||''}/></label><label className="grid gap-2 text-xs sm:col-span-2">Website<input className="field" name="website" type="url" placeholder="https://" defaultValue={profile.website||''}/></label><label className="grid gap-2 text-xs sm:col-span-2">Business description<textarea className="field h-auto py-3" name="description" rows="3" maxLength="2000" defaultValue={profile.description||''}/></label><div className="sm:col-span-2 flex items-center gap-4"><button className="btn-secondary min-h-10 px-4 text-xs">Save business profile</button>{error&&<p role="alert" className="text-xs text-rose-300">{error}</p>}</div></form></section>;
}

function SavedSearches({csrf}) {
  const [items,setItems]=useState([]);const [error,setError]=useState('');
  const refresh=()=>request('/api/saved-searches').then(d=>setItems(d.items)).catch(e=>setError(e.message));
  useEffect(()=>{refresh();},[csrf]);
  const remove=async item=>{try{await request(`/api/saved-searches/${item.id}`,{method:'DELETE',csrf});await refresh();}catch(e){setError(e.message);}};
  const href=item=>{try{return `/browse?${new URLSearchParams(JSON.parse(item.query_json)).toString()}`;}catch{return '/browse';}};
  return <div className="surface mt-10 p-5"><div className="flex items-center justify-between gap-4"><h2 className="font-display text-xl">Saved searches</h2>{items.length>0&&<span className="text-xs text-zinc-400">{items.length} saved</span>}</div>{error&&<p role="alert" className="mt-3 text-xs text-rose-300">{error}</p>}{items.length?<ul className="mt-4 divide-y divide-white/10">{items.map(item=><li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm">{item.label}</p><p className="mt-1 text-xs text-zinc-500">Search alerts are not connected</p></div><div className="flex items-center gap-2"><a className="btn-secondary min-h-9 px-3 text-xs" href={href(item)}>Run search</a><button className="min-h-9 px-2 text-xs text-zinc-400 hover:text-white" onClick={()=>remove(item)}>Remove</button></div></li>)}</ul>:<p className="mt-3 text-sm text-zinc-400">Save a filter from Browse to keep it here.</p>}</div>;
}

function Account({user,csrf,onCsrf,onNotify,onFavorite,favorites,compared,onCompare,onBuy}) {
  const [data,setData]=useState(null);const [error,setError]=useState('');
  useEffect(()=>{if(user?.role==='buyer')Promise.all([request('/api/favourites'),request('/api/buyer/enquiries'),request('/api/buyer/recently-viewed')]).then(([f,e,r])=>setData({favorites:f.items,enquiries:e.items,recent:r.items})).catch(e=>setError(e.message));},[user?.id,user?.role]);
  if(user.role!=='buyer')return <section className="mx-auto max-w-3xl px-5 py-20"><p className="text-sm text-zinc-400">This is a buyer account page. <a className="text-white underline" href={user.role==='dealer'?'/dealer/dashboard':'/admin'}>Open your workspace</a></p></section>;
  return <section className="mx-auto min-h-[70vh] max-w-[1312px] px-5 py-16 sm:px-8"><SectionHead eyebrow="Buyer account" title="Your shortlist" copy={`Signed in as ${user.email}.`}/><NotificationInbox csrf={csrf}/><BuyerProfileSettings csrf={csrf}/><PasswordSettings csrf={csrf} onChanged={onCsrf}/><h2 className="mt-10 font-display text-xl">Saved vehicles</h2><div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{data?.favorites.map(c=><CarCard key={c.id} car={c} favorite={favorites.has(c.id)} compared={compared.has(c.id)} onFavorite={onFavorite} onCompare={onCompare} onBuy={onBuy}/>)}</div>{data?.favorites.length===0&&<p className="mt-4 text-sm text-zinc-400">No saved vehicles yet.</p>}<div className="mt-10"><h2 className="font-display text-xl">Recently viewed</h2><p className="mt-1 text-sm text-zinc-400">Your last 12 vehicle records, saved to this buyer account.</p><div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{data?.recent.map(c=><CarCard key={c.id} car={c} favorite={favorites.has(c.id)} compared={compared.has(c.id)} onFavorite={onFavorite} onCompare={onCompare} onBuy={onBuy}/>)}</div>{data?.recent.length===0&&<p className="mt-3 text-sm text-zinc-400">Vehicles you view will appear here.</p>}</div><div className="mt-10"><h2 className="font-display text-xl">Your enquiries</h2>{error&&<p className="mt-3 text-sm text-rose-300">{error}</p>}{data?.enquiries.length?data.enquiries.map(e=><EnquiryThread key={e.id} enquiry={e} csrf={csrf} user={user} onNotify={onNotify}/>):<p className="mt-3 text-sm text-zinc-400">Vehicle enquiries you send will appear here.</p>}</div><SavedSearches csrf={csrf}/></section>;
}

function Dealer({user,csrf,onCsrf,onNotify}) {
  const [dash,setDash]=useState(null);const [showForm,setShowForm]=useState(false);const [editing,setEditing]=useState(null);const [error,setError]=useState('');
  const refresh=()=>request('/api/dealer/dashboard').then(setDash).catch(e=>setError(e.message));useEffect(()=>{if(user?.role==='dealer')refresh();},[user]);
  if(!user)return <AccessCard title="Dealer sign in required" copy="Sign in with a dealer account to manage vehicle records."/>;
  if(user.role!=='dealer')return <AccessCard title="Dealer account required" copy="This workspace is limited to dealer accounts."/>;
  const closeForm=()=>{setShowForm(false);setEditing(null);setError('');};
  const submit=async e=>{e.preventDefault();setError('');const form=e.currentTarget;const data=Object.fromEntries(new FormData(form));try{const files=[...form.elements.images.files];if(files.length>6)throw new Error('Choose up to six photos.');data.images=await Promise.all(files.map(preparePhoto));await request(editing?`/api/dealer/vehicles/${editing.id}`:'/api/dealer/vehicles',{method:editing?'PUT':'POST',csrf,body:data});closeForm();onNotify(editing?'Changes submitted for listing review.':'Vehicle record submitted for review.');await refresh();}catch(x){setError(x.message);}};
  const changeStatus=async(v,status)=>{setError('');try{await request(`/api/dealer/vehicles/${v.id}/status`,{method:'PATCH',csrf,body:{status}});onNotify(status==='sold'?'Vehicle marked as sold.':status==='paused'?'Listing paused.':'Listing resumed.');await refresh();}catch(x){setError(x.message);}};
  const archive=async(v,action)=>{setError('');try{await request(`/api/dealer/vehicles/${v.id}/${action}`,{method:'POST',csrf});onNotify(action==='delete'?'Listing moved to the archive.':'Listing restored and sent for review.');await refresh();}catch(x){setError(x.message);}};
  const removePhoto=async(v,image)=>{setError('');try{await request(`/api/dealer/vehicles/${v.id}/images/${image.id}`,{method:'DELETE',csrf});await refresh();if(editing?.id===v.id)setEditing(current=>({...current,images:current.images.filter(item=>item.id!==image.id)}));onNotify('Photo removed from this listing.');}catch(x){setError(x.message);}};
  const startEdit=v=>{setEditing(v);setShowForm(true);setError('');};
  const fields=[['make','Make'],['model','Model'],['trim','Trim'],['year','Year'],['price','Price (GHS)'],['depositAmount','Reservation deposit (GHS)'],['mileage','Mileage'],['city','City or town'],['engine','Engine description'],['engineCc','Engine capacity (cc)'],['color','Exterior colour']];
  return <section className="mx-auto max-w-[1312px] px-5 py-16 sm:px-8">
    <SectionHead eyebrow="Dealer workspace" title={dash?.profile?.business_name||'Vehicle inventory'} copy={`Profile review status: ${dash?.profile?.status||'loading'}.`} action={<button onClick={()=>{if(showForm)closeForm();else{setEditing(null);setShowForm(true);}}} className="btn-primary">{showForm?'Close form':'Add a vehicle'}<ArrowRight size={15}/></button>}/>
    <NotificationInbox csrf={csrf}/>
    <DealerProfileSettings profile={dash?.profile} csrf={csrf} onNotify={onNotify} onSaved={refresh}/><PasswordSettings csrf={csrf} onChanged={onCsrf}/>
    {error&&<p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
    {showForm&&<form key={editing?.id||'new'} onSubmit={submit} className="surface mt-7 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3"><div className="sm:col-span-2 lg:col-span-3">{editing&&<p className="mt-2 text-xs text-zinc-400">Saving changes sends this listing back for review.</p>}</div>
      {fields.map(([name,label])=><label key={name} className="grid gap-2 text-xs">{label}<input name={name} required={['make','model','year','price','mileage','city'].includes(name)} type={['year','price','depositAmount','mileage','engineCc'].includes(name)?'number':'text'} min={['year','price','depositAmount','mileage','engineCc'].includes(name)?'0':undefined} max={name==='engineCc'?'20000':undefined} step={['price','depositAmount'].includes(name)?'1000':'1'} defaultValue={editing?({price:editing.price_minor/100,depositAmount:editing.depositAmount||(editing.deposit_amount_minor?editing.deposit_amount_minor/100:''),engineCc:editing.engine_cc,color:editing.exterior}[name]??editing[name]??''):name==='city'?'Accra':''} className="field"/></label>)}
      <label className="grid gap-2 text-xs">Body type<select name="bodyType" defaultValue={editing?.body_type||''} className="field"><option value="">Not supplied</option>{['SUV','Coupe','Sedan','Wagon','Hatchback','Pickup','Van','Electric'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label className="grid gap-2 text-xs">Fuel<select name="fuel" defaultValue={editing?.fuel||'Petrol'} className="field"><option>Petrol</option><option>Diesel</option><option>Electric</option><option>Hybrid</option></select></label>
      <label className="grid gap-2 text-xs">Transmission<select name="transmission" defaultValue={editing?.transmission||'Automatic'} className="field"><option>Automatic</option><option>Manual</option></select></label>
      <label className="grid gap-2 text-xs">Drivetrain<select name="drivetrain" defaultValue={editing?.drivetrain||''} className="field"><option value="">Not supplied</option><option>FWD</option><option>RWD</option><option>AWD</option><option>4WD</option></select></label>
      <label className="grid gap-2 text-xs">Import status<select name="importStatus" defaultValue={editing?.import_status||'Not supplied'} className="field"><option>Not supplied</option><option>Locally used</option><option>Foreign used</option><option>Brand new</option></select></label>
      <label className="grid gap-2 text-xs">Condition<select name="condition" defaultValue={editing?.condition||'Used'} className="field"><option>New</option><option>Used</option><option>Certified</option></select></label>
      <label className="grid gap-2 text-xs sm:col-span-2">Vehicle photos<input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple className="field file:mr-3 file:rounded file:border-0 file:bg-white/10 file:px-3 file:py-2"/><span className="text-[11px] text-zinc-500">Up to six new photos per submission. Images are resized before upload.</span></label>
      {editing?.images?.length>0&&<div className="flex flex-wrap gap-3 sm:col-span-2 lg:col-span-3">{editing.images.map(image=><div key={image.id} className="w-28"><img src={image.url} alt="Current vehicle photo" className="h-20 w-full rounded object-cover"/><button type="button" onClick={()=>removePhoto(editing,image)} className="mt-1 min-h-9 text-xs text-zinc-400 hover:text-white">Remove photo</button></div>)}</div>}
      <label className="grid gap-2 text-xs sm:col-span-2 lg:col-span-3">Description<textarea name="description" rows="3" defaultValue={editing?.description||''} className="field h-auto py-3"/></label>
      <div className="flex flex-wrap gap-3"><button className="btn-primary">{editing?'Save changes for review':'Submit for review'}<ArrowRight size={15}/></button>{editing&&<button type="button" onClick={closeForm} className="btn-secondary">Cancel</button>}</div>
    </form>}
    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">{[['Vehicle records',dash?.vehicles?.length||0],['Active',dash?.vehicles?.filter(x=>x.status==='active').length||0],['Pending review',dash?.vehicles?.filter(x=>x.status==='pending').length||0],['Sold',dash?.vehicles?.filter(x=>x.status==='sold').length||0],['Buyer enquiries',dash?.enquiries?.length||0],['Vehicle views',dash?.stats?.totalViews||0]].map(([x,n])=><div key={x} className="surface p-5"><p className="text-xs text-zinc-400">{x}</p><b className="mt-3 block font-display text-3xl">{n}</b></div>)}</div>
    <div className="surface mt-8 overflow-hidden"><h2 className="border-b border-white/10 px-5 py-4 font-display text-lg">Your vehicle records</h2>{dash?.vehicles?.length?dash.vehicles.map(v=><article key={v.id} className="flex flex-col gap-4 border-b border-white/5 p-4 sm:flex-row sm:items-center sm:px-5"><img src={v.image_url||fallback} onError={e=>{e.currentTarget.src=fallback;}} alt="" className="h-20 w-full rounded-md object-cover sm:w-32"/><div className="min-w-0 flex-1"><p className="font-medium">{v.year} {v.make} {v.model}{v.trim?` · ${v.trim}`:''}</p><p className="mt-1 font-mono text-xs text-zinc-400">{money(v.price_minor/100,v.currency)} · {number(v.mileage)} mi · {[v.city,v.country].filter(Boolean).join(', ')}</p><p className="mt-1 text-[11px] text-zinc-500">{v.views} views · {v.favourites} saves · {v.enquiries} enquiries</p><span className="mt-2 inline-flex rounded-full border border-white/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-zinc-400">{v.deleted_at?'Archived':v.status}</span></div><div className="flex flex-wrap gap-2">{!v.deleted_at&&<><button className="btn-secondary min-h-10 px-3 text-xs" onClick={()=>startEdit(v)} disabled={v.status==='sold'}>Edit</button>{v.status==='active'&&<><button className="btn-secondary min-h-10 px-3 text-xs" onClick={()=>changeStatus(v,'paused')}>Pause</button><button className="btn-secondary min-h-10 px-3 text-xs" onClick={()=>changeStatus(v,'sold')}>Mark sold</button></>}{v.status==='paused'&&<><button className="btn-secondary min-h-10 px-3 text-xs" onClick={()=>changeStatus(v,'active')}>Resume</button><button className="btn-secondary min-h-10 px-3 text-xs" onClick={()=>changeStatus(v,'sold')}>Mark sold</button></>}</>}<button className="btn-secondary min-h-10 px-3 text-xs" onClick={()=>archive(v,v.deleted_at?'restore':'delete')}>{v.deleted_at?'Restore listing':'Archive listing'}</button></div></article>):<p className="p-5 text-sm text-zinc-400">No vehicle records have been submitted.</p>}</div>
    <div className="mt-9"><h2 className="font-display text-xl">Buyer enquiries</h2>{dash?.enquiries?.length?dash.enquiries.map(e=><EnquiryThread key={e.id} enquiry={e} csrf={csrf} user={user} onNotify={onNotify}/>):<p className="mt-3 text-sm text-zinc-400">No enquiries received.</p>}</div>
  </section>;
}
function Admin({user,csrf,onNotify,onRefresh,onLogin}) {
  if(!user||user.role!=='admin')return <div className="py-10"><Auth path="/login" search="?return=%2Fadmin" onSubmit={onLogin}/></div>;
  return <AdminWorkspace user={user} csrf={csrf} request={request} onNotify={onNotify}/>;
}
function ReviewTable({title,empty,columns,children}) {return <div className="surface mt-7 overflow-hidden"><h2 className="border-b border-white/10 px-5 py-4 font-display text-lg">{title}</h2>{children?.length?<div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="text-[10px] uppercase tracking-[.1em] text-zinc-400">{columns.map(c=><th key={c} className="p-4 font-medium">{c}</th>)}</tr></thead><tbody>{children}</tbody></table></div>:<p className="p-5 text-sm text-zinc-400">{empty}</p>}</div>;}

function VehiclePaystackCheckout({car,user,csrf,onClose,onNotify,onNavigate}) {
  const [paymentPlan,setPaymentPlan]=useState('full');
  const [channel,setChannel]=useState('mobile_money');
  const [momoNetwork,setMomoNetwork]=useState('MTN MoMo');
  const [momoPhone,setMomoPhone]=useState('024 800 9900');
  const [cardNumber,setCardNumber]=useState('4084 0840 8408 4084');
  const [cardExpiry,setCardExpiry]=useState('08 / 29');
  const [cardCvv,setCardCvv]=useState('408');
  const [bankOption,setBankOption]=useState('Ecobank Ghana');
  const [deliveryCity,setDeliveryCity]=useState(car.city||'Accra');
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState('');
  const [receipt,setReceipt]=useState(null);

  const fullPrice=Number(car.price)||0;
  const allowDeposit=car.allowDeposit!==false&&car.allow_deposit!==0&&car.listingData?.allowDeposit!==false;
  const rawSellerDeposit=Number(car.depositAmount??car.listingData?.depositAmount??(car.deposit_amount_minor?car.deposit_amount_minor/100:0));
  const depositPrice=rawSellerDeposit>0&&rawSellerDeposit<fullPrice?rawSellerDeposit:Math.max(1,Math.round(fullPrice*0.10));
  const effectivePlan=allowDeposit?paymentPlan:'full';
  const dueNow=effectivePlan==='deposit'?depositPrice:fullPrice;
  const activeProvider=channel==='mobile_money'?momoNetwork:channel==='card'?'Card':bankOption;

  const submitPayment=async e=>{
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try{
      const res=await request(`/api/listings/${encodeURIComponent(car.id)}/buy`,{
        method:'POST',
        csrf,
        body:{
          paymentPlan:effectivePlan,
          channel,
          provider:activeProvider,
          deliveryMethod:'Auto Connect Handover',
          deliveryCity,
          buyerName:user?.name||user?.email||'Buyer',
          buyerPhone:momoPhone
        }
      });
      setReceipt(res);
      onNotify(`Order ${res.order?.reference} confirmed.`);
    }catch(err){
      setError(err.message);
    }finally{
      setSubmitting(false);
    }
  };

  return (
    <div
      className="ac-modal-backdrop fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-slate-900/55 p-4 backdrop-blur-sm dark:bg-black/75"
      onMouseDown={e=>{if(e.target===e.currentTarget&&!submitting)onClose();}}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-dialog-title"
        className="ac-modal-panel relative my-auto w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-white/10 dark:bg-[#151921] dark:text-white"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <h2 id="checkout-dialog-title" className="text-base font-medium">
            {receipt?'Payment confirmed':'Checkout'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close checkout"
            className="grid size-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <X size={16}/>
          </button>
        </div>

        <div className="p-5">
          <div className="flex items-center gap-3.5 rounded-xl bg-slate-100 p-3 dark:bg-white/[.04]">
            <img
              src={listingPhoto(car,0)}
              onError={e=>{e.currentTarget.src=fallback;}}
              alt={carTitle(car)}
              className="h-14 w-20 shrink-0 rounded-lg object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-900 dark:text-white">{carTitle(car)}</div>
              <div className="mt-0.5 text-base font-semibold text-blue-600 dark:text-market-blue">{money(dueNow,car.currency)}</div>
            </div>
          </div>

          {receipt?(
            <div className="mt-4 grid gap-4">
              <div className="grid gap-2.5 rounded-xl bg-slate-50 p-4 text-sm dark:bg-white/[.03]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-zinc-400">Order ID</span>
                  <span className="font-medium text-slate-900 dark:text-white">{receipt.order?.reference}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-zinc-400">{receipt.order?.paymentPlan==='deposit'?'Deposit paid':'Paid in full'}</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-300">{money(receipt.order?.amountPaid||dueNow,car.currency)}</span>
                </div>
                {Number(receipt.order?.balanceDue)>0&&(
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-zinc-400">Balance at handover</span>
                    <span className="font-medium text-slate-900 dark:text-white">{money(receipt.order.balanceDue,car.currency)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-zinc-400">Status</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-300">{receipt.order?.paymentPlan==='deposit'?'Ride reserved · Escrow':'Paid · Escrow'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-zinc-400">Method</span>
                  <span className="font-medium text-slate-900 dark:text-white">{receipt.order?.provider}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-zinc-400">City</span>
                  <span className="font-medium text-slate-900 dark:text-white">{receipt.order?.deliveryCity}</span>
                </div>
              </div>

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={()=>{onClose();onNavigate('/account?view=orders');}}
                  className="btn-primary min-h-11 flex-1 text-sm"
                >
                  View orders
                </button>
                <button type="button" onClick={onClose} className="btn-secondary min-h-11 px-5 text-sm">
                  Done
                </button>
              </div>
            </div>
          ):(
            <form onSubmit={submitPayment} className="mt-4 grid gap-3.5">
              {allowDeposit?(
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-black/25">
                  <button
                    type="button"
                    onClick={()=>setPaymentPlan('full')}
                    className={`min-h-10 rounded-lg text-xs font-medium transition ${effectivePlan==='full'?'bg-white text-slate-900 shadow-xs dark:bg-white/12 dark:text-white':'text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'}`}
                  >
                    Full · {money(fullPrice,car.currency)}
                  </button>
                  <button
                    type="button"
                    onClick={()=>setPaymentPlan('deposit')}
                    className={`min-h-10 rounded-lg text-xs font-medium transition ${effectivePlan==='deposit'?'bg-white text-slate-900 shadow-xs dark:bg-white/12 dark:text-white':'text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'}`}
                  >
                    Deposit · {money(depositPrice,car.currency)}
                  </button>
                </div>
              ):(
                <div className="rounded-xl bg-slate-100 px-3.5 py-2.5 text-xs font-medium text-slate-700 dark:bg-black/25 dark:text-zinc-300">
                  Full payment required · {money(fullPrice,car.currency)}
                </div>
              )}

              {effectivePlan==='deposit'?(
                <div className="grid gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[.06] px-3.5 py-2.5 text-xs text-slate-700 dark:text-zinc-300">
                  <p className="font-semibold text-emerald-700 dark:text-emerald-300">What your deposit gives you:</p>
                  <ul className="grid gap-1 text-[11px] leading-4 text-slate-600 dark:text-zinc-400">
                    <li>• <strong className="text-slate-800 dark:text-zinc-200">Secures the ride:</strong> Locks this vehicle for you so no other buyer can take it.</li>
                    <li>• <strong className="text-slate-800 dark:text-zinc-200">Inspection &amp; test drive:</strong> Unlocks physical vehicle &amp; document verification.</li>
                    <li>• <strong className="text-slate-800 dark:text-zinc-200">Escrow protection:</strong> Refundable if the car does not match the listing.</li>
                    <li>• <strong className="text-slate-800 dark:text-zinc-200">Pay balance at handover:</strong> Remaining {money(Math.max(0,fullPrice-depositPrice),car.currency)} is due only after you approve the car.</li>
                  </ul>
                </div>
              ):(
                <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-3.5 py-2 text-[11px] leading-4 text-slate-600 dark:border-white/10 dark:bg-white/[.03] dark:text-zinc-400">
                  Held in Auto Connect Escrow and released to the seller only after you inspect and accept the vehicle at handover.
                </div>
              )}

              <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1 dark:bg-black/25">
                {[
                  ['mobile_money','Mobile Money'],
                  ['card','Card'],
                  ['bank_transfer','Bank']
                ].map(([id,label])=>(
                  <button
                    key={id}
                    type="button"
                    onClick={()=>setChannel(id)}
                    className={`min-h-9 rounded-lg text-xs font-medium transition ${channel===id?'bg-blue-600 font-semibold text-white dark:bg-market-blue dark:text-black':'text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {channel==='mobile_money'&&(
                <div className="grid grid-cols-2 gap-2.5">
                  <select className="field min-h-11 text-sm" value={momoNetwork} onChange={e=>setMomoNetwork(e.target.value)} aria-label="Network">
                    <option value="MTN MoMo">MTN MoMo</option>
                    <option value="Telecel Cash">Telecel Cash</option>
                    <option value="AT Money">AT Money</option>
                  </select>
                  <input
                    className="field min-h-11 text-sm"
                    required
                    value={momoPhone}
                    onChange={e=>setMomoPhone(e.target.value)}
                    placeholder="Phone number"
                    aria-label="Mobile number"
                  />
                </div>
              )}

              {channel==='card'&&(
                <div className="grid gap-2.5">
                  <input
                    className="field min-h-11 text-sm"
                    required
                    value={cardNumber}
                    onChange={e=>setCardNumber(e.target.value)}
                    placeholder="Card number"
                    aria-label="Card number"
                  />
                  <div className="grid grid-cols-2 gap-2.5">
                    <input
                      className="field min-h-11 text-sm"
                      required
                      value={cardExpiry}
                      onChange={e=>setCardExpiry(e.target.value)}
                      placeholder="MM / YY"
                      aria-label="Expiry"
                    />
                    <input
                      className="field min-h-11 text-sm"
                      required
                      value={cardCvv}
                      onChange={e=>setCardCvv(e.target.value)}
                      placeholder="CVV"
                      aria-label="CVV"
                    />
                  </div>
                </div>
              )}

              {channel==='bank_transfer'&&(
                <select className="field min-h-11 text-sm" value={bankOption} onChange={e=>setBankOption(e.target.value)} aria-label="Bank">
                  <option value="Ecobank Ghana">Ecobank Ghana</option>
                  <option value="GCB Bank">GCB Bank</option>
                  <option value="Fidelity Bank">Fidelity Bank</option>
                  <option value="Stanbic Bank">Stanbic Bank</option>
                </select>
              )}

              <input
                className="field min-h-11 text-sm"
                required
                value={deliveryCity}
                onChange={e=>setDeliveryCity(e.target.value)}
                placeholder="Delivery city"
                aria-label="Delivery city"
              />

              {error&&<div role="alert" className="text-xs text-rose-600 dark:text-rose-300">{error}</div>}

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary min-h-11 w-full text-sm"
              >
                {submitting?'Processing…':`Pay ${money(dueNow,car.currency)}`}
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}

function Dialog({modal,onClose,csrf,onNotify}) {
  const [error,setError]=useState('');const car=modal.car;
  const isOffer=modal.type==='offer';
  const isEnquiry=modal.type==='enquiry'||modal.type==='inspection';
  const submit=async e=>{
    e.preventDefault();setError('');const fd=new FormData(e.currentTarget);
    try{
      if(isOffer){
        const r=await request(`/api/listings/${encodeURIComponent(car.id)}/offers`,{method:'POST',csrf,body:{amount:Number(fd.get('amount')),buyerName:fd.get('buyerName'),buyerEmail:fd.get('buyerEmail'),message:fd.get('message'),currency:car.currency||'GHS'}});
        onNotify(r.notice||'Your offer has been submitted through Auto Connect.');
      }else if(isEnquiry){
        const r=await request('/api/enquiries',{method:'POST',csrf,body:{vehicleId:car.id,message:fd.get('message'),isInspection:modal.type==='inspection'}});
        onNotify(modal.type==='inspection'?`Inspection request sent to Admin. ${r.notice}`:`Enquiry sent to Admin for review & forwarding. ${r.notice}`);
      }else{
        await request('/api/reports',{method:'POST',csrf,body:{vehicleId:car.id,reason:fd.get('reason'),details:fd.get('details')}});
        onNotify('Seller/listing case report submitted for administrator review.');
      }
      onClose();
    }catch(x){setError(x.message);}
  };
  return <div className="ac-modal-backdrop fixed inset-0 z-[90] grid place-items-center bg-slate-900/55 p-4 backdrop-blur-sm dark:bg-black/75" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="ac-modal-panel surface relative w-full max-w-lg bg-white p-6 text-slate-900 shadow-2xl dark:bg-[#181818] dark:text-white"><button onClick={onClose} aria-label="Close dialog" className="absolute right-4 top-4 grid size-10 place-items-center rounded-full border border-slate-200 transition hover:border-slate-400 dark:border-white/10 dark:hover:border-white/30"><X size={17}/></button><h2 id="dialog-title" className="mt-4 pr-9 font-display text-2xl">{isOffer?`Make an offer on ${carTitle(car)}`:modal.type==='inspection'?`Request an inspection for ${carTitle(car)}`:isEnquiry?`Ask about ${carTitle(car)}`:'Report seller or listing'}</h2><form onSubmit={submit} className="mt-6 grid gap-4">{isOffer?<><label className="grid gap-2 text-xs">Your offer amount ({car.currency||'GHS'})<input className="field" name="amount" type="number" min="1" step="1" required placeholder={`e.g. ${Math.round((Number(car.price)||100000)*0.95)}`}/></label><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-2 text-xs">Your name<input className="field" name="buyerName" required placeholder="e.g. Kwame Mensah"/></label><label className="grid gap-2 text-xs">Your email (optional, for Admin)<input className="field" name="buyerEmail" type="email" placeholder="you@example.com"/></label></div><label className="grid gap-2 text-xs">Message or payment terms (optional)<textarea className="field h-auto py-3" name="message" rows="3" maxLength="1000" placeholder="e.g. Ready to inspect and complete purchase this week."/></label></>:isEnquiry?<label className="grid gap-2 text-xs">{modal.type==='inspection'?'Inspection details (reviewed by Admin first)':'Your question (reviewed & edited by Admin before going to seller)'}<textarea className="field h-auto py-3" name="message" required minLength="12" maxLength="2000" rows="5" defaultValue={modal.type==='inspection'?`I would like to arrange an independent inspection for this ${carTitle(car)}. Please share the vehicle location and suitable times.`:'Is this vehicle available? Please share its current condition and service history.'}/></label>:<><label className="grid gap-2 text-xs">Reason<select className="field" name="reason"><option>Suspicious seller</option><option>Incorrect vehicle details</option><option>Price or availability concern</option><option>Other</option></select></label><label className="grid gap-2 text-xs">Case details for Admin review<textarea className="field h-auto py-3" name="details" rows="4" maxLength="1000"/></label></>}<div role="alert" className="min-h-5 text-xs text-rose-600 dark:text-rose-300">{error}</div><button className="btn-primary w-full">{isOffer?'Submit offer':modal.type==='inspection'?'Send inspection request to Admin':isEnquiry?'Send enquiry to Admin':'Submit report for Admin review'}<ArrowRight size={15}/></button></form></section></div>;
}

function ImportSection({onEstimate}) {
  const [result,setResult]=useState(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const submit=async e=>{e.preventDefault();setBusy(true);setError('');try{setResult(await onEstimate(Object.fromEntries(new FormData(e.currentTarget))));}catch(x){setError(x.message);}finally{setBusy(false);}};
  return <section id="import" className="mk-import-section border-b border-slate-200 bg-slate-50 py-20 dark:border-white/10 dark:bg-[#161616] sm:py-24"><div className="wrap mx-auto max-w-[1312px] px-5 sm:px-8"><SectionHead eyebrow="Cross-border buying" title="A clearer route to import" copy="A planning guide for sourcing, inspection and shipping. Confirm requirements with providers in your destination country."/><div className="mt-10 grid gap-10 lg:grid-cols-2 lg:gap-16"><ol className="grid gap-3">{[['01','Choose a vehicle','Compare the listing and ask the seller about records, condition and availability.'],['02','Arrange an inspection','Ask an independent inspection provider to review the car before shipping.'],['03','Confirm route and costs','Compare methods with a logistics provider and review destination rules.']].map(([n,t,c])=><li key={n} className="surface flex gap-5 p-5 sm:p-6"><span className="text-blue-600 dark:text-market-blue">{n==='01'?<Search size={21}/>:n==='02'?<Shield size={21}/>:<ArrowRight size={21}/>}</span><div><h3 className="font-display text-lg">{t}</h3><p className="mt-2 text-sm leading-6 text-slate-500 dark:text-zinc-400">{c}</p></div></li>)}</ol><div className="app-frame rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-[#1d1d1d] sm:p-7"><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-lg bg-blue-600/10 text-blue-600 dark:bg-market-blue/10 dark:text-market-blue"><ArrowRight size={18}/></div><div><h3 className="font-display text-xl">Shipping cost estimate</h3><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-zinc-400">Sample planning values only. Not a carrier quote; customs and taxes excluded.</p></div></div><form onSubmit={submit} className="mt-6 grid gap-3 sm:grid-cols-2"><label className="grid gap-2 text-xs">Origin<input required name="origin" placeholder="Country or port" className="field"/></label><label className="grid gap-2 text-xs">Destination<input required name="destination" placeholder="Country or port" className="field"/></label><label className="grid gap-2 text-xs">Vehicle type<select name="vehicleType" className="field"><option>Sedan</option><option>SUV</option><option>Van</option></select></label><label className="grid gap-2 text-xs">Shipping method<select name="method" className="field"><option>RoRo</option><option>Container</option></select></label><button disabled={busy} className="btn-primary sm:col-span-2">{busy?'Calculating…':'Calculate sample estimate'}<ArrowRight size={15}/></button></form>{error&&<p role="alert" className="mt-3 text-xs text-rose-600 dark:text-rose-300">{error}</p>}{result&&<div role="status" className="mt-4 rounded-lg border border-blue-600/30 bg-blue-600/[.06] p-4 dark:border-market-blue/30 dark:bg-market-blue/[.06]"><div className="flex items-center justify-between"><span className="text-xs text-slate-700 dark:text-zinc-300">Illustrative estimate</span><b className="font-mono text-lg">{money(result.estimate,result.currency)}</b></div><p className="mt-2 text-[10px] leading-5 text-slate-500 dark:text-zinc-400">{result.assumptions}</p></div>}</div></div></div></section>;
}

function Legal({kind}) {const privacy=kind==='privacy';return <section className="mx-auto max-w-3xl px-5 py-16 sm:px-8"><h1 className="mt-4 font-display text-4xl">{privacy?'Privacy overview':'Marketplace terms'}</h1><p className="mt-4 text-sm leading-6 text-slate-500 dark:text-zinc-400">This page describes the prototype and is not a production legal policy.</p><div className="surface mt-8 space-y-5 p-6 text-sm leading-6 text-slate-700 dark:text-zinc-300"><p>Vehicle records, saved cars, saved searches, enquiries and estimate requests are stored in the local SQLite database. Passwords are hashed with scrypt. Session cookies are HttpOnly and SameSite Strict.</p><p>Sample vehicle details and prices are illustrative. No dealer identity, vehicle history, condition, customs duty or shipping offer has been verified.</p><h2 className="font-display text-lg text-slate-900 dark:text-white">Before launch</h2><p>The marketplace operator, jurisdiction, retention periods, support channel, email provider and production hosting location need to be supplied. Have the final policy reviewed for all operating countries.</p></div></section>;}
function Credits() {return <section className="mx-auto max-w-3xl px-5 py-16 sm:px-8"><h1 className="mt-4 font-display text-4xl">Image credits</h1><p className="mt-4 text-sm leading-6 text-slate-500 dark:text-zinc-400">Vehicle photos are illustrative stand-ins and do not verify the specific sample records.</p><div className="surface mt-8 space-y-4 p-6 text-sm leading-6 text-slate-700 dark:text-zinc-300"><p><a className="underline underline-offset-4" href="https://unsplash.com/photos/a-sleek-black-sports-car-parked-outdoors-EwpQLPWgqE4">Samuel Hagger — sleek black sports car</a></p><p><a className="underline underline-offset-4" href="https://unsplash.com/photos/two-bmw-cars-parked-on-a-street-5zyOJrRn5vc">Rana Singh — two BMW cars</a></p><p>Updated demo photographs: <a className="underline" href="https://unsplash.com/photos/KHAEZkXlwW8">Defender — Haberdoedas</a>; <a className="underline" href="https://unsplash.com/photos/YWZ9fVNDSLg">Audi RS 6 — lennyyx2z</a>; <a className="underline" href="https://unsplash.com/photos/K0LncGv1mww">Taycan — Stepan Voronkov</a>.</p><p>Additional stand-in photos use Unsplash image CDN IDs whose photographer source pages have not been confirmed. Replace or fully attribute these before commercial launch.</p><p><a className="underline underline-offset-4" href="https://unsplash.com/license">Unsplash License</a></p></div></section>;}
function AccessCard({title,copy}) {return <section className="grid min-h-[60vh] place-items-center px-5"><div className="surface max-w-lg p-8 text-center"><KeyRound className="mx-auto text-blue-600 dark:text-market-blue"/><h1 className="mt-4 font-display text-2xl">{title}</h1><p className="mt-3 text-sm text-slate-500 dark:text-zinc-400">{copy}</p><a href="/login" className="btn-primary mt-6">Sign in<ArrowRight size={15}/></a></div></section>;}
function NotFound() {return <section className="grid min-h-[60vh] place-items-center px-5 text-center"><div><h1 className="mt-5 font-display text-4xl">This page has moved.</h1><a href="/browse" className="btn-primary mt-6">Browse vehicles<ArrowRight size={15}/></a></div></section>;}
function Footer() {return <footer className="closing market-footer border-t border-slate-200 bg-slate-100 text-slate-900 dark:border-white/10 dark:bg-[#0d0d0d] dark:text-white"><div className="wrap mx-auto max-w-[1312px] px-5 py-10 sm:px-8"><div className="grid gap-9 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]"><div><a className="font-mono text-xs font-semibold tracking-[.12em]" href="/">AUTO<span className="ml-1 text-slate-500 dark:text-zinc-400">CONNECT</span></a><p className="mt-3 max-w-xs text-xs leading-5 text-slate-500 dark:text-zinc-400">Vehicle search, comparison and dealer enquiries across Ghana.</p></div><FooterColumn title="Marketplace" links={[["Browse cars","/browse"],["Compare","/compare"],["Saved cars","/favorites"]]}/><FooterColumn title="Services" links={[["Import guidance","/#import"],["Shipping estimate","/#import"],["List a car","/register?role=dealer"]]}/><FooterColumn title="Account" links={[["Sign in","/login"],["Privacy overview","/privacy"],["Terms overview","/terms"],["Photo credits","/credits"]]}/></div><div className="mt-9 flex flex-col justify-between gap-2 border-t border-slate-200 pt-5 text-xs text-slate-500 dark:border-white/10 dark:text-zinc-400 sm:flex-row"><span>© 2026 Auto Connect · Prototype marketplace</span><span>Illustrative sample inventory · GHS</span></div></div></footer>;}
function FooterColumn({title,links}) {return <div><h3 className="text-sm font-medium text-slate-800 dark:text-zinc-300">{title}</h3><div className="mt-3 grid">{links.map(([x,y])=><a key={x} href={y} className="flex min-h-10 items-center text-sm text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white">{x}</a>)}</div></div>;}

export default App;


