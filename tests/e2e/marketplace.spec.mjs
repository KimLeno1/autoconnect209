import {listingFee} from '../../listing-billing.mjs';
import {DatabaseSync} from 'node:sqlite';
import {test,expect} from '@playwright/test';

const suffix=Date.now().toString(36);
const buyerEmail=`qa-buyer-${suffix}@example.test`;
const journeyBuyerEmail=`qa-journey-buyer-${suffix}@example.test`;
const dealerEmail=`qa-dealer-${suffix}@example.test`;
const accountPassword='QA-Marketplace-Password-2026!';
const model=`Pilot QA ${suffix}`;

async function registerBuyer(page,email=buyerEmail){
  await page.goto('/register');
  await page.getByLabel('Your name').fill('QA Buyer');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(accountPassword);
  await page.getByRole('button',{name:'Create account'}).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading',{name:'Hello, QA.'})).toBeVisible();
}

test('guest discovery, combined filters, comparison, buyer registration and sign out',async({page})=>{
  const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:/Cars for your/})).toBeVisible();
  await page.getByPlaceholder('Make, model or location').fill('Porsche');
  await page.getByRole('button',{name:'Search',exact:true}).click();
  await expect(page).toHaveURL(/\/browse\?q=Porsche/);
  await expect(page.getByRole('status')).toHaveText('2 listings');
  await expect(page.getByRole('link',{name:'View 2024 Porsche Taycan'})).toBeVisible();
  await page.getByRole('link',{name:'View 2024 Porsche Taycan'}).click();
  await expect(page.getByRole('heading',{name:'2024 Porsche Taycan'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Show photo 1 of 2024 Porsche Taycan'})).toBeVisible();

  await page.goto('/browse');
  await page.getByRole('combobox',{name:'Make'}).selectOption({label:'Porsche'});
  await page.getByRole('spinbutton',{name:'Maximum price in Ghana cedis'}).fill('3000000');
  await page.getByRole('combobox',{name:'Sort results'}).selectOption({label:'Price: low to high'});
  await page.getByRole('button',{name:'More filters'}).click();
  await page.getByRole('textbox',{name:'City or region in Ghana'}).fill('Cape Coast');
  await page.getByRole('spinbutton',{name:'Year from'}).fill('2024');
  await page.getByRole('spinbutton',{name:'Year to'}).fill('2024');
  await page.getByRole('spinbutton',{name:'Mileage to'}).fill('5000');
  await page.getByRole('combobox',{name:'Fuel type'}).selectOption({label:'Electric'});
  await page.getByRole('combobox',{name:'Body type'}).selectOption({label:'Sedan'});
  await page.getByRole('combobox',{name:'Condition'}).selectOption({label:'Used'});
  await page.getByRole('button',{name:'Apply filters'}).click();
  await expect(page.getByRole('status')).toHaveText('1 listing');
  await expect(page).toHaveURL(/make=Porsche.*location=Cape\+Coast.*minYear=2024.*maxMileage=5000.*fuel=Electric.*bodyType=Sedan.*condition=Used/);
  await expect(page.getByRole('article')).toHaveCount(1);

  await page.getByRole('link',{name:'Clear all'}).click();
  await page.getByRole('status').waitFor({state:'visible'});
  await expect(page.getByRole('checkbox',{name:'Compare 2024 Porsche Taycan'})).toBeVisible();
  await page.getByRole('checkbox',{name:'Compare 2024 Porsche Taycan'}).check();
  await page.getByRole('checkbox',{name:'Compare 2022 Porsche 911'}).check();
  await page.getByRole('button',{name:'Compare',exact:true}).click();
  await expect(page.getByRole('heading',{name:'2024 Porsche Taycan',level:3})).toBeVisible();
  await expect(page.getByRole('heading',{name:'2022 Porsche 911',level:3})).toBeVisible();
  await page.getByRole('button',{name:'Clear comparison'}).click();

  await page.goto('/');
  for (const width of [390,768,1440]) {
    await page.setViewportSize({width,height:900});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
    expect(overflow,`homepage should fit a ${width}px viewport`).toBe(false);
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Open navigation'}).click();
  await expect(page.getByRole('button',{name:'Close navigation'})).toHaveAttribute('aria-expanded','true');
  await page.getByRole('button',{name:'Close navigation'}).click();
  await page.setViewportSize({width:1440,height:900});

  await registerBuyer(page);
  await page.setViewportSize({width:390,height:844});
  const menu=page.getByRole('button',{name:'Toggle navigation',exact:true});
  await menu.click();
  const drawer=page.getByRole('complementary',{name:'Buyer navigation',exact:true});
  await expect(drawer.getByRole('button',{name:'Close navigation',exact:true})).toBeFocused();
  await drawer.getByRole('button',{name:'Close navigation',exact:true}).press('Shift+Tab');
  await expect(drawer.getByRole('button',{name:'Sign out',exact:true})).toBeFocused();
  await drawer.getByRole('button',{name:'Sign out',exact:true}).press('Escape');
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute('aria-expanded','false');
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button',{name:'Sign out'}).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('link',{name:'Sign in'}).first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('dealer listing, photos, admin approval, buyer conversation and report moderation',async({browser})=>{
  const buyerContext=await browser.newContext();
  const dealerContext=await browser.newContext();
  const adminContext=await browser.newContext();
  const buyer=await buyerContext.newPage();
  const dealer=await dealerContext.newPage();
  const admin=await adminContext.newPage();
  const question=`Please share the inspection and service records for the ${model}.`;
  const reply='The service records are available for review before a viewing.';
  try {
    await registerBuyer(buyer,journeyBuyerEmail);
    await dealer.goto('/register?role=dealer');
    await dealer.getByLabel('Email address').fill(dealerEmail);
    await dealer.getByLabel('Dealership name').fill('QA Northline Motors');
    await dealer.getByLabel('Phone number').fill('+233 24 000 0000');
    await dealer.locator('form').last().getByLabel('City or town').fill('Accra');
    await dealer.getByLabel('Password').fill(accountPassword);
    await dealer.getByRole('button',{name:'Create seller account'}).click();
    await expect(dealer).toHaveURL(/\/dealer\/dashboard$/);
    await dealer.getByRole('button',{name:'Post a vehicle'}).click();
    await dealer.getByLabel('Vehicle type').selectOption('SUV');
    await dealer.getByLabel('Manufacturer').fill('Toyota');
    await dealer.getByLabel('Model').fill(model);
    await dealer.getByLabel('Manufacturing year').fill('2022');
    await dealer.getByLabel('Current mileage').fill('41000');
    await dealer.getByRole('button',{name:'Continue'}).click();
    await dealer.getByLabel('Fuel type').selectOption('Electric');
    await dealer.getByLabel('Electric range (km)').fill('390');
    await dealer.getByRole('button',{name:'Continue'}).click();
    await dealer.getByLabel('Asking price').fill('125000');
    await dealer.getByRole('button',{name:'Continue'}).click();
    await dealer.getByRole('button',{name:'Continue'}).click();
    await dealer.getByLabel('Bluetooth').check();
    await dealer.getByRole('button',{name:'Continue'}).click();
    const photoData=await dealer.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=48;canvas.height=32;const ctx=canvas.getContext('2d');ctx.fillStyle='#d52b1e';ctx.fillRect(0,0,48,32);return canvas.toDataURL('image/png').split(',')[1];});
    const png=Buffer.from(photoData,'base64');
    await dealer.locator('input[type="file"]').setInputFiles([
      {name:'qa-front.png',mimeType:'image/png',buffer:png},
      {name:'qa-interior.png',mimeType:'image/png',buffer:png}
    ]);
    await dealer.getByLabel('City or town').fill('Accra');
    await dealer.getByLabel('Region').fill('Greater Accra');
    await dealer.getByRole('button',{name:'Continue'}).click();
    await expect(dealer.getByRole('heading',{name:new RegExp(`2022 Toyota ${model}`)})).toBeVisible();
    await dealer.getByRole('button',{name:'Submit for approval'}).click();
    await expect(dealer.getByText(`${model}`,{exact:false}).first()).toBeVisible();

    await expect(dealer.getByRole('button',{name:'Submit for approval',exact:true})).toHaveCount(0);
    // Isolated provider-success fixture: real payment collection is tested with a mocked provider in listing-billing.test.mjs.
    const fixture=new DatabaseSync(process.env.DATABASE_PATH);for(const v of fixture.prepare("SELECT id,dealer_id,price_minor,currency FROM vehicles WHERE status='pending'").all())fixture.prepare("INSERT OR IGNORE INTO listing_fee_payments(reference,seller_id,vehicle_id,amount_minor,currency,status,created_at) VALUES(?,?,?,?,?,'paid',?)").run('fixture_'+v.id,v.dealer_id,v.id,listingFee(v.price_minor,v.currency),'GHS',new Date().toISOString());fixture.close();
    await admin.goto('/admin');
    await admin.getByLabel('Email address').fill('qa-admin@example.test');
    await admin.getByLabel('Password').fill('QA-Only-Admin-2026-MotorMarket');
    await admin.getByRole('button',{name:'Sign in'}).click();
    await expect(admin).toHaveURL(/\/admin(?:\?|$)/);
    await expect(admin.getByRole('heading',{name:'Everything in view.'})).toBeVisible();
    await expect(admin.getByText('4 total')).toBeVisible();
    await admin.getByRole('button',{name:'Review approvals',exact:true}).click();
    await expect(admin.getByRole('button',{name:'Approve'})).toHaveCount(2);
    await admin.getByRole('button',{name:'Approve'}).first().click();
    await admin.getByRole('button',{name:'Confirm action',exact:true}).click();
    await expect(admin.getByRole('button',{name:'Approve'})).toHaveCount(1);
    await admin.getByRole('button',{name:'Approve'}).click();
    await admin.getByRole('button',{name:'Confirm action',exact:true}).click();
    await expect(admin.getByRole('button',{name:'Approve',exact:true})).toHaveCount(0);

    await buyer.goto('/browse');
    await buyer.getByPlaceholder('Make, model or location').fill(model);
    await buyer.getByRole('button',{name:'Apply filters'}).click();
    await expect(buyer.getByRole('status')).toHaveText('1 listing');
    await buyer.getByRole('link',{name:new RegExp(`View 2022 Toyota ${model}`)}).click();
    await expect(buyer.getByRole('heading',{name:new RegExp(`2022 Toyota ${model}`)})).toBeVisible();
    await expect(buyer.getByRole('button',{name:/Show photo 1 of/})).toBeVisible();
    await expect(buyer.getByRole('button',{name:/Show photo 2 of/})).toBeVisible();
    await buyer.getByRole('button',{name:'Ask about this car'}).click();
    await buyer.getByRole('dialog').getByLabel('Your question').fill(question);
    await buyer.getByRole('dialog').getByRole('button',{name:'Send enquiry'}).click();
    await expect(buyer.getByRole('dialog')).toHaveCount(0);

    await dealer.reload();
    await dealer.getByText(question,{exact:true}).waitFor({state:'visible'});
    await dealer.getByRole('button',{name:'Open conversation'}).click();
    await dealer.getByLabel('Write a reply').fill(reply);
    await dealer.getByRole('button',{name:'Send reply'}).click();
    await expect(dealer.getByText(reply,{exact:true})).toBeVisible();

    await buyer.goto('/account');
    await expect(buyer.getByRole('heading',{name:'Hello, QA.'})).toBeVisible();
    await buyer.getByRole('navigation',{name:'Buyer navigation'}).getByRole('button',{name:'Messages',exact:true}).click();
    await buyer.getByRole('button',{name:'View conversation'}).click();
    await expect(buyer.getByText(reply,{exact:true})).toBeVisible();

    await buyer.goto('/browse');
    await buyer.getByPlaceholder('Make, model or location').fill(model);
    await buyer.getByRole('button',{name:'Apply filters'}).click();
    await buyer.getByRole('link',{name:new RegExp(`View 2022 Toyota ${model}`)}).click();
    await buyer.getByRole('button',{name:'Report listing'}).click();
    await buyer.getByRole('dialog').getByRole('textbox',{name:'Details'}).fill('QA moderation test record.');
    await buyer.getByRole('dialog').getByRole('button',{name:'Send report'}).click();

    await admin.goto('/admin?section=moderation');
    await admin.getByRole('button',{name:'Review',exact:true}).click();
    await admin.getByRole('button',{name:'Confirm action',exact:true}).click();
    await expect(admin.getByRole('table').getByText('reviewing',{exact:true})).toBeVisible();
    await admin.getByRole('button',{name:'Resolve',exact:true}).click();
    await admin.getByRole('button',{name:'Confirm action',exact:true}).click();
    await expect(admin.getByRole('table').getByText('resolved',{exact:true})).toBeVisible();

    await dealer.reload();
    await expect(dealer.getByText(/1 enquiries/)).toBeVisible();
  } finally {
    await Promise.all([buyerContext.close(),dealerContext.close(),adminContext.close()]);
  }
});

test('private seller can save and resume a vehicle draft after reload',async({page})=>{
  const privateEmail=`qa-private-${suffix}@example.test`;
  await page.goto('/register?role=dealer');
  await page.getByLabel('Private seller').check();
  await page.getByLabel('Full name').fill('QA Private Seller');
  await page.getByLabel('Email address').fill(privateEmail);
  await page.getByLabel('Phone number').fill('+233 24 000 0000');
  await page.getByLabel('City or town').fill('Kumasi');
  await page.getByLabel('Password').fill(accountPassword);
  await page.getByRole('button',{name:'Create seller account'}).click();
  await expect(page).toHaveURL(/\/dealer\/dashboard$/);
  await page.getByRole('button',{name:'Post a vehicle'}).click();
  await page.getByLabel('Manufacturer').fill('Honda');
  await page.getByLabel('Model').fill('Civic Draft QA');
  await expect(page.getByRole('status')).toContainText('Saved just now',{timeout:15000});
  await page.getByRole('button',{name:'Back to seller workspace'}).click();
  await expect(page.getByRole('heading',{name:'Saved drafts'})).toBeVisible();
  await page.reload();
  await page.getByRole('button',{name:'Continue draft'}).click();
  await expect(page.getByLabel('Manufacturer')).toHaveValue('Honda');
  await expect(page.getByLabel('Model')).toHaveValue('Civic Draft QA');
});



 test('marketplace imagery and content remain available with reduced motion',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await expect(page.getByRole('heading',{name:/Cars for your/})).toBeVisible();
 const photo=page.getByRole('img',{name:'Black Porsche driving along an open road'});
 await expect(photo).toBeVisible();
 await expect.poll(()=>photo.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
 expect(await page.locator('.mk-hero').evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length)).toBe(0);
 await page.getByRole('link',{name:'SUVs',exact:true}).click();
 await expect(page).toHaveURL(/bodyType=SUV/);
 await expect(page.getByRole('combobox',{name:'Body type',exact:true})).toHaveValue('SUV');
});
