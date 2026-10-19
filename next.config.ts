import type { NextConfig } from "next";

// Every page is per-user and cookie-backed, so plain dynamic rendering; caching lives in src/lib/moodle.ts.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
