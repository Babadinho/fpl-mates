CREATE TABLE "league" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"start_event" smallint DEFAULT 1 NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
