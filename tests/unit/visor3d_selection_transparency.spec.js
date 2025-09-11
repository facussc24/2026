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
    let state;
    let mockPart1, mockPart2, mockPart3;

    beforeEach(async () => {
        // Reset modules to get a fresh state for the stateful visor3d.js module
        jest.resetModules();
        visor3d = await import('../../public/modulos/visor3d/js/visor3d.js');
        state = visor3d.state;
        state.outlinePass = { selectedObjects: [] }; // Mock the outlinePass

        // Set up the necessary DOM structure
        document.body.innerHTML = `
            <div id="view-content"></div>
            <button id="selection-transparency-btn"></button>
            <div id="visor3d-piece-card"></div>
            <button id="isolate-btn"></button>
            <div id="visor3d-parts-list"></div>
        `;

        // Create mock parts
        mockPart1 = { isMesh: true, uuid: 'uuid1', name: 'part1', material: createMockMaterial('mat1') };
        mockPart2 = { isMesh: true, uuid: 'uuid2', name: 'part2', material: createMockMaterial('mat2') };
        mockPart3 = { isMesh: true, uuid: 'uuid3', name: 'part3', material: createMockMaterial('mat3') };

        // Populate the modelParts array in the module
        visor3d.modelParts.push(mockPart1, mockPart2, mockPart3);
        visor3d.transparentMaterials.clear();
    });

    test('should make non-selected parts transparent when activated', () => {
        // Arrange: Select part 1
        visor3d.updateSelection(mockPart1, false);
        expect(visor3d.selectedObjects).toContain(mockPart1);

        // Act: Toggle the selection transparency mode
        visor3d.toggleSelectionTransparency();

        // Assert: Check the internal state of the transparency map
        expect(visor3d.transparentMaterials.has(mockPart1.uuid)).toBe(false);
        expect(visor3d.transparentMaterials.has(mockPart2.uuid)).toBe(true);
        expect(visor3d.transparentMaterials.has(mockPart3.uuid)).toBe(true);
    });

    test('should restore all parts to original materials when deactivated', () => {
        // Arrange: Select part 1 and activate mode
        visor3d.updateSelection(mockPart1, false);
        visor3d.toggleSelectionTransparency(); // Activate

        // Verify initial state
        expect(visor3d.transparentMaterials.size).toBe(2);

        // Act: Deactivate the mode
        visor3d.toggleSelectionTransparency();

        // Assert: The transparency map should be empty
        expect(visor3d.transparentMaterials.size).toBe(0);
    });

    test('should update transparency dynamically when selection changes', () => {
        // Arrange: Activate mode with no selection
        visor3d.toggleSelectionTransparency();
        expect(visor3d.transparentMaterials.size).toBe(3); // All transparent

        // Act: Select part 2
        visor3d.updateSelection(mockPart2, false);

        // Assert: Part 2 is removed from the transparency map
        expect(visor3d.transparentMaterials.has(mockPart1.uuid)).toBe(true);
        expect(visor3d.transparentMaterials.has(mockPart2.uuid)).toBe(false);
        expect(visor3d.transparentMaterials.has(mockPart3.uuid)).toBe(true);
        expect(visor3d.transparentMaterials.size).toBe(2);

        // Act again: deselect part 2 by selecting part 1
        visor3d.updateSelection(mockPart1, false);

        // Assert: Part 1 is removed, part 2 is added back
        expect(visor3d.transparentMaterials.has(mockPart1.uuid)).toBe(false);
        expect(visor3d.transparentMaterials.has(mockPart2.uuid)).toBe(true);
        expect(visor3d.transparentMaterials.has(mockPart3.uuid)).toBe(true);
        expect(visor3d.transparentMaterials.size).toBe(2);
    });

    test('should not make a selected part transparent', () => {
        // Arrange: Select part 1
        visor3d.updateSelection(mockPart1, false);

        // Act: Activate transparency mode
        visor3d.toggleSelectionTransparency();

        // Assert: The selected part is not in the transparency map
        expect(visor3d.transparentMaterials.has(mockPart1.uuid)).toBe(false);
    });
});
