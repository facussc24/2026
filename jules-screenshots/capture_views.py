from playwright.sync_api import sync_playwright, expect

def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Set a larger viewport to ensure responsive elements are visible
        page.set_viewport_size({"width": 1920, "height": 1080})

        page.goto('http://localhost:3000')

        # Wait for the loading overlay to be hidden
        loading_overlay = page.locator("#loading-overlay")
        expect(loading_overlay).to_be_hidden(timeout=10000)

        # Log in
        page.fill('#login-email', 'f.santoro@barackmercosul.com')
        page.fill('#login-password', '$oof@k24')
        page.click('button[type="submit"]')

        # Wait for navigation to the main page
        expect(page.locator("#view-title")).to_have_text("Página Principal", timeout=10000)

        # Navigate to the planning page
        page.click('a[data-view="planning"]')

        # Wait for the main view title to be updated to "Planning"
        expect(page.locator("#view-title")).to_have_text("Planning")

        # Take a screenshot of the annual view
        page.screenshot(path='jules-screenshots/annual_view.png')
        print("Annual view screenshot captured.")

        browser.close()

if __name__ == '__main__':
    run_test()
