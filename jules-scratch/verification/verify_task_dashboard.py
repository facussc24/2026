from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        # Navigate directly to the main page, bypassing login
        page.goto("http://localhost:8080/public/index.html?e2e-test=true", timeout=60000)
        page.wait_for_load_state('networkidle', timeout=30000)

        # Wait for the main app view to be visible
        expect(page.locator("#app-view")).to_be_visible(timeout=10000)

        # Navigate to the tasks view
        page.locator('a[data-view="tareas"]').click()

        # Wait for the kanban board to be visible
        expect(page.locator("#task-board")).to_be_visible(timeout=10000)

        # Click the "Ver Estadísticas" button to go to the dashboard
        page.locator("#go-to-stats-view-btn").click()

        # Wait for the dashboard charts to be visible
        expect(page.locator("#status-chart")).to_be_visible(timeout=10000)
        expect(page.locator("#priority-chart")).to_be_visible(timeout=10000)

        # Click on the "Tabla de Tareas" tab
        page.locator('button[data-tab="table"]').click()

        # Wait for the task table to be visible
        expect(page.locator("#task-data-table-container table")).to_be_visible(timeout=10000)

        # Take a screenshot
        page.screenshot(path="jules-scratch/verification/task-dashboard-table.png")

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
