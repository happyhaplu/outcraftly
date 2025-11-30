import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    clientSegmentCache: true,
    nodeMiddleware: true,
    serverActions: {
      bodySizeLimit: '2mb',
      allowedOrigins: [
        'staging.outcraftly.com',
        '155.133.26.49:3000',
        'localhost:3000'
      ]
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
