import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const hashes=new Map();
export function versionMedia(source) {
  return source.replace(/\/media\/fast\/[a-zA-Z0-9_.-]+\.(?:webp|png)(?:\?v=[a-f0-9]+)?/g,value=>{
    const path=value.split('?')[0];
    if(!hashes.has(path))hashes.set(path,createHash('sha256').update(readFileSync(new URL('../web'+path,import.meta.url))).digest('hex').slice(0,12));
    return path+'?v='+hashes.get(path);
  });
}
