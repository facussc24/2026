import { jest } from '@jest/globals';
import * as THREE from 'three';

// Mock the global `lucide` object
global.lucide = {
    createIcons: jest.fn(),
};

// Mock the global THREE object for material cloning
global.THREE = {
    Color: jest.fn(),
    MeshStandardMaterial: jest.fn().mockImplementation(() => ({
        clone: jest.fn().mockReturnThis(),
        emissive: { set: jest.fn() },
    })),
};

describe('Visor3D Selection Transparency Bug', () => {
    let visor3d;
    let part1, part2;

    beforeEach(async () => {
        jest.resetModules();

        // Set up DOM
        document.body.innerHTML = `
            <div id="visor3d-scene-container"></div>
            <div id="visor3d-panel">
                <button id="selection-transparency-btn"></button>
                <button id="isolate-btn"></button>
            </div>
            <div id="visor3d-parts-list"></div>
            <div id="visor3d-piece-card"></div>
            <div id="piece-card-title"></div>
            <div id="piece-card-details"></div>
        `;

        // Import the module
        visor3d = await import('../../public/modulos/visor3d/js/visor3d.js');

        // Mock parts and materials
        const material1 = { uuid: 'mat1', name: 'material1', clone: () => ({...material1}) };
        const material2 = { uuid: 'mat2', name: 'material2', clone: () => ({...material2}) };
        part1 = { name: 'part1', uuid: 'uuid1', isMesh: true, material: material1 };
        part2 = { name: 'part2', uuid: 'uuid2', isMesh: true, material: material2 };

        // Reset state
        visor3d.modelParts.length = 0;
        visor3d.modelParts.push(part1, part2);
        visor3d.selectedObjects.length = 0;
        visor3d.originalMaterials.clear();
        visor3d.transparentMaterials?.clear();
        if (visor3d.isSelectionTransparencyActive) {
            visor3d.toggleSelectionTransparency(); // Ensure it's off initially
        }
    });

    test('should correctly select and highlight a part when transparency mode is active', () => {
        // 1. Activate selection transparency mode
        visor3d.toggleSelectionTransparency();

        // Verification 1: All parts should be transparent and none selected
        // The test for transparency itself is complex, so we trust the function call
        // and focus on the selection interaction.
        expect(visor3d.selectedObjects.length).toBe(0);

        // 2. Simulate selecting part1, which is currently transparent
        visor3d.updateSelection(part1, false);

        // Verification 2: part1 should be selected and highlighted, not transparent.
        expect(visor3d.selectedObjects.length).toBe(1);
        expect(visor3d.selectedObjects[0]).toBe(part1);

        // Check if the material is the highlight material.
        // The bug is that the material gets reverted to transparent.
        // A highlighted material has a defined emissive property and is not transparent.
        expect(part1.material.emissive).toBeDefined();
        expect(part1.material.transparent).not.toBe(true);

        // Verification 3: part2 should remain transparent.
        // A transparent material will have the `transparent` flag set to true.
        expect(part2.material.transparent).toBe(true);
    });
});
