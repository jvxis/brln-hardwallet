import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { translate, hasEnglish } from './i18n'
import { parseDisplayMessage } from './embed'

// Every literal passed to $t() in the UI must have an English translation.
// Portuguese keys contain no apostrophes, so a quoted literal is [^']+.
const literals = (file: string) => [...readFileSync(file, 'utf8').matchAll(/\$t\('([^']+)'/g)].map(m => m[1])
const conditional = (file: string) => [...readFileSync(file, 'utf8').matchAll(/\$t\(([^)]*\?[^)]*)\)/g)]
  .flatMap(m => [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]))

describe('LightningOS language', () => {
  it('covers every UI string in English', () => {
    const missing = ['src/routes/+page.svelte', 'src/lib/FirmwareInstaller.svelte']
      .flatMap(file => [...literals(file), ...conditional(file)])
      // Lowercase ASCII words are compared state values (e.g. 'club', 'done'), not text.
      .filter(text => !/^[a-z-]+$/.test(text) && /[A-Za-zÀ-ú]/.test(text) && !hasEnglish(text))
    expect([...new Set(missing)]).toEqual([])
  })
  it('translates messages with values and keeps Portuguese as the source', () => {
    expect(translate('Saldo insuficiente: faltam 70.209 sats, incluindo a taxa de 209 sats.', 'en')).toBe('Insufficient balance: 70,209 sats missing, including a fee of 209 sats.')
    expect(translate('Confira o código 5D51 CEBF na tela do BR⚡LN Signer. Os códigos são iguais?', 'en')).toBe('Check code 5D51 CEBF on the BR⚡LN Signer screen. Do the codes match?')
    expect(translate('Bloco {height}', 'en', { height: '972,967' })).toBe('Block 972,967')
    expect(translate('Bloco {height}', 'pt-BR', { height: '972.967' })).toBe('Bloco 972.967')
    expect(translate('Serial connection closed', 'pt-BR')).toBe('Conexão serial encerrada.')
    expect(translate('Falha na sincronização. A última consulta continua visível; os dados podem estar desatualizados.', 'en')).toBe('Synchronization failed. The last query stays visible; data may be out of date.')
  })
  it('accepts display updates only from the LightningOS Manager parent', () => {
    const parent = {} as Window, other = {} as Window
    const data = { type: 'brln-hardwallet:display', visualTheme: 'sovereign-grid', palette: 'teal', mode: 'dark', lang: 'en' }
    const event = (source: Window, origin: string, payload: unknown = data) => ({ source, origin, data: payload }) as unknown as MessageEvent
    expect(parseDisplayMessage(event(parent, 'https://node:8443'), parent, 'https://node:8443')?.lang).toBe('en')
    expect(parseDisplayMessage(event(other, 'https://node:8443'), parent, 'https://node:8443')).toBeNull()
    expect(parseDisplayMessage(event(parent, 'https://evil:8443'), parent, 'https://node:8443')).toBeNull()
    expect(parseDisplayMessage(event(parent, 'https://node:8443', { ...data, lang: 'fr' }), parent, 'https://node:8443')?.lang).toBeNull()
  })
})
