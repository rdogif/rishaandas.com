const { defineConfig } = require('@playwright/test');
const port = Number(process.env.HOMEWORK_TEST_PORT || 8000);
module.exports = defineConfig({
  testDir: './tests/browser',
  use: { baseURL: `http://127.0.0.1:${port}` },
  webServer: { command: `python -m http.server ${port} --bind 127.0.0.1`, url: `http://127.0.0.1:${port}`, reuseExistingServer: false },
});
