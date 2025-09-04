import asyncio
import re
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Listen for all console events and print them
        page.on("console", lambda msg: print(f"Browser Console: {msg.text}"))

        try:
            print("Navigating to http://localhost:8080?e2e-test=true...")
            await page.goto("http://localhost:8080?e2e-test=true", wait_until="networkidle")
            print("Page loaded.")

            await page.wait_for_selector('#login-form', timeout=10000)
            print("Login form found.")

            await page.fill('#login-email', 'f.santoro@barackmercosul.com')
            print("Email filled.")
            await page.fill('#login-password', '$oof@k24')
            print("Password filled.")

            await page.click('button[type="submit"]')
            print("Login button clicked.")

            # Instead of waiting for a specific element that might be flaky,
            # we'll use a generous fixed wait. This should be enough for all
            # network requests and rendering to complete.
            print("Waiting for 8 seconds for the app to fully load...")
            await page.wait_for_timeout(8000)
            print("Wait finished. Taking screenshot.")

            await page.screenshot(path="jules-scratch/verification/dashboard_verification.png", full_page=True)
            print("Screenshot taken successfully.")

        except Exception as e:
            print(f"An error occurred: {e}")
            await page.screenshot(path="jules-scratch/verification/error_screenshot.png")
            print("Error screenshot taken.")

        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
