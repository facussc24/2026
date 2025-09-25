import { test, expect } from '@playwright/test';
import { chromium } from 'playwright';

test.describe('Seguimiento y Métricas Module Verification', () => {
  let browser;
  let page;

  test.beforeAll(async () => {
    test.setTimeout(60000);
    browser = await chromium.launch();
  });

  test.beforeEach(async () => {
    page = await browser.newPage();
    // Use the correct URL for the python server
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
    await page.click('a[data-view="ecr_seguimiento"]');
    await page.waitForURL('http://localhost:8080/#ecr_seguimiento');
  });

  test.afterEach(async () => {
    await page.close();
  });

  test.afterAll(async () => {
    await browser.close();
  });

  test('should display all three main sections of the module', async () => {
    await page.waitForSelector('[data-tutorial-id="ecr-seguimiento-view-container"]');

    await expect(page.locator('#ecr-log-section h3')).toHaveText('Registro de ECR');
    await expect(page.locator('#ecr-log-container .ecr-log-table')).toBeVisible();

    await expect(page.locator('#asistencia-matriz-section h3')).toHaveText('Matriz de Asistencia a Reuniones');
    await expect(page.locator('#asistencia-matriz-container .asistencia-matriz-table')).toBeVisible();

    await expect(page.locator('#resumen-graficos-section h3')).toHaveText('Resumen y Gráficos de Asistencia');
    await expect(page.locator('#resumen-container .resumen-table')).toBeVisible();
    await expect(page.locator('#chart-dias-ausentismo')).toBeVisible();
    await expect(page.locator('#chart-porc-ausentismo')).toBeVisible();
  });

  test('should allow interaction with the attendance matrix', async () => {
    const firstButton = page.locator('.asistencia-matriz-table button[data-action="toggle-asistencia-status"]').first();
    await expect(firstButton).toBeVisible();

    const initialStatus = await firstButton.innerText();

    await firstButton.click();

    const statusCycle = { '': 'P', 'P': 'A', 'A': 'O', 'O': '' };
    const expectedStatus = statusCycle[initialStatus];

    await expect(firstButton).toHaveText(expectedStatus, { timeout: 5000 });
  });

  test('should take a full page screenshot for visual verification', async () => {
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'tests/screenshots/seguimiento-y-metricas-full-view.png', fullPage: true });
  });
});
