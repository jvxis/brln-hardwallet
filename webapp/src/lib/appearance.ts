import { parseAppearance, type Appearance } from './los-appearance'
import { lang, parseLang, type Lang } from './i18n'
import { loadAppearance, loadLanguage, saveAppearance, saveLanguage } from './storage'

export function applyAppearance(appearance: Appearance) {
  const root=document.documentElement
  root.dataset.visualTheme=appearance.visualTheme
  root.dataset.palette=appearance.palette
  root.dataset.theme=appearance.mode
}
export function applyLanguage(value: Lang) {
  document.documentElement.lang = value
  lang.set(value)
}
// Display preferences arrive from the LightningOS launcher in the fragment, then by message.
export function rememberDisplay(appearance: Appearance | null, language: Lang | null) {
  try {
    if (appearance) saveAppearance(appearance)
    if (language) saveLanguage(language)
  } catch { /* Display storage must never prevent wallet operation. */ }
  if (appearance) applyAppearance(appearance)
  if (language) applyLanguage(language)
}
export function initializeAppearance() {
  let appearance: Appearance | null = null, language: Lang | null = null
  const params = new URLSearchParams(location.hash.slice(1))
  if (params.has('losTheme') || params.has('losLang')) {
    appearance = parseAppearance({visualTheme:params.get('losTheme'),palette:params.get('losPalette'),mode:params.get('losMode')})
    language = parseLang(params.get('losLang'))
    history.replaceState(null,'',location.pathname+location.search)
  }
  try {
    if (appearance) saveAppearance(appearance)
    else appearance=loadAppearance()
    if (language) saveLanguage(language)
    else language=loadLanguage()
  } catch { /* Appearance storage must never prevent wallet operation. */ }
  applyAppearance(appearance || {visualTheme:'sovereign-grid',palette:'teal',mode:'dark'})
  applyLanguage(language || (navigator.language?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en'))
}
