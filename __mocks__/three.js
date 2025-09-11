// Mock file for the 'three' library and its addons.
// We use named exports to match the structure of the actual 'three' module.

export class Raycaster {}
export class Vector2 {}
export class Scene {
    add() {}
}
export class Color {}
export class PerspectiveCamera {
    updateProjectionMatrix() {}
}
export class WebGLRenderer {
    domElement = {};
    setSize() {}
    setPixelRatio() {}
    addEventListener() {}
    render() {}
    dispose() {}
}
export class AmbientLight {}
export class DirectionalLight {}
export class Box3 {
    setFromObject() { return this; }
    getCenter() { return new Vector3(); }
    getSize() { return new Vector3(); }
}
export class Vector3 {
    sub() {}
    copy() {}
    addVectors() {}
    multiplyScalar() {}
    normalize() { return this; }
}

export class MeshStandardMaterial {
    constructor(params = {}) {
        this.color = params.color;
        this.emissive = params.emissive;
        this.metalness = params.metalness;
        this.roughness = params.roughness;
    }
}

// Mock the named exports for addons, as they are mapped to this file in jest.config.js
export class OrbitControls {
    reset() {}
    update() {}
}
export class GLTFLoader {
    load(path, onLoad) {
        // Immediately call the onLoad callback with a mock gltf object
        // to simulate a successful model load for any tests that might need it.
        if (onLoad) {
            const mockGltf = {
                scene: {
                    traverse: () => {},
                    position: new Vector3()
                }
            };
            onLoad(mockGltf);
        }
    }
}
