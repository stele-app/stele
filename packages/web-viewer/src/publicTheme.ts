/**
 * Tokens for the public-facing surface (Landing, About, How, Examples, UseCases).
 *
 * Light theme on purpose: trust register for a viewer that hosts business
 * artifacts. The app interior (Library, Settings, Viewer, Pair) stays dark —
 * that's the working surface, this is the front door.
 *
 * No web fonts: system serif/sans stack only. Loading fonts.googleapis.com
 * would send every visitor's IP to Google, which contradicts the privacy
 * pitch.
 */

export const T = {
  bg: '#ffffff',
  bgAlt: '#fafafa',
  text: '#0a0a0a',
  textMuted: '#525252',
  textFaint: '#a3a3a3',
  border: '#e5e5e5',
  borderStrong: '#d4d4d4',
  accent: '#1d4ed8',
  accentSoft: '#eff6ff',

  fontSerif:
    'Charter, "Bitstream Charter", "Sitka Text", "Iowan Old Style", Cambria, Georgia, serif',
  fontSans:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontMono:
    'ui-monospace, "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace',
} as const;
