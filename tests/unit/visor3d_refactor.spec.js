import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Import functions to be mocked
import { initThreeScene } from '../../public/modulos/visor3d/js/components/sceneManager.js';
import { listAll, getDownloadURL } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js';

// Mock entire modules
jest.mock('../../public/modulos/visor3d/js/components/sceneManager.js');
jest.mock('../../public/modulos/visor3d/js/components/eventManager.js');
jest.mock('https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js');

// Import the module to be tested
import * as visor3d from '../../public/modulos/visor3d/js/visor3d.js';

describe('Visor3D Refactor with Firebase', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '<div id="view-content"></div>';
  });

  test('runVisor3dLogic should create UI and attempt to load models from Firebase', async () => {
    listAll.mockResolvedValue({ items: [] });

    const cleanup = await visor3d.runVisor3dLogic();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(listAll).toHaveBeenCalledTimes(1);
    expect(typeof cleanup).toBe('function');
    cleanup();
  });

  test('runVisor3dLogic should populate model buttons and load the first model', async () => {
    const mockFiles = [
      { name: 'Raptor.glb', fullPath: 'modelos3d/Raptor.glb' },
      { name: 'Cybertruck.glb', fullPath: 'modelos3d/Cybertruck.glb' },
    ];
    listAll.mockResolvedValue({ items: mockFiles });
    getDownloadURL.mockResolvedValue('https://fake.url/raptor.glb');

    await visor3d.runVisor3dLogic();
    await new Promise(resolve => setTimeout(resolve, 0));

    const buttonContainer = document.getElementById('model-button-container');
    expect(buttonContainer).not.toBeNull();
    expect(buttonContainer.children.length).toBe(2);
    expect(buttonContainer.children[0].textContent).toBe('Raptor');
    expect(buttonContainer.children[1].textContent).toBe('Cybertruck');

    expect(getDownloadURL).toHaveBeenCalledWith(expect.objectContaining({ fullPath: 'modelos3d/Raptor.glb' }));
    expect(initThreeScene).toHaveBeenCalledWith('https://fake.url/raptor.glb', expect.any(Function));
  });

  test('Clicking a model button should load the corresponding model', async () => {
    const mockFiles = [
      { name: 'Raptor.glb', fullPath: 'modelos3d/Raptor.glb' },
      { name: 'Cybertruck.glb', fullPath: 'modelos3d/Cybertruck.glb' },
    ];
    listAll.mockResolvedValue({ items: mockFiles });
    getDownloadURL.mockImplementation(ref => {
        if (ref.fullPath === 'modelos3d/Cybertruck.glb') {
            return Promise.resolve('https://fake.url/cybertruck.glb');
        }
        return Promise.resolve('https://fake.url/raptor.glb');
    });

    await visor3d.runVisor3dLogic();
    await new Promise(resolve => setTimeout(resolve, 0));

    const buttonContainer = document.getElementById('model-button-container');
    const secondButton = buttonContainer.children[1];
    secondButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(getDownloadURL).toHaveBeenCalledWith(expect.objectContaining({ fullPath: 'modelos3d/Cybertruck.glb' }));
    expect(initThreeScene).toHaveBeenCalledWith('https://fake.url/cybertruck.glb', expect.any(Function));
    expect(secondButton.classList.contains('active')).toBe(true);
    const firstButton = buttonContainer.children[0];
    expect(firstButton.classList.contains('active')).toBe(false);
  });
});
