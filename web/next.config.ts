import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  // Frontend served at /api proxy or same-origin; API_BASE env-driven.
  env: { NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? '/api/v1' },
}

export default config
