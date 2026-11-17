# Deploy Beampak on Netlify

The Netlify build includes the storefront, product page and WhatsApp button. Netlify Functions save availability requests and provide previous order tracking and a protected store manager. Netlify Database stores requests and previous orders in PostgreSQL. It requires a Netlify credit-based plan.

## Deploy from Git

1. Merge the Beampak pull request into your GitHub repository’s default branch.
2. In Netlify, choose **Add new project → Import an existing project** and select that repository. Leave the base directory at the repository root.
3. Netlify reads the build settings from netlify.toml. The build command is **npm run build:netlify**, the publish directory is **dist-netlify**, and the functions directory is **netlify/functions**. Use the repository import flow so Netlify can build the functions and apply the database migration.
4. Under **Project configuration → Environment variables**, create **BEAMPAK_ADMIN_KEY** with a unique, randomly generated secret of at least 20 characters. Mark it as containing a secret. If Netlify offers scope selection, include **Functions**. Redeploy if you add it after the first deploy.
5. Publish the project. On a compatible plan, Netlify provisions the database and applies the migrations from netlify/database/migrations. Submit a request on a deploy preview, then sign in at **/manage** with your admin key and verify the saved quantity. Keep test traffic out of your production campaign totals.

A new Netlify database starts empty. Requests and previous orders stored on Sites stay in its Cloudflare D1 database. Keep access to that history when switching hosts.

- [Netlify repository deployment](https://docs.netlify.com/start/quickstarts/deploy-from-repository/)
- [Netlify Database and plan requirements](https://docs.netlify.com/build/data-and-storage/netlify-database/)
- [Environment variables for Netlify Functions](https://docs.netlify.com/build/functions/environment-variables/)

## Local checks

Use Node.js 22.13 or later. Run **npm ci** and **npm run build:netlify** from the repository root to prepare the static assets. For a Netlify-style local server with functions and a local database, use **npx netlify-cli dev** and apply pending local migrations with **npx netlify-cli database migrations apply** if needed. The existing Node and SQLite preview is also available via **npm run build** and **npm start**.

[Netlify Database local development](https://docs.netlify.com/build/data-and-storage/netlify-database/local-development/)

## Store operations

- Open **/manage** using the signed-in store owner account on the private Sites deployment or the configured **BEAMPAK_ADMIN_KEY** on Netlify.
- Availability requests and piece counts appear above previous orders. A repeat request from the same browser for the same product updates the quantity and keeps the original campaign labels.
- Add **utm_source**, **utm_medium** and **utm_campaign** to ad links to see submitted requests by campaign in the manager. Requests without those labels appear as untagged.
- New orders are paused. Shoppers can choose a quantity and submit a request without payment or shipping details. Previous order tracking and status updates remain available.
