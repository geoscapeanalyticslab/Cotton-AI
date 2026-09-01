import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, LayersControl, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

const FIELD_FILL = '#1baf7a';
const FIELD_FILL_DARK = '#199e70';
const SELECTED_FILL = '#d97706';

const DISTRICT_FILL = '#3b82f6';
const DISTRICT_SELECTED_FILL = '#10b981';

function fieldStyle(feature, selectedId, isDark) {
  const selected = feature.properties.id === selectedId;
  return {
    color: selected ? SELECTED_FILL : isDark ? FIELD_FILL_DARK : FIELD_FILL,
    weight: selected ? 2.5 : 1,
    fillColor: selected ? SELECTED_FILL : isDark ? FIELD_FILL_DARK : FIELD_FILL,
    fillOpacity: selected ? 0.6 : 0.35,
  };
}

function districtStyle(feature, selectedDistrict) {
  const name = feature.properties.district_name || feature.properties.ADM2_NAME;
  const isSelected = selectedDistrict && selectedDistrict.toLowerCase() === name?.toLowerCase();
  return {
    color: isSelected ? DISTRICT_SELECTED_FILL : '#64748b',
    weight: isSelected ? 4 : 1.5,
    fillColor: DISTRICT_FILL,
    fillOpacity: isSelected ? 0 : 0.1,
    dashArray: isSelected ? '' : '3 3',
  };
}

function FitToBounds({ districts, polygons, selectedDistrict }) {
  const map = useMap();
  const initialFitted = useRef(false);

  useEffect(() => {
    if (selectedDistrict && districts) {
      const match = districts.features.find((f) => {
        const dName = f.properties.district_name || f.properties.ADM2_NAME;
        return dName?.toLowerCase() === selectedDistrict.toLowerCase();
      });
      if (match) {
        const bounds = L.geoJSON(match).getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [30, 30] });
          return;
        }
      }
    }

    if (!initialFitted.current) {
      if (districts) {
        const bounds = L.geoJSON(districts).getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [20, 20] });
          initialFitted.current = true;
        }
      } else if (polygons) {
        const bounds = L.geoJSON(polygons).getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [24, 24] });
          initialFitted.current = true;
        }
      }
    }
  }, [selectedDistrict, districts, polygons, map]);

  return null;
}

function ZoomTracker({ onZoomChange }) {
  useMapEvents({
    zoomend: (e) => {
      onZoomChange(e.target.getZoom());
    },
  });
  return null;
}

export default function MapView({
  polygons,
  districts,
  selectedDistrict,
  onSelectDistrict,
  selectedId,
  onSelectField,
  isDark,
  center = [26.05, 68.95],
  zoom = 7.5,
}) {
  const [currentZoom, setCurrentZoom] = useState(zoom);
  const districtLayerRef = useRef(null);
  const fieldLayerRef = useRef(null);

  const showFields = currentZoom >= 9.5;

  useEffect(() => {
    const layer = districtLayerRef.current;
    if (!layer) return;
    layer.eachLayer((sub) => {
      sub.setStyle(districtStyle(sub.feature, selectedDistrict));
    });
  }, [selectedDistrict]);

  useEffect(() => {
    const layer = fieldLayerRef.current;
    if (!layer) return;
    layer.eachLayer((sub) => {
      sub.setStyle(fieldStyle(sub.feature, selectedId, isDark));
      if (sub.feature.properties.id === selectedId) sub.bringToFront();
    });
  }, [selectedId, isDark]);

  return (
    <MapContainer center={center} zoom={zoom} className="map-container" zoomControl={false}>
      <ZoomTracker onZoomChange={setCurrentZoom} />
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Satellite">
          <TileLayer
            attribution="Tiles &copy; Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Streets">
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      <FitToBounds districts={districts} polygons={polygons} selectedDistrict={selectedDistrict} />

      {/* Sindh Districts Boundaries */}
      {districts && (
        <GeoJSON
          ref={districtLayerRef}
          data={districts}
          style={(feature) => districtStyle(feature, selectedDistrict)}
          onEachFeature={(feature, layer) => {
            const name = feature.properties.district_name || feature.properties.ADM2_NAME;
            const totalAgri = feature.properties.total_agri_fields || 'N/A';
            const cotton2026 = feature.properties.cotton_fields_2026 || 'N/A';

            layer.bindTooltip(
              `<div class="district-tooltip">
                <strong>${name} District</strong><br/>
                <span class="tooltip-sub">Total Agri Fields: ${totalAgri.toLocaleString ? totalAgri.toLocaleString() : totalAgri}</span><br/>
                <span class="tooltip-sub">Cotton Fields (2026): ${cotton2026.toLocaleString ? cotton2026.toLocaleString() : cotton2026}</span>
              </div>`,
              { sticky: true, opacity: 0.95 }
            );

            layer.on({
              click: () => {
                if (onSelectDistrict) onSelectDistrict(name);
              },
              mouseover: (e) => {
                e.target.setStyle({ fillOpacity: 0.35, weight: 2.5 });
              },
              mouseout: (e) => {
                e.target.setStyle(districtStyle(feature, selectedDistrict));
              },
            });
          }}
        />
      )}

      {/* Granular Field Polygons Layer (visible on zoom >= 9.5) */}
      {showFields && polygons && (
        <GeoJSON
          ref={fieldLayerRef}
          data={polygons}
          style={(feature) => fieldStyle(feature, selectedId, isDark)}
          onEachFeature={(feature, layer) => {
            layer.on('click', (e) => {
              L.DomEvent.stopPropagation(e);
              if (onSelectField) onSelectField(feature.properties.id);
            });
            layer.on('mouseover', () => {
              if (feature.properties.id !== selectedId) {
                layer.setStyle({ fillOpacity: 0.55 });
              }
            });
            layer.on('mouseout', () => {
              if (feature.properties.id !== selectedId) {
                layer.setStyle(fieldStyle(feature, selectedId, isDark));
              }
            });
          }}
        />
      )}
    </MapContainer>
  );
}
