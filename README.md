# 🗺️ MahimJ Maps

**MahimJ Maps** is an interactive web map application, similar to Google Maps, that runs in the browser. You can search for places, click anywhere to get its address, get driving directions with turn-by-turn steps, find your current location and switch between street, satellite, terrain and dark map styles.

It is built with [Leaflet](https://leafletjs.com/) and [OpenStreetMap](https://www.openstreetmap.org/), and uses only free, open services, so you don't need an API key or account.

> Want to explore the planet in 3D? See the sister project **[mahimj-earth](https://github.com/maddy1357/mahimj-earth)**.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔍 **Place search** | Search for cities, addresses, shops and landmarks (OpenStreetMap Nominatim) |
| 📌 **Click for address** | Click anywhere on the map to drop a pin and see the address there (reverse geocoding) |
| 🚗 **Directions** | Driving route from A to B with travel time, distance and turn-by-turn steps (OSRM) |
| 🧭 **Step navigation** | Click any step to zoom to that turn on the map |
| ⇅ **Swap / use my location** | Swap start and destination, or use your GPS location as the start |
| ◎ **My location** | Show where you are, with an accuracy circle |
| 🗺️ **4 map styles** | *Streets*, *Satellite* (with labels), *Terrain* and *Dark* |
| 📋 **Copy coordinates** | Copy the latitude and longitude of any place |
| 📏 **Scale bar & live coordinates** | See the coordinates and zoom level under your cursor |
| 🌙 **Dark mode UI** | The panel follows your system light/dark theme |
| 📱 **Mobile friendly** | On small screens the panel moves to a bottom sheet |

You can type coordinates directly in the directions fields, for example `13.0827, 80.2707`.

---

## 🤔 Why we built this

- **Learning:** to understand how a modern map app works, including tile layers, geocoding, reverse geocoding, routing APIs, geolocation and map UI patterns.
- **Open and free:** Google Maps requires an API key and billing. MahimJ Maps uses **open-source software and open data**, so anyone can clone it and run it in seconds.
- **Lightweight:** it's plain HTML, CSS and JavaScript with a tiny Node.js server. There's no framework, no build step and nothing to install from npm.
- **A base to build on:** it's a clean starting point for delivery trackers, store locators, travel planners, fleet dashboards or any project that needs a map.

---

## 🚀 Getting started

### Prerequisites

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) **v16 or newer** (only used to serve the files)
- A modern web browser
- An internet connection (map tiles, search and routing are online services)

### 1. Clone the repository

```bash
git clone https://github.com/maddy1357/mahimj-maps.git
cd mahimj-maps
```

### 2. Run the app

```bash
npm start
```

There are no dependencies to install. The server uses only built-in Node.js modules.

### 3. Open it in your browser

```
http://localhost:3001
```

To use a different port:

```bash
# macOS / Linux
PORT=8080 npm start

# Windows PowerShell
$env:PORT=8080; npm start
```

> 💡 "My location" needs `localhost` or HTTPS, because browsers block geolocation on plain HTTP sites.

---

## 🧑‍💻 How to use

1. **Search:** type a place in the *Search* tab and press **Search**, then pick a result.
2. **Explore:** click anywhere on the map to see the address of that spot.
3. **Directions:** press **Directions** on a place card, or open the *Directions* tab, enter a start (or press 📍) and a destination, then press **Get directions**.
4. **Change the map style:** use the layers button in the top-right corner.
5. **Find yourself:** press ◎ in the bottom-right corner.

---

## 📁 Project structure

```
mahimj-maps/
├── public/
│   ├── index.html   # App layout & CDN includes (Leaflet)
│   ├── styles.css   # UI styling (panel, tabs, pins, dark mode)
│   └── app.js       # Map, layers, search, reverse geocoding, routing, geolocation
├── server.js        # Zero-dependency Node.js static file server
├── package.json
├── LICENSE
└── README.md
```

---

## 🛠️ Tech stack

- **[Leaflet 1.9.4](https://leafletjs.com/)**: lightweight open-source map library
- **[OpenStreetMap](https://www.openstreetmap.org/)**: street map tiles and map data
- **[Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9)**: satellite imagery
- **[OpenTopoMap](https://opentopomap.org/)**: terrain / topographic map
- **[CARTO](https://carto.com/basemaps/)**: dark basemap
- **[Nominatim](https://nominatim.org/)**: search and reverse geocoding
- **[OSRM](https://project-osrm.org/)**: open-source routing engine for driving directions
- **Node.js `http` module**: local static server

---

## 🗺️ Roadmap

- [ ] Walking and cycling directions
- [ ] Search autocomplete as you type
- [ ] Nearby places (restaurants, fuel, ATMs)
- [ ] Save favourite places and recent searches
- [ ] Share a location link
- [ ] Live traffic layer

---

## 🙏 Attribution

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Imagery © Esri, Maxar, Earthstar Geographics. Terrain style © OpenTopoMap. Dark basemap © CARTO. Routing by [OSRM](https://project-osrm.org/).

The public Nominatim and OSRM demo servers are meant for light use. If you deploy this app publicly, follow the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) and the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/), or host your own instances.

## 📄 License

Released under the [MIT License](LICENSE).
