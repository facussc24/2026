import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        try:
            # Navigate to the login page
            await page.goto("http://localhost:8000/login.html")

            # Perform login
            await page.fill("#email", "test@test.com")
            await page.fill("#password", "123456")
            await page.click("button[type='submit']")

            # Wait for navigation to the main page (or a specific element)
            await expect(page.locator("#logout-button")).to_be_visible(timeout=10000)
            print("Login successful.")

            # Navigate to the Tareas page
            await page.click("a[href='#'][onclick*='loadTareasView']")
            print("Navigated to Tareas page.")

            # Wait for the dashboard to be visible
            await expect(page.locator("#dashboard-tareas")).to_be_visible(timeout=10000)
            print("Dashboard is visible.")

            # Take a screenshot of the dashboard
            await page.screenshot(path="jules-scratch/verification/dashboard_verification.png")
            print("Dashboard screenshot taken.")

            # Open the "New Task" modal
            await page.click("#add-task-btn")
            print("Clicked 'Nueva Tarea' button.")

            # Wait for the modal to be visible
            modal_locator = page.locator("#task-form-modal")
            await expect(modal_locator).to_be_visible(timeout=5000)
            print("Modal is visible.")

            # Take a screenshot of the modal
            await page.screenshot(path="jules-scratch/verification/modal_verification.png")
            print("Modal screenshot taken.")

        except Exception as e:
            print(f"An error occurred: {e}")
            # Take a final screenshot on error for debugging
            await page.screenshot(path="jules-scratch/verification/error.png")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
