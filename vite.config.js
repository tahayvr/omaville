import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: { port: 8080 },
  preview: { port: 8080 },
  worker: { format: "es" },
  // Better Auth stays unbundled: bundled, its optional OpenTelemetry import became an empty module and every
  // auth request failed; from node_modules the import fails cleanly and it traces nothing
  ssr: { external: ["better-auth", "@better-auth/core"] },
});
