import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname),
  // Allow all local network IPs and tunnel domains to connect in development
  allowedDevOrigins: [
    "192.168.*.*",
    "10.*.*.*",
    "localhost",
    "127.0.0.1",
    "*.loca.lt",
    "*.trycloudflare.com"
  ],
  async rewrites() {
    const fastapiHost = process.env.FASTAPI_INTERNAL_URL || "http://127.0.0.1:8000";
    return [
      {
        source: "/api/v2/:path*",
        destination: `${fastapiHost}/:path*`,
      },
    ];
  },
};

export default nextConfig;
