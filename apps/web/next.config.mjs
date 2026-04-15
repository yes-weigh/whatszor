import { withSentryConfig } from '@sentry/nextjs';

const isDev = process.env.NODE_ENV === 'development';

/** @type {import('next').NextConfig} */
const nextConfig = {
    // Disable strict mode in dev — it double-renders every component,
    // which wastes time during development. Always enabled in production.
    reactStrictMode: !isDev,
    output: 'standalone',
    transpilePackages: ['@whatszor/shared'],
    experimental: {
        // Tree-shake heavy packages at the import level so the compiler
        // only processes icons/components you actually use.
        optimizePackageImports: [
            'lucide-react',
            'recharts',
            'framer-motion',
            '@xyflow/react',
            'date-fns',
        ],
        // Skip Sentry's instrumentation hook in dev — no benefit locally.
        instrumentationHook: !isDev,
    },
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    { key: 'X-DNS-Prefetch-Control', value: 'on' },
                    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
                ],
            },
        ];
    },
};

// Skip Sentry's heavy compile-time transforms in dev — they significantly
// slow down Webpack/Turbopack with no local debugging benefit.
const exportedConfig = isDev
    ? nextConfig
    : withSentryConfig(
          nextConfig,
          {
              silent: true,
              org: process.env.SENTRY_ORG,
              project: process.env.SENTRY_PROJECT,
          },
          {
              widenClientFileUpload: true,
              transpileClientSDK: true,
              tunnelRoute: '/monitoring',
              hideSourceMaps: true,
              disableLogger: true,
          }
      );

export default exportedConfig;
