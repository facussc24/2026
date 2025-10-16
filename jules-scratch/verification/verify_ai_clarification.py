
import re
from playwright.sync_api import sync_playwright, Page, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        page.goto("http://localhost:3000")

        # 1. Login
        expect(page.locator("#loading-overlay")).to_be_hidden(timeout=10000)
        page.locator("#login-email").fill("f.santoro@barackmercosul.com")
        page.locator("#login-password").fill("$oof@k24")
        page.get_by_role("button", name="Iniciar Sesión").click()
        expect(page.get_by_role("heading", name="Página Principal")).to_be_visible(timeout=15000)
        print("Logged in successfully.")

        # 2. Open AI assistant
        ai_button = page.locator("#ai-assistant-btn")
        expect(ai_button).to_be_visible(timeout=15000)
        ai_button.click()

        modal = page.locator("#ai-assistant-modal")
        expect(modal).to_be_visible(timeout=10000)
        print("AI assistant opened.")

        # 3. Send ambiguous prompt
        prompt_text = "crea una tarea nueva en el planning con fecha de inicio y fecha final con un progreso del 53%"
        page.locator("#ai-chat-input").fill(prompt_text)
        page.locator("#ai-chat-send-btn").click()
        print("Ambiguous prompt sent.")

        # 4. Verify the AI asks for clarification
        # Wait for the AI's response bubble to appear
        ai_response_locator = page.locator(".flex.items-start.gap-3.my-4.animate-fade-in-up.justify-start").last

        # We expect the response to contain the helpful error message.
        expect(ai_response_locator).to_contain_text("No pude procesar completamente tu solicitud", timeout=30000)
        print("SUCCESS: AI correctly returned a helpful error message.")

        # Also assert it does NOT contain the old error message
        expect(ai_response_locator).not_to_contain_text("No se generó un resumen")
        print("SUCCESS: AI did not produce the old, unhelpful error message.")

        # 5. Take screenshot
        page.screenshot(path="jules-scratch/verification/ai_clarification_verification.png")
        print("Verification screenshot taken.")

    except Exception as e:
        print(f"An error occurred: {e}")
        page.screenshot(path="jules-scratch/verification/error_ai_clarification.png")

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
