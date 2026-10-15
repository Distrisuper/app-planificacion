#!/usr/bin/env node
// pre-push: rechaza todo push que actualice o borre la rama base (master, que despliega en
// Vercel) en el remoto. A master se llega solo mergeando un PR.
//
// Aplica a todos, persona o agente: es la segunda capa del guard de .claude/hooks/guard.cjs
// para lo que ese hook no ve (un script que pushea por dentro, un `node -e` que llama a git)
// y la misma política para quien pushea desde su terminal.
//
// Escape, solo para una persona en su terminal: `ALLOW_BASE_PUSH=1 git push ...`
// (el guard niega cualquier comando de Claude Code que lo setee).
//
// Git pasa por stdin una línea por ref: <local ref> <local sha> <remote ref> <remote sha>
const RAMA_BASE = 'master'

function evaluarPush(stdin, env) {
  if ((env || {}).ALLOW_BASE_PUSH === '1') return { ok: true }
  const refs = String(stdin)
    .split(/\r?\n/)
    .map(l => l.trim().split(/\s+/)[2])
    .filter(Boolean)
  if (!refs.includes(`refs/heads/${RAMA_BASE}`)) return { ok: true }
  return {
    ok: false,
    motivo:
      `pre-push: push a ${RAMA_BASE} bloqueado (${RAMA_BASE} = deploy en Vercel).` +
      `\nPusheá tu rama y abrí un PR draft; a ${RAMA_BASE} se llega mergeando el PR.` +
      `\nSi de verdad hace falta (solo una persona, desde su terminal): ALLOW_BASE_PUSH=1 git push ...`,
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
