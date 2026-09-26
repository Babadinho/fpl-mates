-- Key every scored row by season as well as gameweek.
--
-- Written by hand around drizzle-kit's output: it adds NOT NULL columns with
-- no default, rebuilds primary keys before the column exists, and cannot name
-- the old ones. Constraint names below are the ones it generated, so the
-- database ends up matching its snapshot.
--
-- The season is read off the stored opening deadline rather than written in,
-- so a database that first migrates next August stamps its rows correctly.
-- On an empty database every backfill touches nothing and NOT NULL holds.

CREATE TABLE "manager_seasons" (
	"season" smallint NOT NULL,
	"entry_id" integer NOT NULL,
	"joined_gw" smallint NOT NULL,
	CONSTRAINT "manager_seasons_season_entry_id_pk" PRIMARY KEY("season","entry_id")
);
--> statement-breakpoint
ALTER TABLE "manager_seasons" ADD CONSTRAINT "manager_seasons_entry_id_managers_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."managers"("entry_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- gameweeks: the season comes from Gameweek 1's deadline, always in August.
ALTER TABLE "gameweeks" ADD COLUMN "season" smallint;
--> statement-breakpoint
UPDATE "gameweeks" SET "season" = EXTRACT(YEAR FROM (SELECT MIN("deadline_time") FROM "gameweeks") AT TIME ZONE 'UTC')::smallint;
--> statement-breakpoint
ALTER TABLE "gameweeks" ALTER COLUMN "season" SET NOT NULL;
--> statement-breakpoint

-- Nothing may reference gameweeks(event) while its key is replaced.
ALTER TABLE "entry_picks" DROP CONSTRAINT "entry_picks_event_gameweeks_event_fk";
--> statement-breakpoint
ALTER TABLE "gw_scores" DROP CONSTRAINT "gw_scores_event_gameweeks_event_fk";
--> statement-breakpoint
ALTER TABLE "weekly_winners" DROP CONSTRAINT "weekly_winners_event_gameweeks_event_fk";
--> statement-breakpoint
ALTER TABLE "gameweeks" DROP CONSTRAINT "gameweeks_pkey";
--> statement-breakpoint
ALTER TABLE "gameweeks" ADD CONSTRAINT "gameweeks_season_event_pk" PRIMARY KEY("season","event");
--> statement-breakpoint

-- The dependents all belong to the one season stored so far.
ALTER TABLE "gw_scores" ADD COLUMN "season" smallint;
--> statement-breakpoint
UPDATE "gw_scores" SET "season" = (SELECT MIN("season") FROM "gameweeks");
--> statement-breakpoint
ALTER TABLE "gw_scores" ALTER COLUMN "season" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "gw_scores" DROP CONSTRAINT "gw_scores_entry_id_event_pk";
--> statement-breakpoint
ALTER TABLE "gw_scores" ADD CONSTRAINT "gw_scores_season_entry_id_event_pk" PRIMARY KEY("season","entry_id","event");
--> statement-breakpoint
ALTER TABLE "gw_scores" ADD CONSTRAINT "gw_scores_season_event_fk" FOREIGN KEY ("season","event") REFERENCES "public"."gameweeks"("season","event") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
DROP INDEX "gw_scores_event_idx";
--> statement-breakpoint
CREATE INDEX "gw_scores_season_event_idx" ON "gw_scores" USING btree ("season","event");
--> statement-breakpoint

ALTER TABLE "weekly_winners" ADD COLUMN "season" smallint;
--> statement-breakpoint
UPDATE "weekly_winners" SET "season" = (SELECT MIN("season") FROM "gameweeks");
--> statement-breakpoint
ALTER TABLE "weekly_winners" ALTER COLUMN "season" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "weekly_winners" DROP CONSTRAINT "weekly_winners_pkey";
--> statement-breakpoint
ALTER TABLE "weekly_winners" ADD CONSTRAINT "weekly_winners_season_event_pk" PRIMARY KEY("season","event");
--> statement-breakpoint
ALTER TABLE "weekly_winners" ADD CONSTRAINT "weekly_winners_season_event_fk" FOREIGN KEY ("season","event") REFERENCES "public"."gameweeks"("season","event") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "entry_picks" ADD COLUMN "season" smallint;
--> statement-breakpoint
UPDATE "entry_picks" SET "season" = (SELECT MIN("season") FROM "gameweeks");
--> statement-breakpoint
ALTER TABLE "entry_picks" ALTER COLUMN "season" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "entry_picks" DROP CONSTRAINT "entry_picks_entry_id_event_pk";
--> statement-breakpoint
ALTER TABLE "entry_picks" ADD CONSTRAINT "entry_picks_season_entry_id_event_pk" PRIMARY KEY("season","entry_id","event");
--> statement-breakpoint
ALTER TABLE "entry_picks" ADD CONSTRAINT "entry_picks_season_event_fk" FOREIGN KEY ("season","event") REFERENCES "public"."gameweeks"("season","event") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- joined_gw moves to the season it belongs to, then leaves the identity row.
INSERT INTO "manager_seasons" ("season", "entry_id", "joined_gw")
	SELECT (SELECT MIN("season") FROM "gameweeks"), "entry_id", "joined_gw"
	FROM "managers"
	WHERE EXISTS (SELECT 1 FROM "gameweeks");
--> statement-breakpoint
ALTER TABLE "managers" DROP COLUMN "joined_gw";
