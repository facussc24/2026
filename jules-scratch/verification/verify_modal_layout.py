from playwright.sync_api import sync_playwright, expect
import os

def run_verification(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # --- Credentials ---
    email = "f.santoro@barackmercosul.com"
    password = "$oof@k24"

    try:
        # 1. Navigate to the root of the application.
        page.goto("http://localhost:3000", timeout=60000)

        # 2. Perform Login
        expect(page.locator("#login-form")).to_be_visible(timeout=15000)
        page.fill('input[type="email"]', email)
        page.fill('input[type="password"]', password)
        page.click('button[type="submit"]')

        # 3. Wait for the main application view to be visible. The landing page loads by default.
        expect(page.locator("#app-view")).to_be_visible(timeout=20000)

        # 4. The AI Assistant button should be on the landing page.
        ai_assistant_button = page.locator("#ai-assistant-btn")
        expect(ai_assistant_button).to_be_visible(timeout=15000)
        ai_assistant_button.click()

        # 5. Wait for the prompt view to be visible and fill the textarea.
        prompt_textarea = page.locator("#ai-assistant-prompt-input")
        expect(prompt_textarea).to_be_visible()
        prompt_textarea.fill("Crear una tarea para el reporte semanal y marcar como hecha la de llamar al cliente X")

        # 6. Click the "Generar Plan" button.
        generate_plan_button = page.locator("#ai-generate-plan-btn")
        generate_plan_button.click()

        # 7. Wait for the review view to appear.
        review_header = page.locator("h3:has-text('Revisa el Plan Propuesto')")
        expect(review_header).to_be_visible(timeout=45000)

        # 8. Take a screenshot of the modal to verify the layout.
        modal_content = page.locator("#ai-assistant-modal-content")
        expect(modal_content).to_be_visible()

        page.wait_for_timeout(1000)

        screenshot_path = "jules-scratch/verification/ai-assistant-review-view.png"
        modal_content.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

    except Exception as e:
        print(f"An error occurred: {e}")
        os.makedirs("jules-scratch/verification", exist_ok=True)
        page.screenshot(path="jules-scratch/verification/error.png")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run_verification(playwright)