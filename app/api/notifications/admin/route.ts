import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const baseUrl = (process.env.WEBSITE_API_BASE_URL || "").replace(/\/$/, "");
  const authorization = request.headers.get("authorization") || "";
  if (!baseUrl) return NextResponse.json({ error: "Website notification API URL is not configured." }, { status: 500 });
  if (!authorization) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

  try {
    const response = await fetch(`${baseUrl}/api/notifications/admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authorization },
      body: await request.text(),
      cache: "no-store",
    });
    const body = await response.text();
    return new NextResponse(body, { status: response.status, headers: { "Content-Type": response.headers.get("content-type") || "application/json" } });
  } catch (error) {
    console.error("Website notification API proxy failed", error);
    return NextResponse.json({ error: "Unable to reach the Website notification service." }, { status: 502 });
  }
}
