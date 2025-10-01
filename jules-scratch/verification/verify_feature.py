from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:3000")

        # Wait for the global loading overlay to be hidden first.
        expect(page.locator("#loading-overlay")).to_be_hidden(timeout=60000)

        # Now, wait for the login form to be visible.
        expect(page.locator("#login-form")).to_be_visible()

        # Fill in the login form using the correct IDs.
        page.fill('#login-email', "f.santoro@barackmercosul.com")
        page.fill('#login-password', "$oof@k24")

        # Click the login button.
        page.click('button[type="submit"]')

        # Wait for the main dashboard heading to be visible.
        dashboard_heading = page.get_by_role("heading", name="Página Principal")
        expect(dashboard_heading).to_be_visible(timeout=60000)

        # Navigate to the task dashboard view.
        page.evaluate("window.switchView('task-dashboard')")

        # Wait for the task dashboard title to be correct
        expect(page.locator("#view-title")).to_have_text("Dashboard de Tareas")

        # Click the correct AI Assistant button on the dashboard view
        page.click("#ai-assistant-btn")

        # Wait for the modal to be visible.
        expect(page.locator("#ai-assistant-modal")).to_be_visible()

        # Type the test prompt into the textarea.
        page.fill("#ai-assistant-prompt-input", "Replanifica las tareas de ayer para los próximos días.")

        # Click the send button.
        page.click("#ai-generate-plan-btn")

        # Wait for the review view to be visible, indicating the plan was generated.
        expect(page.locator("#ai-execution-plan-form")).to_be_visible(timeout=60000)

        # Take the final screenshot for verification.
        page.screenshot(path="jules-scratch/verification/verification.png")

        browser.close()

if __name__ == "__main__":
    run()