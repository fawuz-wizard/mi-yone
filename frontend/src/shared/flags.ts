// Feature switches (owner-controlled, honest by design).
//
// SCAN-TO-SELL is LOCKED by default while the product is with real testers:
// the chooser shows it as "Coming very soon" and the scan/label screens stay
// hidden. To open it (hackathon demo), start or build the frontend with:
//
//   NEXT_PUBLIC_MIYONE_SCAN=on npm run dev
//   NEXT_PUBLIC_MIYONE_SCAN=on npm run build   (then npm start)
//
// NEXT_PUBLIC_* values are read when the dev server starts / at build time.
export const SCAN_ENABLED = process.env.NEXT_PUBLIC_MIYONE_SCAN === "on";
