import type { EstadoCliente, IMetricas } from '@/types/metricas'
import type { Formato } from './formato'

export interface ContextoTitulo { propio: boolean; nombre: string }
export type ValorObjetivo = { actual: number; objetivo: number | null }
export type ValorComparacion = { actual: number; anterior: number | null }
export type FilaLista = { etiqueta: string; valor: number }

interface TileBase { id: string; titulo: string; ayuda: string; formato: Formato }
export type Tile = TileBase &
    (
        | { forma: 'objetivo'; leer: (m: IMetricas) => ValorObjetivo | null }
        | { forma: 'comparacion'; leer: (m: IMetricas) => ValorComparacion | null }
        | { forma: 'lista'; leer: (m: IMetricas) => FilaLista[] | null; detalle?: (fila: FilaLista) => EstadoCliente | 'caida' }
    )
export interface Seccion { id: string; titulo: (ctx: ContextoTitulo) => string; tiles: Tile[] }

const comp = (v: { actual: number | null; anterior: number | null }): ValorComparacion | null =>
    v.actual === null ? null : { actual: v.actual, anterior: v.anterior }

const titulo = (propio: string, sufijo: string) => (ctx: ContextoTitulo) =>
    ctx.propio ? propio : `${ctx.nombre} · ${sufijo}`

/**
 * EL catálogo. La pantalla lo recorre y renderiza; no hay JSX por KPI. Gerencia va a
 * cambiar métricas sobre la marcha: cambiar, sacar o reordenar un KPI es tocar una
 * entrada acá. Agregar uno con dato nuevo es un campo más en IMetricas (API) y una
 * entrada acá. Vocabulario del vendedor: "clientes de tu ruta", nunca "planificaciones".
 */
export const CATALOGO: Seccion[] = [
    {
        id: 'mes',
        titulo: titulo('Mi mes', 'mes'),
        tiles: [
            { id: 'visitas', forma: 'objetivo', titulo: 'Visitas', formato: 'numero',
              ayuda: 'Visitas válidas del mes (con ubicación en el local y al menos 15 minutos) contra el objetivo mensual.',
              leer: m => m.visitas },
            { id: 'clientesVisitados', forma: 'objetivo', titulo: 'Clientes visitados', formato: 'numero',
              ayuda: 'Clientes distintos que visitaste en el mes contra el objetivo mensual.',
              leer: m => m.clientesVisitados },
            { id: 'horas', forma: 'objetivo', titulo: 'Horas', formato: 'horas',
              ayuda: 'Tiempo total dentro de visitas válidas en el mes contra el objetivo mensual.',
              leer: m => m.minutos },
            { id: 'efectividad', forma: 'comparacion', titulo: 'Efectividad', formato: 'porcentaje',
              ayuda: 'Promedio de los tres cumplimientos de arriba (visitas, clientes y horas), cada uno topeado en 100%.',
              leer: m => comp(m.efectividadOperativa) },
        ],
    },
    {
        id: 'visitas',
        titulo: titulo('Mis visitas', 'visitas'),
        tiles: [
            { id: 'cobertura', forma: 'comparacion', titulo: 'Cobertura de la ruta', formato: 'porcentaje',
              ayuda: 'Clientes de tu ruta visitados sobre el total de clientes de tu ruta en el mes.',
              leer: m => comp(m.cobertura) },
            { id: 'pedidos', forma: 'comparacion', titulo: 'Pedidos sobre ofrecidos', formato: 'porcentaje',
              ayuda: 'Rubros cerrados con "Saqué pedido" sobre los rubros que ofreciste. Mide la visita, no la facturación posterior.',
              leer: m => comp(m.efectividadComercial) },
            { id: 'objeciones', forma: 'lista', titulo: 'Objeciones más frecuentes', formato: 'numero',
              ayuda: 'Motivos que declaraste al cerrar rubros sin pedido, los cinco más repetidos del mes.',
              leer: m => m.objeciones.top },
        ],
    },
    {
        id: 'cartera',
        titulo: titulo('Mi cartera', 'cartera'),
        tiles: [
            { id: 'facturacion', forma: 'objetivo', titulo: 'Facturación', formato: 'pesosMillones',
              ayuda: 'Ventas facturadas del mes a tus clientes contra el objetivo mensual.',
              leer: m => m.ventas?.facturacion ?? null },
            { id: 'unidades', forma: 'objetivo', titulo: 'Unidades', formato: 'unidades',
              ayuda: 'Unidades vendidas en el mes a tus clientes contra el objetivo mensual.',
              leer: m => m.ventas?.unidades ?? null },
            { id: 'superRubros', forma: 'objetivo', titulo: 'Super rubros', formato: 'numero',
              ayuda: 'Super rubros en los que al menos un cliente tuyo alcanzó el mínimo en el mes.',
              leer: m => m.ventas?.superRubros ?? null },
            { id: 'clientesPorEstado', forma: 'lista', titulo: 'Clientes por estado', formato: 'numero',
              ayuda: 'Activo: compra en el mes. Pasivo: compró en los últimos meses pero no en este. Inactivo: sin compras. Crítico: activo con caída fuerte. Es el mismo estado que ves en Versus. Tocá una fila para ver los clientes.',
              leer: m => m.ventas?.clientesPorEstado ?? null,
              detalle: f => f.etiqueta as EstadoCliente },
            { id: 'clientesEnCaida', forma: 'lista', titulo: 'Clientes en caída', formato: 'porcentaje',
              ayuda: 'Clientes con mayor caída de facturación reciente contra su promedio anterior. Tocá para ver el listado completo.',
              leer: m => m.ventas?.clientesEnCaida ?? null,
              detalle: () => 'caida' },
        ],
    },
]
