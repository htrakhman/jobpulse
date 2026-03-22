import type { NextConfig } from "next";
import path from "path";

/** Absolute paths into this app's node_modules (fixes Turbopack resolving CSS from a parent folder). */
function nm(pkg: string) {
  return path.join(process.cwd(), "node_modules", pkg);
}

/**
 * Turbopack can treat the workspace root as a parent folder (e.g. `cursor projects/`) when
 * lockfiles exist higher up, so `@import "tailwindcss"` fails there. Aliases force resolution
 * into this project's node_modules.
 *
 * If issues persist, use `npm run dev:webpack` or move the project to a path without a
 * conflicting parent lockfile.
 */
const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      tailwindcss: nm("tailwindcss"),
      "tw-animate-css": nm("tw-animate-css"),
      "@tailwindcss/postcss": nm("@tailwindcss/postcss"),
      "shadcn/tailwind.css": path.join(nm("shadcn"), "dist/tailwind.css"),
    },
  },
};

export default nextConfig;
