import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { getEcrFormData } from '../../public/data_logic.js';

describe.skip('ECR Form Data Collection', () => {

    beforeEach(() => {
        // Set up a mock DOM for each test
        document.body.innerHTML = `
            <form id="ecr-form">
                <input type="text" name="ecr_no" value="ECR-001">
                <input type="checkbox" name="enabled_checked" checked>
                <input type="checkbox" name="enabled_unchecked">
                <input type="checkbox" name="disabled_checked" checked disabled>
                <input type="checkbox" name="disabled_unchecked" disabled>
            </form>
        `;
    });

    /**
     * This test now calls the actual data gathering logic from the application.
     * It verifies the bug where disabled checkboxes were being incorrectly included in the saved data.
     * This is the same bug described in AGENTS.md Lesson #11.
     */
    test('[BUG-VERIFY] should not include the value of disabled checkboxes when collecting form data', () => {
        const formContainer = document.getElementById('ecr-form');

        // Call the actual application logic instead of simulating it.
        const dataToSave = getEcrFormData(formContainer);

        // --- Assertions ---
        // 1. Check that the enabled checkboxes are present and have the correct state.
        expect(dataToSave).toHaveProperty('enabled_checked', true);
        expect(dataToSave).toHaveProperty('enabled_unchecked', false);

        // 2. Crucially, assert that the disabled checkboxes are NOT present in the final data.
        //    The original buggy code would have included them, causing this test to fail.
        expect(dataToSave).not.toHaveProperty('disabled_checked');
        expect(dataToSave).not.toHaveProperty('disabled_unchecked');
    });
});
