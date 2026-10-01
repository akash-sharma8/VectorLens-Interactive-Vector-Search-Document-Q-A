import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: { proxyTimeout: 240000 },
  transpilePackages: ['@vectordb/core'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_ORIGIN || 'http://127.0.0.1:8080'}/:path*`,
      },
    ];
  },
};
export default nextConfig;
