/**
 * Baja los seguimientos de Cromo por vendedor y los deja en un JSON agrupado
 * por nombre de vendedor, con lo que nos interesa: tags, descripción y cliente.
 *
 *   CROMO_TOKEN=<pegar el Bearer de DevTools> node scripts/cromo-seguimientos.mjs
 *
 * El token NO va en el código: sale de la env var CROMO_TOKEN (se saca de
 * DevTools en Cromo, header Authorization). Así el script se puede versionar
 * sin exponer una credencial en el historial de git.
 */

// ─── Config ──────────────────────────────────────────────────────────────────

const TOKEN = process.env.CROMO_TOKEN ?? ''

const VENDEDORES = [
  'Lucas C',
  'Manuel L',
  'Jonathan M',
  'Cristian T',
  'Jonatan Charbonnier',
  'Emiliano M',
  'Matias Stefanatto',
  'Marcelo Fernandez',
  'Sebastian C',
  'Lazaro Bravo',
  'Ignacio Dandrea',
  'Matias Pacheco',
  'Cristian Godoy',
  'Nazareno Caruso'
  // 'Otro Vendedor',
]

/** Cuántos seguimientos juntar como máximo por vendedor. */
const MAX_POR_VENDEDOR = 60

const SALIDA = 'scripts/out/seguimientos.json'

const BASE_URL = 'https://api-cromo-v2.rj.r.appspot.com/api/event'

// ─── Script ──────────────────────────────────────────────────────────────────

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

class TokenInvalido extends Error {}

function urlPagina(vendedor, page) {
  const params = new URLSearchParams({
    date_type: 'crm',
    created_by: vendedor,
    type: 'events',
    page: String(page),
    match: 'AND',
  })
  return `${BASE_URL}?${params}`
}

/** Nos quedamos con tags, descripción y cliente + código. El resto se descarta. */
function normalizar(evento) {
  return {
    event_id: evento.event_id,
    fecha: evento.created_at,
    cliente: evento.client?.nombre_apellido ?? null,
    codigo: evento.client?.codigo_referencia ?? null,
    descripcion: evento.descripcion,
    tags: (evento.tags ?? []).map((tag) => tag.name),
  }
}

async function traerPagina(vendedor, page) {
  const res = await fetch(urlPagina(vendedor, page), {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })

  if (res.status === 401) {
    throw new TokenInvalido('Cromo devolvió 401: el TOKEN está vencido o mal pegado.')
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`)
  }

  const body = await res.json()
  return body?.data?.data ?? []
}

/** Pagina hasta juntar MAX_POR_VENDEDOR o hasta que una página venga vacía. */
async function traerVendedor(vendedor) {
  const seguimientos = []

  for (let page = 1; seguimientos.length < MAX_POR_VENDEDOR; page++) {
    const eventos = await traerPagina(vendedor, page)
    if (eventos.length === 0) break

    seguimientos.push(...eventos.map(normalizar))
  }

  return seguimientos.slice(0, MAX_POR_VENDEDOR)
}

async function main() {
  if (!TOKEN) {
    console.error('Falta la env var CROMO_TOKEN (Bearer de Cromo, sacado de DevTools).')
    process.exit(1)
  }

  const resultado = {}

  // Secuencial a propósito: no hace falta apurar a la API de Cromo.
  for (const vendedor of VENDEDORES) {
    try {
      resultado[vendedor] = await traerVendedor(vendedor)
    } catch (error) {
      if (error instanceof TokenInvalido) {
        console.error(error.message)
        process.exit(1)
      }
      console.error(`${vendedor}: falló (${error.message}) — queda vacío.`)
      resultado[vendedor] = []
    }
  }

  await mkdir(dirname(SALIDA), { recursive: true })
  await writeFile(SALIDA, JSON.stringify(resultado, null, 2), 'utf8')

  console.log(`\n${SALIDA}`)
  for (const [vendedor, seguimientos] of Object.entries(resultado)) {
    console.log(`  ${vendedor}: ${seguimientos.length} seguimientos`)
  }
}

main()
