import type { NextConfig } from "next";

/** Which other host may load this dev server's own resources.
 *
 *  Next blocks dev resources (/_next/*) for any origin but localhost, which
 *  is right: a page on another site could otherwise read the dev server on
 *  the machine of whoever opened it. Opening the app on a phone on the same
 *  Wi-Fi means asking for it by IP, and every script request is then blocked
 *  — the page arrives and stays blank.
 *
 *  The address is read from the environment rather than written here: it
 *  belongs to one machine on one network, and the repository should not
 *  carry it. Set DEV_ALLOWED_ORIGIN in web/.env.local (which is not
 *  committed) to the computer's address on the local network, e.g.
 *  DEV_ALLOWED_ORIGIN=192.168.1.37, and restart `npm run dev`.
 *
 *  Development only. `next build` ignores it, so nothing here can loosen
 *  anything in production.
 */
const devOrigin = process.env.DEV_ALLOWED_ORIGIN?.trim();

const nextConfig: NextConfig = {
  ...(devOrigin ? { allowedDevOrigins: [devOrigin] } : {}),
};

export default nextConfig;
