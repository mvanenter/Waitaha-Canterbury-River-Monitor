# Waitaha Canterbury River Monitor

A regional dashboard for exploring Environment Canterbury's provisional monitoring observations. Zoom or pan to update the status cards and station list. Click a card to filter the gauges in view. Pin any two gauges to compare their latest reported water level, current flow, hourly water-level change and seven-day peak flow. A missing measurement displays as “Not reported”.

Select a gauge on the map or a station in the readings list to open a compact water-level summary. Use the A and B buttons to pin stations for comparison. Select **Copy comparison link** to share those gauges. The recipient sees the latest readings for the same stations, and chart coverage reflects the observations saved in their browser.

## Run the dashboard

Serve this folder over HTTP, for example with `python -m http.server 8000`, and visit <http://localhost:8000/>. For GitHub Pages, publish the repository root. The app is static and needs no API key, build step or ArcGIS Online account. Leaflet, OpenStreetMap tiles and the monitoring feed require internet access.

## Data and refresh

- [Environment Canterbury river flow data](https://www.ecan.govt.nz/data/riverflow) and [live feature service](https://gis1.ecan.govt.nz/arcgis/rest/services/Public/WaterQualityandMonitoring/FeatureServer/12). Observations are provisional. The app queries the source at startup and every five minutes, and users can refresh manually.
- [Stats NZ Regional Council 2025](https://services2.arcgis.com/vKb0s8tBIA3bdocZ/arcgis/rest/services/Regional_Council_2025/FeatureServer/0). The bundled Canterbury polygon is the full administrative boundary, including offshore areas. Browser-side point-in-polygon filtering runs on every successful feed refresh. The public feed is a monitoring snapshot. The 24-hour water-level chart in the comparison panels uses observations collected by this browser during successful refreshes. It starts with the first saved reading, never backfills time when no readings were collected, and leaves a break after a gap of two hours or more.
- The app distinguishes the time it last fetched the feed from observation times at individual stations. A failed refresh leaves the last successful dataset visible and shows a warning. A successful response is also cached in the browser for return visits.
- Observations aged 24 hours or more are classified as older. A recent missing hourly change is classified as no trend data. A reported zero is classified as no change. The same logic powers the map, cards and list.

## Standalone dashboard

![Leaflet dashboard with numbered callouts for map pins, comparison and chart status](docs/leaflet-comparison.png)

1. Map badges identify the pinned stations.
2. The comparison shows water level and observation age side by side.
3. The chart waits for two readings collected in the current browser.

## ArcGIS Online prototype

The original dashboard used a spatial selection and a live layer filter. The standalone app recomputes geographic membership against the full Stats NZ polygon and excludes two stations that were outside the prototype selection: Waiau Toa/Clarence (62107) and Ahuriri Sth Diadem (71116). This matches the 177-station prototype against the tested feed, while allowing the count to change when ECan adds or removes other stations.

![ArcGIS dashboard regional overview](docs/arcgis-overview.png)

![ArcGIS dashboard comparing Ahuriri SH8 and Dobsons Drain](docs/arcgis-comparison.png)

[Watch the ArcGIS dashboard walkthrough](docs/arcgis-demo.mp4)

## Maintenance

See the [technical handover](docs/technical-handover.md) for design decisions, the release checks and a peer handover exercise. Run `node --test tests/monitor.test.mjs` with Node.js 22 or newer.
