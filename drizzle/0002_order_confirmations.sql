CREATE TABLE order_confirmations (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  phone TEXT,
  source TEXT NOT NULL,
  medium TEXT NOT NULL,
  campaign TEXT NOT NULL,
  confirmed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (product_id, visitor_id),
  UNIQUE (product_id, phone)
);
--> statement-breakpoint
CREATE INDEX order_confirmations_recent ON order_confirmations (confirmed_at DESC, id DESC);
