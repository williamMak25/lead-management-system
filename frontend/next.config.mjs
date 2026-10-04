const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { root: import.meta.dirname },
  // The browser only ever talks to Next; /api/* is proxied to the Litestar backend,
  // so the session cookie stays first-party in dev and production alike.
  // v1 URLs: deals became opportunities (same ids), tasks became activities
  async redirects() {
    return [
      { source: '/deals', destination: '/pipeline', permanent: true },
      { source: '/deals/:id', destination: '/leads/:id', permanent: true },
      { source: '/tasks', destination: '/activities', permanent: true },
    ];
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
