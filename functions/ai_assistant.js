const {onCall} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

/**
 * Simulates an AI call to parse a user's prompt and generate a draft for an ECR form.
 * In a real-world scenario, this function would interact with an LLM (e.g., via OpenAI's API).
 * @param {string} prompt The user's natural language input.
 * @returns {object} A structured object corresponding to the ECR form fields.
 */
const generateEcrDraftLogic = (prompt) => {
  const lowerCasePrompt = prompt.toLowerCase();

  // Initialize a default response object with all possible fields to ensure consistency.
  const response = {
    situacion_propuesta: prompt, // Default to the original prompt
    obj_productividad: false,
    obj_mejora_de_calidad: false,
    obj_estrategia_del_cliente: false,
    obj_estrategia_barack: false,
    obj_nacionalizacion: false,
    tipo_producto: false,
    tipo_proceso: false,
    afecta_calidad: false,
    comments_calidad: "",
    afecta_compras: false,
    comments_compras: "",
    afecta_logistica: false,
    comments_logistica: "",
    // Add other relevant fields and initialize them to default values
  };

  // Simulate AI by searching for keywords in the prompt.
  if (lowerCasePrompt.includes("material") || lowerCasePrompt.includes("diseño")) {
    response.tipo_producto = true;
  }
  if (lowerCasePrompt.includes("proceso") || lowerCasePrompt.includes("línea")) {
    response.tipo_proceso = true;
  }
  if (lowerCasePrompt.includes("peso") || lowerCasePrompt.includes("productividad") || lowerCasePrompt.includes("costo")) {
    response.obj_productividad = true;
  }
  if (lowerCasePrompt.includes("calidad") || lowerCasePrompt.includes("validación") || lowerCasePrompt.includes("falla") || lowerCasePrompt.includes("ppap")) {
    response.obj_mejora_de_calidad = true;
    response.afecta_calidad = true;
    response.comments_calidad = "Requiere análisis y validación por parte del departamento de Calidad.";
    if (lowerCasePrompt.includes("ppap")) {
        response.comments_calidad += " Se menciona PPAP, se requiere un nuevo plan de control.";
    }
  }
  if (lowerCasePrompt.includes("proveedor") || lowerCasePrompt.includes("compra")) {
      response.afecta_compras = true;
      response.comments_compras = "Se debe contactar con el proveedor actual y/o buscar alternativas.";
  }
  if (lowerCasePrompt.includes("aluminio")) {
      response.situacion_propuesta = `Cambio de material de acero a Aluminio para reducción de peso. ${prompt}`;
  }
  if (lowerCasePrompt.includes("logística") || lowerCasePrompt.includes("transporte") || lowerCasePrompt.includes("stock")) {
      response.afecta_logistica = true;
      response.comments_logistica = "Evaluar impacto en stock de componentes obsoletos y en el flujo de nuevos materiales.";
  }

  return response;
};

const generateEcrDraft = onCall((request) => {
  // Check for authentication
  if (!request.auth) {
    logger.warn("Unauthenticated user tried to call generateEcrDraft");
    throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const prompt = request.data.prompt;
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    logger.error("generateEcrDraft called with invalid prompt", { prompt: prompt });
    throw new functions.https.HttpsError('invalid-argument', 'The function must be called with a non-empty "prompt" string.');
  }

  logger.info(`Generating ECR draft for prompt: "${prompt}"`, {uid: request.auth.uid});

  const aiData = generateEcrDraftLogic(prompt);

  return aiData;
});


/**
 * Simulates an AI call to parse a user's prompt and generate a draft for an ECO action plan.
 * @param {string} prompt The user's natural language input.
 * @returns {Array<object>} A list of action item objects.
 */
const generateEcoActionPlanLogic = (prompt) => {
    const lowerCasePrompt = prompt.toLowerCase();
    const actionPlan = [];
    const today = new Date();

    const addDays = (date, days) => {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result.toISOString().split('T')[0];
    };

    if (lowerCasePrompt.includes("proveedor") || lowerCasePrompt.includes("psw")) {
        actionPlan.push({
            description: "Contactar a proveedor para nuevo PSW y plan de entrega.",
            assignee: null, // Let the user assign it
            dueDate: addDays(today, 15)
        });
    }
    if (lowerCasePrompt.includes("plan de control")) {
        actionPlan.push({
            description: "Actualizar Plan de Control de Proceso con nuevas especificaciones.",
            assignee: null,
            dueDate: addDays(today, 20)
        });
    }
    if (lowerCasePrompt.includes("capacitar") || lowerCasePrompt.includes("personal")) {
        actionPlan.push({
            description: "Capacitar al personal de producción sobre los cambios.",
            assignee: null,
            dueDate: addDays(today, 30)
        });
    }
    if (lowerCasePrompt.includes("herramental") || lowerCasePrompt.includes("dispositivo")) {
         actionPlan.push({
            description: "Ajustar o fabricar nuevo herramental/dispositivo de control.",
            assignee: null,
            dueDate: addDays(today, 45)
        });
    }

    // If no specific keywords are found, add a generic task
    if (actionPlan.length === 0) {
        actionPlan.push({
            description: "Definir y asignar tareas para la implementación del ECO.",
            assignee: null,
            dueDate: addDays(today, 7)
        });
    }

    return actionPlan;
};

const generateEcoActionPlan = onCall((request) => {
    if (!request.auth) {
        logger.warn("Unauthenticated user tried to call generateEcoActionPlan");
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const prompt = request.data.prompt;
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        logger.error("generateEcoActionPlan called with invalid prompt", { prompt: prompt });
        throw new functions.https.HttpsError('invalid-argument', 'The function must be called with a non-empty "prompt" string.');
    }

    logger.info(`Generating ECO Action Plan for prompt: "${prompt}"`, { uid: request.auth.uid });

    const actionPlan = generateEcoActionPlanLogic(prompt);
    return actionPlan;
});

module.exports = {
    generateEcrDraft,
    generateEcoActionPlan,
    generateEcrDraftLogic,
    generateEcoActionPlanLogic
};
