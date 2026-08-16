// ─────────────────────────────────────────────────────────────────────────────
// AutoShadow AI — centralised prompt constants
// ─────────────────────────────────────────────────────────────────────────────

export const PROMPT_A_MIRROR =
  "The vehicle pictured in the source image now rests on a highly polished, glossy white studio floor. Below the vehicle is a realistic, soft contact shadow, darkest and sharpest immediately under the tires and lower chassis to anchor it to the ground, and diffusing gently outwards. Furthermore, there are sharp, realistic reflections of the vehicle's body and wheels visible on the glossy surface. All other elements from the original source image, including the entire background environment, original lighting, and any text or graphics present in the frame, remain unchanged.";

export const PROMPT_B_DARK =
  "Based strictly on image, the vehicle pictured now casts a realistic, soft contact shadow on the surface directly beneath it. This shadow is darkest immediately under the tires and chassis to anchor the car to the ground, and fades gently outwards. All other elements of image, including the vehicle's specific appearance, the entire background environment, original lighting, reflections, and any text or graphics present in the frame, remain absolutely identical to the original source image.";

// Default prompt for "Analizar" — used both as the textarea's starting value (resetState)
// and as the fallback if the user clears the field before running the action.
export const PROMPT_ANALYZE_DEFAULT =
  'Analiza este vehículo: marca, modelo estimado, color y características visibles.';

export const PROMPT_SHADOW_FINISH = `TASK: Add realistic contact shadow and reflection to an already-composited scene.
You will receive a single image: a vehicle already placed onto a background scene, both flattened into one image.

STRICT INSTRUCTIONS:
1) ABSOLUTE IDENTITY PRESERVATION: This is a "cut and paste" operation, not a re-drawing. The vehicle in the output MUST be pixel-identical to the vehicle in the input — same model, year, color, wheels, trim, badges, and every add-on or aftermarket part exactly as shown (spoilers/wings, splitters, side skirts, exhaust tips, mirrors, antennas, roof racks, decals, stripes). DO NOT omit, simplify, redraw, or "clean up" any part of the vehicle, even if it looks unusual or aftermarket. If a part is visible in the input, it MUST be visible in the output in the same shape and position.
2) DO NOT move, resize, rotate, or reposition the vehicle in any way. Its placement, scale, and pose are already final and correct.
3) Add a realistic, soft contact shadow beneath the vehicle, darkest and sharpest directly under the tires, to visually anchor it to the floor.
4) If the floor surface looks glossy/reflective, add a subtle mirror reflection of the vehicle's underside.
5) Adjust ONLY the vehicle's lighting and color balance to match the ambient lighting/color temperature of the background scene, while keeping its original color and features intact.
6) Do not modify the background itself (text, logos, design elements) beyond adding the shadow/reflection.`;

export const PROMPT_REMOVE_BACKGROUND_WHITE = `Actúa como un retocador fotográfico automotriz de alta gama. Tu objetivo es procesar la imagen adjunta del vehículo para adaptarla a un estándar de exhibición de estudio profesional. Ejecuta las siguientes instrucciones con precisión:

0. PRESERVACIÓN ABSOLUTA DE IDENTIDAD: [RESTRICCIÓN CRÍTICA] Esto es una operación de "recorte", no un redibujado. El vehículo del resultado debe ser idéntico al original: mismo modelo, año, color, llantas, tapizado, insignias, y cada parte agregada o de aftermarket exactamente como aparece (alerones/spoilers, splitters, faldones laterales, puntas de escape, espejos, antenas, portaequipajes, calcomanías, franjas). NO omitas, simplifiques, redibujes ni "limpies" ninguna parte del vehículo, aunque parezca inusual o de aftermarket. Si una pieza es visible en el original, debe seguir siendo visible en el resultado, con la misma forma y posición.

1. EXTRACCIÓN Y FONDO:
- Recorta el vehículo (con todas sus partes intactas según el punto 0) aislando perfectamente todos los bordes (carrocería, neumáticos, espejos, alerones y demás salientes).
- Elimina el fondo original por completo y reemplázalo por un fondo blanco puro (#FFFFFF).
- Genera una sombra de contacto suave, difuminada y realista debajo del vehículo para integrarlo al nuevo fondo y evitar que parezca "flotando".

2. NEUTRALIZACIÓN DE REFLEJOS (DE-REFLECTION):
- Identifica y elimina todos los reflejos del entorno exterior presentes en la carrocería (árboles, cielo, postes, asfalto, transeúntes u otros vehículos).
- Reemplaza los reflejos ambientales eliminados con gradientes suaves y lineales, simulando la iluminación controlada de grandes cajas de luz (softboxes) típicas de un estudio automotriz o un ciclorama cerrado.

3. PRESERVACIÓN ESTRICTA DEL COLOR:
- [RESTRICCIÓN CRÍTICA]: El tono, la saturación y la luminosidad de la pintura original deben permanecer absolutamente inalterados. La limpieza de reflejos no debe cambiar el código de color base de la pintura bajo ninguna circunstancia.

4. CRISTALES Y METALES:
- Limpia los cristales (parabrisas y ventanas) de reflejos parasitarios del exterior, manteniendo el nivel de tinte polarizado original y la transparencia estructural.
- Suaviza los contrastes duros en las piezas cromadas, parrilla frontal y llantas de aleación, adaptando su brillo a la nueva iluminación neutra de estudio.`;

// Gemini's image models cannot reliably emit a true PNG alpha channel — asking for
// "transparency" directly tends to produce a white/gray fill or, worse, a literal
// checkerboard pattern painted as pixels (the model copying the standard editor icon
// for transparency instead of actually being transparent). Chroma-key is far more
// reliable: ask for a flat, saturated, known color, then key it out ourselves with
// utils.ts's chromaKeyToTransparent — deterministic, doesn't depend on the model
// understanding alpha at all.
export const PROMPT_REMOVE_BACKGROUND_GREENSCREEN = `TASK: Background Removal (Chroma Key Greenscreen)
INSTRUCTIONS:
1) ABSOLUTE IDENTITY PRESERVATION: This is a "cut and paste" extraction, not a re-drawing. The vehicle MUST be pixel-identical to the source — same model, year, color, wheels, trim, badges, and every add-on or aftermarket part exactly as shown (spoilers/wings, splitters, side skirts, exhaust tips, mirrors, antennas, roof racks, decals, stripes). DO NOT omit, simplify, redraw, or "clean up" any part of the vehicle, even if it looks unusual or aftermarket. If a part is visible in the source, it MUST be visible in the output in the same shape and position.
2) Completely isolate the subject (the vehicle, with every part from instruction 1 intact) from its original background.
3) Replace the background with a single, perfectly flat, uniform, fully saturated pure green (#00FF00 / RGB 0,255,0) — like a professional chroma-key studio backdrop. No gradient, no shading, no texture, no vignette anywhere in the background.
4) Do NOT add any shadow, reflection, or contact shading near the vehicle — the background must be pure flat green all the way up to the vehicle's silhouette edge.
5) Keep the original colors, size, texture, and details pixel-perfectly consistent with the source image.
6) The vehicle itself must not contain any green tint or spill from the backdrop.`;

export const PROMPT_REMOVE_BACKGROUND_INTERIOR = `TASK: Professional studio photograph of the exact car interior cabin from the source image.

STRICT INSTRUCTIONS:
1) CABIN PRESERVATION: Nothing inside the cabin is altered — unchanged in color, shape, and exact location. This includes the seats, headrests and their supports, the rear-seat bench, seat belts and buckles, the center console and its touchscreen interface (icons and graphics included), air vents, window switches, and every textured trim piece and metallic accent.
2) EXTERIOR REMOVAL: The only modification is the precise, surgical removal of all exterior elements (buildings, trees, sky) visible through every glass surface (windshield, all side windows, rear window, and any sunroof).
3) NEW BACKGROUND: Replace the removed exterior with a flawless, seamless, pure, neutral, high-key studio white background — a zero-distraction void behind the glass.
4) CLEAN EDGES: Cutouts around complex edges (headrest structures, window frames) must be surgically sharp, with no original background bleed.
5) LIGHTING: Adjust internal lighting to be even and soft, consistent with a pure white studio surround, while strictly preserving the true colors of all internal materials.
6) Nothing is added, removed, or changed within the cabin beyond what these instructions specify. All buttons, features, and textures are preserved exactly as in the source image.`;
