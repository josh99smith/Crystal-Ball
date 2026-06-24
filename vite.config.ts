import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from https://<user>.github.io/Crystal-Ball/ — base must match the repo name.
export default defineConfig({
  base: "/Crystal-Ball/",
  plugins: [react()],
});
