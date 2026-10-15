---
paths:
  - "src/lib/sesionLocal*.ts"
  - "src/lib/roles*.ts"
  - "src/api/apiClient*.ts"
  - "src/api/authApi*.ts"
  - "src/context/**"
  - "src/router/**"
  - "src/main.tsx"
  - "src/components/prueba/**"
---

# Sesión, roles y vendedor de prueba

Tocar auth, roles o sesión es de los casos en que hay que frenar y preguntar (ver "Cómo se
trabaja una tarea" en `AGENTS.md`). Contexto en `docs/dominio/decisiones-front.md`, sección
"Sesión, roles y vendedor de prueba":

- Cerrar sesión, un 401 y un token por URL distinto limpian todo lo local de la sesión
  (`cerrarSesionLocal`, claves `visita-*`, caché de React Query).
- El front no tiene tabla de roles: decide con las capacidades de `GET /planificacion/me`.
  "Quién puede" nuevo = capacidad nueva en api-vendedores, no un `if (rol === ...)`.
- El vendedor de prueba (`PRUEBA-<userId>`) es una identidad, no un modo.
