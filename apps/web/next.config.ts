import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@trade-z/types',
    '@trade-z/validation',
    '@trade-z/utils',
    '@trade-z/config',
    '@trade-z/constants',
    '@trade-z/hooks',
    '@trade-z/ui',
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '*.r2.cloudflarestorage.com',
      },
    ],
  },
};

export default nextConfig;
