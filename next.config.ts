import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Enable experimental features
  experimental: {
    // Server actions are enabled by default in Next.js 16
  },

  // Rewrite uploads to API route for R2 proxy
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination: '/api/files/:path*',
      },
    ]
  },

  // Allow sharp to work properly
  serverExternalPackages: ['sharp'],
}

export default nextConfig
