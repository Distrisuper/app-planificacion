# Guard de agentes

Qué le niega este repo a un agente de Paperclip, y por qué. Es el patrón de api-vendedores
(`.claude/hooks/guard.js` + `.githooks/pre-push`) adaptado a un front que despliega en Vercel.
Si una regla molesta, se discute acá y se cambia junto con su test; no se desactiva el hook.

## Cómo funciona

- **`.claude/hooks/guard.cjs`** corre como hook `PreToolUse` de Claude Code (registrado en
  `.claude/settings.json`) sobre `Bash`, `PowerShell`, `Monitor`, `Read`, `Grep`, `Edit`,
  `Write`, `MultiEdit` y `NotebookEdit`. Si la acción está prohibida responde `deny` con la
  razón; si no, no dice nada y aplica el permiso normal.
- **`.githooks/pre-push`** (→ `pre-push.cjs`) es la segunda capa, para lo que el hook no parsea
  (un script que pushea por dentro). `npm install` lo activa (`prepare` → `core.hooksPath`), y
  el archivo tiene que estar como ejecutable en git (`100755`): si no, en Linux/mac git lo
  ignora. Si `core.hooksPath` no es `.githooks`, el hook niega todo `git push` del agente.
- **Solo actúan en modo agente**: alguna variable `PAPERCLIP_*` en el entorno (las inyecta
  Paperclip; es el mismo criterio que la guardia de `vite.config.ts`). **Sin `PAPERCLIP_*` no
  niegan nada**: la sesión del dueño queda igual que antes.
- **Excepción: `permissions.deny` de `settings.json`** aplica a todos, dueño incluido. Es una
  red por si el hook no corre (script faltante, timeout): solo lista lo irreversible
  (`gh pr merge` / `ready` / `review --approve`, `git push --no-verify` / `--force` / `-f` /
  `--mirror`, `vercel`, `firebase deploy`). Desde Claude Code no las corre nadie; el dueño las
  hace desde su terminal.
- En modo agente falla **cerrado**: un error interno del guard también niega, un JSON roto por
  stdin también, y si el script revienta fuera de la evaluación (`uncaughtException`) sale con
  código 2, que Claude Code toma como bloqueo.
- Son `.cjs` porque el `package.json` es `"type": "module"`.

## Reglas (solo modo agente)

| Regla | Porqué |
|---|---|
| Leer, buscar o escribir `.env*` (salvo `.env-example`), **incluido `.env.test`**, por tool o por terminal (`cat`, `Get-Content`, `git show HEAD:.env.test`, `--env-file`, globs `.env*`) | Los `.env` del dueño tienen URLs y claves reales. `.env.test` hoy solo tiene valores públicos, pero la regla es por nombre y no por contenido, para que no se afloje el día que alguien le agregue algo. |
| `env` / `printenv` / `set` / `export` solos (también con asignaciones al frente: `X=1 printenv`), `export -p`, `declare -x` / `-p`, `Get-ChildItem env:`, `process.env` entero o `Deno.env.toObject()` en código que se evalúa (`node -p process.env`, `bun -e`, `deno eval`) | Vuelcan `PAPERCLIP_API_KEY`. Buscar el texto (`rg -n process.env src`) sí se permite. |
| `vercel` y `vc` (su alias), directos o por `npx` / `npm exec` / `pnpm dlx` / `bunx` | Cualquier comando de la CLI puede desplegar o tocar el proyecto del team. El deploy lo hace el dueño. |
| `firebase … deploy` y cualquier `firebase hosting:*` (`hosting:channel:deploy`, `hosting:disable`...) | Hay deploys del ecosistema en Firebase Hosting; `hosting:disable` baja el sitio. |
| `npm run dev` / `preview` / `start` / `e2e*`, `vite` (salvo `vite build`), `playwright test` | `dev` y `preview` los levanta **solo el runtime service** de Paperclip, que les pasa las `VITE_*` del stack agente. Playwright entra porque su `webServer` corre `npm run dev`. Para verificar: `npm test`, `npm run build`, `npm run lint`. |
| `git push` a `master` (o parado en `master`; también `heads/master`, `refs/heads/master` y con comillas), con `--force` / `-f` / `--force-with-lease` / refspec `+rama`, `--no-verify`, `--delete` / `-d` / `:rama`, `--all` / `--branches` / `--mirror` / `--tags` / `--prune`, o sin el pre-push activo | El agente pushea **solo la rama de su tarea**: `git push [-u] origin <rama>`. `master` despliega en Vercel. Las opciones largas se comparan por prefijo (`--no-v`, `--for`, `--mi`...), porque git acepta abreviaturas. Vale para `git.exe`, rutas, `X=1 git`, `& git` de PowerShell, `env git` y `git --work-tree . push`. |
| `gh pr create` sin `--draft`, `gh pr ready`, `gh pr merge`, `gh pr review --approve` / `-a`, `gh workflow run`, `gh api` de escritura (incluye `-fcampo=valor` pegado y aprobar por `.../pulls/<n>/reviews`), `gh api graphql` con `mutation` | El PR se abre en draft; pasarlo a ready y mergear lo decide el dueño. Nadie aprueba su propio trabajo. Vale para `gh.exe`, rutas, `X=1 gh`, `& gh` / `& "C:\…\gh.exe"` / `. gh` de PowerShell, `x & gh`, `(gh …)`, `env` / `command` / `time` / `nohup` / `exec gh`, y con `-R` / `--repo` en cualquier lugar (`gh -R o/r pr merge 1`). |
| El pre-push rechaza, con `PAPERCLIP_*`, todo push que toque `refs/heads/master` (update o borrado) | La misma política que el hook, a nivel git, para lo que el hook no ve. |
| `core.hooksPath`, `ALLOW_MASTER_PUSH` | Apagarían el pre-push. |
| `git commit` en `master`, `reset --hard`, `checkout .` / `restore .`, `clean -f`, `branch -D master` | Descartan trabajo o ensucian la base. |
| `rm -r` fuera del repo, de la raíz o de `src`, `docs`, `.git`, `.claude`, `.githooks`, `e2e`, `public`, `scripts`, `Prototipo` | Los worktrees de otras tareas viven al lado (`../`). |
| `ssh` / `scp` / `sftp` | Ningún flujo de este front los necesita. |
| Editar `.claude/hooks/`, `.claude/settings*.json`, `.githooks/`, `.git/hooks/` (por tool, sin distinguir mayúsculas, o por terminal, incluido un comando de lectura con `>`, `>>`, `tee`, `Out-File`, `Set-Content` o `--output`) | Que el agente no pueda apagar su propio guard. Leerlos y correr sus tests sí. |

## Falsos positivos conocidos

- **`gh api graphql` con `-f` / `-F` se niega aunque sea una `query` de solo lectura**
  (`gh api graphql -f query='query{…}'`). Con campos, `gh api` hace POST y el guard no
  distingue una query de una mutation: falla cerrado a propósito. Para leer, usá los comandos
  de `gh` (`gh pr view`, `gh pr list --json …`) o `gh api` REST sin campos
  (`gh api repos/o/r/pulls/12`).
- Un tramo que nombra una ruta del guard y tiene `>` se niega aunque el destino sea otro
  archivo (`git show HEAD:.claude/hooks/guard.cjs > /tmp/x`). `git -c … <lectura>` sobre el
  guard también: `-c` puede cambiar el pager o el diff externo. Lo mismo con variables o
  envoltorios delante (`GIT_PAGER=… git log <guard>`, `env … git diff <guard>`,
  `GIT_CONFIG_COUNT=…`, `time cat <guard>`): se niega cualquier prefijo.

## Lo que el guard NO cubre

- `node -e` armando el nombre de un `.env` por partes, o un script propio que lo lea.
- `Grep` sobre todo el repo sin nombrar `.env*` (ripgrep saltea archivos ocultos por defecto,
  pero no es una garantía del guard).
- `curl` a la API de Vercel o de GitHub con un token. Lo cubren la regla "nunca deploy"
  y que el agente no tiene esos tokens.
- Un force push de rama hecho desde un script propio: el pre-push solo mira `master`.
- Evasión deliberada: `bash -c`, `node -e`, `eval`, `pwsh -c`, `$(...)`, alias, o `curl` a la
  API de GitHub con `gh auth token`. El guard es una red para errores honestos; lo que de verdad
  impide mergear o aprobar es la branch protection de `master` y un token del agente sin esos
  permisos.
- **Una variable seteada en un tramo anterior** (`export GIT_EXTERNAL_DIFF=…; git diff <guard>`,
  `$env:GIT_PAGER=…; git log <guard>`) **o un pager configurado en dos pasos**
  (`git config core.pager …` y después `git log <guard>`): el guard mira cada tramo por
  separado y no arrastra estado. Sí niega la variable en el mismo tramo
  (`GIT_PAGER=… git log <guard>`). Un cambio al guard hecho así queda en `git status` /
  `git diff` y lo tiene que ver la revisión.
- `.git/config` (salvo `core.hooksPath`, que el hook chequea antes de cada push),
  `.github/workflows/` y los settings de usuario de Claude Code.

## Cómo probarlo

```bash
npm run check:hooks

# modo agente simulado: las tres devuelven permissionDecision "deny"
for c in 'cat .env.test' 'vercel' 'git push --force'; do
  echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"$c\"},\"cwd\":\".\"}" \
    | PAPERCLIP_RUN_ID=simulado node .claude/hooks/guard.cjs; echo
done

# sin PAPERCLIP_*: no imprime nada (el dueño no ve ningún cambio)
echo '{"tool_name":"Bash","tool_input":{"command":"git push"},"cwd":"."}' \
  | env -i PATH="$PATH" node .claude/hooks/guard.cjs
```
