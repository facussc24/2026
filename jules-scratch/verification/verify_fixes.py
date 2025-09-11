from playwright.sync_api import sync_playwright, expect
import time

def run_verification(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        # 1. Navigate to the app and log in
        print("Navigating to http://localhost:8000/public/")
        page.goto("http://localhost:8000/public/")

        auth_container = page.locator("#auth-container")
        expect(auth_container).to_be_visible(timeout=10000)
        print("Authentication container is visible.")

        print("Attempting to log in...")
        page.fill("#login-email", "f.santoro@barackmercosul.com")
        page.fill("#login-password", "$oof@k24")
        page.click("button[type=submit]")
        print("Login form submitted.")

        app_view = page.locator("#app-view")
        expect(app_view).to_be_visible(timeout=15000)
        print("Login successful, app view is visible.")

        # TAKE SCREENSHOT OF THE DASHBOARD
        print("Taking screenshot of the dashboard.")
        page.screenshot(path="jules-scratch/verification/verification.png")
        print("Final screenshot taken.")

    except Exception as e:
        print(f"An error occurred during verification: {e}")
        page.screenshot(path="jules-scratch/verification/error.png")
        raise
    finally:
        context.close()
        browser.close()

with sync_playwright() as playwright:
    run_verification(playwright)
