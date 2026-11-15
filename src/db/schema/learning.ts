import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { baseColumns, sharedColumns, titleColumn } from "./shared";

/** 文档 4.2「学习和成长」六张表 */

export const courses = pgTable("courses", {
  ...sharedColumns,
  title: titleColumn("title"),
  category: text("category").notNull().default(""),
  level: text("level").notNull().default("beginner"),
  summary: text("summary").notNull().default(""),
  totalLessons: integer("total_lessons").notNull().default(0),
  /** 是否由系统内置（内置课程随代码发布，不计入用户内容） */
  builtin: text("builtin").notNull().default("false"),
});

export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: titleColumn("title"),
    content: text("content").notNull().default(""),
    orderIndex: integer("order_index").notNull().default(0),
    estimatedMinutes: integer("estimated_minutes").notNull().default(15),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lessons_course_idx").on(t.courseId, t.orderIndex)],
);

export const learningPlans = pgTable(
  "learning_plans",
  {
    ...baseColumns,
    title: titleColumn("title"),
    goal: text("goal").notNull().default(""),
    startDate: timestamp("start_date", { withTimezone: true }),
    targetDate: timestamp("target_date", { withTimezone: true }),
    status: text("status").notNull().default("active"),
    weeklyHours: integer("weekly_hours").notNull().default(5),
    progress: integer("progress").notNull().default(0),
  },
  (t) => [index("learning_plans_user_idx").on(t.userId, t.status)],
);

export const learningRecords = pgTable(
  "learning_records",
  {
    ...baseColumns,
    planId: uuid("plan_id").references(() => learningPlans.id, { onDelete: "set null" }),
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    minutes: integer("minutes").notNull().default(0),
    note: text("note").notNull().default(""),
    studiedAt: timestamp("studied_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("learning_records_user_idx").on(t.userId, t.studiedAt)],
);

export const assessments = pgTable(
  "assessments",
  {
    ...baseColumns,
    skill: text("skill").notNull(),
    score: integer("score").notNull().default(0),
    evidence: text("evidence").notNull().default(""),
    assessedAt: timestamp("assessed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("assessments_user_idx").on(t.userId, t.skill)],
);

export const growthProfiles = pgTable("growth_profiles", {
  ...baseColumns,
  skillArea: text("skill_area").notNull(),
  currentLevel: integer("current_level").notNull().default(1),
  targetLevel: integer("target_level").notNull().default(3),
  achievements: text("achievements").notNull().default(""),
  nextAction: text("next_action").notNull().default(""),
});
