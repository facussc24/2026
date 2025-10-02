import re
from playwright.sync_api import sync_playwright, expect

def run_verification(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        # 1. Login
        page.goto("http://localhost:8080")
        expect(page.locator("#loading-overlay")).to_be_hidden(timeout=10000)
        page.locator("#login-email").fill("f.santoro@barackmercosul.com")
        page.locator("#login-password").fill("$oof@k24")
        page.get_by_role("button", name="Iniciar Sesión").click()
        expect(page.get_by_role("heading", name="Página Principal")).to_be_visible(timeout=10000)

        # 2. Open AI Assistant and use the template button
        page.locator("#ai-assistant-btn").click()
        modal = page.locator("#ai-assistant-modal")
        expect(modal).to_be_visible()

        # Click the template button
        modal.get_by_role("button", name="Iniciar nuevo post para el blog").click()

        # Verify the prompt was filled and add a topic
        expect(page.locator("#ai-assistant-prompt-input")).to_have_value("Iniciar nuevo post para el blog sobre...")
        page.locator("#ai-assistant-prompt-input").fill("Iniciar nuevo post para el blog sobre la nueva arquitectura de IA")

        # 3. Generate and verify the plan
        page.locator("#ai-generate-plan-btn").click()

        # Wait for the review screen and take a screenshot
        review_form = page.locator("#ai-execution-plan-form")
        expect(review_form).to_be_visible(timeout=20000)

        # Assert that key tasks from the template are visible
        expect(review_form.get_by_text("Investigar sobre la nueva arquitectura de IA")).to_be_visible()
        expect(review_form.get_by_text("Escribir primer borrador de la nueva arquitectura de IA")).to_be_visible()
        expect(review_form.get_by_text("Publicar post en el blog")).to_be_visible()

        page.screenshot(path="jules-scratch/verification/orchestrator_verification.png")
        print("Verification script completed successfully. Screenshot saved.")

    finally:
        browser.close()

if __name__ == "__main__":
    with sync_playwright() as p:
        run_verification(p)