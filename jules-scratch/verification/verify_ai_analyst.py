import re
import sys
from playwright.sync_api import sync_playwright, Page, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        # 1. Navigate to the app
        page.goto("http://0.0.0.0:3000")

        # 2. Log in
        login_form = page.locator("#login-form")
        expect(login_form).to_be_visible(timeout=10000)

        login_form.get_by_label("Correo electrónico").fill("f.santoro@barackmercosul.com")
        login_form.get_by_label("Contraseña").fill("123456")
        login_form.get_by_role("button", name="Iniciar Sesión").click()

        # 3. Wait for either successful login or an error message
        success_locator = page.get_by_role("heading", name="Planificador Semanal")
        error_locator = page.locator(".toast.error:has-text('Credenciales incorrectas')")

        # Use the `or` operator on locators to wait for either one to be visible
        combined_locator = success_locator.or_(error_locator)
        combined_locator.first.wait_for(state="visible", timeout=20000)

        # 4. Check which condition was met
        if error_locator.is_visible():
            print("Login failed with 'Credenciales incorrectas'. This is a password issue.")
            page.screenshot(path="jules-scratch/verification/login_error.png")
            print("Screenshot of login error saved to jules-scratch/verification/login_error.png")
            sys.exit(1)

        # If we reach here, login was successful
        print("Login successful. Proceeding with verification.")

        # 5. Click the AI Analyst button
        ai_button = page.locator("#ai-analyst-btn")
        expect(ai_button).to_be_visible()
        ai_button.click()

        # 6. Wait for the modal and the analysis content to appear
        modal = page.locator("#ai-analysis-modal")
        expect(modal).to_be_visible(timeout=10000)
        expect(modal.get_by_role("heading", name=re.compile("Estrategia de Planificación"))).to_be_visible(timeout=35000)

        # 7. Take a screenshot
        page.screenshot(path="jules-scratch/verification/ai_analyst_modal.png")
        print("Screenshot saved to jules-scratch/verification/ai_analyst_modal.png")

    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        page.screenshot(path="jules-scratch/verification/unexpected_error.png")
        print("Error screenshot saved to jules-scratch/verification/unexpected_error.png")
        sys.exit(1)

    finally:
        context.close()
        browser.close()

with sync_playwright() as playwright:
    run(playwright)