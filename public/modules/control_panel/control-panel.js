import { renderControlPanelDashboard } from './views/control-panel-dashboard-view.js';
import { renderIndicatorsView } from './views/indicators-view.js';
import { renderSeguimientoFichasView } from './views/seguimiento-fichas-view.js';
import { renderEcrSeguimientoView } from '../ecr/ecr-seguimiento-view.js';
import { renderEcrTableView } from '../ecr/ecr-table-view.js';

export function handleControlPanelView(viewName, params, deps) {
    switch (viewName) {
        case 'control_ecrs':
            return renderControlPanelDashboard(deps);
        case 'indicadores_ecm_view':
            return renderIndicatorsView(deps);
        case 'seguimiento_ecr_eco':
            return renderSeguimientoFichasView(deps);
        case 'ecr_seguimiento':
            return renderEcrSeguimientoView(deps);
        case 'ecr_table_view':
            return renderEcrTableView(deps);
        default:
            console.error(`Unknown Control Panel view: ${viewName}`);
            return Promise.resolve();
    }
}
