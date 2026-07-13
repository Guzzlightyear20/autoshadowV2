export interface BackgroundPreset {
  id: string;
  name: string;
  path: string; // served as-is from public/, e.g. '/backgrounds/1.jpg'
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { id: 'estudio-blanco', name: 'Estudio Blanco', path: '/backgrounds/1.jpg' },
  { id: 'showroom-calido', name: 'Showroom Cálido', path: '/backgrounds/2.jpg' },
  { id: 'cielo-asfalto', name: 'Cielo y Asfalto', path: '/backgrounds/3.jpg' },
  { id: 'showroom-moderno', name: 'Showroom Moderno', path: '/backgrounds/4.jpg' },
  { id: 'showroom-nocturno', name: 'Showroom Nocturno', path: '/backgrounds/5.jpg' },
];
