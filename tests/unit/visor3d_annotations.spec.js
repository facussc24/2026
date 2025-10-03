import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Import the functions to be mocked
import { getFirestore, doc, getDoc, setDoc, arrayUnion } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import { showAnnotationPanel } from '../../public/modulos/visor3d/js/components/eventManager.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

// Mock the entire modules
jest.mock('https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js');
jest.mock('../../public/modulos/visor3d/js/components/eventManager.js');
jest.mock('three/examples/jsm/renderers/CSS2DRenderer.js');

// Mock lucide globally
global.lucide = {
    createIcons: jest.fn(),
};

// Import the module to be tested
import { initAnnotations, saveAnnotation } from '../../public/modulos/visor3d/js/components/annotationManager.js';

describe('Annotation Manager', () => {
    let mockScene;

    beforeEach(() => {
        jest.clearAllMocks();
        mockScene = {
            add: jest.fn(),
        };
        // Mock the implementation of CSS2DObject for this test suite
        CSS2DObject.mockImplementation(element => ({
            element,
            position: { set: jest.fn() },
        }));
    });

    describe('initAnnotations', () => {
        test('should load annotations from Firestore and create pins', async () => {
            // Arrange
            const modelName = 'test-model';
            const mockAnnotations = [
                { id: 'anno1', position: { x: 1, y: 1, z: 1 }, comments: [] },
                { id: 'anno2', position: { x: 2, y: 2, z: 2 }, comments: [] },
            ];
            getDoc.mockResolvedValue({
                exists: () => true,
                data: () => ({ annotations: mockAnnotations }),
            });

            // Act
            await initAnnotations(modelName, mockScene);

            // Assert
            expect(getDoc).toHaveBeenCalled();
            expect(mockScene.add).toHaveBeenCalledTimes(2);
        });

        test('should handle cases where no annotations document exists', async () => {
            // Arrange
            const modelName = 'new-model';
            getDoc.mockResolvedValue({
                exists: () => false,
            });

            // Act
            await initAnnotations(modelName, mockScene);

            // Assert
            expect(getDoc).toHaveBeenCalled();
            expect(mockScene.add).not.toHaveBeenCalled();
        });
    });

    describe('saveAnnotation', () => {
        test('should save a new annotation using setDoc with merge', async () => {
            // Arrange
            const modelName = 'test-model';
            const newAnnotation = { id: 'anno3', position: { x: 3, y: 3, z: 3 }, comments: [] };
            const mockDb = { id: 'mock-db' };
            const mockDocRef = { id: 'mock-doc-ref' };

            // Mock the Firestore functions
            doc.mockReturnValue(mockDocRef);
            // The real arrayUnion returns a special FieldValue, not the raw data.
            // We mock it to return a simple object that represents the operation for assertion.
            arrayUnion.mockImplementation(data => ({ _methodName: 'arrayUnion', _elements: [data] }));

            // Act
            await initAnnotations(modelName, mockScene, mockDb); // Initialize with the mock DB
            await saveAnnotation(newAnnotation);

            // Assert
            expect(doc).toHaveBeenCalledWith(mockDb, "annotations", modelName);
            expect(setDoc).toHaveBeenCalledWith(
                mockDocRef,
                { annotations: { _methodName: 'arrayUnion', _elements: [newAnnotation] } },
                { merge: true }
            );
        });
    });
});
