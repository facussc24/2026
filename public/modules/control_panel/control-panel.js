import { renderMainControlPanelView } from './views/main-control-panel-view.js';
import { renderIndicatorsView } from './views/indicators-view.js';
import { renderSeguimientoFichasView } from './views/seguimiento-fichas-view.js';
import { renderCpSeguimientoView } from './views/cp-seguimiento-view.js';
import { renderCpEcrTableView } from './views/cp-ecr-table-view.js';

export function handleControlPanelView(viewName, params, deps) {
    switch (viewName) {
        case 'control_ecrs':
            return renderMainControlPanelView(deps);
        case 'indicadores_ecm_view':
            return renderIndicatorsView(deps);
        case 'seguimiento_ecr_eco':
            return renderSeguimientoFichasView(deps);
        case 'ecr_seguimiento':
            return renderCpSeguimientoView(deps);
        case 'ecr_table_view':
            return renderCpEcrTableView(deps);
        default:
            console.error(`Unknown Control Panel view: ${viewName}`);
            return Promise.resolve();
    }
}
