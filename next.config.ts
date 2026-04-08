import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  webpack(config, { isServer }) {
    // Prevent fabric (browser-only) from being bundled server-side
    if (isServer) {
      const externals = Array.isArray(config.externals) ? config.externals : [];
      config.externals = [...externals, 'fabric'];
    }
    // Prevent webpack from trying to resolve Node canvas polyfill
    config.resolve.fallback = { ...config.resolve.fallback, canvas: false };
    return config;
  },
};

export default nextConfig;
