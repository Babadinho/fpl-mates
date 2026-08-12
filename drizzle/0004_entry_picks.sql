CREATE TABLE "entry_picks" (
	"entry_id" integer NOT NULL,
	"event" smallint NOT NULL,
	"element_ids" integer[] NOT NULL,
	"multipliers" smallint[] NOT NULL,
	"active_chip" text,
	"transfer_cost" smallint DEFAULT 0 NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entry_picks_entry_id_event_pk" PRIMARY KEY("entry_id","event")
);
--> statement-breakpoint
ALTER TABLE "entry_picks" ADD CONSTRAINT "entry_picks_entry_id_managers_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."managers"("entry_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_picks" ADD CONSTRAINT "entry_picks_event_gameweeks_event_fk" FOREIGN KEY ("event") REFERENCES "public"."gameweeks"("event") ON DELETE cascade ON UPDATE no action;
