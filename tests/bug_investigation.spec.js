const { test, expect } = require('@playwright/test');

test.describe('Bug Investigation', () => {
  test.setTimeout(120000); // Increased timeout for the whole test

  test('should create, edit, and delete an FMEA document without errors', async ({ page }) => {
    await page.goto('http://localhost:3000/home.html');
    await page.bringToFront();
    await page.waitForTimeout(5000); // Increased wait time for initial load

    // --- Cleanup: Delete all existing documents robustly ---
    const docList = page.locator('#doc-list');
    const initialCount = await docList.locator('.doc-item').count();

    for (let i = initialCount; i > 0; i--) {
        page.once('dialog', dialog => dialog.accept());
        await docList.locator('.doc-item').first().locator('button.btn-danger').click();
        // Wait for the count of items to decrease, which is a more stable assertion
        await expect(docList.locator('.doc-item')).toHaveCount(i - 1, { timeout: 10000 });
    }

    await expect(page.locator('#empty-message')).toBeVisible({ timeout: 10000 });


    // --- Create a new FMEA ---
    await page.locator('#new-amfe').click();
    await page.waitForURL('**/index.html?id=**');

    // --- Fill General Information ---
    await page.locator('#tema').fill('Test AMFE');
    await page.locator('#numeroAmfe').fill('AMFE-001');

    // --- Add Structure ---
    const proceso1Item = page.locator('.tree-row:has-text("Proceso 1")');
    page.once('dialog', dialog => dialog.accept('Test Item'));
    await proceso1Item.locator('button[title="Renombrar ítem"]').click();
    const testItem = page.locator('.tree-row:has-text("Test Item")');
    await expect(testItem).toBeVisible();

    page.once('dialog', dialog => dialog.accept('1'));
    await testItem.locator('button:has-text("+ Paso")').click();

    const nuevoPasoItem = page.locator('.tree-row:has-text("Nuevo Paso")');
    await expect(nuevoPasoItem).toBeVisible();
    const maquinaItem = page.locator('.tree-row:has-text("Maquina")');
    await expect(maquinaItem).toBeVisible();

    // --- Fill Detail Panel for the created 'Maquina' element ---
    await page.locator('#funcionItem').fill('Item Function');
    await page.locator('#funcionPaso').fill('Step Function');
    await page.locator('#funcionElemento').fill('Element Function');

    await page.locator('button[data-tab="fallas"]').click();
    await page.locator('#add-falla').click();
    await page.locator('#fallas-body textarea').first().fill('Failure Effect');

    await page.locator('button[data-tab="riesgos"]').click();
    await page.locator('#severidad').selectOption('9');
    await page.locator('#ocurrencia').selectOption('3');
    await page.locator('#deteccion').selectOption('4');

    // A severity of 9 requires safety approval. The checkbox must be checked.
    await expect(page.locator('#safety-approval-container')).toBeVisible();
    await page.locator('#safetyApproval').check();

    await page.locator('button[data-tab="optimizacion"]').click();
    await page.locator('#accionPrev').fill('Preventive Action');
    await page.locator('#personaResp').fill('John Doe');
    await page.locator('#fechaObjetivo').fill('2025-12-31');

    // --- Save ---
    // The save button triggers a sequence of three 'prompt' dialogs.
    // We must handle them for the save operation to complete.
    page.locator('#save-btn').click(); // No await, as it will be blocked by the dialog

    // Wait for and accept each dialog in sequence.
    const dialog1 = await page.waitForEvent('dialog');
    await dialog1.accept('Initial save with test data');

    const dialog2 = await page.waitForEvent('dialog');
    await dialog2.accept('Test Requester');

    const dialog3 = await page.waitForEvent('dialog');
    await dialog3.accept('Test Approver');
    await expect(page.locator('#save-status:has-text("Guardado correctamente.")')).toBeVisible({ timeout: 10000 });

    // --- Control Plan ---
    await page.locator('#tab-control').click();
    await page.locator('#control-body input').first().fill('Control Value');

    // --- Standard View ---
    await page.locator('#tab-standard').click();
    await expect(page.locator('.standard-table')).toBeVisible();

    // --- Go back to home and verify ---
    await page.goto('http://localhost:3000/home.html');
    const docItem = page.locator('.doc-item:has-text("Test AMFE")');
    await expect(docItem).toBeVisible();

    // --- Rename ---
    page.once('dialog', dialog => dialog.accept('Renamed AMFE'));
    await docItem.locator('button:has-text("Renombrar")').click();
    const renamedDocItem = page.locator('.doc-item:has-text("Renamed AMFE")');
    await expect(renamedDocItem).toBeVisible();

    // --- Delete ---
    page.once('dialog', dialog => dialog.accept());
    await renamedDocItem.locator('button:has-text("Eliminar")').click();

    // --- Verify Deletion and Empty State ---
    // The UI should update automatically without a reload. We wait for the item to disappear.
    await expect(renamedDocItem).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator('#empty-message')).toBeVisible();
  });
});
