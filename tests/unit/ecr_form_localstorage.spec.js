import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { saveEcrFormToLocalStorage } from '../../public/utils.js';

// Mock localStorage
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => {
            store[key] = value.toString();
        },
        clear: () => {
            store = {};
        },
        removeItem: (key) => {
            delete store[key];
        }
    };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });


describe('ECR Form Local Storage Persistence', () => {
    let formContainer;
    const ECR_FORM_STORAGE_KEY = 'test_ecr_form_key';

    beforeEach(() => {
        // Set up a mock DOM for each test
        document.body.innerHTML = `
            <form id="ecr-form">
                <input type="checkbox" name="enabled_checked" checked>
                <input type="checkbox" name="enabled_unchecked">
                <input type="checkbox" name="disabled_checked" checked disabled>
                <input type="checkbox" name="disabled_unchecked" disabled>
                <input type="text" name="text_field" value="some_value">
            </form>
        `;
        formContainer = document.getElementById('ecr-form');
        localStorage.clear();
    });

    /**
     * This test now directly calls the refactored 'saveEcrFormToLocalStorage' function
     * from the main application code. It verifies that the function correctly ignores
     * disabled checkboxes when saving data.
     *
     * This test is designed to FAIL when the function has the bug, and PASS when it is fixed.
     */
    test('[BUG-VERIFY] saveEcrFormToLocalStorage should not include disabled checkboxes', () => {
        // Spy on localStorage.setItem to see what's being saved
        const setItemSpy = jest.spyOn(window.localStorage, 'setItem');

        // Call the actual function from utils.js
        saveEcrFormToLocalStorage(formContainer, ECR_FORM_STORAGE_KEY);

        // Expect the function to have been called
        expect(setItemSpy).toHaveBeenCalledWith(ECR_FORM_STORAGE_KEY, expect.any(String));

        // Get the data that was passed to setItem
        const savedDataJSON = setItemSpy.mock.calls[0][1];
        const savedData = JSON.parse(savedDataJSON);

        // Assert that the disabled checkboxes are NOT in the final data.
        expect(savedData).not.toHaveProperty('disabled_checked');
        expect(savedData).not.toHaveProperty('disabled_unchecked');

        // Also confirm that the enabled checkboxes and other fields are still present.
        expect(savedData).toHaveProperty('enabled_checked', true);
        expect(savedData).toHaveProperty('enabled_unchecked', false);
        expect(savedData).toHaveProperty('text_field', 'some_value');

        // Clean up spy
        setItemSpy.mockRestore();
    });
});
