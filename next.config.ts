import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
