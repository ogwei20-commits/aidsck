CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"theme" text DEFAULT 'dark' NOT NULL,
	"locale" text DEFAULT 'zh-CN' NOT NULL,
	"currency" text DEFAULT 'CNY' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"data_type" "data_type" DEFAULT 'U' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"depends_on_task_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid,
	"agent_id" uuid,
	"run_id" uuid,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"provider" text DEFAULT 'none' NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"data_type" "data_type" DEFAULT 'U' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"system_instructions" text DEFAULT '' NOT NULL,
	"allowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"permission_level" "permission_level" DEFAULT 'L1' NOT NULL,
	"max_runs_per_task" integer DEFAULT 3 NOT NULL,
	"timeout_seconds" integer DEFAULT 120 NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	CONSTRAINT "agents_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text DEFAULT '' NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"permission_level" "permission_level" DEFAULT 'L3' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"data_type" "data_type" DEFAULT 'U' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"permission_level" "permission_level" DEFAULT 'L1' NOT NULL,
	"enabled" text DEFAULT 'true' NOT NULL,
	CONSTRAINT "tool_registry_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"current_node" text,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"data_type" "data_type" DEFAULT 'U' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"definition" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" text DEFAULT 'true' NOT NULL,
	CONSTRAINT "workflows_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"data_type" "data_type" DEFAULT 'U' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"product_id" uuid,
	"name" text NOT NULL,
	"platform" text DEFAULT '' NOT NULL,
	"price" numeric(18, 4) DEFAULT '0' NOT NULL,
	"monthly_sales" integer DEFAULT 0 NOT NULL,
	"rating" numeric(18, 8) DEFAULT '0' NOT NULL,
	"strengths" text DEFAULT '' NOT NULL,
	"weaknesses" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platforms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"data_type" "data_type" DEFAULT 'U' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"region" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"commission_rate" numeric(18, 8) DEFAULT '0' NOT NULL,
	"entry_cost" numeric(18, 4) DEFAULT '0' NOT NULL,
	"requirements" text DEFAULT '' NOT NULL,
	"pros" text DEFAULT '' NOT NULL,
	"cons" text DEFAULT '' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"data_type" "data_type" DEFAULT 'U' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"target_market" text DEFAULT '' NOT NULL,
	"purchase_price" numeric(18, 4) DEFAULT '0' NOT NULL,
	"sell_price" numeric(18, 4) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'CNY' NOT NULL,
	"monthly_demand" integer DEFAULT 0 NOT NULL,
	"competition_level" text DEFAULT 'medium' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"data_type" "data_type" DEFAULT 'U' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"research_id" uuid NOT NULL,
	"statement" text NOT NULL,
	"evidence" text DEFAULT '' NOT NULL,
	"confidence" integer DEFAULT 50 NOT NULL,
	"source_id" uuid
);
--> statement-breakpoint
CREATE TABLE "research_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"data_type" "data_type" DEFAULT 'U' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"market" text DEFAULT '' NOT NULL,
	"topic" text DEFAULT '' NOT NULL,
	"question" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"conclusion" text DEFAULT '' NOT NULL,
	"project_id" uuid
);
--> statement-breakpoint
CREATE TABLE "research_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"data_type" "data_type" DEFAULT 'U' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"research_id" uuid NOT NULL,
	"title" text NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"publisher" text DEFAULT '' NOT NULL,
	"published_at" timestamp with time zone,
	"trust_level" text DEFAULT 'medium' NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"data_type" "data_type" DEFAULT 'U' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"product_category" text DEFAULT '' NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"min_order_qty" integer DEFAULT 0 NOT NULL,
	"unit_price" numeric(18, 4) DEFAULT '0' NOT NULL,
	"lead_time_days" integer DEFAULT 0 NOT NULL,
	"shipping_method" text DEFAULT '' NOT NULL,
	"shipping_cost" numeric(18, 4) DEFAULT '0' NOT NULL,
	"rating" integer DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currency_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base_currency" text NOT NULL,
	"quote_currency" text NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"data_type" text DEFAULT 'U' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_baselines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"data_type" "data_type" DEFAULT 'U' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"value" numeric(18, 4) DEFAULT '0' NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"data_type" "data_type" DEFAULT 'U' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"product_id" uuid,
	"platform_id" uuid,
	"currency" text DEFAULT 'USD' NOT NULL,
	"sell_price" numeric(18, 4) DEFAULT '0' NOT NULL,
	"purchase_cost" numeric(18, 4) DEFAULT '0' NOT NULL,
	"shipping_cost" numeric(18, 4) DEFAULT '0' NOT NULL,
	"commission_rate" numeric(18, 8) DEFAULT '0' NOT NULL,
	"payment_rate" numeric(18, 8) DEFAULT '0' NOT NULL,
	"ad_cost" numeric(18, 4) DEFAULT '0' NOT NULL,
	"other_cost" numeric(18, 4) DEFAULT '0' NOT NULL,
	"expected_orders" integer DEFAULT 0 NOT NULL,
	"result" text DEFAULT '' NOT NULL,
	"assumption" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"data_type" "data_type" DEFAULT 'U' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"product_id" uuid NOT NULL,
	"cost_type" text NOT NULL,
	"amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'CNY' NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profit_calculations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scenario_id" uuid,
	"unit_cost" numeric(18, 4) DEFAULT '0' NOT NULL,
	"unit_profit" numeric(18, 4) DEFAULT '0' NOT NULL,
	"margin_rate" numeric(18, 8) DEFAULT '0' NOT NULL,
	"break_even_units" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"assumption" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"data_type" "data_type" DEFAULT 'U' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"skill" text NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"evidence" text DEFAULT '' NOT NULL,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"data_type" "data_type" DEFAULT 'U' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"level" text DEFAULT 'beginner' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"total_lessons" integer DEFAULT 0 NOT NULL,
	"builtin" text DEFAULT 'false' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "growth_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"data_type" "data_type" DEFAULT 'U' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"skill_area" text NOT NULL,
	"current_level" integer DEFAULT 1 NOT NULL,
	"target_level" integer DEFAULT 3 NOT NULL,
	"achievements" text DEFAULT '' NOT NULL,
	"next_action" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"data_type" "data_type" DEFAULT 'U' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"goal" text DEFAULT '' NOT NULL,
	"start_date" timestamp with time zone,
	"target_date" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"weekly_hours" integer DEFAULT 5 NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"data_type" "data_type" DEFAULT 'U' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"plan_id" uuid,
	"course_id" uuid,
	"lesson_id" uuid,
	"minutes" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"studied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"estimated_minutes" integer DEFAULT 15 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"source_title" text DEFAULT '' NOT NULL,
	"source_url" text DEFAULT '' NOT NULL,
	"quote" text DEFAULT '' NOT NULL,
	"data_type" text DEFAULT 'U' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"chunk_index" integer DEFAULT 0 NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"data_type" "data_type" DEFAULT 'U' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"storage_path" text NOT NULL,
	"checksum" text DEFAULT '' NOT NULL,
	"purpose" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"data_type" "data_type" DEFAULT 'U' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"tags" text DEFAULT '' NOT NULL,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"file_id" uuid,
	"research_id" uuid
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"data_type" "data_type" DEFAULT 'U' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'research' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"project_id" uuid,
	"research_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"file_path" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "goal" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "detail" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "agent_slug" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_task_id_tasks_id_fk" FOREIGN KEY ("depends_on_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_findings" ADD CONSTRAINT "research_findings_research_id_research_projects_id_fk" FOREIGN KEY ("research_id") REFERENCES "public"."research_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_findings" ADD CONSTRAINT "research_findings_source_id_research_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."research_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_research_id_research_projects_id_fk" FOREIGN KEY ("research_id") REFERENCES "public"."research_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_scenarios" ADD CONSTRAINT "finance_scenarios_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_scenarios" ADD CONSTRAINT "finance_scenarios_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_costs" ADD CONSTRAINT "product_costs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profit_calculations" ADD CONSTRAINT "profit_calculations_scenario_id_finance_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."finance_scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_records" ADD CONSTRAINT "learning_records_plan_id_learning_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."learning_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_records" ADD CONSTRAINT "learning_records_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_records" ADD CONSTRAINT "learning_records_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_chunks" ADD CONSTRAINT "file_chunks_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_milestones_project_idx" ON "project_milestones" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "task_dependencies_task_idx" ON "task_dependencies" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_logs_task_idx" ON "task_logs" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_messages_run_idx" ON "agent_messages" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_runs_agent_idx" ON "agent_runs" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "approvals_entity_idx" ON "approvals" USING btree ("entity_type","entity_id","status");--> statement-breakpoint
CREATE INDEX "workflow_runs_workflow_idx" ON "workflow_runs" USING btree ("workflow_id","created_at");--> statement-breakpoint
CREATE INDEX "competitors_product_idx" ON "competitors" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_user_idx" ON "products" USING btree ("user_id","category");--> statement-breakpoint
CREATE INDEX "research_findings_research_idx" ON "research_findings" USING btree ("research_id");--> statement-breakpoint
CREATE INDEX "research_projects_user_idx" ON "research_projects" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "research_sources_research_idx" ON "research_sources" USING btree ("research_id");--> statement-breakpoint
CREATE INDEX "suppliers_user_idx" ON "suppliers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "currency_rates_pair_idx" ON "currency_rates" USING btree ("base_currency","quote_currency","effective_at");--> statement-breakpoint
CREATE INDEX "finance_scenarios_user_idx" ON "finance_scenarios" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "product_costs_product_idx" ON "product_costs" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "profit_calculations_user_idx" ON "profit_calculations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "assessments_user_idx" ON "assessments" USING btree ("user_id","skill");--> statement-breakpoint
CREATE INDEX "learning_plans_user_idx" ON "learning_plans" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "learning_records_user_idx" ON "learning_records" USING btree ("user_id","studied_at");--> statement-breakpoint
CREATE INDEX "lessons_course_idx" ON "lessons" USING btree ("course_id","order_index");--> statement-breakpoint
CREATE INDEX "citations_report_idx" ON "citations" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "file_chunks_file_idx" ON "file_chunks" USING btree ("file_id","chunk_index");--> statement-breakpoint
CREATE INDEX "files_user_idx" ON "files" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "knowledge_items_user_idx" ON "knowledge_items" USING btree ("user_id","category");--> statement-breakpoint
CREATE INDEX "reports_user_idx" ON "reports" USING btree ("user_id","kind");