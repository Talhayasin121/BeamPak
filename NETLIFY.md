# Deploy Beampak on Netlify

The Netlify build includes the storefront, product page and WhatsApp button. Netlify Functions save checkout confirmations and provide previous order tracking and a protected store manager. Netlify Database stores confirmations and previous orders in PostgreSQL. It requires a Netlify credit-based plan.

## Deploy from Git

1. In Netlify, choose **Add new project → Import an existing project**, connect GitHub and select **Talhayasin121/BeamPak**.
2. Select **main** as the production branch and leave the base directory at the repository root.
3. Netlify reads the build settings from netlify.toml. The build command is **npm run build:netlify**, the publish directory is **dist-netlify**, and the functions directory is **netlify/functions**. Use the repository import flow so Netlify can build the functions and apply the database migrations.
4. Under **Project configuration → Environment variables**, create **BEAMPAK_ADMIN_KEY** with a unique, randomly generated secret of at least 20 characters. Mark it as containing a secret. If Netlify offers scope selection, include **Functions**. Redeploy if you add it after the first deploy.
5. Publish the project. On a compatible plan, Netlify provisions the database and applies the migrations from netlify/database/migrations. Confirm checkout on a deploy preview, then sign in at **/manage** with your admin key and verify the saved quantity and form details. Keep test traffic out of your production campaign totals.

A new Netlify database starts empty. Checkout records and previous orders stored on Sites stay in its Cloudflare D1 database. Keep access to that history when switching hosts.

- [Netlify repository deployment](https://docs.netlify.com/start/quickstarts/deploy-from-repository/)
- [Netlify Database and plan requirements](https://docs.netlify.com/build/data-and-storage/netlify-database/)
- [Environment variables for Netlify Functions](https://docs.netlify.com/build/functions/environment-variables/)

## Local checks

Use Node.js 22.13 or later. Run **npm ci** and **npm run build:netlify** from the repository root to prepare the static assets. For a Netlify-style local server with functions and a local database, use **npx netlify-cli dev** and apply pending local migrations with **npx netlify-cli database migrations apply** if needed. The existing Node and SQLite preview is also available via **npm run build** and **npm start**.

[Netlify Database local development](https://docs.netlify.com/build/data-and-storage/netlify-database/local-development/)

## Store operations

- Open **/manage** using the signed-in store owner account on the private Sites deployment or the configured **BEAMPAK_ADMIN_KEY** on Netlify.
- Checkout confirmations, piece counts and submitted details appear above previous orders. The first confirmation per product is kept for each browser or supplied mobile number.
- Add **utm_source**, **utm_medium** and **utm_campaign** to ad links to see checkout confirmations by campaign in the manager. Confirmations without those labels appear as untagged.
- New orders are paused. Shoppers choose a quantity, enter their name, street address and email, and confirm at checkout. A mobile number is optional and no payments are collected. Previous order tracking and status updates remain available.

## Meta ads setup

The product landing page is **/products/multicolour-led-pod-kit**. Add **META_PIXEL_ID** in Netlify environment variables with your numeric Pixel/Dataset ID, include the Builds scope, and redeploy. Production builds enable the pixel. Deploy previews disable it. The public Pixel ID is written into the storefront configuration.

Optional build variables are **META_DOMAIN_VERIFICATION**, containing only the verification code from Meta Business Settings, and **SITE_URL**, containing your public website origin. Netlify’s **URL** supplies the default origin for canonical and social preview URLs. Verify a custom domain in Meta when you use one.

The pixel loads after the visitor allows ad measurement. Events are **PageView**, **ViewContent**, **AddToCart**, **InitiateCheckout**, **Lead** after a newly saved confirmation, and **Contact** for WhatsApp clicks. Lead reporting counts buying interest. Values for product and checkout events use PKR. Checkout form fields are kept out of the event payloads. Automatic pixel events are disabled by this implementation. Keep Automatic Advanced Matching and the Event Setup Tool’s automatic events disabled in Events Manager for this setup.

In Meta Events Manager, open **Test Events**, visit the public product URL, allow measurement and complete one test confirmation. Confirm that the events arrive in order and that a repeated confirmation adds no new Lead. A declined measurement choice or an ad blocker can prevent Meta reporting. The admin portal keeps saved first-party confirmations.

Use this URL-parameter template in the ad’s tracking settings.

    utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}

The admin portal shows these labels alongside confirmation counts. Numeric IDs preserve attribution when names change. Campaign tags survive navigation from the home page to the product page in the same browser session.

Before spending on ads, confirm that the Netlify deployment is public, the database accepts submissions, the admin portal lists the test, and Meta Test Events receives the configured events. The development Sites URL is private. Meta account configuration, domain verification and campaign publication take place in your Meta account.

- [Meta Pixel standard events](https://developers.facebook.com/documentation/meta-pixel/reference)
- [Meta conversion tracking](https://developers.facebook.com/documentation/meta-pixel/implementation/conversion-tracking)

## Visitor activity

Sign in at **/manage** and open **Visitor activity**. Choose a reporting period, refresh the visit list, and select a visit to read its timeline. Older visits and long timelines can be paged through.

The store records anonymous browser/tab identifiers, public page paths, device category, referrer hostname, campaign labels and structured shopping actions. Logs cover page/product views, gallery and FAQ interactions, scroll depth, visible page time, bag edits, checkout starts/errors, saved confirmations and WhatsApp clicks. Checkout contact details remain in the protected confirmation records.

Events are batched in groups of up to eight and retried using the same event IDs. Navigation uses a beacon and the next page retries pending IDs. A visit follows a browser tab and the random browser identifier is stored locally. The report starts collecting after deployment. Disabled JavaScript, browser blockers, cleared browser storage and network failures can affect coverage and browser counts.

Visitor activity uses the host’s database and function resources. The dashboard refreshes on request and provides 24-hour, 7-day, 30-day and all-time views. The separate Meta Pixel still depends on its configured ID and the visitor’s ad-measurement choice.

## Searchable tables and CSV exports

The database manager at **/manage** provides searchable customer submissions and visit tables. Use **Apply filters** to search all matching records in the database, and **Clear** to restore the default view. Submission searches cover the customer name, email, phone, address, campaign and record ID. Visits can be filtered by browser/visit ID, period, device, stage and source.

Use **View record** to read all saved customer and campaign fields. **Export CSV** includes every matching submission or visit across all result pages. **Export visit CSV** downloads every recorded event for the selected visit. CSV timestamps are UTC. Fields that can be interpreted as spreadsheet formulas are prefixed with an apostrophe in exports.

Visit pagination and exports use a report timestamp so activity arriving during the export is included on the next refresh. Locking the manager cancels pending exports and clears the loaded records from the interface. The manager uses the existing database and store access key.
