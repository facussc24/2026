const { test, expect } = require('@playwright/test');

test('visual inspection', async ({ page }) => {
  await page.goto('http://localhost:3000/home.html');
  await page.screenshot({ path: 'visual-inspection-after.png' });
});
