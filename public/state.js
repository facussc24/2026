import { COLLECTIONS } from '/utils.js';

export let appState = {
    currentView: 'landing-page',
    currentData: [],
    arbolActivo: null,
    currentUser: null,
    currentViewCleanup: null,
    isAppInitialized: false,
    isTutorialActive: false,
    collections: {
        [COLLECTIONS.ROLES]: [],
        [COLLECTIONS.SECTORES]: [],
        [COLLECTIONS.NOTIFICATIONS]: [],
        [COLLECTIONS.TAREAS]: [],
        [COLLECTIONS.USUARIOS]: []
    },
    collectionsById: {
        [COLLECTIONS.ROLES]: new Map(),
        [COLLECTIONS.SECTORES]: new Map(),
        [COLLECTIONS.USUARIOS]: new Map(),
    },
    collectionCounts: {},
    unsubscribeListeners: [],
    sinopticoState: null,
    sinopticoTabularState: null,
    pagination: {
        pageCursors: { 1: null },
        currentPage: 1,
        totalItems: 0,
    },
    godModeState: null
};