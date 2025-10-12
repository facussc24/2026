import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.goto("http://localhost:3000")

        # Wait for the loading overlay to disappear
        await expect(page.locator("#loading-overlay")).to_be_hidden(timeout=60000)

        # Login
        await page.fill("#login-email", "f.santoro@barackmercosul.com")
        await page.fill("#login-password", "$oof@k24")
        await page.get_by_role("button", name="Iniciar Sesión").click()
        await expect(page.locator("h2:has-text('Página Principal')")).to_be_visible()

        # Navigate to Planning view
        await page.locator("a[data-view='planning']").click()
        await expect(page.locator("#timelineScroll")).to_be_visible()

        # Open AI assistant and create a task
        await page.click("#ai-assistant-button")
        await expect(page.locator("#ai-assistant-modal")).to_be_visible()
        await page.fill("#ai-chat-input", "Crea una tarea para el planning que se llame 'Nueva tarea de prueba' para el 25 de diciembre de 2025")
        await page.click("#ai-chat-send-btn")

        # Wait for the confirmation modal and confirm the plan
        await expect(page.locator("text=Revisa el Plan Propuesto")).to_be_visible(timeout=60000)
        await page.click("button:has-text('Confirmar y ejecutar')")

        # Wait for the execution to complete and the task to appear
        await expect(page.locator(".task-card:has-text('Nueva tarea de prueba')")).to_be_visible(timeout=60000)
        await expect(page.locator(".task-bar-wrap")).to_be_visible()

        # Take a screenshot
        await page.screenshot(path="jules-scratch/verification/planning-task.png")

        await browser.close()

asyncio.run(main())
