import {mediaAssets} from './media-assets.js';

const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
export const mediaSrcSet=key=>mediaAssets[key].variants.map(item=>item.src+' '+item.width+'w').join(', ');
export function pictureMarkup(key,{alt='',width=1536,height=1024,sizes='100vw',loading,fetchpriority,className=''}={}) {
  const attributes=Object.entries({src:mediaAssets[key].fallback,alt,width,height,loading,fetchpriority,decoding:'async',class:className||undefined})
    .filter(([,value])=>value!==undefined).map(([name,value])=>' '+name+'="'+escape(value)+'"').join('');
  return '<picture data-media="'+key+'"><source type="image/webp" srcset="'+mediaSrcSet(key)+'" sizes="'+escape(sizes)+'"><img'+attributes+'></picture>';
}
export function configurePicture(picture,key,sizes) {
  const source=picture.querySelector('source'), image=picture.querySelector('img');
  const srcset=mediaSrcSet(key);
  if(source.srcset!==srcset)source.srcset=srcset;
  if(sizes && source.sizes!==sizes)source.sizes=sizes;
  const path=mediaAssets[key].fallback;
  if(image.getAttribute('src')!==path)image.src=path;
  picture.dataset.media=key;
}
