import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Build metadata, stamped at build time. In GitHub Actions, GITHUB_RUN_NUMBER and
// GITHUB_SHA are provided automatically; locally they fall back to dev values.
const buildTime = new Date().toISOString();
const buildNumber = process.env.GITHUB_RUN_NUMBER ?? "dev";
const buildSha = (process.env.GITHUB_SHA ?? "local").slice(0, 7);

// Served from https://<user>.github.io/Crystal-Ball/ — base must match the repo name.
export default defineConfig({
  base: "/Crystal-Ball/",
  plugins: [react()],
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
    __BUILD_NUMBER__: JSON.stringify(buildNumber),
    __BUILD_SHA__: JSON.stringify(buildSha),
  },
});
