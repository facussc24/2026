from playwright.sync_api import sync_playwright, expect

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            # 1. Navigate and Login
            page.goto("http://localhost:8080")
            page.wait_for_selector("#login-form", state="visible")
            page.fill('input[type="email"]', "f.santoro@barackmercosul.com")
            page.fill('#login-password', "123456")

            # Use a more robust selector for the login button
            login_button = page.get_by_role("button", name="Iniciar Sesión")
            login_button.click()
            print("Clicked on 'Iniciar Sesión' button.")

            # Wait for login to complete and dashboard to be visible
            expect(page.locator("#dashboard-kpi-container")).to_be_visible(timeout=10000)
            print("Login successful, dashboard is visible.")

            # 2. Navigate to Tareas view
            tareas_link = page.locator('a[data-view="tareas"]')
            expect(tareas_link).to_be_visible()
            tareas_link.click()
            print("Clicked on 'Tareas' link.")

            # 3. Open the New Task modal
            add_task_button = page.locator("#add-new-task-btn")
            expect(add_task_button).to_be_visible()
            add_task_button.click()
            print("Clicked 'Nueva Tarea' button.")

            # 4. Wait for the modal and take screenshot
            modal = page.locator("#task-form-modal")
            expect(modal).to_be_visible()
            print("Modal is visible.")

            page.screenshot(path="jules-scratch/verification/verification.png")
            print("Screenshot taken successfully.")

        except Exception as e:
            print(f"An error occurred: {e}")
            page.screenshot(path="jules-scratch/verification/error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    run_verification()
