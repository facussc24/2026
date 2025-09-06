import { describe, test, expect } from '@jest/globals';
import { checkAndUpdateEcrStatus } from '../../public/data_logic.js';

describe('ECR Approval Status Logic', () => {
    test('[BUG] should transition status to "approved" when a pending requirement is removed', () => {
        // --- ARRANGE ---
        // 1. Simulate an ECR that requires approval from 'calidad' and 'compras'.
        //    'calidad' has already approved, but 'compras' has not.
        const ecrData = {
            status: 'pending-approval',
            afecta_ing_producto: false,
            afecta_ing_manufatura: false,
            afecta_hse: false,
            afecta_calidad: true, // Required
            afecta_compras: true, // Required
            afecta_sqa: false,
            afecta_tooling: false,
            afecta_logistica: false,
            afecta_financiero: false,
            afecta_comercial: false,
            afecta_mantenimiento: false,
            afecta_produccion: false,
            afecta_calidad_cliente: false,
            approvals: {
                calidad: {
                    status: 'approved',
                    user: 'User A',
                    date: '2023-01-01',
                    comment: 'OK'
                }
                // 'compras' has not approved yet.
            }
        };

        // --- ACT ---
        // 2. Simulate a user editing the ECR and removing 'compras' as a required approver.
        const modifiedEcrData = { ...ecrData, afecta_compras: false };

        // 3. Call the logic that should re-evaluate the ECR's status.
        //    This function does not exist yet, so this test is expected to fail.
        const newStatus = checkAndUpdateEcrStatus(modifiedEcrData);

        // --- ASSERT ---
        // 4. The status should now be 'approved' because the only remaining requirement ('calidad') is met.
        expect(newStatus).toBe('approved');
    });

    test('[BUG] should transition status to "rejected" as soon as one department rejects', () => {
        // --- ARRANGE ---
        // ECR requires 'calidad' and 'compras'
        const ecrData = {
            status: 'pending-approval',
            afecta_calidad: true, // Required
            afecta_compras: true, // Required
            approvals: {
                calidad: { status: 'approved', user: 'User A' },
                compras: { status: 'rejected', user: 'User B' } // 'compras' rejects
            }
        };

        // --- ACT ---
        const newStatus = checkAndUpdateEcrStatus(ecrData);

        // --- ASSERT ---
        // The status should immediately become 'rejected'.
        expect(newStatus).toBe('rejected');
    });
});
