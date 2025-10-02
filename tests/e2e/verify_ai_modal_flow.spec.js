import { test, expect } from '@playwright/test';

test.describe('AI Assistant Modal Flow with Mocked Backend', () => {
  test('should correctly handle the AI agent response, enrich the plan, and display it for review', async ({ page }) => {
    // 1. Mock the backend response for the 'aiProjectAgent' cloud function
    await page.route('**/aiProjectAgent', route => {
      console.log('Intercepted call to aiProjectAgent. Replying with mock data.');
      const mockResponse = {
        data: {
          thinkingSteps: [
            'Pensamiento inicial: crear la primera tarea.',
            'Pensamiento intermedio: crear la segunda tarea.',
            'Pensamiento final: crear la dependencia.'
          ],
          executionPlan: [
            { action: 'CREATE', docId: 'temp_001', task: { title: 'Tarea A (Prerrequisito)' } },
            { action: 'CREATE', docId: 'temp_002', task: { title: 'Tarea B (Dependiente)' } },
            { action: 'UPDATE', docId: 'temp_002', updates: { dependsOn: ['temp_001'] } }
          ],
          userPrompt: 'Crear un plan de prueba'
        }
      };
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResponse),
      });
    });

    // 2. Navigate to the app and log in
    await page.goto('http://localhost:3000');
    await page.waitForSelector('#loading-overlay', { state: 'hidden' });
    await page.fill('#login-email', 'f.santoro@barackmercosul.com');
    await page.fill('#login-password', '$oof@k24');
    await page.click('#login-button');
    await page.waitForURL('http://localhost:3000/dashboard');
    await expect(page.locator('h1')).toHaveText('Página Principal');

    // 3. Open the AI Assistant
    await page.click('#ai-assistant-btn');
    await expect(page.locator('#ai-assistant-modal')).toBeVisible();

    // 4. Use the quick action and generate the plan
    await page.click('[data-action="ai-template"][data-template-id="new-amfe-process"]');
    await expect(page.locator('#ai-assistant-prompt-input')).toHaveValue('Iniciar un nuevo proceso de AMFE para...');

    await page.click('#ai-generate-plan-btn');

    // 5. Verify the dynamic loading animation
    await expect(page.locator('#thinking-steps-container')).toBeVisible();
    // Check that the thinking steps are rendered sequentially
    await expect(page.locator('text=Pensamiento inicial: crear la primera tarea.')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Pensamiento intermedio: crear la segunda tarea.')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Pensamiento final: crear la dependencia.')).toBeVisible({ timeout: 5000 });

    // 6. Verify the review view, specifically checking the fix for the "ghost task" bug
    await expect(page.locator('h3:has-text("Revisa el Plan Propuesto")')).toBeVisible({ timeout: 10000 });

    // Find the 'UPDATE' action card and check its content
    const updateActionCard = page.locator('.ai-plan-action-item:has-text("Actualizar Tarea")');

    // This is the critical assertion: The "undefined" bug is fixed if the original title is present.
    await expect(updateActionCard.locator('p:has-text(\'Tarea original: "Tarea B (Dependiente)"\')')).toBeVisible();

    // Also check that the "CREATE" action cards are correct
    await expect(page.locator('input[value="Tarea A (Prerrequisito)"]')).toBeVisible();
    await expect(page.locator('input[value="Tarea B (Dependiente)"]')).toBeVisible();

    console.log('AI Modal Flow test passed!');
  });
});