// GET + POST /api/v1/shift-roster — Roster mingguan
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import db from "@/db";
import { sql } from "drizzle-orm";

// Use raw SQL for roster since we don't have a dedicated table — store as JSON config
// For production, add a shift_roster table. For now, generate roster from shift_template + users.

const rosterSchema = z.object({
  weekStart: z.string(), // "2026-08-10"
  assignments: z.array(z.object({
    userId: z.string(),
    date: z.string(),
    shiftTemplateId: z.string(),
    shiftRoleId: z.string(),
  })),
});

export const GET = withAuth(async (request: Request) => {
  const url = new URL(request.url);
  const weekStart = url.searchParams.get("weekStart") ?? new Date().toISOString().slice(0, 10);

  // Get users with production roles only
  const users = await db.execute(sql`
    SELECT DISTINCT u.id, u.username, u.full_name
    FROM "user" u
    JOIN user_assignment ua ON ua.user_id = u.id
    JOIN role r ON ua.role_id = r.id
    WHERE ua.revoked_at IS NULL AND u.is_active = true
    AND r.code IN ('OPERATOR_KECER', 'OPERATOR_MEMBER', 'SHIFT_SUPERVISOR')
  `);

  // Get shift templates
  const templates = await db.execute(sql`
    SELECT id, code, name, start_time, duration_minutes
    FROM shift_template
    WHERE is_active = true
  `);

  // Load existing roster from database
  const existing = await db.execute(sql`SELECT user_id, date::text, shift_template_id, shift_role_id FROM shift_roster WHERE week_start = ${weekStart}`);
  const rosterRows = Array.isArray(existing) ? existing : [];
  const userRows = Array.isArray(users) ? users : [];
  const templateRows = Array.isArray(templates) ? templates : [];
  return NextResponse.json({
    weekStart,
    users: userRows,
    templates: templateRows,
    assignments: rosterRows.map((r: any) => ({ userId: r.user_id, date: r.date, shiftTemplateId: r.shift_template_id, shiftRoleId: r.shift_role_id })),
  }, { status: 200 });
});

export const POST = withAuth(async (request: Request) => {
  const body = await request.json();
  const parsed = rosterSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });

  const { weekStart, assignments } = parsed.data;
  // Delete old + insert new
  await db.execute(sql`DELETE FROM shift_roster WHERE week_start = ${weekStart}::date`);
  for (const a of assignments) {
    const roleId = a.shiftRoleId || "f57ef947-862f-4cc1-bb95-2d89e8963c11";
    await db.execute(sql`
      INSERT INTO shift_roster (user_id, date, shift_template_id, shift_role_id, week_start)
      VALUES (${a.userId}::uuid, ${a.date}::date, ${a.shiftTemplateId}::uuid, ${roleId}::uuid, ${weekStart}::date)
    `);
  }

  return NextResponse.json({ success: true, saved: assignments.length }, { status: 201 });
});
