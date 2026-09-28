// Tests del pre-push. Corren con `npm run check:hooks` (node:test, sin dependencias).
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { evaluarPush } = require('./pre-push.cjs')

const Z = '0000000000000000000000000000000000000000'
const A = '1111111111111111111111111111111111111111'
const AGENTE = { PAPERCLIP_RUN_ID: 'simulado' }

test('agente: rechaza push a refs/heads/master', () =>
  assert.equal(evaluarPush(`refs/heads/feature/x ${A} refs/heads/master ${Z}\n`, AGENTE).ok, false))
test('agente: rechaza borrar master', () =>
  assert.equal(evaluarPush(`(delete) ${Z} refs/heads/master ${A}\n`, AGENTE).ok, false))
test('agente: rechaza master entre varias refs', () =>
  assert.equal(
    evaluarPush(`refs/heads/feature/x ${A} refs/heads/feature/x ${Z}\nrefs/heads/master ${A} refs/heads/master ${Z}\n`, AGENTE).ok,
    false,
  ))
test('agente: permite push de su rama', () =>
  assert.equal(evaluarPush(`refs/heads/feature/x ${A} refs/heads/feature/x ${Z}\n`, AGENTE).ok, true))
test('agente: permite rama con master en el nombre', () =>
  assert.equal(evaluarPush(`refs/heads/feature/masterclass ${A} refs/heads/feature/masterclass ${Z}\n`, AGENTE).ok, true))
test('agente: cualquier PAPERCLIP_* alcanza', () =>
  assert.equal(evaluarPush(`refs/heads/feature/x ${A} refs/heads/master ${Z}\n`, { PAPERCLIP_AGENT_ID: 'x' }).ok, false))
test('agente: el mensaje nombra master cuando es la base', () =>
  assert.match(evaluarPush(`refs/heads/master ${A} refs/heads/master ${Z}\n`, AGENTE).motivo, /master/))
test('agente: stdin vacío no hay nada que pushear', () => assert.equal(evaluarPush('', AGENTE).ok, true))
test('dueño: permite push a master', () =>
  assert.equal(evaluarPush(`refs/heads/master ${A} refs/heads/master ${Z}\n`, {}).ok, true))
test('dueño: permite push de rama', () =>
  assert.equal(evaluarPush(`refs/heads/feature/x ${A} refs/heads/feature/x ${Z}\n`, { PATH: '/bin' }).ok, true))

const correr = (env, remoteRef = 'refs/heads/master') =>
  spawnSync(process.execPath, [path.join(__dirname, 'pre-push.cjs'), 'origin', 'x'], {
    input: `refs/heads/feature/x ${A} ${remoteRef} ${Z}\n`,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
  })

test('el script, con PAPERCLIP_RUN_ID y a master, sale con 1 y avisa por stderr', () => {
  const r = correr(AGENTE)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /push a master bloqueado/)
})
test('el script, con PAPERCLIP_RUN_ID y a su rama, sale con 0', () =>
  assert.equal(correr(AGENTE, 'refs/heads/feature/x').status, 0))
test('el script, sin PAPERCLIP_*, sale con 0', () => assert.equal(correr({}).status, 0))
