# Waitaha Canterbury River Monitor technical handover

Use this guide to run, verify and make a small change to the dashboard. The public site shows provisional observations from Environment Canterbury (ECan). It is a snapshot of the monitoring network.

## Run and check the app

1. Clone the repository or extract the project ZIP. From the folder containing `index.html`, run `python -m http.server 8000`.
2. Open <http://localhost:8000/>. Confirm the feed status reports a successful refresh and the map, counts and station list populate.
3. With Node.js 22 or newer, run `node --test tests/monitor.test.mjs` from the same folder. These tests run offline with a fixture and mock browser objects. They check missing versus zero hourly change, the 24-hour cutoff, and the station list and warning after a failed refresh.
4. In a browser, click a status card, pan the map, and pin gauges to A and B. Check that the map, counts, list and comparison respond as expected.

## Decisions to revisit as the project changes

| Decision | Why | When to revisit |
|---|---|---|
| Build the public version in Leaflet and host the static files on GitHub Pages | The browser can query ECan directly. The site can run independently of the ArcGIS Online prototype and its account. | The feed starts requiring credentials, or the project needs centrally stored historical readings. |
| Select gauges using the Stats NZ boundary and two explicit site exclusions | On the tested feed, this matched the 177 records in the ArcGIS prototype. The count still reflects changes in the eligible network. | The boundary changes, ECan changes station locations, or the monitoring scope changes. Review IDs 62107 and 71116 with the spatial selection. |
| Show refresh time separately from observation time | A successful request can return a reading that is already old. Users can see the timing of both events. | The audience needs a different polling interval or an agreed definition of stale data. |
| Validate before replacing the displayed dataset | An error or transfer-limit response should leave the most recent valid readings available, with a visible warning. | The layer outgrows a single response or the app needs coordinated caching across devices. |

## When readings stop updating

1. Read the feed status in the header and the observation time in a station row. A recent successful refresh with an older observation may mean the gauge has yet to report.
2. Click **Refresh readings**. If it fails, open browser DevTools and check the ECan request in **Network**. Check HTTP status, the response body and any browser cross-origin error.
3. If only some stations appear, select **All stations** and **Canterbury view**. Check for a transfer-limit flag before making changes to the regional filter.
4. After recovery, verify that the warning clears and the last successful refresh time advances. If you change a feed field, update the field list and its consumer together.

## Peer handover exercise

Ask a GIS colleague to use this guide and the repo without a live walkthrough. Allow about 20 minutes.

- Run the dashboard locally and execute the three automated checks.
- Change the **Station readings** heading in `index.html` on a working branch. Reload and confirm the heading changed.
- Simulate a failed refresh after one successful load using browser request blocking. Confirm the warning appears and the station list is retained. Unblock the request and confirm recovery.
- Record where they needed help, what they expected to happen, and one improvement they would make.

Record the date, task completed, observed friction, change made in response, and retest result. Report the handover as completed once a colleague has performed it.

## Before publishing

- Run the automated checks and browser smoke test.
- Test the production URL after the GitHub Pages deployment. Check the ECan request, the boundary, and two-station comparison.
- If a change breaks the deployed app, revert the release commit on the deployment branch and repeat the production checks.
