import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

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

export default withSentryConfig(nextConfig, {
  // Your Sentry org and project (set in .env as SENTRY_ORG / SENTRY_PROJECT)
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only upload source maps in CI/production, not locally
  silent: true,
  widenClientFileUpload: true,
});

