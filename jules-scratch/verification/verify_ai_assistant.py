import re
from playwright.sync_api import sync_playwright, Page, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Listen for all console events and print them
    page.on("console", lambda msg: print(f"CONSOLE: [{msg.type}] {msg.text}"))

    try:
        # Navigate to the login page
        page.goto("http://localhost:3000")

        # Wait for the loading overlay to disappear
        expect(page.locator("#loading-overlay")).to_be_hidden(timeout=15000)

        # Log in
        expect(page.locator("#login-email")).to_be_visible(timeout=10000)
        page.locator("#login-email").fill("f.santoro@barackmercosul.com")
        page.get_by_label("Contraseña").fill("$oof@k24")
        page.get_by_role("button", name="Iniciar Sesión").click()

        # Wait for the main dashboard to load
        expect(page.get_by_role("heading", name="Página Principal")).to_be_visible(timeout=10000)

        # Navigate to the Task Dashboard by clicking the main menu item
        page.get_by_role("link", name="Tareas").click()

        # Now click the "Dashboard" sub-item to get to the correct view
        page.get_by_role("link", name="Dashboard de Tareas").click()

        # Wait for the task dashboard view to load by looking for the AI button
        expect(page.get_by_role("button", name="Asistente IA")).to_be_visible(timeout=10000)

        # Click the unified AI assistant button
        page.get_by_role("button", name="Asistente IA").click()

        # Wait for the new modal to appear and take a screenshot
        modal_title = page.get_by_role("heading", name="Asistente de IA")
        expect(modal_title).to_be_visible(timeout=5000)

        page.screenshot(path="jules-scratch/verification/ai_assistant_modal.png")
        print("Screenshot saved to jules-scratch/verification/ai_assistant_modal.png")

    except Exception as e:
        print(f"An error occurred: {e}")
        page.screenshot(path="jules-scratch/verification/error_screenshot.png")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)