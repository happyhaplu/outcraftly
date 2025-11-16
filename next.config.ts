import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    clientSegmentCache: true,
    nodeMiddleware: true
  }
};

export default nextConfig;
