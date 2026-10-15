---
name: pr
description: Cierra una tarea con un PR draft. Usala cuando la implementación está terminada (o cuando te piden "/pr", "abrí el PR", "cerrá la tarea"): corre el check completo, revisa el diff contra el requerimiento y abre el PR draft con la plantilla del repo.
---

# Cerrar la tarea con un PR draft

Un solo intento ordenado. Si un paso falla, arreglá la causa y repetí ese paso; no saltees pasos.

## 1. Rama

`git branch --show-current` no puede ser la rama base del repo (ver "Git y PR" en `AGENTS.md`).
Si estás en la base, creá `feature/<slug>` desde ahí antes de seguir.

## 2. Check completo

`npm run check` tiene que terminar en exit 0. Guardá el resumen de los tests para el PR.
No desactives, saltees ni borres tests para que pase.

## 3. Revisión del diff

`git diff --stat <base>...HEAD` y `git status`. Revisá:

- Que cada archivo tocado sea parte de la tarea. Lo que no, se saca.
- Nada de `.env` reales, dumps, tokens, datos de clientes ni archivos temporales.
- **Tests existentes modificados o borrados**: listalos (`git diff --name-status <base>...HEAD` sobre los
  archivos de test). Cada uno va explicado en el PR.
- Si cambia un endpoint, sus consumidores (sección "Consumidores" del `AGENTS.md` del back).

Después lanzá **un** subagente revisor con contexto limpio (herramienta Agent), pasándole el
requerimiento original y el comando del diff. Pedile solo bloqueantes: bugs, incumplimientos del
requerimiento, tests que no prueban lo que dicen, riesgos de datos/auth/contrato. Arreglá los
bloqueantes y volvé al paso 2. Lo menor no se arregla: va a "Riesgos" o se descarta. Una sola ronda.

## 4. Commit y push

Commits `tipo(alcance): descripción` en español. `git push -u origin <rama>` (nunca `--force` ni a la
base).

## 5. PR draft

Escribí el cuerpo en un archivo temporal fuera del repo siguiendo `.github/pull_request_template.md`
(Problema, Qué cambia, Decisiones tomadas, Tests, Riesgos) y abrí:

```
gh pr create --draft --base <base> --title "tipo(alcance): qué cambia" --body-file <archivo>
```

Nunca `gh pr ready`, `gh pr merge` ni aprobar.

## 6. Tarea en varios repos

Si la tarea tocó también otro repo (por ejemplo, el worktree del front sumado con `--add-dir`), repetí
los pasos 1 a 5 en ese repo con la misma rama. En cada PR enlazá el otro y escribí el orden de deploy
(primero el back).

## 7. Cierre

Respondé con el link de cada PR y una línea con lo que el revisor tiene que mirar primero
(lo que dice "No cubren" y "Riesgos").
