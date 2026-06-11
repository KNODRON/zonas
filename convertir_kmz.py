import geopandas as gpd
import pandas as pd
import re
from pathlib import Path

KMZ = 'DGAC ZONAS DE VUELO AL 14052026.kmz'
OUT = Path('data')
OUT.mkdir(exist_ok=True)

def clasificar(row):
    texto = f"{row.get('Name','')} {row.get('description','')} {row.get('layer','')}".upper()
    if re.search(r'PROHIBID|SC-P|\bP-?\d|ZONA P', texto): return 'P'
    if re.search(r'RESTRINGID|SC-R|\bR-?\d|ZONA R|ARMADA', texto): return 'R'
    if re.search(r'PELIGROS|\bD-?\d|ZONA D', texto): return 'D'
    if re.search(r'AER[ÓO]DROM|AIRPORT', texto): return 'AERODROMO'
    if re.search(r'PISTA', texto): return 'PISTA'
    return 'OTRO'

frames = []
for layer in gpd.list_layers(KMZ).name:
    gdf = gpd.read_file(KMZ, layer=layer)
    if gdf.empty: continue
    gdf = gdf[[c for c in ['Name','description','geometry'] if c in gdf.columns]].copy()
    gdf['layer'] = layer
    frames.append(gdf)

base = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), crs='EPSG:4326')
base = base[~base.geometry.isna()].copy()
base['tipo'] = base.apply(clasificar, axis=1)
base['nombre'] = base.get('Name', '').fillna('').astype(str)
base['descripcion'] = base.get('description', '').fillna('').astype(str)
base = base[['nombre','descripcion','tipo','layer','geometry']]
base.to_file(OUT / 'zonas_dgac.geojson', driver='GeoJSON')
print(base['tipo'].value_counts())
print('Archivo creado: data/zonas_dgac.geojson')
