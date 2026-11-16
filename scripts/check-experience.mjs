import {chromium,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

// Validate the integrated, rendered React application, not an isolated JSX file.
const url=process.argv[2]||'http://127.0.0.1:4287/';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname))throw new Error('Use an explicitly started local preview.');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
const results=[];
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',error:e.message});console.error('FAIL '+name+': '+e.message);}}
try {
 await page.goto(url);await page.locator('h1').waitFor();
 await check('Scene structure and depth layers',async()=>{
  await expect(page.locator('section.scene[data-scene="hero"]')).toBeVisible();
  for(const depth of [0,3,4])await expect(page.locator(`section.scene[data-scene="hero"] [data-depth="${depth}"]`).first()).toHaveCount(1);
 });
 await check('Document language',()=>expect(page.locator('html')).toHaveAttribute('lang','en'));
 await check('Main content landmark',async()=>{
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('main')).toHaveAttribute('id','main');
 });
 await check('Keyboard skip link reaches the content',async()=>{
  await page.keyboard.press('Tab');const skip=page.getByRole('link',{name:'Skip to content',exact:true});
  await expect(skip).toBeFocused();await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');await expect(page.getByRole('main')).toBeFocused();
 });
 await check('Installed animation engine mounts and cleans up',async()=>{
  await expect(page.locator('.hero')).toHaveClass(/is-entered/);
  await expect(page.locator('#seller-heading')).toHaveAttribute('data-moment-mounted','1');
  // The implementation is the locally served motion engine, not GSAP.
  await expect(page.locator('#seller-heading')).toHaveClass(/mo-lt/);
 });
 await check('Reduced motion works on load and after a preference change',async()=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('#seller-heading')).toHaveAttribute('data-moment-still','reduced');
  await expect.poll(()=>page.locator('#seller-heading').evaluate(el=>getComputedStyle(el).filter)).toBe('none');
  await expect.poll(()=>page.locator('.hero').evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length)).toBe(0);
  await page.reload();await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('#seller-heading')).toHaveAttribute('data-moment-still','reduced');
 });
}finally{await browser.close();}
const report={url,checkedAt:new Date().toISOString(),passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results};
await writeFile('experience-check-results.json',JSON.stringify(report,null,2)+'\n');
console.log(`Experience checks: ${report.passed}/6 passed, ${report.failed} failed.`);
process.exitCode=report.failed?1:0;
