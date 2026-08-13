# Buscador unificado de alcance + módulo de Descuento

**Fecha:** 2026-08-13
**Estado:** diseño aprobado, listo para implementar
**Alcance:** app-planificacion (frontend) + api-vendedores (validador del backend)

Continúa a [`2026-08-13-detalle-dinamico-ofrecimiento-design.md`](2026-08-13-detalle-dinamico-ofrecimiento-design.md),
que dejó Descuento explícitamente sin diseñar "hasta que aparezca el primer caso real". Este
documento es ese caso: la evidencia de Cromo (*"AG bujes 5% descuento"*, *"5% en marca SKF en
amortiguadores"*) confirma que Descuento es un solo número (%), sin tramos, y que su `alcance`
casi siempre combina una marca **y** un rubro a la vez — a diferencia de Cupo, donde el alcance
suele estar vacío (oferta global).

## El problema

Cargar "AG bujes 5% descuento" hoy exige, dentro de `AlcancePicker`: abrir el panel colapsado,
elegir la pestaña Marca, buscar "AG", tocarlo, cambiar a la pestaña Rubro, buscar "Bujes",
tocarlo. Dos búsquedas separadas y un cambio de pestaña en el medio, para algo que el vendedor
dice en una sola frase.

Se evaluó (y se descartó) modelar esto como una relación jerárquica —marca con rubros
"adentro", o rubro con marcas "adentro"— porque introduce dos formas válidas de representar el
mismo hecho (empezar por la marca o por el rubro), reabriendo el problema original del proyecto:
sin una forma canónica única, el `GROUP BY` deja de ser confiable. El modelo ya vigente
(`accion` + `alcance` como **conjunto sin orden** + `detalle`) no tiene ese problema: no importa
en qué orden se agreguen marca y rubro al alcance, el resultado es el mismo conjunto. Lo único
que había que arreglar era la fricción de cargarlo.

## La decisión

**`AlcanceBuscador` (nuevo):** un buscador único que mezcla `marcas` y `rubros` en una sola lista,
con un tag chico ("Marca"/"Rubro") por resultado — sin pestañas. `AlcancePicker` lo usa en vez de
`CatalogoPicker` + el selector de pestañas que tiene hoy. `CatalogoPicker` no se toca: lo siguen
usando el picker principal (Rubro/Marca/Acción) y el campo Marca del wizard de motivos, ninguno de
los dos necesita mezclar catálogos.

**Módulo de Descuento (mirror de Cupo, mucho más simple):** un solo campo numérico, "% de
descuento" — sin tramos, sin lista. Se registra en `accionDetalle/registro.ts` con la clave
`DESCUENTO`, y su validador espejo en el backend con la misma clave.

### Por qué no un enfoque distinto

- **Generalizar `CatalogoPicker`** para aceptar items ya taggeados y un catálogo combinado desde
  afuera: se descartó porque es un componente compartido por tres pantallas, y las otras dos no
  necesitan mezclar catálogos — cualquier cambio ahí arriesga romper casos que no tienen nada que
  ver con este.
- **Mantener pestañas pero no resetear la búsqueda al cambiar**: se descartó por ser una mejora
  menor que sigue exigiendo el toque de cambiar de pestaña — no ataca la causa real de la
  fricción.

## Diseño técnico

### `AlcanceBuscador.tsx` (nuevo)

```tsx
interface AlcanceBuscadorProps {
    marcas: ICatalogoItem[]
    rubros: ICatalogoItem[]
    marcasLoading?: boolean
    onSelect: (destino: { tipo: TipoAlcance; codigo: string; descripcion: string }) => void
}
```

Combina `marcas` (primero) y `rubros` (después) en una lista con su `tipo` adjunto, filtra con el
mismo criterio de `normalizar` (sin acentos/mayúsculas) que ya usa `CatalogoPicker`, tope de 50
resultados igual que el resto de los pickers del proyecto. Cada fila: nombre + tag chico de tipo.
Sin estado de selección propio — solo dispara `onSelect`; quien decide agregar/sacar es
`AlcancePicker`, vía `toggleAlcance` (ya existe, ya maneja el conjunto por `tipo:codigo`).

### `AlcancePicker.tsx` (modificado)

Se elimina el estado `tipo` y el bloque de pestañas Marca/Rubro. `AlcanceBuscador` reemplaza al
`CatalogoPicker` que había adentro. El resumen del botón (`resumenAlcance`) y los chips de
destinos elegidos no cambian — ya son agnósticos de tipo.

### Módulo de Descuento

`src/components/propuesta/accionDetalle/descuento.tsx`, mismo patrón que `cupo.tsx`:

```ts
interface IDescuentoDetalle {
    pct: number
}
```

- `EditorDescuento`: un input numérico + "%", mismo estilo visual que el campo `pctDiferencia`
  del wizard de motivos (`ResolucionOfrecimiento.tsx`).
- `resumenDescuento`: `"5% descuento"`.
- `esValidoDescuento`: `pct > 0`.

Se agrega `DESCUENTO: moduloDescuento` a `registroDetalleAccion` en `accionDetalle/registro.ts`.

### Backend (`api-vendedores`)

`validarDetalleDescuento` en `accionDetalleValidators.ts`: valida forma completa (`pct` numérico
y positivo), mismo criterio de "no confiar en el cliente" que `validarDetalleCupo`. Se agrega
`DESCUENTO: validarDetalleDescuento` al registro existente — sin tocar `ofrecimientoValidation.ts`
(el enganche por código ya está genérico desde el spec anterior).

## Testing

- `AlcanceBuscador.test.tsx`: mezcla marca+rubro en una sola búsqueda, tag correcto por fila,
  `onSelect` dispara con el `tipo` correcto según de qué catálogo salió el resultado, respeta el
  tope de 50, estado de carga mientras `marcasLoading`.
- `AlcancePicker.test.tsx` (se ajusta, mismos casos, sin el paso de elegir pestaña): elegir una
  marca la agrega; elegir una segunda marca no reemplaza a la primera; volver a tocar un destino
  elegido lo saca; el resumen sigue mostrando lo elegido.
- `descuento.test.tsx`: mismo patrón que `cupo.test.tsx` — `esValidoDescuento` (rechaza
  `undefined`, rechaza `pct` 0/negativo, acepta positivo), `resumenDescuento`, `EditorDescuento`
  dispara `onChange` con el valor cargado.
- Backend: `accionDetalleValidators.spec.ts` ampliado con casos de `DESCUENTO` (acepta `pct`
  positivo, rechaza `pct` no numérico o negativo, rechaza objeto sin `pct`); `ofrecimientoValidation.spec.ts`
  con alta de `DESCUENTO` válido/inválido (mismo patrón que ya existe para `CUPO`).

## Fuera de alcance

- Cualquier otro tipo de acción (Promo, Cobranza) — se diseñan cuando aparezca su primer caso
  real, mismo criterio que ya se usó para Cupo y Descuento.
- Cambiar si el panel de "Acotar a…" arranca colapsado o abierto — sigue colapsado por defecto,
  para no requerir que el catálogo de acciones declare "esta acción necesita alcance", que ya se
  decidió no construir.
- Cualquier forma de anidamiento marca-contiene-rubro o rubro-contiene-marca, y cualquier lógica
  de que resolver una fila "cubra" o derive el estado de otra — evaluado y descartado
  explícitamente en este documento (ver "El problema").
