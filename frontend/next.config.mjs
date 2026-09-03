/** @type {import('next').NextConfig} */
// Either a full URL (local: http://localhost:8000) or, on managed hosting, the
// API's private host:port injected by the platform (render.yaml fromService).
const backend =
  process.env.MIYONE_BACKEND_URL ||
  (process.env.MIYONE_BACKEND_HOSTPORT ? `http://${process.env.MIYONE_BACKEND_HOSTPORT}` : undefined);

// The in-repo MOCK API accepts any session cookie and ignores the business id
// entirely — it exists so the UI can be developed and tested without a
// database. If it were ever served to real users, MI YONE would have no
// authentication and no separation between businesses at all.
//
// So it is now OPT-IN, never a silent fallback: without a real backend you
// must say MIYONE_MOCK_API=on out loud. A build with neither refuses to start
// rather than quietly serving an open API.
const mockEnabled = process.env.MIYONE_MOCK_API === "on";

if (!backend && !mockEnabled) {
  throw new Error(
    "[MI YONE] No API configured.\n" +
      "  Real backend:  MIYONE_BACKEND_URL=http://localhost:8000 npm start\n" +
      "  Mock (dev/test only, NO authentication): MIYONE_MOCK_API=on npm run dev\n" +
      "Refusing to start rather than serve an unauthenticated mock API.",
  );
}

console.log(
  backend
    ? `[MI YONE] API mode: REAL backend — proxying /api/v1 → ${backend}`
    : "[MI YONE] API mode: in-repo MOCK (MIYONE_MOCK_API=on). " +
        "No authentication, no tenant isolation — development and testing only.",
);

const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  async rewrites() {
    if (!backend) return []; // explicitly opted into the MOCK
    return {
      // beforeFiles wins over the app's own /api/v1 mock routes: with a real
      // backend configured, EVERY api call goes to FastAPI (cookies pass through
      // untouched because it's a same-origin proxy).
      beforeFiles: [{ source: "/api/v1/:path*", destination: `${backend}/api/v1/:path*` }],
    };
  },
};
export default nextConfig;
