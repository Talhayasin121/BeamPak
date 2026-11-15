import {cpSync} from 'node:fs';

cpSync(new URL('../web/', import.meta.url), new URL('../dist-netlify/', import.meta.url), {
  recursive: true
});
console.log('Netlify storefront ready in dist-netlify.');
