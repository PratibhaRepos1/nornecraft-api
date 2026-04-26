import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // CORS headers are set dynamically in proxy.ts so we can allowlist
  // multiple origins (localhost dev + production domains) and echo the
  // matching one back per request.
};

export default nextConfig;
