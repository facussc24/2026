
document.addEventListener('DOMContentLoaded', () => {
  loadLessons();
});

async function loadLessons() {
  const lessonsBody = document.getElementById('lessons-body');
  if (!lessonsBody) return;

  lessonsBody.innerHTML = '<tr><td colspan="5">Cargando lecciones...</td></tr>';

  try {
    const snapshot = await db.collection('docs').get();
    if (snapshot.empty) {
      lessonsBody.innerHTML = '<tr><td colspan="5">No se encontraron AMFEs para extraer lecciones.</td></tr>';
      return;
    }

    const lessons = [];
    snapshot.forEach(doc => {
      const fmea = doc.data().content;
      if (fmea && fmea.items) {
        fmea.items.forEach(item => {
          item.steps.forEach(step => {
            step.elements.forEach(el => {
              if (el.fallas && el.fallas.length > 0) {
                el.fallas.forEach(falla => {
                  const lesson = {
                    modo: falla.modo,
                    causa: falla.causa,
                    accion: el.acciones.accionTomada,
                    controles: [falla.controlesPrev, falla.controlesDetect, el.acciones.accionPrev, el.acciones.accionDet].filter(Boolean).join('; '),
                    proceso: `${item.name} -> ${step.name} -> ${el.type}`
                  };
                  if (lesson.modo || lesson.causa) { // Only add if there's a failure mode/cause
                    lessons.push(lesson);
                  }
                });
              }
            });
          });
        });
      }
    });

    renderLessons(lessons);

  } catch (error) {
    console.error("Error al cargar las lecciones aprendidas:", error);
    lessonsBody.innerHTML = '<tr><td colspan="5">Error al cargar las lecciones.</td></tr>';
  }
}

function renderLessons(lessons) {
  const lessonsBody = document.getElementById('lessons-body');
  lessonsBody.innerHTML = '';

  if (lessons.length === 0) {
    lessonsBody.innerHTML = '<tr><td colspan="5">No hay lecciones aprendidas para mostrar.</td></tr>';
    return;
  }

  lessons.forEach(lesson => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${lesson.modo || ''}</td>
      <td>${lesson.causa || ''}</td>
      <td>${lesson.accion || ''}</td>
      <td>${lesson.controles || ''}</td>
      <td>${lesson.proceso || ''}</td>
    `;
    lessonsBody.appendChild(tr);
  });
}
