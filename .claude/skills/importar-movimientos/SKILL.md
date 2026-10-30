---
name: importar-movimientos
description: Extrae movimientos financieros desde capturas en el inbox configurado y los importa vía CLI. Usar cuando el usuario pida "importar movimientos", "procesar capturas/imágenes", o mencione el inbox de mitarasca.
---

Requisitos: un agente con visión (para leer las capturas) y la CLI `mitarasca` en el PATH. Desde
un clon del repo, sin instalarla: `alias mitarasca="bun <ruta-del-repo>/packages/cli/src/index.ts"`.
Los conceptos de `prompt-extraccion.md` tienen que existir como tags en la DB.

0. Leer la config con `mitarasca config get --json` para obtener `paths.inbox`, `paths.imports`,
   `paths.processed` y `paths.backups`. Todas las rutas de este skill salen de ahí — no
   hardcodear `data/*`.
   Crear los directorios que falten (`mkdir -p`): `imagenes-nuevas` falla si `<paths.inbox>` no
   existe. Si `DB_PATH` está seteado, esa es la DB efectiva, no el `db_path` de la config.
1. Hashear las imágenes de `<paths.inbox>` y separar las ya procesadas. El chequeo es contra
   `movements.source_image_hash` en la DB:
   ```bash
   mitarasca imagenes-nuevas --dir <paths.inbox> --json
   ```
   Si no quedan imágenes nuevas, avisar y terminar.
2. Leer `prompt-extraccion.md` de este skill y aplicarlo **sólo sobre las imágenes nuevas** para
   producir el array JSON de movimientos. Cada objeto debe incluir el `source_image_hash` de la
   imagen de la que salió — el paso 1 lo devuelve por archivo. Regla clave (ver punto 2 de ese
   archivo): todos los "Rendimientos" detectados en las imágenes se consolidan en **un único
   registro** sumando sus montos, no uno por día.
   El prompt empieza con una fecha piso `{ultima_fecha_importada}`: reemplazarla solo si el
   usuario indica una; si no, borrar esa línea. No usar `ultimo-movimiento` para calcularla:
   devuelve la fecha máxima de la DB, que incluye cuotas futuras.
3. Guardar el resultado en `<paths.imports>/<YYYYMMDD>_imports.json`.
4. Validar con dry-run:
   ```bash
   mitarasca movimiento import <paths.imports>/<archivo> --dry-run
   ```
   El dry-run reporta tres cosas: qué se importaría, qué movimientos invisibles se omiten (reglas
   en `invisible_rules`), y qué posibles duplicados exactos detectó. **Los duplicados no se
   descartan**: dos movimientos idénticos pueden ser dos operaciones reales. Mostrarle el reporte
   al usuario. Los nombres de tag no distinguen mayúsculas/minúsculas al resolverse
   (`resolveTagsForCreate` normaliza con `toLowerCase()`), pero sí deben coincidir exactamente en
   el resto del texto. Si reporta `Tags no encontrados`, esos tags se ignoran en el import:
   ofrecer crearlos en la web o cambiar el concepto antes de seguir.
5. Confirmar con el usuario antes del import real (nunca importar sin dry-run previo).
6. Backup de la DB:
   ```bash
   cp <db_path> "<paths.backups>/$(date +%Y%m%d)_mitarasca.db"
   ```
   (mismo formato de nombre que los backups existentes). Con `DB_PATH` seteado, copiar `$DB_PATH`.
7. Correr el mismo comando sin `--dry-run`. El CLI puebla `imported_at` y `source_image_hash`, y
   registra los findings de nivel exacto.
8. Correr la verificación de reflejos sobre el mes importado:
   ```bash
   mitarasca duplicados --mes <YYYY-MM>
   ```
   Si aparecen reflejos, mostrárselos al usuario y preguntar qué hacer con cada par. No borrar
   nada por cuenta propia.
9. Mover las imágenes procesadas de `<paths.inbox>` a `<paths.processed>/<YYYYMMDD>/<hash>.<ext>`,
   renombrándolas al hash que devolvió el paso 1.
10. Reportar resumen final: importados, invisibles omitidos, espejos y reflejos detectados, dónde
    quedaron las imágenes.

El chequeo de duplicados ya no se razona en prosa: lo hacen `movimiento import` (nivel exacto,
durante el import) y `duplicados` (nivel reglas, después). Ambos persisten lo que detectan en
`duplicate_findings`, así que queda registro consultable aunque la sesión termine. No hay script
de importación nuevo: todo reusa comandos existentes de la `mitarasca` CLI.
