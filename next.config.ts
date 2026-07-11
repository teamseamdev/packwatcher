import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" }
    ]
  },
  outputFileTracingExcludes: {
    "*": [
      "./.git/**",
      "./.next/**",
      "./.vercel/**",
      "./.local-clips/**",
      "./tools/**",
      "./dev-server*.log",
      "./tsconfig.tsbuildinfo"
    ]
  }
};

export default nextConfig;
