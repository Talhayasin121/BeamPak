import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../web/marketing.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function','function');
function visit(choice='',pixelId='4517376515184074') {
 const calls=[],scripts=[],handlers={};
 const button={hidden:true,textContent:'',setAttribute(){}};
 const localStorage={getItem:()=>choice,setItem:(key,value)=>{choice=value;}};
 const document={querySelector:()=>({dataset:{itemPage:'rgb-pod'}}),querySelectorAll:()=>[button],createElement:tag=>{assert.equal(tag,'script');return {};},head:{append:s=>scripts.push(s)},addEventListener:(name,fn)=>{handlers[name]=fn;}};
 const window={fbq:(...args)=>calls.push(args)};
 runInNewContext(source,{pixelId,catalog:[{id:'rgb-pod',price:999}],localStorage,document,window});
 return {calls,scripts,button,toggle:()=>handlers.click({target:{closest:selector=>selector==='[data-ad-preferences]'?button:null}})};
}
test('new visitors receive one pair of view events without a prompt',()=>{
 const page=visit();
 assert.deepEqual(page.calls.filter(c=>c[0]==='track').map(c=>c[1]),['PageView','ViewContent']);
 assert.equal(page.button.textContent,'Stop ad measurement');
 page.toggle();
 assert.equal(page.calls.at(-1)[1],'revoke');
 page.toggle();
 assert.equal(page.calls.filter(c=>c[0]==='track'&&c[1]==='PageView').length,1);
});
test('saved opt-outs prevent tracking until explicitly re-enabled',()=>{
 const page=visit('decline');assert.equal(page.calls.length,0);
 assert.equal(page.button.textContent,'Enable ad measurement');
 page.toggle();assert.equal(page.calls.filter(c=>c[0]==='track').length,2);
});
test('preview builds remain disabled without displaying a prompt',()=>{
 const page=visit('','');assert.equal(page.calls.length,0);assert.equal(page.button.hidden,true);
});
