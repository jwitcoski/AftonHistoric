# Export workflow

Package the Afton OSM vectors and DEM terrain mesh for the separate Global Ski Atlas city-scene route:

```powershell
..\globalskiatlas_data\.venv\Scripts\python.exe scripts/export/export_clay_city.py
```

This writes a UTM-local city scene under `GlobalSkiAtlas_2/clay_scenes/cities/afton_historic_minnesota/` and updates that directory's `cities/catalog.json`. It does not add Afton to the ski-resort catalog. Re-run with `--force` after regenerating OSM or terrain assets.
