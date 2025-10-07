import pytest
from playwright.sync_api import sync_playwright, Page, expect

def test_auth_flow_transitions(page: Page):
    """
    Verifies the authentication flow, focusing on UI consistency and transitions.
    """
    # Navigate to the local server running the application
    page.goto("http://localhost:8081")

    # Clear local storage to ensure a clean auth state
    page.evaluate("() => window.localStorage.clear()")
    page.context.clear_cookies()

    # Wait for the app to be ready by checking for a global function
    page.wait_for_function("() => typeof window.switchView === 'function'", timeout=10000)

    # Wait for the loading overlay to disappear
    loading_overlay = page.locator("#loading-overlay")
    expect(loading_overlay).to_be_hidden(timeout=10000)

    # --- 1. Verify Login Panel ---
    login_panel = page.locator("#login-panel")
    expect(login_panel).to_be_visible(timeout=5000)
    page.screenshot(path="tests/e2e/screenshots/01_login_panel.png")

    # --- 2. Transition to Register Panel ---
    register_link = page.locator('a[data-auth-screen="register"]')
    register_link.click()

    register_panel = page.locator("#register-panel")
    expect(register_panel).to_be_visible(timeout=2000)
    expect(login_panel).to_be_hidden()
    page.screenshot(path="tests/e2e/screenshots/02_register_panel.png")

    # --- 3. Transition back to Login Panel from Register ---
    login_link_from_register = page.locator('#register-panel a[data-auth-screen="login"]')
    login_link_from_register.click()

    expect(login_panel).to_be_visible(timeout=2000)
    expect(register_panel).to_be_hidden()
    page.screenshot(path="tests/e2e/screenshots/03_back_to_login.png")

    # --- 4. Transition to Forgot Password Panel ---
    reset_link = page.locator('a[data-auth-screen="reset"]')
    reset_link.click()

    reset_panel = page.locator("#reset-panel")
    expect(reset_panel).to_be_visible(timeout=2000)
    expect(login_panel).to_be_hidden()
    page.screenshot(path="tests/e2e/screenshots/04_reset_panel.png")

    # --- 5. Transition back to Login Panel from Reset ---
    login_link_from_reset = page.locator('#reset-panel a[data-auth-screen="login"]')
    login_link_from_reset.click()

    expect(login_panel).to_be_visible(timeout=2000)
    expect(reset_panel).to_be_hidden()
    page.screenshot(path="tests/e2e/screenshots/05_final_login_view.png")

def test_rapid_history_navigation(page: Page):
    """
    Verifies that rapid back/forward navigation doesn't de-sync the UI.
    """
    # Initial setup, navigate and wait for the app to be ready
    page.goto("http://localhost:8081")
    page.wait_for_function("() => typeof window.switchView === 'function'", timeout=10000)
    expect(page.locator("#loading-overlay")).to_be_hidden(timeout=10000)
    login_panel = page.locator("#login-panel")
    register_panel = page.locator("#register-panel")
    reset_panel = page.locator("#reset-panel")

    # 1. Navigate through a few screens to build up history
    page.locator('a[data-auth-screen="register"]').click()
    expect(register_panel).to_be_visible(timeout=2000)
    page.locator('#register-panel a[data-auth-screen="login"]').click()
    expect(login_panel).to_be_visible(timeout=2000)
    page.locator('a[data-auth-screen="reset"]').click()
    expect(reset_panel).to_be_visible(timeout=2000)

    # 2. Simulate rapid back/forward navigation
    page.go_back()  # Should go to login
    page.go_back()  # Should go to register
    page.go_forward() # Should go back to login

    # 3. Assert the final state is correct after animations
    expect(login_panel).to_be_visible(timeout=3000)
    expect(register_panel).to_be_hidden()
    expect(reset_panel).to_be_hidden()
    expect(page).to_have_url(RegExp(r".*#\/login"))
