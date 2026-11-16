import { defineConfig } from '@playwright/test';

const apiPort=Number(process.env.QA_API_PORT||4173);
const webPort=Number(process.env.QA_WEB_PORT||5173);
const apiOrigin=`http://127.0.0.1:${apiPort}`;
const webOrigin=`http://127.0.0.1:${webPort}`;
const sharedEnv={...process.env,PORT:String(apiPort),PUBLIC_ORIGIN:webOrigin,NODE_ENV:'test'};

export default defineConfig({
  testDir:'./tests/e2e',
  fullyParallel:false,
  workers:1,
  timeout:60_000,
  expect:{timeout:8_000},
  reporter:'list',
  outputDir:process.env.PLAYWRIGHT_OUTPUT_DIR||'test-results/playwright',
  use:{
    baseURL:webOrigin,
    browserName:'chromium',
    channel:'msedge',
    headless:false,
    viewport:{width:1440,height:900},
    screenshot:'only-on-failure',
    trace:'retain-on-failure'
  },
  webServer:[
    {command:'node server.mjs',url:`${apiOrigin}/api/health`,cwd:process.cwd(),reuseExistingServer:false,timeout:30_000,env:sharedEnv},
    {command:`pnpm exec vite --host 127.0.0.1 --port ${webPort} --strictPort`,url:webOrigin,cwd:process.cwd(),reuseExistingServer:false,timeout:30_000,env:{...sharedEnv,VITE_PORT:String(webPort),API_PROXY_TARGET:apiOrigin}}
  ]
});
