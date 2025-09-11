import { jest } from '@jest/globals';

// Mock the global `lucide` object which is used by the function under test
global.lucide = {
    createIcons: jest.fn(),
};

describe('Visor3D Multi-Material Selection', () => {
    let visor3d;
    let state;
    let mockMultiMaterial;

    beforeEach(async () => {
        // Reset modules to get a fresh state for the stateful visor3d.js module
        jest.resetModules();
        visor3d = await import('../../public/modulos/visor3d/js/visor3d.js');
        state = visor3d.state;
        state.outlinePass = { selectedObjects: [] }; // Mock the outlinePass

        // Set up the necessary DOM structure
        document.body.innerHTML = `
            <div id="visor3d-piece-card"></div>
            <div id="piece-card-title"></div>
            <div id="piece-card-details"></div>
            <div id="visor3d-panel">
                <button id="isolate-btn"><i></i></button>
            </div>
            <div id="visor3d-parts-list"></div>
        `;

        mockMultiMaterial = [{ color: 'red' }, { color: 'green' }];
        global.lucide.createIcons.mockClear();
    });

    test('should add a multi-material object to the selection outline', () => {
        // Arrange
        const multiMaterialMesh = {
            isMesh: true,
            name: 'multi_material_part',
            uuid: 'multi-uuid',
            material: [...mockMultiMaterial]
        };

        // Act
        visor3d.updateSelection(multiMaterialMesh, false); // Simulate a single click

        // Assert
        // The mesh should be added to the selected objects array for the outline pass
        expect(state.outlinePass.selectedObjects).toContain(multiMaterialMesh);
        expect(state.outlinePass.selectedObjects.length).toBe(1);
    });
});
