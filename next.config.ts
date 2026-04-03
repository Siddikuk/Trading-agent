import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    "preview-chat-b8917344-87a3-4f37-b70d-a498d6655714.space.z.ai",
  ],
};

export default nextConfig;
