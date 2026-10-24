import { parseAppearance, type Appearance } from './los-appearance'
import { parseLang, type Lang } from './i18n'

// LightningOS embeds this app in an iframe served by its Manager on the same
// host (port 8443). Messages carry only display data and are origin-checked.
const managerOrigin = () => `https://${location.hostname}:8443`
export const embedded = () => window.parent !== window

function post(data: object) {
  if (embedded()) window.parent.postMessage(data, managerOrigin())
}

/** Keep the iframe as tall as the content, so only the LightningOS page scrolls. */
export function reportHeight(element: HTMLElement) {
  if (!embedded()) return () => {}
  let last = 0
  const send = () => {
    const height = Math.ceil(element.getBoundingClientRect().height)
    if (Math.abs(height - last) > 1) { last = height; post({ type: 'brln-hardwallet:height', height }) }
  }
  const observer = new ResizeObserver(send)
  observer.observe(element)
  send()
  return () => observer.disconnect()
}

/** Ask LightningOS to scroll a dialog (positioned at `top` in this document) into view. */
export const reveal = (top: number) => post({ type: 'brln-hardwallet:reveal', top: Math.max(0, Math.round(top)) })

export type DisplayUpdate = { appearance: Appearance | null; lang: Lang | null }
export function parseDisplayMessage(event: MessageEvent, parent: Window | null = window.parent, origin = managerOrigin()): DisplayUpdate | null {
  if (event.source !== parent || event.origin !== origin) return null
  const data = event.data as Record<string, unknown> | null
  if (!data || data.type !== 'brln-hardwallet:display') return null
  return { appearance: parseAppearance({ visualTheme: data.visualTheme, palette: data.palette, mode: data.mode }), lang: parseLang(data.lang) }
}
