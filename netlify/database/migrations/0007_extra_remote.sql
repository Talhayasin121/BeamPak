ALTER TABLE order_confirmations ADD COLUMN extra_remote_quantity INTEGER NOT NULL DEFAULT 0 CHECK (extra_remote_quantity IN (0, 1));
ALTER TABLE order_confirmations ADD COLUMN extra_remote_unit_price INTEGER NOT NULL DEFAULT 100 CHECK (extra_remote_unit_price >= 0);
