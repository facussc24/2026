import { runEcrLogic, runEcrCreationHubLogic, runEcrFormLogic } from './ecr-ui.js';

export function handleEcrView(viewName, params, deps) {
    switch (viewName) {
        case 'ecr':
            return runEcrLogic(deps);
        case 'ecr_creation_hub':
            return runEcrCreationHubLogic(deps);
        case 'ecr_form':
            return runEcrFormLogic(params, deps);
        default:
            console.error(`Unknown ECR view: ${viewName}`);
            return Promise.resolve();
    }
}
