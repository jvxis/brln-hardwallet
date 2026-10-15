// Run after webapp build. No signer, node credentials, or personal account used.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {createRequire}=require('module');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const req=createRequire(path.resolve('webapp/package.json'));
const root=req('bip32').default(req('@bitcoinerlab/secp256k1')).fromSeed(new Uint8Array(32).fill(7));
const accountPath="m/84'/0'/0'";
const account={id:'test',name:'test',xpub:root.derivePath(accountPath).neutered().toBase58(),fingerprint:Buffer.from(root.fingerprint).toString('hex'),accountPath,network:'Mainnet',type:'p2wpkh',receiveIndex:0,changeIndex:0};
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try {
 const context=await browser.newContext();const errors=[];let mode='success',queries=0;
 await context.addInitScript(a=>localStorage.setItem('bowser-wallet.accounts.v1',JSON.stringify([a])),account);
 await context.route('http://localhost:18449/**',async route=>{
  const pathname=new URL(route.request().url()).pathname;
  if(pathname==='/api/v1/status')return route.fulfill({json:{height:1,electrum_source:'club'}});
  if(pathname.startsWith('/api/v1/script/')){
   queries++;
   if(mode==='expired')return route.fulfill({status:401,body:''});
   await new Promise(r=>setTimeout(r,mode==='slow'?300:5));
   return route.fulfill({json:{history:[],utxos:[],balance:{confirmed:0,unconfirmed:0}}}).catch(()=>{});
  }
  if(pathname.startsWith('/firmware/'))return route.fulfill({status:404,body:''});
  const base=path.resolve('webapp/build'),file=path.resolve(base,'.'+(pathname==='/'?'/index.html':pathname));
  assert(file.startsWith(base+path.sep));
  if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
  return route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'application/octet-stream'});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:18449');
 const sync=page.getByRole('button',{name:'Sincronizar com Electrum selecionado'});
 const status=page.locator('main > [role=status]');
 await page.getByText('Saldo ainda não consultado.',{exact:false}).waitFor();
 await page.waitForFunction(()=>!document.querySelector('main button')?.disabled);
 await sync.click();await page.getByText('Sincronização concluída.',{exact:false}).waitFor();
 assert.equal(queries,40);assert.equal(await sync.count(),1);assert.equal(await sync.isEnabled(),true);
 assert.equal(await page.getByRole('button',{name:'Conferir endereço para receber'}).isDisabled(),true);
 mode='expired';await sync.click();await page.getByText('Entre no LightningOS neste mesmo endereço',{exact:false}).waitFor();
 assert.equal(await sync.isEnabled(),true);assert.equal(await sync.count(),1);
 mode='slow';await sync.click();await page.getByRole('button',{name:'Cancelar sincronização'}).click();
 await page.getByText('Sincronização cancelada.',{exact:false}).waitFor();
 assert.equal(await sync.isEnabled(),true);assert.equal(await sync.count(),1);
 assert.equal(await page.getByRole('button',{name:'Exportar configuração'}).isEnabled(),true);
 assert.deepEqual(errors,[]);
 console.log('PASS: disconnected discovery, 40 addresses, session expiry, cancellation, controls restored, no duplicate account or JS errors.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
