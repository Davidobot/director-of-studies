import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { boardSubjects, examBoards, subjects } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({
      boardSubjectId: boardSubjects.id,
      boardId: examBoards.id,
      boardCode: examBoards.code,
      boardName: examBoards.name,
      subjectId: subjects.id,
      subjectName: subjects.name,
      level: subjects.level,
      category: subjects.category,
      syllabusCode: boardSubjects.syllabusCode,
    })
    .from(boardSubjects)
    .innerJoin(subjects, eq(subjects.id, boardSubjects.subjectId))
    .leftJoin(examBoards, eq(examBoards.id, boardSubjects.examBoardId))
    .orderBy(asc(subjects.category), asc(subjects.name), asc(subjects.level));

  return NextResponse.json({ boardSubjects: rows });
}
