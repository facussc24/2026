import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        try:
            # 1. Navigate to the application
            await page.goto("http://localhost:8080/index.html")

            # 2. Log in
            await page.wait_for_selector("#login-email")
            await page.fill("#login-email", "f.santoro@barackmercosul.com")
            await page.fill("#login-password", "$oof@k24")
            await page.click("button[type='submit']")

            # Wait for the main application view to be visible
            await page.wait_for_selector("#app-view:not(.hidden)", timeout=15000)
            print("Login successful, app view is visible.")

            # 3. Navigate to the ECR form
            # Open the 'Gestión de Cambios' dropdown
            await page.click('button.dropdown-toggle:has-text("Gestión de Cambios")')

            # Click the ECR link
            await page.click('a[data-view="ecr"]')

            # 4. Verify the ECR form is displayed correctly
            # Wait for a unique element within the new ECR form content
            await page.wait_for_selector('.brandbar .title:has-text("ECR – DE PRODUCTO / PROCESO")')
            print("ECR form loaded.")

            # Add a small delay to ensure rendering is complete
            await page.wait_for_timeout(1000)

            # 5. Take a screenshot for visual confirmation
            await page.screenshot(path="jules-scratch/verification/ecr_form_verification.png")
            print("Screenshot taken successfully.")

        except Exception as e:
            print(f"An error occurred: {e}")
            await page.screenshot(path="jules-scratch/verification/error.png")

        finally:
            await browser.close()

asyncio.run(main())