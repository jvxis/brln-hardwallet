import { describe, expect, it } from 'vitest'
import { parseAppearance, visualThemes, palettes } from './los-appearance'
describe('LOS appearance input boundary',()=>{
 it('accepts all published LOS themes and palettes',()=>{
  for(const visualTheme of visualThemes) for(const palette of palettes) for(const mode of ['light','dark'])
   expect(parseAppearance({visualTheme,palette,mode})).toMatchObject({visualTheme,palette})
 })
 it('preserves the LOS dark-only rule',()=>{
  for(const visualTheme of ['kernel','airplane-mode','miner-watch'])
   expect(parseAppearance({visualTheme,palette:'teal',mode:'light'})?.mode).toBe('dark')
 })
 it('rejects arbitrary style values and incomplete data',()=>{
  for(const data of [null,{},'dark',{visualTheme:'url(https://invalid)',palette:'teal',mode:'dark'},{visualTheme:'kernel',palette:'invalid',mode:'dark'},{visualTheme:'kernel',palette:'teal',mode:'invalid'}])
   expect(parseAppearance(data)).toBeNull()
 })
})
