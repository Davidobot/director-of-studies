import { db } from "@/db";
import { courses, topics } from "@/db/schema";
import { CourseTopicSelector } from "@/components/CourseTopicSelector";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const allCourses = await db.select().from(courses);
  const allTopics = await db.select().from(topics);

  return (
    <main className="space-y-4">
      <p className="text-slate-300">Select your course and topic, then join a live tutoring call.</p>
      <CourseTopicSelector courses={allCourses} topics={allTopics} />
    </main>
  );
}
