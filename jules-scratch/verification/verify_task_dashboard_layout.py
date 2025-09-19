from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        # Go to the login page
        page.goto("http://localhost:8080")

        # Log in
        page.locator("#login-email").fill("f.santoro@barackmercosul.com")
        page.locator("#login-password").fill("$oof@k24")
        page.get_by_role("button", name="Iniciar Sesión").click()

        # Wait for navigation to the main page and for the "Tareas" link to be visible
        tareas_link = page.get_by_role("link", name="Tareas")
        expect(tareas_link).to_be_visible()
        tareas_link.click()

        # Wait for the kanban board to load, then click the "Ver Estadísticas" button
        stats_button = page.get_by_role("button", name="Ver Estadísticas")
        expect(stats_button).to_be_visible()
        stats_button.click()

        # Wait for the dashboard to load by looking for its title
        dashboard_title = page.get_by_role("heading", name="Estadísticas del Equipo")
        expect(dashboard_title).to_be_visible()

        # Give a little time for charts to animate
        page.wait_for_timeout(1000)

        # Take a screenshot
        screenshot_path = "jules-scratch/verification/task_dashboard_layout_fix.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

    except Exception as e:
        print(f"An error occurred: {e}")
        # On error, take a screenshot for debugging
        page.screenshot(path="jules-scratch/verification/error_screenshot.png")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
