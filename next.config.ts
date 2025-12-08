import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    domains: ['raw.githubusercontent.com']
  },
  experimental: {
    clientSegmentCache: true,
    nodeMiddleware: true,
    serverActions: {
      bodySizeLimit: '2mb',
      allowedOrigins: [
        'staging.outcraftly.com',
        'localhost:3000'
      ]
    }
  },
  serverExternalPackages: ['drizzle-orm', 'postgres'],
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
