import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { getEcrFormData } from '../../public/modules/ecr/js/ecr-form-controller.js';
import { setPath } from '../../public/utils.js'; // Import setPath for use in the test

// Mocking global functions that are not part of this module but are called by getEcrFormData
global.tableToJSON = jest.fn(id => []);
global.gatherDeparts = jest.fn(() => ({}));

describe('ECR Form Data Collection', () => {

    beforeEach(() => {
        // Reset mocks before each test
        global.tableToJSON.mockClear();
        global.gatherDeparts.mockClear();
        // Set up a mock DOM for each test that includes all elements getEcrFormData interacts with
        document.body.innerHTML = `
            <form id="ecr-form">
                <input data-name="meta.ecr_no" type="text" value="ECR-001">

                <!-- Test-specific checkboxes -->
                <input data-name="enabled_checked" type="checkbox" checked>
                <input data-name="enabled_unchecked" type="checkbox">
                <input data-name="disabled_checked" type="checkbox" checked disabled>
                <input data-name="disabled_unchecked" type="checkbox" disabled>

                <!-- Required elements for the function to run without errors -->
                <div class="switch" data-name="clasificacion.afectaSR">
                    <div class="option" data-val="no">NO</div>
                    <div class="option active" data-val="si">SI</div>
                </div>
                <table id="impacto-body"></table>
                <table id="codir-body"></table>
            </form>
        `;
        // Mock the setPath function as it's used by getEcrFormData
        global.setPath = setPath;
    });

    /**
     * This test now calls the actual data gathering logic from the application.
     * It verifies the bug where disabled checkboxes were being incorrectly included in the saved data.
     * This is the same bug described in AGENTS.md Lesson #11.
     */
    test('[BUG-VERIFY] should not include the value of disabled checkboxes when collecting form data', () => {
        // Call the actual application logic instead of simulating it.
        // Note: getEcrFormData queries the global `document`, so no argument is needed.
        const dataToSave = getEcrFormData();

        // --- Assertions ---
        // 1. Check that the enabled checkboxes are present and have the correct state.
        expect(dataToSave).toHaveProperty('enabled_checked', true);
        expect(dataToSave).toHaveProperty('enabled_unchecked', false);

        // 2. Crucially, assert that the disabled checkboxes are NOT present in the final data.
        //    The original buggy code would have included them, causing this test to fail.
        expect(dataToSave).not.toHaveProperty('disabled_checked');
        expect(dataToSave).not.toHaveProperty('disabled_unchecked');

        // 3. Verify that the other parts of the function were called
        expect(dataToSave.clasificacion.afectaSR).toBe('si');
        expect(global.tableToJSON).toHaveBeenCalledWith('impacto-body');
        expect(global.tableToJSON).toHaveBeenCalledWith('codir-body');
        expect(global.gatherDeparts).toHaveBeenCalled();
    });
});
