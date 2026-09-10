/**
 * El texto de ayuda del "?" de la pantalla de ruta.
 *
 * Vive en su propio módulo, como `ayudaEfectividadOperativa`: es contenido, y mezclarlo
 * con el JSX de la página hace que cada corrección de redacción toque un archivo grande.
 *
 * Lo que explica NO es la UI, es el dominio: las cuatro acciones de la grilla mueven
 * cosas distintas del plan, y confundirlas es lo que corrompe la línea de base (ver
 * `docs/dominio/modelo.md`). Si alguna de esas reglas cambia, este texto se actualiza a
 * mano — no se genera de nada.
 */
export function AyudaRuta() {
    return (
        <div className="space-y-3">
            <div>
                <p className="font-semibold text-slate-800">Qué es esta pantalla</p>
                <p className="mt-0.5">
                    El plan de visitas del vendedor: una fila por semana de su rotación, una
                    columna por día. Cada card es <b>una visita planificada</b>, no un cliente
                    — un cliente quincenal aparece dos veces, y eso es correcto.
                </p>
            </div>

            <div>
                <p className="font-semibold text-slate-800">Mover ≠ agregar</p>
                <ul className="mt-0.5 space-y-1">
                    <li>
                        <b>Arrastrar</b> una card, o <b>Traer acá</b> desde el buscador, mueve
                        esa visita de lugar. No crea ni duplica nada, y queda registrado quién
                        la movió (el ✎ de la card).
                    </li>
                    <li>
                        <b>+</b> agrega una visita nueva a esa celda. Si el cliente ya estaba
                        planificado en otra, la de allá <b>sigue pendiente</b>: quedan dos.
                    </li>
                    <li>
                        <b>⇄</b> permuta dos días completos.
                    </li>
                    <li>
                        <b>✕</b> quita una visita de esta vuelta. La próxima rotación la trae
                        de vuelta, porque se materializa del template. Se puede deshacer con
                        <b> Restaurar</b> mientras la vuelta siga abierta.
                    </li>
                </ul>
            </div>

            <div>
                <p className="font-semibold text-slate-800">Los carteles de las cards</p>
                <ul className="mt-0.5 space-y-1">
                    <li>
                        <b>AGREGADO</b> — el cliente no estaba en esta vuelta y se lo sumó a
                        mano. Es una visita más para hacer.
                    </li>
                    <li>
                        <b>EXTRA</b> — el cliente ya tenía su visita planificada en otra celda y
                        se le sumó otra. Son dos pasadas al mismo cliente en la misma vuelta.
                    </li>
                    <li>
                        <b>QUITADO</b> — se sacó de esta vuelta. Se ve en gris y no se puede
                        mover; vuelve con <b>Restaurar</b>.
                    </li>
                </ul>
            </div>

            <div>
                <p className="font-semibold text-slate-800">Lo que no se puede</p>
                <p className="mt-0.5">
                    Una visita <b>ya resuelta</b> (visitada o declarada no visitada) no se mueve
                    ni se quita: el hecho ya pasó y no se reescribe. Y una rotación{' '}
                    <b>cerrada</b> se ve pero no se edita.
                </p>
            </div>
        </div>
    )
}
