"use client";

import LandingPage from "@/app/landing/landing-page";

/**
 * Site root: full-screen brand hero for guests; landing redirects authed users
 * into the default console route.
 */
export default function HomePage() {
  return <LandingPage />;
}
