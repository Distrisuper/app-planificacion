import { apiClient } from './apiClient'
import type {
    Dia,
    IAccion,
    IAgendaClient,
    IAgregarOfrecimientoDTO,
    IAgregarOfrecimientoResult,
    ICatalogoItem,
    ICrearAltaDTO,
    IEditarAltaDTO,
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
    IResolverOfrecimientoDTO,
    IResolverOfrecimientoResult,
    IResultadoBuscadorGeneral,
    IClientContextResponse,
    IClientContextRubro,
    IRubroDropsResponse,
    IRubroEstado,
    ISincronizarResult,
    NivelMotivo,
    SemanaAgenda,
    IMePlanificacion,
    IVendedorDePrueba,
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

export const iniciarVisita = async (
    dto: IIniciarVisitaDTO,
): Promise<{ visitaId: number; ofrecimientos: number; correccionPermanenteAplicada?: boolean }> => {
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

/** "No visité" sobre una visita YA INICIADA: convierte la resolución abierta en vez de
 *  crear una nueva. El endpoint de arriba (`/visitas/no-visita`) no sirve para este caso —
 *  rebota con VISITA_ACTIVA_EXISTENTE porque la fila ya tiene resolución. */
export const noVisitaSobreVisitaAbierta = async (
    visitaId: number,
    motivoIds: number[],
): Promise<INoVisitaResult> => {
    const res = await apiClient.post(`/planificacion/visitas/${visitaId}/no-visita`, {
        motivoIds,
    })
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

/** "Cómo viene comprando" para la propuesta y la visita: TODOS los rubros del cliente con
 *  Actual/M.Ant/Prom.6M y sus marcas anidadas. Pega a client-context (dominio sale), que
 *  reemplaza al uso del listado paginado de Versus con `search` por código. Los períodos
 *  vienen crudos: last6Months es suma, acá se divide por 6. */
export const getRubroStatus = async (
    codigoParticularCliente: string,
): Promise<IRubroEstado[]> => {
    const res = await apiClient.post('/sale/rubro/client-context', {
        particularCode: codigoParticularCliente,
    })
    const data: IClientContextResponse = res.data.data ?? res.data

    const tresNumeros = (t: IClientContextRubro['totalsByPeriod']) => ({
        actual: t.thisMonth?.amount ?? 0,
        mesAnterior: t.lastMonth?.amount ?? 0,
        promedio6m: (t.last6Months?.amount ?? 0) / 6,
        actualUnidades: t.thisMonth?.units ?? 0,
        mesAnteriorUnidades: t.lastMonth?.units ?? 0,
        promedio6mUnidades: (t.last6Months?.units ?? 0) / 6,
    })

    return (data.rubros ?? []).map(r => ({
        rubroCode: r.rubroCode,
        nombre: r.rubroDescription,
        ...tresNumeros(r.totalsByPeriod),
        marcas: (r.brands ?? []).map(b => ({
            code: b.brandCode,
            nombre: b.brandName,
            ...tresNumeros(b.totalsByPeriod),
            dejo: b.dropped === true,
        })),
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

// ── "Cliente nuevo" / altas (spec 2026-09-17) ──────────────────────────────────

/** "Cliente nuevo": crea la fila de alta en (zona vista, dia). Body plano, como lo normaliza el backend. */
export const crearAlta = async (dto: ICrearAltaDTO): Promise<IAgendaClient> => {
    const res = await apiClient.post('/planificacion/altas', dto)
    return res.data.data
}

export const editarAlta = async (rotacionClienteId: number, dto: IEditarAltaDTO): Promise<IAgendaClient> => {
    const res = await apiClient.put(`/planificacion/altas/${rotacionClienteId}`, dto)
    return res.data.data
}

/** Después de un "No visité": otra fila para el mismo comercio, en `dia`. */
export const reintentarAlta = async (rotacionClienteId: number, dia: number): Promise<IAgendaClient> => {
    const res = await apiClient.post(`/planificacion/altas/${rotacionClienteId}/reintentar`, { dia })
    return res.data.data
}

// ── Identidad y vendedor de prueba ──────────────────────────────────────────────

/** Qué puede hacer el usuario en planificación, según el backend. El front NO tiene tabla de
 *  roles: decide con esto (spec 2026-09-17, "GET /planificacion/me"). */
export const getMePlanificacion = async (): Promise<IMePlanificacion> => {
    const res = await apiClient.get('/planificacion/me')
    return res.data.data
}

/** Borra todo lo del vendedor de prueba del usuario y lo vuelve a crear como copia del plan de
 *  `origen`, o vacío con `null`. El código del vendedor de prueba nunca viaja: sale del token. */
export const reiniciarPrueba = async (origen: string | null): Promise<IVendedorDePrueba> => {
    const res = await apiClient.post('/planificacion/prueba/reiniciar', { origen })
    return res.data.data
}
