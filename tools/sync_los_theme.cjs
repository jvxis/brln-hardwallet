const fs=require('fs'),path=require('path');
const ui=process.argv[2]; if(!ui)throw new Error('Pass the LOS ui directory after npm run build');
const postcss=require(require.resolve('postcss',{paths:[ui]}));
const assets=path.join(ui,'dist/assets');
const file=fs.readdirSync(assets).find(n=>/^index-.*\.css$/.test(n));
const parsed=postcss.parse(fs.readFileSync(path.join(assets,file),'utf8'));
const out=postcss.root();
const wanted=s=>s===':root'||s==='html'||s==='body'||/^html\[[^ ]+$/.test(s)||/^(?:html\[[^ ]+\] )?(?:body|\.section-card|\.btn-primary|\.btn-secondary|\.input-field)(?::[^ ]+)?$/.test(s);
function select(nodes,parent){for(const node of nodes){if(node.type==='rule'){const sels=node.selectors.filter(wanted);if(sels.length)parent.append(node.clone({selector:sels.join(',')}));}else if(node.type==='atrule'&&node.name==='font-face')parent.append(node.clone());else if(node.type==='atrule'&&['media','supports'].includes(node.name)){const sub=node.clone({nodes:[]});select(node.nodes||[],sub);if(sub.nodes.length)parent.append(sub);}}}
select(parsed.nodes,out);
let css=out.toString();
const dest='webapp/static/los-theme';fs.mkdirSync(dest,{recursive:true});
css=css.replace(/\/assets\/([^"')]+\.woff2?)/g,(_,name)=>{fs.copyFileSync(path.join(assets,name),path.join(dest,name));return './'+name;});
fs.writeFileSync(path.join(dest,'theme.css'),'/* LightningOS MIT theme subset: generated from its compiled CSS. See README.md. */\n'+css);
console.log({rules:out.nodes.length,bytes:css.length});
