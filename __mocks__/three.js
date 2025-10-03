import { jest } from '@jest/globals';

// Mock file for the 'three' library and its addons.
// We use named exports to match the structure of the actual 'three' module.

export class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
    set(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
    }
    sub() { return this; }
    copy() { return this; }
    add() { return this; }
    addVectors() { return this; }
    multiplyScalar() { return this; }
    normalize() { return this; }
    getCenter() { return this; }
    getSize() { return this; }
    equals() { return false; }
    clone() { return this; }
}

export class Raycaster {}
export class Vector2 {}
export class Scene {
    constructor() {
        this.add = jest.fn();
        this.background = null;
        this.environment = null;
    }
}
export class Color {
    constructor(color) { this.color = color; }
    clone() { return this; }
    set(val) { this.color = val; }
    getHex() { return this.color; }
}
export class PerspectiveCamera {
    constructor() {
        this.position = new Vector3();
        this.fov = 75;
    }
    updateProjectionMatrix() {}
    lookAt() {}
}
export class WebGLRenderer {
    constructor() {
        this.domElement = document.createElement('canvas');
        this.clippingPlanes = [];
        this.shadowMap = {};
        this.localClippingEnabled = false;
    }
    getPixelRatio() { return 1; }
    setSize() {}
    setPixelRatio() {}
    addEventListener() {}
    render() {}
    dispose() {}
}
export class AmbientLight {}
export class DirectionalLight {
    constructor() {
        this.position = new Vector3();
        this.shadow = {
            mapSize: { width: 0, height: 0 },
            camera: {
                near: 0,
                far: 0,
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
            },
            bias: 0,
        };
    }
}
export class HemisphereLight {
    constructor() {
        this.position = new Vector3();
    }
}
export class Box3 {
    setFromObject() { return this; }
    getCenter() { return new Vector3(); }
    getSize() { return new Vector3(); }
}

export class Plane {
    constructor(vector, num) {}
}

export class MeshStandardMaterial {
    constructor(params = {}) {
        this.color = new Color(params.color);
        this.emissive = new Color(params.emissive);
        this.metalness = params.metalness;
        this.roughness = params.roughness;
    }
}

export class MeshBasicMaterial {
    constructor(params = {}) {
        this.colorWrite = params.colorWrite;
        this.depthWrite = params.depthWrite;
        this.side = params.side;
        this.clippingPlanes = null;
    }
}

export class Group {
    constructor() {
        this.children = [];
        this.visible = true;
    }
    add(object) {
        this.children.push(object);
    }
}

export class BoxGeometry {}
export class CanvasTexture {}
export class PlaneHelper {}


export const BackSide = 2;
export const FrontSide = 1;
export const DoubleSide = 0;


// Mock the named exports for addons, as they are mapped to this file in jest.config.js
export class OrbitControls {
    constructor() {
        this.target = new Vector3();
    }
    reset() {}
    update() {}
}
export class GLTFLoader {
    load(path, onLoad, onProgress, onError) {
        if (onLoad) {
            const mockGltf = {
                scene: {
                    traverse: (callback) => {
                        // Simulate traversing a couple of named meshes
                        callback({ name: 'part1', isMesh: true, material: {} });
                        callback({ name: 'part2', isMesh: true, material: {} });
                    },
                    position: new Vector3(),
                    getObjectByProperty: () => null,
                }
            };
            // Simulate async loading
            setTimeout(() => onLoad(mockGltf), 0);
        }
    }
}

// Post-processing and loaders added for the new features
export class RGBELoader {
    setPath() { return this; }
    setDataType() { return this; } // Add this line
    load(path, onLoad) {
        if (onLoad) onLoad({});
        return this;
    }
}
export class PMREMGenerator {
    compileEquirectangularShader() {}
    fromEquirectangular() {
        return { texture: null };
    }
    dispose() {}
}
export class GridHelper {
    constructor() {
        this.material = { opacity: 0, transparent: false };
        this.position = new Vector3();
    }
}
export class ShadowMaterial {
    constructor() {
        this.opacity = 0;
    }
}
export class PlaneGeometry {}
export class Mesh {
    constructor() {
        this.rotation = new Vector3();
        this.position = new Vector3();
    }
}
export class DataTextureLoader {}
export class EffectComposer {
    addPass() {}
    setSize() {}
    render() {}
}

export class Line2 {}
export class LineGeometry {}
export class LineMaterial {}

export class CSS2DObject extends Function {}
export class RenderPass {}
export class OutlinePass {
    constructor() {
        this.selectedObjects = [];
        this.visibleEdgeColor = { set: jest.fn() };
        this.hiddenEdgeColor = { set: jest.fn() };
    }
}
export class ShaderPass {
    constructor() {
        this.material = {
            uniforms: {
                resolution: { value: { x: 0, y: 0 } }
            }
        };
    }
}
export const FXAAShader = {
    uniforms: {
        resolution: { value: { x: 0, y: 0 } }
    },
    vertexShader: '',
    fragmentShader: ''
};

export class CSS2DRenderer {
    constructor() {
        this.domElement = document.createElement('div');
    }
    setSize() {}
    render() {}
}
