import re
from playwright.sync_api import sync_playwright, Page, expect

def run_verification(page: Page):
    """
    This script verifies that the AI assistant modal correctly handles
    content overflow when the 'thought process' accordion is expanded,
    ensuring the main action buttons remain visible.
    """
    # 1. Login
    page.goto("http://localhost:3000")

    loading_overlay = page.locator("#loading-overlay")
    expect(loading_overlay).to_be_hidden(timeout=15000)

    page.locator("#login-email").fill("f.santoro@barackmercosul.com")
    page.locator("#login-password").fill("$oof@k24")
    page.get_by_role("button", name="Iniciar Sesión").click()
    expect(page.get_by_role("heading", name="Página Principal")).to_be_visible(timeout=15000)

    # 2. Programmatically switch to the task dashboard
    page.evaluate("window.switchView('task-dashboard')")

    # 3. Open AI Assistant
    ai_assistant_btn = page.get_by_role("button", name="Asistente IA")
    expect(ai_assistant_btn).to_be_visible(timeout=15000)
    ai_assistant_btn.click()

    # 4. Enter a prompt to generate a plan
    modal = page.locator("#ai-assistant-modal")
    expect(modal).to_be_visible()
    prompt_input = modal.locator("#ai-assistant-prompt-input")

    prompt_text = "Replanifica las tareas de ayer y hoy, balanceando la carga para la proxima semana."
    prompt_input.fill(prompt_text)
    modal.get_by_role("button", name="Generar Plan").click()

    # 5. Wait for the review view and expand the accordion
    review_view_heading = modal.get_by_role("heading", name="Revisa el Plan Propuesto")
    expect(review_view_heading).to_be_visible(timeout=45000)

    thought_process_accordion_btn = modal.locator("#thought-process-accordion-btn")
    expect(thought_process_accordion_btn).to_be_visible()
    thought_process_accordion_btn.click()

    # 6. Verify that the action buttons are still visible after expansion
    confirm_button = modal.get_by_role("button", name="Confirmar y Ejecutar")
    expect(confirm_button).to_be_visible()

    reject_button = modal.get_by_role("button", name="Volver a Editar")
    expect(reject_button).to_be_visible()

    # 7. Take a screenshot for visual confirmation
    page.screenshot(path="jules-scratch/verification/final_modal_overflow_fix.png")

# Main execution block
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    run_verification(page)
    browser.close()

print("Verification script for the final modal overflow fix completed. Screenshot 'final_modal_overflow_fix.png' generated.")