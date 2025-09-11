import { describe, test, expect } from '@jest/globals';
import { checkAndUpdateEcrStatus } from '../../public/data_logic.js';

describe('ECR Approval Status Logic', () => {
    test('should transition status to "approved" when a pending requirement is removed', () => {
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
        const newStatus = checkAndUpdateEcrStatus(modifiedEcrData);

        // --- ASSERT ---
        // 4. The status should now be 'approved' because the only remaining requirement ('calidad') is met.
        expect(newStatus).toBe('approved');
    });

    test('[FIX VERIFICATION] should correctly determine final status when saving progress on a form', () => {
        // This test simulates the logic within the saveEcrForm function.

        // --- ARRANGE ---
        // 1. An ECR that is pending approval and only needs one more signature from 'calidad'.
        const ecrData = {
            status: 'pending-approval',
            afecta_calidad: true,
            afecta_compras: false,
            approvals: {}
        };

        // 2. A user from 'calidad' provides the final approval. This would be part of the form data upon saving.
        const dataFromFormWithApproval = {
            ...ecrData,
            approvals: {
                calidad: { status: 'approved', user: 'Test User' }
            }
        };

        // 3. The user clicks "Save Progress", not the final "Approve" button.
        const statusFromButtonClick = 'in-progress';

        // --- ACT ---
        // 4. This simulates the new, correct logic in saveEcrForm.
        //    We first check for an automatic status change.
        const autoUpdatedStatus = checkAndUpdateEcrStatus(dataFromFormWithApproval);

        //    Then we determine the final status, prioritizing the automatic one.
        const finalStatus = autoUpdatedStatus || statusFromButtonClick;

        // --- ASSERT ---
        // 5. The automatic status 'approved' should take precedence over the 'in-progress' from the button click.
        expect(autoUpdatedStatus).toBe('approved');
        expect(finalStatus).toBe('approved');
    });

    test('should transition status to "rejected" as soon as one department rejects', () => {
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

    test('should transition to "approved" if status is "pending-approval" and there are no required approvals', () => {
        // --- ARRANGE ---
        // An ECR is pending approval but has no departments marked as affecting it.
        const ecrData = {
            status: 'pending-approval',
            afecta_calidad: false,
            afecta_compras: false,
            // ... all other 'afecta_' fields are false
            approvals: {} // No approvals given or needed
        };

        // --- ACT ---
        const newStatus = checkAndUpdateEcrStatus(ecrData);

        // --- ASSERT ---
        // The ECR should be auto-approved as there are no pending requirements.
        expect(newStatus).toBe('approved');
    });

    test('should remain "rejected" even if the rejecting department is no longer a requirement', () => {
        // --- ARRANGE ---
        // 1. ECR requires 'calidad' and 'compras'. 'calidad' has approved, 'compras' has rejected.
        const ecrData = {
            status: 'pending-approval',
            afecta_calidad: true,
            afecta_compras: true,
            approvals: {
                calidad: { status: 'approved', user: 'User A' },
                compras: { status: 'rejected', user: 'User B' }
            }
        };

        // First, verify the initial rejection is caught correctly.
        const initialStatus = checkAndUpdateEcrStatus(ecrData);
        expect(initialStatus).toBe('rejected');

        // --- ACT ---
        // 2. Now, the user deselects 'compras' as a requirement.
        const modifiedEcrData = { ...ecrData, afecta_compras: false };

        // 3. Re-evaluate the status.
        const newStatus = checkAndUpdateEcrStatus(modifiedEcrData);

        // --- ASSERT ---
        // 4. The status should *still* be 'rejected'. A rejection is final and should not be
        //    revoked simply by unchecking the box. The current buggy logic will incorrectly
        //    change this to 'approved'.
        expect(newStatus).toBe('rejected');
    });
});
