from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto("http://localhost:8081")

        # Wait for the loading overlay to disappear
        page.wait_for_selector("#loading-overlay", state="hidden")

        # Wait for the login panel to be visible
        page.wait_for_selector("#login-panel", state="visible")

        # Fill in the login form with correct credentials
        page.fill("#login-email", "f.santoro@barackmercosul.com")
        page.fill("#login-password", "$oof@k24")
        page.click("button[type='submit']")

        # Wait for the main application view to be visible and the title to be "Página Principal"
        app_view = page.locator("#app-view")
        expect(app_view).to_be_visible()

        view_title = page.locator("#view-title")
        expect(view_title).to_have_text("Página Principal")

        # Take a screenshot of the main dashboard
        page.screenshot(path="jules-scratch/verification/verification.png")

        browser.close()

if __name__ == "__main__":
    run()
