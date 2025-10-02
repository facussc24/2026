import { test, expect } from '@playwright/test';
import { chromium } from 'playwright';

test.describe('Autonomous AI Agent End-to-End Test', () => {
  let browser;
  let page;

  test.setTimeout(120000);

  test.beforeAll(async () => {
    browser = await chromium.launch();
  });

  test.beforeEach(async () => {
    page = await browser.newPage();

    // Listen for all console events and log them to the test output
    page.on('console', msg => console.log(`BROWSER CONSOLE: ${msg.type()}: ${msg.text()}`));

    try {
      console.log('Navigating to login page...');
      await page.goto('http://localhost:3000');

      console.log('Waiting for loading overlay to hide...');
      await page.waitForSelector('#loading-overlay', { state: 'hidden', timeout: 15000 });

      console.log('Filling login form...');
      await page.fill('#login-email', 'f.santoro@barackmercosul.com');
      await page.fill('#login-password', '$oof@k24');

      console.log('Clicking login button...');
      await page.click('#login-button');

      console.log('Waiting for dashboard URL...');
      await page.waitForURL('http://localhost:3000/dashboard', { timeout: 15000 });

      console.log('Verifying dashboard heading...');
      await expect(page.locator('h1')).toHaveText('Página Principal');
      console.log('Login successful.');

    } catch (error) {
      console.error('Error during login setup:', error);
      // We still try to take a screenshot, but it might fail if the page is closed.
      try {
        await page.screenshot({ path: 'tests/e2e/login_failure.png' });
      } catch (e) {
        console.error('Could not take screenshot:', e.message);
      }
      throw error; // re-throw the original error to fail the test
    }
  });

  test.afterEach(async () => {
    if (page && !page.isClosed()) {
      await page.close();
    }
  });

  test.afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  test('should create a new blog post project via the AI assistant', async () => {
    // Test logic remains the same
    await page.click('#ai-assistant-button');
    await expect(page.locator('#ai-assistant-modal')).toBeVisible();
    const prompt = 'Necesito empezar un nuevo post para el blog sobre "Playwright"';
    await page.fill('#ai-assistant-input', prompt);
    await page.click('#ai-assistant-submit');
    await page.waitForSelector('#ai-assistant-loading', { state: 'hidden', timeout: 60000 });
    await expect(page.locator('#ai-completion-message')).toBeVisible();
    await expect(page.locator('#ai-completion-message')).toContainText('¡Proyecto creado!');
    await page.click('#ai-assistant-close-button');
    await expect(page.locator('#ai-assistant-modal')).toBeHidden();
    await expect(page.locator('.task-card:has-text("Investigación y Esquema del Post")')).toBeVisible();
    await expect(page.locator('.task-card:has-text("Redacción del Borrador del Post")')).toBeVisible();
    await expect(page.locator('.task-card:has-text("Diseño de Gráficos y Multimedia")')).toBeVisible();
    await expect(page.locator('.task-card:has-text("Revisión y Edición del Contenido")')).toBeVisible();
    await expect(page.locator('.task-card:has-text("Publicación y Promoción en Redes")')).toBeVisible();
  });
});