# Relevamiento "Datos del comercio": la ficha del cliente se completa antes de abrir la visita

Fecha: 2026-09-22 (reemplaza la versión inconclusa del mismo día, que sólo cubría el front)
Estado: diseño aprobado. Front implementado con persistencia mock en
`feat/relevamiento-datos-comercio`; backend y edición posterior por implementar.
Repos afectados: `app-planificacion` (front) y `api-vendedores` (dominio `planificacion`).

## 1. El problema

De cada cliente sabemos lo que el warehouse trae de la operación: qué compra, cuánto, con qué
descuentos. No sabemos **qué clase de comercio es**: si es una gomería o un rulemanero, si lo
atiende una persona o quince, si factura 8 millones o 200.

Sin eso, dos cosas quedan cojas:

- **La propuesta comercial** compara al cliente contra el promedio de la zona, pero la zona
  mezcla un lubricentro de dos personas con un concesionario. El promedio contra el que se mide
  no es el de sus pares.
- **La segmentación** no existe. No se puede responder "cómo nos va en los talleres de frenos
  de más de 50M", porque no hay con qué agrupar.

El único que tiene ese dato es el vendedor, y lo tiene **parado adentro del local**. Por eso el
pedido es un paso extra, obligatorio, antes de iniciar la visita: se releva a **toda la cartera
por única vez**, y la ficha queda disponible para cuando se la necesite.

Hoy son tres datos. El diseño asume que van a aparecer más.

## 2. Dónde termina el dato: los campos dinámicos del ERP

El maestro de clientes vive en el ERP y se expone por **client-service**
(`https://client.distrisuper.com/client/v1/:codigoParticular`). Cada cliente trae un array
`camposDinamicos` de pares `{ codigo, valor }`: es el mecanismo del ERP para extender la ficha
sin tocar columnas. El warehouse ya lee dos de esos campos (`sync-dagster`,
`int_clients_enriched.sql`): el **59** (suscriptor, `valor='2'`) y el **99** (vendedores
permitidos, lista separada por coma).

**La decisión de negocio es que los datos del comercio terminen siendo campos dinámicos del
ERP.** Hoy no todos existen con su código. Este sistema **no es el dueño de esa
sincronización**, pero sí deja el dato con la forma exacta que ese sync necesita, y lo empuja
cuando puede (§5).

Hay precedente de escritura al maestro **desde este mismo dominio**: `VisitasService.iniciar`
corrige la coordenada del cliente con un `PATCH` a client-service vía
`ClientServiceCoordPatchService`, best-effort, después de que la visita ya quedó creada — el
mismo contrato que usa Lupa en `Visitas.jsx` → `updateClientsCoordinates`. Ese servicio es el
molde del push de la ficha: mismo endpoint, mismo cuerpo JSON:API, mismas guardas (`!esAlta`,
`!esVendedorDePrueba`), misma regla de nunca lanzar.

## 3. La decisión de fondo: un gate genérico, un formulario concreto

Son dos piezas separadas, y se separan desde el día uno porque van a evolucionar distinto.

| | qué es | dónde vive | cuándo cambia |
|---|---|---|---|
| **El gate** | "¿a este cliente le falta algún dato obligatorio de la ficha?" | `VisitaFlow` + `relevamientoPendiente` | nunca: lee `cliente.ficha.pendientes` |
| **El catálogo** | qué campos existen, cuáles son obligatorios, cuál es su código en el ERP | `pl_ficha_campo` | cuando se suma un dato |
| **El formulario** | los controles concretos | `PerfilComercioSheet` | cuando se suma un dato |

Sumar el cuarto dato es una fila en `pl_ficha_campo` más un control en el sheet. El gate no se
toca: el backend calcula qué le falta a cada cliente contra el catálogo, y la ficha reaparece
en todos los clientes pidiendo **sólo ese campo**.

**El formulario NO es data-driven.** Los controles están escritos a mano en TSX. Con tres
campos, un motor con schema JSON es especulación cara: son tres tipos de control distintos
(chips multi, stepper numérico, segmented control ordinal) y el TSX es más corto y más legible
que la config que lo generaría. Lo que sí es data-driven es **qué campos se muestran** (los
pendientes) y **qué es obligatorio** (el catálogo). Cuando exista el tercer o cuarto dato y se
vea el patrón real, ahí se abstrae con evidencia.

## 4. Modelo de datos

Dos tablas nuevas en la base MySQL `planificacion` (conexión `sequelizeWritePlanificacion`),
prefijo `pl_`. **Nada en el warehouse**: eso crearía una dependencia con `sync-dagster`, y está
prohibido sin excepciones.

### 4.1 `pl_ficha_campo` — el catálogo

```sql
CREATE TABLE IF NOT EXISTS pl_ficha_campo (
  campo        VARCHAR(40)  PRIMARY KEY,   -- 'especialidad' | 'monomarca_marca' | 'personas' | 'facturacion'
  descripcion  VARCHAR(120) NOT NULL,
  obligatorio  TINYINT(1)   NOT NULL DEFAULT 1,
  multiple     TINYINT(1)   NOT NULL DEFAULT 0,  -- 1 = admite varias filas vigentes (especialidad)
  codigo_erp   INT          NULL,               -- código del campo dinámico en el ERP. NULL = todavía no existe allá
  orden        TINYINT      NOT NULL
);

INSERT IGNORE INTO pl_ficha_campo (campo, descripcion, obligatorio, multiple, codigo_erp, orden) VALUES
  ('especialidad',    'Especialidad del comercio',        1, 1, NULL, 1),
  ('monomarca_marca', 'Marca, si es monomarca',           0, 0, NULL, 2),
  ('personas',        'Personas que trabajan',            1, 0, NULL, 3),
  ('facturacion',     'Tramo de facturación mensual',     1, 0, NULL, 4);
```

Sembrado con `INSERT IGNORE`, idempotente, como `pl_motivo`. Los `codigo_erp` se cargan con un
`UPDATE` el día que el ERP los tenga; hasta entonces el push los saltea (§5).

**`monomarca_marca` es su propio campo, no obligatorio.** El formulario lo exige sólo cuando
la especialidad incluye `monomarca`, pero esa regla condicional vive en el front
(`faltantesPerfil`) y **no en el gate**: el gate sólo entiende "obligatorio sin valor vigente".
Si se modelara como detalle de la especialidad, el gate necesitaría conocer la semántica de un
valor puntual del catálogo, que es justo lo que no tiene que saber.

### 4.2 `pl_ficha_valor` — el dato declarado

```sql
CREATE TABLE IF NOT EXISTS pl_ficha_valor (
  id                        INT          AUTO_INCREMENT PRIMARY KEY,
  codigo_particular_cliente VARCHAR(50)  NOT NULL,
  campo                     VARCHAR(40)  NOT NULL,
  valor                     VARCHAR(100) NOT NULL,
  relevado_por              VARCHAR(50)  NOT NULL,   -- código de vendedor (o PRUEBA-<userId>)
  relevado_en               DATETIME     NOT NULL,
  reemplazado_en            DATETIME     NULL,       -- NULL = vigente
  sincronizado_en           DATETIME     NULL,       -- NULL = no llegó al ERP (todavía)
  INDEX idx_vigente (codigo_particular_cliente, campo, reemplazado_en),
  INDEX idx_sin_sincronizar (sincronizado_en, reemplazado_en),
  CONSTRAINT fk_fv_campo FOREIGN KEY (campo) REFERENCES pl_ficha_campo (campo)
);
```

- **Una fila por dato declarado, no una columna por dato.** Es la misma forma que
  `camposDinamicos` del ERP: el mapeo a `{ codigo, valor }` es directo, y agregar un campo no
  es un `ALTER`. Es también la forma que ya usa `pl_ofrecimiento_alcance` para los valores
  múltiples: una especialidad son N filas vigentes del mismo campo.
- **Keyed por `codigo_particular_cliente`, no por `rotacion_cliente_id`.** El perfil es del
  **comercio**, no de la visita ni de la rotación: sobrevive a las vueltas y no es un hecho de
  un momento. Colgarlo de `pl_resolucion` obligaría a buscar "la última visita que lo relevó"
  para saber si está cargado.
- **Vigente es `reemplazado_en IS NULL`.** Corregir un campo **cierra** las filas vigentes de
  ese campo (`UPDATE … SET reemplazado_en = NOW()`) e **inserta** las nuevas. El valor nunca se
  pisa: la historia (quién dijo qué, cuándo, y qué había antes) sale gratis, igual que
  `pl_reacomodacion` para el plan.
- **`valor` es `VARCHAR` con el formato del ERP desde el día uno.** Especialidad: el `codigo`
  del catálogo del front (`'frenos'`, `'gomeria'`…). Personas: el entero como texto (`'3'`).
  Facturación: el código **invertido** que vino del negocio (`'5'` = menor a 10M, `'1'` = mayor
  a 100M), que se respeta tal cual porque huele a código de ERP y no hay que traducir al
  analizar. Cuando el ERP fije los valores definitivos de un campo, la traducción se hace en
  una sola función del push, no en la tabla.
- **`sincronizado_en`** es lo que hace nombrable el hueco del ERP: "qué falta empujar" es
  `WHERE sincronizado_en IS NULL AND reemplazado_en IS NULL`. No se usa para nada del lado del
  vendedor.

**Analítica.** `GROUP BY` por especialidad es un join a `pl_ficha_valor` vigente con
`campo='especialidad'` (una fila por valor, así que un taller de frenos y embragues cuenta en
los dos grupos, que es lo correcto). Por tramo de facturación, igual con `campo='facturacion'`.
No se agrega ninguna vista ni tabla derivada hasta que alguien la pida.

## 5. Escritura, y el push al ERP

### 5.1 `PUT /planificacion/clientes/:codigoParticular/ficha`

Cuerpo: `{ valores: Record<campo, string[]> }` — sólo los campos que el vendedor cargó en esa
pantalla (en el gate, los pendientes; en la edición, los que tocó o todos). Validación:

- Cada `campo` existe en `pl_ficha_campo`; si no, `400 FICHA_CAMPO_DESCONOCIDO`.
- Un campo con `multiple = 0` recibe exactamente un valor; si no, `400 FICHA_VALOR_MULTIPLE`.
- Ningún valor vacío. Los valores admitidos por campo (catálogos de especialidad y tramos,
  rango 1–999 de personas) **se validan en el backend** también: hoy viven en
  `src/lib/relevamientos.ts` del front y se duplican en `fichaValidation.ts` del backend, con el
  mismo criterio que `motivoValidation` / `ofrecimientoValidation`. Un bundle viejo no puede
  meter basura.
- El cliente tiene que estar en la cartera del vendedor autenticado (`carteraDe`), o ser un
  alta suya. `403` si no.

En **una transacción**: por cada campo recibido, cerrar las filas vigentes de
`(cliente, campo)` e insertar las nuevas con `relevado_por` = vendedor resuelto por
`resolveSellerCode` y `relevado_en = NOW()`. Devuelve la ficha resultante con la misma forma
que viaja en la card (§6).

### 5.2 Push a client-service, best-effort

**Fuera de la transacción, después de confirmar.** Mismo orden que Cromo y que la corrección de
coordenadas: primero el hecho en nuestra tabla, después la notificación. Un client-service caído
es un dato demorado, no un dato perdido.

`FichaClientServicePushService.aplicar(codigoParticular)`:

1. Lee las filas vigentes del cliente cuyo campo tenga `codigo_erp IS NOT NULL`. Si no hay
   ninguna (hoy: siempre, hasta que se carguen los códigos), **no hace nada** y no loguea error.
2. Arma `camposDinamicos: [{ codigo, valor }]`. Un campo `multiple` viaja como un solo par con
   los valores unidos por coma, igual que el campo 99.
3. `PATCH ${clientServiceConfig.apiUrl}${codigoParticular}` con cuerpo JSON:API
   `{ data: { type: 'clients', id, attributes: { camposDinamicos } } }`, timeout de
   `clientServiceConfig.timeoutMs`. Es el molde de `ClientServiceCoordPatchService`, con otro
   `attributes`.
4. Si responde OK, marca `sincronizado_en = NOW()` en esas filas. Si falla, loguea y las deja
   en `NULL`. **Nunca lanza.**

Guardas, copiadas de la corrección de coordenadas:

- **`esVendedorDePrueba(vendedor)` → no se empuja.** Invariante del vendedor de prueba: sus
  datos nunca salen de `pl_*`. La ficha sí se guarda (el gate del tester se destraba), pero el
  ERP no se entera.
- **Alta (`ALTA-<id>`) → no se empuja.** Ese comercio no existe en client-service.

**Abierto, a propósito:** si el `PATCH` de client-service acepta `camposDinamicos` hoy, o sólo
`coordinates`. No se pudo verificar (el repo de client-service no está disponible). Mientras
`codigo_erp` sea `NULL` en todos los campos, el push no dispara ningún request, así que el
sistema es correcto sin esa respuesta. El día que se carguen códigos, hay que probarlo contra
el ambiente de client-service antes de habilitarlo en producción.

**Sin cola ni reintento.** Las filas con `sincronizado_en IS NULL` son la lista de pendientes;
quién y cuándo las reintenta se define cuando exista el sync del otro lado. No se implementa un
job especulativo.

## 6. Cómo sabe el front que ya se cargó

La card del cliente (`IVisitClientCard`) suma un campo:

```ts
ficha: {
    /** Campos obligatorios del catálogo sin valor vigente. Vacío = nada que pedir. */
    pendientes: string[]
    /** Valores vigentes por campo. Lo que precarga la edición posterior. */
    valores: Record<string, string[]>
}
```

Lo arma `AgendaService.enriquecer`, con **una** query batcheada por los códigos de la semana
(`FichaRepository.findVigentesPorClientes(codigos)`) más el catálogo, que se lee una vez. Es
gratis en el sentido del `LEFT JOIN` con la resolución: la agenda ya se está leyendo. Para las
altas la card la arma `cardDeAlta`, y se enriquece igual: su código sintético es una clave
válida.

En el front, `relevamientoPendiente` deja de ser el mock `return true`:

```ts
export function relevamientoPendiente(cliente: IVisitClientCard): boolean {
    return cliente.ficha.pendientes.length > 0
}
```

Y `PerfilComercioSheet` recibe `campos: string[]` y **dibuja sólo esos**. Con los tres
pendientes se ve como hoy; con uno solo, una pregunta y el botón.

**No hay endpoint de lectura nuevo.** La ficha viaja donde ya viaja el cliente. El `PUT`
devuelve la ficha actualizada y el front la escribe en la caché de la agenda
(`queryClient.setQueryData`) para que la card refleje el cambio sin refetch: si no, el `useRef`
`perfilListo` del gate y la card dirían cosas distintas hasta el próximo `staleTime`.

## 7. El gate: dónde corta, y por qué ahí

Los tres caminos de inicio que existen hoy —con mapa, sin coordenadas, y cliente nuevo (alta)—
terminan todos en `VisitaFlow.onIniciar`. **El gate se pone ahí y sólo ahí**: un único punto de
corte cubre los tres sin tocar ninguna de las tres pantallas.

```
tocar "Iniciar visita"  (ya pasó el gate de 100 m)
        │
        ▼
 ¿ficha.pendientes vacío?  ──sí──►  onIniciar()  →  POST visita  →  arranca el cronómetro
        │ no
        ▼
 PerfilComercioSheet  (bloqueante, sólo los campos pendientes)
        │ confirmar
        ▼
 PUT ficha  ──falla──►  error en el sheet, la visita NO arranca
        │ ok
        ▼
   onIniciar()  →  POST visita  →  arranca el cronómetro
```

**Corta ANTES del POST de la visita, no después.** Dos razones:

1. **El cronómetro no corre mientras se carga.** Si el POST saliera primero, los dos o tres
   minutos del formulario se le suman a la duración de la visita, que es justo lo que el
   semáforo de `estadoDuracion.ts` mide. Una visita de 4 minutos reales se vería como de 7.
2. **Abandonar no deja basura.** Si el vendedor cierra el sheet sin cargar, la visita **nunca
   existió**: no hay fila abierta en `pl_resolucion` esperando un cierre que no va a llegar.

**El `PUT` de la ficha va ANTES del POST de la visita, y lo condiciona.** Si la ficha no se
pudo guardar, no se abre la visita: el sheet muestra el error con "Volver a intentar" (mismo
patrón que `fallóPropuestaDirecta`) y el vendedor decide. Al revés —visita abierta, ficha
perdida— el gate se destrabaría sin que el dato exista, que es exactamente lo que el mock
hace hoy y lo que este spec viene a cerrar.

Corolario: al confirmar, `onIniciar` corre **entero y normal** — captura de GPS incluida, y con
ella el re-chequeo de los 100 m contra la coordenada definitiva. Si el vendedor carga el
formulario y se va caminando, el gate de distancia lo agarra igual.

## 8. Obligatorio duro, y se pide hasta que esté completo

Sin completar los campos pendientes **no se puede iniciar la visita**. No hay "ahora no".

La alternativa evaluada era postergar con reintento en la próxima visita. Se descartó: el dato
sólo se consigue con el vendedor adentro del local, y un botón de escape convierte el
relevamiento en algo que se completa el día que sobra tiempo, o sea nunca.

**La única salida es no iniciar.** Cerrar el sheet vuelve a la pantalla de atrás (el mapa, o la
propuesta) — no a la agenda, y no arranca la visita. No visitar siempre es una opción
declarable, así que nadie queda trabado.

**Se pide hasta que la ficha esté completa, y después nunca más.** No vence, no hay
confirmación periódica. La especialidad no cambia (una gomería no se vuelve rulemanera), y para
lo que sí cambia —personal y facturación— se prefiere un dato viejo a fricción repetida sobre
el mismo cliente: a la tercera vez el vendedor toca "confirmar" sin leer, y el dato queda igual
de viejo pero además parece fresco. Lo que sí vuelve a disparar el gate es **un campo nuevo en
el catálogo**: ahí reaparece en todos los clientes pidiendo sólo ese campo.

**También se pide en las visitas de alta.** Es donde más falta: del prospecto no se sabe nada,
y es el momento exacto en que se lo está conociendo. La visita de alta pasa por `onIniciar`,
así que el gate la cubre sin código extra.

**Con el GPS roto, ese día no se releva.** Consecuencia del corte elegido: el formulario aparece
recién cuando el vendedor pasó el gate de los 100 m, y un vendedor sin fix nunca lo ve porque
"Iniciar visita" queda deshabilitado. Se detectó probando (el mapa mostraba "Estás a 400712 m
del cliente"). **Decisión: se deja así.** Moverlo antes del mapa perdería la garantía de que se
completa estando en el local, que es todo el valor del dato; y el cliente sigue con
`pendientes` no vacío, así que se pide en la próxima visita. El costo es un día de demora en un
caso raro.

## 9. La pantalla

Un solo `BottomSheet` scrolleable (`altura="hasta-completa"`) con las preguntas pendientes una
debajo de la otra y el botón fijo al pie. No un wizard: son tres toques y un número, y partirlo
en pantallas esconde cuánto falta, que es justo lo que el vendedor quiere saber cuando lo
interrumpen.

### 9.1 Los tres controles, y por qué cada uno es distinto

| pregunta | control | cardinalidad |
|---|---|---|
| Especialidad | chips redondeados en `flex-wrap`, navy relleno con ✓ | **varias** |
| Personas que trabajan | stepper `− [n] +`, número tipeable | un entero |
| Facturación mensual | segmented control de 5 segmentos unidos | **una** |

**Las formas distintas dicen la regla.** Chips sueltos = elegí las que quieras; una pieza
segmentada = elegí uno. La primera versión usaba chips para especialidad y filas con radio para
facturación, y los dos grupos se leían como igual de "elegibles".

**Especialidad** — 15 opciones, orden dictado por el negocio (las más frecuentes arriba, no
alfabético). *Monomarca* abre "¿De qué marca?" con `autoFocus`; destildarla borra el texto.
Es **texto libre y no el `brandCatalog`**: el catálogo cubre las marcas que nosotros vendemos, y
acá la pregunta es de qué marca es el taller. Se acepta que "Bosch" y "bosh" no agrupen.

**Personas** — número exacto, no rangos. El stepper existe porque era el único control que
abría teclado, y en un bottom sheet el teclado tapa el botón del pie. Desde vacío, el primer `+`
va a **1**: nadie tiene 0 personas trabajando.

**Facturación** — los códigos vienen **invertidos** del negocio (`5` = menor a 10M, `1` = mayor
a 100M) y se respetan. En pantalla van de **menor a mayor**: leídos descendentes dejan de
parecer una escala. El segmento muestra la etiqueta corta (`+30M`) y lleva el texto completo
como `aria-label`. En filas con radio esta sección costaba ~240px y la quinta opción quedaba
abajo del scroll; en una fila cuesta ~44px. **No volver a filas.**

### 9.2 El botón

Gris `#F1F4F9` con texto navy mientras falte algo, verde cuando está completo. Mismo criterio
que el cierre de visita: el verde al 40% del `disabled:` se lee como un CTA roto. Necesita
`disabled:opacity-100` explícito.

El label nombra el faltante cuando es uno (`Falta la facturación`) y los cuenta cuando son
varios (`Faltan 3 datos`). Completo, en el gate dice `Iniciar visita` —el mismo verbo del botón
que el vendedor tocó para llegar hasta acá— y en la edición dice `Guardar`. Mientras el `PUT`
está en vuelo, deshabilitado con spinner.

### 9.3 Vocabulario

En la UI es **"Datos del comercio"**. Nunca "relevamiento", "ficha", "perfil", "encuesta" ni
"campos dinámicos": el vendedor no ve las estructuras del sistema. El texto de apoyo en el gate
es una sola línea —*"Se carga una sola vez, antes de arrancar"*— y está para justificar la
interrupción.

## 10. Edición posterior

Se decidió que el dato **se tiene que poder corregir**. La puerta es el **área de acciones del
header de `VisitaSheet`**, junto al chip de descuentos: un chip **"Datos del comercio"** que
abre el mismo `PerfilComercioSheet` con **todos** los campos del catálogo, precargados desde
`cliente.ficha.valores`, y botón `Guardar`. Confirmar hace el mismo `PUT` (todos los campos
que muestra), actualiza la caché y cierra. Nada más: no arranca ni toca la visita.

Se muestra con la visita abierta **y** cerrada (es consulta y corrección, no carga de rubros),
y **sólo si `ficha.pendientes` está vacío**: si falta algo, el gate ya lo va a pedir al iniciar,
y dos puertas para lo mismo confunden. No aparece en `VisitaSheet` de otro cliente que no sea
el de la visita en curso: ahí el sheet es de consulta de propuesta.

No hay `⋯` en el header de `VisitaSheet`: las acciones son chips inline (`ChipDescuentos`,
`No visité`). El nuevo chip sigue esa forma. Va **entre** el de descuentos y el de "No visité":
la salida negativa queda al borde, como hoy.

## 11. Implementación

### 11.1 api-vendedores

| archivo | qué tiene |
|---|---|
| `docs/db-notes/planificacion-ficha-cliente.sql` | DDL de §4 + seed. Se agrega a `planificacion-ciclo-tables.sql` consolidado |
| `src/models/planificacion/FichaCampo.ts`, `FichaValor.ts` | modelos Sequelize |
| `src/repositories/FichaRepository.ts` | `findVigentesPorClientes(codigos)`, `reemplazar(cliente, campo, valores, vendedor, tx)`, `marcarSincronizadas(ids)` |
| `src/services/planificacion/fichaValidation.ts` | catálogos de valores y reglas de §5.1 |
| `src/services/planificacion/FichaService.ts` | `actualizar(user, codigo, valores)`: cartera, transacción, push |
| `src/services/clientService/FichaClientServicePushService.ts` | §5.2, molde de `ClientServiceCoordPatchService` |
| `src/services/planificacion/AgendaService.ts` | `enriquecer` suma `ficha`; `cardDeAlta` idem |
| `src/routes/planificacion.ts`, `planificacionController.ts`, `docs/planificacion.yaml` | el `PUT` |
| `src/types/planificacion.ts` | `IFichaCliente` en `IVisitClientCard` |

Tests: `fichaValidation.spec`, `FichaService.spec` (transacción cierra e inserta; el push no
corre para prueba ni alta; el push no dispara sin `codigo_erp`), `FichaRepository.spec`
(vigentes por cliente con historia), `AgendaService.spec` (pendientes calculados contra el
catálogo; cliente completo → `[]`).

### 11.2 app-planificacion

| archivo | qué cambia |
|---|---|
| `src/types/planificacion.ts` | `ficha` en `IVisitClientCard` |
| `src/lib/relevamientos.ts` | `relevamientoPendiente(cliente)` lee `ficha.pendientes`; `aValoresFicha(borrador, campos)` arma el cuerpo del `PUT`; `deValoresFicha(valores)` precarga el borrador |
| `src/hooks/useFicha.ts` | `useActualizarFicha()` (mutation + `setQueryData` sobre la agenda) |
| `src/components/relevamiento/PerfilComercioSheet.tsx` | props `campos`, `valoresIniciales`, `modo: 'gate' \| 'edicion'`; estados en vuelo / error |
| `src/components/VisitaFlow.tsx` | el gate llama al `PUT` antes de `onIniciar`; se va el `console.info` y el `useRef perfilListo` (la caché actualizada lo reemplaza) |
| `src/components/VisitaSheet.tsx` | chip "Datos del comercio" en `acciones` |

Tests que hoy faltan y ahora se pueden escribir, porque `pendientes: []` es el caso normal:
en `VisitaFlow.test.tsx`, con pendientes → intercepta antes del POST en los tres caminos;
confirmar → `PUT` y después POST, en ese orden; `PUT` falla → no hay POST; cerrar sin cargar →
no hay POST ni `PUT`; sin pendientes → no aparece. Los mocks `relevamientoPendiente: () =>
false` de `VisitaFlow.test` y `AgendaSemanaPage.test` se reemplazan por `ficha: { pendientes:
[], valores: {} }` en las fixtures de cliente.

### 11.3 Orden

1. Backend: DDL + repo + servicio + `PUT` + `ficha` en la card, con el push implementado pero
   inerte (todos los `codigo_erp` en `NULL`).
2. Front: reemplazar el mock, el gate real, la edición posterior, los tests del gate.
3. Cuando el negocio entregue los códigos: `UPDATE pl_ficha_campo SET codigo_erp = …`, probar el
   `PATCH` contra client-service, y recién ahí queda prendido.

## 12. Fuera de alcance, con razón

- **Reintento del push.** Las filas con `sincronizado_en IS NULL` son la lista. Quién las
  reintenta se decide con el dueño del sync.
- **Religar la ficha de un alta** al código real cuando el comercio se da de alta como cliente.
  Hoy queda bajo `ALTA-<id>`; el día que exista "convertir alta en cliente" (no existe), ese
  flujo la migra.
- **Vencimiento / confirmación periódica.** Descartado en §8.
- **Traer los datos del comercio desde el ERP hacia acá** (el sync inverso, para clientes que
  ya tengan los campos cargados por otra área). Cuando existan los códigos, se evalúa leerlos
  del warehouse para marcar como completos a los que ya vengan cargados. Hasta entonces, la
  fuente es el vendedor.
