import re
from playwright.sync_api import sync_playwright, Page, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    """
    Tests that the AI assistant can navigate to a different view.
    Bypasses the AI interaction to directly test the navigation function.
    """
    # 1. Arrange: Go to the login page and log in.
    page.goto("http://localhost:3000")

    # Wait for the loading overlay to be hidden
    loading_overlay = page.locator("#loading-overlay")
    expect(loading_overlay).to_be_hidden(timeout=20000)

    # Log in using specific selectors and clicking the button
    page.locator("#login-email").fill("f.santoro@barackmercosul.com")
    page.locator("#login-password").fill("$oof@k24")

    login_button = page.get_by_role("button", name="Iniciar Sesión")
    expect(login_button).to_be_visible(timeout=20000)
    login_button.click()

    # Wait for the main page to load by looking for the main heading
    expect(page.get_by_role("heading", name="Página Principal")).to_be_visible(timeout=20000)

    # 2. Act: Directly call the navigation function.
    page.evaluate("window.switchView('planning')")

    # 3. Assert: Wait for the navigation to complete and verify the new view.
    expect(page.get_by_role("heading", name="Planning")).to_be_visible(timeout=20000)

    # 4. Screenshot: Capture the final result.
    page.screenshot(path="jules-scratch/verification/verification.png")
    print("Script finished and screenshot taken.")

    context.close()
    browser.close()

with sync_playwright() as playwright:
    run(playwright)