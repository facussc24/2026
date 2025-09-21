import { test, expect } from '@playwright/test';

test('should navigate through the refactored task module views and verify components', async ({ page }) => {
  page.on('console', msg => {
    // Ignore verbose Three.js logs
    if (msg.text().includes('THREE')) return;
    console.log(`PAGE LOG: ${msg.text()}`);
  });

  console.log('Navigating to login page...');
  await page.goto('http://localhost:8080/?env=test', { waitUntil: 'networkidle' });
  console.log('Login page loaded.');

  // --- LOGIN STEP ---
  console.log('Waiting for login form...');
  await page.waitForSelector('#login-form');
  console.log('Filling email...');
  await page.fill('input[type="email"]', 'f.santoro@barackmercosul.com');
  console.log('Filling password...');
  await page.fill('input[type="password"]', '$oof@k24');
  console.log('Clicking submit...');
  await page.click('button[type="submit"]');

  console.log('Waiting for main dashboard to load...');
  // The landing page IS the main dashboard now.
  await page.waitForSelector('#kpi-proyectos');
  console.log('Main dashboard (landing page) loaded.');

  // --- NAVIGATION TO TASKS MODULE ---
  console.log('Clicking on Tareas...');
  // Use the selector that opens the "Gestor de Tareas"
  await page.click('a[data-view="tareas"]');
  console.log('Waiting for task manager view to load...');
  // The main container for the task views should be present
  await page.waitForSelector('#task-main-container');
  console.log('Task manager loaded.');

  // --- VERIFY DASHBOARD VIEW ---
  console.log('Clicking on Dashboard view button...');
  await page.click('button[data-task-view="dashboard"]');
  console.log('Waiting for dashboard components to render...');
  await expect(page.locator('#tasks-table-container')).toBeVisible();
  await expect(page.locator('#task-filters-container')).toBeVisible();
  await expect(page.locator('#old-charts-container')).toBeVisible();
  console.log('Dashboard view verified.');
  await page.waitForTimeout(1000); // Wait for animations

  // --- VERIFY KANBAN VIEW ---
  console.log('Clicking on Kanban ("Mis Tareas") view button...');
  await page.click('button[data-task-view="kanban"]');
  console.log('Waiting for Kanban board to render...');
  await expect(page.locator('#task-board')).toBeVisible();
  console.log('Kanban view verified.');
  await page.waitForTimeout(1000);

  // --- VERIFY CALENDAR VIEW ---
  console.log('Clicking on Calendar view button...');
  await page.click('button[data-task-view="calendar"]');
  console.log('Waiting for Calendar to render...');
  await expect(page.locator('#calendar-grid')).toBeVisible();
  console.log('Calendar view verified.');
  await page.waitForTimeout(1000);

  // --- VERIFY SETTINGS MODAL ---
  console.log('Clicking on Settings button...');
  await page.click('#task-settings-btn');
  console.log('Waiting for Telegram config modal to appear...');
  await expect(page.locator('#telegram-config-modal')).toBeVisible();
  await expect(page.locator('h3:has-text("Configuración de Telegram")')).toBeVisible();
  console.log('Settings modal verified.');
  await page.waitForTimeout(1000);

  // --- FINAL SCREENSHOT ---
  console.log('Taking final screenshot...');
  await page.screenshot({ path: 'tests/screenshots/task_module_refactor_verification.png', fullPage: true });
  console.log('Screenshot taken. Test complete.');
});
