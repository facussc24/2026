import { renderNewMainControlPanelView } from './views/new-main-control-panel-view.js';
import { renderIndicatorsView } from './views/indicators-view.js';
import { renderSeguimientoFichasView } from './views/seguimiento-fichas-view.js';
import { renderCpSeguimientoView } from './views/cp-seguimiento-view.js';
import { renderCpEcrTableView } from './views/cp-ecr-table-view.js';

export function handleControlPanelView(viewName, params, deps) {
    switch (viewName) {
        case 'control_ecrs':
            // Redirigido al nuevo panel de control rediseñado
            return renderNewMainControlPanelView(deps);
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
            // Por seguridad, renderiza el nuevo panel como vista por defecto
            return renderNewMainControlPanelView(deps);
    }
}