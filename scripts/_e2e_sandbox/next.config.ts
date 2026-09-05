import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', '@prisma/adapter-better-sqlite3', '@prisma/client', 'adm-zip'],
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
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=()' }
        ],
      },
    ];
  },
};

export default nextConfig;
