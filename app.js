const map = L.map("map", {
  worldCopyJump: false,
  maxBounds: [[-60, -95], [-15, -45]],
  maxBoundsViscosity: 1.0
}).setView([-33.45, -70.66], 5);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  noWrap: true,
  attribution: "© OpenStreetMap"
}).addTo(map);

let marcadorUsuario = null;
let capasDGAC = L.layerGroup().addTo(map);

const resultado = document.getElementById("resultado");

function colorZona(nombre = "") {
  const texto = nombre.toUpperCase();

  if (texto.includes("PROHIB") || texto.match(/\bP[-\s]?\d+/)) return "#d00000";
  if (texto.includes("RESTRING") || texto.match(/\bR[-\s]?\d+/)) return "#ff8800";
  if (texto.includes("PELIGR") || texto.match(/\bD[-\s]?\d+/)) return "#d6b000";

  return "#006241";
}

function estiloFeature(feature) {
  const props = feature.properties || {};
  const nombre = props.name || props.Name || props.NOMBRE || "";

  return {
    color: colorZona(nombre),
    weight: 2,
    fillOpacity: 0.25
  };
}

function textoPopup(feature) {
  const props = feature.properties || {};
  let html = "<strong>Información DGAC</strong><br><br>";

  for (const key in props) {
    if (props[key]) {
      html += `<span class="etiqueta-zona">${key}:</span> ${props[key]}<br>`;
    }
  }

  return html;
}

async function cargarKMZ() {
  try {
    const response = await fetch("data/DGAC_ZONAS.kmz");
    const blob = await response.blob();

    const zip = await JSZip.loadAsync(blob);
    let kmlFile = null;

    zip.forEach((path, file) => {
      if (path.toLowerCase().endsWith(".kml")) {
        kmlFile = file;
      }
    });

    if (!kmlFile) {
      resultado.textContent = "No se encontró archivo KML dentro del KMZ.";
      return;
    }

    const kmlText = await kmlFile.async("text");
    const parser = new DOMParser();
    const kml = parser.parseFromString(kmlText, "text/xml");
    const geojson = toGeoJSON.kml(kml);

    const capa = L.geoJSON(geojson, {
      style: estiloFeature,
      onEachFeature: (feature, layer) => {
        layer.bindPopup(textoPopup(feature));
      }
    });

    capasDGAC.addLayer(capa);
    map.fitBounds(capa.getBounds());

    resultado.textContent = "Zonas DGAC cargadas correctamente.";
  } catch (error) {
    console.error(error);
    resultado.textContent = "Error al cargar el archivo DGAC_ZONAS.kmz.";
  }
}

document.getElementById("btnUbicacion").addEventListener("click", () => {
  if (!navigator.geolocation) {
    resultado.textContent = "Este dispositivo no permite obtener ubicación.";
    return;
  }

  resultado.textContent = "Obteniendo ubicación...";

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      if (marcadorUsuario) {
        map.removeLayer(marcadorUsuario);
      }

      marcadorUsuario = L.marker([lat, lng]).addTo(map)
        .bindPopup(`Su ubicación aproximada:<br>${lat.toFixed(6)}, ${lng.toFixed(6)}`)
        .openPopup();

      map.setView([lat, lng], 15);
      resultado.textContent = `Ubicación actual: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    },
    () => {
      resultado.textContent = "No fue posible obtener la ubicación.";
    }
  );
});

document.getElementById("btnBuscar").addEventListener("click", async () => {
  const q = document.getElementById("busqueda").value.trim();

  if (!q) {
    resultado.textContent = "Ingrese una comuna, dirección o coordenadas.";
    return;
  }

  const coords = q.split(",").map(x => parseFloat(x.trim()));

  if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
    map.setView([coords[0], coords[1]], 15);

    if (marcadorUsuario) map.removeLayer(marcadorUsuario);

    marcadorUsuario = L.marker([coords[0], coords[1]]).addTo(map)
      .bindPopup(`Punto consultado:<br>${coords[0]}, ${coords[1]}`)
      .openPopup();

    resultado.textContent = `Punto consultado: ${coords[0]}, ${coords[1]}`;
    return;
  }

  resultado.textContent = "Buscando ubicación...";

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q + ", Chile")}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.length) {
      resultado.textContent = "No se encontró la ubicación.";
      return;
    }

    const lat = parseFloat(data[0].lat);
    const lon = parseFloat(data[0].lon);

    map.setView([lat, lon], 15);

    if (marcadorUsuario) map.removeLayer(marcadorUsuario);

    marcadorUsuario = L.marker([lat, lon]).addTo(map)
      .bindPopup(data[0].display_name)
      .openPopup();

    resultado.textContent = data[0].display_name;
  } catch (error) {
    console.error(error);
    resultado.textContent = "Error al buscar la ubicación.";
  }
});

cargarKMZ();
