// Import Jest globals
const { describe, test, expect } = require('@jest/globals');

// Manually mock the onCall function and logger from firebase-functions
jest.mock('firebase-functions/v2/https', () => ({
  onCall: (handler) => handler,
}));
jest.mock('firebase-functions/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Import the logic functions directly from the module
const { generateEcrDraftLogic, generateEcoActionPlanLogic } = require('../ai_assistant.js');

describe('AI Assistant Logic', () => {

  describe('generateEcrDraftLogic', () => {

    test('should identify product type from prompt', () => {
      const prompt = "Necesitamos un cambio en el diseño del material X.";
      const result = generateEcrDraftLogic(prompt);
      expect(result.tipo_producto).toBe(true);
      expect(result.tipo_proceso).toBe(false);
    });

    test('should identify process type from prompt', () => {
      const prompt = "Optimizar la línea de ensamblaje para mayor eficiencia.";
      const result = generateEcrDraftLogic(prompt);
      expect(result.tipo_proceso).toBe(true);
      expect(result.tipo_producto).toBe(false);
    });

    test('should identify quality objective and impact', () => {
      const prompt = "Resolver la falla recurrente que afecta la calidad del producto.";
      const result = generateEcrDraftLogic(prompt);
      expect(result.obj_mejora_de_calidad).toBe(true);
      expect(result.afecta_calidad).toBe(true);
      expect(result.comments_calidad).toContain("Requiere análisis y validación");
    });

    test('should add specific comment for PPAP keyword', () => {
        const prompt = "El cliente solicita un nuevo PPAP para validar el cambio.";
        const result = generateEcrDraftLogic(prompt);
        expect(result.afecta_calidad).toBe(true);
        expect(result.comments_calidad).toContain("Se menciona PPAP");
    });

    test('should identify logistics impact', () => {
      const prompt = "Evaluar el impacto en el stock y transporte de los componentes.";
      const result = generateEcrDraftLogic(prompt);
      expect(result.afecta_logistica).toBe(true);
      expect(result.comments_logistica).toContain("Evaluar impacto en stock");
    });

    test('should return the original prompt as situacion_propuesta by default', () => {
      const prompt = "Un cambio simple sin palabras clave.";
      const result = generateEcrDraftLogic(prompt);
      expect(result.situacion_propuesta).toBe(prompt);
    });
  });

  describe('generateEcoActionPlanLogic', () => {

    // Helper to check if a date string is valid and in the future
    const isValidFutureDate = (dateStr) => {
        const date = new Date(dateStr);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return !isNaN(date.getTime()) && date >= today;
    };

    test('should generate a task for PSW and supplier', () => {
      const prompt = "Necesitamos un nuevo PSW del proveedor.";
      const result = generateEcoActionPlanLogic(prompt);
      expect(result).toHaveLength(1);
      expect(result[0].description).toContain("Contactar a proveedor para nuevo PSW");
      expect(isValidFutureDate(result[0].dueDate)).toBe(true);
    });

    test('should generate a task for control plan update', () => {
      const prompt = "Actualizar el plan de control con las nuevas tolerancias.";
      const result = generateEcoActionPlanLogic(prompt);
      expect(result).toHaveLength(1);
      expect(result[0].description).toContain("Actualizar Plan de Control");
      expect(isValidFutureDate(result[0].dueDate)).toBe(true);
    });

    test('should generate a task for personnel training', () => {
      const prompt = "Capacitar al personal de producción.";
      const result = generateEcoActionPlanLogic(prompt);
      expect(result).toHaveLength(1);
      expect(result[0].description).toContain("Capacitar al personal");
      expect(isValidFutureDate(result[0].dueDate)).toBe(true);
    });

    test('should generate multiple tasks for multiple keywords', () => {
      const prompt = "Hay que capacitar al personal y actualizar el plan de control.";
      const result = generateEcoActionPlanLogic(prompt);
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result.some(task => task.description.includes("Capacitar"))).toBe(true);
      expect(result.some(task => task.description.includes("Plan de Control"))).toBe(true);
    });

    test('should generate a generic task if no keywords are found', () => {
      const prompt = "Implementar los cambios necesarios.";
      const result = generateEcoActionPlanLogic(prompt);
      expect(result).toHaveLength(1);
      expect(result[0].description).toContain("Definir y asignar tareas");
    });

  });
});
