import { getUniqueKeyForCollection, createHelpTooltip, shouldRequirePpapConfirmation, calculateLinearMeters, COLLECTIONS } from '../../public/utils.js';

describe('getUniqueKeyForCollection', () => {
  test('should return "codigo_pieza" for PRODUCTOS', () => {
    expect(getUniqueKeyForCollection(COLLECTIONS.PRODUCTOS)).toBe('codigo_pieza');
  });

  test('should return "codigo_pieza" for SEMITERMINADOS', () => {
    expect(getUniqueKeyForCollection(COLLECTIONS.SEMITERMINADOS)).toBe('codigo_pieza');
  });

  test('should return "codigo_pieza" for INSUMOS', () => {
    expect(getUniqueKeyForCollection(COLLECTIONS.INSUMOS)).toBe('codigo_pieza');
  });

  test('should return "codigo" for PROYECTOS', () => {
    expect(getUniqueKeyForCollection(COLLECTIONS.PROYECTOS)).toBe('codigo');
  });

  test('should return "id" for CLIENTES', () => {
    expect(getUniqueKeyForCollection(COLLECTIONS.CLIENTES)).toBe('id');
  });

  test('should return "id" for USUARIOS', () => {
    expect(getUniqueKeyForCollection(COLLECTIONS.USUARIOS)).toBe('id');
  });

  test('should return "id" for an unknown collection', () => {
    expect(getUniqueKeyForCollection('UNA_COLECCION_INEXISTENTE')).toBe('id');
  });

  test('should return "id" for a null or undefined collection name', () => {
    expect(getUniqueKeyForCollection(null)).toBe('id');
    expect(getUniqueKeyForCollection(undefined)).toBe('id');
  });
});

describe('createHelpTooltip', () => {
  test('should return a string', () => {
    const message = 'This is a help message.';
    const tooltip = createHelpTooltip(message);
    expect(typeof tooltip).toBe('string');
  });

  test('should contain the help message', () => {
    const message = 'This is a test message.';
    const tooltip = createHelpTooltip(message);
    expect(tooltip).toContain(message);
  });

  test('should contain the correct HTML structure', () => {
    const message = 'Another message.';
    const tooltip = createHelpTooltip(message);
    expect(tooltip).toContain('<div class="help-tooltip-container"');
    expect(tooltip).toContain('<i data-lucide="help-circle" class="help-icon"></i>');
    expect(tooltip).toContain('<div class="help-tooltip-content"');
  });

  test('should generate a unique tooltip ID', () => {
    const message = 'Test';
    const tooltip1 = createHelpTooltip(message);
    const tooltip2 = createHelpTooltip(message);

    const id1_match = tooltip1.match(/id="([^"]+)"/);
    const id2_match = tooltip2.match(/id="([^"]+)"/);

    const id1 = id1_match ? id1_match[1] : null;
    const id2 = id2_match ? id2_match[1] : null;

    expect(id1).not.toBeNull();
    expect(id2).not.toBeNull();
    expect(id1).not.toEqual(id2);
  });
});

describe('shouldRequirePpapConfirmation', () => {
    // Test case 1: The correct condition to require PPAP confirmation
    test('should return true when PPAP is required and client approval is "aprobado"', () => {
        const ecrData = {
            cliente_requiere_ppap: true,
            cliente_aprobacion_estado: 'aprobado'
        };
        expect(shouldRequirePpapConfirmation(ecrData)).toBe(true);
    });

    // Test case 2: The scenario that was causing the bug
    test('should return false when PPAP is required but client approval is "pendiente"', () => {
        const ecrData = {
            cliente_requiere_ppap: true,
            cliente_aprobacion_estado: 'pendiente'
        };
        expect(shouldRequirePpapConfirmation(ecrData)).toBe(false);
    });

    // Test case 3: Another buggy scenario
    test('should return false when PPAP is required but client approval is "rechazado"', () => {
        const ecrData = {
            cliente_requiere_ppap: true,
            cliente_aprobacion_estado: 'rechazado'
        };
        expect(shouldRequirePpapConfirmation(ecrData)).toBe(false);
    });

    // Test case 4: PPAP not required
    test('should return false when PPAP is not required, regardless of approval status', () => {
        const ecrData = {
            cliente_requiere_ppap: false,
            cliente_aprobacion_estado: 'aprobado'
        };
        expect(shouldRequirePpapConfirmation(ecrData)).toBe(false);
    });

    // Test case 5: Edge case with missing data
    test('should return false if ecrData is null or undefined', () => {
        expect(shouldRequirePpapConfirmation(null)).toBe(false);
        expect(shouldRequirePpapConfirmation(undefined)).toBe(false);
    });

    // Test case 6: Edge case with missing properties
    test('should return false if required properties are missing', () => {
        const ecrData1 = { cliente_aprobacion_estado: 'aprobado' }; // Missing cliente_requiere_ppap
        const ecrData2 = { cliente_requiere_ppap: true }; // Missing cliente_aprobacion_estado
        expect(shouldRequirePpapConfirmation(ecrData1)).toBe(false);
        expect(shouldRequirePpapConfirmation(ecrData2)).toBe(false);
    });
});

describe('calculateLinearMeters', () => {
  test('should calculate linear meters correctly for valid inputs', () => {
    expect(calculateLinearMeters(10, 2)).toBe(5);
    expect(calculateLinearMeters(15.5, 1.25)).toBe(12.4);
    expect(calculateLinearMeters(0, 1.5)).toBe(0);
  });

  test('should return null for invalid squareMeters input', () => {
    expect(calculateLinearMeters(-10, 2)).toBeNull();
    expect(calculateLinearMeters(null, 2)).toBeNull();
    expect(calculateLinearMeters(undefined, 2)).toBeNull();
    expect(calculateLinearMeters('abc', 2)).toBeNull();
  });

  test('should return null for invalid or zero rollWidth input', () => {
    expect(calculateLinearMeters(10, 0)).toBeNull();
    expect(calculateLinearMeters(10, -1.5)).toBeNull();
    expect(calculateLinearMeters(10, null)).toBeNull();
    expect(calculateLinearMeters(10, undefined)).toBeNull();
    expect(calculateLinearMeters(10, 'xyz')).toBeNull();
  });

  test('should handle floating point calculations with precision', () => {
    expect(calculateLinearMeters(1, 3)).toBeCloseTo(0.333);
    expect(calculateLinearMeters(10, 3)).toBeCloseTo(3.333);
  });

  test('should handle string number inputs', () => {
    expect(calculateLinearMeters('20', '2.5')).toBe(8);
  });
});
