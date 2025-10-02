import re
import json
from playwright.sync_api import Page, expect

def test_ai_delete_action_ui_with_mock(page: Page):
    """
    This test verifies that the AI Assistant's plan review modal correctly
    displays a 'DELETE' action by mocking the AI's response.
    """
    # 1. Arrange: Define the mock AI response.
    mock_plan = {
        "thoughtProcess": "The user wants to delete a task. I have identified the task and will create a deletion action.",
        "executionPlan": [
            {
                "action": "DELETE",
                "docId": "mockTaskId123",
                "originalTitle": "Task to be Deleted by AI"
            }
        ]
    }

    # 2. Arrange: Set up the network mock.
    # This intercepts the call to the AI function and returns our predefined plan.
    page.route(
        "**/aiProjectAgent",
        lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"result": mock_plan})
        )
    )

    # 3. Arrange: Login and navigate to the main task page.
    page.goto("http://localhost:8080")

    loading_overlay = page.locator("#loading-overlay")
    expect(loading_overlay).to_be_hidden(timeout=10000)

    page.get_by_label("Correo electrónico").fill("f.santoro@barackmercosul.com")
    page.get_by_label("Contraseña").fill("$oof@k24")
    page.get_by_role("button", name="Iniciar Sesión").click()

    expect(page.get_by_role("heading", name="Página Principal")).to_be_visible(timeout=10000)

    # 4. Act: Open the AI Assistant and trigger the (mocked) plan generation.
    page.get_by_role("button", name="Asistente IA").click()

    ai_modal = page.locator("#ai-assistant-modal")
    expect(ai_modal).to_be_visible()

    # The prompt text doesn't matter here since we are mocking the response.
    ai_modal.get_by_placeholder(re.compile("crear tarea", re.IGNORECASE)).fill("delete the test task")
    ai_modal.get_by_role("button", name="Generar Plan").click()

    # 5. Assert: Verify the review view is correct based on the mock data.
    expect(ai_modal.get_by_role("heading", name="Revisa el Plan Propuesto")).to_be_visible(timeout=20000)

    delete_action_card = ai_modal.locator(".ai-plan-action-item", has_text="Eliminar Tarea")
    expect(delete_action_card).to_be_visible()

    expect(delete_action_card.get_by_text('"Task to be Deleted by AI"')).to_be_visible()

    # 6. Screenshot: Capture the final result for visual verification.
    page.screenshot(path="jules-scratch/verification/verification.png")