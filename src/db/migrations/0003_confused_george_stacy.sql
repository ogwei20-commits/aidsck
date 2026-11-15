ALTER TABLE "finance_scenarios" ADD COLUMN "cost_currency" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_scenarios" ADD COLUMN "fx_rate" numeric(18, 8) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_scenarios" ADD COLUMN "fx_as_of" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "finance_scenarios" ADD COLUMN "fx_source" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "extract_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "extract_error" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "extracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "char_count" integer DEFAULT 0 NOT NULL;