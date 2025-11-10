const { test, expect } = require('@playwright/test');

test.describe('Manual testing simulation', () => {
  let page;

  // Increase the timeout for the test
  test.setTimeout(60000);

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test('should allow creating and editing an FMEA document', async () => {
    // Handle the prompt
    page.on('dialog', async (dialog) => {
      console.log(`Dialog message: ${dialog.message()}`);
      await dialog.accept('1');
    });

    // 1. Navigate to home.html
    await page.goto('http://localhost:3000/home.html');
    await page.screenshot({ path: 'tests/screenshots/01_home_page.png' });

    // 2. Create a new FMEA document
    await page.click('#new-amfe');
    await page.waitForURL('**/index.html?id=**');
    await page.screenshot({ path: 'tests/screenshots/02_new_fmea.png' });

    // 3. Add a new item
    await page.click('#add-item');
    await page.screenshot({ path: 'tests/screenshots/03_add_item.png' });

    // 4. Add a step to the item
    await page.click('button.small:has-text("+ Paso")');
    await page.screenshot({ path: 'tests/screenshots/04_add_step.png' });

    // 5. Add a "4M" element to the step
    await page.click('button.small:has-text("+ 4M")');
    await page.screenshot({ path: 'tests/screenshots/05_add_4m_element.png' });

    // 6. Fill in some data in the detail panel
    await page.fill('#funcionItem', 'Test Function Item');
    await page.fill('#funcionPaso', 'Test Function Step');
    await page.fill('#funcionElemento', 'Test Function Element');

    // 7. Go to the "fallas" tab and add a failure
    await page.click('button[data-tab="fallas"]');
    await page.click('#add-falla');
    await page.fill('#fallas-body tr:first-child td:nth-child(1) textarea', 'Test Effect');
    await page.fill('#fallas-body tr:first-child td:nth-child(2) textarea', 'Test Mode');
    await page.fill('#fallas-body tr:first-child td:nth-child(3) textarea', 'Test Cause');
    await page.screenshot({ path: 'tests/screenshots/06_add_failure.png' });

    // 8. Go to the "riesgos" tab and fill in S/O/D
    await page.click('button[data-tab="riesgos"]');
    await page.selectOption('#severidad', '8');
    await page.selectOption('#ocurrencia', '5');
    await page.selectOption('#deteccion', '3');
    await page.screenshot({ path: 'tests/screenshots/07_add_risks.png' });
  });

  test.afterAll(async () => {
    await page.close();
  });
});
