import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    clientSegmentCache: true,
    nodeMiddleware: true,
    serverActions: {
      allowedOrigins: ['206.1.53.83:3000', 'localhost:3000', '206.1.53.83']
    }
  },
  logging: {
    fetches: {
      fullUrl: true
    }
  },
  instrumentationHook: true
};

export default nextConfig;
