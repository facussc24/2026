import { jest } from '@jest/globals';

// Mock Firestore
const mockGetDoc = jest.fn();
const mockSetDoc = jest.fn();
jest.unstable_mockModule('https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js', () => ({
    getFirestore: jest.fn(() => ({})),
    doc: jest.fn(),
    getDoc: mockGetDoc,
    setDoc: mockSetDoc,
    arrayUnion: jest.fn(data => `arrayUnion(${JSON.stringify(data)})`), // Simple mock
}));

// Mock other dependencies
jest.unstable_mockModule('../../public/modulos/visor3d/js/components/eventManager.js', () => ({
    showAnnotationPanel: jest.fn(),
}));
jest.unstable_mockModule('three/examples/jsm/renderers/CSS2DRenderer.js', () => ({
    CSS2DObject: jest.fn().mockImplementation(element => ({
        element,
        position: { set: jest.fn() },
    })),
}));
// Mock lucide for the icon in the pin
global.lucide = {
    createIcons: jest.fn(),
};


// Dynamically import the module to be tested after mocks are set up
const { initAnnotations, saveAnnotation, addCommentToAnnotation } = await import('../../public/modulos/visor3d/js/components/annotationManager.js');
const { showAnnotationPanel } = await import('../../public/modulos/visor3d/js/components/eventManager.js');

describe('Annotation Manager', () => {
    let mockScene;

    beforeEach(() => {
        jest.clearAllMocks();
        mockScene = {
            add: jest.fn(),
        };
    });

    describe('initAnnotations', () => {
        test('should load annotations from Firestore and create pins', async () => {
            // Arrange
            const modelName = 'test-model';
            const mockAnnotations = [
                { id: 'anno1', position: { x: 1, y: 1, z: 1 }, comments: [] },
                { id: 'anno2', position: { x: 2, y: 2, z: 2 }, comments: [] },
            ];
            mockGetDoc.mockResolvedValue({
                exists: () => true,
                data: () => ({ annotations: mockAnnotations }),
            });

            // Act
            await initAnnotations(modelName, mockScene);

            // Assert
            expect(mockGetDoc).toHaveBeenCalled();
            expect(mockScene.add).toHaveBeenCalledTimes(2); // One pin for each annotation
        });

        test('should handle cases where no annotations document exists', async () => {
            // Arrange
            const modelName = 'new-model';
            mockGetDoc.mockResolvedValue({
                exists: () => false,
            });

            // Act
            await initAnnotations(modelName, mockScene);

            // Assert
            expect(mockGetDoc).toHaveBeenCalled();
            expect(mockScene.add).not.toHaveBeenCalled();
        });
    });

    describe('saveAnnotation', () => {
        test('should save a new annotation using setDoc with merge', async () => {
            // Arrange
            const modelName = 'test-model';
            const newAnnotation = { id: 'anno3', position: { x: 3, y: 3, z: 3 }, comments: [] };
            await initAnnotations(modelName, mockScene); // To set currentModelName

            // Act
            await saveAnnotation(newAnnotation);

            // Assert
            expect(mockSetDoc).toHaveBeenCalledWith(
                undefined, // doc() is mocked and returns undefined
                { annotations: `arrayUnion(${JSON.stringify(newAnnotation)})` },
                { merge: true }
            );
        });
    });

    // Note: Testing addCommentToAnnotation is more complex due to the read-modify-write logic
    // and would require a more detailed mock of the internal state.
    // For this exercise, we focus on the primary load/save paths.
});
