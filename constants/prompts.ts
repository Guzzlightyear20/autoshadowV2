// ─────────────────────────────────────────────────────────────────────────────
// AutoShadow AI — centralised prompt constants
// ─────────────────────────────────────────────────────────────────────────────

export const PROMPT_A_MIRROR =
  "The vehicle pictured in the source image now rests on a highly polished, glossy white studio floor. Below the vehicle is a realistic, soft contact shadow, darkest and sharpest immediately under the tires and lower chassis to anchor it to the ground, and diffusing gently outwards. Furthermore, there are sharp, realistic reflections of the vehicle's body and wheels visible on the glossy surface. All other elements from the original source image, including the entire background environment, original lighting, and any text or graphics present in the frame, remain unchanged.";

export const PROMPT_B_DARK =
  "Based strictly on image, the vehicle pictured now casts a realistic, soft contact shadow on the surface directly beneath it. This shadow is darkest immediately under the tires and chassis to anchor the car to the ground, and fades gently outwards. All other elements of image, including the vehicle's specific appearance, the entire background environment, original lighting, reflections, and any text or graphics present in the frame, remain absolutely identical to the original source image.";

export const PROMPT_C_BACKGROUND = `TRIGGER: "Edición de Fondos" (BACKGROUND EDIT)
ACTIVATE PROMPT C: You will receive two images:
IMAGE 1: The SOURCE VEHICLE.
IMAGE 2: The BACKGROUND TEMPLATE.

STRICT INSTRUCTIONS:
1) ABSOLUTE IDENTITY PRESERVATION: The vehicle in the final result MUST be the EXACT SAME vehicle from IMAGE 1. This is a "cut and paste" operation. DO NOT generate a new car. DO NOT modify the car's model, year, color, wheels, trim, or any specific details. It must be a pixel-perfect extraction.
2) NO RE-IMAGINING: Do not change the car's pose, angle, or perspective. It must look exactly as it does in IMAGE 1, just placed in a new environment.
3) EXTRACTION: Isolate the car from IMAGE 1 with professional precision. Remove every pixel of the original background.
4) COMPOSITION: Place the extracted car from IMAGE 1 onto the BACKGROUND TEMPLATE (IMAGE 2).
5) SCALING: Scale the car to occupy 85-90% of the width of the background.
6) INTEGRATION:
   - Create realistic contact shadows under the tires to anchor it to the floor of IMAGE 2.
   - Add a sharp mirror reflection of the car on the glossy floor of the template.
   - Adjust the car's lighting and color balance ONLY to match the studio lighting of IMAGE 2, while keeping the car's original color and features intact.
7) BACKGROUND INTEGRITY: Do not modify any text, logos, or design elements of the BACKGROUND TEMPLATE (IMAGE 2).`;

export const PROMPT_REMOVE_BACKGROUND_WHITE = `Actúa como un retocador fotográfico automotriz de alta gama. Tu objetivo es procesar la imagen adjunta del vehículo para adaptarla a un estándar de exhibición de estudio profesional. Ejecuta las siguientes instrucciones con precisión:

1. EXTRACCIÓN Y FONDO:
- Recorta el vehículo aislando perfectamente todos los bordes (carrocería, neumáticos, espejos).
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

export const PROMPT_REMOVE_BACKGROUND_TRANSPARENT = `TASK: Background Removal (Transparent)
INSTRUCTIONS:
1) Completely isolate the subject (the vehicle) from its original background.
2) The resulting image MUST have a transparent background (alpha channel).
3) CRITICAL: Do NOT modify the subject in any way. Keep the original colors, size, texture, and details pixel-perfectly consistent with the source image.
4) Output ONLY the subject on transparency. No background pixels allowed.`;

export const PROMPT_REMOVE_BACKGROUND_INTERIOR = `A precise, high-definition professional studio photograph of the entire, exact car interior cabin derived from image_#.*.*, with the fundamental and non-negotiable instruction that absolutely nothing within the cabin is altered. This includes the retention, unaltered in color, shape, and specific location, of all individual features: the tan-colored leather seats, the unique front seat headrest designs with their black supports, the complete rear-seat bench, all seat belts and buckles, the central rear console with its specific touch screen interface (including all icons and graphics), the air vents, all window switches, and every specific textured trim piece and metallic accent. The sole and only modification is the precise, surgical removal of all exterior elements (buildings, trees, sky) visible through all glass surfaces (windshield, all side windows, rear window, and the entire panoramic sunroof structure). The removed background must be replaced by a flawless, seamless, pure, neutral, high-key studio white background, creating a zero-distraction void while preserving museum-quality fidelity of the interior. The cutouts around complex edges, especially the headrest structures and window frames, are surgically sharp with no original background bleed. Internal lighting is adjusted to be even and soft, consistent with a pure white studio surround, while strictly maintaining the true colors of all internal materials. Nothing is added, removed, or changed within the cabin. All buttons, features, and textures are preserved as in image_#.*.*`;
