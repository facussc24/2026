# AMFE‑FMEA de Proceso (versión profesional)

Este proyecto implementa una herramienta completa para la elaboración de
**AMFE‑FMEA de Proceso Preliminar** siguiendo las directrices de AIAG‑VDA.
A diferencia de plantillas simplificadas, esta versión utiliza una
**estructura jerárquica** que permite representar claramente los pasos de
descomposición del proceso (sistema → paso → elemento 4M). Cada elemento
puede contener múltiples **modos de falla** con sus efectos, modos y
causas. La evaluación de riesgos (Severidad, Ocurrencia, Detección y
Prioridad de Acción) y las acciones de optimización se gestionan a nivel
de elemento. Además, incluye un backend en Node.js para guardar y
recuperar análisis y una utilidad de exportación a Excel.

## 📂 Estructura del proyecto

```
amfe_pro_app_final/
├── public/
│   ├── index.html      # Interfaz web con estructura y panel de detalle
│   ├── styles.css      # Estilos responsive y codificación de colores
│   └── script.js       # Lógica del frontend (estructura jerárquica,
│                       #   cálculo de AP, exportación, etc.)
├── data/
│   └── fmeas.json      # Fichero de almacenamiento de AMFE (se genera
│                       #   automáticamente al guardar)
├── server.js           # Servidor HTTP/Express minimalista
├── package.json        # Script de arranque (npm start)
└── README.md           # Este archivo
```

## 🚀 Cómo ejecutar

1. **Instala Node.js** (versión 18 o superior). Comprueba con `node -v`.
2. Abre una terminal en la carpeta `amfe_pro_app_final` y ejecuta:

   ```bash
   npm start
   ```

   Esto iniciará el servidor en `http://localhost:3000`. La primera vez se
   creará automáticamente el directorio `data` y el archivo `fmeas.json`.
3. Accede con tu navegador a `http://localhost:3000` y comienza a crear
   tu AMFE. Puedes añadir ítems, pasos y elementos, así como múltiples
   modos de falla por elemento. A medida que completes los datos, la
   prioridad de acción (AP) se calcula automáticamente en función de
   Severidad, Ocurrencia y Detección.
4. Cuando finalices tu análisis, pulsa **Guardar AMFE** para almacenarlo
   en el servidor. Si deseas compartirlo o enviarlo a tu cliente, puedes
   pulsar **Exportar a Excel** para descargar un archivo `.xlsx` con las
   hojas “AMFE” y “Plan de control”.

## ✏️ Uso de la interfaz y criterios AIAG‑VDA

- **Estructura (Paso 2)**: en el panel izquierdo puedes crear
  **ítems** (sistemas/subsistemas/procesos), añadir **pasos** a cada
  ítem y dentro de cada paso añadir **elementos 4M** (Máquina, Mano de
  obra, Materiales, Método, Medición, Medio Ambiente). Cada elemento
  representa una unidad de análisis. Puedes renombrar ítems y pasos en
  cualquier momento.
- **Panel de detalle**: al seleccionar un elemento, se habilita el panel
  derecho donde puedes rellenar:
  - **Funciones (Paso 3)**: describe la función del ítem, del paso y del
    elemento.
  - **Fallos (Paso 4)**: lista de modos de falla. Con el botón “+ Modo
    de Falla” puedes añadir tantas filas como necesites; cada una tiene
    campos para efecto, modo, causa y controles.
  - **Riesgos (Paso 5)**: selecciona los valores de **Severidad (S)**,
    **Ocurrencia (O)** y **Detección (D)** (1–10). La herramienta
    calcula automáticamente la **Prioridad de Acción (AP)** según una
    aproximación de la tabla AIAG‑VDA y codifica el resultado en rojo
    (Alta), amarillo (Media) o verde (Baja). También clasifica las
    características especiales: “Crítica” si S ≥ 9, “Significativa” si
    5 ≤ S ≤ 8 y O ≥ 4, y vacío en caso contrario. Estos valores se
    trasladan al plan de control.
  - **Optimización (Paso 6)**: registra acciones preventivas y
    detectivas, responsable individual, fechas objetivo, estatus y
    realiza una reevaluación del riesgo (S, O, D post) para ver cómo
    cambia la AP. Si la AP es Alta o Media, la aplicación exige al
    menos una acción. La severidad (S) no se modifica en la
    reevaluación, pero ocurrencia y detección sí deben actualizarse.
- **Plan de control**: en la segunda pestaña puedes definir las
  características clave, especificaciones, métodos de control,
  muestreos y planes de reacción para cada ítem del AMFE. Cada ítem se
  convierte automáticamente en un proceso/operación del plan de control.

## 📄 Referencias

Este software se ha diseñado siguiendo la **metodología AIAG‑VDA**
para AMFE‑FMEA de proceso. El manual de AIAG‑VDA enfatiza que el
análisis debe descomponerse en pasos y elementos de trabajo (4M) para
comprender las relaciones entre las funciones, fallas, causas y
controles【620046873966410†L500-L658】. La evaluación de riesgos se realiza a
través de tablas independientes de severidad, ocurrencia y detección
para establecer la prioridad de acción【620046873966410†L1689-L1716】, y la
columna de características especiales se utiliza para señalar aquellas
características que requieren controles especiales【620046873966410†L3291-L3336】.

## 🧭 Próximos pasos

Aunque esta versión ya es apta para producción, puedes ampliar la
funcionalidad de varias maneras:

- Incorporar la tabla oficial de **Action Priority** (AIAG‑VDA) para
  obtener una clasificación más precisa.
- Añadir autenticación para diferentes usuarios y niveles de acceso.
- Integrar bases de datos reales (por ejemplo MongoDB o MySQL) en
  lugar de un fichero JSON para almacenar los AMFE.
- Implementar exportación a PDF o generación de informes personalizados.

Esperamos que esta herramienta te sirva para documentar y analizar
procesos de manera profesional y conforme a los estándares de la
industria automotriz.