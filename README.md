# Beampak

A responsive automotive accessories storefront with a PKR sample catalog, a browser-persisted cart, cash-on-delivery checkout, and order tracking. The storefront and order management are served by a Cloudflare Worker. Orders are stored in the DB D1 binding. The sample prices and product photography should be replaced with verified stock and product details before opening the store to customers.

## Netlify hosting

See [Deploy Beampak on Netlify](NETLIFY.md) for the build, database and order-manager setup.

## Preview locally

Use Node.js 22.13+.

    npm run build
    npm start

Open http://127.0.0.1:4173. Local checkout uses a separate SQLite database in outputs/. To try the order-management page at /manage, set BEAMPAK_ADMIN_KEY in the shell before starting. Use a secret of at least 20 characters. For hosting, configure the same variable name as a secret in Sites.

## Managing orders

Open /manage and sign in with the store access key. The page lists the most recent 100 orders and can find any order by reference. Update the status as you confirm, ship or deliver an order. Customers use their order reference and checkout mobile number to see its latest status.

Cash-on-delivery requests are stored for manual fulfillment. The storefront does not charge cards, book a courier or send order messages.

## Media

The storefront includes credits for photographs by Patrik Storm and Valery Sysoev (Unsplash) and a film by Michael Pronin (Pexels). The primary hero and product pack shots are illustrative images generated for this project. Fonts are Inter and Barlow Condensed from Google Fonts.