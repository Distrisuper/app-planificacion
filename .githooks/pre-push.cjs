#!/usr/bin/env node
// pre-push: segunda capa del guard de .claude/hooks/guard.cjs, para lo que ese hook no ve
// (un script que pushea por dentro, un `node -e` que llama a git). Un agente pushea la rama
// de su tarea; lo que este hook frena es que toque la rama base (master, que despliega en
// Vercel), sea un update o un borrado.
//
// Solo actúa en modo agente (alguna variable PAPERCLIP_* en el entorno). Sin PAPERCLIP_*
// no hace nada: el flujo del dueño no cambia.
//
// Git pasa por stdin una línea por ref: <local ref> <local sha> <remote ref> <remote sha>
const RAMA_BASE = 'master'

function esAgente(env) {
  return Object.keys(env || {}).some(clave => clave.startsWith('PAPERCLIP_'))
}

function evaluarPush(stdin, env) {
  if (!esAgente(env)) return { ok: true }
  const refs = String(stdin)
    .split(/\r?\n/)
    .map(l => l.trim().split(/\s+/)[2])
    .filter(Boolean)
  if (!refs.includes(`refs/heads/${RAMA_BASE}`)) return { ok: true }
  return {
    ok: false,
    motivo:
      `pre-push: push a ${RAMA_BASE} bloqueado (${RAMA_BASE} = deploy en Vercel).` +
      '\nPusheá tu rama y abrí un PR draft; a master lo mergea el dueño.',
  }
}

if (require.main === module) {
  let stdin = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', c => (stdin += c))
  process.stdin.on('end', () => {
    const r = evaluarPush(stdin, process.env)
    if (!r.ok) {
      process.stderr.write(`${r.motivo}\n`)
      process.exit(1)
    }
    process.exit(0)
  })
}

module.exports = { evaluarPush, RAMA_BASE }
