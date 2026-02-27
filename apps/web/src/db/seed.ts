import { eq } from "drizzle-orm";
import { db } from "./index";
import { courses, topics } from "./schema";

type SeedCourse = {
  id: number;
  name: string;
  topics: { id: number; name: string }[];
};

const seedData: SeedCourse[] = [
  {
    id: 1,
    name: "GCSE History (AQA)",
    topics: [
      { id: 1, name: "Medicine Through Time" },
      { id: 2, name: "Elizabethan England" },
    ],
  },
  {
    id: 2,
    name: "A-level History (AQA)",
    topics: [
      { id: 3, name: "The Tudors" },
      { id: 4, name: "Russia 1917-1991" },
    ],
  },
  {
    id: 3,
    name: "GCSE English Lit (AQA)",
    topics: [
      { id: 5, name: "Macbeth" },
      { id: 6, name: "An Inspector Calls" },
    ],
  },
];

async function main() {
  for (const course of seedData) {
    const existingCourse = await db.select().from(courses).where(eq(courses.id, course.id));

    if (existingCourse.length === 0) {
      await db.insert(courses).values({ id: course.id, name: course.name });
    }

    for (const topic of course.topics) {
      const existingTopic = await db.select().from(topics).where(eq(topics.id, topic.id));
      if (existingTopic.length === 0) {
        await db.insert(topics).values({ id: topic.id, name: topic.name, courseId: course.id });
      }
    }
  }
}

main()
  .then(() => {
    console.log("Seed complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
