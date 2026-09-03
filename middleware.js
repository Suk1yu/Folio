import { next } from "@vercel/functions";

export default function middleware(request) {
  const expectedSecret = process.env.ORIGIN_SECRET;

  /*
   * Secret Origin wajib tersedia.
   */
  if (!expectedSecret) {
    return new Response("Origin configuration error", {
      status: 500,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  }

  /*
   * Hanya Gateway yang mengetahui secret ini.
   */
  const receivedSecret =
    request.headers.get("x-gateway-secret");

  /*
   * Direct access / secret salah → blok.
   */
  if (
    !receivedSecret ||
    receivedSecret !== expectedSecret
  ) {
    return new Response("Forbidden", {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  }

  /*
   * Secret benar.
   *
   * WAJIB meneruskan request ke handler/static file berikutnya.
   */
  return next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)"
  ]
};