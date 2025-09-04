import { test, expect } from '@playwright/test';
import { chromium } from 'playwright';

test.describe('New Control Panel Tutorial Verification', () => {
  let browser;
  let page;

  test.beforeAll(async () => {
    test.setTimeout(60000);
    browser = await chromium.launch();
  });

  test.beforeEach(async () => {
    page = await browser.newPage();
    await page.goto('http://localhost:8080/?env=test', { waitUntil: 'networkidle' });

    // --- LOGIN STEP ---
    await page.waitForSelector('#login-form');
    await page.fill('input[type="email"]', 'f.santoro@barackmercosul.com');
    await page.fill('input[type="password"]', '$oof@k24');
    await page.click('button[type="submit"]');
    await page.waitForURL('http://localhost:8080/#dashboard', { timeout: 20000 });

    // --- NAVIGATION STEP ---
    await page.click('a[data-view="control_ecrs"]');
    await page.waitForURL('http://localhost:8080/#control_ecrs');
  });

  test.afterEach(async () => {
    await page.close();
  });

  test.afterAll(async () => {
    await browser.close();
  });

  test('should launch the new tutorial and display the first step', async () => {
    // Click the tutorial button
    await page.click('#start-control-panel-tutorial-btn');

    // Wait for the tutorial overlay and the first step's content to be visible
    await page.waitForSelector('#tutorial-overlay', { timeout: 10000 });
    const tooltipTitle = page.locator('#tutorial-tooltip-title');
    await expect(tooltipTitle).toHaveText('Bienvenido al Panel de Control');

    // Take a screenshot of the first step
    await page.screenshot({ path: 'tests/screenshots/new-tutorial-step1.png' });
  });
});
