import { test, expect } from '@playwright/test';

test('should navigate to task dashboard and take a screenshot', async ({ page }) => {
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

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

  console.log('Waiting for dashboard to load...');
  await page.waitForSelector('h1:has-text("Dashboard de Control")');
  console.log('Dashboard loaded.');

  // --- NAVIGATION STEP ---
  console.log('Clicking on Tareas...');
  await page.click('a[data-view="tareas"]');

  console.log('Waiting for stats button...');
  await page.waitForSelector('#go-to-stats-view-btn');
  console.log('Clicking stats button...');
  await page.click('#go-to-stats-view-btn');

  console.log('Waiting for task dashboard to load...');
  await page.waitForSelector('#status-chart');
  await page.waitForSelector('#priority-chart');
  console.log('Task dashboard loaded.');

  // 4. Take a screenshot
  console.log('Waiting for animations...');
  await page.waitForTimeout(2000); // Wait for animations
  console.log('Taking screenshot...');
  await page.screenshot({ path: 'tests/screenshots/task-dashboard-final-fix.png', fullPage: true });
  console.log('Screenshot taken.');
});
