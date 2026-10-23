# 003: CSS blobs for the MVP, 3D later, no pixel art

**Decision:** The MVP office uses plain DOM + CSS blobs. The long-term office is 3D with React Three Fiber (primitives first, nicer models later). There is no 2D pixel-art phase.

**Why:**
- Blobs need no assets, are quick to build, and test the real hard part: mapping SDK events to states at the right moment. They're throwaway by design.
- 3D is the direction I actually want (orbit, pan, zoom). React Three Fiber + drei give camera controls cheaply, and primitives are a small step from blobs.
- Pixel art isn't easier (sprite sheets per character per state, a tilemap, consistent art), so it would be a detour.

**Alternatives considered:**
- PixiJS pixel sprites.
- Phaser (overkill without game mechanics).

Details: [vision.md, Design](../vision.md#8-design).
