import { jest } from '@jest/globals';

// Mock the global `lucide` object
global.lucide = {
    createIcons: jest.fn(),
};

describe('Visor3D Reset View Visibility Bug', () => {
    let visor3d;
    let modelParts;
    let resetBtn;
    let partsList;

    beforeEach(async () => {
        jest.resetModules();
        visor3d = await import('../../public/modulos/visor3d/js/visor3d.js');

        document.body.innerHTML = `
            <button id="reset-view-btn"></button>
            <div id="visor3d-parts-list">
                <ul>
                    <li data-part-name="part_to_hide">
                        <button data-action="toggle-visibility">
                            <i data-lucide="eye-off"></i>
                        </button>
                    </li>
                </ul>
            </div>
        `;

        // Mock model parts
        const part1 = { name: 'part_to_hide', uuid: 'uuid1', visible: true, isMesh: true };
        const part2 = { name: 'another_part', uuid: 'uuid2', visible: true, isMesh: true };

        // JSDOM doesn't have `dataset`, so we mock it.
        const partToHideElement = document.querySelector('li[data-part-name="part_to_hide"]');

        modelParts = [part1, part2];
        visor3d.modelParts.splice(0, visor3d.modelParts.length, ...modelParts);


        // Manually hide one part to simulate user action
        const partToHide = visor3d.modelParts.find(p => p.name === 'part_to_hide');
        partToHide.visible = false;


        // Setup event listeners by calling the exported function
        visor3d.setupVisor3dEventListeners();
        resetBtn = document.getElementById('reset-view-btn');
    });

    test('[FAILING TEST] clicking reset button should make all manually hidden parts visible again', () => {
        const partToHide = visor3d.modelParts.find(p => p.name === 'part_to_hide');

        // Pre-condition: Assert the part is actually hidden before the test
        expect(partToHide.visible).toBe(false);

        // Act: Simulate a click on the reset button
        resetBtn.click();

        // Assert: The part should now be visible
        expect(partToHide.visible).toBe(true);

    });
});
