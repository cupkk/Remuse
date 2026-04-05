# High-Precision Perler Conversion Plan

## Goal

The target is not "generate a rough-looking bead preview". The target is:

1. A user uploads a photo or illustration.
2. The system outputs a perler pattern that can be built reliably by hand.
3. The output is stable enough to drive a bill of materials and a fulfillment flow for material kits.

That changes the engineering target. The algorithm must optimize for buildability, palette fidelity, and repeatability, not only visual similarity on screen.

## What Was Fixed Now

The current service implementation in [services/perlerPattern.ts](../services/perlerPattern.ts) was upgraded in four places:

1. Color matching now uses CIEDE2000-style perceptual distance instead of plain RGB Euclidean distance.
2. `dominant` mode no longer counts exact source RGBs, which is unstable on real photos where almost every pixel is unique. It now votes against the fixed bead palette.
3. Average color extraction now uses weighted sampling and linear-light averaging, which avoids gamma bias when collapsing many pixels into one bead.
4. Similar-color merging and artifact smoothing are more conservative, so the generator keeps detail instead of over-simplifying.

The old parity test duplicated the old RGB algorithm, so it was replaced with deterministic fixture outputs in [tests/perler/perler-parity.ts](../tests/perler/perler-parity.ts).

## Commercial-Grade Pipeline

### 1. Input normalization

Before quantization, normalize the source:

1. Apply EXIF orientation.
2. Detect subject bounds and crop transparent or empty margins.
3. Separate transparent background, flat background, and photographic background as different cases.
4. Reject images whose smallest important features are below the target bead resolution.

This matters because many bad perler conversions are resolution failures, not color failures.

### 2. Resolution selection before color selection

Users should not only pick `columns`. The system should estimate a safe build size.

Recommended heuristic:

1. Detect edge density and count thin structures.
2. Simulate multiple candidate grids, for example `24 / 32 / 48 / 64 / 72`.
3. Score each candidate on:
   - edge retention
   - number of isolated beads
   - region fragmentation
   - estimated unique colors
4. Auto-pick the lowest resolution that still passes a quality gate.

If a face, text, or logo cannot survive at `32` columns, the system should push the user to `48+` instead of silently generating an unusable pattern.

### 3. Fixed-palette quantization against the real bead catalog

A perler product is a fixed-palette problem. The algorithm must quantize directly into the actual sellable bead palette.

Recommended approach:

1. Keep a canonical bead palette with vendor code, display name, hex, Lab color, stock status, and replacement fallback.
2. Use perceptual distance in Lab space. CIEDE2000 is a better operational choice than raw RGB distance for choosing the nearest bead.
3. Run quantization in a fixed-palette workflow, not a free palette workflow.
4. Weight important regions more heavily than low-value background pixels.

For a stronger next step than the current in-house implementation, integrate `libimagequant` or a similar fixed-palette quantizer and feed it:

1. The real bead palette as fixed colors.
2. An importance map for subject, face, eyes, outlines, logo edges, or text.
3. A quality floor, so low-quality remaps fail instead of being silently accepted.

### 4. Dithering must be selective, deterministic, and low-noise

Dithering helps gradients, but it also creates build complexity and material fragmentation.

Recommended policy:

1. Use no dithering for logos, icons, flat illustration, and line art.
2. Use low-strength error diffusion only in smooth gradients and skin-like transitions.
3. Suppress dithering near strong edges, text, and high-contrast outlines.
4. Make the result deterministic so the same image always maps to the same bill of materials.

For commercial patterns, uncontrolled dithering is dangerous because it increases single-bead islands and makes manual assembly harder.

### 5. Manufacturability post-processing

After palette mapping, optimize for human assembly:

1. Remove isolated single beads when the visual loss is small.
2. Limit tiny fragmented regions.
3. Preserve outlines and feature anchors such as pupils, mouth corners, text stems, and logo corners.
4. Compute connected components per color and flag suspicious micro-fragments.
5. Split oversized patterns into boards or plates automatically.

This stage should be treated as a second optimization pass, not a cosmetic cleanup.

### 6. Quality gates before allowing checkout

Do not let every generated pattern proceed to commerce. Add automatic rejection or warning thresholds:

1. Maximum remapping error.
2. Maximum isolated-bead ratio.
3. Maximum fragmentation ratio.
4. Minimum edge-retention score.
5. Maximum color count for the selected kit tier.

If the pattern fails, the UI should say exactly why:

1. "Current resolution loses facial detail. Try 48 columns."
2. "This image produces too many isolated beads for beginner assembly."
3. "This image exceeds the selected 12-color material kit."

### 7. Bill of materials and fulfillment outputs

Once the pattern is stable, generate fulfillment artifacts directly:

1. bead code -> count
2. substitute-safe variants by vendor
3. kit tier recommendation
4. plate count and layout
5. printable guide and CSV
6. assembly difficulty score

This is where the algorithm becomes a supply-chain primitive instead of just a graphics feature.

## Recommended Next Engineering Steps

### Phase 1: improve current TypeScript path

1. Add automatic resolution recommendation.
2. Add edge-retention and fragmentation scoring.
3. Add deterministic quality gates and reject low-quality outputs.
4. Add "logo / illustration / photo" presets with different dithering and smoothing policies.

### Phase 2: fixed-palette quantization backend

1. Introduce a native or service-side quantization worker using `libimagequant`.
2. Supply the bead palette as fixed colors.
3. Feed a per-pixel importance map into quantization.
4. Store quantization score, remapping score, and fragmentation score with the generated pattern.

### Phase 3: commerce integration

1. Map bead codes to SKU inventory.
2. Support vendor-specific replacements and out-of-stock substitutions.
3. Generate kit BOM, picking list, and one-click vendor order payload.
4. Add "beginner / standard / collector" pattern difficulty tiers.

## Sources

1. Gaurav Sharma, Wencheng Wu, Edul N. Dalal, "The CIEDE2000 Color-Difference Formula: Implementation Notes, Supplementary Test Data, and Mathematical Observations"
   - https://www.ece.rochester.edu/~gsharma/ciede2000/ciede2000noteCRNA.pdf
2. OpenCV `resize()` documentation
   - https://docs.opencv.org/4.x/da/d54/group__imgproc__transform.html
3. Pillow resampling filters documentation
   - https://pillow.readthedocs.io/en/latest/handbook/concepts.html
4. libimagequant documentation
   - https://pngquant.org/lib/
5. pngquant project overview
   - https://pngquant.org/
6. ImageMagick quantization and remap examples
   - https://usage.imagemagick.org/quantize/
