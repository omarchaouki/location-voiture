CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp with time zone NOT NULL,
	"metadata" text,
	"plan_code" text DEFAULT 'trial' NOT NULL,
	"status" text DEFAULT 'trialing' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"city" text,
	"contact_phone" text,
	"contact_email" text,
	"locale_default" text DEFAULT 'fr' NOT NULL,
	"timezone" text DEFAULT 'Africa/Casablanca' NOT NULL,
	"internal_note" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	"impersonated_by" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"org_id" text,
	"actor_user_id" text,
	"acting_as_org_id" text,
	"impersonated" boolean DEFAULT false NOT NULL,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"before_json" text,
	"after_json" text,
	"ip_hash" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"name" text NOT NULL,
	"city" text,
	"address" text,
	"phone" text,
	"lat" text,
	"lng" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"opening_hours_json" text
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"key" text NOT NULL,
	"scope" text DEFAULT 'global' NOT NULL,
	"org_id" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "impersonation_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"session_id" text NOT NULL,
	"admin_user_id" text NOT NULL,
	"target_user_id" text NOT NULL,
	"org_id" text NOT NULL,
	"write_enabled" boolean DEFAULT false NOT NULL,
	"write_enabled_at" text,
	"reason" text,
	"expires_at" text NOT NULL,
	"ended_at" text
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"name" text NOT NULL,
	"company" text,
	"phone" text NOT NULL,
	"email" text,
	"fleet_size" text,
	"city" text,
	"message" text,
	"source" text,
	"locale" text DEFAULT 'fr' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"converted_org_id" text,
	"contacted_on" text,
	"ip_hash" text
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"number" text,
	"issued_on" text,
	"due_on" text,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"vat_rate_bp" integer DEFAULT 2000 NOT NULL,
	"vat_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"paid_at" text,
	"provider" text,
	"provider_invoice_id" text,
	"pdf_path" text
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"org_id" text,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload_json" text,
	"received_at" text NOT NULL,
	"processed_at" text,
	"result" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "plan_change_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"current_plan_code" text NOT NULL,
	"requested_plan_code" text NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" text NOT NULL,
	"decided_by" text,
	"decided_at" text,
	"decision_note" text
);
--> statement-breakpoint
CREATE TABLE "plan_features" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"plan_code" text NOT NULL,
	"feature_key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"limit_value" integer
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"code" text NOT NULL,
	"name_key" text NOT NULL,
	"monthly_cents" integer DEFAULT 0 NOT NULL,
	"yearly_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"max_vehicles" integer,
	"max_users" integer,
	"max_branches" integer,
	"trial_days" integer DEFAULT 0 NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"stripe_price_id_monthly" text,
	"stripe_price_id_yearly" text
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"plan_code" text NOT NULL,
	"status" text NOT NULL,
	"provider" text DEFAULT 'manual' NOT NULL,
	"provider_subscription_id" text,
	"interval" text DEFAULT 'monthly' NOT NULL,
	"period_start_at" text,
	"period_end_at" text,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"grace_until_at" text,
	"trial_ends_at" text
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"counter_key" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"computed_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"vehicle_id" text NOT NULL,
	"path" text NOT NULL,
	"kind" text DEFAULT 'side' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"branch_id" text,
	"plate" text NOT NULL,
	"plate_normalized" text NOT NULL,
	"vin" text,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"trim" text,
	"year" integer,
	"color" text,
	"category" text,
	"fuel" text,
	"gearbox" text,
	"seats" integer,
	"doors" integer,
	"current_km" integer DEFAULT 0 NOT NULL,
	"current_km_at" text,
	"status" text DEFAULT 'available' NOT NULL,
	"acquired_on" text,
	"acquisition_cents" integer,
	"financing" text,
	"daily_cents" integer,
	"weekly_cents" integer,
	"monthly_cents" integer,
	"deposit_cents" integer,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "customer_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"customer_id" text NOT NULL,
	"kind" text NOT NULL,
	"path" text NOT NULL,
	"expires_on" text
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"kind" text DEFAULT 'individual' NOT NULL,
	"first_name" text,
	"last_name" text,
	"company_name" text,
	"id_type" text,
	"id_number" text,
	"licence_number" text,
	"licence_issued_on" text,
	"licence_expires_on" text,
	"licence_country" text DEFAULT 'MA' NOT NULL,
	"nationality" text,
	"birth_on" text,
	"phone" text,
	"email" text,
	"address" text,
	"city" text,
	"is_blacklisted" boolean DEFAULT false NOT NULL,
	"blacklist_reason" text,
	"blacklist_at" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "condition_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"condition_report_id" text NOT NULL,
	"path" text NOT NULL,
	"zone" text
);
--> statement-breakpoint
CREATE TABLE "condition_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"contract_id" text NOT NULL,
	"phase" text NOT NULL,
	"body_damage_json" text,
	"fuel_eighths" integer,
	"km" integer,
	"cleanliness" text,
	"notes" text,
	"signed_at" text,
	"signature_path" text
);
--> statement-breakpoint
CREATE TABLE "contract_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"contract_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"method" text DEFAULT 'cash' NOT NULL,
	"received_at" text NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"reference" text NOT NULL,
	"vehicle_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"additional_driver_customer_id" text,
	"pickup_branch_id" text,
	"return_branch_id" text,
	"planned_start_at" text NOT NULL,
	"planned_end_at" text NOT NULL,
	"actual_start_at" text,
	"actual_end_at" text,
	"start_km" integer,
	"end_km" integer,
	"start_fuel_eighths" integer,
	"end_fuel_eighths" integer,
	"daily_cents" integer DEFAULT 0 NOT NULL,
	"days_billed" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"extras_cents" integer DEFAULT 0 NOT NULL,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"vat_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"deposit_cents" integer DEFAULT 0 NOT NULL,
	"deposit_method" text,
	"deposit_taken_at" text,
	"deposit_returned_at" text,
	"deposit_withheld_cents" integer DEFAULT 0 NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"status" text DEFAULT 'reservation' NOT NULL,
	"signature_path" text,
	"contract_pdf_path" text,
	"cancel_reason" text
);
--> statement-breakpoint
CREATE TABLE "insurance_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"vehicle_id" text NOT NULL,
	"company" text NOT NULL,
	"policy_number" text,
	"starts_on" text,
	"expires_on" text NOT NULL,
	"premium_cents" integer,
	"coverage" text,
	"scan_path" text,
	"is_current" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permits" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"branch_id" text,
	"vehicle_id" text,
	"kind" text NOT NULL,
	"authority" text,
	"number" text,
	"issued_on" text,
	"expires_on" text NOT NULL,
	"cost_cents" integer,
	"scan_path" text,
	"is_current" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registration_docs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"vehicle_id" text NOT NULL,
	"registration_number" text,
	"first_registered_on" text,
	"mutated_on" text,
	"is_ww" boolean DEFAULT false NOT NULL,
	"scan_path" text
);
--> statement-breakpoint
CREATE TABLE "road_taxes" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"vehicle_id" text NOT NULL,
	"year" integer NOT NULL,
	"paid_at" text,
	"amount_cents" integer,
	"receipt_number" text,
	"receipt_path" text
);
--> statement-breakpoint
CREATE TABLE "technical_inspections" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"vehicle_id" text NOT NULL,
	"center_name" text,
	"certificate_number" text,
	"performed_on" text NOT NULL,
	"expires_on" text NOT NULL,
	"result" text DEFAULT 'pass' NOT NULL,
	"cost_cents" integer,
	"scan_path" text,
	"is_current" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fines" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"vehicle_id" text NOT NULL,
	"contract_id" text,
	"offence_at" text NOT NULL,
	"location" text,
	"kind" text,
	"reference_number" text,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"received_on" text,
	"due_on" text,
	"paid_at" text,
	"paid_by" text,
	"rebilled_contract_payment_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"scan_path" text
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"vehicle_id" text NOT NULL,
	"contract_id" text,
	"kind" text NOT NULL,
	"occurred_at" text NOT NULL,
	"location" text,
	"description" text,
	"third_party_json" text,
	"police_report_number" text,
	"cost_cents" integer,
	"insurance_claim_number" text,
	"status" text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_records" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"vehicle_id" text NOT NULL,
	"schedule_id" text,
	"kind" text NOT NULL,
	"performed_on" text NOT NULL,
	"km" integer,
	"garage_name" text,
	"invoice_number" text,
	"parts_cents" integer DEFAULT 0 NOT NULL,
	"labour_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"notes" text,
	"scan_path" text
);
--> statement-breakpoint
CREATE TABLE "maintenance_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"vehicle_id" text NOT NULL,
	"kind" text NOT NULL,
	"interval_km" integer,
	"interval_months" integer,
	"last_done_on" text,
	"last_done_km" integer,
	"next_due_km" integer,
	"next_due_on" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"vehicle_id" text,
	"branch_id" text,
	"contract_id" text,
	"category" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"spent_on" text NOT NULL,
	"supplier" text,
	"reference" text,
	"note" text,
	"scan_path" text
);
--> statement-breakpoint
CREATE TABLE "revenues" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"vehicle_id" text,
	"contract_id" text,
	"category" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"received_on" text NOT NULL,
	"method" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "geofence_events" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"geofence_id" text NOT NULL,
	"vehicle_id" text NOT NULL,
	"kind" text NOT NULL,
	"occurred_at" text NOT NULL,
	"position_id" text
);
--> statement-breakpoint
CREATE TABLE "geofences" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"name" text NOT NULL,
	"kind" text DEFAULT 'circle' NOT NULL,
	"geometry_json" text NOT NULL,
	"radius_m" integer,
	"applies_to" text DEFAULT 'all' NOT NULL,
	"applies_to_value" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gps_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"vehicle_id" text,
	"provider" text DEFAULT 'mock' NOT NULL,
	"external_id" text NOT NULL,
	"imei" text,
	"sim_number" text,
	"installed_on" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_seen_at" text
);
--> statement-breakpoint
CREATE TABLE "gps_positions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"device_id" text NOT NULL,
	"recorded_at" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"speed_kmh" double precision,
	"heading" double precision,
	"ignition" boolean,
	"odometer_km" integer,
	"raw_json" text
);
--> statement-breakpoint
CREATE TABLE "vehicle_daily_km" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"vehicle_id" text NOT NULL,
	"on_day" text NOT NULL,
	"km" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'gps' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_reads" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"alert_id" text NOT NULL,
	"user_id" text NOT NULL,
	"read_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"alert_type" text NOT NULL,
	"thresholds_json" text,
	"channels_json" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"digest_hour_local" integer DEFAULT 8 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"alert_type" text NOT NULL,
	"threshold_key" text NOT NULL,
	"period_key" text NOT NULL,
	"severity" text NOT NULL,
	"due_on" text,
	"due_at" text,
	"state" text DEFAULT 'open' NOT NULL,
	"snoozed_until_at" text,
	"acknowledged_by" text,
	"resolved_at" text,
	"payload_json" text,
	"first_seen_at" text NOT NULL,
	"last_seen_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text,
	"alert_id" text,
	"channel" text NOT NULL,
	"recipient" text NOT NULL,
	"subject" text,
	"body" text,
	"locale" text DEFAULT 'fr' NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"sent_at" text,
	"error" text,
	"provider_message_id" text
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitations_org_idx" ON "invitations" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" USING btree ("email","status");--> statement-breakpoint
CREATE UNIQUE INDEX "members_org_user_unique" ON "members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "members_user_idx" ON "members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_unique" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_unique" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "audit_log_org_idx" ON "audit_log" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "branches_org_idx" ON "branches" USING btree ("org_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_flags_key_scope_unique" ON "feature_flags" USING btree ("key","org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "impersonation_sessions_session_unique" ON "impersonation_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "impersonation_admin_idx" ON "impersonation_sessions" USING btree ("admin_user_id","created_at");--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_unique" ON "invoices" USING btree ("org_id","number");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("org_id","status","due_on");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_unique" ON "payment_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_change_pending_unique" ON "plan_change_requests" USING btree ("org_id") WHERE status = 'pending' and deleted_at is null;--> statement-breakpoint
CREATE INDEX "plan_change_status_idx" ON "plan_change_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_features_unique" ON "plan_features" USING btree ("plan_code","feature_key");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_code_unique" ON "plans" USING btree ("code");--> statement-breakpoint
CREATE INDEX "subscriptions_org_idx" ON "subscriptions" USING btree ("org_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_counters_unique" ON "usage_counters" USING btree ("org_id","counter_key");--> statement-breakpoint
CREATE INDEX "vehicle_photos_vehicle_idx" ON "vehicle_photos" USING btree ("org_id","vehicle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_plate_unique" ON "vehicles" USING btree ("org_id","plate_normalized") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "vehicles_org_idx" ON "vehicles" USING btree ("org_id","deleted_at");--> statement-breakpoint
CREATE INDEX "vehicles_status_idx" ON "vehicles" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "vehicles_branch_idx" ON "vehicles" USING btree ("org_id","branch_id");--> statement-breakpoint
CREATE INDEX "customer_documents_customer_idx" ON "customer_documents" USING btree ("org_id","customer_id");--> statement-breakpoint
CREATE INDEX "customers_org_idx" ON "customers" USING btree ("org_id","deleted_at");--> statement-breakpoint
CREATE INDEX "customers_licence_idx" ON "customers" USING btree ("org_id","licence_expires_on");--> statement-breakpoint
CREATE INDEX "customers_search_idx" ON "customers" USING btree ("org_id","last_name");--> statement-breakpoint
CREATE INDEX "condition_photos_report_idx" ON "condition_photos" USING btree ("org_id","condition_report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "condition_reports_unique" ON "condition_reports" USING btree ("org_id","contract_id","phase") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "contract_payments_contract_idx" ON "contract_payments" USING btree ("org_id","contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_reference_unique" ON "contracts" USING btree ("org_id","reference") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "contracts_vehicle_period_idx" ON "contracts" USING btree ("org_id","vehicle_id","planned_start_at","planned_end_at");--> statement-breakpoint
CREATE INDEX "contracts_status_end_idx" ON "contracts" USING btree ("org_id","status","planned_end_at");--> statement-breakpoint
CREATE INDEX "contracts_customer_idx" ON "contracts" USING btree ("org_id","customer_id");--> statement-breakpoint
CREATE INDEX "insurance_expiry_idx" ON "insurance_policies" USING btree ("org_id","is_current","expires_on");--> statement-breakpoint
CREATE INDEX "insurance_vehicle_idx" ON "insurance_policies" USING btree ("org_id","vehicle_id");--> statement-breakpoint
CREATE INDEX "permits_expiry_idx" ON "permits" USING btree ("org_id","is_current","expires_on");--> statement-breakpoint
CREATE INDEX "registration_vehicle_idx" ON "registration_docs" USING btree ("org_id","vehicle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "road_taxes_unique" ON "road_taxes" USING btree ("org_id","vehicle_id","year") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "road_taxes_year_idx" ON "road_taxes" USING btree ("org_id","year","paid_at");--> statement-breakpoint
CREATE INDEX "inspection_expiry_idx" ON "technical_inspections" USING btree ("org_id","is_current","expires_on");--> statement-breakpoint
CREATE INDEX "inspection_vehicle_idx" ON "technical_inspections" USING btree ("org_id","vehicle_id");--> statement-breakpoint
CREATE INDEX "fines_vehicle_time_idx" ON "fines" USING btree ("org_id","vehicle_id","offence_at");--> statement-breakpoint
CREATE INDEX "fines_status_idx" ON "fines" USING btree ("org_id","status","due_on");--> statement-breakpoint
CREATE INDEX "incidents_vehicle_idx" ON "incidents" USING btree ("org_id","vehicle_id");--> statement-breakpoint
CREATE INDEX "incidents_status_idx" ON "incidents" USING btree ("org_id","status","occurred_at");--> statement-breakpoint
CREATE INDEX "maintenance_records_vehicle_idx" ON "maintenance_records" USING btree ("org_id","vehicle_id");--> statement-breakpoint
CREATE INDEX "maintenance_due_idx" ON "maintenance_schedules" USING btree ("org_id","is_active","next_due_on");--> statement-breakpoint
CREATE INDEX "maintenance_vehicle_idx" ON "maintenance_schedules" USING btree ("org_id","vehicle_id");--> statement-breakpoint
CREATE INDEX "expenses_vehicle_idx" ON "expenses" USING btree ("org_id","vehicle_id","spent_on");--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("org_id","category","spent_on");--> statement-breakpoint
CREATE INDEX "revenues_vehicle_idx" ON "revenues" USING btree ("org_id","vehicle_id","received_on");--> statement-breakpoint
CREATE INDEX "revenues_category_idx" ON "revenues" USING btree ("org_id","category","received_on");--> statement-breakpoint
CREATE INDEX "geofence_events_idx" ON "geofence_events" USING btree ("org_id","vehicle_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "geofence_events_unique" ON "geofence_events" USING btree ("org_id","geofence_id","vehicle_id","occurred_at");--> statement-breakpoint
CREATE INDEX "geofences_org_idx" ON "geofences" USING btree ("org_id","is_active");--> statement-breakpoint
CREATE INDEX "gps_devices_org_idx" ON "gps_devices" USING btree ("org_id","is_active");--> statement-breakpoint
CREATE INDEX "gps_devices_vehicle_idx" ON "gps_devices" USING btree ("org_id","vehicle_id");--> statement-breakpoint
CREATE INDEX "gps_positions_device_time_idx" ON "gps_positions" USING btree ("org_id","device_id","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "gps_positions_unique" ON "gps_positions" USING btree ("org_id","device_id","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_daily_km_unique" ON "vehicle_daily_km" USING btree ("org_id","vehicle_id","on_day");--> statement-breakpoint
CREATE INDEX "vehicle_daily_km_idx" ON "vehicle_daily_km" USING btree ("org_id","vehicle_id","on_day");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_reads_unique" ON "alert_reads" USING btree ("org_id","alert_id","user_id") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "alert_reads_user_idx" ON "alert_reads" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_settings_unique" ON "alert_settings" USING btree ("org_id","alert_type");--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_identity_unique" ON "alerts" USING btree ("org_id","entity_type","entity_id","alert_type","threshold_key","period_key") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "alerts_inbox_idx" ON "alerts" USING btree ("org_id","state","severity","due_on");--> statement-breakpoint
CREATE INDEX "alerts_entity_idx" ON "alerts" USING btree ("org_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "notifications_state_idx" ON "notifications" USING btree ("org_id","state","created_at");--> statement-breakpoint
CREATE INDEX "notifications_alert_idx" ON "notifications" USING btree ("org_id","alert_id");