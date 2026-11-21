import {catalog} from '../web/catalog.js';
import {handleOrders} from '../server/orders.js';

const contentSecurity = "default-src 'self'; script-src 'self' https://connect.facebook.net; style-src 'self' 'unsafe-inline'; img-src 'self' https://www.facebook.com https://connect.facebook.net; connect-src 'self' https://www.facebook.com https://connect.facebook.net; media-src https://videos.pexels.com; base-uri 'none'; form-action 'self'; object-src 'none'; frame-ancestors 'none'";
const pageRoutes = new Map([['/','/index.html'],['/manage','/manage.html']]);
for (const item of catalog) {
  if (item.page) {
    pageRoutes.set(item.page,'/product.html');
    pageRoutes.set(item.page + '/','/product.html');
  }
}
function assetResponse(path,request,assets) {
  const filePath = pageRoutes.get(path) ?? path;
  const exists = Object.hasOwn(assets,filePath);
  const file = exists ? assets[filePath] : assets['/404.html'];
  const [type, encoded] = file;
  const headers = {'Content-Type':type,'Content-Security-Policy':contentSecurity,'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':path.startsWith('/media/') ? 'public, max-age=3600' : 'no-cache'};
  return new Response(request.method === 'HEAD' ? null : Uint8Array.from(atob(encoded),character=>character.charCodeAt(0)),{status:exists ? 200 : 404,headers});
}

export function createStore(assets) {
  return {
    async fetch(request,env) {
      const path = new URL(request.url).pathname;
      if (!path.startsWith('/api/')) {
        if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed',{status:405});
        return assetResponse(path,request,assets);
      }
      const query = env.DB && (async (sql, parameters) => {
        const bindings=[];
        const statement=sql.replace(/\$(\d+)/g,(_,position)=>{bindings.push(parameters[Number(position)-1]);return '?';});
        const {results} = await env.DB.prepare(statement).bind(...bindings).all();
        return results;
      });
      const ownerEmail = env.BEAMPAK_OWNER_EMAIL?.trim().toLowerCase();
      const signedInEmail = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
      const isStoreOwner = Boolean(ownerEmail && ownerEmail === signedInEmail && request.headers.get('oai-authenticated-user-id'));
      return handleOrders(request,query,env.BEAMPAK_ADMIN_KEY,isStoreOwner);
    }
  };
}
