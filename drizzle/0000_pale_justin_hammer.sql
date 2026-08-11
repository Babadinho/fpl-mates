CREATE TABLE "gameweeks" (
	"event" smallint PRIMARY KEY NOT NULL,
	"deadline_time" timestamp with time zone NOT NULL,
	"month_key" text NOT NULL,
	"finished" boolean DEFAULT false NOT NULL,
	"data_checked" boolean DEFAULT false NOT NULL,
	"average_entry_score" smallint,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "gw_scores" (
	"entry_id" integer NOT NULL,
	"event" smallint NOT NULL,
	"gross_points" smallint NOT NULL,
	"transfer_cost" smallint DEFAULT 0 NOT NULL,
	"net_points" smallint NOT NULL,
	"points_on_bench" smallint DEFAULT 0 NOT NULL,
	"overall_rank" integer,
	"chip_used" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gw_scores_entry_id_event_pk" PRIMARY KEY("entry_id","event")
);
--> statement-breakpoint
CREATE TABLE "managers" (
	"entry_id" integer PRIMARY KEY NOT NULL,
	"entry_name" text NOT NULL,
	"player_name" text NOT NULL,
	"joined_gw" smallint NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_winners" (
	"month_key" text PRIMARY KEY NOT NULL,
	"entry_id" integer NOT NULL,
	"total_net_points" integer NOT NULL,
	"gameweek_count" smallint NOT NULL,
	"tied_with" integer[] DEFAULT '{}' NOT NULL,
	"decided_by" text,
	"declared_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "poll_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"outcome" text,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "weekly_winners" (
	"event" smallint PRIMARY KEY NOT NULL,
	"entry_id" integer NOT NULL,
	"net_points" smallint NOT NULL,
	"tied_with" integer[] DEFAULT '{}' NOT NULL,
	"decided_by" text,
	"declared_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gw_scores" ADD CONSTRAINT "gw_scores_entry_id_managers_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."managers"("entry_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gw_scores" ADD CONSTRAINT "gw_scores_event_gameweeks_event_fk" FOREIGN KEY ("event") REFERENCES "public"."gameweeks"("event") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_winners" ADD CONSTRAINT "monthly_winners_entry_id_managers_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."managers"("entry_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_winners" ADD CONSTRAINT "weekly_winners_event_gameweeks_event_fk" FOREIGN KEY ("event") REFERENCES "public"."gameweeks"("event") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_winners" ADD CONSTRAINT "weekly_winners_entry_id_managers_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."managers"("entry_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gameweeks_month_key_idx" ON "gameweeks" USING btree ("month_key");--> statement-breakpoint
CREATE INDEX "gw_scores_event_idx" ON "gw_scores" USING btree ("event");