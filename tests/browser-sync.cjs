// Run after webapp build. No signer, node credentials, or personal account used.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {createRequire}=require('module');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const req=createRequire(path.resolve('webapp/package.json'));
const root=req('bip32').default(req('@bitcoinerlab/secp256k1')).fromSeed(new Uint8Array(32).fill(7));
const accountPath="m/84'/0'/0'";
const account={id:'test',name:'test',xpub:root.derivePath(accountPath).neutered().toBase58(),fingerprint:Buffer.from(root.fingerprint).toString('hex'),accountPath,network:'Mainnet',type:'p2wpkh',receiveIndex:0,changeIndex:0};
const btc=req('bitcoinjs-lib');
const fundedScript=btc.payments.p2wpkh({pubkey:root.derivePath(accountPath+'/0/0').publicKey}).output;
const fundedHash=require('node:crypto').createHash('sha256').update(fundedScript).digest().reverse().toString('hex');
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
   if(mode==='funded' && pathname.endsWith(fundedHash))return route.fulfill({json:{history:[{tx_hash:'a'.repeat(64),height:1}],utxos:[{tx_hash:'a'.repeat(64),tx_pos:0,value:100000,height:1}],balance:{confirmed:100000,unconfirmed:0}}});
   await new Promise(r=>setTimeout(r,mode==='slow'?300:5));
   return route.fulfill({json:{history:[],utxos:[],balance:{confirmed:0,unconfirmed:0}}}).catch(()=>{});
  }
  if(pathname.startsWith('/firmware/'))return route.fulfill({status:404,body:''});
  const base=path.resolve(process.env.WEB_ROOT || 'webapp/build'),file=path.resolve(base,'.'+(pathname==='/'?'/index.html':pathname));
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
 await page.getByText('Sincronização concluída.',{exact:false}).waitFor();
 assert.equal(queries,40);assert.equal(await sync.count(),1);assert.equal(await sync.isEnabled(),true);
 assert.equal(await page.getByRole('button',{name:'Conferir endereço para receber'}).isDisabled(),true);
 await page.getByRole('button',{name:'Histórico',exact:true}).click();
 await page.getByText('Nenhuma transação encontrada nesta conta.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Enviar',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Preparar transação',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'Receber',exact:true}).click();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('brln-wallet-summary.v1')));
 assert.equal(saved.balance,0);assert(saved.updatedAt>0);assert.equal(saved.utxos,undefined);
 mode='slow';await page.reload();
 await page.getByText('Atualizado há menos de 1 minuto',{exact:false}).waitFor();
 await page.getByText('Atualizando em segundo plano.',{exact:false}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Conectar por USB',exact:true}).isEnabled(),true);
 await page.getByRole('button',{name:'Enviar',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Preparar transação',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'Cancelar sincronização'}).click();
 await page.getByText('Sincronização cancelada.',{exact:false}).waitFor();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('brln-wallet-summary.v1')).updatedAt),saved.updatedAt);
 await page.getByRole('button',{name:'Receber',exact:true}).click();
 mode='expired';await sync.click();await page.getByText('Entre no LightningOS neste mesmo endereço',{exact:false}).waitFor();
 assert.equal(await sync.isEnabled(),true);assert.equal(await sync.count(),1);
 mode='slow';await sync.click();await page.getByRole('button',{name:'Cancelar sincronização'}).click();
 await page.getByText('Sincronização cancelada.',{exact:false}).waitFor();
 assert.equal(await sync.isEnabled(),true);assert.equal(await sync.count(),1);
 await page.getByText('Conta pública e backup',{exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Exportar configuração'}).isEnabled(),true);
 mode='funded';await sync.click();await page.getByText('Sincronização concluída.',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Enviar',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Preparar transação',exact:true}).isEnabled(),true);
 const beforePrepare=queries;mode='success';
 await page.getByRole('button',{name:'Preparar transação',exact:true}).click();
 await page.getByText('Os fundos selecionados mudaram.',{exact:false}).waitFor();
 assert(queries>beforePrepare,'Preparing must query Electrum again');
 assert.equal(await page.getByText('Proposta congelada',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: automatic disconnected discovery, cached reload/age, nonblocking signer controls, display-only cache, session expiry, cancellation preserving snapshot, tabs, no JS errors.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
