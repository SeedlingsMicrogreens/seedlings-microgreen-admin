import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Marks requests forwarded by this proxy so a misconfigured base URL cannot loop back into it.
const PROXY_HEADER = "x-seedlings-admin-proxy";

export async function POST(request: Request) {
  const baseUrl = (process.env.WEBSITE_API_BASE_URL || "").replace(/\/$/, "");
  const authorization = request.headers.get("authorization") || "";
  if (!baseUrl) return NextResponse.json({ error: "Website notification API URL is not configured." }, { status: 500 });
  if (!authorization) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  if (request.headers.has(PROXY_HEADER) || new URL(baseUrl).origin === new URL(request.url).origin) {
    console.error(`WEBSITE_API_BASE_URL (${baseUrl}) points at this admin app; set it to the Website's URL.`);
    return NextResponse.json({ error: "Website notification API URL points at the admin app itself." }, { status: 508 });
  }

  try {
    const response = await fetch(`${baseUrl}/api/notifications/transaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authorization, [PROXY_HEADER]: "1" },
      body: await request.text(),
      cache: "no-store",
    });
    const body = await response.text();
    return new NextResponse(body, { status: response.status, headers: { "Content-Type": response.headers.get("content-type") || "application/json" } });
  } catch (error) {
    console.error("Website transaction notification API proxy failed", error);
    return NextResponse.json({ error: "Unable to reach the Website notification service." }, { status: 502 });
  }
}
