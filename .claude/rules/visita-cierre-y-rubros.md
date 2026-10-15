---
paths:
  - "src/components/VisitaSheet*.tsx"
  - "src/components/VisitaEnCursoBar*.tsx"
  - "src/components/EstadoVisitaSheet*.tsx"
  - "src/components/propuesta/**"
  - "src/lib/estadoDuracion*.ts"
  - "src/hooks/useVisitaTimer*.ts"
  - "src/hooks/useOfrecimientos*.ts"
---

# Cierre de la visita, rubros y cronómetro

Antes de cambiar estos archivos leé `docs/dominio/decisiones-front.md`, secciones "Cerrar la
visita", "Cronómetro de la visita abierta" y "Tabla de rubros de la visita (UI)". Lo que más se
rompe:

- El mínimo para cerrar es `min(2, total ofrecidos)` y el botón solo existe con
  `ofrecimientosCargados`: sin eso, con el GET en vuelo, el gate se auto-satisface.
- No hay tiempo mínimo para cerrar. Los umbrales del semáforo (`estadoDuracion.ts`) son de UI y no
  son el criterio de validez (`pl_criterio_visita`, vía `GET /planificacion/analitica/criterio`).
- Cerrada la visita, el sheet es de consulta: no existe "completar después".
