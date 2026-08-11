CREATE TYPE "public"."qr_type" AS ENUM('MACHINE', 'TSG_BOX', 'BATCH', 'PACK');--> statement-breakpoint
CREATE TYPE "public"."dispatch_doc_type" AS ENUM('SURAT_JALAN', 'INVOICE');--> statement-breakpoint
CREATE TYPE "public"."dispatch_status" AS ENUM('DRAFT', 'DISPATCHED', 'DELIVERED');--> statement-breakpoint
CREATE TYPE "public"."device_type" AS ENUM('MOBILE', 'WEB');--> statement-breakpoint
CREATE TYPE "public"."carton_status" AS ENUM('OPEN', 'READY', 'DISPATCHED');--> statement-breakpoint
CREATE TYPE "public"."downtime_category" AS ENUM('GANTI_MATERIAL', 'KENDALA_MESIN', 'TUNGGU_BAHAN', 'ISTIRAHAT_IZIN', 'MAINTENANCE');--> statement-breakpoint
CREATE TYPE "public"."settlement_status" AS ENUM('PENDING', 'LUNAS');--> statement-breakpoint
CREATE TYPE "public"."shift_status" AS ENUM('RUNNING', 'COMPLETED', 'APPROVED');--> statement-breakpoint
CREATE TYPE "public"."tsg_inventory_status" AS ENUM('AVAILABLE', 'ALLOCATED', 'USED', 'WRITTEN_OFF');--> statement-breakpoint
CREATE TYPE "public"."waste_category" AS ENUM('MENIR', 'RIJEKAN', 'DEBU_KASAR', 'DEBU_HALUS');--> statement-breakpoint
CREATE TYPE "public"."machine_type" AS ENUM('MAKER', 'HLP');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"scope_type" text,
	"scope_id" uuid,
	"action" text NOT NULL,
	"entity_table" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"is_privileged" boolean DEFAULT false NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "idempotency_key_user_id_key_unique" UNIQUE("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "qr_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plant_id" uuid NOT NULL,
	"type" "qr_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"uri" text NOT NULL,
	"hmac" text,
	"generated_by" uuid NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"printed_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "qr_registry_uri_unique" UNIQUE("uri")
);
--> statement-breakpoint
CREATE TABLE "shift_correction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_shift_id" uuid NOT NULL,
	"corrected_by" uuid NOT NULL,
	"correction_fields" jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_report_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"machine_id" uuid NOT NULL,
	"code" text NOT NULL,
	"batangan_kg" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "batch_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "downtime_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_report_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"category" "downtime_category" NOT NULL,
	"duration_minutes" integer NOT NULL,
	"linked_box_id" uuid,
	"description" text,
	"logged_at" timestamp DEFAULT now() NOT NULL,
	"logged_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hlp_pack" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"hlp_machine_id" uuid NOT NULL,
	"packs_lolos" integer NOT NULL,
	"isi_per_pack" integer DEFAULT 20 NOT NULL,
	"reject_batangan" integer DEFAULT 0 NOT NULL,
	"total_batang" integer NOT NULL,
	"berat_per_batang_gram" numeric(5, 3),
	"packed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_report_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"sparepart_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"linked_box_id" uuid,
	"note" text,
	"logged_at" timestamp DEFAULT now() NOT NULL,
	"logged_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tsg_box_consumption" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tsg_box_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"consumable_item_id" uuid NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"logged_at" timestamp DEFAULT now() NOT NULL,
	"logged_by" uuid NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "tsg_box_process" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_report_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"box_number" integer NOT NULL,
	"box_code" text,
	"tsg_weight_kg" numeric(10, 2) NOT NULL,
	"output_weight_kg" numeric(10, 2),
	"yield_pct" numeric(5, 2),
	"is_partial" boolean DEFAULT false NOT NULL,
	"handoff_id" uuid,
	"inventory_box_id" uuid,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "tsg_box_process_shift_report_id_box_number_unique" UNIQUE("shift_report_id","box_number")
);
--> statement-breakpoint
CREATE TABLE "dispatch_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"doc_type" "dispatch_doc_type" NOT NULL,
	"doc_number" text NOT NULL,
	"pdf_url" text NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"generated_by" uuid NOT NULL,
	CONSTRAINT "dispatch_document_plant_id_doc_type_doc_number_unique" UNIQUE("plant_id","doc_type","doc_number")
);
--> statement-breakpoint
CREATE TABLE "dispatch_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"carton_id" uuid NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dispatch_item_carton_id_unique" UNIQUE("carton_id")
);
--> statement-breakpoint
CREATE TABLE "dispatch_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plant_id" uuid NOT NULL,
	"order_code" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_address" text NOT NULL,
	"customer_contact" text,
	"driver_name" text,
	"vehicle_no" text,
	"status" "dispatch_status" DEFAULT 'DRAFT' NOT NULL,
	"ordered_at" timestamp DEFAULT now() NOT NULL,
	"dispatched_at" timestamp,
	"dispatched_by" uuid,
	"delivered_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "dispatch_order_plant_id_order_code_unique" UNIQUE("plant_id","order_code")
);
--> statement-breakpoint
CREATE TABLE "auth_policy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"access_token_ttl_minutes" integer DEFAULT 15 NOT NULL,
	"refresh_token_ttl_days" integer DEFAULT 30 NOT NULL,
	"require_2fa" boolean DEFAULT false NOT NULL,
	"ip_allowlist" text[],
	"max_active_assignments" integer,
	CONSTRAINT "auth_policy_role_id_unique" UNIQUE("role_id")
);
--> statement-breakpoint
CREATE TABLE "permission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"description" text,
	CONSTRAINT "permission_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"scope_level" text NOT NULL,
	"is_privileged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "role_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "role_permission" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permission_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "user_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"active_scope_type" text NOT NULL,
	"active_scope_id" uuid,
	"device_type" "device_type" NOT NULL,
	"device_id" text,
	"device_name" text,
	"push_token" text,
	"ip_address" text,
	"user_agent" text,
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"revoked_by" uuid,
	"revoked_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carton" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"product_id" uuid NOT NULL,
	"capacity_pack" integer DEFAULT 50 NOT NULL,
	"actual_pack_count" integer DEFAULT 0 NOT NULL,
	"status" "carton_status" DEFAULT 'OPEN' NOT NULL,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"opened_by" uuid NOT NULL,
	"closed_at" timestamp,
	"closed_by" uuid,
	"notes" text,
	CONSTRAINT "carton_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "carton_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"carton_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"hlp_pack_id" uuid NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"added_by" uuid NOT NULL,
	CONSTRAINT "carton_content_carton_id_hlp_pack_id_unique" UNIQUE("carton_id","hlp_pack_id")
);
--> statement-breakpoint
CREATE TABLE "company" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "company_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "consumable_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"unit" text DEFAULT 'roll' NOT NULL,
	"product_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "consumable_item_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "finished_goods_receiving" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plant_id" uuid NOT NULL,
	"shift_report_id" uuid NOT NULL,
	"packs_expected_count" integer NOT NULL,
	"packs_actual_count" integer,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"received_at" timestamp,
	"received_by" uuid,
	"dispute_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "finished_goods_receiving_shift_report_id_unique" UNIQUE("shift_report_id")
);
--> statement-breakpoint
CREATE TABLE "machine" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "machine_type" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "machine_plant_id_code_unique" UNIQUE("plant_id","code")
);
--> statement-breakpoint
CREATE TABLE "machine_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"machine_type" "machine_type" NOT NULL,
	"yield_min_pct" numeric(5, 2) NOT NULL,
	"yield_max_pct" numeric(5, 2) NOT NULL,
	"target_berat_per_batang_gram" numeric(5, 3),
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"region_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "plant_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "plant_product" (
	"plant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plant_product_plant_id_product_id_pk" PRIMARY KEY("plant_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"brand" text NOT NULL,
	"variant" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "product_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "region" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "region_company_id_code_unique" UNIQUE("company_id","code")
);
--> statement-breakpoint
CREATE TABLE "reject_reason" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "reject_reason_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "shift_handoff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_shift_id" uuid NOT NULL,
	"machine_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"sisa_tsg_kg" numeric(10, 2) NOT NULL,
	"batangan_sementara_kg" numeric(10, 2) NOT NULL,
	"weighed_at" timestamp NOT NULL,
	"weighed_by" uuid NOT NULL,
	"note" text,
	"claimed_by_shift_id" uuid,
	"claimed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "shift_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_report_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"shift_role_id" uuid NOT NULL,
	"leave_minutes" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shift_member_shift_report_id_user_id_unique" UNIQUE("shift_report_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "shift_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plant_id" uuid NOT NULL,
	"machine_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"shift_template_id" uuid NOT NULL,
	"report_date" date NOT NULL,
	"actual_start" timestamp NOT NULL,
	"actual_end" timestamp,
	"status" "shift_status" DEFAULT 'RUNNING' NOT NULL,
	"created_by" uuid NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp,
	"review_notes" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "shift_role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plant_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"can_approve_shift" boolean DEFAULT false NOT NULL,
	"can_end_shift" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "shift_role_plant_id_code_unique" UNIQUE("plant_id","code")
);
--> statement-breakpoint
CREATE TABLE "shift_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"start_time" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "shift_template_plant_id_code_unique" UNIQUE("plant_id","code")
);
--> statement-breakpoint
CREATE TABLE "shift_waste" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_report_id" uuid NOT NULL,
	"category" "waste_category" NOT NULL,
	"kg" numeric(10, 2) NOT NULL,
	"settlement_status" "settlement_status" DEFAULT 'PENDING' NOT NULL,
	"settled_at" timestamp,
	"settled_by" uuid,
	"note" text,
	CONSTRAINT "shift_waste_shift_report_id_category_unique" UNIQUE("shift_report_id","category")
);
--> statement-breakpoint
CREATE TABLE "sparepart" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"unit" text DEFAULT 'unit' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "sparepart_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "tsg_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plant_id" uuid NOT NULL,
	"box_id" uuid NOT NULL,
	"location_code" text,
	"status" "tsg_inventory_status" DEFAULT 'AVAILABLE' NOT NULL,
	"allocated_to_shift_id" uuid,
	"allocated_at" timestamp,
	"used_at" timestamp,
	"writeoff_reason" text,
	"writeoff_by" uuid,
	"writeoff_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tsg_inventory_box_id_unique" UNIQUE("box_id")
);
--> statement-breakpoint
CREATE TABLE "tsg_receiving" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plant_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"receiving_code" text NOT NULL,
	"received_at" timestamp NOT NULL,
	"received_by" uuid NOT NULL,
	"total_box_count" integer NOT NULL,
	"total_weight_kg" numeric(12, 2) NOT NULL,
	"supplier_doc_ref" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "tsg_receiving_plant_id_receiving_code_unique" UNIQUE("plant_id","receiving_code")
);
--> statement-breakpoint
CREATE TABLE "tsg_receiving_box" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receiving_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"box_code" text NOT NULL,
	"weight_kg" numeric(10, 2) NOT NULL,
	"box_seq" integer NOT NULL,
	"received_at" timestamp NOT NULL,
	CONSTRAINT "tsg_receiving_box_box_code_unique" UNIQUE("box_code"),
	CONSTRAINT "tsg_receiving_box_receiving_id_box_seq_unique" UNIQUE("receiving_id","box_seq")
);
--> statement-breakpoint
CREATE TABLE "tsg_supplier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"contact_person" text,
	"contact_phone" text,
	"address" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "tsg_supplier_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_key" ADD CONSTRAINT "idempotency_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_registry" ADD CONSTRAINT "qr_registry_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_registry" ADD CONSTRAINT "qr_registry_generated_by_user_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_correction" ADD CONSTRAINT "shift_correction_original_shift_id_shift_report_id_fk" FOREIGN KEY ("original_shift_id") REFERENCES "public"."shift_report"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_correction" ADD CONSTRAINT "shift_correction_corrected_by_user_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch" ADD CONSTRAINT "batch_shift_report_id_shift_report_id_fk" FOREIGN KEY ("shift_report_id") REFERENCES "public"."shift_report"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch" ADD CONSTRAINT "batch_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch" ADD CONSTRAINT "batch_machine_id_machine_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downtime_log" ADD CONSTRAINT "downtime_log_shift_report_id_shift_report_id_fk" FOREIGN KEY ("shift_report_id") REFERENCES "public"."shift_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downtime_log" ADD CONSTRAINT "downtime_log_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downtime_log" ADD CONSTRAINT "downtime_log_linked_box_id_tsg_box_process_id_fk" FOREIGN KEY ("linked_box_id") REFERENCES "public"."tsg_box_process"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downtime_log" ADD CONSTRAINT "downtime_log_logged_by_user_id_fk" FOREIGN KEY ("logged_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hlp_pack" ADD CONSTRAINT "hlp_pack_batch_id_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hlp_pack" ADD CONSTRAINT "hlp_pack_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hlp_pack" ADD CONSTRAINT "hlp_pack_hlp_machine_id_machine_id_fk" FOREIGN KEY ("hlp_machine_id") REFERENCES "public"."machine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_event" ADD CONSTRAINT "maintenance_event_shift_report_id_shift_report_id_fk" FOREIGN KEY ("shift_report_id") REFERENCES "public"."shift_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_event" ADD CONSTRAINT "maintenance_event_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_event" ADD CONSTRAINT "maintenance_event_sparepart_id_sparepart_id_fk" FOREIGN KEY ("sparepart_id") REFERENCES "public"."sparepart"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_event" ADD CONSTRAINT "maintenance_event_linked_box_id_tsg_box_process_id_fk" FOREIGN KEY ("linked_box_id") REFERENCES "public"."tsg_box_process"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_event" ADD CONSTRAINT "maintenance_event_logged_by_user_id_fk" FOREIGN KEY ("logged_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tsg_box_consumption" ADD CONSTRAINT "tsg_box_consumption_tsg_box_id_tsg_box_process_id_fk" FOREIGN KEY ("tsg_box_id") REFERENCES "public"."tsg_box_process"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tsg_box_consumption" ADD CONSTRAINT "tsg_box_consumption_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tsg_box_consumption" ADD CONSTRAINT "tsg_box_consumption_consumable_item_id_consumable_item_id_fk" FOREIGN KEY ("consumable_item_id") REFERENCES "public"."consumable_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tsg_box_consumption" ADD CONSTRAINT "tsg_box_consumption_logged_by_user_id_fk" FOREIGN KEY ("logged_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tsg_box_process" ADD CONSTRAINT "tsg_box_process_shift_report_id_shift_report_id_fk" FOREIGN KEY ("shift_report_id") REFERENCES "public"."shift_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tsg_box_process" ADD CONSTRAINT "tsg_box_process_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tsg_box_process" ADD CONSTRAINT "tsg_box_process_handoff_id_shift_handoff_id_fk" FOREIGN KEY ("handoff_id") REFERENCES "public"."shift_handoff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tsg_box_process" ADD CONSTRAINT "tsg_box_process_inventory_box_id_tsg_inventory_id_fk" FOREIGN KEY ("inventory_box_id") REFERENCES "public"."tsg_inventory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_document" ADD CONSTRAINT "dispatch_document_order_id_dispatch_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."dispatch_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_document" ADD CONSTRAINT "dispatch_document_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_document" ADD CONSTRAINT "dispatch_document_generated_by_user_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_item" ADD CONSTRAINT "dispatch_item_order_id_dispatch_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."dispatch_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_item" ADD CONSTRAINT "dispatch_item_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_item" ADD CONSTRAINT "dispatch_item_carton_id_carton_id_fk" FOREIGN KEY ("carton_id") REFERENCES "public"."carton"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_order" ADD CONSTRAINT "dispatch_order_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_order" ADD CONSTRAINT "dispatch_order_dispatched_by_user_id_fk" FOREIGN KEY ("dispatched_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_policy" ADD CONSTRAINT "auth_policy_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_permission_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permission"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_assignment" ADD CONSTRAINT "user_assignment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_assignment" ADD CONSTRAINT "user_assignment_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_assignment" ADD CONSTRAINT "user_assignment_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_session" ADD CONSTRAINT "user_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_session" ADD CONSTRAINT "user_session_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carton" ADD CONSTRAINT "carton_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carton" ADD CONSTRAINT "carton_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carton" ADD CONSTRAINT "carton_opened_by_user_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carton" ADD CONSTRAINT "carton_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carton_content" ADD CONSTRAINT "carton_content_carton_id_carton_id_fk" FOREIGN KEY ("carton_id") REFERENCES "public"."carton"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carton_content" ADD CONSTRAINT "carton_content_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carton_content" ADD CONSTRAINT "carton_content_hlp_pack_id_hlp_pack_id_fk" FOREIGN KEY ("hlp_pack_id") REFERENCES "public"."hlp_pack"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carton_content" ADD CONSTRAINT "carton_content_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumable_item" ADD CONSTRAINT "consumable_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finished_goods_receiving" ADD CONSTRAINT "finished_goods_receiving_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finished_goods_receiving" ADD CONSTRAINT "finished_goods_receiving_shift_report_id_shift_report_id_fk" FOREIGN KEY ("shift_report_id") REFERENCES "public"."shift_report"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finished_goods_receiving" ADD CONSTRAINT "finished_goods_receiving_received_by_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine" ADD CONSTRAINT "machine_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_template" ADD CONSTRAINT "machine_template_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant" ADD CONSTRAINT "plant_region_id_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."region"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_product" ADD CONSTRAINT "plant_product_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_product" ADD CONSTRAINT "plant_product_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region" ADD CONSTRAINT "region_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_handoff" ADD CONSTRAINT "shift_handoff_from_shift_id_shift_report_id_fk" FOREIGN KEY ("from_shift_id") REFERENCES "public"."shift_report"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_handoff" ADD CONSTRAINT "shift_handoff_machine_id_machine_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_handoff" ADD CONSTRAINT "shift_handoff_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_handoff" ADD CONSTRAINT "shift_handoff_weighed_by_user_id_fk" FOREIGN KEY ("weighed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_handoff" ADD CONSTRAINT "shift_handoff_claimed_by_shift_id_shift_report_id_fk" FOREIGN KEY ("claimed_by_shift_id") REFERENCES "public"."shift_report"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_member" ADD CONSTRAINT "shift_member_shift_report_id_shift_report_id_fk" FOREIGN KEY ("shift_report_id") REFERENCES "public"."shift_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_member" ADD CONSTRAINT "shift_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_member" ADD CONSTRAINT "shift_member_shift_role_id_shift_role_id_fk" FOREIGN KEY ("shift_role_id") REFERENCES "public"."shift_role"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_report" ADD CONSTRAINT "shift_report_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_report" ADD CONSTRAINT "shift_report_machine_id_machine_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_report" ADD CONSTRAINT "shift_report_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_report" ADD CONSTRAINT "shift_report_shift_template_id_shift_template_id_fk" FOREIGN KEY ("shift_template_id") REFERENCES "public"."shift_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_report" ADD CONSTRAINT "shift_report_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_report" ADD CONSTRAINT "shift_report_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_role" ADD CONSTRAINT "shift_role_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_template" ADD CONSTRAINT "shift_template_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_waste" ADD CONSTRAINT "shift_waste_shift_report_id_shift_report_id_fk" FOREIGN KEY ("shift_report_id") REFERENCES "public"."shift_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_waste" ADD CONSTRAINT "shift_waste_settled_by_user_id_fk" FOREIGN KEY ("settled_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tsg_inventory" ADD CONSTRAINT "tsg_inventory_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tsg_inventory" ADD CONSTRAINT "tsg_inventory_box_id_tsg_receiving_box_id_fk" FOREIGN KEY ("box_id") REFERENCES "public"."tsg_receiving_box"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tsg_inventory" ADD CONSTRAINT "tsg_inventory_allocated_to_shift_id_shift_report_id_fk" FOREIGN KEY ("allocated_to_shift_id") REFERENCES "public"."shift_report"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tsg_inventory" ADD CONSTRAINT "tsg_inventory_writeoff_by_user_id_fk" FOREIGN KEY ("writeoff_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tsg_receiving" ADD CONSTRAINT "tsg_receiving_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tsg_receiving" ADD CONSTRAINT "tsg_receiving_supplier_id_tsg_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."tsg_supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tsg_receiving" ADD CONSTRAINT "tsg_receiving_received_by_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tsg_receiving_box" ADD CONSTRAINT "tsg_receiving_box_receiving_id_tsg_receiving_id_fk" FOREIGN KEY ("receiving_id") REFERENCES "public"."tsg_receiving"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tsg_receiving_box" ADD CONSTRAINT "tsg_receiving_box_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_entity" ON "audit_log" USING btree ("entity_table","entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_actor" ON "audit_log" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_idem_expires" ON "idempotency_key" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_box_active" ON "tsg_box_process" USING btree ("shift_report_id") WHERE completed_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_dispatch_plant_status" ON "dispatch_order" USING btree ("plant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ua_active" ON "user_assignment" USING btree ("user_id","scope_type","scope_id","role_id") WHERE revoked_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_ua_scope" ON "user_assignment" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_session_active_mobile" ON "user_session" USING btree ("user_id") WHERE device_type = 'MOBILE' AND revoked_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_session_user_active" ON "user_session" USING btree ("user_id") WHERE revoked_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_carton_plant_status" ON "carton" USING btree ("plant_id","status");--> statement-breakpoint
CREATE INDEX "idx_content_hlp_pack" ON "carton_content" USING btree ("hlp_pack_id");--> statement-breakpoint
CREATE INDEX "idx_machine_plant" ON "machine" USING btree ("plant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mt_current" ON "machine_template" USING btree ("product_id","machine_type") WHERE is_current = true;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_handoff_unclaimed_machine" ON "shift_handoff" USING btree ("machine_id") WHERE claimed_by_shift_id IS NULL;--> statement-breakpoint
CREATE INDEX "idx_shift_plant_date" ON "shift_report" USING btree ("plant_id","report_date");--> statement-breakpoint
CREATE INDEX "idx_shift_machine_running" ON "shift_report" USING btree ("machine_id") WHERE status = 'RUNNING';--> statement-breakpoint
CREATE INDEX "idx_inv_available_fifo" ON "tsg_inventory" USING btree ("plant_id","created_at") WHERE status = 'AVAILABLE';--> statement-breakpoint
CREATE INDEX "idx_inv_allocated" ON "tsg_inventory" USING btree ("allocated_to_shift_id") WHERE status = 'ALLOCATED';--> statement-breakpoint
CREATE INDEX "idx_tsg_recv_plant_date" ON "tsg_receiving" USING btree ("plant_id","received_at");