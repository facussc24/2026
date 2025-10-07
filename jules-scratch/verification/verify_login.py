from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto("http://localhost:8081")

        # Wait for the DOM to be fully loaded and parsed
        page.wait_for_load_state('domcontentloaded')

        # Wait for the app to be initialized by checking if the showAuthScreen function is available
        page.wait_for_function("!!window.showAuthScreen")

        # Directly call the function to ensure the login screen is visible
        page.evaluate("window.showAuthScreen('login')")

        # Take a screenshot to verify the login panel is visible
        page.screenshot(path="jules-scratch/verification/verification.png")

        browser.close()

if __name__ == "__main__":
    run()
