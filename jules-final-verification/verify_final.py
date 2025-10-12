from playwright.sync_api import sync_playwright, expect

def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Set a larger viewport
        page.set_viewport_size({"width": 1920, "height": 1080})

        page.goto('http://localhost:3000')

        # Wait for login screen
        expect(page.locator("#loading-overlay")).to_be_hidden(timeout=10000)

        # Log in
        page.fill('#login-email', 'f.santoro@barackmercosul.com')
        page.fill('#login-password', '$oof@k24')
        page.click('button[type="submit"]')

        # Wait for main page
        expect(page.locator("#view-title")).to_have_text("Página Principal", timeout=10000)

        # Go to Planning page
        page.click('a[data-view="planning"]')

        # Check that the main title is now "Planning"
        expect(page.locator("#view-title")).to_have_text("Planning")

        # Check that the AI Assistant button is visible
        expect(page.locator("#ai-assistant-button")).to_be_visible()

        # Take a screenshot of the planning page
        page.screenshot(path='jules-final-verification/planning_page.png')
        print("Planning page screenshot captured.")

        browser.close()

if __name__ == '__main__':
    run_test()
