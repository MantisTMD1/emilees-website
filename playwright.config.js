const { defineConfig, devices } = require("@playwright/test");

const desktop = { viewport: { width: 1440, height: 900 } };

module.exports = defineConfig({
  testDir: "tests",
  timeout: 60000,
  workers: 3,
  reporter: "list",
  use: { baseURL: "http://localhost:8123", screenshot: "only-on-failure" },
  webServer: {
    command: "python3 -m http.server 8123 --bind 127.0.0.1",
    url: "http://localhost:8123",
    reuseExistingServer: true,
  },
  projects: [
    { name: "chrome", use: { ...devices["Desktop Chrome"], ...desktop } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], ...desktop } },
    { name: "safari", use: { ...devices["Desktop Safari"], ...desktop } },
    { name: "iphone", use: { ...devices["iPhone 13"] } },
    { name: "android", use: { ...devices["Pixel 7"] } },
  ],
});
