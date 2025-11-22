import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    clientSegmentCache: true,
    nodeMiddleware: true,
    serverActions: {
      bodySizeLimit: '2mb',
      allowedOrigins: ['*']
    }
  },
  logging: {
    fetches: {
      fullUrl: true
    }
  },
  // Disable hostname validation for staging
  assetPrefix: undefined,
  typescript: {
    ignoreBuildErrors: false
  }
};

export default nextConfig;
