import type { CanalContacto, EstadoLlamado, IContactoFila, IContactoLlamado, IVisitaFila } from '@/types/analitica'

/** Una fila de las tablas de gerencia es un llamado si lo dice su canal. Las filas de
 *  /visitas no traen canal: son visitas. */
export const esLlamado = (f: IVisitaFila | IContactoFila): f is IContactoLlamado =>
    'canal' in f && f.canal === 'llamado'

export const ETIQUETA_ESTADO_LLAMADO: Record<EstadoLlamado, string> = {
    venta: 'Venta',
    pendiente_pedido: 'Pedido pendiente',
    sin_venta: 'Sin venta',
    no_atendio: 'No atendió',
    volver_a_llamar: 'Volver a llamar',
}

/** El filtro de canal de las tablas: ausente es "Todo". */
export const OPCIONES_CANAL: { valor: CanalContacto | undefined; etiqueta: string }[] = [
    { valor: undefined, etiqueta: 'Todo' },
    { valor: 'visita', etiqueta: 'Visitas' },
    { valor: 'llamado', etiqueta: 'Llamados' },
]

/** Lee el canal de la URL; cualquier otro valor es "Todo". */
export function canalDeParam(valor: string | null): CanalContacto | undefined {
    return valor === 'visita' || valor === 'llamado' ? valor : undefined
}
