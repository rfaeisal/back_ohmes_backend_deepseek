CREATE TYPE "public"."tsg_type" AS ENUM('REGULER', 'MILD', 'PUTIHAN');--> statement-breakpoint
ALTER TABLE "tsg_inventory" ADD COLUMN "tsg_type" "tsg_type" DEFAULT 'REGULER' NOT NULL;--> statement-breakpoint
ALTER TABLE "tsg_receiving_box" ADD COLUMN "tsg_type" "tsg_type" DEFAULT 'REGULER' NOT NULL;