#!/usr/bin/env node
// Guard determinista para Claude Code (hook PreToolUse). Lee el JSON del hook por stdin y,
// si la acción es de las que este repo nunca permite a un AGENTE, responde `deny` con la
// razón. Si no tiene nada que decir, no imprime nada y aplica el permiso normal.
//
// Solo actúa en modo agente: cuando hay alguna variable PAPERCLIP_* en el entorno (las
// inyecta Paperclip; es el mismo criterio que la guardia de vite.config.ts). En una sesión
// del dueño no niega nada.
//
// Regla de oro: en modo agente falla CERRADO. Cualquier excepción interna → deny.
//
// Es el patrón de api-vendedores (.claude/hooks/guard.js) adaptado a un front en Vercel.
// Las reglas y su porqué están en docs/agentes/guard.md. Tests: guard.spec.cjs
// (`npm run check:hooks`). Sin dependencias: corre con `node` pelado. Es .cjs porque el
// package.json del repo es "type": "module".
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const RAMA_BASE = 'master'
const RAICES_PROTEGIDAS = ['.git', '.github', '.githooks', '.claude', 'src', 'docs', 'e2e', 'public', 'scripts', 'Prototipo']

function esAgente(env) {
  return Object.keys(env || {}).some(clave => clave.startsWith('PAPERCLIP_'))
}

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
// Cualquier .env* salvo .env-example, incluido .env.test (va trackeado y hoy solo tiene
// valores públicos, pero el agente no tiene por qué leerlo: la regla es por nombre, no por
// contenido, así no se afloja el día que alguien le agregue algo). También los globs `.env*`.
function esArchivoEnv(nombre) {
  return /^\.env([.\-*?[].*)?$/.test(nombre) && nombre !== '.env-example'
}

function nombreDeToken(tok) {
  return tok
    .replace(/^['"(]+|['");]+$/g, '')
    .split(/[\\/=:]/)
    .pop()
}

const VOLCADO = 'volcar variables de entorno expone la API key de Paperclip'
const VOLCA_ENTORNO = /process\.env(?![\w.[])|Deno\.env(?!\.(get|has|set|delete)\b)(?!\w)/

function reglaSecretos(seg) {
  if (/ALLOW_MASTER_PUSH/.test(seg.replace(/['"`]/g, ''))) return deny('ALLOW_MASTER_PUSH es solo para el dueño')
  const t = tokens(seg)
  const env = t.map(nombreDeToken).find(esArchivoEnv)
  if (env) return deny(`el comando referencia ${env}; un agente no lee ni escribe .env*`)
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
function reglaDeploy(seg) {
  const { cmd, args } = comandoEfectivo(tokens(seg))
  if (cmd === 'vercel' || cmd === 'vc') return deny('un agente no usa la CLI de Vercel; el deploy lo hace el dueño')
  // `deploy` y cualquier `hosting:*` (`hosting:disable` baja el sitio), en cualquier posición.
  if ((cmd === 'firebase' || cmd === 'firebase-tools') && args.some(a => /deploy/i.test(a) || /^hosting:/i.test(a)))
    return deny('firebase deploy / hosting:* está prohibido para un agente')
  return null
}

// ── servidores de desarrollo ───────────────────────────────────────────────
// `dev` y `preview` solo se levantan por los runtime services de Paperclip, que les pasan
// las VITE_* del stack agente. Levantados a mano, heredan lo que haya y ocupan puertos.
// Playwright entra acá porque su webServer (playwright.config.ts) corre `npm run dev`.
const SCRIPTS_SERVIDOR = /^(dev|preview|start|serve|e2e(:.*)?)$/

function reglaServidor(seg) {
  const t = sinPrefijos(tokens(seg))
  const gestor = (t[0] || '').toLowerCase()
  if (/^(npm|pnpm|yarn|bun)$/.test(gestor)) {
    // `npm run dev` / `npm start`; pnpm, yarn y bun además aceptan `pnpm dev`.
    let script = ''
    if (t[1] === 'run' || t[1] === 'run-script') script = t[2] || ''
    else if (t[1] === 'start') script = 'start'
    else if (gestor !== 'npm') script = t[1] || ''
    if (SCRIPTS_SERVIDOR.test(script))
      return deny(`${gestor} run ${script} levanta un servidor; eso lo hace el runtime service de Paperclip`)
  }
  const { cmd, args } = comandoEfectivo(t)
  // `vite` sin subcomando es `vite dev`, y las opciones pueden llevar valor (`--port 5174`):
  // se permite solo lo que no levanta servidor.
  if (cmd === 'vite') {
    if (!args.some(a => a === 'build' || a === 'optimize'))
      return deny('vite dev/preview lo levanta el runtime service de Paperclip; para verificar usá npm run build')
  }
  if (cmd === 'playwright' && args[0] === 'test')
    return deny('playwright test levanta npm run dev (webServer de playwright.config.ts); eso lo hace el runtime service')
  return null
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

function reglaGit(seg, ctx) {
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
  // El agente pushea la rama de su tarea (`git push [-u] origin <rama>`) y nada más.
  if (sub === 'push') {
    const r = reglaPush(resto, ctx)
    if (r) return r
  }
  if (sub === 'commit' && ramaActual(ctx) === RAMA_BASE) return deny(`nunca se commitea en ${RAMA_BASE}; creá una rama`)
  if (sub === 'reset' && resto.includes('--hard')) return deny('git reset --hard descarta trabajo')
  if ((sub === 'checkout' || sub === 'restore') && resto.includes('.')) return deny(`git ${sub} . descarta cambios sin commitear`)
  if (sub === 'clean' && resto.some(a => /^-[a-zA-Z]*f/.test(a))) return deny('git clean -f borra archivos no versionados')
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
    return deny(`el pre-push no está activo (core.hooksPath no es ${HOOKS_PATH}); el dueño tiene que correr git config core.hooksPath ${HOOKS_PATH}`)
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
// Mergear a master es desplegar. Un PR se abre solo en draft y un agente no lo pasa a ready.
// `gh api` con campos y sin -X hace POST.
function reglaGh(seg) {
  // `gh.exe`, `C:\...\gh.exe`, `X=1 gh`, `"gh"` también.
  const { cmd, args } = comandoEfectivo(tokens(seg))
  if (cmd !== 'gh') return null
  const t = sinRepo(['gh', ...args.map(a => a.replace(/^['"]+|['"]+$/g, ''))])
  if (t[1] === 'pr' && (t[2] === 'merge' || t[2] === 'ready')) return deny(`gh pr ${t[2]} lo hace el dueño`)
  if (t[1] === 'pr' && (t[2] === 'create' || t[2] === 'new')) {
    const args = t.slice(3)
    const draft = args.some(a => a === '--draft' || a === '-d' || a === '--draft=true') && !args.some(a => /^--draft=(?!true$)/.test(a))
    if (!draft) return deny('gh pr create solo con --draft')
  }
  // Nadie aprueba su propio trabajo. `-a` puede venir combinado (`-ab "ok"`).
  if (t[1] === 'pr' && t[2] === 'review' && t.slice(3).some(esAprobar))
    return deny('gh pr review --approve está prohibido: nadie aprueba su propio trabajo')
  if (t[1] === 'workflow' && t[2] === 'run') return deny('gh workflow run lo hace el dueño')
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
  if (/^(ssh|scp|sftp|ssh-keyscan|ssh-copy-id)$/.test(sinPrefijos(tokens(seg))[0])) return deny('ssh/scp desde un agente está prohibido')
  return null
}

// ── el guard se protege a sí mismo ─────────────────────────────────────────
const RUTAS_DEL_GUARD = /(\.claude[\\/](hooks|settings)|\.githooks|\.git[\\/]hooks)/i
const SOLO_LECTURA = new Set(['cat', 'head', 'tail', 'less', 'more', 'type', 'get-content', 'gc', 'grep', 'rg', 'wc', 'ls', 'dir'])

// Un comando de lectura con salida a archivo escribe igual: `cat /dev/null > guard.cjs`,
// `git show HEAD~3:x --output=.claude/settings.json`. No cuentan `2>&1` ni `> /dev/null`.
function escribeArchivo(seg, t) {
  const sinInocuas = seg.replace(/\d*>&\d+/g, '').replace(/\d*>>?\s*(\/dev\/null|\$null|nul)(?=\s|$)/gi, '')
  if (/>/.test(sinInocuas)) return true
  return t.some(a => /^(tee|tee-object|out-file|set-content|add-content|--output(=.*)?)$/i.test(a))
}

function reglaAutoproteccion(seg) {
  if (!RUTAS_DEL_GUARD.test(seg)) return null
  const t = tokens(seg)
  if (escribeArchivo(seg, t)) return deny('un agente no modifica el guard ni los hooks de git')
  // `GIT_PAGER=x git log <guard>`, `env GIT_EXTERNAL_DIFF=x git diff <guard>`,
  // `GIT_CONFIG_COUNT=1 …`: el entorno cambia qué corre git (pager, diff externo, config).
  // No ve lo seteado en un tramo anterior (`export X=…; git log`): ver docs/agentes/guard.md.
  if (sinPrefijos(t).length < t.length)
    return deny('con variables de entorno o envoltorios delante, leer el guard puede correr un pager o diff externo')
  const cmd = (t[0] || '').toLowerCase()
  // `git -C . diff <guard>` también lee: se saltean las opciones globales. Salvo `-c` /
  // `--config-env`, que pueden cambiar pager, alias o diff externo y hacer que escriba.
  const git = t.slice(1)
  const i = indiceSubcomandoGit(git)
  const configura = git.slice(0, i).some(a => a === '-c' || a.startsWith('--config-env'))
  const lee =
    SOLO_LECTURA.has(cmd) ||
    (cmd === 'git' && !configura && /^(diff|log|show|status|blame)$/.test(git[i] || '')) ||
    (cmd === 'node' && t[1] === '--test')
  return lee ? null : deny('un agente no modifica el guard ni los hooks de git')
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
  if (esArchivoEnv(nombre)) return deny(`un agente no lee ni escribe ${nombre}`)
  if (input.tool_name === 'Read') return null
  // Sin distinguir mayúsculas: en NTFS `.CLAUDE/Hooks/guard.cjs` es el mismo archivo.
  if (/^(\.claude\/(hooks\/|settings(\.local)?\.json$)|\.githooks\/)/i.test(rel) || abs.split(path.sep).join('/').toLowerCase().includes('/.git/hooks/'))
    return deny(`un agente no edita ${rel}: es parte del guard`)
  return null
}

function reglaGrep(input) {
  const ti = input.tool_input || {}
  // `glob` puede ser una lista con llaves: "*.{ts,env}" o "{src/**,.env.test}".
  const partes = [ti.path, ti.glob]
    .filter(Boolean)
    .flatMap(b => String(b).split(/[{},\s]/))
    .map(nombreDeToken)
  const env = partes.find(esArchivoEnv)
  return env ? deny(`un agente no busca dentro de ${env}`) : null
}

// ── entrada ────────────────────────────────────────────────────────────────
function evaluar(input, ctx) {
  if (!ctx || !ctx.esAgente) return null
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
          reglaServidor(seg) ||
          reglaGit(seg, ctx) ||
          reglaGh(seg) ||
          reglaRm(seg, input, ctx) ||
          reglaSsh(seg)
        if (r) return r
      }
      return null
    }
    if (tool === 'Read' || tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit' || tool === 'NotebookEdit')
      return reglaArchivo(input, ctx)
    if (tool === 'Grep') return reglaGrep(input)
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
// como error no bloqueante y la acción pasa. En modo agente eso también es deny: exit 2.
function fallaCerrado(e) {
  if (!esAgente(process.env)) process.exit(0)
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
      // Sin poder leer la acción no se sabe qué se aprueba: en modo agente, deny.
      input = {}
      if (esAgente(process.env)) r = deny('guard.cjs no pudo leer el JSON del hook; se niega por precaución')
    }
    const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()
    const ctx = {
      projectDir,
      ramaActual: () => ramaActualReal(input.cwd || projectDir),
      hooksPath: () => hooksPathReal(input.cwd || projectDir),
      esAgente: esAgente(process.env),
    }
    r = r || evaluar(input, ctx)
    if (r) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...r } }))
    process.exit(0)
  })
}

if (require.main === module) main()

module.exports = { evaluar, esAgente, esArchivoEnv, nombreDeComando, RAMA_BASE }
