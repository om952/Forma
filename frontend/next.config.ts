import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

// This app is a standalone package, not part of a workspace. Pinning the root
// stops Next from adopting a stray lockfile in a parent directory, which also
// moves where the standalone server is written.
const projectRoot = path.resolve(__dirname);

const nextConfig: NextConfig = {
  // Emits `.next/standalone`: a self-contained server with only the files it
  // needs, which is what the Docker image ships.
  output: "standalone",
  outputFileTracingRoot: projectRoot,
  turbopack: { root: projectRoot },
};

/*
 * Sentry's build step. Error reporting itself is switched on at run time by
 * NEXT_PUBLIC_SENTRY_DSN / SENTRY_DSN (see src/instrumentation*.ts); this only
 * decides whether source maps are uploaded, so stack traces point at the
 * original code. That needs SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT
 * at build time; without them the build is unchanged and uploads nothing.
 */
const uploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN);

export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: { disable: !uploadSourceMaps },
});
