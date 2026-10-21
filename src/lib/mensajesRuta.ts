import { errorCode } from './apiError'

/**
 * Lo que se le dice a gerencia por cada código de error de la edición de la ruta (vuelta y
 * ruta base). Un solo mapa para la página y los diálogos: el mismo código no puede
 * explicarse distinto en dos lugares.
 */
const MENSAJES: Record<string, string> = {
    // Ruta base
    DIA_INVALIDO: 'Ese día no existe en la ruta.',
    CELDAS_IGUALES: 'Elegiste dos veces el mismo día: no hay nada que intercambiar.',
    SEMANA_FUERA_DE_LA_RUTA:
        'Esa semana no está en la ruta base. Solo se puede usar una semana que ya exista o la siguiente a la última.',
    CELDA_OCUPADA_POR_EL_MISMO_CLIENTE: 'Ese cliente ya está en ese día de la ruta base.',
    CLIENTE_EN_AMBAS_CELDAS:
        'Un cliente está en los dos días: intercambiarlos lo dejaría dos veces en el mismo día. Quitalo de uno primero.',
    CLIENTE_FUERA_DE_CARTERA: 'Ese cliente no es de la cartera de este vendedor.',
    RUTA_FILA_NOT_FOUND: 'Ese cliente ya no está en la ruta base: alguien la cambió. Recargá la página.',
    PRUEBA_SIN_RUTA_BASE: 'El vendedor de prueba no tiene ruta base: no se puede editar.',
    POSICION_INVALIDA: 'Ese lugar no existe en la ruta base. Recargá la página y probá de nuevo.',
    DEMASIADAS_SEMANAS: 'La ruta base ya tiene el máximo de semanas (60): no se pueden agregar más.',
    SEMANA_YA_EXISTE: 'Esa semana ya se agregó recién. Recargá la página para verla.',
    DIAS_INVALIDOS: 'Los códigos pegados no se pudieron leer por día. Revisá que sean de LUN a VIE.',
    // Vuelta: intercambiar semanas
    SEMANA_NO_PENDIENTE: 'Solo se pueden intercambiar semanas que todavía no empezaron.',
    SEMANA_CON_RESUELTOS:
        'Una de las semanas ya tiene clientes visitados o no visitados: no se puede intercambiar.',
    SEMANA_FUERA_DEL_SET: 'Esa semana no está en esta vuelta.',
    SEMANAS_IGUALES: 'Elegiste dos veces la misma semana: no hay nada que intercambiar.',
    ROTACION_CERRADA: 'Esta vuelta ya está cerrada: no se puede editar.',
}

/** El texto para el código del error, o `porDefecto` si el código no es uno conocido. */
export function mensajeErrorRuta(err: unknown, porDefecto: string): string {
    const code = errorCode(err)
    return (code && MENSAJES[code]) || porDefecto
}
