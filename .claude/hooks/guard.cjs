#!/usr/bin/env node
// Guard determinista para Claude Code (hook PreToolUse). Lee el JSON del hook por stdin y,
// si la acción es de las que este repo nunca permite desde Claude Code, responde `deny` con
// la razón. Si no tiene nada que decir, no imprime nada y aplica el permiso normal.
//
// Aplica SIEMPRE: el hook solo lo invoca Claude Code, así que no hay un "modo persona" que
// distinguir. Lo que el guard niega, una persona lo hace desde su propia terminal.
//
// Regla de oro: falla CERRADO. Cualquier excepción interna → deny.
//
// Es el patrón de api-vendedores (.claude/hooks/guard.js) adaptado a un front en Vercel.
// Las reglas y su porqué están en docs/agentes/guard.md. Tests: guard.spec.cjs
// (`npm run check:hooks`). Sin dependencias: corre con `node` pelado. Es .cjs porque el
// package.json del repo es "type": "module".
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const RAMA_BASE = 'master'
const RAICES_PROTEGIDAS = ['.git', '.github', '.githooks', '.claude', 'src', 'docs', 'e2e', 'public', 'scripts', 'Prototipo']

function deny(motivo) {
  return {
    permissionDecision: 'deny',
    permissionDecisionReason: `[guard app-planificacion] ${motivo}. Ver docs/agentes/guard.md`,
  }
}

// Un comando de shell puede encadenar varios; se evalúa cada tramo por separado.
// Un `&` suelto también corta (`x & gh pr merge 1` en bash, `& gh …` en PowerShell), pero
// no el de las redirecciones: `2>&1`, `>&2`, `&>archivo`.
function segmentos(command) {
  return String(command)
    .split(/\r?\n|&&|\|\||;|\||(?<![<>])&(?!>)/)
    .map(s => s.trim())
    .filter(Boolean)
}

// Sin comillas ni paréntesis en los bordes: `(gh pr merge 1)` es `gh pr merge 1`.
function tokens(seg) {
  return seg.split(/\s+/).map(a => a.replace(/^['"(]+|['");]+$/g, ''))
}

// El comando que de verdad corre, salteando lanzadores (`npx -y vercel`, `npm exec vite`,
// `pnpm dlx vercel`, `bunx vc`) y rutas (`./node_modules/.bin/vite.cmd`).
// Devuelve { cmd, args } con cmd normalizado (minúsculas, sin ruta, sin @versión ni .cmd/.exe).
// `\` → `/` y `path.posix` siempre: en Linux (CI) `path.basename` no corta por `\`.
function nombreDeComando(x) {
  return path.posix
    .basename(String(x || '').replace(/^['"]+|['"]+$/g, '').replace(/\\/g, '/'))
    .toLowerCase()
    .replace(/\.(cmd|exe|ps1)$/, '')
    .replace(/(.)@.*$/, '$1')
}

// `X=1 printenv` → `printenv`: las asignaciones al frente no cambian el comando que corre.
function sinAsignaciones(t) {
  let i = 0
  while (i < t.length - 1 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(t[i])) i++
  return t.slice(i)
}

// Lo que va delante del comando sin cambiar cuál corre: el `&` o `.` de PowerShell (suelto o
// pegado: `& "C:\…\gh.exe"`, `&gh`), las asignaciones y los envoltorios (`env`, `command`,
// `time`, `nohup`, `exec`) con sus flags. Un envoltorio sin comando detrás queda (`env` solo
// vuelca el entorno).
const ENVOLTORIOS = new Set(['env', 'command', 'time', 'nohup', 'exec'])
const ENV_CON_VALOR = new Set(['-u', '--unset', '-C', '--chdir'])

function sinPrefijos(t) {
  t = t.slice()
  if (t[0] === '&' || t[0] === '.') t.shift()
  else if (/^&./.test(t[0] || '')) t[0] = t[0].slice(1).replace(/^['"(]+/, '')
  for (;;) {
    t = sinAsignaciones(t)
    const w = nombreDeComando(t[0])
    if (!ENVOLTORIOS.has(w)) return t
    // `command -v vercel` solo busca el binario, no lo corre.
    if (w === 'command' && /^-[a-zA-Z]*[vV]/.test(t[1] || '')) return t
    let i = 1
    while (i < t.length && (t[i].startsWith('-') || /^[A-Za-z_][A-Za-z0-9_]*=/.test(t[i])))
      i += w === 'env' && ENV_CON_VALOR.has(t[i]) ? 2 : 1
    if (i >= t.length) return t
    t = t.slice(i)
  }
}

function comandoEfectivo(t) {
  const norm = nombreDeComando
  // `FOO=1 vercel`, `& vercel`, `env vercel`...
  t = sinPrefijos(t)
  let i = 0
  const lanzador = norm(t[i])
  if (lanzador === 'npx' || lanzador === 'bunx') i++
  else if ((lanzador === 'npm' && (t[i + 1] === 'exec' || t[i + 1] === 'x')) || (/^(pnpm|yarn)$/.test(lanzador) && t[i + 1] === 'dlx')) i += 2
  else return { cmd: lanzador, args: t.slice(i + 1) }
  while (i < t.length && t[i].startsWith('-')) {
    const m = /^--package=(.+)$/.exec(t[i])
    if (m) return { cmd: norm(m[1]), args: t.slice(i + 1) }
    i += t[i] === '-p' || t[i] === '--package' ? 2 : 1
  }
  return { cmd: norm(t[i]), args: t.slice(i + 1) }
}

// ── secretos ───────────────────────────────────────────────────────────────
// Cualquier .env* salvo las plantillas (.env-example, .env.example, .env.local.example...),
// incluido .env.test (va trackeado y hoy solo tiene valores públicos, pero la regla es por
// nombre, no por contenido, así no se afloja el día que alguien le agregue algo). También
// los globs `.env*` y los `agente*.env`.
function esArchivoEnv(nombre) {
  if (/^agente.*\.env$/i.test(nombre)) return true
  if (!/^\.env([.\-*?[].*)?$/.test(nombre)) return false
  return !/[.-]example$/.test(nombre)
}

function nombreDeToken(tok) {
  return tok
    .replace(/^['"(]+|['");]+$/g, '')
    .split(/[\\/=:]/)
    .pop()
}

const VOLCADO = 'volcar variables de entorno expone tokens y claves de la sesión'
const VOLCA_ENTORNO = /process\.env(?![\w.[])|Deno\.env(?!\.(get|has|set|delete)\b)(?!\w)/

// Además de por token, se busca el nombre en el tramo entero: dentro de código
// (`node -e "require('dotenv').config({path:'.env'})"`) el token no queda limpio. El `.env`
// tiene que empezar después de un separador, así `process.env.X` o `import.meta.env.VITE_*`
// no cuentan; `esArchivoEnv` decide si es real o plantilla.
const NOMBRA_ENV = /(^|[\s'"`(=:\\/,])(\.env[\w.*?\-[\]]*|agente[\w.*?\-[\]]*\.env(?![\w.-]))/gi

function envNombrado(texto) {
  for (const m of String(texto).matchAll(NOMBRA_ENV)) if (esArchivoEnv(m[2])) return m[2]
  return null
}

// Escapes del pre-push: son de la persona, en su terminal. Desde Claude Code no se setean en
// ninguna forma (`X=1 git push`, `export X=1`, `$env:X = "1"`, `set X=1`). Nombrarlos en un
// comando de solo lectura (`grep ALLOW_BASE_PUSH .githooks/pre-push.cjs`, `git log -S …`) sí.
const ESCAPES_PRE_PUSH = /ALLOW_(BASE|MASTER)_PUSH/i

function reglaSecretos(seg) {
  const escape = ESCAPES_PRE_PUSH.exec(seg.replace(/['"`]/g, ''))
  if (escape && !soloLee(seg)) return deny(`${escape[0]} es el escape del pre-push para una persona en su terminal, no desde Claude Code`)
  const t = tokens(seg)
  const env = t.map(nombreDeToken).find(esArchivoEnv) || envNombrado(seg)
  if (env) return deny(`el comando referencia ${env}; desde Claude Code no se leen ni escriben .env reales`)
  // `X=1 printenv` / `env printenv` vuelcan igual: lo de delante no cambia el comando.
  const c = sinPrefijos(t)
  const cmd = (c[0] || '').toLowerCase()
  if (cmd === 'printenv') return deny(VOLCADO)
  if (cmd === 'env' && c.slice(1).every(a => a.startsWith('-'))) return deny(VOLCADO)
  if (cmd === 'set' && c.length === 1) return deny(VOLCADO)
  // `export`, `export -p`, `declare -x`, `declare -p`, `typeset -x`: listan el entorno.
  if (cmd === 'export' && c.slice(1).every(a => a.startsWith('-'))) return deny(VOLCADO)
  if ((cmd === 'declare' || cmd === 'typeset') && c.length > 1 && c.slice(1).every(a => a.startsWith('-'))) return deny(VOLCADO)
  // `node -p process.env`, `console.log(process.env)`, `Deno.env.toObject()`: el objeto
  // entero, no una variable (`Deno.env.get('X')` es una sola).
  // Solo si el tramo evalúa código: `rg -n process.env src` busca texto, no vuelca nada.
  if (evaluaCodigo(t) && VOLCA_ENTORNO.test(seg)) return deny(VOLCADO)
  if (/^(get-childitem|gci|dir|ls)$/.test(cmd) && c.slice(1).some(a => /^env:/i.test(a))) return deny(VOLCADO)
  if (/\[environment\]::getenvironmentvariables/i.test(seg)) return deny(VOLCADO)
  return null
}

// `node -e/-p`, `bun -e/-p`, `deno eval` (y `npx node -e`...): corren el código del argumento.
function evaluaCodigo(t) {
  const { cmd, args } = comandoEfectivo(t)
  if (!/^(node|bun|deno)$/.test(cmd)) return false
  if (cmd === 'deno' && args.includes('eval')) return true
  // `-pe` combinado también.
  return args.some(a => /^(-[pe]+|--print|--eval)(=|$)/.test(a))
}

// ── deploy ─────────────────────────────────────────────────────────────────
// La app despliega en Vercel (y el ecosistema tiene deploys en Firebase Hosting, p. ej.
// pagos-lupa.web.app). Desde la CLI cualquier `vercel` puede desplegar o tocar el proyecto
// del team: se niega entero, `vc` incluido (es su alias).
// `npm run deploy`, `pnpm deploy:prod`, `yarn run deploy-x` → nombre del script.
function scriptDeNpm(t) {
  const cmd = nombreDeComando(t[0])
  if (!/^(npm|pnpm|yarn|bun)$/.test(cmd)) return null
  return t[1] === 'run' || t[1] === 'run-script' ? t[2] || '' : t[1] || ''
}

function reglaDeploy(seg) {
  const script = scriptDeNpm(sinPrefijos(tokens(seg)))
  if (script && /^deploy/i.test(script)) return deny(`el script ${script} despliega; el deploy lo hace una persona`)
  const { cmd, args } = comandoEfectivo(tokens(seg))
  if (cmd === 'vercel' || cmd === 'vc') return deny('la CLI de Vercel no se usa desde Claude Code; el deploy lo hace una persona')
  // `deploy` y cualquier `hosting:*` (`hosting:disable` baja el sitio), en cualquier posición.
  if ((cmd === 'firebase' || cmd === 'firebase-tools') && args.some(a => /deploy/i.test(a) || /^hosting:/i.test(a)))
    return deny('firebase deploy / hosting:* no se usa desde Claude Code; el deploy lo hace una persona')
  return null
}

// ── docker ─────────────────────────────────────────────────────────────────
// Este front no usa docker. La regla es la misma que en los otros repos de distri (en
// api-vendedores `docker-compose.yml` es producción) para que el guard se comporte igual en
// los cuatro. Solo lectura, por lista blanca: `ps`, `logs`, `inspect`, `images`, `version`,
// `info`, `--version`, `volume ls`, `network ls`, `container ls`, `compose ps/logs/config`.
// Todo lo demás (`run`, `exec`, `build`, `cp`, `pull`, `up`, `down`, `rm`...) se niega.
const DOCKER_OPCIONES_CON_VALOR = new Set(['-H', '--host', '-c', '--context', '--config', '-l', '--log-level'])
const COMPOSE_OPCIONES_CON_VALOR = new Set(['-f', '--file', '-p', '--project-name', '--profile', '--env-file', '--project-directory', '--ansi', '--progress', '--parallel'])
const DOCKER_LECTURA = new Set(['ps', 'logs', 'inspect', 'images', 'version', 'info'])
// `docker container ls`, `docker volume ls`, `docker network inspect x`: forma larga.
const DOCKER_OBJETOS = new Set(['container', 'image', 'volume', 'network'])
const DOCKER_OBJETO_LECTURA = new Set(['ls', 'list', 'ps', 'logs', 'inspect'])
const COMPOSE_LECTURA = new Set(['ps', 'logs', 'config', 'ls', 'images', 'version', 'top'])
const SOLO_VERSION = a => a.length === 1 && (a[0] === '--version' || a[0] === '-v')

function saltearOpciones(t, conValor) {
  let i = 0
  while (i < t.length && t[i].startsWith('-')) i += conValor.has(t[i]) ? 2 : 1
  return t.slice(i)
}

function reglaDocker(seg) {
  const { cmd, args } = comandoEfectivo(tokens(seg))
  if (cmd !== 'docker' && cmd !== 'docker-compose') return null
  if (cmd === 'docker' && SOLO_VERSION(args)) return null
  let resto = cmd === 'docker' ? saltearOpciones(args, DOCKER_OPCIONES_CON_VALOR) : ['compose', ...args]
  const sub = resto[0]
  if (sub === 'compose') {
    if (SOLO_VERSION(resto.slice(1))) return null
    const csub = saltearOpciones(resto.slice(1), COMPOSE_OPCIONES_CON_VALOR)[0]
    if (COMPOSE_LECTURA.has(csub)) return null
    return deny(`docker compose ${csub || ''} no es de solo lectura; desde Claude Code docker es solo lectura (ps, logs, config). Para verificar alcanza npm run check`)
  }
  resto = resto.slice(1)
  if (DOCKER_LECTURA.has(sub)) return null
  if (DOCKER_OBJETOS.has(sub) && DOCKER_OBJETO_LECTURA.has(saltearOpciones(resto, new Set())[0])) return null
  return deny(`docker ${sub || ''} no es de solo lectura; desde Claude Code docker es solo lectura (ps, logs, inspect). Para verificar alcanza npm run check`)
}

// ── git ────────────────────────────────────────────────────────────────────
// Opciones globales de git que llevan el valor en el token siguiente (`--git-dir=x` no).
const GIT_OPCIONES_CON_VALOR = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix'])

// `git -C dir sub` / `git --work-tree . sub` → índice del subcomando en los args de git.
function indiceSubcomandoGit(t) {
  let i = 0
  while (i < t.length && t[i].startsWith('-')) i += GIT_OPCIONES_CON_VALOR.has(t[i]) ? 2 : 1
  return i
}

// Directorios sobre los que va a operar git: el cwd movido por cada `-C`, y `--work-tree` /
// `--git-dir` si aparecen.
function directoriosGit(t, cwd) {
  let dir = cwd
  const dirs = []
  const i = indiceSubcomandoGit(t)
  for (let k = 0; k < i; k++) {
    const a = t[k]
    if (a === '-C') dir = path.resolve(dir, normalizarRutaGitBash(t[++k] || ''))
    else if (a === '--work-tree' || a === '--git-dir') dirs.push(path.resolve(dir, normalizarRutaGitBash(t[++k] || '')))
    else if (/^--(work-tree|git-dir)=/.test(a)) dirs.push(path.resolve(dir, normalizarRutaGitBash(a.split('=').slice(1).join('='))))
    else if (GIT_OPCIONES_CON_VALOR.has(a)) k++
  }
  return [dir, ...dirs]
}

function dentroDe(raiz, abs) {
  const rel = path.relative(path.resolve(raiz), abs)
  return !rel.startsWith('..') && !path.isAbsolute(rel)
}

function reglaGit(seg, input, ctx) {
  // `git.exe`, `C:\...\git.exe`, `X=1 git`, `"git"` también: ahora que el push de rama se
  // permite, el pre-push solo cubre master y esta regla es la que frena force/--no-verify.
  const { cmd, args } = comandoEfectivo(tokens(seg))
  if (cmd !== 'git') return null
  const t = args.map(a => a.replace(/^['"]+|['"]+$/g, ''))
  const i = indiceSubcomandoGit(t)
  const sub = t[i]
  const resto = t.slice(i + 1)

  if (/core\.hookspath/i.test(seg)) {
    const soloLee = sub === 'config' && (resto.includes('--get') || resto.length === 1)
    if (!soloLee) return deny('cambiar core.hooksPath apaga el pre-push')
  }
  // Desde Claude Code se pushea la rama de la tarea (`git push [-u] origin <rama>`) y nada más.
  if (sub === 'push') {
    const r = reglaPush(resto, ctx)
    if (r) return r
  }
  if (sub === 'commit' && ramaActual(ctx) === RAMA_BASE) return deny(`nunca se commitea en ${RAMA_BASE}; creá una rama`)
  // Descartar trabajo: dentro del worktree es decisión de quien trabaja ahí; fuera (otro
  // checkout, `-C ..`, `--work-tree`, `GIT_DIR=`) puede borrar trabajo ajeno.
  const descarta =
    (sub === 'reset' && resto.includes('--hard')) ||
    (sub === 'clean' && resto.some(a => /^-[a-zA-Z]*f/.test(a) || a === '--force')) ||
    ((sub === 'checkout' || sub === 'restore') && resto.includes('.'))
  if (descarta) {
    const cwd = (input && input.cwd) || ctx.projectDir
    const fuera = /(^|\s)GIT_(DIR|WORK_TREE)=/.test(seg) || directoriosGit(t, cwd).some(d => !dentroDe(ctx.projectDir, d))
    if (fuera) return deny(`git ${sub} fuera del worktree descarta trabajo ajeno`)
  }
  if (sub === 'branch' && resto.some(a => a === '-D' || a === '-d') && resto.includes(RAMA_BASE))
    return deny(`borrar ${RAMA_BASE} está prohibido`)
  return null
}

// Mismo criterio que api-vendedores, más estricto: sin force de ningún tipo (tampoco la
// refspec `+rama`), sin saltear el pre-push, sin borrar ramas remotas, sin pushes masivos
// (--all/--mirror/--tags arrastran master) y nunca a master ni parado en master.
//
// git acepta cualquier prefijo único de una opción larga (`--no-verif`, `--mir`): cada opción
// se compara contra [opción completa, prefijo mínimo que ya la nombra].
const PUSH_PROHIBIDAS = [
  ['--no-verify', '--no-v', 'git push --no-verify saltea el pre-push'],
  ['--force', '--for', 'git push --force está prohibido'],
  ['--force-with-lease', '--for', 'git push --force está prohibido'],
  ['--force-if-includes', '--for', 'git push --force está prohibido'],
  ['--delete', '--de', 'borrar ramas remotas está prohibido'],
  ['--all', '--al', 'git push --all está prohibido; pusheá solo tu rama'],
  ['--branches', '--b', 'git push --branches está prohibido; pusheá solo tu rama'],
  ['--mirror', '--mi', 'git push --mirror está prohibido; pusheá solo tu rama'],
  ['--tags', '--ta', 'git push --tags está prohibido; pusheá solo tu rama'],
  ['--prune', '--pr', 'git push --prune está prohibido; pusheá solo tu rama'],
]
const HOOKS_PATH = '.githooks'

function reglaPush(resto, ctx) {
  // Las comillas no cambian el ref: `HEAD:"master"` es `HEAD:master`.
  const args = resto.map(a => a.replace(/['"]/g, ''))
  const flags = args.filter(a => a.startsWith('-'))
  const posicionales = args.filter(a => !a.startsWith('-'))
  for (const f of flags.filter(a => a.startsWith('--'))) {
    const nombre = f.split('=')[0]
    const p = PUSH_PROHIBIDAS.find(([completa, minimo]) => nombre.startsWith(minimo) && completa.startsWith(nombre))
    if (p) return deny(p[2])
  }
  const cortas = flags.filter(a => /^-[^-]/.test(a))
  if (cortas.some(a => a.includes('f')) || posicionales.some(a => a.startsWith('+'))) return deny('git push --force está prohibido')
  if (cortas.some(a => a.includes('d')) || posicionales.some(a => a.startsWith(':'))) return deny('borrar ramas remotas está prohibido')
  if (posicionales.some(apuntaABase)) return deny(`push a ${RAMA_BASE} está prohibido (${RAMA_BASE} = deploy en Vercel); abrí un PR draft`)
  if (ramaActual(ctx) === RAMA_BASE) return deny(`estás en ${RAMA_BASE}; creá una rama antes de pushear`)
  // Sin el pre-push activo, lo único que frena un push a master es este texto.
  if (hooksPath(ctx) !== HOOKS_PATH)
    return deny(`el pre-push no está activo (core.hooksPath no es ${HOOKS_PATH}); corré npm install (el prepare lo configura) o git config core.hooksPath ${HOOKS_PATH}`)
  return null
}

// Una refspec apunta a la base si su destino (lo que va después de ':', o la refspec entera)
// es master, con o sin '+' y con o sin 'refs/heads/' o 'heads/'.
function apuntaABase(arg) {
  const destino = arg.replace(/^\+/, '').split(':').pop()
  return destino.replace(/^(refs\/)?heads\//, '') === RAMA_BASE
}

function hooksPath(ctx) {
  // Si no se puede leer, se asume que no está activo.
  try {
    return String(ctx.hooksPath() || '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .replace(/\/+$/, '')
  } catch {
    return ''
  }
}

function ramaActual(ctx) {
  // Si no se puede saber la rama, se asume lo peor.
  try {
    return ctx.ramaActual()
  } catch {
    return RAMA_BASE
  }
}

// ── gh ─────────────────────────────────────────────────────────────────────
// Mergear a master es desplegar. Un PR se abre solo en draft; pasarlo a ready y mergear lo
// hace una persona.
// `gh api` con campos y sin -X hace POST.
function reglaGh(seg) {
  // `gh.exe`, `C:\...\gh.exe`, `X=1 gh`, `"gh"` también.
  const { cmd, args } = comandoEfectivo(tokens(seg))
  if (cmd !== 'gh') return null
  const t = sinRepo(['gh', ...args.map(a => a.replace(/^['"]+|['"]+$/g, ''))])
  if (t[1] === 'pr' && (t[2] === 'merge' || t[2] === 'ready')) return deny(`gh pr ${t[2]} lo hace una persona, no Claude Code`)
  if (t[1] === 'pr' && (t[2] === 'create' || t[2] === 'new')) {
    const args = t.slice(3)
    const draft = args.some(a => a === '--draft' || a === '-d' || a === '--draft=true') && !args.some(a => /^--draft=(?!true$)/.test(a))
    if (!draft) return deny('gh pr create solo con --draft')
  }
  // Nadie aprueba su propio trabajo. `-a` puede venir combinado (`-ab "ok"`).
  if (t[1] === 'pr' && t[2] === 'review' && t.slice(3).some(esAprobar))
    return deny('gh pr review --approve está prohibido: nadie aprueba su propio trabajo')
  if (t[1] === 'workflow' && t[2] === 'run') return deny('gh workflow run lo hace una persona, no Claude Code')
  // Aprobar por `gh api` (`.../pulls/<n>/reviews` con event=APPROVE) cae acá: es escritura.
  if (t[1] === 'api') {
    // GraphQL va siempre por POST; una mutation escribe (`mergePullRequest`, reviews...).
    if (t.includes('graphql') && /mutation/i.test(seg)) return deny('gh api graphql con mutation está prohibido')
    const metodo = valorDe(t, ['-X', '--method'])
    // Sin exigir `=` ni fin de token: `-fevent=APPROVE` es `-f event=APPROVE`.
    const conCampos = t.some(a => /^(-[fF]|--field|--raw-field|--input)/.test(a))
    const escribe = metodo ? metodo.toUpperCase() !== 'GET' : conCampos
    if (escribe) return deny('gh api con método de escritura está prohibido')
  }
  return null
}

// `gh -R o/r pr merge 1`, `gh --repo=o/r pr ready 1`, `gh pr --repo o/r merge 1`: el repo
// no cambia el subcomando. Se saca `-R`/`--repo` (con su valor, `=` o pegado) en cualquier
// lugar antes de mirar las posiciones.
function sinRepo(t) {
  const out = []
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '-R' || t[i] === '--repo') i++
    else if (!/^(-R.|--repo=)/.test(t[i])) out.push(t[i])
  }
  return out
}

function esAprobar(a) {
  return a.startsWith('--approve') || /^-[a-zA-Z]*a/.test(a)
}

function valorDe(t, flags) {
  for (let i = 0; i < t.length; i++) {
    if (flags.includes(t[i])) return t[i + 1] || ''
    if (t[i].startsWith('-X') && t[i].length > 2) return t[i].slice(2)
    const largo = flags.find(f => t[i].startsWith(`${f}=`))
    if (largo && largo.startsWith('--')) return t[i].slice(largo.length + 1)
  }
  return null
}

// ── rm ─────────────────────────────────────────────────────────────────────
function reglaRm(seg, input, ctx) {
  const t = sinPrefijos(tokens(seg))
  if (t[0] !== 'rm') return null
  const recursivo = t.slice(1).some(a => /^-[a-zA-Z]*[rR]/.test(a) || a === '--recursive')
  if (!recursivo) return null
  const cwd = input.cwd || ctx.projectDir
  const raiz = path.resolve(ctx.projectDir)
  for (const arg of t.slice(1).filter(a => !a.startsWith('-'))) {
    const abs = path.resolve(cwd, normalizarRutaGitBash(arg))
    const rel = path.relative(raiz, abs)
    if (rel.startsWith('..') || path.isAbsolute(rel)) return deny(`rm -r fuera del repo (${arg})`)
    if (rel === '') return deny('rm -r de la raíz del repo')
    const relPosix = rel.split(path.sep).join('/')
    if (RAICES_PROTEGIDAS.includes(relPosix)) return deny(`rm -r de ${relPosix} está prohibido`)
  }
  return null
}

// Git Bash en Windows escribe rutas como /c/Users/...; path.resolve de Node no las entiende.
function normalizarRutaGitBash(p) {
  if (process.platform !== 'win32') return p
  const m = /^\/([a-zA-Z])\/(.*)$/.exec(p)
  return m ? `${m[1].toUpperCase()}:/${m[2]}` : p
}

// ── ssh ────────────────────────────────────────────────────────────────────
function reglaSsh(seg) {
  if (/^(ssh|scp|sftp|ssh-keyscan|ssh-copy-id)$/.test(sinPrefijos(tokens(seg))[0])) return deny('ssh/scp desde Claude Code está prohibido')
  return null
}

// ── el guard se protege a sí mismo ─────────────────────────────────────────
const RUTAS_DEL_GUARD = /(\.claude[\\/](hooks|settings)|\.githooks|\.git[\\/]hooks)/i
const SOLO_LECTURA = new Set(['cat', 'head', 'tail', 'less', 'more', 'type', 'get-content', 'gc', 'grep', 'rg', 'wc', 'nl', 'ls', 'dir', 'stat', 'file', 'select-string', 'sls', 'findstr'])

// `sed -n '1,40p' <guard>` / `sed -n '/regla/p' <guard>` solo imprime. Se acepta únicamente esa
// forma (rango o patrón + `p`, sin `-i`): un script de sed puede escribir (`w archivo`, `s///w`)
// o correr comandos (`e`), y distinguirlo en general no vale la pena.
const SED_IMPRIME = /^(([\d$]+|\/[^/]*\/)(,([\d$]+|\/[^/]*\/))?)?p$/

function sedSoloImprime(t) {
  const args = t.slice(1)
  const flags = args.filter(a => a.startsWith('-'))
  if (!flags.includes('-n') && !flags.includes('--quiet') && !flags.includes('--silent')) return false
  if (!flags.every(a => /^(-n|-E|-r|--quiet|--silent)$/.test(a))) return false
  const script = args.find(a => !a.startsWith('-'))
  return !!script && SED_IMPRIME.test(script)
}

// Un comando de lectura con salida a archivo escribe igual: `cat /dev/null > guard.cjs`,
// `git show HEAD~3:x --output=.claude/settings.json`. No cuentan `2>&1` ni `> /dev/null`.
function escribeArchivo(seg, t) {
  const sinInocuas = seg.replace(/\d*>&\d+/g, '').replace(/\d*>>?\s*(\/dev\/null|\$null|nul)(?=\s|$)/gi, '')
  if (/>/.test(sinInocuas)) return true
  return t.some(a => /^(tee|tee-object|out-file|set-content|add-content|--output(=.*)?)$/i.test(a))
}

// true si el comando del tramo es un lector: `cat`, `grep`, `rg`..., `sed -n 'Np'`, `node
// --test` o `git diff/log/show/grep...`. `git -C . diff` también lee: se saltean las opciones
// globales, salvo `-c` / `--config-env`, que pueden cambiar pager, alias o diff externo y
// hacer que escriba. `git grep -O<cmd>` abre los archivos con un comando: no lee.
function esComandoDeLectura(t) {
  const cmd = nombreDeComando(t[0])
  const git = t.slice(1)
  const i = indiceSubcomandoGit(git)
  const configura = git.slice(0, i).some(a => a === '-c' || a.startsWith('--config-env'))
  return (
    SOLO_LECTURA.has(cmd) ||
    (cmd === 'sed' && sedSoloImprime(t)) ||
    (cmd === 'git' && !configura && /^(diff|log|show|status|blame|grep|ls-files)$/.test(git[i] || '') && !git.slice(i + 1).some(a => /^(-O|--open-files-in-pager)/.test(a))) ||
    (cmd === 'node' && t[1] === '--test')
  )
}

// true si el tramo entero solo lee: un lector, sin salida a archivo, sin nada delante que
// cambie qué corre o con qué entorno (`X=1 grep`, `env …`) y sin sustitución de comandos
// (`$(…)`, backticks, `<(…)`), que correría otra cosa adentro.
function soloLee(seg) {
  if (/\$\(|`|[<>]\(/.test(seg)) return false
  const t = tokens(seg)
  if (escribeArchivo(seg, t)) return false
  if (sinPrefijos(t).length < t.length) return false
  return esComandoDeLectura(t)
}

function reglaAutoproteccion(seg) {
  if (!RUTAS_DEL_GUARD.test(seg)) return null
  const t = tokens(seg)
  if (escribeArchivo(seg, t)) return deny('desde Claude Code no se modifica el guard ni los hooks de git')
  // `GIT_PAGER=x git log <guard>`, `env GIT_EXTERNAL_DIFF=x git diff <guard>`,
  // `GIT_CONFIG_COUNT=1 …`: el entorno cambia qué corre git (pager, diff externo, config).
  // No ve lo seteado en un tramo anterior (`export X=…; git log`): ver docs/agentes/guard.md.
  if (sinPrefijos(t).length < t.length)
    return deny('con variables de entorno o envoltorios delante, leer el guard puede correr un pager o diff externo')
  return esComandoDeLectura(t) ? null : deny('desde Claude Code no se modifica el guard ni los hooks de git')
}

// ── tools de archivo ───────────────────────────────────────────────────────
function relativo(fp, input, ctx) {
  const abs = path.resolve(input.cwd || ctx.projectDir, fp)
  const rel = path.relative(path.resolve(ctx.projectDir), abs).split(path.sep).join('/')
  return { abs, rel, nombre: path.posix.basename(abs.replace(/\\/g, '/')) }
}

function reglaArchivo(input, ctx) {
  const ti = input.tool_input || {}
  const fp = ti.file_path || ti.notebook_path
  if (!fp) return null
  const { abs, rel, nombre } = relativo(fp, input, ctx)
  if (esArchivoEnv(nombre)) return deny(`desde Claude Code no se lee ni escribe ${nombre}`)
  if (input.tool_name === 'Read') return null
  // Sin distinguir mayúsculas: en NTFS `.CLAUDE/Hooks/guard.cjs` es el mismo archivo.
  if (/^(\.claude\/(hooks\/|settings(\.[\w-]+)?\.json$)|\.githooks\/)/i.test(rel) || abs.split(path.sep).join('/').toLowerCase().includes('/.git/hooks/'))
    return deny(`desde Claude Code no se edita ${rel}: es parte del guard`)
  return null
}

// Grep (`path`, `glob`) y Glob (`pattern`, `path`): nombrar un .env real es leerlo o listarlo.
// En Grep, `pattern` es la regex de contenido, no una ruta: no cuenta.
function reglaGrep(input) {
  const ti = input.tool_input || {}
  // `glob` puede ser una lista con llaves: "*.{ts,env}" o "{src/**,.env.test}".
  const partes = [ti.path, ti.glob, input.tool_name === 'Glob' ? ti.pattern : null]
    .filter(Boolean)
    .flatMap(b => String(b).split(/[{},\s]/))
    .map(nombreDeToken)
  const env = partes.find(esArchivoEnv)
  return env ? deny(`desde Claude Code no se busca dentro de ${env}`) : null
}

// ── entrada ────────────────────────────────────────────────────────────────
function evaluar(input, ctx) {
  try {
    const tool = input && input.tool_name
    // Monitor también corre un comando de shell.
    if (tool === 'Bash' || tool === 'PowerShell' || tool === 'Monitor') {
      const command = input.tool_input && input.tool_input.command
      if (!command) return null
      for (const seg of segmentos(command)) {
        const r =
          reglaSecretos(seg) ||
          reglaAutoproteccion(seg) ||
          reglaDeploy(seg) ||
          reglaDocker(seg) ||
          reglaGit(seg, input, ctx) ||
          reglaGh(seg) ||
          reglaRm(seg, input, ctx) ||
          reglaSsh(seg)
        if (r) return r
      }
      return null
    }
    if (tool === 'Read' || tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit' || tool === 'NotebookEdit')
      return reglaArchivo(input, ctx)
    if (tool === 'Grep' || tool === 'Glob') return reglaGrep(input)
    return null
  } catch (e) {
    return deny(`guard.cjs falló (${e && e.message}); se niega por precaución`)
  }
}

function ramaActualReal(cwd) {
  return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

function hooksPathReal(cwd) {
  return execFileSync('git', ['config', '--get', 'core.hooksPath'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

// Si el hook revienta fuera de `evaluar` (input raro, stdout roto...), Claude Code lo toma
// como error no bloqueante y la acción pasa. Por eso sale con 2, que Claude Code toma como bloqueo.
function fallaCerrado(e) {
  process.stderr.write(`[guard app-planificacion] guard.cjs falló (${e && e.message}); se niega por precaución\n`)
  process.exit(2)
}

function main() {
  process.on('uncaughtException', fallaCerrado)
  let raw = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', c => (raw += c))
  process.stdin.on('end', () => {
    let input = {}
    let r = null
    try {
      input = JSON.parse(raw || '{}')
    } catch {
      // Sin poder leer la acción no se sabe qué se aprueba: deny.
      input = {}
      r = deny('guard.cjs no pudo leer el JSON del hook; se niega por precaución')
    }
    const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()
    const ctx = {
      projectDir,
      ramaActual: () => ramaActualReal(input.cwd || projectDir),
      hooksPath: () => hooksPathReal(input.cwd || projectDir),
    }
    r = r || evaluar(input, ctx)
    if (r) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...r } }))
    process.exit(0)
  })
}

if (require.main === module) main()

module.exports = { evaluar, esArchivoEnv, nombreDeComando, RAMA_BASE }
