import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El proyecto vive dentro de Downloads: sin esto Turbopack sube hasta el home
  // buscando el lockfile y avisa en cada arranque.
  turbopack: { root: path.resolve(process.cwd()) },
};

export default nextConfig;
