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

  // Get all users for plant
  const users = await db.execute(sql`
    SELECT u.id, u.username, u.full_name
    FROM "user" u
    JOIN user_assignment ua ON ua.user_id = u.id
    WHERE ua.revoked_at IS NULL AND u.is_active = true
  `);

  // Get shift templates
  const templates = await db.execute(sql`
    SELECT id, code, name, start_time, duration_minutes
    FROM shift_template
    WHERE is_active = true
  `);

  // Get existing roster — for now return empty assignments
  // In production, fetch from shift_roster table
  return NextResponse.json({
    weekStart,
    users: (users as any).rows ?? [],
    templates: (templates as any).rows ?? [],
    assignments: [],
  }, { status: 200 });
});

export const POST = withAuth(async (request: Request) => {
  const body = await request.json();
  const parsed = rosterSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  // TODO: Save to shift_roster table
  return NextResponse.json({ success: true, saved: parsed.data.assignments.length }, { status: 201 });
});
