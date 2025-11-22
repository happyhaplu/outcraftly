import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    clientSegmentCache: true,
    nodeMiddleware: true,
    serverActions: {
      allowedOrigins: ['*']  // Allow all origins in development/staging
    }
  },
  logging: {
    fetches: {
      fullUrl: true
    }
  }
};

export default nextConfig;
