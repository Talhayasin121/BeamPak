ALTER TABLE order_confirmations ADD COLUMN contact_key TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX order_confirmations_contact_key ON order_confirmations (product_id, contact_key);
