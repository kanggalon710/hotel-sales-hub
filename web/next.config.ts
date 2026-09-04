import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // better-sqlite3 is a native addon: keep it out of the bundler.
  serverExternalPackages: ['better-sqlite3'],
  experimental: { authInterrupts: true },
};

export default nextConfig;
