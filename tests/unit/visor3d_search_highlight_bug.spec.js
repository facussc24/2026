import { setupVisor3dEventListeners, state, selectedObjects, modelParts } from '../../public/modulos/visor3d/js/visor3d.js';

// No need to mock visor3d.js, we will modify the imported objects directly.
// No need to mock three, it's handled by jest.config.js
// No need to mock lucide manually, we have __mocks__/lucide.js

describe('Visor3D Search Highlight Bug', () => {
    beforeEach(() => {
        // Set up the necessary DOM structure.
        document.body.innerHTML = `
            <div id="visor3d-panel">
                <input type="text" id="visor3d-search" placeholder="Buscar pieza...">
                <ul id="visor3d-parts-list">
                    <li data-part-name="part1">Part 1</li>
                    <li data-part-name="part2">Part 2</li>
                    <li data-part-name="part3">Part 3</li>
                </ul>
                <button id="explode-btn"></button>
                <button id="isolate-btn"></button>
                <button id="selection-transparency-btn"></button>
                <button id="clipping-btn"></button>
                <button id="measure-btn"></button>
                <button id="zoom-to-part-btn"></button>
                <input id="explode-factor" />
                <input id="bg-color" />
                <input id="sun-intensity" />
                <input id="ambient-light" />
                <div id="clipping-axis-buttons"></div>
                <input id="clipping-position" />
                <button id="reset-view-btn"></button>
            </div>
        `;

        // Reset state and data before each test
        // We can directly modify the properties of the imported state object.
        state.outlinePass = { selectedObjects: [] };

        // We can clear and push to the imported modelParts and selectedObjects arrays.
        modelParts.length = 0;
        modelParts.push(
            { name: 'part1', uuid: 'uuid1', isMesh: true, visible: true },
            { name: 'part2', uuid: 'uuid2', isMesh: true, visible: true },
            { name: 'part3', uuid: 'uuid3', isMesh: true, visible: true }
        );
        selectedObjects.length = 0;

        // Attach event listeners
        setupVisor3dEventListeners();
    });

    afterEach(() => {
        // Clean up mutations to imported modules
        state.outlinePass = null;
        modelParts.length = 0;
        selectedObjects.length = 0;
    });

    test('[New Test] clearing search should clear highlight, not restore previous selection', () => {
        const searchInput = document.getElementById('visor3d-search');

        // 1. User selects an object
        const initialSelection = modelParts[0];
        selectedObjects.push(initialSelection);
        state.outlinePass.selectedObjects = [initialSelection];

        expect(state.outlinePass.selectedObjects).toEqual([initialSelection]);

        // 2. User types in search, which highlights matching parts
        searchInput.value = 'part2';
        searchInput.dispatchEvent(new Event('keyup'));

        const searchResultPart = modelParts.find(p => p.name.toLowerCase() === 'part2');
        expect(state.outlinePass.selectedObjects).toEqual([searchResultPart]);

        // 3. User clears the search
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('keyup'));

        // Assert: The outline pass should be empty, not reverted to the initial selection.
        expect(state.outlinePass.selectedObjects).toEqual([]);
    });
});
