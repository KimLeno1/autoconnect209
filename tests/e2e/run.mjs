import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import net from 'node:net';
import {tmpdir} from 'node:os';
import {dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..','..');
const tempRoot=resolve(tmpdir());
const qaDir=await mkdtemp(join(tempRoot,'apex-market-playwright-'));
async function freePort(){const server=net.createServer();await new Promise((resolveListen,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolveListen));const port=server.address().port;await new Promise(resolveClose=>server.close(resolveClose));return port;}
const [apiPort,webPort]=await Promise.all([freePort(),freePort()]);
const env={...process.env,QA_API_PORT:String(apiPort),QA_WEB_PORT:String(webPort),DATABASE_PATH:join(qaDir,'marketplace.sqlite'),PLAYWRIGHT_OUTPUT_DIR:join(root,'test-results',`playwright-${Date.now()}`),APEX_ADMIN_EMAIL:'qa-admin@example.test',APEX_ADMIN_PASSWORD:'QA-Only-Admin-2026-MotorMarket'};
const cli=join(root,'node_modules','@playwright','test','cli.js');
let exitCode=1;
try {
  exitCode=await new Promise((resolveExit,reject)=>{
    const child=spawn(process.execPath,[cli,'test','--config',join(root,'playwright.config.mjs')],{cwd:root,env,stdio:'inherit',windowsHide:false});
    child.once('error',reject);child.once('exit',code=>resolveExit(code??1));
  });
} finally {
  if(!qaDir.startsWith(tempRoot+sep)||!qaDir.slice(tempRoot.length+1).startsWith('apex-market-playwright-'))throw new Error('Refusing to remove a path outside the isolated temporary QA directory.');
  await rm(qaDir,{recursive:true,force:true});
}
process.exitCode=exitCode;
