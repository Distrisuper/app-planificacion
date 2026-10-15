# Guard de Claude Code

Qué niega este repo cuando la acción viene de Claude Code, y por qué. Es el patrón de
api-vendedores (`.claude/hooks/guard.js` + `.githooks/pre-push`) adaptado a un front que despliega
en Vercel, y se comporta igual en los cuatro repos de distri (cada uno con su rama base).
Si una regla molesta, se discute acá y se cambia junto con su test; no se desactiva el hook.

## Cómo funciona

- **`.claude/hooks/guard.cjs`** corre como hook `PreToolUse` de Claude Code (registrado en
  `.claude/settings.json`) sobre `Bash`, `PowerShell`, `Monitor`, `Edit`, `Write`,
  `MultiEdit`, `NotebookEdit`, `Read`, `Grep` y `Glob`. Si la acción está prohibida responde `deny` con la
  razón; si no, no dice nada y aplica el permiso normal.
- **Aplica siempre.** El hook solo lo invoca Claude Code, así que no hay un "modo persona": lo
  que niega, una persona lo hace desde su propia terminal. No depende de ninguna variable de
  entorno.
- **Falla cerrado**: un error interno del guard niega, un JSON roto por stdin niega, y si el
  script revienta fuera de la evaluación (`uncaughtException`) sale con código 2, que Claude
  Code toma como bloqueo.
- **`.githooks/pre-push`** (→ `pre-push.cjs`) es la segunda capa, para lo que el hook no parsea
  (un script que pushea por dentro) y para las personas: rechaza todo push que actualice o
  borre `master` en el remoto, venga de donde venga. Escape, solo para una persona en su
  terminal: `ALLOW_BASE_PUSH=1 git push ...`. `npm install` lo activa (`prepare` →
  `core.hooksPath=.githooks`), y el archivo `pre-push` tiene que estar como ejecutable en git
  (`100755`): si no, en Linux/mac git lo ignora. Si `core.hooksPath` no es `.githooks`, el guard
  niega todo `git push` desde Claude Code.
- **`permissions.deny` de `settings.json`** es una red por si el hook no corre (script
  faltante, timeout): `.env` reales, credenciales, `gh pr merge` / `ready` / `review --approve`,
  `gh auth token`, `git push --no-verify` / `--force` / `-f` / `--force-with-lease` / `--mirror`,
  `vercel` / `vc` / `npx vercel`, `firebase deploy`, `ssh`, `scp`. Las rutas van con `/` delante
  (relativas a la raíz del proyecto, no al cwd).
- Son `.cjs` porque el `package.json` es `"type": "module"`.

## Reglas

| Regla | Porqué |
|---|---|
| Leer, buscar o escribir `.env` reales por tool o por terminal (`cat`, `Get-Content`, `git show HEAD:.env.test`, `--env-file`, `node -e "…('.env')"`, globs `.env*`; por tool `Read`, `Grep`, `Glob`): `.env`, `.env.local`, `.env.bak`, `.env-prod`, `.env.production`, `.env.tunnel`, `agente*.env`… **incluido `.env.test`**. Las plantillas (`.env-example`, `.env.example`, `.env.local.example`) se leen y editan. | Los `.env` locales tienen URLs y claves reales. `.env.test` hoy solo tiene valores públicos, pero la regla es por nombre y no por contenido, para que no se afloje el día que alguien le agregue algo. |
| `env` / `printenv` / `set` / `export` solos (también con asignaciones al frente: `X=1 printenv`), `export -p`, `declare -x` / `-p`, `Get-ChildItem env:`, `process.env` entero o `Deno.env.toObject()` en código que se evalúa (`node -p process.env`, `bun -e`, `deno eval`) | Vuelcan tokens y claves de la sesión. Buscar el texto (`rg -n process.env src`) o leer una variable puntual sí se permite. |
| `vercel` y `vc` (su alias), directos o por `npx` / `npm exec` / `pnpm dlx` / `bunx`; scripts `npm run deploy*` | Cualquier comando de la CLI puede desplegar o tocar el proyecto del team. El deploy lo hace una persona. |
| `firebase … deploy` y cualquier `firebase hosting:*` (`hosting:channel:deploy`, `hosting:disable`...) | Hay deploys del ecosistema en Firebase Hosting; `hosting:disable` baja el sitio. |
| docker salvo lectura: todo subcomando fuera de la lista blanca (`run`, `exec`, `build`, `cp`, `pull`, `push`, `compose up` / `down` / `exec` / `build` / `pull`...) | Este front no usa docker; la regla es la común a los cuatro repos (en api-vendedores `docker-compose.yml` es producción). Pasa solo la lista blanca de lectura: `docker ps`, `logs`, `inspect`, `images`, `version`, `info`, `--version`, `container` / `image` / `volume` / `network ls`, `docker compose ps` / `logs` / `config`. |
| `git push` a `master` (o parado en `master`; también `heads/master`, `refs/heads/master` y con comillas), con `--force` / `-f` / `--force-with-lease` / refspec `+rama`, `--no-verify`, `--delete` / `-d` / `:rama`, `--all` / `--branches` / `--mirror` / `--tags` / `--prune`, o sin el pre-push activo | Desde Claude Code se pushea **solo la rama de la tarea**: `git push [-u] origin <rama>`. `master` despliega en Vercel. Las opciones largas se comparan por prefijo (`--no-v`, `--for`, `--mi`...), porque git acepta abreviaturas. Vale para `git.exe`, rutas, `X=1 git`, `& git` de PowerShell, `env git` y `git --work-tree . push`. |
| `gh pr create` sin `--draft`, `gh pr ready`, `gh pr merge`, `gh pr review --approve` / `-a`, `gh workflow run`, `gh api` de escritura (incluye `-fcampo=valor` pegado y aprobar por `.../pulls/<n>/reviews`), `gh api graphql` con `mutation` | El PR se abre en draft; pasarlo a ready y mergear lo decide una persona. Nadie aprueba su propio trabajo. Vale para `gh.exe`, rutas, `X=1 gh`, `& gh` / `& "C:\…\gh.exe"` / `. gh` de PowerShell, `x & gh`, `(gh …)`, `env` / `command` / `time` / `nohup` / `exec gh`, y con `-R` / `--repo` en cualquier lugar (`gh -R o/r pr merge 1`). |
| `core.hooksPath`; **setear** `ALLOW_BASE_PUSH` / `ALLOW_MASTER_PUSH` (`X=1 …`, `export`, `$env:`, `set`) | Apagarían el pre-push. El escape es para una persona en su terminal. Nombrarlos en un comando de solo lectura (`grep`, `rg`, `cat`, `git grep`, `git log -S`), sin redirección a archivo ni sustitución de comandos, sí pasa. |
| `git commit` en `master`, `branch -D master`; `reset --hard`, `checkout .` / `restore .`, `clean -f` **fuera** del worktree (`-C ..`, `--work-tree`, `--git-dir`, `GIT_DIR=`, cwd fuera) | Ensucian la base o descartan trabajo ajeno. Dentro del propio worktree, descartar es decisión de quien trabaja ahí y pasa (igual en los cuatro repos). |
| `rm -r` fuera del repo, de la raíz o de `src`, `docs`, `.git`, `.claude`, `.githooks`, `e2e`, `public`, `scripts`, `Prototipo` | Los worktrees de otras tareas viven al lado (`../`). |
| `ssh` / `scp` / `sftp` / `ssh-keyscan` / `ssh-copy-id` | Ningún flujo de este front los necesita. |
| Editar `.claude/hooks/`, `.claude/settings*.json`, `.githooks/`, `.git/hooks/` (por tool, sin distinguir mayúsculas, o por terminal, incluido un comando de lectura con `>`, `>>`, `tee`, `Out-File`, `Set-Content` o `--output`) | Que Claude Code no pueda apagar su propio guard. **Leerlos sí**: `Read`, `Grep`, `cat`, `head`, `tail`, `grep`, `rg`, `Select-String`, `sed -n '<rango>p'`, `git diff/log/show/blame/grep`, y correr sus tests (`npm run check:hooks`). Cambiarlos lo hace una persona. |

Los servidores de desarrollo (`npm run dev`, `vite`, `playwright test`) **no** se bloquean, pero
para verificar una tarea no hacen falta: la verificación es `npm run check`.

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
- `sed` sobre el guard solo pasa con la forma `sed -n '<rango o /patrón/>p'`. Cualquier otro
  script de sed se niega, porque puede escribir (`w`) o correr comandos (`e`).

## Lo que el guard NO cubre

- `node -e` armando el nombre de un `.env` por partes, o un script propio que lo lea.
- `Grep` sobre todo el repo sin nombrar `.env*` (ripgrep saltea archivos ocultos por defecto,
  pero no es una garantía del guard).
- `curl` a la API de Vercel o de GitHub con un token. Lo cubren la regla "nunca deploy" y que
  la sesión no tiene esos tokens.
- Un force push de rama hecho desde un script propio: el pre-push solo mira `master`.
- Evasión deliberada: `bash -c`, `node -e`, `eval`, `pwsh -c`, `$(...)`, alias, o `curl` a la
  API de GitHub con `gh auth token`. El guard es una red para errores honestos; lo que de verdad
  impide mergear o aprobar es la branch protection de `master`.
- **Una variable seteada en un tramo anterior** (`export GIT_EXTERNAL_DIFF=…; git diff <guard>`,
  `$env:GIT_PAGER=…; git log <guard>`) **o un pager configurado en dos pasos**
  (`git config core.pager …` y después `git log <guard>`): el guard mira cada tramo por
  separado y no arrastra estado. Sí niega la variable en el mismo tramo
  (`GIT_PAGER=… git log <guard>`). Un cambio al guard hecho así queda en `git status` /
  `git diff` y lo tiene que ver la revisión.
- `.git/config` (salvo `core.hooksPath`, que el hook chequea antes de cada push),
  `.github/workflows/` (lo frena `permissions.ask`) y los settings de usuario de Claude Code.

## Cómo probarlo

```bash
npm run check:hooks

# las tres devuelven permissionDecision "deny", sin ninguna variable especial
for c in 'cat .env' 'vercel' 'git push --force'; do
  echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"$c\"},\"cwd\":\".\"}" \
    | node .claude/hooks/guard.cjs; echo
done

# un comando permitido no imprime nada
echo '{"tool_name":"Bash","tool_input":{"command":"npm run check"},"cwd":"."}' \
  | node .claude/hooks/guard.cjs
```
