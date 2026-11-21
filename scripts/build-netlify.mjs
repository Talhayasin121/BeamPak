import {cpSync,readFileSync,writeFileSync} from 'node:fs';
import {versionMedia} from './media-version.mjs';

const directory = new URL('../dist-netlify/',import.meta.url);
cpSync(new URL('../web/',import.meta.url),directory,{recursive:true});
for(const name of ['index.html','product.html','store.css','media-assets.js']) {
  const file=new URL(name,directory);
  writeFileSync(file,versionMedia(readFileSync(file,'utf8')));
}

const pixelId = (process.env.META_PIXEL_ID || '').trim();
const verification = (process.env.META_DOMAIN_VERIFICATION || '').trim();
if (pixelId && !/^\d{5,25}$/.test(pixelId)) throw new Error('META_PIXEL_ID must be a numeric Pixel/Dataset ID.');
if (verification && !/^[a-zA-Z0-9_-]{10,128}$/.test(verification)) throw new Error('META_DOMAIN_VERIFICATION must contain the verification code only.');
const production = !process.env.CONTEXT || process.env.CONTEXT === 'production';
writeFileSync(new URL('ads-config.js',directory),'export const pixelId = ' + JSON.stringify(production ? pixelId : '') + ';\n');

const siteUrl = process.env.SITE_URL || process.env.URL;
let origin;
if (siteUrl) {
  const parsed = new URL(siteUrl);
  if (!['https:','http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('SITE_URL must be the public website origin.');
  origin = parsed.origin;
}
for (const [filename,path,image] of [
  ['index.html','/','/media/hero-civic-2025.jpg'],
  ['product.html','/products/multicolour-led-pod-kit','/media/rgb-pod-single.png']
]) {
  const file = new URL(filename,directory);
  let html = readFileSync(file,'utf8');
  const metadata = [];
  if (origin) {
    const page = origin + path;
    html = html.replace(/(<meta property="og:image" content=")[^"]+/, '$1' + origin + image);
    metadata.push('<link rel="canonical" href="' + page + '">','<meta property="og:url" content="' + page + '">');
  }
  if (verification) metadata.push('<meta name="facebook-domain-verification" content="' + verification + '">');
  html = html.replace('</head>',metadata.join('\n  ') + '\n</head>');
  writeFileSync(file,html);
}
console.log('Netlify storefront ready in dist-netlify. Meta Pixel ' + (pixelId && production ? 'configured.' : 'awaiting production configuration.'));
