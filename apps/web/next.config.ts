import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root (a stray lockfile higher up confuses Turbopack).
  turbopack: { root: process.cwd() },
  // Keep the dev badge out of demo recordings.
  devIndicators: false,
  // Intake posts a few base64 photos through the /api/tba proxy.
  experimental: { proxyClientMaxBodySize: "16mb" },
};

export default nextConfig;
