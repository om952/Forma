import path from "node:path";
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

export default nextConfig;
