module.exports = {
  testEnvironment: "jest-environment-jsdom",

  transform: {
    "^.+\\.jsx?$": "babel-jest",
  },

  transformIgnorePatterns: [
    "/node_modules/(?!jose/)",
  ],

  // A list of paths to modules that run some code to configure or set up the testing framework before each test
  setupFilesAfterEnv: [
    "<rootDir>/tests/jest.setup.js"
  ],

  // Automatically clear mock calls and instances between every test
  clearMocks: true,

  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,

  // The directory where Jest should output its coverage files
  coverageDirectory: "coverage",

  // An array of regexp pattern strings used to skip coverage collection
  coveragePathIgnorePatterns: [
    "/node_modules/"
  ],

  // An array of regexp pattern strings that are matched against all test paths, matched tests are skipped
  testPathIgnorePatterns: [
    "/node_modules/",
    "tests/verify_.*\\.spec\\.js$",
    "/tests/e2e/"
  ],

  // A map from regular expressions to module names or to arrays of module names that allow to stub out resources with a single module
  moduleNameMapper: {
     // Force module uuid to resolve with the CJS entry point, because Jest does not support package.json.exports. See https://github.com/uuidjs/uuid/issues/451
    "uuid": "uuid",
    "\\.(css|less)$": "<rootDir>/__mocks__/styleMock.js",
    "\\.(gif|ttf|eot|svg)$": "<rootDir>/__mocks__/fileMock.js",

    // Mock external libraries and assets
    "^lucide$": "<rootDir>/__mocks__/lucide.js",

    // Mock Firebase modules
    "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js": "<rootDir>/__mocks__/firebase-app.js",
    "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js": "<rootDir>/__mocks__/firebase-auth.js",
    "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js": "<rootDir>/__mocks__/firebase-storage.js",
    "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js": "<rootDir>/__mocks__/firebase-firestore.js",
    "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js": "<rootDir>/__mocks__/firebase-functions.js",
    "https://www.gstatic.com/firebasejs/9.10.0/firebase-app.js": "<rootDir>/__mocks__/firebase-app.js",
    "https://www.gstatic.com/firebasejs/9.10.0/firebase-auth.js": "<rootDir>/__mocks__/firebase-auth.js",
    "https://www.gstatic.com/firebasejs/9.10.0/firebase-storage.js": "<rootDir>/__mocks__/firebase-storage.js",
    "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js": "<rootDir>/__mocks__/firebase-firestore.js",
    "https://www.gstatic.com/firebasejs/9.10.0/firebase-functions.js": "<rootDir>/__mocks__/firebase-functions.js",

    // Mock Three.js and its addons
    "^three/examples/jsm/controls/OrbitControls.js$": "<rootDir>/__mocks__/three.js",
    "^three/examples/jsm/loaders/GLTFLoader.js$": "<rootDir>/__mocks__/three.js",
    "^three/examples/jsm/loaders/RGBELoader.js$": "<rootDir>/__mocks__/three.js",
    "^three/examples/jsm/postprocessing/EffectComposer.js$": "<rootDir>/__mocks__/three.js",
    "^three/examples/jsm/postprocessing/RenderPass.js$": "<rootDir>/__mocks__/three.js",
    "^three/examples/jsm/postprocessing/OutlinePass.js$": "<rootDir>/__mocks__/three.js",
    "^three/examples/jsm/postprocessing/ShaderPass.js$": "<rootDir>/__mocks__/three.js",
    "^three/examples/jsm/shaders/FXAAShader.js$": "<rootDir>/__mocks__/three.js",
    "^three/examples/jsm/renderers/CSS2DRenderer.js$": "<rootDir>/__mocks__/three.js",
    "^three/examples/jsm/lines/Line2.js$": "<rootDir>/__mocks__/three.js",
    "^three/examples/jsm/lines/LineGeometry.js$": "<rootDir>/__mocks__/three.js",
    "^three/examples/jsm/lines/LineMaterial.js$": "<rootDir>/__mocks__/three.js",
    "^three/examples/jsm/postprocessing/SSAOPass.js$": "<rootDir>/__mocks__/three.js",
    "^three/examples/jsm/shaders/GammaCorrectionShader.js$": "<rootDir>/__mocks__/three.js",
    "^three$": "<rootDir>/__mocks__/three.js",

    // Map CDN import to local package for Jest
    "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js": "marked",
    "https://cdn.jsdelivr.net/npm/@tweenjs/tween.js@25.0.0/dist/tween.esm.js": "<rootDir>/__mocks__/tween.js",
    "https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.es.js": "<rootDir>/__mocks__/dompurify.js"
  },
};
