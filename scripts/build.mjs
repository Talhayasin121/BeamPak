import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {extname,join} from 'node:path';

const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2'};
const assets = {};
function collect(directory,prefix='') {
  for (const entry of readdirSync(directory,{withFileTypes:true})) {
    const path = join(directory,entry.name);
    if (entry.isDirectory()) collect(path,prefix+'/'+entry.name);
    else {
      const type = types[extname(entry.name)];
      if (type) assets[prefix+'/'+entry.name] = [type,readFileSync(path).toString('base64')];
    }
  }
}
collect('web');
const catalog = readFileSync('web/catalog.js','utf8').replace(/^export /gm,'');
const bundleModule = filename => readFileSync(filename,'utf8').replace(/^import .*\n/gm,'').replace(/^export /gm,'');
const activity = bundleModule('server/activity.js');
const orders = bundleModule('server/orders.js');
const worker = bundleModule('worker/index.js');
mkdirSync('dist/server',{recursive:true});
writeFileSync('dist/server/index.js', [catalog,activity,orders,worker,'export default createStore(' + JSON.stringify(assets) + ');'].join('\n'));
if (existsSync('.openai/hosting.json')) {
  mkdirSync('dist/.openai',{recursive:true});
  writeFileSync('dist/.openai/hosting.json',readFileSync('.openai/hosting.json'));
}
console.log('Built storefront with ' + Object.keys(assets).length + ' assets.');