import { renderEcoListView, renderEcoFormView } from './eco-ui.js';

export function handleEcoView(viewName, params, deps) {
    switch (viewName) {
        case 'eco':
            // The dependencies for renderEcoListView are slightly different
            const listViewDeps = {
                db: deps.db,
                firestore: deps.firestore,
                dom: deps.dom,
                lucide: deps.lucide,
                switchView: deps.switchView
            };
            return renderEcoListView(listViewDeps);
        case 'eco_form':
            // The dependencies for renderEcoFormView are also specific
            const formViewDeps = {
                db: deps.db,
                firestore: deps.firestore,
                dom: deps.dom,
                lucide: deps.lucide,
                appState: deps.appState,
                showToast: deps.showToast,
                switchView: deps.switchView,
                shouldRequirePpapConfirmation: deps.shouldRequirePpapConfirmation,
                sendNotification: deps.sendNotification,
                showConfirmationModal: deps.showConfirmationModal,
                ensureCollectionsAreLoaded: deps.ensureCollectionsAreLoaded
            };
            return renderEcoFormView(params, formViewDeps);
        default:
            console.error(`Unknown ECO view: ${viewName}`);
            return Promise.resolve();
    }
}
