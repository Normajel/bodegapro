// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

if (process.argv.some((argument) => argument === "dev" || argument === "serve")) {
  const localEnv = loadEnv("development", process.cwd(), "");
  const serverEnvKeys = [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "BODEGAPRO_RESET_CODE",
  ] as const;

  for (const key of serverEnvKeys) {
    if (!process.env[key] && localEnv[key]) process.env[key] = localEnv[key];
  }
}

export default defineConfig({
  vite: {
    optimizeDeps: {
      include: ["exceljs"],
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
