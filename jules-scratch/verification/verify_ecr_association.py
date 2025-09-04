import asyncio
import re
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        await page.goto("http://localhost:8080")

        # Login
        await page.locator("#login-panel").get_by_label("Correo electrónico").fill("f.santoro@barackmercosul.com")
        await page.locator("#login-panel").get_by_label("Contraseña").fill("$oof@k24")
        await page.get_by_role("button", name="Iniciar Sesión").click()

        # Wait for dashboard to load
        await expect(page.get_by_role("heading", name="Dashboard de Control")).to_be_visible(timeout=30000)

        # Create a dummy ECR first
        await page.get_by_role("button", name="ECR/ECO").click()
        await page.get_by_role("link", name="ECR", exact=True).click()
        await page.get_by_role("button", name="Crear Nuevo ECR").click()

        # Open product search
        await page.locator('button[data-action="open-ecr-product-search"]').click()

        # Wait for modal and select the first product
        await expect(page.get_by_role("heading", name="Buscar Producto")).to_be_visible()
        await page.locator('button[data-product-id]').first.click()

        # Fill out the rest of the ECR form
        await page.locator("textarea[name='situacion_existente']").fill("test")
        await page.locator("textarea[name='situacion_propuesta']").fill("test")

        await page.get_by_role("button", name="Aprobar y Guardar").click()
        await page.get_by_role("button", name=re.compile(r"Confirmar", re.IGNORECASE)).click()

        # Wait for the ECR to be saved
        await expect(page.get_by_text("ECR guardado con éxito.")).to_be_visible()
        await page.wait_for_timeout(1000) # Wait a bit for UI to settle

        await expect(page.get_by_role("heading", name="Planilla General de ECR")).to_be_visible()

        # Navigate to ECO management
        await page.get_by_role("button", name="ECR/ECO").click()
        await page.get_by_role("link", name="Gestión de ECO").click()

        await expect(page.get_by_role("heading", name="Planilla General de ECO")).to_be_visible()

        # Create a new ECO
        await page.get_by_role("button", name="Crear Nuevo ECO").click()

        await expect(page.get_by_role("heading", name="ECR Asociado:")).to_be_visible()

        # Click the search button to associate ECR
        await page.locator('button[data-action="open-ecr-search-for-eco"]').click()

        # Wait for the modal to appear
        await expect(page.get_by_role("heading", name="Seleccionar ECR Aprobado")).to_be_visible()

        # Take a screenshot of the modal
        await page.screenshot(path="jules-scratch/verification/ecr_association_modal.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
