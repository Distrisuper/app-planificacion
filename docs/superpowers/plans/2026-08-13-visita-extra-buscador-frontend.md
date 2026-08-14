# Visita extra: buscador de clientes (frontend) — Plan de implementación

> Implementa `docs/superpowers/specs/2026-08-12-visita-extra-buscador-design copy.md`. Depende de
> los endpoints del plan hermano en api-vendedores
> (`docs/superpowers/plans/2026-08-13-visita-extra-buscador-backend.md`):
> `GET /planificacion/buscador/cliente/:codigo?semana=`,
> `POST /planificacion/buscador/cliente/:codigo/extra`, `GET /planificacion/buscador/rotacion?q=`.
> Sin tests automatizados por pedido explícito del usuario.

**Goal:** un buscador en la agenda del día que resuelve la fila pendiente de la zona en curso si
existe, avisa antes de crear si el cliente está pendiente en otra zona, y crea una fila `es_extra`
si no hay ninguna disponible — más un buscador general de solo lectura en el header.

**Architecture:** dos componentes nuevos bajo `src/components/buscador/` que reusan el idioma ya
establecido (`BottomSheet`, patrón de `AlcanceBuscador`/`OfrecimientoBuscador` para el input+lista,
`Notification` para toasts simples). Un archivo de API nuevo con las 3 llamadas, hooks de
react-query que invalidan `agendaKeys` igual que el resto del dominio. Cambios chicos en
`ClienteCard.tsx` y `ClienteCardRuta.tsx` para el chip "Agregado".

**Tech Stack:** React 19 + TS, react-query, axios, sin Radix/shadcn real en este repo (todo
hand-rolled) — no introducir una librería de Dialog/Command nueva.

## Global Constraints

- El buscador general **nunca** ofrece crear/reagendar — es de solo lectura, componente separado
  del buscador del día (el spec lo pide explícitamente para no mezclar "mirar" con "escribe").
- Copys exactos del spec: *"Ya está planificado el {día} en {zona}"*, *"Pendiente hoy en esta
  zona"*, estados del buscador general: `Pendiente el {día} en {zona}` / `Visitado el {fecha}` /
  `No visité — {motivo}` / `No está planificado esta vuelta`.
- El chip nuevo se llama **"Agregado"**, mismo idioma visual inline-`<span>` que ya usan "En curso"
  / "No visitado" en `ClienteCard.tsx` — no introducir el componente `Badge` sin usarlo también en
  esos otros chips (no mezclar dos sistemas de chip en el mismo componente).
- "Semana"/"zona" en vocabulario de vendedor es `pl_rotacion_semana.descripcion` (nombre de zona),
  nunca el número crudo, salvo que la zona nunca se haya nombrado.

---

### Task 1: tipos y API

**Files:**
- Modify: `src/types/planificacion.ts`
- Modify: `src/api/planificacion.ts`

**Interfaces:**
- Produce: `IConsultaBuscador`, `IResultadoBuscadorGeneral`, `consultarBuscador`, `confirmarExtra`,
  `buscarEnCartera`.

- [x] **Paso 1: tipos (espejo exacto de los tipos del backend, Task 4 del plan backend)**

```typescript
export type EstadoBuscadorDia = 'pendiente_zona_actual' | 'pendiente_otra_zona' | 'sin_fila_disponible'

export interface IConsultaBuscador {
    estado: EstadoBuscadorDia
    filaExistente: IAgendaClient | null
    otraZona: { semana: number; dia: number; descripcionZona: string | null } | null
}

export interface IResultadoBuscadorGeneral {
    codigoParticularCliente: string
    nombreCliente: string
    estado: 'pendiente' | 'visitado' | 'no_visita' | 'sin_plan'
    semana: number | null
    dia: number | null
    fecha: string | null
    motivo: string | null
}
```

Agregar `esExtra: boolean` a `IAgendaClient` y a `IAgendaClientAdmin` en el mismo archivo (espejo
del Task 7 del plan backend).

- [x] **Paso 2: funciones de API**

En `src/api/planificacion.ts`, siguiendo el patrón flat existente:

```typescript
export const consultarBuscador = async (
    codigo: string,
    semana: number,
): Promise<IConsultaBuscador> => {
    const res = await apiClient.get(`/planificacion/buscador/cliente/${codigo}`, {
        params: { semana },
    })
    return res.data.data
}

export const confirmarExtra = async (codigo: string, semana: number): Promise<IAgendaClient> => {
    const res = await apiClient.post(`/planificacion/buscador/cliente/${codigo}/extra`, { semana })
    return res.data.data
}

export const buscarEnCartera = async (texto: string): Promise<IResultadoBuscadorGeneral[]> => {
    const res = await apiClient.get('/planificacion/buscador/rotacion', { params: { q: texto } })
    return res.data.data
}
```

- [x] **Paso 3: commit**

```bash
git add src/types/planificacion.ts src/api/planificacion.ts
git commit -m "feat(buscador): tipos y llamadas API del buscador de clientes"
```

---

### Task 2: hooks de react-query

**Files:**
- Create: `src/hooks/useBuscador.ts`

**Interfaces:**
- Consume: `consultarBuscador`, `confirmarExtra`, `buscarEnCartera` (Task 1), `agendaKeys` (de
  `useAgenda.ts`).
- Produce: `useConsultarBuscador()`, `useConfirmarExtra()`, `useBuscarEnCartera(texto: string)`.

- [x] **Paso 1: hooks**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { buscarEnCartera, confirmarExtra, consultarBuscador } from '../api/planificacion'
import { agendaKeys } from './useAgenda'

export function useConsultarBuscador() {
    return useMutation({
        mutationFn: ({ codigo, semana }: { codigo: string; semana: number }) =>
            consultarBuscador(codigo, semana),
    })
}

export function useConfirmarExtra() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ codigo, semana }: { codigo: string; semana: number }) =>
            confirmarExtra(codigo, semana),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: agendaKeys.semana })
        },
    })
}

export function useBuscarEnCartera(texto: string) {
    return useQuery({
        queryKey: ['buscador', 'rotacion', texto],
        queryFn: () => buscarEnCartera(texto),
        enabled: texto.trim().length >= 2,
    })
}
```

Ajustar el nombre exacto de `agendaKeys.semana` / si invalida también `agendaKeys.dia(...)` según lo
que ya hace `useReacomodar` en el propio `useAgenda.ts` — copiar ese mismo set de invalidaciones, no
inventar uno nuevo.

- [x] **Paso 2: commit**

```bash
git add src/hooks/useBuscador.ts
git commit -m "feat(buscador): hooks de react-query para consultar y confirmar la extra"
```

---

### Task 3: `BuscadorDiaSheet` — el buscador que escribe

**Files:**
- Create: `src/components/buscador/BuscadorDiaSheet.tsx`
- Modify: `src/pages/AgendaSemanaPage.tsx`

**Interfaces:**
- Consume: `useConsultarBuscador`, `useConfirmarExtra` (Task 2), `BottomSheet` (`src/components/ui/BottomSheet.tsx`),
  patrón de input+lista de `AlcanceBuscador.tsx`, `useNotificacion` para el toast de éxito.
- Produce: `<BuscadorDiaSheet open onClose onExtraCreada={(cliente) => void} semanaEnCurso={number} clientesCartera={IVisitClientCard[]} />`

- [x] **Paso 1: estructura del sheet — input + lista + paso de confirmación inline**

Tres estados locales dentro del componente (mismo idioma que `OfrecimientoBuscador`'s
collapse-to-summary): `'buscando' | 'confirmando' | 'navegando'`.

```tsx
import { useState } from 'react'
import { Search } from 'lucide-react'
import { BottomSheet } from '../ui/BottomSheet'
import { useConsultarBuscador, useConfirmarExtra } from '../../hooks/useBuscador'
import type { IAgendaClient, IConsultaBuscador, IVisitClientCard } from '../../types/planificacion'

interface BuscadorDiaSheetProps {
    open: boolean
    onClose: () => void
    onExtraCreada: (cliente: IAgendaClient) => void
    onNavegarAExistente: (cliente: IAgendaClient) => void
    semanaEnCurso: number
    clientesCartera: IVisitClientCard[]
}

function normalizar(texto: string): string {
    return texto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
}

export function BuscadorDiaSheet({
    open,
    onClose,
    onExtraCreada,
    onNavegarAExistente,
    semanaEnCurso,
    clientesCartera,
}: BuscadorDiaSheetProps) {
    const [texto, setTexto] = useState('')
    const [consulta, setConsulta] = useState<{ codigo: string; nombre: string; resultado: IConsultaBuscador } | null>(null)
    const consultarBuscador = useConsultarBuscador()
    const confirmarExtra = useConfirmarExtra()

    const filtrados = texto.trim().length === 0
        ? []
        : clientesCartera
            .filter(c => normalizar(c.nombreCliente).includes(normalizar(texto)))
            .slice(0, 50)

    const handleSeleccionar = async (cliente: IVisitClientCard) => {
        const resultado = await consultarBuscador.mutateAsync({
            codigo: cliente.codigoParticularCliente,
            semana: semanaEnCurso,
        })
        if (resultado.estado === 'pendiente_zona_actual' && resultado.filaExistente) {
            onNavegarAExistente(resultado.filaExistente)
            onClose()
            return
        }
        setConsulta({ codigo: cliente.codigoParticularCliente, nombre: cliente.nombreCliente, resultado })
    }

    const handleConfirmar = async () => {
        if (!consulta) return
        const creada = await confirmarExtra.mutateAsync({ codigo: consulta.codigo, semana: semanaEnCurso })
        onExtraCreada(creada)
        setConsulta(null)
        setTexto('')
        onClose()
    }

    return (
        <BottomSheet open={open} onClose={onClose} title="Buscar cliente" altura="hasta-completa">
            {!consulta && (
                <div className="flex flex-col gap-2 p-4">
                    <div className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2">
                        <Search className="h-4 w-4 text-neutral-400" />
                        <input
                            className="w-full text-sm outline-none"
                            placeholder="Nombre del cliente"
                            value={texto}
                            onChange={e => setTexto(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <ul className="flex flex-col gap-1">
                        {filtrados.map(cliente => (
                            <li key={cliente.codigoParticularCliente}>
                                <button
                                    type="button"
                                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-neutral-100"
                                    onClick={() => handleSeleccionar(cliente)}
                                >
                                    {cliente.nombreCliente}
                                </button>
                            </li>
                        ))}
                        {texto.trim().length > 0 && filtrados.length === 0 && (
                            <li className="px-3 py-2 text-sm text-neutral-400">Sin resultados</li>
                        )}
                    </ul>
                </div>
            )}

            {consulta && consulta.resultado.estado === 'pendiente_otra_zona' && consulta.resultado.otraZona && (
                <div className="flex flex-col gap-3 p-4">
                    <p className="text-sm text-neutral-700">
                        Ya está planificado el {diaLabel(consulta.resultado.otraZona.dia)} en{' '}
                        {consulta.resultado.otraZona.descripcionZona ?? `zona ${consulta.resultado.otraZona.semana}`}.
                    </p>
                    <div className="flex gap-2">
                        <button type="button" className="flex-1 rounded-lg border py-2 text-sm" onClick={() => setConsulta(null)}>
                            Cancelar
                        </button>
                        <button
                            type="button"
                            className="flex-1 rounded-lg bg-neutral-900 py-2 text-sm text-white"
                            onClick={handleConfirmar}
                        >
                            Agregar igual
                        </button>
                    </div>
                </div>
            )}

            {consulta && consulta.resultado.estado === 'sin_fila_disponible' && (
                <div className="flex flex-col gap-3 p-4">
                    <p className="text-sm text-neutral-700">
                        {consulta.nombre} no está planificado hoy. Se va a agregar como visita extra.
                    </p>
                    <div className="flex gap-2">
                        <button type="button" className="flex-1 rounded-lg border py-2 text-sm" onClick={() => setConsulta(null)}>
                            Cancelar
                        </button>
                        <button
                            type="button"
                            className="flex-1 rounded-lg bg-neutral-900 py-2 text-sm text-white"
                            onClick={handleConfirmar}
                        >
                            Agregar
                        </button>
                    </div>
                </div>
            )}
        </BottomSheet>
    )
}

function diaLabel(dia: number): string {
    const dias = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes']
    return dias[dia - 1] ?? `día ${dia}`
}
```

Ajustar props exactas de `BottomSheet` (`altura`, `title`/`eyebrow`) a lo que ya expone el
componente real — revisar su archivo antes de este paso si los nombres no calzan.

**Nota sobre "Pendiente hoy en esta zona":** el spec (extensión 2026-08-13) pide que el caso
`pendiente_zona_actual` también muestre un mensaje antes de navegar, no que navegue directo. Ajustar
`handleSeleccionar` para, en ese caso, mostrar el mismo tipo de pantalla de confirmación con el
texto "Pendiente hoy en esta zona" y un solo botón "Ver" que dispare `onNavegarAExistente` — no
navegar automáticamente sin mostrar nada.

- [x] **Paso 2: wiring en `AgendaSemanaPage.tsx`**

Agregar estado `const [buscadorAbierto, setBuscadorAbierto] = useState(false)`, renderizar
`<BuscadorDiaSheet open={buscadorAbierto} onClose={() => setBuscadorAbierto(false)} ... />` junto a
los demás sheets (`ResolucionSheet`, `EstadoVisitaSheet`), y pasarle `semanaEnCurso` desde el estado
de ciclo/posición que la página ya maneja. `onExtraCreada`/`onNavegarAExistente` deben abrir la
misma UI que hoy abre `ClienteCard.onAbrir` (revisar qué hace ese callback y reusarlo, no duplicar
lógica de navegación).

Un botón/ícono para abrir el sheet va en `AppHeader.tsx` (Task 4) o, si se prefiere no tocar el
header compartido con gerencia, como botón flotante dentro de `AgendaSemanaPage` — decidir en base a
si `AppHeader` es exclusivo del vendedor o compartido (revisar `App.tsx` antes de este paso).

- [x] **Paso 3: commit**

```bash
git add src/components/buscador/BuscadorDiaSheet.tsx src/pages/AgendaSemanaPage.tsx
git commit -m "feat(buscador): sheet del buscador del dia con creacion de extra"
```

---

### Task 4: chip "Agregado" en `ClienteCard` y `ClienteCardRuta`

**Files:**
- Modify: `src/components/ClienteCard.tsx` (línea ~84-100, junto a los chips "En curso"/"No visitado")
- Modify: `src/components/ruta/ClienteCardRuta.tsx` (línea ~64-72, junto al hint de `ultimoMovimiento`)

- [x] **Paso 1: prop y chip en `ClienteCard`**

Agregar `esExtra` a la desestructuración de `cliente` (ya viene del backend, Task 7 del plan
backend) y el chip, mismo idioma inline que los existentes:

```tsx
{cliente.esExtra && (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#E0E7FF] px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-[#3730A3]">
        Agregado
    </span>
)}
```

Ubicarlo en el mismo `flex-wrap` donde ya están "En curso"/"No visitado" (línea ~84).

- [x] **Paso 2: marca en `ClienteCardRuta`**

Mismo chip, mismo lugar relativo al hint de `ultimoMovimiento` (línea ~64-72), leyendo
`cliente.esExtra` de `IAgendaClientAdmin`.

- [x] **Paso 3: commit**

```bash
git add src/components/ClienteCard.tsx src/components/ruta/ClienteCardRuta.tsx
git commit -m "feat(buscador): chip Agregado en la card del vendedor y en el grid de gerencia"
```

---

### Task 5: `BuscadorGeneralSheet` — el buscador de solo consulta

**Files:**
- Create: `src/components/buscador/BuscadorGeneralSheet.tsx`
- Modify: `src/components/AppHeader.tsx`
- Modify: `src/pages/AgendaSemanaPage.tsx` (o donde viva `AppHeader` para el vendedor)

**Interfaces:**
- Consume: `useBuscarEnCartera` (Task 2), navegación a preview de zona (revisar cómo
  `AgendaSemanaPage` ya navega a `GET /rotacion/semana/:semana` — probablemente un hook/estado
  existente para "ver preview de otra semana"; reusar ese mecanismo, no crear uno nuevo).

- [x] **Paso 1: componente**

```tsx
import { useState } from 'react'
import { Search } from 'lucide-react'
import { BottomSheet } from '../ui/BottomSheet'
import { useBuscarEnCartera } from '../../hooks/useBuscador'
import type { IResultadoBuscadorGeneral } from '../../types/planificacion'

interface BuscadorGeneralSheetProps {
    open: boolean
    onClose: () => void
    onVerZona: (semana: number) => void
}

function etiquetaEstado(r: IResultadoBuscadorGeneral): string {
    switch (r.estado) {
        case 'pendiente':
            return `Pendiente el ${diaLabel(r.dia)} en zona ${r.semana}`
        case 'visitado':
            return `Visitado el ${r.fecha}`
        case 'no_visita':
            return `No visité — ${r.motivo}`
        case 'sin_plan':
            return 'No está planificado esta vuelta'
    }
}

function diaLabel(dia: number | null): string {
    if (dia === null) return ''
    const dias = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes']
    return dias[dia - 1] ?? `día ${dia}`
}

export function BuscadorGeneralSheet({ open, onClose, onVerZona }: BuscadorGeneralSheetProps) {
    const [texto, setTexto] = useState('')
    const { data: resultados = [], isFetching } = useBuscarEnCartera(texto)

    return (
        <BottomSheet open={open} onClose={onClose} title="Buscar en toda la rotación" altura="hasta-completa">
            <div className="flex flex-col gap-2 p-4">
                <div className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2">
                    <Search className="h-4 w-4 text-neutral-400" />
                    <input
                        className="w-full text-sm outline-none"
                        placeholder="Nombre del cliente"
                        value={texto}
                        onChange={e => setTexto(e.target.value)}
                        autoFocus
                    />
                </div>
                {isFetching && <p className="px-3 text-sm text-neutral-400">Buscando...</p>}
                <ul className="flex flex-col gap-1">
                    {resultados.map(r => (
                        <li key={r.codigoParticularCliente}>
                            <button
                                type="button"
                                className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-neutral-100"
                                onClick={() => r.semana !== null && onVerZona(r.semana)}
                                disabled={r.semana === null}
                            >
                                <span className="block font-medium">{r.nombreCliente}</span>
                                <span className="block text-xs text-neutral-500">{etiquetaEstado(r)}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </BottomSheet>
    )
}
```

Este componente **no tiene ningún botón de crear/reagendar** — solo navega a preview vía
`onVerZona`. No compartir estado ni componente con `BuscadorDiaSheet`.

- [x] **Paso 2: ícono en el header**

En `AppHeader.tsx`, agregar un botón de lupa junto a `AccountMenu`/chevrons (línea ~54-60) que abre
el sheet — vía prop `onAbrirBuscadorGeneral?: () => void` pasada desde `AgendaSemanaPage` (no
acoplar `AppHeader` a react-query directamente, mantiene el patrón de props-only que ya usa para el
resto de sus acciones).

- [x] **Paso 3: wiring**

En `AgendaSemanaPage.tsx`, estado `buscadorGeneralAbierto`, renderizar el sheet, y `onVerZona`
navegando al preview de esa semana con el mecanismo ya existente en la página.

- [x] **Paso 4: commit**

```bash
git add src/components/buscador/BuscadorGeneralSheet.tsx src/components/AppHeader.tsx src/pages/AgendaSemanaPage.tsx
git commit -m "feat(buscador): buscador general de solo lectura en el header de la agenda"
```

---

## Nota de cierre

Sin tests automatizados en este plan (pedido explícito del usuario). Antes de abrir el PR correr
`npm run build` (o `tsc --noEmit`) para confirmar que compila.
