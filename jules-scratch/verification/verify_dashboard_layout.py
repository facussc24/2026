import os
from playwright.sync_api import sync_playwright, expect
import time

def run_verification(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 800})
    page = context.new_page()

    # Listen for all console events and print them
    page.on("console", lambda msg: print(f"Browser Console: {msg}"))

    try:
        # Navigate to the local server URL
        page.goto("http://localhost:3000", wait_until="networkidle")

        page.wait_for_timeout(1000)

        login_form = page.locator("#login-panel")
        if (login_form.is_visible()):
            print("Login form is visible. Performing login...")
            page.fill("#login-email", "f.santoro@barackmercosul.com")
            page.fill("#login-password", "123456")
            page.click('button[type="submit"]')
        else:
            print("Login form not visible. Assuming already logged in.")

        expect(page.locator("#view-title")).to_have_text("Dashboard", timeout=20000)

        page.locator(".dropdown-toggle", has_text="Gestión").click()
        page.locator('a[data-view="tareas"]').click()

        expect(page.locator("#view-title")).to_have_text("Gestor de Tareas", timeout=10000)
        page.locator("#go-to-stats-view-btn").click()

        expect(page.locator("#view-title")).to_have_text("Dashboard de Tareas", timeout=10000)

        view_content = page.locator("#view-content")
        expect(view_content).to_be_visible()

        # Add a longer delay to ensure charts have time to render their animations
        page.wait_for_timeout(1500)

        # Use a consistent screenshot path
        screenshot_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "task-dashboard-layout-fixed.png"))
        view_content.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

    except Exception as e:
        page.screenshot(path="jules-scratch/verification/error_screenshot.png")
        print(f"An error occurred: {e}")
        raise
    finally:
        context.close()
        browser.close()

with sync_playwright() as playwright:
    run_verification(playwright)
