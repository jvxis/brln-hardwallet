export const visualThemes = ['sovereign-grid','signal-deck','block-zero','airplane-mode','miner-watch','kernel'] as const
export const palettes = ['teal','bitcoin','ocean','sunset','orchid','forest','aurora','ember','slate','phosphor-white','phosphor-amber','phosphor-green'] as const
export type Appearance = { visualTheme: string; palette: string; mode: 'light' | 'dark' }
export function parseAppearance(value: unknown): Appearance | null {
  if (!value || typeof value !== 'object') return null
  const a = value as Record<string, unknown>
  if (!visualThemes.includes(a.visualTheme as typeof visualThemes[number]) || !palettes.includes(a.palette as typeof palettes[number]) || !['light','dark'].includes(String(a.mode))) return null
  return { visualTheme: a.visualTheme as string, palette: a.palette as string, mode: ['airplane-mode','miner-watch','kernel'].includes(String(a.visualTheme)) ? 'dark' : a.mode as 'light'|'dark' }
}
