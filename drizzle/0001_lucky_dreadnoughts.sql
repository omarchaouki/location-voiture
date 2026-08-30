CREATE TABLE "contract_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"name" text NOT NULL,
	"locale" text DEFAULT 'fr' NOT NULL,
	"blocks_json" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "photo_path" text;--> statement-breakpoint
CREATE UNIQUE INDEX "contract_templates_default_unique" ON "contract_templates" USING btree ("org_id") WHERE is_default and deleted_at is null;--> statement-breakpoint
CREATE INDEX "contract_templates_org_idx" ON "contract_templates" USING btree ("org_id","deleted_at");