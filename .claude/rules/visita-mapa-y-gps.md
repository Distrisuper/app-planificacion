---
paths:
  - "src/components/MapaVisita*.tsx"
  - "src/components/VisitaFlow*.tsx"
  - "src/lib/distancia*.ts"
  - "src/lib/geolocation*.ts"
  - "src/hooks/useAlejadoDelCliente*.ts"
  - "src/hooks/useGeolocation*.ts"
---

# Mapa, GPS y gates de la visita

Antes de cambiar estos archivos leé `docs/dominio/decisiones-front.md`, secciones "Iniciar la
visita: mapa y GPS" y "Cerrar la visita". Lo que más se rompe:

- Iniciar exige ≤`RADIO_INICIO_METROS` y bloquea solo con evidencia de lejanía
  (`distancia − precisión > radio`). Cerrar no tiene gate: el CTA de `modo='cerrar'` nunca se
  deshabilita.
- Todo fix pasa por `aceptarFix` (gana el mejor, no el último); toda posición a demanda pasa por
  `obtenerFix()`. El `maximumAge > 0` de `geolocation.ts` no se toca.
- El aviso "te alejaste" tiene histéresis simétrica (entra con `d − p > radio`, sale con
  `d + p ≤ radio`). El desvío al mapa al cerrar lo decide la coordenada definitiva, no `alejado`.
