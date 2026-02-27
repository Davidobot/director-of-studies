import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, serial, text, timestamp, uuid, vector } from "drizzle-orm/pg-core";

export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
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
  courseId: integer("course_id").notNull().references(() => courses.id),
  topicId: integer("topic_id").notNull().references(() => topics.id),
  roomName: text("room_name").notNull().unique(),
  participantToken: text("participant_token"),
  status: text("status").notNull().default("pending"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  statusIdx: index("sessions_status_idx").on(table.status),
  createdAtIdx: index("sessions_created_at_idx").on(table.createdAt),
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
