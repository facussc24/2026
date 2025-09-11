import { jest } from '@jest/globals';
import { setupVisor3dEventListeners } from '../../public/modulos/visor3d/js/visor3d.js';

describe('Visor3D Search Functionality', () => {

    beforeEach(() => {
        // Set up the necessary DOM structure
        document.body.innerHTML = `
            <div id="visor3d-panel">
                <input type="text" id="visor3d-search" placeholder="Buscar pieza...">
                <ul id="visor3d-parts-list">
                    <li data-part-name="chassis_main_assembly">Part 1</li>
                    <li data-part-name="door_front_left">Part 2</li>
                    <li data-part-name="wheel_rear_left">Part 3</li>
                </ul>
            </div>
        `;
        // Attach event listeners
        setupVisor3dEventListeners();
    });

    test('[Failing Test] should filter the parts list when user types in search box', () => {
        const searchInput = document.getElementById('visor3d-search');
        const part1 = document.querySelector('li[data-part-name="chassis_main_assembly"]');
        const part2 = document.querySelector('li[data-part-name="door_front_left"]');
        const part3 = document.querySelector('li[data-part-name="wheel_rear_left"]');

        // Simulate user typing "left"
        searchInput.value = 'left';
        searchInput.dispatchEvent(new Event('keyup', { bubbles: true }));

        // Assert
        // With the bug (no listener), no styles will be applied. This will fail.
        expect(part1.style.display).toBe('none');
        expect(part2.style.display).toBe(''); // or 'list-item' or 'block'
        expect(part3.style.display).toBe('');
    });
});
