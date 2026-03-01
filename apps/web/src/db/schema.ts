import { sql } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, uniqueIndex, uuid, vector } from "drizzle-orm/pg-core";

export const accountTypeEnum = pgEnum("account_type", ["student", "parent"]);
export const subjectCategoryEnum = pgEnum("subject_category", ["academic", "supercurricular"]);
export const repeatPriorityEnum = pgEnum("repeat_priority", ["high", "medium", "low"]);
export const repeatStatusEnum = pgEnum("repeat_status", ["active", "resolved"]);
export const scheduledStatusEnum = pgEnum("scheduled_status", ["scheduled", "completed", "cancelled", "missed"]);
export const planTypeEnum = pgEnum("plan_type", ["free", "subscription", "credit_pack"]);

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  accountType: accountTypeEnum("account_type").notNull(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull().unique(),
  country: text("country").notNull().default("GB"),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const students = pgTable("students", {
  id: uuid("id").primaryKey().references(() => profiles.id, { onDelete: "cascade" }),
  dateOfBirth: date("date_of_birth").notNull(),
  schoolYear: integer("school_year").notNull(),
  consentGrantedAt: timestamp("consent_granted_at", { withTimezone: true }),
  consentGrantedByParentId: uuid("consent_granted_by_parent_id").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const parents = pgTable("parents", {
  id: uuid("id").primaryKey().references(() => profiles.id, { onDelete: "cascade" }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const parentStudentLinks = pgTable("parent_student_links", {
  id: serial("id").primaryKey(),
  parentId: uuid("parent_id").notNull().references(() => parents.id, { onDelete: "cascade" }),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  relationship: text("relationship"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniqueLinkIdx: uniqueIndex("parent_student_unique_idx").on(table.parentId, table.studentId),
}));

export const examBoards = pgTable("exam_boards", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  country: text("country").notNull().default("GB"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subjects = pgTable("subjects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  level: text("level").notNull(),
  category: subjectCategoryEnum("category").notNull().default("academic"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  subjectUniqIdx: uniqueIndex("subjects_name_level_category_uniq").on(table.name, table.level, table.category),
}));

export const boardSubjects = pgTable("board_subjects", {
  id: serial("id").primaryKey(),
  examBoardId: integer("exam_board_id").references(() => examBoards.id, { onDelete: "set null" }),
  subjectId: integer("subject_id").notNull().references(() => subjects.id, { onDelete: "cascade" }),
  syllabusCode: text("syllabus_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  boardSubjectUniqIdx: uniqueIndex("board_subjects_unique_idx").on(table.examBoardId, table.subjectId),
}));

export const studentEnrolments = pgTable("student_enrolments", {
  id: serial("id").primaryKey(),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  boardSubjectId: integer("board_subject_id").notNull().references(() => boardSubjects.id, { onDelete: "cascade" }),
  examYear: integer("exam_year").notNull(),
  currentYearOfStudy: integer("current_year_of_study").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  enrolmentUniqIdx: uniqueIndex("student_enrolments_unique_idx").on(table.studentId, table.boardSubjectId),
  studentEnrolmentIdx: index("student_enrolments_student_idx").on(table.studentId),
}));

export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  subjectId: integer("subject_id").references(() => subjects.id, { onDelete: "set null" }),
  examBoardId: integer("exam_board_id").references(() => examBoards.id, { onDelete: "set null" }),
});

export const topics = pgTable("topics", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sttKeywords: jsonb("stt_keywords").default(sql`'[]'::jsonb`),
}, (table) => ({
  courseIdx: index("topics_course_idx").on(table.courseId),
}));

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: uuid("student_id").references(() => students.id, { onDelete: "set null" }),
  enrolmentId: integer("enrolment_id").references(() => studentEnrolments.id, { onDelete: "set null" }),
  courseId: integer("course_id").notNull().references(() => courses.id),
  topicId: integer("topic_id").notNull().references(() => topics.id),
  roomName: text("room_name").notNull().unique(),
  participantToken: text("participant_token"),
  status: text("status").notNull().default("pending"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  durationSeconds: integer("duration_seconds"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  statusIdx: index("sessions_status_idx").on(table.status),
  createdAtIdx: index("sessions_created_at_idx").on(table.createdAt),
  studentIdx: index("sessions_student_idx").on(table.studentId),
}));

export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  planType: planTypeEnum("plan_type").notNull(),
  stripePriceId: text("stripe_price_id"),
  monthlyMinutes: integer("monthly_minutes"),
  creditMinutes: integer("credit_minutes"),
  pricePence: integer("price_pence").notNull().default(0),
  interval: text("interval"),
  isSchoolPlan: boolean("is_school_plan").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  plansNameIdx: uniqueIndex("plans_name_unique_idx").on(table.name),
  plansStripePriceIdx: uniqueIndex("plans_stripe_price_unique_idx").on(table.stripePriceId),
}));

export const billingCustomers = pgTable("billing_customers", {
  id: serial("id").primaryKey(),
  profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  billingProfileUniqueIdx: uniqueIndex("billing_customers_profile_unique_idx").on(table.profileId),
}));

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  planId: integer("plan_id").references(() => plans.id, { onDelete: "set null" }),
  stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
  stripePriceId: text("stripe_price_id").notNull(),
  status: text("status").notNull().default("inactive"),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  subscriptionsProfileIdx: index("subscriptions_profile_idx").on(table.profileId),
}));

export const usageCredits = pgTable("usage_credits", {
  id: serial("id").primaryKey(),
  profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  minutesTotal: integer("minutes_total").notNull(),
  minutesRemaining: integer("minutes_remaining").notNull(),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  usageCreditsProfileIdx: index("usage_credits_profile_idx").on(table.profileId),
}));

export const referrals = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerProfileId: uuid("referrer_profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  refereeProfileId: uuid("referee_profile_id").references(() => profiles.id, { onDelete: "set null" }),
  referralCode: text("referral_code").notNull().unique(),
  referralAcceptedAt: timestamp("referral_accepted_at", { withTimezone: true }),
  rewardGrantedAt: timestamp("reward_granted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  referralsReferrerIdx: index("referrals_referrer_idx").on(table.referrerProfileId),
  referralsRefereeUniqueIdx: uniqueIndex("referrals_referee_unique_idx").on(table.refereeProfileId),
}));

export const schoolEmailDomains = pgTable("school_email_domains", {
  id: serial("id").primaryKey(),
  domain: text("domain").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// A reusable named tutor persona that can be assigned to any subject enrolment.
export const tutorPersonas = pgTable("tutor_personas", {
  id: serial("id").primaryKey(),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  personalityPrompt: text("personality_prompt").notNull().default("Be warm, concise, and Socratic."),
  ttsVoiceModel: text("tts_voice_model").notNull().default("aura-2-draco-en"),
  ttsSpeed: text("tts_speed").notNull().default("1.0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tutorPersonaUniqIdx: uniqueIndex("tutor_personas_student_name_uniq").on(table.studentId, table.name),
  tutorPersonaStudentIdx: index("tutor_personas_student_idx").on(table.studentId),
}));

// Per-enrolment assignment — which persona (if any) is active for this subject.
export const tutorConfigs = pgTable("tutor_configs", {
  id: serial("id").primaryKey(),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  enrolmentId: integer("enrolment_id").notNull().references(() => studentEnrolments.id, { onDelete: "cascade" }),
  personaId: integer("persona_id").references(() => tutorPersonas.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tutorConfigUniqIdx: uniqueIndex("tutor_configs_student_enrolment_unique_idx").on(table.studentId, table.enrolmentId),
}));

export const progressSnapshots = pgTable("progress_snapshots", {
  id: serial("id").primaryKey(),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  enrolmentId: integer("enrolment_id").notNull().references(() => studentEnrolments.id, { onDelete: "cascade" }),
  topicId: integer("topic_id").references(() => topics.id, { onDelete: "set null" }),
  confidenceScore: text("confidence_score").notNull().default("0"),
  areasOfStrength: jsonb("areas_of_strength").notNull().default(sql`'[]'::jsonb`),
  areasToImprove: jsonb("areas_to_improve").notNull().default(sql`'[]'::jsonb`),
  recommendedFocus: jsonb("recommended_focus").notNull().default(sql`'[]'::jsonb`),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  progressStudentIdx: index("progress_snapshots_student_idx").on(table.studentId),
  progressEnrolmentIdx: index("progress_snapshots_enrolment_idx").on(table.enrolmentId),
}));

export const repeatFlags = pgTable("repeat_flags", {
  id: serial("id").primaryKey(),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  enrolmentId: integer("enrolment_id").notNull().references(() => studentEnrolments.id, { onDelete: "cascade" }),
  topicId: integer("topic_id").references(() => topics.id, { onDelete: "set null" }),
  concept: text("concept").notNull(),
  reason: text("reason").notNull(),
  priority: repeatPriorityEnum("priority").notNull().default("medium"),
  status: repeatStatusEnum("status").notNull().default("active"),
  parentAssigned: integer("parent_assigned").notNull().default(0),
  flaggedAt: timestamp("flagged_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (table) => ({
  repeatStudentIdx: index("repeat_flags_student_idx").on(table.studentId),
}));

export const dosChatThreads = pgTable("dos_chat_threads", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dosChatMessages = pgTable("dos_chat_messages", {
  id: serial("id").primaryKey(),
  threadId: uuid("thread_id").notNull().references(() => dosChatThreads.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  dosThreadIdx: index("dos_chat_messages_thread_idx").on(table.threadId),
}));

export const scheduledTutorials = pgTable("scheduled_tutorials", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  enrolmentId: integer("enrolment_id").references(() => studentEnrolments.id, { onDelete: "set null" }),
  topicId: integer("topic_id").references(() => topics.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  recurrenceRule: text("recurrence_rule"),
  status: scheduledStatusEnum("status").notNull().default("scheduled"),
  sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  syncProvider: text("sync_provider"),
  externalCalendarId: text("external_calendar_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  scheduleStudentIdx: index("scheduled_tutorials_student_idx").on(table.studentId),
}));

export const restrictions = pgTable("restrictions", {
  id: serial("id").primaryKey(),
  parentId: uuid("parent_id").notNull().references(() => parents.id, { onDelete: "cascade" }),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  maxDailyMinutes: integer("max_daily_minutes"),
  maxWeeklyMinutes: integer("max_weekly_minutes"),
  blockedTimes: jsonb("blocked_times").notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  restrictionUniqIdx: uniqueIndex("restrictions_parent_student_unique_idx").on(table.parentId, table.studentId),
}));

export const studentInviteCodes = pgTable("student_invite_codes", {
  id: serial("id").primaryKey(),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  code: text("code").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  inviteStudentIdx: index("student_invite_codes_student_idx").on(table.studentId),
}));

export const sessionTranscripts = pgTable("session_transcripts", {
  id: serial("id").primaryKey(),
  sessionId: uuid("session_id").notNull().unique().references(() => sessions.id, { onDelete: "cascade" }),
  transcriptJson: jsonb("transcript_json").notNull().default(sql`'[]'::jsonb`),
  transcriptText: text("transcript_text").notNull().default(""),
});

export const sessionSummaries = pgTable("session_summaries", {
  id: serial("id").primaryKey(),
  sessionId: uuid("session_id").notNull().unique().references(() => sessions.id, { onDelete: "cascade" }),
  summaryMd: text("summary_md").notNull(),
  keyTakeawaysJson: jsonb("key_takeaways_json").notNull().default(sql`'[]'::jsonb`),
  citationsJson: jsonb("citations_json").notNull().default(sql`'[]'::jsonb`),
});

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  topicId: integer("topic_id").notNull().references(() => topics.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  sourcePath: text("source_path").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  filterIdx: index("documents_course_topic_idx").on(table.courseId, table.topicId),
}));

export const chunks = pgTable("chunks", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  topicId: integer("topic_id").notNull().references(() => topics.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }).notNull(),
}, (table) => ({
  filterIdx: index("chunks_course_topic_idx").on(table.courseId, table.topicId),
  vectorIdx: index("chunks_embedding_ivfflat_idx").using("ivfflat", table.embedding.op("vector_cosine_ops")),
}));

// Calendar integration with external providers (Google, Apple, CalDAV)
export const calendarIntegrations = pgTable("calendar_integrations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // 'google' | 'apple' | 'caldav'
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  calIntStudentIdx: index("calendar_integrations_student_idx").on(table.studentId),
  calIntStudentProviderUniq: uniqueIndex("calendar_integrations_student_provider_unique").on(table.studentId, table.provider),
}));

// Per-student iCal feed token for subscribable calendar URLs
export const calendarFeedTokens = pgTable("calendar_feed_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }).unique(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
