ALTER TABLE "gw_scores" RENAME COLUMN "net_points" TO "points";--> statement-breakpoint
ALTER TABLE "weekly_winners" RENAME COLUMN "net_points" TO "points";--> statement-breakpoint
ALTER TABLE "monthly_winners" RENAME COLUMN "total_net_points" TO "total_points";
