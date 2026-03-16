import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure data files are included in Vercel serverless function bundles.
  // Next.js output file tracing cannot detect dynamic readFileSync paths.
  outputFileTracingIncludes: {
    "/**": ["./data/caib/*.json"],
  },
};

export default nextConfig;
