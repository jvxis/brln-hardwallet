import { parseAppearance, type Appearance } from './los-appearance'
import { loadAppearance, saveAppearance } from './storage'
export function initializeAppearance() {
  let appearance: Appearance | null = null
  const params = new URLSearchParams(location.hash.slice(1))
  if (params.has('losTheme')) {
    appearance = parseAppearance({visualTheme:params.get('losTheme'),palette:params.get('losPalette'),mode:params.get('losMode')})
    history.replaceState(null,'',location.pathname+location.search)
  }
  try {
    if (appearance) saveAppearance(appearance)
    else appearance=loadAppearance()
  } catch { /* Appearance storage must never prevent wallet operation. */ }
  appearance ||= {visualTheme:'sovereign-grid',palette:'teal',mode:'dark'}
  const root=document.documentElement
  root.dataset.visualTheme=appearance.visualTheme
  root.dataset.palette=appearance.palette
  root.dataset.theme=appearance.mode
}
