# Beampak

A responsive automotive accessories storefront with PKR pricing, a shopping bag, and checkout confirmations for the LED pod. New order placement is paused. The Cloudflare Worker stores checkout confirmations, earlier availability requests and previous orders in the DB D1 binding.

## Netlify hosting

See [Deploy Beampak on Netlify](NETLIFY.md) for the build, database and store manager setup.

## Preview locally

Use Node.js 22.13+.

    npm run build
    npm start

Open http://127.0.0.1:4173. The local preview uses a SQLite database in outputs/. To open /manage, set BEAMPAK_ADMIN_KEY to a secret of at least 20 characters before starting.

## Store manager

Open /manage to view checkout submissions, their form details, piece counts and campaign totals. The private Sites deployment accepts the signed-in store owner. The Netlify and local versions accept the configured store access key. The previous orders section supports order lookup and status updates.

## Media

The storefront includes credits for photographs by Patrik Storm and Valery Sysoev (Unsplash) and a film by Michael Pronin (Pexels). The After Dark hero scenes and installation examples are AI-generated illustrations. The kit pack shot was edited from a supplied product photo. Fonts are Inter and Barlow Condensed from Google Fonts.
