---
paths:
  - "src/components/RelevamientoSheet*.tsx"
  - "src/components/ClienteNuevoSheet*.tsx"
  - "src/components/relevamiento/**"
  - "src/lib/alta*.ts"
  - "src/lib/camposAlta*.ts"
  - "src/lib/relevamientos*.ts"
  - "src/hooks/useCamposFicha*.ts"
  - "src/hooks/useFicha*.ts"
  - "src/hooks/useEsquemaAlta*.ts"
  - "src/hooks/useAltas*.ts"
---

# Visita de alta y datos del comercio

Antes de cambiar estos archivos leé `docs/dominio/decisiones-front.md`, sección "Visita de alta
y datos del comercio", y `docs/dominio/modelo.md`, "La visita de alta". Lo que más se rompe:

- Los formularios los dibuja el backend (`GET /planificacion/altas/esquema`,
  `GET /planificacion/ficha/campos`): un campo u opción nueva es un cambio en api-vendedores o en
  la base, no en el front.
- Sin catálogo cargado no se dibuja el botón que cierra el formulario.
- El gate de la ficha corta en `onConfirmarPropuesta`, antes del mapa; el alta queda afuera de ese
  gate y pide la ficha con la visita abierta.
