from playwright.sync_api import sync_playwright, Page, expect
import re

def run_verification(page: Page):
    """
    This script navigates the application to trigger the PDF export
    and captures console logs to diagnose an error.
    """
    # Add a listener for all console messages
    page.on("console", lambda msg: print(f"BROWSER CONSOLE: {msg.type} >> {msg.text}"))

    print("Navigating to the application...")
    page.goto("http://localhost:8080", wait_until="networkidle")

    # Login
    print("Logging in...")
    # Use locators that are less likely to fail due to case sensitivity or minor text changes.
    page.locator("#login-email").fill("f.santoro@barackmercosul.com")
    page.locator("#login-password").fill("$oof@k24")
    page.get_by_role("button", name="Iniciar Sesión").click()

    # Wait for dashboard to load to be sure login was successful
    print("Waiting for dashboard to load...")
    expect(page.get_by_text("Dashboard de Control")).to_be_visible(timeout=15000)
    print("Dashboard loaded.")

    # Navigate to the correct view
    print("Navigating to Tabular BOM Report...")
    # The link is inside a dropdown, so we need to click the toggle first.
    page.locator('.dropdown-toggle', has_text=re.compile(r'Ingeniería', re.IGNORECASE)).click()
    page.get_by_role("link", name="Reporte BOM (Tabular)").click()
    print("Navigated to report view.")

    # The view starts with a product selection screen. Click the button to open the modal.
    print("Opening product selection modal...")
    page.get_by_role("button", name="Seleccionar Producto").click()

    # Wait for the modal to appear and select the first product
    print("Waiting for modal and selecting first product...")
    first_product_button = page.locator("#search-prod-results button").first
    expect(first_product_button).to_be_visible(timeout=10000)
    first_product_button.click()
    print("Product selected.")

    # Now the report view should be rendered. Click the export button.
    print("Waiting for export button and clicking it...")
    export_button = page.get_by_role("button", name="Exportar a PDF")
    expect(export_button).to_be_visible(timeout=10000)
    export_button.click()
    print("Export button clicked.")

    # Wait a bit for the PDF generation and logging to happen.
    print("Waiting for console logs...")
    page.wait_for_timeout(5000) # 5 seconds should be enough
    print("Verification script finished.")

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            run_verification(page)
        except Exception as e:
            print(f"An error occurred: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    main()
