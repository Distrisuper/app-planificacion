interface Props { ancho?: 'simple' | 'doble' }
export default function TileEsqueleto({ ancho = 'simple' }: Props) {
    return (
        <div aria-busy="true" className={`animate-pulse rounded-2xl bg-white px-3.5 py-3 ${ancho === 'doble' ? 'col-span-2' : ''}`}>
            <div className="h-3 w-1/2 rounded bg-[#E7E9F0]" />
            <div className="mt-3 h-7 w-1/3 rounded bg-[#E7E9F0]" />
            <div className="mt-3 h-1.5 w-full rounded bg-[#E7E9F0]" />
        </div>
    )
}
