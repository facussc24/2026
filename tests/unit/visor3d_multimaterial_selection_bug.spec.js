import { jest } from '@jest/globals';

// Mock the global `lucide` object which is used by the function under test
global.lucide = {
    createIcons: jest.fn(),
};

describe('Visor3D Multi-Material Selection', () => {
    let selectObject;
    let mockMultiMaterial;

    beforeEach(async () => {
        // Reset modules to get a fresh state for the stateful visor3d.js module
        jest.resetModules();
        const freshModule = await import('../../public/modulos/visor3d/js/visor3d.js');
        selectObject = freshModule.selectObject;

        // Set up the necessary DOM structure
        document.body.innerHTML = `
            <div id="visor3d-piece-card"></div>
            <div id="piece-card-title"></div>
            <div id="piece-card-details"></div>
            <div id="visor3d-panel">
                <button id="isolate-btn"><i></i></button>
            </div>
        `;

        mockMultiMaterial = [{ color: 'red' }, { color: 'green' }];
        global.lucide.createIcons.mockClear();
    });

    test('[Failing Test] should apply highlight material to a multi-material object', () => {
        // Arrange
        const multiMaterialMesh = {
            isMesh: true,
            name: 'multi_material_part',
            material: [...mockMultiMaterial]
        };

        // Act
        selectObject(multiMaterialMesh);

        // Assert
        // With the bug, the material array is unchanged. This test will fail.
        expect(multiMaterialMesh.material).not.toEqual(mockMultiMaterial);
        expect(multiMaterialMesh.material[0].color).toBe(0xff0000);
        expect(multiMaterialMesh.material[1].color).toBe(0xff0000);
    });
});
