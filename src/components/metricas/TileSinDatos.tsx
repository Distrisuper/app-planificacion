import TileMarco from './TileMarco'
interface Props { titulo: string; ayuda: string; mensaje?: string; ancho?: 'simple' | 'doble' }
export default function TileSinDatos({ titulo, ayuda, mensaje = 'Sin datos', ancho }: Props) {
    return (
        <TileMarco titulo={titulo} ayuda={ayuda} ancho={ancho}>
            <p className="text-[13px] text-dsmuted">{mensaje}</p>
        </TileMarco>
    )
}
