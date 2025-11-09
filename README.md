# AMFE‑FMEA de Proceso (versión Firebase)

Este proyecto implementa una herramienta completa para la elaboración de
**AMFE‑FMEA de Proceso Preliminar** siguiendo las directrices de AIAG‑VDA.
A diferencia de plantillas simplificadas, esta versión utiliza una
**estructura jerárquica** que permite representar claramente los pasos de
descomposición del proceso (sistema → paso → elemento 4M). Cada elemento
puede contener múltiples **modos de falla** con sus efectos, modos y
causas. La evaluación de riesgos (Severidad, Ocurrencia, Detección y
Prioridad de Acción) y las acciones de optimización se gestionan a nivel
de elemento. Los datos se almacenan en **Firebase Firestore** en la nube
y la aplicación incluye utilidad de exportación a Excel.

## 🔥 Ahora con Firebase

Esta aplicación usa **Firebase Firestore** para almacenamiento en la nube:
- ✅ Sin necesidad de servidor Node.js
- ✅ Escalabilidad automática
- ✅ Acceso desde cualquier lugar
- ✅ Backup automático
- ✅ Plan gratuito generoso

## 📋 Tabla de Contenidos

- [Características](#-características)
- [Configuración Rápida](#-configuración-rápida)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Requisitos](#-requisitos)
- [Guía de Configuración Completa](#-guía-de-configuración-completa)
- [Uso de la Interfaz](#-uso-de-la-interfaz)
- [Referencias](#-referencias)

## ✨ Características

- ✅ **Estructura jerárquica completa**: Ítems → Pasos → Elementos 4M
- ✅ **Múltiples modos de falla por elemento**
- ✅ **Cálculo automático de Prioridad de Acción (AP)** según AIAG-VDA
- ✅ **Clasificación de características especiales** (Crítica/Significativa)
- ✅ **Plan de control integrado**
- ✅ **Exportación a Excel** con formato profesional
- ✅ **Almacenamiento en la nube con Firebase Firestore**
- ✅ **Gestión multi-documento**
- ✅ **Búsqueda y filtrado**
- ✅ **Validación de datos completa**
- ✅ **Interfaz responsive**
- ✅ **Sin servidor que mantener**

## 🚀 Configuración Rápida

### Paso 1: Obtener el código
```bash
git clone https://github.com/facussc24/2026.git
cd 2026
```

### Paso 2: Configurar Firebase
1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com/)
2. Crea una base de datos Firestore (modo prueba)
3. Obtén tus credenciales de Firebase
4. Abre `public/firebase-config.js`
5. Reemplaza los valores de ejemplo con tus credenciales

```javascript
const firebaseConfig = {
  apiKey: "TU_API_KEY_AQUI",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto-id",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

### Paso 3: Ejecutar
```bash
npm install
npm run serve
```

### Paso 4: Abrir en navegador
Ve a: http://localhost:3000/home.html

**📖 Para instrucciones detalladas, ver [FIREBASE_SETUP.md](FIREBASE_SETUP.md)**

## 📂 Estructura del proyecto

```
2026/
├── public/                     # Frontend de la aplicación
│   ├── index.html             # Interfaz principal del editor AMFE
│   ├── home.html              # Página de inicio (lista de AMFEs)
│   ├── styles.css             # Estilos responsive y codificación de colores
│   └── script.js              # Lógica del frontend (1592 líneas)
├── data/                       # Almacenamiento de datos (auto-generado)
│   ├── docs.json              # Metadatos de documentos
│   └── amfes/                 # Contenido de documentos individuales
├── server.js                   # Backend Node.js/Express (151 líneas)
├── package.json               # Dependencias y scripts
├── README.md                  # Este archivo
├── README.txt                 # Instrucciones detalladas
├── FIREBASE_MIGRATION_GUIDE.md # Guía para migrar a Firebase
├── QUESTIONS_AND_IMPROVEMENTS.md # Preguntas y mejoras sugeridas
├── .gitignore                 # Archivos excluidos del control de versiones
├── run_server.bat             # Script de inicio para Windows
└── run_server.sh              # Script de inicio para Linux/Mac
```

## 🔧 Requisitos

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

## 🔥 Mejoras recientes (Noviembre 2024)

### Mejoras de Código
- ✅ Agregado `.gitignore` para excluir node_modules y archivos de datos
- ✅ Mejorado `server.js` con:
  - Documentación JSDoc completa
  - Mejor manejo de errores
  - Validación de entrada
  - Mensajes de log más informativos
- ✅ Mejorado `home.html` con:
  - Mejor manejo de errores en operaciones async
  - Mensajes de feedback para el usuario
  - Manejo de estado vacío
  - Try-catch en todas las operaciones de red

### Documentación
- ✅ **FIREBASE_MIGRATION_GUIDE.md**: Guía completa para migrar a Firebase
  - Instrucciones paso a paso
  - Ejemplos de código para conversión de API REST a Firestore
  - Configuración de autenticación
  - Script de migración de datos
  - Análisis de costos
  
- ✅ **QUESTIONS_AND_IMPROVEMENTS.md**: Preguntas y mejoras sugeridas
  - 12 preguntas clave sobre requerimientos
  - 25+ sugerencias de mejora priorizadas
  - Checklist de pruebas
  - Recomendaciones de arquitectura

### Calidad del Código
- Código más legible y mantenible
- Mejor separación de responsabilidades
- Documentación inline mejorada
- Preparado para escalamiento futuro

## 🚀 Migración a Firebase

¿Estás considerando migrar a Firebase? Consulta la **[Guía de Migración a Firebase](FIREBASE_MIGRATION_GUIDE.md)** que incluye:

- Comparación entre arquitectura actual y Firebase
- Instrucciones paso a paso de migración
- Ejemplos de código completos
- Configuración de autenticación y seguridad
- Script de migración de datos existentes

**Ventajas de Firebase:**
- Escalabilidad automática
- Hosting gratuito con SSL
- Sincronización en tiempo real
- Backup automático
- No requiere servidor

## ❓ Preguntas y Mejoras

Para ver el análisis completo de mejoras sugeridas y preguntas sobre el proyecto, consulta **[QUESTIONS_AND_IMPROVEMENTS.md](QUESTIONS_AND_IMPROVEMENTS.md)**.

El documento cubre:
- Decisiones de arquitectura (¿Firebase o servidor propio?)
- Funcionalidades adicionales sugeridas
- Mejoras de UX/UI
- Optimizaciones de rendimiento
- Plan de pruebas

Esperamos que esta herramienta te sirva para documentar y analizar
procesos de manera profesional y conforme a los estándares de la
industria automotriz.
## 📂 Estructura del Proyecto

```
2026/
├── public/                      # Aplicación frontend
│   ├── index.html              # Interfaz principal del editor AMFE
│   ├── home.html               # Página de inicio (lista de AMFEs)
│   ├── styles.css              # Estilos responsive
│   ├── script.js               # Lógica principal
│   └── firebase-config.js      # ⚙️ CONFIGURAR AQUÍ tus credenciales
├── firestore.rules              # Reglas de seguridad
├── firebase.json                # Configuración Firebase
├── package.json                 # Dependencias
├── FIREBASE_SETUP.md            # 📖 Guía detallada paso a paso
└── README.md                    # Este archivo
```

## 🎯 Cambios Importantes - Versión Firebase

Esta versión usa **Firebase** en lugar de servidor Node.js:

### ✅ Lo que cambió:
- ❌ **Eliminado**: server.js, carpeta data/, Express
- ✅ **Agregado**: Firebase Firestore, firebase-config.js
- ✅ **Actualizado**: script.js, home.html, index.html para usar Firebase

### �� Archivo Clave para Configurar:
**`public/firebase-config.js`** ← Edita este archivo con tus credenciales de Firebase

### 📖 Documentación:
- **FIREBASE_SETUP.md**: Guía completa de configuración
- **FIREBASE_MIGRATION_GUIDE.md**: Referencia técnica de la migración

## 🌐 Deploy a Producción (Opcional)

### Opción 1: Firebase Hosting (Recomendado)
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```

### Opción 2: Cualquier hosting estático
Solo sube la carpeta `public/` a tu hosting favorito (Netlify, Vercel, etc.)

