// Tests del pre-push. Corren con `npm run check:hooks` (node:test, sin dependencias).
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { evaluarPush } = require('./pre-push.cjs')

const Z = '0000000000000000000000000000000000000000'
const A = '1111111111111111111111111111111111111111'
// Aplica a todos: el entorno vacío es el caso normal (persona o agente, da igual).
const SIN_NADA = {}

test('rechaza push a refs/heads/master', () =>
  assert.equal(evaluarPush(`refs/heads/feature/x ${A} refs/heads/master ${Z}\n`, SIN_NADA).ok, false))
test('rechaza borrar master', () =>
  assert.equal(evaluarPush(`(delete) ${Z} refs/heads/master ${A}\n`, SIN_NADA).ok, false))
test('rechaza master entre varias refs', () =>
  assert.equal(
    evaluarPush(`refs/heads/feature/x ${A} refs/heads/feature/x ${Z}\nrefs/heads/master ${A} refs/heads/master ${Z}\n`, SIN_NADA).ok,
    false,
  ))
test('permite push de una rama', () =>
  assert.equal(evaluarPush(`refs/heads/feature/x ${A} refs/heads/feature/x ${Z}\n`, SIN_NADA).ok, true))
test('permite rama con master en el nombre', () =>
  assert.equal(evaluarPush(`refs/heads/feature/masterclass ${A} refs/heads/feature/masterclass ${Z}\n`, SIN_NADA).ok, true))
test('el mensaje nombra master y el escape', () => {
  const { motivo } = evaluarPush(`refs/heads/master ${A} refs/heads/master ${Z}\n`, SIN_NADA)
  assert.match(motivo, /master/)
  assert.match(motivo, /ALLOW_BASE_PUSH=1/)
})
test('stdin vacío: no hay nada que pushear', () => assert.equal(evaluarPush('', SIN_NADA).ok, true))
test('rechaza master aunque haya variables PAPERCLIP_* (ya no cambian nada)', () =>
  assert.equal(evaluarPush(`refs/heads/master ${A} refs/heads/master ${Z}\n`, { PAPERCLIP_RUN_ID: 'x' }).ok, false))
test('rechaza master con un entorno cualquiera', () =>
  assert.equal(evaluarPush(`refs/heads/master ${A} refs/heads/master ${Z}\n`, { PATH: '/bin' }).ok, false))

// Escape: solo el valor exacto '1'.
test('ALLOW_BASE_PUSH=1 deja pushear a master', () =>
  assert.equal(evaluarPush(`refs/heads/master ${A} refs/heads/master ${Z}\n`, { ALLOW_BASE_PUSH: '1' }).ok, true))
for (const v of ['0', '', 'true', 'yes', ' 1'])
  test(`ALLOW_BASE_PUSH=${JSON.stringify(v)} no es el escape`, () =>
    assert.equal(evaluarPush(`refs/heads/master ${A} refs/heads/master ${Z}\n`, { ALLOW_BASE_PUSH: v }).ok, false))
test('ALLOW_MASTER_PUSH no es el escape en este repo (solo api-vendedores lo acepta)', () =>
  assert.equal(evaluarPush(`refs/heads/master ${A} refs/heads/master ${Z}\n`, { ALLOW_MASTER_PUSH: '1' }).ok, false))

test('el código no menciona PAPERCLIP', () =>
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, 'pre-push.cjs'), 'utf8'), /PAPERCLIP/))

const correr = (env, remoteRef = 'refs/heads/master') =>
  spawnSync(process.execPath, [path.join(__dirname, 'pre-push.cjs'), 'origin', 'x'], {
    input: `refs/heads/feature/x ${A} ${remoteRef} ${Z}\n`,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
  })

test('el script, a master y sin escape, sale con 1 y avisa por stderr', () => {
  const r = correr({})
  assert.equal(r.status, 1)
  assert.match(r.stderr, /push a master bloqueado/)
})
test('el script, a una rama, sale con 0', () => assert.equal(correr({}, 'refs/heads/feature/x').status, 0))
test('el script, a master con ALLOW_BASE_PUSH=1, sale con 0', () => assert.equal(correr({ ALLOW_BASE_PUSH: '1' }).status, 0))
test('el script, a master con ALLOW_BASE_PUSH=0, sale con 1', () => assert.equal(correr({ ALLOW_BASE_PUSH: '0' }).status, 1))
