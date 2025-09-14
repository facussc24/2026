import { jest } from '@jest/globals';

// We use jest.unstable_mockModule to ensure mocks are set up before any imports
// that might depend on them, which is crucial in an ES module environment.

jest.unstable_mockModule('../../public/modulos/visor3d/js/components/sceneManager.js', () => ({
  initThreeScene: jest.fn(() => jest.fn()),
  scene: {},
  camera: {},
  renderer: {},
  controls: {},
}));

jest.unstable_mockModule('../../public/modulos/visor3d/js/components/eventManager.js', () => ({
  setupVisor3dEventListeners: jest.fn(),
  onPointerDown: jest.fn(),
  updateSelection: jest.fn(),
  toggleSelectionTransparency: jest.fn(),
  toggleIsolation: jest.fn(),
  showAnnotationPanel: jest.fn(),
}));

// Mock the Firebase Storage module URL
jest.unstable_mockModule('https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js', () => ({
    getStorage: jest.fn(() => ({})),
    ref: jest.fn((storage, path) => ({ path, toString: () => `gs://mock-bucket/${path}` })),
    listAll: jest.fn(() => Promise.resolve({ items: [] })),
    getDownloadURL: jest.fn(() => Promise.resolve('https://fake.url/model.glb')),
}));


// Dynamically import the modules after all mocks are set up
const { createVisorUI } = await import('../../public/modulos/visor3d/js/components/uiManager.js');
const { initThreeScene } = await import('../../public/modulos/visor3d/js/components/sceneManager.js');
const { listAll, getDownloadURL } = await import('https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js');
const visor3d = await import('../../public/modulos/visor3d/js/visor3d.js');


describe('Visor3D Refactor with Firebase', () => {

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    // Set up the basic HTML structure that the scripts expect
    document.body.innerHTML = '<div id="view-content"></div>';
  });

  test('runVisor3dLogic should create UI and attempt to load models from Firebase', async () => {
    // Arrange: Mock Firebase to return an empty list of models
    listAll.mockResolvedValue({ items: [] });

    // Act
    const cleanup = await visor3d.runVisor3dLogic();
    // Wait for the setTimeout in runVisor3dLogic to execute
    await new Promise(resolve => setTimeout(resolve, 0));

    // Assert
    expect(listAll).toHaveBeenCalledTimes(1);

    // Test cleanup function
    expect(typeof cleanup).toBe('function');
    cleanup();
  });

  test('runVisor3dLogic should populate model buttons and load the first model', async () => {
    // Arrange: Mock Firebase to return a list of two models
    const mockFiles = [
      { name: 'Raptor.glb', fullPath: 'modelos3d/Raptor.glb' },
      { name: 'Cybertruck.glb', fullPath: 'modelos3d/Cybertruck.glb' },
    ];
    listAll.mockResolvedValue({ items: mockFiles });
    getDownloadURL.mockResolvedValue('https://fake.url/raptor.glb');

    // Act
    await visor3d.runVisor3dLogic();
    await new Promise(resolve => setTimeout(resolve, 0));

    // Assert: Check if buttons were created
    const buttonContainer = document.getElementById('model-button-container');
    expect(buttonContainer).not.toBeNull();
    expect(buttonContainer.children.length).toBe(2);
    expect(buttonContainer.children[0].textContent).toBe('Raptor');
    expect(buttonContainer.children[1].textContent).toBe('Cybertruck');

    // Assert: Check if the first model was automatically loaded
    expect(getDownloadURL).toHaveBeenCalledWith(expect.objectContaining({ fullPath: 'modelos3d/Raptor.glb' }));
    expect(initThreeScene).toHaveBeenCalledWith('https://fake.url/raptor.glb', expect.any(Function));
  });

  test('Clicking a model button should load the corresponding model', async () => {
    // Arrange
    const mockFiles = [
      { name: 'Raptor.glb', fullPath: 'modelos3d/Raptor.glb' },
      { name: 'Cybertruck.glb', fullPath: 'modelos3d/Cybertruck.glb' },
    ];
    listAll.mockResolvedValue({ items: mockFiles });
    // Make getDownloadURL return a different URL for the second model to verify
    getDownloadURL.mockImplementation(ref => {
        if (ref.fullPath === 'modelos3d/Cybertruck.glb') {
            return Promise.resolve('https://fake.url/cybertruck.glb');
        }
        return Promise.resolve('https://fake.url/raptor.glb');
    });

    await visor3d.runVisor3dLogic();
    await new Promise(resolve => setTimeout(resolve, 0));

    // Act: Simulate a click on the second button
    const buttonContainer = document.getElementById('model-button-container');
    const secondButton = buttonContainer.children[1];
    secondButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    // Assert
    expect(getDownloadURL).toHaveBeenCalledWith(expect.objectContaining({ fullPath: 'modelos3d/Cybertruck.glb' }));
    expect(initThreeScene).toHaveBeenCalledWith('https://fake.url/cybertruck.glb', expect.any(Function));
    expect(secondButton.classList.contains('active')).toBe(true);
    // Ensure the first button is no longer active
    const firstButton = buttonContainer.children[0];
    expect(firstButton.classList.contains('active')).toBe(false);
  });
});
