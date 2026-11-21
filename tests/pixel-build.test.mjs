import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

const root=fileURLToPath(new URL('../',import.meta.url));
const build=fileURLToPath(new URL('../scripts/build-netlify.mjs',import.meta.url));
function configFor(context,override='') {
  execFileSync(process.execPath,[build],{cwd:root,env:{...process.env,CONTEXT:context,META_PIXEL_ID:override},stdio:'pipe'});
  return readFileSync(new URL('../dist-netlify/ads-config.js',import.meta.url),'utf8');
}
test('production uses the configured Pixel, while deploy previews send no Pixel events',()=>{
  assert.equal(configFor('production'),'export const pixelId = "4517376515184074";\n');
  assert.equal(configFor('deploy-preview'),'export const pixelId = "";\n');
  assert.equal(configFor('branch-deploy','1234567890123456'),'export const pixelId = "";\n');
  assert.match(readFileSync(new URL('../web/ads-config.js',import.meta.url),'utf8'),/pixelId = ''/);
});
test('a valid build override works and an invalid override fails before publication',()=>{
  assert.equal(configFor('production','1234567890123456'),'export const pixelId = "1234567890123456";\n');
  assert.throws(()=>configFor('production','invalid-pixel-id'));
});
