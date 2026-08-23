import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
