import { and, eq, isNull } from "drizzle-orm";
import { db } from "./index";
import { boardSubjects, examBoards, subjects } from "./schema";

type SeedBoard = { code: string; name: string };
type SeedSubject = { name: string; level: string; category: "academic" | "supercurricular" };
type SeedBoardSubject = { boardCode: string | null; subjectName: string; level: string; syllabusCode?: string };

const boardSeeds: SeedBoard[] = [
  { code: "AQA", name: "Assessment and Qualifications Alliance" },
  { code: "EDEXCEL", name: "Pearson Edexcel" },
  { code: "OCR", name: "Oxford Cambridge and RSA" },
  { code: "WJEC", name: "WJEC / Eduqas" },
  { code: "SQA", name: "Scottish Qualifications Authority" },
  { code: "CCEA", name: "Council for the Curriculum, Examinations and Assessment" },
  { code: "CIE", name: "Cambridge International" },
];

const subjectSeeds: SeedSubject[] = [
  { name: "History", level: "GCSE", category: "academic" },
  { name: "History", level: "A-level", category: "academic" },
  { name: "English Literature", level: "GCSE", category: "academic" },
  { name: "English Literature", level: "A-level", category: "academic" },
  { name: "English Language", level: "GCSE", category: "academic" },
  { name: "Geography", level: "GCSE", category: "academic" },
  { name: "Religious Studies", level: "GCSE", category: "academic" },
  { name: "Debating / Public Speaking", level: "Supercurricular", category: "supercurricular" },
  { name: "Metacognition", level: "Supercurricular", category: "supercurricular" },
  { name: "Oxbridge Admissions", level: "Supercurricular", category: "supercurricular" },
];

const boardSubjectSeeds: SeedBoardSubject[] = [
  { boardCode: "AQA", subjectName: "History", level: "GCSE", syllabusCode: "8145" },
  { boardCode: "AQA", subjectName: "History", level: "A-level", syllabusCode: "7042" },
  { boardCode: "AQA", subjectName: "English Literature", level: "GCSE", syllabusCode: "8702" },
  { boardCode: "AQA", subjectName: "English Literature", level: "A-level", syllabusCode: "7712" },
  { boardCode: null, subjectName: "Debating / Public Speaking", level: "Supercurricular" },
  { boardCode: null, subjectName: "Metacognition", level: "Supercurricular" },
  { boardCode: null, subjectName: "Oxbridge Admissions", level: "Supercurricular" },
];

async function seedBoards() {
  for (const board of boardSeeds) {
    await db
      .insert(examBoards)
      .values({ code: board.code, name: board.name, country: "GB" })
      .onConflictDoNothing();
  }
}

async function seedSubjects() {
  for (const subject of subjectSeeds) {
    await db
      .insert(subjects)
      .values({
        name: subject.name,
        level: subject.level,
        category: subject.category,
      })
      .onConflictDoNothing();
  }
}

async function seedBoardSubjects() {
  for (const link of boardSubjectSeeds) {
    const subjectRow = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.name, link.subjectName), eq(subjects.level, link.level)));

    if (subjectRow.length === 0) continue;

    if (link.boardCode === null) {
      const existing = await db
        .select({ id: boardSubjects.id })
        .from(boardSubjects)
        .where(and(isNull(boardSubjects.examBoardId), eq(boardSubjects.subjectId, subjectRow[0].id)));

      if (existing.length === 0) {
        await db.insert(boardSubjects).values({
          examBoardId: null,
          subjectId: subjectRow[0].id,
          syllabusCode: link.syllabusCode,
        });
      }

      continue;
    }

    const boardRow = await db.select({ id: examBoards.id }).from(examBoards).where(eq(examBoards.code, link.boardCode));
    if (boardRow.length === 0) continue;

    await db
      .insert(boardSubjects)
      .values({
        examBoardId: boardRow[0].id,
        subjectId: subjectRow[0].id,
        syllabusCode: link.syllabusCode,
      })
      .onConflictDoNothing();
  }
}

async function main() {
  await seedBoards();
  await seedSubjects();
  await seedBoardSubjects();
}

main()
  .then(() => {
    console.log("Reference seed complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
