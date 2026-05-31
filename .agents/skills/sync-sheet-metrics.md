---
name: sync-sheet-metrics
description: "Ejecuta scripts de Python para conectarse a la API de Google Sheets (gspread), extraer filas de datos de métricas y transformarlas en un archivo estructurado local (data.json) para el dashboard."
---

### Goal
Descargar de forma segura los datos actualizados de la hoja de cálculo de Google Sheets y actualizar el origen de datos del dashboard local sin intervención humana.

### Instructions
1. Lee las credenciales de la cuenta de servicio de Google Cloud desde el archivo `.env` o variable `GOOGLE_CREDENTIALS`.
2. Utiliza la librería `gspread` y `pandas` para conectarte al libro de Sheets especificado.
3. Extrae las pestañas correspondientes a los KPIs de métricas primarias.
4. Valida que los datos no contengan valores nulos críticos antes de procesarlos.
5. Transforma los datos y guarda un archivo limpio en `src/data/metrics.json`.
6. Genera un reporte resumido en la terminal indicando la cantidad de filas procesadas con éxito.

### Examples
- **Input**: Comando disparado de actualización o llamada interna del subagent.
- **Output**: Archivo `metrics.json` actualizado y log: `[SUCCESS] Sync completed. 150 rows parsed.`

### Constraints
- NUNCA subas ni expongas el archivo de credenciales JSON de Google en el repositorio público.
- No realices operaciones de escritura (`DELETE` o `UPDATE`) sobre las celdas del Google Sheet, el acceso debe ser de solo lectura.
- Si la API de Google devuelve un error de cuota (429), implementa un reintento exponencial sutil.
