import { jest } from '@jest/globals';

// Mock the global `lucide` object
global.lucide = {
    createIcons: jest.fn(),
};

// Mock a basic material object that can be cloned
const createMockMaterial = (name) => ({
    name,
    clone: () => createMockMaterial(name),
    transparent: false,
    opacity: 1.0,
});

describe('Visor3D Selection Transparency', () => {
    let visor3d;
    let mockPart1, mockPart2, mockPart3;

    beforeEach(async () => {
        // Reset modules to get a fresh state for the stateful visor3d.js module
        jest.resetModules();
        visor3d = await import('../../public/modulos/visor3d/js/visor3d.js');

        // Set up the necessary DOM structure
        document.body.innerHTML = `
            <div id="view-content"></div>
            <button id="selection-transparency-btn"></button>
        `;

        // Create mock parts
        mockPart1 = { isMesh: true, uuid: 'uuid1', name: 'part1', material: createMockMaterial('mat1') };
        mockPart2 = { isMesh: true, uuid: 'uuid2', name: 'part2', material: createMockMaterial('mat2') };
        mockPart3 = { isMesh: true, uuid: 'uuid3', name: 'part3', material: createMockMaterial('mat3') };

        // Populate the modelParts array in the module
        visor3d.modelParts.push(mockPart1, mockPart2, mockPart3);
    });

    test('should make non-selected parts transparent when activated', () => {
        // Arrange: Select part 1
        visor3d.updateSelection(mockPart1, false);
        expect(visor3d.selectedObjects).toContain(mockPart1);

        // Act: Toggle the selection transparency mode
        visor3d.toggleSelectionTransparency();

        // Assert
        // Part 1 is selected, should be highlighted, not transparent.
        expect(mockPart1.material.emissive).toBeDefined();

        // Part 2 is NOT selected, should be transparent
        expect(mockPart2.material.transparent).toBe(true);
        expect(mockPart2.material.opacity).toBe(0.1);

        // Part 3 is NOT selected, should be transparent
        expect(mockPart3.material.transparent).toBe(true);
        expect(mockPart3.material.opacity).toBe(0.1);
    });

    test('should restore all parts to original materials when deactivated', () => {
        // Arrange: Select part 1 and activate mode
        visor3d.updateSelection(mockPart1, false);
        visor3d.toggleSelectionTransparency(); // Activate

        // Verify initial state
        expect(mockPart2.material.transparent).toBe(true);
        expect(mockPart3.material.transparent).toBe(true);

        // Act: Deactivate the mode
        visor3d.toggleSelectionTransparency();

        // Assert
        // Part 1 was selected, it should remain highlighted
        expect(mockPart1.material.emissive).toBeDefined();

        // Part 2 should be restored
        expect(mockPart2.material.name).toBe('mat2');
        expect(mockPart2.material.transparent).toBe(false);
        expect(mockPart2.material.opacity).toBe(1.0);

        // Part 3 should be restored
        expect(mockPart3.material.name).toBe('mat3');
        expect(mockPart3.material.transparent).toBe(false);
        expect(mockPart3.material.opacity).toBe(1.0);
    });

    test('should update transparency dynamically when selection changes', () => {
        // Arrange: Activate mode with no selection
        visor3d.toggleSelectionTransparency();
        expect(mockPart1.material.transparent).toBe(true);
        expect(mockPart2.material.transparent).toBe(true);

        // Act: Select part 2
        visor3d.updateSelection(mockPart2, false);

        // Assert
        // Part 1 is still not selected -> should be transparent
        expect(mockPart1.material.transparent).toBe(true);
        // Part 2 is now selected -> should be opaque (and highlighted)
        expect(mockPart2.material.emissive).toBeDefined(); // Highlight material
        // Part 3 is not selected -> should be transparent
        expect(mockPart3.material.transparent).toBe(true);

        // Act again: deselect part 2 by selecting part 1
        visor3d.updateSelection(mockPart1, false);

        // Assert
        // Part 1 is now selected -> should be opaque (and highlighted)
        expect(mockPart1.material.emissive).toBeDefined();
        // Part 2 is no longer selected -> should become transparent
        expect(mockPart2.material.transparent).toBe(true);
        expect(mockPart2.material.opacity).toBe(0.1);
    });

    test('should not make a highlighted part transparent', () => {
        // Arrange: Select part 1
        visor3d.updateSelection(mockPart1, false);
        // The highlight material is applied
        expect(mockPart1.material.emissive).toBeDefined();

        // Act: Activate transparency mode
        visor3d.toggleSelectionTransparency();

        // Assert
        // The material should still be the highlight material, not a transparent one.
        expect(mockPart1.material.emissive).toBeDefined();
        expect(mockPart1.material.transparent).not.toBe(true); // Highlight material has no transparent property
    });
});
