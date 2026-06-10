import type { NextConfig } from 'next';

const isStaticExport = process.env.NEXT_OUTPUT === 'export';

const nextConfig: NextConfig = {
  output: isStaticExport ? 'export' : 'standalone',
  allowedDevOrigins: ['100.110.2.29'],
  transpilePackages: ['maplibre-gl'],
  images: {
    unoptimized: isStaticExport,
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
