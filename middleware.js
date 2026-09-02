export default function middleware(request) {
  const expectedSecret = process.env.ORIGIN_SECRET;

  if (!expectedSecret) {
    return new Response("Origin configuration error", {
      status: 500,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  }

  const receivedSecret =
    request.headers.get("x-gateway-secret");

  if (!receivedSecret || receivedSecret !== expectedSecret) {
    return new Response("Forbidden", {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  }

  return;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)"
  ]
};