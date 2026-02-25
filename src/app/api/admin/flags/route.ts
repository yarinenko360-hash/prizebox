import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  const admin = supabaseAdmin();

  const { data, error } = await admin
    .from("settings")
    .select("key, value")
    .in("key", ["maintenance"]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const map: any = {};
  for (const row of data ?? []) map[row.key] = row.value;

  // дефолт
  if (!map.maintenance) map.maintenance = { enabled: false };

  return NextResponse.json({ maintenance: map.maintenance });
}

export async function POST(req: Request) {
  const admin = supabaseAdmin();
  const body = await req.json().catch(() => ({}));

  const maintenance = body?.maintenance;
  if (maintenance?.enabled === undefined) {
    return NextResponse.json({ error: "maintenance.enabled required" }, { status: 400 });
  }

  const { error } = await admin
    .from("settings")
    .upsert({ key: "maintenance", value: { enabled: !!maintenance.enabled } });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ maintenance: { enabled: !!maintenance.enabled } });
}