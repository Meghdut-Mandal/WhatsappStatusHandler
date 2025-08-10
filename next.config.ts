import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Exclude Node.js modules from client-side bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
      };
    }

    // Handle WebSocket and buffer utilities
    config.externals = config.externals || [];
    if (isServer) {
      config.externals.push({
        'bufferutil': 'commonjs bufferutil',
        'utf-8-validate': 'commonjs utf-8-validate',
        'ws': 'commonjs ws',
      });
    }

    // Add polyfills for Node.js modules in server environment
    if (isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'bufferutil': require.resolve('bufferutil'),
        'utf-8-validate': require.resolve('utf-8-validate'),
      };
    }

    return config;
  },
  
  // Experimental features for better Node.js compatibility
  experimental: {
    serverComponentsExternalPackages: [
      '@whiskeysockets/baileys',
      'ws',
      'bufferutil',
      'utf-8-validate',
    ],
  },
};

export default nextConfig;
