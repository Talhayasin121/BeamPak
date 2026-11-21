CREATE TABLE visitor_events (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  page TEXT NOT NULL,
  name TEXT NOT NULL,
  details TEXT NOT NULL,
  context TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX visitor_events_session ON visitor_events (session_id,occurred_at,id);
--> statement-breakpoint
CREATE INDEX visitor_events_recent ON visitor_events (received_at,occurred_at,id);
