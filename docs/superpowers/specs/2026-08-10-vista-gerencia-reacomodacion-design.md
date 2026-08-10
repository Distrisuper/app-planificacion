# Vista de gerencia: reacomodación de la ruta

Fecha: 2026-08-10

Depende de `2026-08-10-plan-rotacion-editable-design.md`, que define el plan editable
(`pl_rotacion_cliente`) y la operación de reacomodar. **Este spec no agrega ningún mecanismo nuevo de
movimiento**: agrega quién lo usa, en lote, y con qué rastro.

## Problema

El caso que originó esto: el vendedor tenía su ruta planificada, y el jefe de área hace un viaje
excepcional porque necesita hablar con unos clientes urgente. Para eso hay que mover el día de visita
de esos clientes — a veces uno, a veces un día completo, a veces intercambiando un día de una zona
por el de otra.

Hoy eso se hace **sobre un Excel**, y de ahí salen tres problemas:

- **No hay rastro.** Nadie sabe quién movió qué ni cuándo, así que no se puede distinguir una
  excepción de un error.
- **No vuelve solo.** Si se movió "solo por esta vez", alguien tiene que acordarse de deshacerlo. Si
  se olvida, la ruta queda permanentemente mal y nadie se entera.
- **No llega rápido.** El vendedor ve la ruta que se cargó al insumo, con la latencia de ese
  circuito.

## Qué resuelve, y qué explícitamente no

**Resuelve:** una pantalla para que gerencia reacomode la rotación abierta de un vendedor —de a uno,
por día completo, o intercambiando días— con auditoría y con un reporte que delate cuando una
"excepción" ya es en realidad un cambio de ruta permanente.

**No resuelve, y es a propósito:** editar el template. `visit` sigue viniendo de Flexxus / warehouse y
**nunca se escribe**. Un cambio de ruta definitivo se hace en el origen y entra en la próxima
materialización. Lo de acá vale para la rotación en curso.

Esa asimetría es la decisión de fondo: **Flexxus es el template, nosotros somos las excepciones.** No
son dos fuentes de verdad compitiendo, es una base y una capa declarada encima con alcance acotado.

## El mecanismo ya existe

Reacomodar es `UPDATE pl_rotacion_cliente SET semana, dia`. Todo lo que pide este spec se expresa con
eso:

| lo que pide gerencia | qué es |
|---|---|
| mover un cliente a otro día | 1 update |
| mover un día completo a otro día | N updates |
| traer el martes de la zona 4 al jueves de la 2 | N updates |
| intercambiar el miércoles de la 2 con el martes de la 4 | dos conjuntos de updates opuestos |

Las reglas del spec 1 se aplican sin cambios: **una fila con resolución no se mueve** (incluye la
visita en curso, que ya tiene su fila en `pl_resolucion`), y el destino tiene que ser una semana de
la rotación.

### El intercambio es seguro porque es un intercambio

Sacar clientes de una semana es el único movimiento capaz de inflar el cumplimiento. En un
intercambio nadie sale sin que otro ocupe su lugar: el trabajo se conserva y solo cambia de semana.
Y a nivel rotación —que es la unidad de medida— **el denominador no se mueve en absoluto**, porque
cada cliente sigue teniendo exactamente una fila.

De ahí la invariante que la UI tiene que respetar: **no existe "quitar de la ruta".** Todo movimiento
tiene destino. Si un cliente no hay que visitarlo, eso es una baja del padrón (Flexxus) o un "no
visité" del vendedor, no una edición de gerencia.

## Atomicidad

Un movimiento de lote es **una transacción**. Un intercambio a medio aplicar deja la ruta peor que
antes: clientes duplicados en un día y un día vacío. El endpoint recibe la lista completa de
movimientos y los aplica o falla entero.

Es la razón por la que no alcanza con llamar N veces al endpoint de a uno del spec 1.

## Auditoría

Toda reacomodación deja una fila. Es lo único que el Excel no puede hacer, y es la razón de fondo
para mudar esto a la app.

```sql
CREATE TABLE pl_reacomodacion (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  rotacion_cliente_id INT          NOT NULL,
  semana_antes        TINYINT      NOT NULL,
  dia_antes           TINYINT      NOT NULL,
  semana_despues      TINYINT      NOT NULL,
  dia_despues         TINYINT      NOT NULL,
  origen              VARCHAR(20)  NOT NULL,  -- 'vendedor' | 'gerencia'
  usuario             VARCHAR(100) NOT NULL,  -- quien lo hizo
  fecha               DATETIME     NOT NULL,
  -- Aviso al vendedor: NULL = todavia no lo vio. Ver "Que ve el vendedor".
  visto_en            DATETIME     NULL,

  INDEX idx_rotacion_cliente (rotacion_cliente_id),
  INDEX idx_fecha (fecha),
  FOREIGN KEY (rotacion_cliente_id) REFERENCES pl_rotacion_cliente (id)
);
```

**Se escribe también para los movimientos del vendedor** (`origen = 'vendedor'`), no solo los de
gerencia. Sin eso, la mitad de los movimientos son invisibles y el historial de una fila queda con
saltos inexplicables.

## El reporte de excepciones repetidas

Este es el guardrail que hace que el sistema no se degrade, y sin él la pantalla es un riesgo neto.

**El problema que previene:** como reacomodar acá es más rápido que corregir Flexxus —y lo va a ser—
alguien va a cargar la misma excepción todas las rotaciones. La ruta real cambió, pero el template
sigue diciendo lo viejo y nadie se enteró. En un año el template es ficción.

**Cómo se detecta:** un cliente al que se le aplicó **el mismo movimiento** (mismo
`semana_antes → semana_despues`) en N rotaciones consecutivas. Eso no es una excepción, es un cambio
de ruta que se está reintroduciendo a mano.

El reporte lista esos casos con el mensaje operativo: *"estos 12 clientes vienen con la misma
excepción hace 4 rotaciones — corregí el template en Flexxus"*. No bloquea nada.

`N` arranca en 3 y es un número de configuración, no una constante de negocio.

## Rotación no materializada

El viaje se planifica con anticipación, así que gerencia va a querer editar la rotación **antes** de
que el vendedor haya tocado nada. Y hay una ventana en la que no existe plan que editar: entre que la
rotación anterior se completó y la primera acción del vendedor en la nueva.

**Gerencia puede materializar.** Abrir la ficha de un vendedor sin rotación abierta la materializa
desde el template — es exactamente lo que iba a pasar igual, solo antes.

Consecuencia asumida: materializar temprano congela el template temprano, así que un cambio de slot
que entre a Flexxus después no va a estar en esa rotación. Las altas y bajas sí llegan, por el
sincronizador de padrón del spec 1. Y los cambios de slot son justamente lo que gerencia edita acá,
así que el hueco es chico.

## Alcance de la edición

- **Solo la rotación abierta.** Una rotación cerrada es historia y no se toca.
- **No se ofrece mover a una semana ya cerrada** de la rotación abierta. El modelo lo permite (es un
  `UPDATE` como cualquier otro) pero ese cliente no se recorrería hasta la próxima rotación, así que
  sería una acción sin efecto visible. La UI la esconde; el backend no necesita prohibirla.
- **Las filas con resolución se muestran, no se editan**, y con el motivo a la vista. Es información
  que gerencia necesita para decidir: no tiene sentido planificar un viaje sobre un cliente que ya
  fue visitado esta rotación.

## La pantalla

Vive en este repo, junto a las pantallas de analítica que ya existen (`AnaliticaPage`,
`AnaliticaVendedorPage`, `AnaliticaActividadPage`) y reusa `ProtectedRoute permitirRol` y
`SinPermisosPage`.

**Son ~200 filas por vendedor** (5 semanas × ~40 clientes), así que una grilla plana no sirve: la
vista es **semana × día**, con el conteo por celda y los clientes dentro. Es la misma forma mental que
ya tiene la agenda del vendedor, lo que evita inventar un modelo visual nuevo.

Interacción mínima:

1. Elegir vendedor.
2. Ver su rotación abierta como matriz semana × día, con el estado de cada cliente (pendiente /
   visitado / no visité) y las excepciones ya aplicadas marcadas.
3. Seleccionar clientes —uno, varios, o un día entero— y elegir destino (semana, día).
4. Confirmar: se muestra el resumen de movimientos antes de aplicar, porque en lote es fácil errarle.

**Desktop-first**, al contrario del resto de esta app. Es una pantalla de escritorio: nadie planifica
un viaje de 12 clientes desde el teléfono.

## Qué ve el vendedor

No hace falta sincronizar nada: su agenda lee `pl_rotacion_cliente` en vivo, así que un movimiento de
gerencia aparece en el siguiente fetch. Lo que sí hace falta es que **se entere**.

Las reacomodaciones con `origen = 'gerencia'` y `visto_en IS NULL` de su rotación abierta alimentan un
aviso con `useNotificacion` (*"Gerencia movió 12 clientes a tu jueves"*), con acceso a la lista.
Verlo setea `visto_en`.

Es informativo y no bloqueante: la decisión la tomó el área y el vendedor no la puede rechazar. Pero
no se le cambia la ruta en silencio.

## Ejemplo: el intercambio del viaje del jefe

Rotación 7 del vendedor `V 2`. El jefe necesita el martes de la zona 4 el jueves de esta semana
(semana 2), y a cambio los clientes del jueves de la 2 pasan al martes de la 4.

`pl_rotacion_cliente` antes:

| id | cliente | semana | dia |
|---|---|---|---|
| 112 | 7750 | 4 | 2 |
| 113 | 5120 | 4 | 2 |
| 120 | 6836 | 2 | 4 |
| 121 | 9301 | 2 | 4 |

Una transacción, cuatro updates. Después:

| id | cliente | semana | dia | |
|---|---|---|---|---|
| 112 | 7750 | **2** | **4** | entra a la semana en curso |
| 113 | 5120 | **2** | **4** | |
| 120 | 6836 | **4** | **2** | sale, con destino |
| 121 | 9301 | **4** | **2** | |

`pl_reacomodacion`:

| id | rot_cli | s_antes | d_antes | s_desp | d_desp | origen | usuario | fecha |
|---|---|---|---|---|---|---|---|---|
| 301 | 112 | 4 | 2 | 2 | 4 | gerencia | jperez | 2026-08-06 17:02 |
| 302 | 113 | 4 | 2 | 2 | 4 | gerencia | jperez | 2026-08-06 17:02 |
| 303 | 120 | 2 | 4 | 4 | 2 | gerencia | jperez | 2026-08-06 17:02 |
| 304 | 121 | 2 | 4 | 4 | 2 | gerencia | jperez | 2026-08-06 17:02 |

El denominador de la rotación 7 **no cambió**: siguen siendo las mismas filas. Cambió el desglose
semanal, y cuando la rotación cierre el total es el mismo. Y si el jueves siguiente `jperez` vuelve a
hacer el mismo movimiento en la rotación 8, y otra vez en la 9, el reporte lo levanta.

## Cambios de API

- **`POST /planificacion/rotacion/:id/reacomodar-lote`** (nuevo). Recibe la lista de movimientos
  `[{ rotacionClienteId, semana, dia }]` y los aplica en **una transacción**, escribiendo
  `pl_reacomodacion` por cada uno. Rechaza el lote entero si alguna fila tiene resolución.
- **`GET /planificacion/rotacion/vendedor/:codigo`** (nuevo). La rotación abierta del vendedor con sus
  filas, el estado de cada una y las reacomodaciones aplicadas. **Materializa si no hay rotación
  abierta.**
- **`GET /planificacion/reacomodaciones/repetidas`** (nuevo). El reporte, parametrizado por `N`.
- **`GET /planificacion/reacomodaciones/pendientes-de-ver`** (nuevo, para el vendedor). Las de origen
  gerencia con `visto_en IS NULL` de su rotación abierta; un `POST` las marca vistas.

## Decisiones que necesitan tu respuesta

Estas tres las dejo abiertas porque no las puedo resolver desde el código:

1. **¿Qué rol edita?** Hoy existe `esRolAnalitica`, que es de **lectura**. Editar la ruta de un
   vendedor es bastante más sensible que ver un reporte, así que mi recomendación es un permiso
   propio en vez de reusar ese. Pero depende de cómo estén armados los roles del lado de auth.
2. **¿Qué vendedores ve cada usuario de gerencia?** Todos, o los de su zona. Lo natural es reusar el
   alcance que ya tienen las pantallas de analítica — **hay que verificar cuál es**, no lo doy por
   sabido.
3. **¿`N` del reporte de repetidas?** Propongo 3 rotaciones consecutivas. Con 2 va a haber falsos
   positivos (dos viajes seguidos a la misma zona es plausible); con 5 te enterás quince semanas
   tarde.

## Fuera de alcance

- **Escribir el template.** Nunca, por diseño.
- **Editar rotaciones cerradas.**
- **Quitar clientes de la ruta sin destino.** No existe la operación.
- **Deshacer un lote.** Se corrige con otro movimiento, que queda auditado igual. Un "undo" real
  necesitaría distinguir "me equivoqué" de "cambió la decisión", y esa diferencia no está en los
  datos.
- **Aviso push al vendedor.** El aviso es in-app, cuando abre. Si el viaje es de mañana temprano, el
  circuito sigue siendo el teléfono del jefe.
- **Planificar sobre la rotación siguiente.** Solo la abierta; materializarla temprano es la vía.

## Riesgos

- **"Excepcional" se vuelve el mecanismo normal.** Es el riesgo principal y el reporte de repetidas es
  la única defensa. Si el reporte no se construye o nadie lo mira, el template se degrada sin ruido.
- **Gerencia y el vendedor moviendo el mismo cliente a la vez.** El último gana y los dos movimientos
  quedan auditados. No hace falta locking: la operación es un `UPDATE` de dos columnas y el peor caso
  es que el cliente termine en el día que eligió el segundo.
- **Materializar desde gerencia adelanta el congelamiento del template.** Ver "Rotación no
  materializada".
- **El lote grande y el `UNIQUE uq_rotacion_cliente`.** Un intercambio no lo viola nunca (los
  clientes son distintos), pero un lote armado a mano con el mismo cliente dos veces sí. Hay que
  validarlo antes de abrir la transacción para no depender del error de la base.

## Testing

- Un lote que incluye una fila con resolución **falla entero** y no aplica ninguno de los otros
  movimientos.
- Un intercambio de dos conjuntos deja el denominador de la rotación intacto y el desglose semanal
  cruzado.
- Cada movimiento escribe exactamente una fila en `pl_reacomodacion`, con el antes y el después.
- Los movimientos del vendedor también quedan auditados, con `origen = 'vendedor'`.
- Abrir la ficha de un vendedor sin rotación abierta la materializa; abrirla dos veces no materializa
  dos.
- El reporte de repetidas levanta un cliente con el mismo `semana_antes → semana_despues` en N
  rotaciones consecutivas, y **no** levanta uno movido N veces a destinos distintos.
- El aviso al vendedor solo trae reacomodaciones de origen gerencia sin ver, y verlas las marca.
- Un lote con el mismo `rotacionClienteId` repetido se rechaza antes de abrir la transacción.
