import { test, expect } from '@playwright/test';

test.describe('Task Modal E2E', () => {
  test('should open the new task modal and take a screenshot', async ({ page }) => {
    // Navigate to the login page in test mode with all flags
    await page.goto('http://localhost:8080?env=test&e2e-test=true');

    // Fill in the login form and submit
    await page.fill('input[type="email"]', 'f.santoro@barackmercosul.com');
    await page.fill('input[type="password"]', 'password');
    await page.click('button[type="submit"]');

    // Wait for the main app view to be visible after login
    await page.waitForSelector('#app-view', { state: 'visible' });

    // Click on the "Tareas" nav link to ensure we are on the correct page
    await page.click('a[data-view="tareas"]');

    // Click the "Nueva Tarea" button
    const newTaskButton = page.locator('button#add-new-task-btn');
    await newTaskButton.click();

    // Wait for the modal to appear
    await page.waitForSelector('#task-form-modal', { state: 'visible' });

    // Take a screenshot of the modal
    const modal = await page.locator('#task-form-modal .modal-content');
    await modal.screenshot({ path: 'tests/screenshot.png' });
  });
});
