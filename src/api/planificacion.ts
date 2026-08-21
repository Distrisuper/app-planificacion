import { apiClient } from './apiClient'
import type {
    Dia,
    IAccion,
    IAgendaClient,
    IAgregarOfrecimientoDTO,
    IAgregarOfrecimientoResult,
    ICatalogoItem,
    ICerrarVisitaDTO,
    ICerrarVisitaResult,
    ICicloActualResult,
    IConsultaBuscador,
    IIniciarVisitaDTO,
    IMotivo,
    INoVisitaDTO,
    INoVisitaResult,
    IOfrecimiento,
    IPreviewCiclo,
    IReacomodarDTO,
    IResolucion,
    IResolverOfrecimientoDTO,
    IResolverOfrecimientoResult,
    IResultadoBuscadorGeneral,
    IRubroClientsPageResponse,
    IRubroDropsResponse,
    IRubroEstado,
    ISincronizarResult,
    NivelMotivo,
    SemanaAgenda,
} from '@/types/planificacion'

// ── Ciclo ──────────────────────────────────────────────────────────────────────

/** La rotación/ciclo del vendedor. `semanas`/`semanasPendientes` viajan siempre que haya una
 *  rotación abierta, tenga o no ciclo/semana abierto encima ahora mismo. `semanas` trae
 *  `{ semana, descripcion }` (el nombre de la zona); `semanasPendientes` sigue siendo
 *  `number[]` — ver el comentario en `ICicloActualResult`. */
export const getCicloActual = async (): Promise<ICicloActualResult> => {
    const res = await apiClient.get('/planificacion/ciclo/actual')
    return res.data.data
}

/** El plan de UNA semana de la rotación, de solo lectura — no abre nada. */
export const previewSemana = async (semana: number): Promise<IPreviewCiclo> => {
    const res = await apiClient.get(`/planificacion/rotacion/semana/${semana}`)
    return res.data.data
}

/** Idempotente: cierra la semana vencida si la hay y sincroniza altas/bajas del padrón.
 *  Nunca abre nada — el standby se resuelve solo con la primera acción real. */
export const sincronizar = async (): Promise<ISincronizarResult> => {
    const res = await apiClient.post('/planificacion/ciclo/sincronizar')
    return res.data.data
}

/** Mueve la fila del plan a otro día (y opcionalmente otra semana de la rotación). NO la
 *  resuelve: el cliente queda pendiente en su nueva posición.
 *
 *  NO abre nada: en api-vendedores no pasa por `CicloService.asegurar` (a diferencia de
 *  iniciarVisita y noVisita). Sus errores propios son 403 FILA_AJENA, 404 FILA_NOT_FOUND,
 *  422 SEMANA_FUERA_DEL_SET y 400 DIA_INVALIDO. */
export const reacomodar = async (
    rotacionClienteId: number,
    dto: IReacomodarDTO,
): Promise<void> => {
    await apiClient.patch(`/planificacion/rotacion-cliente/${rotacionClienteId}/reacomodar`, dto)
}

// ── Agenda ─────────────────────────────────────────────────────────────────────

/** Sin parámetro `semana`: la vuelta es la que el vendedor tiene abierta. */
export const getAgendaSemana = async (): Promise<SemanaAgenda> => {
    const res = await apiClient.get('/planificacion/agenda/semana')
    return res.data.data
}

export const getAgendaDia = async (dia: Dia): Promise<IAgendaClient[]> => {
    const res = await apiClient.get('/planificacion/agenda/dia', {
        params: { dia },
    })
    return res.data.data
}

// ── Motivos ────────────────────────────────────────────────────────────────────

export const getMotivos = async (nivel?: NivelMotivo): Promise<IMotivo[]> => {
    const res = await apiClient.get('/planificacion/motivos', {
        params: nivel === undefined ? undefined : { nivel },
    })
    // `campos ?? []` en el borde y en un solo lugar: un back sin desplegar todavía, o una
    // respuesta que quedó cacheada de antes, no traen el campo — y `cat.campos.length` en
    // el render sería una pantalla en blanco en el teléfono del vendedor.
    return (res.data.data as IMotivo[]).map(m => ({ ...m, campos: m.campos ?? [] }))
}

// ── Visitas ────────────────────────────────────────────────────────────────────

export const getVisitaActiva = async (): Promise<IResolucion | null> => {
    const res = await apiClient.get('/planificacion/visitas/activa')
    return res.data.data
}

export const iniciarVisita = async (
    dto: IIniciarVisitaDTO,
): Promise<{ visitaId: number; ofrecimientos: number }> => {
    const res = await apiClient.post('/planificacion/visitas', dto)
    return res.data.data
}

/** Sin motivoIds: el resultado comercial vive en los ofrecimientos y se puede cargar después. */
export const cerrarVisita = async (
    visitaId: number,
    body: ICerrarVisitaDTO,
): Promise<ICerrarVisitaResult> => {
    const res = await apiClient.put(`/planificacion/visitas/${visitaId}/cerrar`, body)
    return res.data.data
}

export const registrarNoVisita = async (dto: INoVisitaDTO): Promise<INoVisitaResult> => {
    const res = await apiClient.post('/planificacion/visitas/no-visita', dto)
    return res.data.data
}

/** Reintento manual del aviso a Cromo. `resolucionId` es `IAgendaClient.visitaId` — el
 *  mismo endpoint ya trae todos sus guards del lado del backend (pertenencia, 409 si ya
 *  se envió, resolución completa); acá no se valida nada más. */
export const reintentarSeguimiento = async (
    resolucionId: number,
): Promise<{ enviado: boolean; motivo?: string; mensaje: string | null }> => {
    const res = await apiClient.post(`/planificacion/visitas/${resolucionId}/seguimiento`)
    return res.data.data
}

// ── Ofrecimientos de la visita ───────────────────────────────────────────────────

/** La propuesta CONGELADA al iniciar la visita (más los agregados a mano). */
export const getOfrecimientos = async (visitaId: number): Promise<IOfrecimiento[]> => {
    const res = await apiClient.get(`/planificacion/visitas/${visitaId}/ofrecimientos`)
    return res.data.data
}

export const agregarOfrecimiento = async (
    visitaId: number,
    dto: IAgregarOfrecimientoDTO,
): Promise<IAgregarOfrecimientoResult> => {
    const res = await apiClient.post(`/planificacion/visitas/${visitaId}/ofrecimientos`, dto)
    return res.data.data
}

/** Reemplaza los motivos del ofrecimiento, no acumula. No exige la visita abierta. */
export const resolverOfrecimiento = async (
    visitaId: number,
    ofrecimientoId: number,
    dto: IResolverOfrecimientoDTO,
): Promise<IResolverOfrecimientoResult> => {
    const res = await apiClient.put(
        `/planificacion/visitas/${visitaId}/ofrecimientos/${ofrecimientoId}`,
        dto,
    )
    return res.data.data
}

/** Solo ofrecimientos agregados a mano: los de la propuesta fallan con OFRECIMIENTO_DE_PROPUESTA. */
export const eliminarOfrecimiento = async (
    visitaId: number,
    ofrecimientoId: number,
): Promise<void> => {
    await apiClient.delete(`/planificacion/visitas/${visitaId}/ofrecimientos/${ofrecimientoId}`)
}

// ── Propuesta comercial (endpoint reusado, fuera del dominio de planificación) ──

export const getPropuesta = async (
    codigoParticularCliente: string,
): Promise<IRubroDropsResponse> => {
    const res = await apiClient.post('/sale/rubro/recommendations/drops', {
        particularCode: codigoParticularCliente,
    })
    return res.data.data ?? res.data
}

/** "Cómo viene comprando" (Ver versus): TODOS los rubros del cliente con Actual/M.Ant/
 *  Prom.6M, sin el recorte a caídas/relleno de la propuesta. `pageSize` > 1 y el filtro
 *  por `particularCode` exacto evitan quedarse con otro cliente si el `search` matchea
 *  más de uno por nombre. */
export const getRubroStatus = async (
    codigoParticularCliente: string,
): Promise<IRubroEstado[]> => {
    const res = await apiClient.post('/sale/rubro/clients', {
        sellerCode: null,
        filters: { search: codigoParticularCliente },
        page: 0,
        pageSize: 5,
    })
    const data: IRubroClientsPageResponse = res.data.data ?? res.data
    const entity = data.entities.find(
        e => e.particularCode === codigoParticularCliente,
    )
    const items = entity?.breakdown?.items ?? []

    return items
        .filter(i => i.kind === 'rubro')
        .map(i => ({
            rubroCode: i.code,
            nombre: i.name,
            actual: i.totalsByPeriod.thisMonth?.amount ?? 0,
            mesAnterior: i.totalsByPeriod.lastMonth?.amount ?? 0,
            promedio6m: (i.totalsByPeriod.last6Months?.amount ?? 0) / 6,
        }))
}

// ── Catálogos (endpoints reusados, fuera del dominio de planificación) ─────────

/** Marcas con ventas en los últimos 12 meses. Ordenadas por descripción del lado
 *  del server. */
export const getBrandCatalog = async (): Promise<ICatalogoItem[]> => {
    const res = await apiClient.get('/sale/brand/catalog')
    return res.data.data
}

/** Acciones comerciales del catálogo propio (pl_accion): plan cupo, descuento, promo. */
export const getAcciones = async (): Promise<IAccion[]> => {
    const res = await apiClient.get('/planificacion/acciones')
    return res.data.data
}

// ── Buscador de clientes (spec 2026-08-12) ─────────────────────────────────────

/** Consulta si el cliente ya tiene fila pendiente en la zona en curso o en otra zona,
 *  antes de decidir si el buscador navega o crea la extra. No escribe nada. */
export const consultarBuscador = async (
    codigo: string,
    semana: number,
): Promise<IConsultaBuscador> => {
    const res = await apiClient.get(`/planificacion/buscador/cliente/${codigo}`, {
        params: { semana },
    })
    return res.data.data
}

/** Crea (o devuelve, si ya existía por `uq_rotacion_cliente`) la fila `es_extra` de
 *  `(zona en curso, dia)` para este cliente. Sin `dia`, el backend cae a HOY. */
export const confirmarExtra = async (
    codigo: string,
    semana: number,
    dia?: number,
): Promise<IAgendaClient> => {
    const res = await apiClient.post(`/planificacion/buscador/cliente/${codigo}/extra`, {
        semana,
        dia,
    })
    return res.data.data
}

/** Buscador general de solo lectura: toda la cartera de la rotación, cualquier zona. */
export const buscarEnCartera = async (texto: string): Promise<IResultadoBuscadorGeneral[]> => {
    const res = await apiClient.get('/planificacion/buscador/rotacion', { params: { q: texto } })
    return res.data.data
}
