import { jest } from '@jest/globals';

// Mock the global `lucide` object
global.lucide = {
    createIcons: jest.fn(),
};

describe('Visor3D Isolation Mode Visibility Bug', () => {
    let visor3d;
    let modelParts;

    beforeEach(async () => {
        jest.resetModules();
        visor3d = await import('../../public/modulos/visor3d/js/visor3d.js');

        document.body.innerHTML = `
            <button id="isolate-btn"><i></i></button>
            <div id="visor3d-piece-card"></div>
            <div id="piece-card-title"></div>
            <div id="piece-card-details"></div>
            <div id="visor3d-parts-list"></div>
        `;

        // Mock model parts
        const part1 = { name: 'part_visible', uuid: 'uuid1', visible: true, isMesh: true, material: {} };
        const part2 = { name: 'part_hidden', uuid: 'uuid2', visible: false, isMesh: true, material: {} };
        const part3 = { name: 'part_also_visible', uuid: 'uuid3', visible: true, isMesh: true, material: {} };

        modelParts = [part1, part2, part3];
        visor3d.modelParts.push(...modelParts);
    });

    test('should preserve manual visibility states after exiting isolation mode', () => {
        const hiddenPart = visor3d.modelParts.find(p => p.name === 'part_hidden');
        const selectedPart = visor3d.modelParts.find(p => p.name === 'part_visible');

        // Pre-condition check
        expect(hiddenPart.visible).toBe(false);

        // 1. Select a visible part
        visor3d.updateSelection(selectedPart, false);
        expect(visor3d.selectedObjects.length).toBe(1);

        // 2. Enter isolation mode
        visor3d.toggleIsolation();

        // Verify that only the selected part is visible during isolation
        expect(selectedPart.visible).toBe(true);
        expect(hiddenPart.visible).toBe(false);
        expect(visor3d.modelParts.find(p => p.name === 'part_also_visible').visible).toBe(false);

        // 3. Exit isolation mode
        visor3d.toggleIsolation();

        // 4. Assert: The manually hidden part should remain hidden
        expect(hiddenPart.visible).toBe(false);

        // Also check that other parts are restored to their original state (visible)
        expect(selectedPart.visible).toBe(true);
        expect(visor3d.modelParts.find(p => p.name === 'part_also_visible').visible).toBe(true);
    });
});
