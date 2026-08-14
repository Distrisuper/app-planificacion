import { horaNegocio, isoLocal } from '@/lib/fechas'
import type {
    IAnaliticaResumen,
    ICoord,
    IObjecionesResumen,
    IVendedorMetricas,
    IVendedorOpcion,
    IVisitaDetalle,
    IVisitaFila,
} from '@/types/analitica'

/** Arma un vendedor completo a partir de unos pocos números, para que el fixture
 *  se lea y los casos borde queden explícitos en cada override. */
function vendedor(over: Partial<IVendedorMetricas> & {
    codigoParticularVendedor: string
    nombreVendedor: string
}): IVendedorMetricas {
    const base: IVendedorMetricas = {
        codigoParticularVendedor: '',
        nombreVendedor: '',
        planificados: 40,
        visitados: 34,
        noVisita: 4,
        reagendados: 1,
        pendientes: 1,
        enCurso: 0,
        cobertura: 0.85,
        ciclosEnCurso: 0,
        visitasTotales: 34,
        visitasValidas: 32,
        visitasNoValidadas: 1,
        visitasSinCoord: 1,
        visitasCortas: 3,
        duracionPromedioMin: 38,
        minutosTotales: 1216,
        visitasPorDia: 6.8,
        clientesDistintos: 32,
        pctCumplimientoClientes: 88,
        pctCumplimientoMinutos: 91,
        efectividadOperativa: 89,
        ofrecimientosTotales: 68,
        ofrecimientosGanados: 27,
        ofrecimientosDiferidos: 19,
        ofrecimientosPerdidos: 22,
        efectividadComercial: 0.4,
        pctNoOfrecidos: 0.18,
        ofrecimientosSinResolver: 2,
    }
    return { ...base, ...over }
}

const VENDEDORES: IVendedorMetricas[] = [
    // El mejor del equipo: sirve de techo para el semáforo relativo.
    vendedor({
        codigoParticularVendedor: 'V1',
        nombreVendedor: 'ACOSTA MARIANO',
        planificados: 42,
        visitados: 41,
        noVisita: 1,
        reagendados: 0,
        pendientes: 0,
        cobertura: 0.976,
        visitasTotales: 41,
        visitasValidas: 40,
        visitasNoValidadas: 1,
        visitasSinCoord: 0,
        visitasCortas: 1,
        duracionPromedioMin: 46,
        minutosTotales: 1886,
        visitasPorDia: 8.2,
        clientesDistintos: 40,
        pctCumplimientoClientes: 104,
        pctCumplimientoMinutos: 108,
        efectividadOperativa: 100,
        ofrecimientosTotales: 92,
        ofrecimientosGanados: 51,
        ofrecimientosDiferidos: 21,
        ofrecimientosPerdidos: 20,
        efectividadComercial: 0.554,
        pctNoOfrecidos: 0.06,
        ofrecimientosSinResolver: 0,
    }),
    vendedor({ codigoParticularVendedor: 'V2', nombreVendedor: 'BENITEZ LAURA' }),
    vendedor({
        codigoParticularVendedor: 'V3',
        nombreVendedor: 'CABRERA DIEGO',
        cobertura: 0.8,
        visitados: 32,
        pendientes: 3,
        efectividadComercial: 0.36,
    }),
    // CASO BORDE: ciclo abierto, la semana va por la mitad. Cobertura baja legítima.
    vendedor({
        codigoParticularVendedor: 'V4',
        nombreVendedor: 'DOMINGUEZ SILVINA',
        planificados: 38,
        visitados: 15,
        noVisita: 2,
        reagendados: 0,
        pendientes: 19,
        enCurso: 2,
        cobertura: 0.395,
        ciclosEnCurso: 1,
        visitasTotales: 15,
        visitasValidas: 15,
        visitasNoValidadas: 0,
        visitasSinCoord: 0,
        visitasCortas: 1,
        duracionPromedioMin: 41,
        minutosTotales: 615,
        visitasPorDia: 7.5,
        clientesDistintos: 15,
        pctCumplimientoClientes: 46,
        pctCumplimientoMinutos: 44,
        efectividadOperativa: 45,
        ofrecimientosTotales: 31,
        ofrecimientosGanados: 14,
        ofrecimientosDiferidos: 9,
        ofrecimientosPerdidos: 8,
        efectividadComercial: 0.451,
        pctNoOfrecidos: 0.1,
        ofrecimientosSinResolver: 4,
    }),
    // CASO BORDE: más de la mitad de las visitas fuera de los 300 m.
    vendedor({
        codigoParticularVendedor: 'V5',
        nombreVendedor: 'ESQUIVEL RAMON',
        planificados: 40,
        visitados: 30,
        noVisita: 6,
        reagendados: 2,
        pendientes: 2,
        cobertura: 0.75,
        visitasTotales: 30,
        visitasValidas: 12,
        visitasNoValidadas: 17,
        visitasSinCoord: 1,
        visitasCortas: 6,
        duracionPromedioMin: 33,
        minutosTotales: 990,
        visitasPorDia: 6,
        clientesDistintos: 28,
        pctCumplimientoClientes: 72,
        pctCumplimientoMinutos: 70,
        efectividadOperativa: 71,
        ofrecimientosTotales: 48,
        ofrecimientosGanados: 12,
        ofrecimientosDiferidos: 14,
        ofrecimientosPerdidos: 22,
        efectividadComercial: 0.25,
        pctNoOfrecidos: 0.31,
        ofrecimientosSinResolver: 6,
    }),
    // CASO BORDE: visitas demasiado cortas (piso absoluto de 20 min).
    vendedor({
        codigoParticularVendedor: 'V6',
        nombreVendedor: 'FERREYRA GUSTAVO',
        planificados: 44,
        visitados: 39,
        noVisita: 3,
        reagendados: 1,
        pendientes: 1,
        cobertura: 0.886,
        visitasTotales: 39,
        visitasValidas: 37,
        visitasNoValidadas: 2,
        visitasSinCoord: 0,
        visitasCortas: 28,
        duracionPromedioMin: 14,
        minutosTotales: 546,
        visitasPorDia: 7.8,
        clientesDistintos: 37,
        pctCumplimientoClientes: 96,
        pctCumplimientoMinutos: 38,
        efectividadOperativa: 67,
        ofrecimientosTotales: 40,
        ofrecimientosGanados: 9,
        ofrecimientosDiferidos: 11,
        ofrecimientosPerdidos: 20,
        efectividadComercial: 0.225,
        pctNoOfrecidos: 0.44,
        ofrecimientosSinResolver: 9,
    }),
    // CASO BORDE: cerró visitas sin ofrecer un solo rubro → efectividad null, no 0%.
    vendedor({
        codigoParticularVendedor: 'V7',
        nombreVendedor: 'GIMENEZ ROBERTO',
        planificados: 36,
        visitados: 28,
        noVisita: 5,
        reagendados: 1,
        pendientes: 2,
        cobertura: 0.778,
        visitasTotales: 28,
        visitasValidas: 27,
        visitasNoValidadas: 0,
        visitasSinCoord: 1,
        visitasCortas: 4,
        duracionPromedioMin: 35,
        minutosTotales: 980,
        visitasPorDia: 5.6,
        clientesDistintos: 27,
        pctCumplimientoClientes: 70,
        pctCumplimientoMinutos: 69,
        efectividadOperativa: 70,
        ofrecimientosTotales: 0,
        ofrecimientosGanados: 0,
        ofrecimientosDiferidos: 0,
        ofrecimientosPerdidos: 0,
        efectividadComercial: null,
        pctNoOfrecidos: 1,
        ofrecimientosSinResolver: 22,
    }),
    // CASO BORDE: sin objetivo vigente en pl_objetivo → cumplimiento en s/d.
    vendedor({
        codigoParticularVendedor: 'V8',
        nombreVendedor: 'HERRERA NATALIA',
        planificados: 30,
        visitados: 26,
        noVisita: 3,
        reagendados: 0,
        pendientes: 1,
        cobertura: 0.867,
        visitasTotales: 26,
        visitasValidas: 25,
        visitasNoValidadas: 1,
        visitasSinCoord: 0,
        visitasCortas: 2,
        duracionPromedioMin: 44,
        minutosTotales: 1100,
        visitasPorDia: 5.2,
        clientesDistintos: 25,
        pctCumplimientoClientes: null,
        pctCumplimientoMinutos: null,
        efectividadOperativa: null,
        ofrecimientosTotales: 55,
        ofrecimientosGanados: 24,
        ofrecimientosDiferidos: 16,
        ofrecimientosPerdidos: 15,
        efectividadComercial: 0.436,
        pctNoOfrecidos: 0.12,
        ofrecimientosSinResolver: 1,
    }),
    vendedor({
        codigoParticularVendedor: 'V9',
        nombreVendedor: 'IBARRA MARCELO',
        cobertura: 0.9,
        visitados: 36,
        noVisita: 3,
        pendientes: 0,
        efectividadComercial: 0.48,
    }),
    vendedor({
        codigoParticularVendedor: 'V10',
        nombreVendedor: 'JUAREZ CLAUDIA',
        cobertura: 0.825,
        visitados: 33,
        pendientes: 2,
        efectividadComercial: 0.31,
    }),
]

/** Promedio simple sobre los vendedores, ignorando los null (igual que hará el backend). */
function promediar(campo: keyof IVendedorMetricas): number | null {
    const valores = VENDEDORES.map(v => v[campo]).filter(
        (n): n is number => typeof n === 'number',
    )
    if (valores.length === 0) return null
    return valores.reduce((a, b) => a + b, 0) / valores.length
}

const PROMEDIOS: IVendedorMetricas = {
    codigoParticularVendedor: '',
    nombreVendedor: 'PROMEDIOS',
    planificados: promediar('planificados')!,
    visitados: promediar('visitados')!,
    noVisita: promediar('noVisita')!,
    reagendados: promediar('reagendados')!,
    pendientes: promediar('pendientes')!,
    enCurso: promediar('enCurso')!,
    cobertura: promediar('cobertura'),
    ciclosEnCurso: VENDEDORES.reduce((a, v) => a + v.ciclosEnCurso, 0),
    visitasTotales: promediar('visitasTotales')!,
    visitasValidas: promediar('visitasValidas')!,
    visitasNoValidadas: promediar('visitasNoValidadas')!,
    visitasSinCoord: promediar('visitasSinCoord')!,
    visitasCortas: promediar('visitasCortas')!,
    duracionPromedioMin: promediar('duracionPromedioMin'),
    minutosTotales: promediar('minutosTotales')!,
    visitasPorDia: promediar('visitasPorDia')!,
    clientesDistintos: promediar('clientesDistintos')!,
    pctCumplimientoClientes: promediar('pctCumplimientoClientes'),
    pctCumplimientoMinutos: promediar('pctCumplimientoMinutos'),
    efectividadOperativa: promediar('efectividadOperativa'),
    ofrecimientosTotales: promediar('ofrecimientosTotales')!,
    ofrecimientosGanados: promediar('ofrecimientosGanados')!,
    ofrecimientosDiferidos: promediar('ofrecimientosDiferidos')!,
    ofrecimientosPerdidos: promediar('ofrecimientosPerdidos')!,
    efectividadComercial: promediar('efectividadComercial'),
    pctNoOfrecidos: promediar('pctNoOfrecidos'),
    ofrecimientosSinResolver: promediar('ofrecimientosSinResolver')!,
}

export const MOCK_RESUMEN: IAnaliticaResumen = {
    desde: '2026-07-20',
    hasta: '2026-07-24',
    diasHabiles: 5,
    promedios: PROMEDIOS,
    vendedores: VENDEDORES,
}

/** El roster incluye a un vendedor SIN actividad (V11): tiene que aparecer en el
 *  dropdown aunque no tenga una fila en la tabla, porque es exactamente el caso que
 *  gerencia quiere poder mirar. */
export const MOCK_VENDEDORES: IVendedorOpcion[] = [
    ...VENDEDORES.map(v => ({
        codigoParticularVendedor: v.codigoParticularVendedor,
        nombreVendedor: v.nombreVendedor,
    })),
    { codigoParticularVendedor: 'V11', nombreVendedor: 'KRAUSE VERONICA' },
]

const CLIENTES = [
    'CALDERON ALEJANDRO PABLO',
    'VITALE ALEJANDRO ALBERTO',
    'ROMERO GABRIELA DEL VALLE',
    'OSANO ALDO MARIO',
    'NOVO OSCAR ORESTE',
    'ASTEGIANO ORLANDO MIGUEL',
    'TABORA EMANUEL',
    'PERAZZO LUIS ARMANDO',
    'BRANCHESI SERGIO ARIEL',
    'GIAVENO ARIEL FRANCISCO',
]

const MOTIVOS_RUBRO = [
    { descripcion: 'Saqué pedido', resultado: 'ganado' as const },
    { descripcion: 'Pasa pedido mañana', resultado: 'diferido' as const },
    { descripcion: 'Precio', resultado: 'perdido' as const },
    { descripcion: 'Flete', resultado: 'perdido' as const },
    { descripcion: 'No lo ofreció', resultado: 'no_ofrecido' as const },
]

let seqVisita = 1000

/** El instante de un horario de pared ARGENTINO, en el mismo formato que manda el
 *  backend (ISO 8601 con offset). Escribir la hora "pelada" haría que el fixture se
 *  interpretara en la TZ de quien corre los tests, y el mock dejaría de reproducir
 *  lo que se ve en producción. */
const instante = (fecha: string, hora: number, minuto: number): string =>
    new Date(
        `${fecha}T${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:00-03:00`,
    ).toISOString()

/** Genera visitas deterministas para un vendedor. Los índices elegidos fuerzan los
 *  casos borde: la 3ra visita de cada vendedor va sin coord del cliente, y la 5ta
 *  cae fuera de la tolerancia de 300 m. */
function visitasDe(codigo: string, nombreVendedor: string, cantidad: number): IVisitaFila[] {
    const filas: IVisitaFila[] = []
    for (let i = 0; i < cantidad; i++) {
        const dia = 20 + (i % 5)
        const hora = 9 + (i % 8)
        const duracion = codigo === 'V6' ? 12 + (i % 6) : 25 + ((i * 7) % 45)
        let distancia: number | null = 15 + ((i * 23) % 120)
        if (i % 7 === 2) distancia = null
        else if (i % 5 === 4) distancia = 4200 + i * 130
        const motivo = MOTIVOS_RUBRO[i % MOTIVOS_RUBRO.length]
        const fecha = `2026-07-${String(dia).padStart(2, '0')}`
        filas.push({
            visitaId: seqVisita++,
            fecha,
            fechaInicio: instante(fecha, hora, (i * 13) % 60),
            fechaFin: instante(fecha, hora + 1, 0),
            duracionMin: duracion,
            distanciaMetros: distancia,
            codigoParticularCliente: `C${1000 + i}`,
            nombreCliente: CLIENTES[i % CLIENTES.length],
            codigoParticularVendedor: codigo,
            nombreVendedor,
            tipo: 'visita',
            motivos: [motivo.descripcion],
            resultado: codigo === 'V7' ? null : motivo.resultado,
        })
    }
    return filas
}

export const MOCK_VISITAS: Record<string, IVisitaFila[]> = Object.fromEntries(
    VENDEDORES.map(v => [
        v.codigoParticularVendedor,
        visitasDe(v.codigoParticularVendedor, v.nombreVendedor, 12),
    ]),
)

const MOTIVOS_NO_VISITA = ['Cerrado', 'De vacaciones', 'No estaba el encargado']

/** Una fila que no es una visita. `duracionMin`/`fechaFin` van en null igual que una
 *  visita en curso: la UI las distingue por `tipo`, nunca por los nulls. */
function resolucionNoVisita(
    v: IVendedorMetricas,
    i: number,
    fecha: string,
    tipo: 'no_visita',
): IVisitaFila {
    return {
        visitaId: seqVisita++,
        fecha,
        fechaInicio: instante(fecha, 9 + (i % 8), (i * 17) % 60),
        fechaFin: null,
        duracionMin: null,
        distanciaMetros: null,
        codigoParticularCliente: `C${2000 + i}`,
        nombreCliente: CLIENTES[i % CLIENTES.length],
        codigoParticularVendedor: v.codigoParticularVendedor,
        nombreVendedor: v.nombreVendedor,
        tipo,
        motivos: [MOTIVOS_NO_VISITA[i % MOTIVOS_NO_VISITA.length]],
        resultado: null,
    }
}

/** Las no-visitas de la semana del fixture, para que la tabla de actividad tenga las dos
 *  resoluciones también en un rango histórico. */
export const MOCK_OTRAS_RESOLUCIONES: IVisitaFila[] = VENDEDORES.flatMap((v, i) => [
    resolucionNoVisita(v, i, '2026-07-21', 'no_visita'),
])

/** Actividad anclada al día de HOY: sin esto la vista de actividad abre vacía en su
 *  propio default, que es el peor primer contacto posible con la pantalla. */
export const MOCK_VISITAS_HOY: IVisitaFila[] = (() => {
    const hoy = isoLocal(new Date())
    /** Mueve una fila del fixture histórico al día de hoy conservando su horario de
     *  pared argentino — no alcanza con pisar `fecha`, que es solo la etiqueta. */
    const aHoy = (iso: string): string => {
        const [h, m] = horaNegocio(iso).split(':').map(Number)
        return instante(hoy, h, m)
    }
    const filas = VENDEDORES.slice(0, 6).flatMap((v, i) => {
        const cerradas = visitasDe(v.codigoParticularVendedor, v.nombreVendedor, 2).map(f => ({
            ...f,
            fecha: hoy,
            fechaInicio: aHoy(f.fechaInicio),
            fechaFin: f.fechaFin ? aHoy(f.fechaFin) : null,
        }))
        // Una visita abierta: el caso que hace útil mirar la pantalla a media mañana.
        const enCurso: IVisitaFila = {
            ...cerradas[0],
            visitaId: seqVisita++,
            fechaFin: null,
            duracionMin: null,
            motivos: [],
            resultado: null,
        }
        return i < 2 ? [...cerradas, enCurso] : cerradas
    })
    return [...filas, resolucionNoVisita(VENDEDORES[2], 7, hoy, 'no_visita')]
})()

/** Coord base (Rosario) para que el mapa del nivel 3 tenga algo verosímil. */
const BASE: ICoord = { lat: -32.9442, lng: -60.6505 }

function detalleDe(fila: IVisitaFila, indice: number): IVisitaDetalle {
    const sinCoordCliente = fila.distanciaMetros === null
    const desvio = fila.distanciaMetros === null ? 0 : fila.distanciaMetros / 111_000
    return {
        visitaId: fila.visitaId,
        codigoParticularCliente: fila.codigoParticularCliente,
        nombreCliente: fila.nombreCliente,
        direccion: sinCoordCliente ? null : `Av. Pellegrini ${1200 + indice * 37}`,
        fechaInicio: fila.fechaInicio,
        fechaFin: fila.fechaFin,
        duracionMin: fila.duracionMin,
        coordInicio: {
            lat: BASE.lat + indice * 0.002 + desvio,
            lng: BASE.lng + indice * 0.002,
        },
        coordFinal: {
            lat: BASE.lat + indice * 0.002 + desvio + 0.0002,
            lng: BASE.lng + indice * 0.002 + 0.0002,
        },
        coordCliente: sinCoordCliente
            ? null
            : { lat: BASE.lat + indice * 0.002, lng: BASE.lng + indice * 0.002 },
        distanciaMetros: fila.distanciaMetros,
        ofrecimientos: [
            {
                tipo: 'rubro',
                codigo: 'R01',
                descripcion: 'Lubricantes',
                esPropuesto: true,
                resuelto: fila.resultado !== null,
                alcance: [],
                motivos:
                    fila.resultado === null
                        ? []
                        : [
                              {
                                  descripcion: fila.motivos[0],
                                  resultado: fila.resultado,
                                  marca: fila.resultado === 'perdido' ? 'YPF' : null,
                                  competidor: fila.resultado === 'perdido' ? 'Shell' : null,
                                  pctDiferencia: fila.resultado === 'perdido' ? 12 : null,
                              },
                          ],
            },
            {
                tipo: 'rubro',
                codigo: 'R02',
                descripcion: 'Filtros',
                esPropuesto: true,
                resuelto: false,
                alcance: [],
                motivos: [],
            },
            // Ejemplo de tipo no-rubro con alcance, para que el chip y el resumen se
            // vean en el sandbox sin depender del backend.
            {
                tipo: 'accion',
                codigo: 'CUPO',
                descripcion: 'Plan cupo',
                esPropuesto: false,
                resuelto: true,
                alcance: [{ tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }],
                motivos: [
                    {
                        descripcion: 'Saqué pedido',
                        resultado: 'ganado',
                        marca: null,
                        competidor: null,
                        pctDiferencia: null,
                    },
                ],
            },
        ],
    }
}

export const MOCK_DETALLES: Record<number, IVisitaDetalle> = Object.fromEntries(
    [...Object.values(MOCK_VISITAS).flat(), ...MOCK_OTRAS_RESOLUCIONES, ...MOCK_VISITAS_HOY].map(
        (fila, i) => [fila.visitaId, detalleDe(fila, i % 20)],
    ),
)

export const MOCK_OBJECIONES: IObjecionesResumen = {
    total: 486,
    motivos: [
        { motivoId: 1, descripcion: 'Saqué pedido', resultado: 'ganado', cantidad: 174, pct: 0.358 },
        { motivoId: 2, descripcion: 'Precio', resultado: 'perdido', cantidad: 98, pct: 0.202 },
        { motivoId: 3, descripcion: 'Pasa pedido mañana', resultado: 'diferido', cantidad: 71, pct: 0.146 },
        { motivoId: 4, descripcion: 'Tiene stock', resultado: 'perdido', cantidad: 54, pct: 0.111 },
        { motivoId: 5, descripcion: 'Flete', resultado: 'perdido', cantidad: 38, pct: 0.078 },
        { motivoId: 6, descripcion: 'Compra a competidor', resultado: 'perdido', cantidad: 29, pct: 0.06 },
        { motivoId: 7, descripcion: 'DS', resultado: 'perdido', cantidad: 22, pct: 0.045 },
    ],
}
