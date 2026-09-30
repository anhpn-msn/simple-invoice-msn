CREATE TABLE "audit_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"action" varchar(50) NOT NULL,
	"outcome" varchar(10) NOT NULL,
	"entity_type" varchar(30),
	"entity_id" varchar(64),
	"request_id" varchar(64),
	"ip" "inet",
	"user_agent" varchar(300),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "audit_events_outcome_check" CHECK ("audit_events"."outcome" IN ('SUCCESS', 'FAILURE'))
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"user_id" uuid NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"request_method" varchar(10) NOT NULL,
	"request_path" varchar(200) NOT NULL,
	"request_hash" char(64) NOT NULL,
	"response_status" smallint NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY("user_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"invoice_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"quantity" integer NOT NULL,
	"rate" numeric(19, 4) NOT NULL,
	"position" smallint DEFAULT 1 NOT NULL,
	CONSTRAINT "invoice_items_invoice_id_position_key" UNIQUE("invoice_id","position"),
	CONSTRAINT "invoice_items_quantity_check" CHECK ("invoice_items"."quantity" > 0),
	CONSTRAINT "invoice_items_rate_check" CHECK ("invoice_items"."rate" > 0),
	CONSTRAINT "invoice_items_position_check" CHECK ("invoice_items"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"invoice_number" varchar(50) NOT NULL,
	"invoice_reference" varchar(100),
	"invoice_date" date NOT NULL,
	"due_date" date NOT NULL,
	"currency" char(3) NOT NULL,
	"currency_symbol" varchar(8) NOT NULL,
	"description" varchar(1000),
	"status" varchar(10) NOT NULL,
	"customer_fullname" varchar(200) NOT NULL,
	"customer_email" varchar(254) NOT NULL,
	"customer_mobile" varchar(32),
	"customer_address" varchar(500),
	"tax_rate" numeric(5, 2) NOT NULL,
	"invoice_sub_total" numeric(19, 4) NOT NULL,
	"total_tax" numeric(19, 4) NOT NULL,
	"total_discount" numeric(19, 4) NOT NULL,
	"total_amount" numeric(19, 4) NOT NULL,
	"total_paid" numeric(19, 4) DEFAULT '0' NOT NULL,
	"balance_amount" numeric(19, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "invoices_currency_check" CHECK ("invoices"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "invoices_status_check" CHECK ("invoices"."status" IN ('Draft', 'Pending', 'Paid')),
	CONSTRAINT "invoices_tax_rate_check" CHECK ("invoices"."tax_rate" >= 0 AND "invoices"."tax_rate" <= 100),
	CONSTRAINT "invoices_invoice_sub_total_check" CHECK ("invoices"."invoice_sub_total" >= 0),
	CONSTRAINT "invoices_total_tax_check" CHECK ("invoices"."total_tax" >= 0),
	CONSTRAINT "invoices_total_discount_check" CHECK ("invoices"."total_discount" >= 0),
	CONSTRAINT "invoices_total_amount_check" CHECK ("invoices"."total_amount" >= 0),
	CONSTRAINT "invoices_total_paid_check" CHECK ("invoices"."total_paid" >= 0),
	CONSTRAINT "invoices_due_after_invoice" CHECK ("invoices"."due_date" >= "invoices"."invoice_date"),
	CONSTRAINT "invoices_discount_le_sub" CHECK ("invoices"."total_discount" <= "invoices"."invoice_sub_total"),
	CONSTRAINT "invoices_total_formula" CHECK ("invoices"."total_amount" = "invoices"."invoice_sub_total" + "invoices"."total_tax" - "invoices"."total_discount"),
	CONSTRAINT "invoices_balance_formula" CHECK ("invoices"."balance_amount" = "invoices"."total_amount" - "invoices"."total_paid"),
	CONSTRAINT "invoices_no_overpayment" CHECK ("invoices"."total_paid" <= "invoices"."total_amount"),
	CONSTRAINT "invoices_paid_is_settled" CHECK ("invoices"."status" <> 'Paid' OR "invoices"."balance_amount" = 0),
	CONSTRAINT "invoices_draft_is_unpaid" CHECK ("invoices"."status" <> 'Draft' OR "invoices"."total_paid" = 0)
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" char(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"family_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" varchar(300),
	"ip" "inet",
	CONSTRAINT "refresh_tokens_token_hash_key" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(254) NOT NULL,
	"password_hash" varchar(100) NOT NULL,
	"fullname" varchar(200) NOT NULL,
	"role" varchar(20) NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('ACCOUNTANT', 'AUDITOR')),
	CONSTRAINT "users_failed_login_count_check" CHECK ("users"."failed_login_count" >= 0),
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replaced_by_refresh_tokens_id_fk" FOREIGN KEY ("replaced_by") REFERENCES "public"."refresh_tokens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_invoice_number_ci_key" ON "invoices" USING btree (lower("invoice_number"));--> statement-breakpoint
CREATE INDEX "invoices_invoice_date_idx" ON "invoices" USING btree ("invoice_date","id");--> statement-breakpoint
CREATE INDEX "invoices_due_date_idx" ON "invoices" USING btree ("due_date","id");--> statement-breakpoint
CREATE INDEX "invoices_total_amount_idx" ON "invoices" USING btree ("total_amount","id");--> statement-breakpoint
CREATE INDEX "invoices_status_due_idx" ON "invoices" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "invoices_created_by_idx" ON "invoices" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "invoices_number_trgm_idx" ON "invoices" USING gin ("invoice_number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "invoices_customer_trgm_idx" ON "invoices" USING gin ("customer_fullname" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");