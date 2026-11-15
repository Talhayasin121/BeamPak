# Deploy Beampak on Netlify

The Netlify build includes the storefront, product page and WhatsApp button. Netlify Functions handle cash-on-delivery checkout, order tracking and the protected order manager. Netlify Database stores the orders in PostgreSQL. It requires a Netlify credit-based plan.

## Deploy from Git

1. Merge the Beampak pull request into your GitHub repository’s default branch.
2. In Netlify, choose **Add new project → Import an existing project** and select that repository. Leave the base directory at the repository root.
3. Netlify reads the build settings from netlify.toml. The build command is **npm run build:netlify**, the publish directory is **dist-netlify**, and the functions directory is **netlify/functions**. Use the repository import flow so Netlify can build the functions and apply the database migration.
4. Under **Project configuration → Environment variables**, create **BEAMPAK_ADMIN_KEY** with a unique, randomly generated secret of at least 20 characters. Mark it as containing a secret. If Netlify offers scope selection, include **Functions**. Redeploy if you add it after the first deploy.
5. Publish the project. On a compatible plan, Netlify provisions the database and applies the migration from netlify/database/migrations. Open the storefront and test a cash-on-delivery order, then sign in at **/manage** with your admin key and verify you can view and update its status.

A new Netlify site's order database starts empty. Orders previously stored on the Sites version stay in its Cloudflare D1 database. Keep access to that database or arrange an order-history migration before moving existing customers to the new URL.

- [Netlify repository deployment](https://docs.netlify.com/start/quickstarts/deploy-from-repository/)
- [Netlify Database and plan requirements](https://docs.netlify.com/build/data-and-storage/netlify-database/)
- [Environment variables for Netlify Functions](https://docs.netlify.com/build/functions/environment-variables/)

## Local checks

Use Node.js 22.13 or later. Run **npm ci** and **npm run build:netlify** from the repository root to prepare the static assets. For a Netlify-style local server with functions and a local database, use **npx netlify-cli dev** and apply pending local migrations with **npx netlify-cli database migrations apply** if needed. The existing Node and SQLite preview is also available via **npm run build** and **npm start**.

[Netlify Database local development](https://docs.netlify.com/build/data-and-storage/netlify-database/local-development/)

## Store operations

- The private Sites deployment can open **/manage** using the verified owner's signed-in ChatGPT account. Netlify uses the configured **BEAMPAK_ADMIN_KEY**.
- Orders enter as **Received**. Verify the order and stock, arrange delivery, and update the status from the order manager. Customers use the order reference and mobile number to track it. Checkout is cash on delivery. Courier booking and outbound notifications are manual.
- The storefront uses the availability flags in web/catalog.js. Set the flag when stock changes. It does not reserve a physical stock count automatically.
- Confirm which accessories ship with one or more pods, actual inventory, courier coverage and delivery estimates, and the store's return and warranty terms before launching to customers. Publish those terms after the owner confirms them. The customer help page explains the site's current delivery charges, tracking, and data use.
- Run a real end-to-end test, including delivery and payment handoff, after your chosen host is connected. Keep access to order history when switching hosts.
