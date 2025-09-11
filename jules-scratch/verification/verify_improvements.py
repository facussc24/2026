from playwright.sync_api import sync_playwright, expect

def run_verification(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Capture console logs
    page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))

    try:
        # Navigate to the application
        page.goto("http://localhost:8080/")

        # Login
        page.locator('#login-email').fill("f.santoro@barackmercosul.com")
        page.locator('#login-password').fill("$oof@k24")
        page.locator('#login-form button[type="submit"]').click()

        # Wait for the main app to load after login
        expect(page.locator("#app-view")).to_be_visible(timeout=30000)

        # Click on the "Visor 3D" link
        page.locator('a[data-view="visor3d"]').click()

        # Wait for the model to load
        expect(page.locator("#visor3d-scene-container canvas")).to_be_visible(timeout=30000)

        # Wait for a specific part of the model to be rendered
        expect(page.locator("text=Paint_Matte_Red_#1")).to_be_visible(timeout=30000)


        # Take a screenshot of the initial view
        page.screenshot(path="jules-scratch/verification/01_initial_view.png")

        # Verify interior view
        page.locator("#transparency-btn").click()
        expect(page.locator('body[data-animation-status="finished"]')).to_be_visible(timeout=5000)
        page.screenshot(path="jules-scratch/verification/02_interior_view.png")
        page.locator("#transparency-btn").click() # Reset
        expect(page.locator('body[data-animation-status="finished"]')).to_be_visible(timeout=5000)


        # Verify exploded view
        page.locator("#explode-btn").click()
        expect(page.locator('body[data-animation-status="finished"]')).to_be_visible(timeout=5000)
        page.screenshot(path="jules-scratch/verification/03_exploded_view.png")
        page.locator("#explode-btn").click() # Reset
        expect(page.locator('body[data-animation-status="finished"]')).to_be_visible(timeout=5000)


        # Verify selection transparency
        # Click on a part (we'll click in the center of the canvas)
        canvas = page.locator("#visor3d-scene-container canvas")
        box = canvas.bounding_box()
        page.mouse.click(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        page.wait_for_timeout(500)

        page.locator("#selection-transparency-btn").click()
        expect(page.locator('body[data-animation-status="finished"]')).to_be_visible(timeout=5000)
        page.screenshot(path="jules-scratch/verification/04_selection_transparency.png")
        page.locator("#selection-transparency-btn").click() # Reset
        expect(page.locator('body[data-animation-status="finished"]')).to_be_visible(timeout=5000)


        # Verify multi-selection
        page.keyboard.down('Control')
        page.mouse.click(box['x'] + box['width'] / 2 + 50, box['y'] + box['height'] / 2)
        page.keyboard.up('Control')
        page.wait_for_timeout(500)
        page.screenshot(path="jules-scratch/verification/05_multi_selection.png")


    except Exception as e:
        print(f"An error occurred: {e}")
        page.screenshot(path="jules-scratch/verification/error.png")

    finally:
        # Close browser
        context.close()
        browser.close()

with sync_playwright() as playwright:
    run_verification(playwright)
