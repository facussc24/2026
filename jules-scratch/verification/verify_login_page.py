from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto("http://localhost:8081")

        # Wait for the loading overlay to disappear
        page.wait_for_selector("#loading-overlay", state="hidden")

        # Wait for the login panel to be visible
        page.wait_for_selector("#login-panel", state="visible")

        # Take a screenshot of the login screen
        page.screenshot(path="jules-scratch/verification/verification.png")

        browser.close()

if __name__ == "__main__":
    run()
