# Propuesta: Sistema de Páginas Múltiples / Wizard para AMFE

## Problema Identificado
La página principal (`index.html`) es demasiado larga verticalmente, lo que hace difícil:
- Navegar entre secciones
- Mantener el contexto del trabajo actual
- Encontrar información específica
- Trabajar de manera eficiente

## Solución Propuesta: Wizard de Pasos con Navegación Lateral

### Concepto
Transformar la página única larga en un **sistema de wizard de pasos** donde cada sección principal se presenta en su propia "página" virtual, con navegación lateral clara y barra de progreso.

### Estructura de Pasos

#### Paso 1: Datos Generales 📋
**Contenido:**
- Información del AMFE (nombre, número, revisión)
- Fechas y responsables
- Datos de la planta y cliente
- Modelo de plataforma

**Navegación:** Botón "Siguiente: Estructura del Proceso →"

#### Paso 2: Estructura del Proceso 🏗️
**Contenido:**
- Panel de estructura (árbol de ítems/pasos/elementos)
- Panel de detalle del elemento seleccionado
- Modos de falla, efectos, causas
- Severidad, Ocurrencia, Detección

**Navegación:** 
- "← Anterior: Datos Generales"
- "Siguiente: Controles →"

#### Paso 3: Plan de Control 🎯
**Contenido:**
- Tabla del Plan de Control VDA
- Controles de proceso y producto
- Frecuencias y métodos

**Navegación:**
- "← Anterior: Estructura"
- "Siguiente: IATF 16949 →"

#### Paso 4: Cumplimiento IATF 16949 ⚙️
**Contenido:**
- Gestión de Controles Temporales
- Gestión de Cadena de Suministro (PTCs)
- Escalación de Riesgos

**Navegación:**
- "← Anterior: Plan de Control"
- "Siguiente: Resumen →"

#### Paso 5: Resumen y Exportación 📊
**Contenido:**
- Vista previa del AMFE completo
- Indicadores de completitud
- Validación final
- Botones de exportación (PDF, Excel)
- Historial de cambios

**Navegación:**
- "← Anterior: IATF 16949"
- "💾 Guardar y Finalizar"

### Características de UX

#### Navegación Lateral Fija
```
┌─────────────────────┐
│ ✓ 1. Datos Generales│
│ → 2. Estructura     │
│   3. Plan Control   │
│   4. IATF 16949     │
│   5. Resumen        │
└─────────────────────┘
```

- Barra lateral siempre visible
- Pasos completados con checkmark verde
- Paso actual destacado
- Click para ir a cualquier paso completado
- Pasos futuros deshabilitados hasta completar anteriores

#### Barra de Progreso
```
[████████░░░░░░░░░░░] 40% Completo
```
- En la parte superior de cada paso
- Porcentaje de completitud global
- Animación al avanzar

#### Validación por Paso
- No se puede avanzar sin completar campos obligatorios del paso actual
- Mensajes claros sobre qué falta
- Opción "Guardar como borrador" en cualquier momento

#### Estado Persistente
- Auto-guardado en cada paso
- Puede cerrar y volver donde dejó
- Historial de navegación guardado

### Ventajas

✅ **Menor Carga Cognitiva**: Solo ves lo relevante al paso actual
✅ **Navegación Clara**: Sabes exactamente dónde estás
✅ **Progreso Visible**: Motivación al ver avance
✅ **Menos Scroll**: Cada paso cabe en pantalla
✅ **Mejor Móvil**: Mucho más usable en tablets/móviles
✅ **Validación Gradual**: Errores detectados paso a paso
✅ **Mismo Firebase**: Sin cambios en backend
✅ **Formatos VDA Intactos**: Se mantienen estándares

### Implementación Técnica

#### HTML
- Un contenedor por paso: `<div class="wizard-step" id="step-1">`
- Solo un paso visible a la vez: `display: block/none`
- Navegación lateral: `<nav class="wizard-nav">`

#### JavaScript
```javascript
const wizard = {
  currentStep: 1,
  maxStep: 1,
  goToStep(n) { /* cambiar paso */ },
  nextStep() { /* validar y avanzar */ },
  prevStep() { /* retroceder */ },
  updateProgress() { /* actualizar barra */ }
}
```

#### CSS
- Transiciones suaves entre pasos
- Responsive: navegación colapsa en móvil
- Modo compacto compatible

### Comparación

| Aspecto | Página Única Actual | Wizard Propuesto |
|---------|---------------------|------------------|
| Longitud scroll | 8,000-12,000px | ~1,500px por paso |
| Contexto | Abrumador | Enfocado |
| Navegación | Difícil | Intuitiva |
| Móvil | Complicado | Excelente |
| Validación | Al final | Gradual |
| Progreso | Poco claro | Muy claro |

### Migración

1. **Fase 1**: Crear estructura wizard con CSS/JS
2. **Fase 2**: Reorganizar HTML en pasos
3. **Fase 3**: Agregar validación por paso
4. **Fase 4**: Testing exhaustivo
5. **Fase 5**: Documentación usuario

### Alternativa: Tabs con Subpáginas

Si el wizard es muy rígido, alternativa con tabs independientes:
- Cada tab es casi independiente
- No hay orden forzado
- Más libertad pero menos guía

## Recomendación

**Implementar el sistema Wizard** porque:
1. Guía natural del flujo AMFE
2. Reduce complejidad visual drásticamente
3. Mejora experiencia móvil significativamente
4. Mantiene estándares VDA
5. Fácil de implementar sobre estructura actual

## Próximos Pasos

1. ¿Aprobación del concepto wizard?
2. Mockup visual del diseño
3. Implementación del framework wizard
4. Reorganización del contenido en pasos
5. Testing de usabilidad
