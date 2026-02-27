import { NextResponse } from "next/server";

let tickets = 1;

export async function POST() {
  if (tickets <= 0) {
    return NextResponse.json({ error: "No tickets" }, { status: 400 });
  }

  tickets -= 1;

  return NextResponse.json({
    result: "🎁 Ты выиграл ничего 😅",
    tickets
  });
}