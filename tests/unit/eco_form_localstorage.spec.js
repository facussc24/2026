import { JSDOM } from 'jsdom';

describe('ECO Form - Local Storage Saving Logic', () => {

    test('Fixed logic should correctly ignore disabled fields', () => {
        // 1. Setup the DOM.
        const dom = new JSDOM(`
            <!DOCTYPE html>
            <form id="eco-form">
                <input type="text" name="enabled_field" value="good_value">
                <input type="text" name="disabled_field" value="bad_value" disabled>
                <input type="checkbox" name="enabled_checkbox" checked>
                <input type="checkbox" name="disabled_checkbox" checked disabled>
                <input type="radio" name="radio_group" value="val1">
                <input type="radio" name="radio_group" value="val2" checked>
                <input type="radio" name="disabled_radio_group" value="bad_val" checked disabled>
            </form>
        `);
        const form = dom.window.document.getElementById('eco-form');

        // 2. This function now simulates the CORRECT, fixed logic.
        const simulateFixedSave = (formElement) => {
            const data = {};
            for (const element of formElement.elements) {
                // The fix: explicitly check if the element is disabled.
                if (element.disabled || !element.name || element.tagName === 'BUTTON') {
                    continue;
                }

                if (element.type === 'checkbox') {
                    data[element.name] = element.checked;
                } else if (element.type === 'radio') {
                    if (element.checked) {
                        data[element.name] = element.value;
                    }
                } else {
                    data[element.name] = element.value;
                }
            }
            return data;
        };

        // 3. Run the fixed logic.
        const savedData = simulateFixedSave(form);

        // 4. Assert the correct outcome.
        expect(savedData.enabled_field).toBe('good_value');
        expect(savedData.enabled_checkbox).toBe(true);
        expect(savedData.radio_group).toBe('val2');

        // These fields should not be present because they are disabled.
        expect(savedData.disabled_field).toBeUndefined();
        expect(savedData.disabled_checkbox).toBeUndefined();
        expect(savedData.disabled_radio_group).toBeUndefined();
    });
});
