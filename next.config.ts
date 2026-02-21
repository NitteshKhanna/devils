import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.ipfs.io',
      },
      {
        protocol: 'https',
        hostname: '**.pinata.cloud',
      },
      {
        protocol: 'https',
        hostname: 'arweave.net',
      },
    ],
  },
  // Turbopack is enabled by default in Next.js 16
  turbopack: {},
};

export default nextConfig;
