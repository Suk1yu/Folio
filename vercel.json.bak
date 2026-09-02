import { routes, type VercelConfig } from "@vercel/config/v1";

const ORIGIN_SECRET = process.env.ORIGIN_SECRET;

if (!ORIGIN_SECRET) {
  throw new Error("Missing required environment variable: ORIGIN_SECRET");
}

export const config: VercelConfig = {
  routes: [
    {
      src: "/(.*)",

      missing: [
        {
          type: "header",
          key: "x-gateway-secret",
          value: ORIGIN_SECRET
        }
      ],

      status: 403,

      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    }
  ],

  headers: [
    routes.header("/(.*)", [
      {
        key: "X-Content-Type-Options",
        value: "nosniff"
      },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin"
      },
      {
        key: "X-Frame-Options",
        value: "SAMEORIGIN"
      },
      {
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains"
      }
    ])
  ]
};