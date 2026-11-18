# Laboratorios guiados de RISIO

Acceso: **Biblioteca / Evaluaciones → Laboratorios** o **Filtración → Laboratorio guiado**.

Tres prácticas formativas, basadas en el libro de fisiología renal incluido:

| Laboratorio | Cambio controlado | Resultado esperado |
|---|---|---|
| Una presión que se opone | PBS: 18 → 24 mmHg | PNF: 10 → 4 mmHg; TFG: 125 → 50 mL/min |
| La capacidad del filtro | Kf: 12,5 → 6 mL/min/mmHg | PNF constante de 10 mmHg; TFG: 125 → 60 mL/min |
| Más soluto, ¿más filtración? | Urea: 30 → 60 mg/dL | Carga: 37,5 → 75 mg/min; TFG constante de 125 mL/min |

## Flujo del estudiante

1. Elegir un reto y registrar una predicción antes de experimentar.
2. Abrir el mismo visor de filtración, ajustar el slider señalado y observar. El botón de registro se habilita cuando se alcanza el valor indicado, con las otras variables iniciales.
3. Registrar la medición, elegir la explicación causal y escribir una reflexión de 30 a 2000 caracteres.
4. Guardar un borrador o entregar para revisar las respuestas. Cada respuesta comprobable vale 50 %: predicción y explicación elegida. La reflexión escrita se conserva sin evaluación automática.
5. Repetir la experiencia sin borrar entregas anteriores. Se muestran los últimos 10 intentos. Cada registro se puede descargar como texto para compartirlo voluntariamente con el docente.

Los borradores se guardan al avanzar de paso, registrar una medición y pulsar **Guardar borrador**. El texto no guardado se conserva al volver al catálogo durante la sesión, pero debe guardarse explícitamente antes de cerrar el navegador.

## Activación

Conservar el `.env.local` propio y publicar `database.rules.json` en Firebase Realtime Database → Reglas. Se añadieron `laboratoryProgress` y `laboratoryAttempts`. El guardado usa la misma base de datos; no requiere Cloud Functions ni Cloud Storage.

Los datos de laboratorio son privados de cada cuenta verificada con perfil UPB. No se amplía el acceso a docentes de forma global; el registro descargable permite la entrega voluntaria. Un panel docente por curso necesitaría permisos y asignaciones de curso explícitos.

`npm start` ejecuta el proyecto local. `npm run build:web` genera `dist/` para GitHub Pages con la configuración propia. Los módulos del laboratorio y los recursos usan rutas relativas.

## Verificación

- `npm run test:labs`: cálculos, conservación de variables, validación del flujo y puntajes.
- `npm run test:labs:rules`: privacidad, borradores, entrega atómica, reintentos e historial en el emulador.
- `npm test`: regresión del proyecto completo.

Es una práctica formativa de un modelo simplificado: presiones medias constantes y presión oncótica en Bowman despreciable. No representa autorregulación, reabsorción tubular ni volumen final de orina; tampoco proporciona una evaluación académica protegida contra manipulación del cliente.

En esta entrega pasaron las pruebas completas del proyecto y del emulador. La interfaz se revisó con persistencia de prueba en navegador, incluyendo modos claro/oscuro, anchos de 768 y 390 píxeles, recuperación de borradores y resultados correctos/incorrectos. El navegador de revisión no dispone de WebGL: no se pudo confirmar visualmente el renderizado 3D en ese entorno. La simulación existente y sus cálculos sí pasaron sus pruebas automatizadas.
