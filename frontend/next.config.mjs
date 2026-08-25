/** @type {import('next').NextConfig} */
const backend = process.env.MIYONE_BACKEND_URL; // e.g. http://localhost:8000

const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  async rewrites() {
    if (!backend) return []; // no backend configured → the in-repo MOCK serves /api/v1
    return {
      // beforeFiles wins over the app's own /api/v1 mock routes: with a real
      // backend configured, EVERY api call goes to FastAPI (cookies pass through
      // untouched because it's a same-origin proxy).
      beforeFiles: [{ source: "/api/v1/:path*", destination: `${backend}/api/v1/:path*` }],
    };
  },
};
export default nextConfig;
