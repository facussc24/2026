import { test, expect } from '@playwright/test';
import { chromium } from 'playwright';

test.describe('ECR Table UX Verification', () => {
  let browser;
  let page;

  test.beforeAll(async () => {
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

    // Now navigate to the ECR Table View
    await page.click('a[data-view="control_ecrs"]');
    await page.waitForURL('http://localhost:8080/#control_ecrs');
    await page.click('a[data-view="ecr_table_view"]');
    await page.waitForURL('http://localhost:8080/#ecr_table_view');
  });

  test.afterEach(async () => {
    await page.close();
  });

  test.afterAll(async () => {
    await browser.close();
  });

  test('should display filter groups, labels above inputs, and action buttons', async () => {
    await page.waitForSelector('.ecr-control-table-container', { timeout: 15000 });
    await expect(page.locator('.filters-container')).toBeVisible();
    await expect(page.locator('.filter-group:has-text("Búsqueda General")')).toBeVisible();
    await expect(page.locator('.filter-group:has-text("Filtros Específicos")')).toBeVisible();
    await expect(page.locator('.filter-group:has-text("Acciones")')).toBeVisible();

    const clientFilterControl = page.locator('.filter-control:has-text("Cliente")');
    await expect(clientFilterControl.locator('label')).toBeVisible();
    await expect(clientFilterControl.locator('select')).toBeVisible();

    const statusFilterControl = page.locator('.filter-control:has-text("Estado ECR")');
    await expect(statusFilterControl.locator('label')).toBeVisible();
    await expect(statusFilterControl.locator('select')).toBeVisible();

    await expect(page.locator('#clear-filters-btn')).toBeVisible();
    await expect(page.locator('#active-filters-indicator')).toBeVisible();
  });

  test('should update active filter count correctly', async () => {
    await expect(page.locator('#active-filters-indicator')).toContainText('No hay filtros activos');

    await page.fill('#ecr-control-search', 'test');
    await expect(page.locator('#active-filters-indicator')).toContainText('1 filtro(s) activo(s)');

    await page.selectOption('#ecr-status-filter', 'approved');
    await expect(page.locator('#active-filters-indicator')).toContainText('2 filtro(s) activo(s)');

    await page.click('#clear-filters-btn');
    await expect(page.locator('#active-filters-indicator')).toContainText('No hay filtros activos');
    await expect(page.locator('#ecr-control-search')).toHaveValue('');
    await expect(page.locator('#ecr-status-filter')).toHaveValue('all');
  });

  test('should take responsive screenshots', async () => {
    const container = page.locator('.ecr-control-table-container');

    // Desktop view
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(500);
    await container.screenshot({ path: 'tests/screenshots/ecr-ux-desktop.png' });

    // Tablet view
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500);
    await container.screenshot({ path: 'tests/screenshots/ecr-ux-tablet.png' });

    // Mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    await container.screenshot({ path: 'tests/screenshots/ecr-ux-mobile.png' });
  });
});
