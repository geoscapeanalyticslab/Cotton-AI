
/**************************************************************************************
 * COTTON / NON-COTTON MAPPING — SINDH, PAKISTAN  (UNSUPERVISED, NO TRAINING DATA)
 * k-means on AlphaEarth Foundations (AEF) annual embeddings over cropland,
 * then identify cotton cluster(s) from per-cluster Sentinel-2 kharif NDVI phenology.
 *
 * GeoScape Analytics Lab (GSAL)
 *
 * HOW TO USE — TWO PASSES
 * -----------------------
 * PASS 1: Leave COTTON_CLUSTERS = []. Run. Inspect:
 *          (a) the "Clusters" map layer, and
 *          (b) the printed per-cluster NDVI phenology line chart.
 *         Cotton in Sindh: low/no NDVI Jan–Mar, rise after Feb–May sowing,
 *         PEAK Aug–Sep, senescence (falling NDVI) Oct–Nov. Distinguish from:
 *           - sugarcane: high NDVI most of the year, no clear autumn senescence
 *           - rice/paddy: early-season dip (flooding) then sharp green-up
 *           - chili / veg / fodder: shorter or off-cycle peaks
 * PASS 2: Put the cotton cluster ID(s) into COTTON_CLUSTERS below and re-run.
 *
 * VALIDATION: no field data -> rely on district AREA-AGREEMENT vs Sindh Crop
 * Reporting Service statistics (step 8). Report as area agreement, not accuracy.
 * NOTE: cluster IDs are arbitrary and change if you change N_CLUSTERS or SEED.
 **************************************************************************************/

/* ===== 0. CONFIG ===== */
var CONFIG = {
  YEAR: 2023,
  N_CLUSTERS: 20,             // try 15–25
  N_TRAIN_PIXELS: 5000,       // pixels to train the clusterer
  N_PROFILE_PTS: 150,         // sample points per cluster for phenology profiles
  CLEAR_THRESHOLD: 0.60,      // Cloud Score+ cs_cdf
  SEED: 42
};

// PASS 2: fill after inspecting the chart, e.g. [4, 11]
var COTTON_CLUSTERS = [];

var DISTRICT_NAMES = [
  'Sanghar', 'Ghotki', 'Khairpur',
  'Naushahro Feroze', 'Nawabshah', 'Shaheed Benazirabad'
];

/* ===== 1. AOI — SINGLE DISTRICT ===== */
var DISTRICT = 'Sanghar';   // change to any Sindh district name

var pak = ee.FeatureCollection('FAO/GAUL/2015/level2')
  .filter(ee.Filter.eq('ADM0_NAME', 'Pakistan'));

var sindh = pak.filter(ee.Filter.stringContains('ADM1_NAME', 'Sind'));

// Match the district by substring (robust to GAUL spelling quirks).
var districts = sindh.filter(ee.Filter.stringContains('ADM2_NAME', DISTRICT));

print('Matched district(s):', districts.aggregate_array('ADM2_NAME'));
print('District count:', districts.size());   // must be >= 1

var aoi = districts.geometry();
Map.centerObject(aoi, 9);
Map.addLayer(districts, {color: 'white'}, '1. District (AOI)', false);

/* ===== 2. ALPHAEARTH EMBEDDINGS (A00..A63) ===== */
var embStart = ee.Date.fromYMD(CONFIG.YEAR, 1, 1);
var aef = ee.ImageCollection('GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL')
  .filterDate(embStart, embStart.advance(1, 'year'))
  .filterBounds(aoi).mosaic().clip(aoi);

var AEF_BANDS = ee.List.sequence(0, 63).map(function (i) {
  i = ee.Number(i).toInt();
  var s = ee.String(i).replace('^([0-9])$', '0$1');
  return ee.String('A').cat(s);
}).getInfo();
aef = aef.select(AEF_BANDS);

/* ===== 3. CROPLAND MASK (ESA WorldCover v200, class 40) ===== */
var worldcover = ee.ImageCollection('ESA/WorldCover/v200').first().clip(aoi);
var cropMask = worldcover.eq(40);
var aefCrop = aef.updateMask(cropMask);
Map.addLayer(cropMask.selfMask(), {palette: ['#f5deb3']}, '2. Cropland mask', false);

/* ===== 4. UNSUPERVISED CLUSTERING (k-means on embeddings) ===== */
var training = aefCrop.sample({
  region: aoi, scale: 10, numPixels: CONFIG.N_TRAIN_PIXELS,
  seed: CONFIG.SEED, geometries: false
});
var clusterer = ee.Clusterer.wekaKMeans(CONFIG.N_CLUSTERS).train(training);
var clusters = aefCrop.cluster(clusterer).rename('cluster').clip(aoi);

// Random palette for visual inspection.
var clusterViz = clusters.randomVisualizer();
Map.addLayer(clusterViz, {}, '3. Clusters (' + CONFIG.N_CLUSTERS + ')', true);

/* ===== 5. SENTINEL-2 MONTHLY NDVI (kharif window, for phenology) ===== */
var s2  = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED');
var csP = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');
var CS_BAND = 'cs_cdf';

function maskS2(img) {
  var scaled = img.select(['B4', 'B8']).multiply(0.0001);
  var clear = img.select(CS_BAND).gte(CONFIG.CLEAR_THRESHOLD);
  return scaled.updateMask(clear).copyProperties(img, ['system:time_start']);
}

var MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12]; // Apr–Dec covers Sindh cotton cycle
var MONTH_BANDS = MONTHS.map(function (m) {
  return 'ndvi_' + (m < 10 ? '0' + m : '' + m);
});

function monthlyNDVI(m, idx) {
  var start = ee.Date.fromYMD(CONFIG.YEAR, m, 1);
  var col = s2.filterBounds(aoi).filterDate(start, start.advance(1, 'month'))
    .linkCollection(csP, [CS_BAND]).map(maskS2);
  return col.median().normalizedDifference(['B8', 'B4']).rename(MONTH_BANDS[idx]);
}

var ndviBands = MONTHS.map(monthlyNDVI);
var ndviStack = ee.Image.cat(ndviBands).clip(aoi);

/* ===== 6. PER-CLUSTER PHENOLOGY PROFILES ===== */
// Stack cluster + monthly NDVI, sample stratified by cluster.
var profileStack = ndviStack.addBands(clusters).updateMask(cropMask);
var profilePts = profileStack.stratifiedSample({
  numPoints: CONFIG.N_PROFILE_PTS,
  classBand: 'cluster',
  region: aoi,
  scale: 30,
  seed: CONFIG.SEED,
  geometries: false,
  tileScale: 8
});

// Mean NDVI per month for each cluster -> one feature per cluster.
var profiles = ee.FeatureCollection(
  ee.List.sequence(0, CONFIG.N_CLUSTERS - 1).map(function (c) {
    c = ee.Number(c).toInt();
    var sub = profilePts.filter(ee.Filter.eq('cluster', c));
    var stats = sub.reduceColumns({
      reducer: ee.Reducer.mean().repeat(MONTH_BANDS.length),
      selectors: MONTH_BANDS
    });
    var means = ee.List(stats.get('mean'));
    var dict = ee.Dictionary.fromLists(MONTH_BANDS, means);
    return ee.Feature(null, dict).set('cluster', c);
  })
);

// Line chart: x = month, one line per cluster.
var chart = ui.Chart.feature.byProperty({
  features: profiles,
  xProperties: MONTH_BANDS,
  seriesProperty: 'cluster'
}).setChartType('LineChart').setOptions({
  title: 'Per-cluster monthly NDVI — pick cotton by phenology',
  hAxis: {title: 'Month (Apr–Dec)'},
  vAxis: {title: 'Mean NDVI', viewWindow: {min: 0, max: 1}},
  lineWidth: 2, pointSize: 3, interpolateNulls: true
});
print('4. Cluster phenology (identify cotton, then set COTTON_CLUSTERS):', chart);
print('   Cluster IDs present:', profilePts.aggregate_array('cluster').distinct().sort());

/* ===== 7. BUILD COTTON MAP FROM SELECTED CLUSTERS (PASS 2) ===== */
if (COTTON_CLUSTERS.length > 0) {
  var cotton = ee.Image(0);
  COTTON_CLUSTERS.forEach(function (id) {
    cotton = cotton.or(clusters.eq(id));
  });
  cotton = cotton.updateMask(cropMask).rename('cotton').clip(aoi);
  Map.addLayer(cotton.selfMask(), {palette: ['#d62828']}, '5. Predicted cotton', true);

  /* ===== 8. DISTRICT COTTON AREA (area-agreement validation) ===== */
  var cottonAreaHa = cotton.eq(1).multiply(ee.Image.pixelArea()).divide(1e4).rename('cotton_ha');
  var areaByDistrict = cottonAreaHa.reduceRegions({
    collection: districts, reducer: ee.Reducer.sum(), scale: 30, tileScale: 8
  });
  print('5. Predicted cotton area (ha) by district:',
    areaByDistrict.select(['ADM2_NAME', 'sum'], ['district', 'cotton_ha']));

  // Legend
  var legend = ui.Panel({style: {position: 'bottom-left', padding: '8px'}});
  legend.add(ui.Label('Cotton — Sindh (' + CONFIG.YEAR + ', unsupervised)', {fontWeight: 'bold'}));
  legend.add(ui.Panel({
    widgets: [ui.Label('', {backgroundColor: '#d62828', padding: '8px', margin: '0 6px 0 0'}),
              ui.Label('Cotton', {margin: '0'})],
    layout: ui.Panel.Layout.Flow('horizontal')
  }));
  Map.add(legend);

  /* ===== 9. EXPORTS (uncomment) ===== */
  // Export.image.toDrive({
  //   image: cotton.byte(), description: 'cotton_sindh_' + CONFIG.YEAR + '_unsup',
  //   region: aoi, scale: 10, maxPixels: 1e13, crs: 'EPSG:4326'
  // });
  // Export.table.toDrive({
  //   collection: areaByDistrict.select(['ADM2_NAME','sum'], ['district','cotton_ha']),
  //   description: 'cotton_area_by_district_' + CONFIG.YEAR + '_unsup', fileFormat: 'CSV'
  // });
} else {
  print('PASS 1: inspect the chart + cluster map, then set COTTON_CLUSTERS and re-run.');
}


var COTTON_CLUSTERS = [10];            // primary cotton cluster
// fuller coverage (adds vigor/sowing-date variants, slight rice-mixing risk):
// var COTTON_CLUSTERS = [10, 3, 9];

var cotton = ee.Image(0);
COTTON_CLUSTERS.forEach(function (id) { cotton = cotton.or(clusters.eq(id)); });
cotton = cotton.updateMask(cropMask).selfMask().rename('cotton').clip(aoi);

Map.addLayer(cotton, {palette: ['#d62828']},
  'Cotton (cluster ' + COTTON_CLUSTERS.join(',') + ')');