# Kart

A Mario Kart-style racing game with a web-based map editor.

## Project Structure

```
kart/
  game/           - 3D racing game (Three.js, Vite)
  map-editor/     - Web-based map editor (TypeScript, Vite)
  maps/           - Saved map data
  kart-gen/       - Kart sprite generation tool
  kart-sprites/   - Kart sprite sheets and metadata
  gamepad-test/   - Gamepad testing utility
```

## Maps

### File Location

Maps are saved to `maps/<map-name>/`. Each map is a directory containing:

| File | Description |
|------|-------------|
| `map.json` | Map metadata, objects, and settings |
| `terrain.png` | Terrain type data as a color-coded PNG |
| `heightmap.png` | Elevation data as a grayscale PNG |
| `color.png` | Visual color layer PNG (uses custom terrain colors) |

### map.json Format

```json
{
  "name": "my-map",
  "width": 256,
  "height": 256,
  "scale": 1,
  "start": {
    "x": 51,
    "y": 162,
    "angle": 1.5707963267948966
  },
  "checkpoints": [
    { "x": 52, "y": 177 },
    { "x": 56, "y": 189 }
  ],
  "boostPads": [
    { "x": 67, "y": 190, "angle": -0.124 }
  ],
  "itemBoxes": [
    { "x": 100, "y": 120 }
  ],
  "terrainColors": {
    "0": "#333333",
    "1": "#4a8c3f",
    "2": "#8b0000"
  }
}
```

**Fields:**

- `name` - Map display name
- `width`, `height` - Map dimensions in pixels (128, 256, 512, or 1024)
- `scale` - World scale multiplier (default 1)
- `start` - Starting position and direction
  - `x`, `y` - Map pixel coordinates
  - `angle` - Direction in radians (0 = right, PI/2 = down)
- `checkpoints` - Ordered array of checkpoint positions. Racers must pass through these in order.
  - `x`, `y` - Map pixel coordinates
- `boostPads` - Speed boost pad placements
  - `x`, `y` - Map pixel coordinates
  - `angle` - Boost direction in radians
- `itemBoxes` - Item pickup locations
  - `x`, `y` - Map pixel coordinates
- `terrainColors` - Custom visual color per terrain type (hex strings, keyed by terrain type index)

### terrain.png

An RGB PNG image matching the map dimensions. Each pixel's color encodes the terrain type:

| Terrain Type | Index | Default Color | Description |
|---|---|---|---|
| Track | 0 | `#333333` | Normal driving surface |
| Off-road | 1 | `#4a8c3f` | Slows karts down |
| Inaccessible | 2 | `#8b0000` | Cannot be driven on |

The terrain PNG always uses these standard colors regardless of custom color settings, so the game can identify terrain types by nearest-color matching.

### heightmap.png

A grayscale PNG matching the map dimensions. Pixel values encode elevation:

- `128` (middle gray) = height 0 (flat)
- `0` (black) = height -1 (lowest)
- `255` (white) = height +1 (highest)

Formula: `height = (pixelValue - 128) / 127`

In the game, heights are scaled by `HEIGHT_SCALE = 20`, so the world-space range is -20 to +20.

### color.png

An RGB PNG matching the map dimensions. This is the **visual appearance layer** — it combines two sources of color:

1. **Per-terrain-type custom colors** (`terrainColors` in map.json) — e.g. making all offroad pixels desert yellow
2. **Per-pixel painted colors** from the Color mode brush — arbitrary colors painted onto individual pixels

Pixels that were hand-painted in Color mode use their painted color. Unpainted pixels use the terrain type's custom color (or default if not customized).

Use `color.png` for rendering the track surface visually and `terrain.png` for determining terrain type/physics.

### World Coordinate Conversion

Map pixel coordinates convert to 3D world coordinates:

```
CELL_SIZE = 3
worldX = (mapX - width/2) * CELL_SIZE * scale
worldZ = (mapY - height/2) * CELL_SIZE * scale
worldY = heightmap[mapY * width + mapX] * HEIGHT_SCALE
```

## Map Editor

### Running

```bash
cd map-editor
npm install
npm run dev
```

### Controls

| Action | Control |
|---|---|
| Pan | Middle mouse or Space + Left click drag |
| Zoom | Scroll wheel (zooms toward cursor) |
| Switch mode | Press 1-7 or click mode buttons |

### Modes

1. **Terrain** - Paint terrain types with a square brush
2. **Height** - Left click to raise, right click to lower (circular soft brush)
3. **Color** - Paint arbitrary colors per-pixel. Left click to paint, right click to erase (reverts to terrain color)
4. **Checkpoint** - Left click to place/drag, right click to delete
5. **Start** - Left click to place, drag to set direction
6. **Boost** - Left click to place, drag to set direction. Right click to delete
7. **Items** - Left click to place/drag, right click to delete

### Terrain Colors

Each terrain type has a customizable visual color. Change colors using the color pickers in the sidebar under "Terrain Colors". Custom colors are saved per-map in `map.json` and exported to `color.png`.

Examples:
- Desert map: set Off-road to `#c2a645` (sandy yellow)
- Snow map: set Off-road to `#d0d8e0` (light blue-gray)
- Lava map: set Inaccessible to `#ff4400` (bright orange-red)

### 3D Preview

Click the "3D Preview" button to open a 3D view of the map at the bottom of the editor. The preview shows terrain with height and custom colors applied. Use the mouse to orbit, scroll to zoom, right click to pan. The divider between 2D and 3D views can be dragged to resize.
