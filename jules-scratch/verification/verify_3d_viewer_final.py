import re
import os
from playwright.sync_api import sync_playwright, Page, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        # 1. Navigate directly to the main page file to bypass login issues.
        page.goto(f"file://{os.getcwd()}/public/index.html")

        # 2. Wait for the application to be fully initialized by checking for a key function.
        page.wait_for_function("window.switchView", timeout=15000)

        # 3. Manually trigger the 3D viewer.
        page.evaluate("window.switchView('visor3d')")

        # 4. Wait for the 3D model to load by checking for the parts list.
        expect(page.locator("#visor3d-parts-list ul")).to_contain_text("part", timeout=20000)

        # 5. Open Visual Controls and change environment.
        page.get_by_text("Controles Visuales").click()
        page.locator("#environment-select").select_option("studio_small_01_1k.hdr")
        page.wait_for_timeout(1000) # Give time for the environment to load.

        # 6. Take a screenshot showing the new "Studio" environment.
        page.screenshot(path="jules-scratch/verification/01_studio_environment.png")

        # 7. Activate Clipping.
        page.locator("#more-controls-btn").click()
        page.get_by_role("button", name="Vista de Sección").click()
        page.locator("#clipping-controls-details").get_by_role("button", name="Z").click()
        page.locator("#clipping-position").fill("0.5")
        page.wait_for_timeout(500)

        # 8. Take a screenshot showing the clipping view.
        page.screenshot(path="jules-scratch/verification/02_clipping_view.png")

        # 9. Use the navigation gizmo to change the camera angle.
        gizmo = page.locator("#axis-gizmo-container")
        gizmo_box = gizmo.bounding_box()
        if gizmo_box:
            # Click on the top-right corner for an isometric-like view
            page.mouse.click(gizmo_box['x'] + gizmo_box['width'] * 0.85, gizmo_box['y'] + gizmo_box['height'] * 0.15)

        page.wait_for_timeout(1000) # Wait for camera animation.

        # 10. Take a final screenshot showing the new camera angle and features.
        page.screenshot(path="jules-scratch/verification/03_final_view.png")

        print("Verification script completed successfully. Screenshots saved.")

    except Exception as e:
        print(f"An error occurred during verification: {e}")
        page.screenshot(path="jules-scratch/verification/error.png")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)