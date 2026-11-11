# 🗺️ MahimJ Maps

**MahimJ Maps** is a web map app in the style of Google Maps. Search for places, browse what's nearby, click anywhere to see its address, get driving, cycling and walking directions with turn-by-turn steps, and save your favourite places.

It is a full-stack app:

- **Frontend:** a [Leaflet](https://leafletjs.com/) map with a familiar UI: floating search box, category chips, side panel, layer switcher and a right-click menu.
- **Backend:** a [Node.js](https://nodejs.org/) + [Express](https://expressjs.com/) API that handles search, nearby places, routing and **saved places** storage.

It uses only free, open data, so you don't need an API key or account.

> Want to explore the planet in 3D? See the sister project **[mahimj-earth](https://github.com/maddy1357/mahimj-earth)**.

---

## ✨ Features

### Interface
| | |
|---|---|
| 🔍 **Search box** | Suggestions as you type (with keyboard navigation), full search on Enter, and coordinates such as `13.0827, 80.2707` |
| 🏷️ **Category chips** | Restaurants, Hotels, Coffee, Petrol, Groceries, Hospitals, Pharmacies, ATMs, Parks and Things to do in the current view |
| 📋 **Place panel** | Satellite photo header, name and type, address, opening hours, website, phone, cuisine, accessibility and Wikipedia link |
| 🔘 **Place actions** | **Directions**, **Save**, **Nearby** (search around the place) and **Share** (copy link) |
| 🚗 **Directions** | Driving, cycling and walking, with travel times shown on each mode, alternative routes you can click, and turn-by-turn steps |
| ✋ **Interactive routing** | Click the map to set the start or destination, drag the A/B markers, swap them, or use *Your location* |
| 📌 **Click for address** | Click anywhere to see a card with the address there; click the card for full details |
| 🖱️ **Right-click menu** | *What's here?*, *Directions from here*, *Directions to here*, *Measure distance*, *Centre map here*, copy coordinates |
| 🗺️ **Layer switcher** | Default, Satellite (with labels and roads), Terrain and Dark, plus Biking and Hiking trail overlays |
| ⭐ **Saved places** | Stored on the server, listed in the ☰ menu |
| 📏 **Measure distance** | Click to build a path and see the total distance in km and miles |
| ◎ **My location** | A blue dot with an accuracy circle |
| 🔗 **Shareable URLs** | The URL tracks the view (`#@lat,lon,zoomz`) |
| 📱 **Mobile friendly** | On phones the side panel becomes a bottom sheet |

### Backend
- **Geocoding proxy** to OpenStreetMap Photon and Nominatim, with results normalised to one *place* format.
- **Nearby places** from the Overpass API. If Overpass is overloaded, it automatically falls back to Photon, queried in parallel.
- **Routing** from OSRM for car, bike and foot, returned in a compact format ready for the map.
- Respects the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/): at most 1 request per second, with an identifying User-Agent.
- **Caching** in memory: an LRU cache with expiry that also merges duplicate requests made at the same time.
- **Saved places REST API** stored in a JSON file with atomic writes and duplicate detection.
- Input **validation**, per-IP **rate limiting**, security headers, JSON errors and a health check.
- **Automated tests** that need no internet access (`npm test`).

---

## 🤔 Why we built this

- **Learning:** to understand how a modern map app works end to end: tile layers, geocoding, reverse geocoding, points of interest, routing, geolocation, and a backend that talks to third-party APIs responsibly.
- **Open and free:** Google Maps requires an API key and billing. MahimJ Maps uses **open-source software and open data**, so anyone can clone it and run it in seconds.
- **A proper backend:** keeping API calls on the server lets us cache, rate-limit, use fallbacks when a provider is down, follow usage policies, and store user data.
- **A base to build on:** a starting point for store locators, delivery trackers, travel planners or fleet dashboards.

---

## 🚀 Getting started

### Prerequisites
- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) **18.17 or newer**
- A modern web browser
- An internet connection (map tiles and data services are online)

### 1. Clone the repository
```bash
git clone https://github.com/maddy1357/mahimj-maps.git
cd mahimj-maps
```

### 2. Install dependencies
```bash
npm install
```

### 3. Start the app (frontend and backend together)
```bash
npm start
```
Open **http://localhost:3001**. The same server serves the frontend and the API at `/api`.

| Command | What it does |
|---|---|
| `npm start` | Start the server |
| `npm run dev` | Start with auto-restart when backend files change |
| `npm test` | Run the backend API tests |

> 💡 *Your location* needs `localhost` or HTTPS, because browsers block geolocation on plain HTTP sites.

---

## 🧑‍💻 How to use

1. **Search:** type in the search box and pick a suggestion, or press Enter for a full list of results.
2. **Browse nearby:** zoom into a city and click a chip such as **Coffee**.
3. **Explore:** click anywhere to see its address, or right-click for more options.
4. **Directions:** press the blue ⮕ button (or **Directions** on a place), pick a start and destination, then choose 🚗, 🚲 or 🚶.
5. **Change the map style:** hover over **Layers** in the bottom-left corner.
6. **Save places:** press **Save** on a place, then find it in the ☰ menu.

Press `/` to jump to the search box and `Esc` to close menus.

---

## ⚙️ Configuration

You can set these optional environment variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | HTTP port |
| `DATA_DIR` | `./data` | Folder where `saved-places.json` is stored |
| `RATE_LIMIT_PER_MIN` | `120` | API requests allowed per minute per IP |
| `MAX_SAVED_PLACES` | `500` | Maximum number of saved places |
| `NOMINATIM_URL` | `https://nominatim.openstreetmap.org` | Use your own Nominatim instance |
| `PHOTON_URL` | `https://photon.komoot.io` | Use your own Photon instance |
| `OVERPASS_URLS` | `overpass-api.de, overpass.private.coffee` | Comma-separated Overpass endpoints |
| `OSRM_URL` | `https://routing.openstreetmap.de` | Routing server (expects `routed-car`, `routed-bike` and `routed-foot` profiles) |
| `USER_AGENT` | `MahimJ-Maps/<version> (+repo URL)` | User-Agent sent to upstream services |

```bash
# macOS / Linux
PORT=8080 npm start
# Windows PowerShell
$env:PORT=8080; npm start
```

---

## 🔌 API reference

All responses are JSON. Errors look like `{ "error": "message" }` with a matching HTTP status.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service status and version |
| `GET` | `/api/suggest?q=&lat=&lon=` | Suggestions as you type, preferring results near `lat`/`lon` |
| `GET` | `/api/search?q=&viewbox=w,n,e,s` | Full place search |
| `GET` | `/api/reverse?lat=&lon=&zoom=` | Address at a point |
| `GET` | `/api/lookup?osm=N123` | Details for an OSM object: website, phone, opening hours and more |
| `GET` | `/api/categories` | Nearby categories `{ id, label, icon, color }` |
| `GET` | `/api/nearby?category=&bbox=s,w,n,e` | Places in a box (max 1° × 1°) |
| `GET` | `/api/nearby?category=&lat=&lon=&radius=` | Places within a radius (50–10,000 m) |
| `GET` | `/api/route?mode=driving\|cycling\|walking&from=lat,lon&to=lat,lon` | Up to 3 routes with geometry and steps |
| `GET` | `/api/saved` | List saved places |
| `POST` | `/api/saved` | Save: `{ "name", "lat", "lon", "address"?, "category"?, "kind"?, "note"? }`. Returns the existing place if it is already saved |
| `PATCH` | `/api/saved/:id` | Update: `{ "name"?, "note"? }` |
| `DELETE` | `/api/saved/:id` | Remove |

Example route response (trimmed):
```json
{
  "mode": "driving",
  "routes": [{
    "duration": 360, "distance": 5800, "summary": "Wall Tax Road, Kamarajar Salai",
    "geometry": [[13.0827, 80.2757], [13.0831, 80.2756]],
    "steps": [{ "name": "Wall Tax Road", "distance": 590,
                "maneuver": { "type": "depart", "modifier": "", "bearingAfter": 0, "location": [13.0827, 80.2757] } }]
  }]
}
```

---

## 📁 Project structure

```
mahimj-maps/
├── frontend/                 # Static web app (served by the backend)
│   ├── index.html            # Layout: search box, chips, panel, drawer, layer switcher
│   ├── styles.css            # Clean, light map UI + mobile bottom sheet
│   └── app.js                # Leaflet map, search, nearby, directions, measure, saved
├── backend/
│   ├── server.js             # Entry point (starts HTTP server)
│   ├── src/
│   │   ├── app.js            # Express app: middleware, routes, static files
│   │   ├── config.js         # Environment-based configuration
│   │   ├── lib/              # cache, http client + throttle, JSON store, validation, middleware
│   │   ├── services/         # geocoding, places (Overpass + fallback), routing (OSRM)
│   │   └── routes/           # geo, places (categories/nearby/route), saved
│   └── test/api.test.js      # API tests (node:test)
├── data/                     # Runtime data (saved-places.json), git-ignored
├── package.json
├── LICENSE
└── README.md
```

---

## 🛠️ Tech stack

- **Frontend:** Leaflet 1.9.4, vanilla JavaScript, Material Symbols icons, Roboto font
- **Backend:** Node.js 18+, Express 4, `node:test`
- **Data:** [OpenStreetMap](https://www.openstreetmap.org/), Esri World Imagery and Dark Gray Canvas, [OpenTopoMap](https://opentopomap.org/), [Waymarked Trails](https://waymarkedtrails.org/), [Photon](https://photon.komoot.io/), [Nominatim](https://nominatim.org/), [Overpass API](https://overpass-api.de/) and [OSRM](https://project-osrm.org/) via [FOSSGIS](https://routing.openstreetmap.de/)

---

## 🙏 Attribution & usage policies

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Imagery © Esri, Maxar, Earthstar Geographics. Terrain style © OpenTopoMap (CC-BY-SA). Trail overlays © Waymarked Trails. Routing by OSRM (FOSSGIS servers).

The public Nominatim, Photon, Overpass and OSRM servers are shared community resources for light use. The backend caches results and rate-limits requests. For heavy public use, host your own instances and set the `*_URL` variables.

## 📄 License

Copyright (c) 2026 mahimj. All rights reserved. Proprietary software — see [LICENSE](LICENSE).
