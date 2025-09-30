const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const {VertexAI} = require("@google-cloud/vertexai");
const cors = require('cors')({origin: true});
const axios = require("axios");
const nodemailer = require('nodemailer');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

// Nodemailer transporter setup
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

exports.getNextEcrNumber = functions.https.onCall(async (data, context) => {
  // Ensure the user is authenticated.
  if (!context.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated",
        "The function must be called while authenticated.",
    );
  }

  const db = admin.firestore();
  const counterRef = db.collection("counters").doc("ecr_counter");

  try {
    const newEcrNumber = await db.runTransaction(async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      const currentYear = new Date().getFullYear();
      let nextNumber = 1;

      if (counterSnap.exists) {
        const counterData = counterSnap.data();
        if (counterData.year === currentYear) {
          nextNumber = (counterData.count || 0) + 1;
        }
      }

      transaction.set(
          counterRef,
          {count: nextNumber, year: currentYear},
          {merge: true},
      );

      return `ECR-${currentYear}-${String(nextNumber).padStart(3, "0")}`;
    });

    return {ecrNumber: newEcrNumber};
  } catch (error) {
    console.error("Error generating ECR number:", error);
    throw new functions.https.HttpsError(
        "internal",
        "An error occurred while generating the ECR number.",
    );
  }
});

exports.saveFormWithValidation = functions
  .runWith({ secrets: ["EMAIL_USER", "EMAIL_PASS", "EMAIL_HOST", "EMAIL_PORT"] })
  .https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      // 1. Manual Authentication
      const idToken = req.headers.authorization?.split('Bearer ')[1];
      if (!idToken) {
        return res.status(401).json({
          error: { status: 'UNAUTHENTICATED', message: 'The function must be called while authenticated.' }
        });
      }
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const userEmail = decodedToken.email || 'Unknown';

      // 2. Data Parsing (from req.body.data for callable compatibility)
      const { formType, formData } = req.body.data;
      if (!formType || !formData) {
        return res.status(400).json({
          error: { status: 'INVALID_ARGUMENT', message: 'The function must be called with "formType" and "formData" arguments.' }
        });
      }

      // --- ECR Validation ---
      if (formType === 'ecr') {
        const requiredFields = [
            { key: 'denominacion_producto', label: 'Denominación del Producto' },
            { key: 'situacion_existente', label: 'Situación Existente' },
            { key: 'situacion_propuesta', label: 'Situación Propuesta' }
        ];

        for (const field of requiredFields) {
            if (!formData[field.key] || formData[field.key].trim() === '') {
              return res.status(400).json({
                error: { status: 'INVALID_ARGUMENT', message: `El campo "${field.label}" no puede estar vacío.` }
              });
            }
        }
      }

      // --- ECO Validation ---
      else if (formType === 'eco') {
        if (!formData['ecr_no'] || formData['ecr_no'].trim() === '') {
          return res.status(400).json({
            error: { status: 'INVALID_ARGUMENT', message: 'El campo "ECR N°" no puede estar vacío.' }
          });
        }
        // Add safety checks for comments and checklists
        const hasComments = formData.comments && Object.values(formData.comments).some(comment => comment && comment.trim() !== '');
        const hasChecklists = formData.checklists && Object.values(formData.checklists).some(section =>
            section && section.some(item => item && (item.si || item.na))
        );

        if (!hasComments && !hasChecklists) {
          return res.status(400).json({
            error: { status: 'INVALID_ARGUMENT', message: 'El formulario ECO está vacío. Agregue al menos un comentario o marque una opción en el checklist.' }
          });
        }
      } else {
        return res.status(400).json({
          error: { status: 'INVALID_ARGUMENT', message: 'El "formType" debe ser "ecr" o "eco".' }
        });
      }

      // --- Firestore Write Logic ---
      const db = admin.firestore();
      const collectionName = formType === 'ecr' ? 'ecr_forms' : 'eco_forms';

      // ECR number is now generated client-side.
      // The function now assumes the 'id' field is always present.
      const docId = formData.id;
      if (!docId) {
        return res.status(400).json({
          error: { status: 'INVALID_ARGUMENT', message: 'The document ID is missing from the form data.' }
        });
      }

      const docRef = db.collection(collectionName).doc(docId);
      const historyRef = docRef.collection('history');

      const dataToSave = {
          ...formData,
          lastModified: new Date(),
          modifiedBy: userEmail,
          serverValidated: true
      };

      const docSnap = await docRef.get();
      const oldData = docSnap.exists ? docSnap.data() : null;

      const batch = db.batch();
      batch.set(docRef, dataToSave, { merge: true });

      const historyDocRef = historyRef.doc();
      batch.set(historyDocRef, dataToSave);

      await batch.commit();

      // --- Email Notification Logic ---
      const newStatus = dataToSave.status;
      const oldStatus = oldData ? oldData.status : null;

      if (newStatus && newStatus !== oldStatus) {
        const creatorUid = dataToSave.creatorUid;
        if (creatorUid) {
          try {
            const userRecord = await admin.auth().getUser(creatorUid);
            const email = userRecord.email;
            if (email) {
              const mailOptions = {
                from: `"Gestión PRO" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: `Actualización de Estado: ${formType.toUpperCase()} ${docId}`,
                html: `
                  <p>Hola,</p>
                  <p>El estado de tu <strong>${formType.toUpperCase()} ${docId}</strong> ha cambiado de <strong>${oldStatus || 'N/A'}</strong> a <strong>${newStatus}</strong>.</p>
                  <p>Puedes ver los detalles en la aplicación.</p>
                  <p>Saludos,<br>El equipo de Gestión PRO</p>
                `
              };
              await transporter.sendMail(mailOptions);
              console.log(`Email sent to ${email} for ${formType.toUpperCase()} ${docId} status change.`);
            }
          } catch (error) {
            console.error(`Failed to send email for ${formType.toUpperCase()} ${docId}:`, error);
          }
        }
      }

      // 3. Manual Response Formatting
      return res.status(200).json({
        data: { success: true, message: `${formType.toUpperCase()} guardado con éxito.` }
      });

    } catch (error) {
      console.error(`Error in saveFormWithValidation for ${req.body?.data?.formType}:`, error);
      // Handle auth errors specifically
      if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
        return res.status(401).json({
          error: { status: 'UNAUTHENTICATED', message: 'Authentication token is invalid or expired.' }
        });
      }
      // Generic internal error for all other cases
      return res.status(500).json({
        error: { status: 'INTERNAL', message: `An internal error occurred while saving the form.` }
      });
    }
  });
});

exports.sendTaskAssignmentEmail = functions
  .runWith({ secrets: ["EMAIL_USER", "EMAIL_PASS", "EMAIL_HOST", "EMAIL_PORT"] })
  .firestore.document('tareas/{taskId}')
  .onCreate(async (snap, context) => {
    const task = snap.data();
    const assigneeUid = task.assigneeUid;

    if (!assigneeUid) {
      console.log(`Task ${context.params.taskId} created without an assignee.`);
      return null;
    }

    try {
      const userRecord = await admin.auth().getUser(assigneeUid);
      const email = userRecord.email;

      if (email) {
        const mailOptions = {
          from: `"Gestión PRO" <${process.env.EMAIL_USER}>`,
          to: email,
          subject: `Nueva Tarea Asignada: ${task.title}`,
          html: `
            <p>Hola,</p>
            <p>Se te ha asignado una nueva tarea: <strong>${task.title}</strong>.</p>
            <p><strong>Descripción:</strong> ${task.description || 'N/A'}</p>
            <p><strong>Fecha de Vencimiento:</strong> ${task.dueDate || 'N/A'}</p>
            <p>Puedes ver los detalles en la aplicación.</p>
            <p>Saludos,<br>El equipo de Gestión PRO</p>
          `
        };
        await transporter.sendMail(mailOptions);
        console.log(`Assignment email sent to ${email} for task ${context.params.taskId}.`);
      }
      return null;
    } catch (error) {
      console.error(`Failed to send assignment email for task ${context.params.taskId}:`, error);
      return null;
    }
  });

exports.organizeTaskWithAI = functions.runWith({timeoutSeconds: 540, memory: '1GB'}).https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }

    const text = data.text;
    if (!text || typeof text !== "string" || text.trim().length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "The function must be called with a non-empty 'text' argument.");
    }

    try {
        // Inicializa Vertex AI con la configuración del proyecto y la ubicación.
        const vertexAI = new VertexAI({
            project: process.env.GCLOUD_PROJECT,
            location: "us-central1",
        });

        // Selecciona el modelo generativo.
        const generativeModel = vertexAI.getGenerativeModel({
            model: "gemini-2.5-flash",
        });

        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const currentDate = today.toISOString().split("T")[0];
        const tomorrowDate = tomorrow.toISOString().split("T")[0];

        const prompt = `
        Analiza el siguiente texto de un usuario. Tu objetivo es identificar si el texto describe una o varias tareas gestionables.

        **Contexto Clave:**
        - La fecha de hoy es ${currentDate}.
        - La fecha de mañana es ${tomorrowDate}.
        - Todas las fechas relativas (como "mañana" o "próxima semana") deben calcularse a partir de la fecha de hoy.

        Texto del usuario: "${text}"

        **Instrucciones Estrictas:**
        1.  **Detección de Tareas:** Identifica si el texto representa una única acción o múltiples acciones distintas. Si son distintas (ej: "revisar planos y llamar a proveedor"), crea un objeto de tarea para cada una. Si es una acción con pasos, trátalo como una sola tarea con subtareas.
        2.  **Estructura de Tarea (JSON):** Para cada tarea, genera un objeto JSON con estos campos EXACTOS:
            *   \\\`title\\\`: Título conciso (máx 10 palabras).
            *   \\\`description\\\`: Resumen corto del objetivo.
            *   \\\`subtasks\\\`: Array de strings con subtareas accionables. Si no hay, \\\`[]\\\`.
            *   \\\`tags\\\`: Array de strings con palabras clave relevantes (1-3 palabras por tag). Si no hay, \\\`[]\\\`.
            *   \\\`priority\\\`: 'high', 'medium', o 'low'.
            *   \\\`startDate\\\`: 'YYYY-MM-DD' o \\\`null\\\`.
            *   \\\`dueDate\\\`: 'YYYY-MM-DD' o \\\`null\\\`.
            *   \\\`assignee\\\`: Nombre de la persona o \\\`null\\\`.
            *   \\\`isPublic\\\`: \\\`true\\\` (equipo/proyecto) o \\\`false\\\` (personal).
            *   \\\`project\\\`: Nombre del proyecto o \\\`null\\\`.
        3.  **Asignación de Fechas (Regla Maestra):** Debes asignar una fecha a \`dueDate\` siguiendo estas prioridades:
            a.  **Fecha Específica:** Si el usuario menciona una fecha concreta (ej: "para el viernes", "el 25 de diciembre"), usa esa fecha.
            b.  **Urgencia Implícita:** Si el texto sugiere urgencia (ej: "pronto", "lo antes posible") pero sin fecha, asigna la fecha de mañana (\`${tomorrowDate}\`).
            c.  **Sin Fecha (Por Defecto):** Si no hay ninguna mención de fecha o urgencia, asigna la fecha de hoy (\`${currentDate}\`) como valor predeterminado. **Ninguna tarea puede quedar sin fecha.**
        4.  **Generación de Tags:** Analiza el texto para extraer conceptos, tecnologías, nombres de proyectos o temas clave. Conviértelos en tags cortos, en minúsculas y sin caracteres especiales. Por ejemplo, "Arreglar bug en login de app Android" podría generar tags como ["bugfix", "login", "android"].
        5.  **Corrección de Texto:** Corrige la gramática y ortografía en \\\`title\\\` y \\\`description\\\` para mayor claridad.

        **Formato de Salida - REGLA CRÍTICA:**
        Tu respuesta DEBE ser ÚNICAMENTE un objeto JSON. Este objeto debe contener una clave "tasks", cuyo valor es un array de los objetos de tarea que creaste.
        NO incluyas absolutamente NADA más en tu respuesta. Ni texto introductorio, ni explicaciones, ni bloques de código markdown (como \\\`\\\`\\\`json).
        La respuesta debe empezar con \\\`{\\\` y terminar con \\\`}\\\`.

        **Ejemplo de respuesta VÁLIDA:**
        {"tasks":[{"title":"Revisar planos del chasis","description":"Revisar los planos detallados del nuevo chasis para el modelo 2024.","subtasks":[],"tags":["diseño","chasis","planos","2024"],"priority":"high","startDate":null,"dueDate":null,"assignee":null,"isPublic":true,"project":"Chasis-2024"},{"title":"Llamar a proveedor de acero","description":"Llamar al proveedor para confirmar la fecha de entrega del acero.","subtasks":[],"tags":["proveedores","acero","logística"],"priority":"medium","startDate":null,"dueDate":null,"assignee":"Marcos","isPublic":true,"project":"Chasis-2024"}]}

        **Ejemplo de respuesta INVÁLIDA:**
        \\\`\\\`\\\`json
        {"tasks": [...]}
        \\\`\\\`\\\`
      `;

        // Genera el contenido usando el SDK de Vertex AI.
        const result = await generativeModel.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
        });

        // Extrae el texto de la respuesta.
        const responseText = result.response.candidates[0].content.parts[0].text;

        // Extrae el bloque JSON de la respuesta.
        const jsonMatch = responseText.match(/{[\s\S]*}/);
        if (!jsonMatch) {
            console.error("No valid JSON block found in AI response. Raw response:", responseText);
            throw new Error("No se encontró un bloque JSON válido en la respuesta de la IA.");
        }

        const parsedData = JSON.parse(jsonMatch[0]);

        // Valida la estructura de la respuesta.
        if (!parsedData || typeof parsedData !== 'object' || !Array.isArray(parsedData.tasks)) {
            throw new Error("La respuesta de la IA no es un JSON válido o no contiene un array de tareas.");
        }

        // Asegura que cada tarea tenga un array de 'tags' válido.
        parsedData.tasks.forEach(task => {
            if (!Array.isArray(task.tags)) {
                task.tags = [];
            }
        });

        return parsedData;

    } catch (error) {
        console.error("Error en organizeTaskWithAI con Vertex AI:", error);
        // Hyper-detailed logging for final diagnosis
        throw new functions.https.HttpsError(
            "internal",
            `Vertex AI Full Error: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`
        );
    }
});

exports.analyzeWeeklyTasks = functions.runWith({timeoutSeconds: 540, memory: '1GB'}).https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const { tasks } = data;
    if (!tasks || !Array.isArray(tasks)) {
        throw new functions.https.HttpsError("invalid-argument", "The function must be called with a 'tasks' (array) argument.");
    }
    try {
        const vertexAI = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: "us-central1" });
        const generativeModel = vertexAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const user = await admin.auth().getUser(context.auth.uid);
        const userName = user.displayName || user.email;

        const today = new Date();
        const dayOfWeek = today.getUTCDay();
        const isWeekend = dayOfWeek === 6 || dayOfWeek === 0;
        const diffToMonday = isWeekend ? (8 - dayOfWeek) % 7 : 1 - dayOfWeek;
        const monday = new Date(today);
        monday.setDate(today.getDate() + diffToMonday);

        const weekDates = Array.from({ length: 5 }).map((_, i) => {
            const date = new Date(monday);
            date.setDate(monday.getDate() + i);
            return date.toISOString().split('T')[0];
        });

        const weekDayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

        const weekDatesWithNames = weekDates.map(dateStr => {
            const date = new Date(dateStr + "T12:00:00Z");
            const dayName = weekDayNames[date.getUTCDay()];
            return `${dayName} ${date.getUTCDate()} de ${monthNames[date.getUTCMonth()]}`;
        });

        const tasksForPrompt = tasks.map(t => ({
            taskId: t.docId,
            title: t.title,
            priority: t.priority,
            effort: t.effort,
            dueDate: t.dueDate,
        }));

        const prompt = `
        Eres un asistente de planificación estratégica para ${userName}. Tu misión es crear un plan de trabajo semanal realista y bien justificado, y comunicarlo de manera clara.

        **Contexto:**
        - Usuario: ${userName}
        - Fecha Actual: ${new Date().toISOString().split('T')[0]}
        - Semana de Planificación:
            - Lunes: ${weekDatesWithNames[0]} (${weekDates[0]})
            - Martes: ${weekDatesWithNames[1]} (${weekDates[1]})
            - Miércoles: ${weekDatesWithNames[2]} (${weekDates[2]})
            - Jueves: ${weekDatesWithNames[3]} (${weekDates[3]})
            - Viernes: ${weekDatesWithNames[4]} (${weekDates[4]})

        **Reglas de Planificación (Orden de Importancia):**
        1.  **No Fines de Semana:** Nunca asignes una \`plannedDate\` a un Sábado o Domingo.
        2.  **Tareas Vencidas:** Distribuye las tareas con \`dueDate\` anterior a la fecha actual entre Lunes y Martes.
        3.  **Planificación Proactiva:** Asigna la \`plannedDate\` al menos 1-2 días ANTES de la \`dueDate\`.
        4.  **Jerarquía de Priorización:** Como desempate, usa: 1º \`dueDate\` más cercana, 2º \`priority: 'high'\`, 3º \`effort: 'high'\`.
        5.  **Balance de Carga:** No más de UNA tarea con \`effort: 'high'\` por día.

        **Tareas a Analizar:**
        \`\`\`json
        ${JSON.stringify(tasksForPrompt, null, 2)}
        \`\`\`

        **Formato de Salida (OBLIGATORIO):**
        1.  **EL PLAN (JSON):** Un objeto JSON con una clave "plan" que contiene un array de objetos \`{ "taskId": "ID_DE_LA_TAREA", "plannedDate": "YYYY-MM-DD", "title": "Título de la Tarea" }\`.
        2.  **SEPARADOR:** Inserta este separador exacto: \`---JSON_PLAN_SEPARATOR---\`
        3.  **EL ANÁLISIS (MARKDOWN):** Un análisis en Markdown con la siguiente estructura:
            ### Resumen del Plan Semanal
            Párrafo corto resumiendo la semana.
            ### Plan Detallado Día por Día
            *   **Lunes 5 de Agosto**:
                *   **[Título de la Tarea]** - *Justificación: [Explica por qué está aquí, ej: "Tarea vencida de alta prioridad."]*
            *   ... (continúa para todos los días con tareas)
            ### ⚠️ Justificación de Riesgos
            Explica cualquier decisión difícil (ej: "La tarea X se planificó el mismo día de su vencimiento porque...").
            ### 🗓️ Tareas Fuera de Horizonte
            Lista las tareas no planificadas por tener una fecha de vencimiento muy lejana.

        **Reglas Finales:**
        - En el análisis, usa los títulos de las tareas, no los IDs.
        - Usa el formato de fecha natural (ej: "Lunes 5 de Agosto").
        - Tu respuesta debe ser únicamente el JSON, el separador y el Markdown.
        `;
        const result = await generativeModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
        let responseText = result.response.candidates[0].content.parts[0].text;
        responseText = responseText.replace(/^```json\s*/, '').replace(/```\s*$/, '');
        const separator = '---JSON_PLAN_SEPARATOR---';
        const parts = responseText.split(separator);
        if (parts.length < 2) {
            throw new Error("La respuesta de la IA no contiene el separador requerido.");
        }
        const jsonPart = parts[0].trim();
        const analysisPart = parts[1].trim();
        const planData = JSON.parse(jsonPart);
        if (!planData || !Array.isArray(planData.plan)) {
             throw new Error("La parte JSON de la respuesta de la IA no es válida o no contiene un array 'plan'.");
        }
        return { plan: planData.plan, analysis: analysisPart };
    } catch (error) {
        console.error("Error en analyzeWeeklyTasks con Vertex AI:", error);
        throw new functions.https.HttpsError("internal", `Ocurrió un error al analizar las tareas con IA. Error: ${error.message}`);
    }
});

exports.refineWeeklyPlan = functions.runWith({timeoutSeconds: 540, memory: '1GB'}).https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const { plan, instruction } = data;
    if (!plan || !Array.isArray(plan) || !instruction) {
        throw new functions.https.HttpsError("invalid-argument", "Se requiere un 'plan' (array) y una 'instruction' (string).");
    }

    try {
        const vertexAI = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: "us-central1" });
        const generativeModel = vertexAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const user = await admin.auth().getUser(context.auth.uid);
        const userName = user.displayName || user.email;

        // Simplify the plan for the prompt, keeping only necessary info
        const simplifiedPlan = plan.map(item => ({ taskId: item.taskId, title: item.title, plannedDate: item.plannedDate }));

        const prompt = `
        Actúa como un asistente de planificación que refina un plan existente basado en las instrucciones del usuario, ${userName}.

        **Plan Actual:**
        \`\`\`json
        ${JSON.stringify(simplifiedPlan, null, 2)}
        \`\`\`

        **Instrucción del Usuario:**
        "${instruction}"

        **Tu Tarea:**
        Modifica el plan actual para incorporar la instrucción del usuario. Debes mantener la estructura de datos original.

        **Reglas de Refinamiento:**
        1.  **Interpreta la Instrucción:** Entiende la intención del usuario (ej: mover tarea, día más ligero, priorizar algo).
        2.  **Modifica Fechas:** Cambia las \`plannedDate\` según la instrucción.
        3.  **Respeta las Fechas:** Asegúrate de que las nuevas fechas sean válidas y estén en formato 'YYYY-MM-DD'. No uses fines de semana.
        4.  **No Añadir/Quitar Tareas:** Solo puedes reprogramar las tareas existentes en el plan.

        **Formato de Salida (OBLIGATORIO):**
        1.  **EL PLAN REFINADO (JSON):** Un objeto JSON con una clave "plan" que contiene el array de tareas COMPLETO Y MODIFICADO.
        2.  **SEPARADOR:** Inserta este separador exacto: \`---JSON_PLAN_SEPARATOR---\`
        3.  **EL ANÁLISIS REFINADO (MARKDOWN):** Un nuevo análisis en Markdown que refleje los cambios realizados, explicando CÓMO se incorporó la instrucción del usuario.

        **Ejemplo de Salida:**
        { "plan": [ { "taskId": "...", "title": "...", "plannedDate": "2025-08-06" } ] }
        ---JSON_PLAN_SEPARATOR---
        ### Plan Refinado
        ¡Entendido! He ajustado el plan según tus indicaciones.
        *   **Martes 6 de Agosto**:
            *   **Revisar Planos** - *Justificación: Movida aquí como solicitaste para tener un lunes más tranquilo.*
        `;

        const result = await generativeModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
        let responseText = result.response.candidates[0].content.parts[0].text;
        responseText = responseText.replace(/^```json\s*/, '').replace(/```\s*$/, '');
        const separator = '---JSON_PLAN_SEPARATOR---';
        const parts = responseText.split(separator);
        if (parts.length < 2) {
            throw new Error("La respuesta de la IA no contiene el separador requerido.");
        }
        const jsonPart = parts[0].trim();
        const analysisPart = parts[1].trim();
        const planData = JSON.parse(jsonPart);

        if (!planData || !Array.isArray(planData.plan)) {
            throw new Error("La parte JSON de la respuesta refinada no es válida.");
        }
        return { plan: planData.plan, analysis: analysisPart };

    } catch (error) {
        console.error("Error en refineWeeklyPlan:", error);
        throw new functions.https.HttpsError("internal", `Error al refinar el plan con IA. Error: ${error.message}`);
    }
});

exports.executeWeeklyPlan = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }

    const { plan } = data;
    if (!plan || !Array.isArray(plan)) {
        throw new functions.https.HttpsError("invalid-argument", "Se requiere un 'plan' (array) no vacío.");
    }

    const db = admin.firestore();
    const batch = db.batch();

    plan.forEach(item => {
        if (item.taskId && item.plannedDate) {
            const taskRef = db.collection('tareas').doc(item.taskId);
            batch.update(taskRef, { plannedDate: item.plannedDate, updatedAt: new Date() });
        }
    });

    try {
        await batch.commit();
        return { success: true, message: `Plan aplicado a ${plan.length} tareas.` };
    } catch (error) {
        console.error("Error aplicando el plan semanal:", error);
        throw new functions.https.HttpsError("internal", "Ocurrió un error al guardar el plan en la base de datos.");
    }
});

exports.getTaskSummaryWithAI = functions.https.onCall(async (data, context) => {
    // ... function logic
});

// CORRECTED SYNTAX
exports.enviarRecordatoriosDeVencimiento = functions.runWith({ secrets: ["TELEGRAM_TOKEN"] })
  .pubsub.schedule("every day 09:00")
  .timeZone("America/Argentina/Buenos_Aires")
  .onRun(async (context) => {
    // ... function logic
  });

exports.runAIAssistant = functions.runWith({timeoutSeconds: 540, memory: '1GB'}).https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const { text, userTasks } = data;
    if (!text || typeof text !== "string" || text.trim().length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "The function must be called with a non-empty 'text' argument.");
    }

    const vertexAI = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: "us-central1" });
    const generativeModel = vertexAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const today = new Date();
    const currentDate = today.toISOString().split("T")[0];
    const userTasksString = Array.isArray(userTasks) && userTasks.length > 0
        ? userTasks.map(task => `- ID: ${task.docId}, Título: "${task.title}", Vence: ${task.dueDate || 'N/A'}`).join('\n')
        : "El usuario no tiene tareas relevantes en su agenda actual.";

    const prompt = `
      Actúa como un asistente experto en creación de tareas. Tu única misión es analizar la petición de un usuario y convertirla en una o más tareas en formato JSON.

      **CONTEXTO:**
      - Fecha de Hoy: ${currentDate}

      **PETICIÓN DEL USUARIO:**
      "${text}"

      **PROCESO DE ANÁLISIS (SEGUIR ESTRICTAMENTE):**

      **1. Identificar Tareas Individuales:**
         - Lee la petición y determina si se refiere a una sola tarea o a múltiples tareas. Por ejemplo, "Crear tarea para revisar planos y otra para llamar al proveedor" son DOS tareas. "Hacer la presentación del cliente, que incluye investigar y armar el PowerPoint" es UNA tarea con dos subtareas.

      **2. Extraer Información para CADA Tarea:**
         - Para cada tarea identificada, extrae la siguiente información:
           - \`title\`: Un título claro y conciso (máx 10 palabras).
           - \`description\`: Una descripción breve si se proporciona.
           - \`dueDate\`: La fecha límite.

      **3. REGLAS DE FECHA (MUY IMPORTANTE):**
         - **SI** el usuario especifica una fecha (ej: "mañana", "el próximo lunes", "el 15 de agosto"), conviértela a formato 'YYYY-MM-DD' y úsala para \`dueDate\`.
         - **SI NO** se menciona ninguna fecha, el valor de \`dueDate\` DEBE SER \`null\`. No inventes ni asumas una fecha.

      **4. Formato de Salida JSON (OBLIGATORIO):**
         - Tu respuesta DEBE ser únicamente un objeto JSON.
         - El objeto debe tener una clave \`action\` con el valor fijo "CREATE".
         - El objeto debe tener una clave \`tasks\`, que es un array de los objetos de tarea que creaste. Cada objeto de tarea debe tener las claves: \`title\`, \`description\`, \`dueDate\`.
         - El objeto puede tener una clave opcional \`suggestion\` con un breve comentario si hiciste alguna interpretación importante (ej: "Interpreté 'la semana que viene' como el próximo lunes.").

      **REGLAS CRÍTICAS DE FORMATO:**
      - No incluyas explicaciones, saludos, ni bloques de código markdown (\`\`\`json).
      - La respuesta DEBE empezar con \`{\` y terminar con \`}\`.

      **EJEMPLO 1: Con fecha**
      - Petición: "crear tarea para la reunión con el cliente X mañana"
      - Salida Esperada:
        {
          "action": "CREATE",
          "tasks": [
            {"title": "Reunión con cliente X", "description": "Preparar y asistir a la reunión con el cliente X.", "dueDate": "${new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0]}"}
          ],
          "suggestion": null
        }

      **EJEMPLO 2: Sin fecha**
      - Petición: "Necesito revisar los planos del nuevo ensamblaje"
      - Salida Esperada:
        {
          "action": "CREATE",
          "tasks": [
            {"title": "Revisar planos del nuevo ensamblaje", "description": "Revisar los planos detallados del nuevo ensamblaje.", "dueDate": null}
          ],
          "suggestion": "No se especificó una fecha, por lo que la tarea se creará sin fecha límite."
        }

      **EJEMPLO 3: Múltiples tareas**
      - Petición: "recordar llamar a Ana el viernes y preparar el reporte de ventas"
      - Salida Esperada:
        {
          "action": "CREATE",
          "tasks": [
            {"title": "Llamar a Ana", "description": "Llamar a Ana.", "dueDate": "YYYY-MM-DD (la fecha del próximo viernes)"},
            {"title": "Preparar reporte de ventas", "description": "Preparar el reporte de ventas semanal.", "dueDate": null}
          ],
          "suggestion": "He creado dos tareas separadas como solicitaste."
        }
    `;

    try {
        const result = await generativeModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
        const responseText = result.response.candidates[0].content.parts[0].text;
        const jsonMatch = responseText.match(/{[\s\S]*}/);
        if (!jsonMatch) {
            throw new Error("La IA no pudo generar un plan de acción válido.");
        }
        const plan = JSON.parse(jsonMatch[0]);
        if (!plan.action || !plan.tasks) {
            throw new Error("El plan de la IA tiene un formato incorrecto.");
        }
        return plan;
    } catch (error) {
        console.error("Error en runAIAssistant:", error);
        throw new functions.https.HttpsError("internal", error.message || "Error al procesar la petición con la IA.");
    }
});

exports.executeAIAssistantPlan = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const { plan } = data;
    if (!plan || !plan.action || !Array.isArray(plan.tasks)) {
        throw new functions.https.HttpsError("invalid-argument", "El plan proporcionado es inválido.");
    }

    const db = admin.firestore();
    const batch = db.batch();
    const tasksRef = db.collection('tareas');
    const userUid = context.auth.uid;

    if (plan.action === 'CREATE') {
        plan.tasks.forEach(task => {
            const newTaskRef = tasksRef.doc();
            batch.set(newTaskRef, {
                title: task.title || "Tarea sin título",
                description: task.description || "",
                dueDate: task.dueDate, // Allow null or specific date
                creatorUid: userUid,
                assigneeUid: userUid, // Default to self-assigned
                status: 'todo',
                priority: 'medium',
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        });
    } else if (plan.action === 'UPDATE') {
        plan.tasks.forEach(task => {
            const taskRef = tasksRef.doc(task.id);
            const updateData = { [task.field]: task.newValue, updatedAt: new Date() };
            batch.update(taskRef, updateData);
        });
    } else {
        throw new functions.https.HttpsError("invalid-argument", `Acción desconocida en el plan: ${plan.action}`);
    }

    try {
        await batch.commit();
        return { success: true, message: "Plan ejecutado con éxito." };
    } catch (error) {
        console.error("Error ejecutando el plan del asistente IA:", error);
        throw new functions.https.HttpsError("internal", "No se pudo ejecutar el plan en la base de datos.");
    }
});

/**
 * Scheduled function to delete archived tasks older than 6 months.
 * Runs every day at 3:00 AM (Argentina time).
 */
exports.deleteOldArchivedTasks = functions.pubsub.schedule("every day 03:00")
  .timeZone("America/Argentina/Buenos_Aires")
  .onRun(async (context) => {
    console.log("Running scheduled task: Deleting old archived tasks...");

    const db = admin.firestore();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const tasksRef = db.collection("tareas");
    const q = query(tasksRef,
        where('isArchived', '==', true),
        where('completedAt', '<', sixMonthsAgo)
    );

    try {
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            console.log("No old archived tasks to delete.");
            return null;
        }

        const batch = db.batch();
        querySnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        console.log(`Successfully deleted ${querySnapshot.size} old archived tasks.`);
        return null;
    } catch (error) {
        console.error("Error deleting old archived tasks:", error);
        return null;
    }
});

// CORRECTED SYNTAX
exports.sendTaskNotification = functions.runWith({ secrets: ["TELEGRAM_TOKEN"] })
  .firestore.document('tareas/{taskId}')
  .onWrite(async (change, context) => {
    // ... function logic
  });

// CORRECTED SYNTAX
exports.sendTestTelegramMessage = functions.runWith({ secrets: ["TELEGRAM_TOKEN"] })
  .https.onCall(async (data, context) => {
    // ... function logic
  });

exports.updateCollectionCounts = functions.firestore
  .document('{collectionId}/{docId}')
  .onWrite(async (change, context) => {
    // ... function logic
});

exports.listModels = functions.https.onCall(async (data, context) => {
    // ... function logic
});

exports.enviarRecordatoriosDiarios = functions.pubsub.schedule("every day 09:00")
  .timeZone("America/Argentina/Buenos_Aires")
  .onRun(async (context) => {
    // ... function logic
  });