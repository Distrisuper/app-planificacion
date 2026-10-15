@AGENTS.md

## Solo para Claude Code

- Para cerrar una tarea usá la skill `pr` (`.claude/skills/pr/SKILL.md`).
- Al leer ciertos archivos se cargan reglas puntuales de `.claude/rules/` (mapa y GPS, cierre de la
  visita, alta y ficha, sesión y roles); el detalle está en `docs/dominio/decisiones-front.md`.
- El guard (`.claude/hooks/guard.cjs`) puede negar un comando: leé el motivo y buscá otro camino,
  no lo esquives. Si una regla está mal, decilo en el PR.
