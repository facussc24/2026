import asyncio
from playwright.async_api import async_playwright, expect
import os

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Get the absolute path to the HTML file and add the query parameter
        current_dir = os.getcwd()
        file_path = os.path.join(current_dir, 'public', 'index.html')
        test_url = f"file://{file_path}?pw_test=true"

        # 1. Go to the local HTML file with the test flag
        await page.goto(test_url)

        # With the hack in place, the button should now be visible.
        # 2. Click the new "Asistente de IA" button
        ai_assistant_button = page.get_by_role("button", name="Asistente de IA")
        await expect(ai_assistant_button).to_be_visible(timeout=10000)
        await ai_assistant_button.click()

        # 3. Wait for the modal and enter a prompt
        prompt_textarea = page.locator("#ai-assistant-prompt-input")
        await expect(prompt_textarea).to_be_visible(timeout=10000)
        await prompt_textarea.fill("Crear una tarea para revisar los planos mañana y marcar como hecha la de llamar al proveedor")

        # 4. Click the "Generate Plan" button
        generate_plan_button = page.locator("#ai-generate-plan-btn")
        await expect(generate_plan_button).to_be_enabled()
        await generate_plan_button.click()

        # 5. Wait for the "review" step to be visible by looking for its title
        await expect(page.get_by_text("Revisa el Plan Propuesto")).to_be_visible(timeout=30000)

        # 6. Take a screenshot of the final modal state
        modal_content = page.locator("#ai-assistant-modal-content")
        await expect(modal_content).to_be_visible()
        await modal_content.screenshot(path="jules-scratch/verification/verification.png")

        print("Final verification screenshot taken successfully.")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())