import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/ui",
  timeout: 30000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5180", headless: true },
  webServer: {
    command: "npm run dev:web",
    url: "http://127.0.0.1:5180",
    reuseExistingServer: true,
    timeout: 30000,
  },
});
