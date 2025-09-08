import asyncio
from playwright.async_api import async_playwright, expect
import os
import httpx

async def clear_firebase_auth_emulator():
    """Clears all user accounts from the Firebase Auth emulator."""
    project_id = "barackingenieria-e763c"
    url = f"http://localhost:9099/emulator/v1/projects/{project_id}/accounts"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.delete(url)
            if response.status_code == 200:
                print("Successfully cleared Firebase Auth emulator.")
            else:
                print(f"Warning: Failed to clear Firebase Auth emulator. Status: {response.status_code}, Response: {response.text}")
    except httpx.RequestError as e:
        print(f"Warning: Could not connect to Firebase Auth emulator to clear state: {e}")

async def main():
    await clear_firebase_auth_emulator()

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()

        os.makedirs("jules-scratch/verification", exist_ok=True)

        try:
            await page.goto("http://localhost:8000/?e2e-test=true")

            await expect(page.locator("#login-panel")).to_be_visible(timeout=15000)
            print("Login panel is visible.")

            await page.locator("#login-email").fill("f.santoro@barackmercosul.com")
            await page.locator("#login-password").fill("123456")
            await page.get_by_role("button", name="Ingresar").click()

            await expect(page.get_by_role("heading", name="Dashboard de Control")).to_be_visible(timeout=10000)
            print("Login successful.")

            await page.get_by_role("link", name="Ingeniería").click()
            await page.get_by_role("link", name="Sinóptico Tabular").click()
            await expect(page.get_by_role("heading", name="Reporte de Estructura de Producto (Tabular)")).to_be_visible()
            print("Navigated to Sinóptico Tabular.")

            await page.get_by_role("button", name="Seleccionar Producto").click()

            await page.locator('button:has-text("PROD0001")').click()

            await expect(page.get_by_text("Detalle de: Gran Ensamblaje de Chasis")).to_be_visible(timeout=10000)
            print("Product selected.")

            async with page.expect_download() as download_info:
                await page.get_by_role("button", name="Exportar a PDF").click()

            download = await download_info.value

            download_path = "jules-scratch/verification/exported_sinoptico.pdf"
            await download.save_as(download_path)
            print(f"PDF downloaded and saved to {download_path}")

            screenshot_path = "jules-scratch/verification/verification.png"
            await page.screenshot(path=screenshot_path)
            print(f"Screenshot saved to {screenshot_path}")

        except Exception as e:
            print(f"An error occurred: {e}")
            await page.screenshot(path="jules-scratch/verification/error.png")
            print("Error screenshot saved to jules-scratch/verification/error.png")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
