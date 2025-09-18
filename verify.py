import asyncio
from playwright.async_api import async_playwright
import os

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        # Hardcode the absolute path
        file_url = "file:///app/public/index.html"
        await page.goto(file_url)
        # Wait for the canvas element to be rendered by the JS code
        await page.wait_for_selector('canvas')
        await page.screenshot(path="/app/verification.png") # Use absolute path for screenshot too
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
