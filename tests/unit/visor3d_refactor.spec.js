import { jest } from '@jest/globals';

// Mock the global `lucide` object
global.lucide = {
    createIcons: jest.fn(),
};

// Mock TWEEN
global.TWEEN = {
    Tween: jest.fn().mockImplementation(() => ({
        to: jest.fn().mockReturnThis(),
        easing: jest.fn().mockReturnThis(),
        onUpdate: jest.fn().mockReturnThis(),
        start: jest.fn().mockReturnThis(),
    })),
    Easing: {
        Quadratic: {
            Out: jest.fn()
        }
    },
    update: jest.fn()
};

// Mock fetch
global.fetch = jest.fn((url) => {
    if (url === '/api/models') {
        return Promise.resolve({
            json: () => Promise.resolve([{ id: 'test-model', name: 'Test Model' }]),
        });
    }
    if (url.includes('.json')) {
        return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
        });
    }
    return Promise.resolve({
        ok: false,
    });
});


describe('Visor3D Refactor', () => {
    let visor3d;
    let cleanup;

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.resetModules();

        document.body.innerHTML = '<div id="view-content"></div>';

        // We need to import the module here so it uses the mocked THREE and fetch
        visor3d = await import('../../public/modulos/visor3d/js/visor3d.js');

        // runVisor3dLogic is async, so we need to await it
        cleanup = await visor3d.runVisor3dLogic();
    });

    afterEach(() => {
        if (cleanup) {
            cleanup();
        }
    });

    test('runVisor3dLogic should initialize scene, camera, renderer, and controls', async () => {
        // Since GLTFLoader is async, we need to wait for the promises to resolve
        await new Promise(process.nextTick);

        // Assert that the main components have been created by checking for their existence and key properties
        expect(visor3d.scene).toBeDefined();
        expect(typeof visor3d.scene.add).toBe('function');

        expect(visor3d.camera).toBeDefined();
        expect(visor3d.camera.position).toBeDefined();

        expect(visor3d.renderer).toBeDefined();
        expect(visor3d.renderer.domElement).toBeDefined();

        expect(visor3d.controls).toBeDefined();
        expect(typeof visor3d.controls.update).toBe('function');

        // Assert that lights were added
        expect(visor3d.scene.add).toHaveBeenCalled();

        // Check that the renderer's DOM element was added to the container
        const container = document.getElementById('visor3d-scene-container');
        expect(container.contains(visor3d.renderer.domElement)).toBe(true);

        // Check if a cleanup function is returned and can be called
        expect(typeof cleanup).toBe('function');
    });

    test('runVisor3dLogic should populate the model selector', () => {
        const selector = document.getElementById('model-selector');
        expect(selector).not.toBeNull();
        expect(selector.innerHTML).toContain('<option value="test-model">Test Model</option>');
        expect(fetch).toHaveBeenCalledWith('/api/models');
    });
});
