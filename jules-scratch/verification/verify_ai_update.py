import re
from playwright.sync_api import Page, expect

def test_ai_can_schedule_unscheduled_tasks(page: Page):
    """
    Test that the AI assistant can find unscheduled tasks and propose a plan to schedule them.
    """
    page.goto("http://localhost:8080")

    # Wait for the loading overlay to be hidden before interacting with the page
    expect(page.locator("#loading-overlay")).to_be_hidden(timeout=10000)

    # Login
    page.locator("#login-email").fill("f.santoro@barackmercosul.com")
    page.locator("#login-password").fill("$oof@k24")
    page.get_by_role("button", name="Iniciar Sesión").click()

    # Wait for navigation to the main page by waiting for the main heading to appear.
    # This is a reliable signal of a successful login. The URL hash assertion is removed
    # as the app doesn't update it on programmatic login.
    expect(page.get_by_role("heading", name="Página Principal")).to_be_visible(timeout=10000)

    # Click the AI assistant button
    page.locator("#ai-assistant-btn").click()

    # Wait for the modal to appear
    expect(page.locator("#ai-assistant-modal")).to_be_visible()

    # Enter the prompt and submit
    prompt = "Asigna una fecha de planificación a todas las tareas que no la tengan."
    page.locator("#ai-assistant-prompt-input").fill(prompt)
    page.locator("#ai-generate-plan-btn").click()

    # Wait for the plan review form to appear inside the modal
    expect(page.locator("#ai-execution-plan-form")).to_be_visible(timeout=60000) # Increased timeout for AI processing

    # Verify the plan looks reasonable
    expect(page.locator("#ai-assistant-modal-content")).to_contain_text("Revisa el Plan Propuesto")
    expect(page.locator("#ai-execution-plan-form")).to_contain_text("UPDATE") # Check that it's proposing updates

    # Take a screenshot
    page.screenshot(path="jules-scratch/verification/ai_scheduling_plan.png")

    # Close the modal
    page.locator("#ai-assistant-modal-content button[data-action='close']").click()
    expect(page.locator("#ai-assistant-modal")).not_to_be_visible()