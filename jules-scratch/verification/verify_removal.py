from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        page.goto("http://127.0.0.1:9005")

        # Login
        page.fill("#login-email", "test@test.com")
        page.fill("#login-password", "123456")
        page.click("button[type='submit']")

        # Wait for dashboard to load
        expect(page.locator("#view-title")).to_have_text("Página Principal")

        # Verify that the "Gestión de Cambios" dropdown is not present
        expect(page.locator("a[data-view='ecr']")).not_to_be_visible()
        expect(page.locator("a[data-view='eco']")).not_to_be_visible()
        expect(page.locator("a[data-view='control_ecrs']")).not_to_be_visible()

        # Take a screenshot
        page.screenshot(path="jules-scratch/verification/removal_verification.png")

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)