import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        try:
            await page.goto("http://localhost:8080/index.html", wait_until="domcontentloaded")

            # Bypass authentication and loading overlay
            await page.evaluate('''() => {
                document.getElementById('auth-container').style.display = 'none';
                document.getElementById('loading-overlay').style.display = 'none';
                document.getElementById('app-view').classList.remove('hidden');
            }''')

            # Give it a moment for scripts to run
            await page.wait_for_timeout(1000)

            # Manually trigger the click event using JavaScript
            await page.evaluate('''() => {
                document.querySelector('a[data-view="visor3d"]').click();
            }''')

            # Wait for the parts list to be populated.
            await expect(page.get_by_placeholder("Buscar pieza...")).to_be_visible(timeout=15000)

            part_button = page.get_by_role("button", name="Anodized_Aluminum_Brushed_90°_Black_#1")

            await expect(part_button).to_be_visible(timeout=15000)
            await part_button.click()

            piece_card = page.locator("#visor3d-piece-card")
            await expect(piece_card).to_be_visible()

            await expect(piece_card.get_by_text("Headrest rear center Patagonia")).to_be_visible()
            await expect(piece_card.locator('img[alt="Headrest rear center Patagonia"]')).to_be_visible()

            await page.screenshot(path="jules-scratch/verification/headrest_info_v2.png")

        except Exception as e:
            print("--- FAILED SCRIPT ---")
            print("--- PAGE CONTENT ---")
            print(await page.content())
            print("--- END OF CONTENT ---")
            raise e
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
