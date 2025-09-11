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
    let state;
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

        // Import the module and its state
        visor3d = await import('../../public/modulos/visor3d/js/visor3d.js');
        state = visor3d.state;
        state.outlinePass = { selectedObjects: [] }; // Mock the outlinePass

        // Mock parts and materials
        const material1 = { uuid: 'mat1', name: 'material1', clone: () => ({...material1}) };
        const material2 = { uuid: 'mat2', name: 'material2', clone: () => ({...material2}) };
        part1 = { name: 'part1', uuid: 'uuid1', isMesh: true, material: material1 };
        part2 = { name: 'part2', uuid: 'uuid2', isMesh: true, material: material2 };

        // Reset state
        visor3d.modelParts.length = 0;
        visor3d.modelParts.push(part1, part2);
        visor3d.selectedObjects.length = 0;
        visor3d.transparentMaterials?.clear();
        if (visor3d.isSelectionTransparencyActive) {
            visor3d.toggleSelectionTransparency(); // Ensure it's off initially
        }
    });

    test('should correctly select a part when transparency mode is active', () => {
        // 1. Activate selection transparency mode
        visor3d.toggleSelectionTransparency();

        // Verification 1: No objects should be in the outline pass initially
        expect(state.outlinePass.selectedObjects.length).toBe(0);

        // 2. Simulate selecting part1
        visor3d.updateSelection(part1, false);

        // Verification 2: part1 should be in the outline pass selected objects.
        expect(state.outlinePass.selectedObjects.length).toBe(1);
        expect(state.outlinePass.selectedObjects[0]).toBe(part1);

        // Verification 3: The underlying selection array should also be correct
        expect(visor3d.selectedObjects.length).toBe(1);
        expect(visor3d.selectedObjects[0]).toBe(part1);
    });
});
