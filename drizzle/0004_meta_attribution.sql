ALTER TABLE order_confirmations ADD COLUMN content TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE order_confirmations ADD COLUMN term TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE order_confirmations ADD COLUMN campaign_id TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE order_confirmations ADD COLUMN adset_id TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE order_confirmations ADD COLUMN ad_id TEXT NOT NULL DEFAULT '';
