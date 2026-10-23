import { describe, expect, it } from 'vitest'
import { deriveChannel, open, seal } from './brln-channel'

// The same vectors are asserted against the firmware in tests/brln_channel_test.cpp.
const fill = (length: number, value: number) => new Uint8Array(length).fill(value)
const HOST_FIRST = '444444444444444444444444444444444926cbfa61f71f1a4259d16339a9fe541ce14b2c3b946d92e421d830b65d6e6b3914e18b9f23ab7480a619f38a6a3aeb1cd484b38d5c17bbeac0136772267dc9'
const HOST_SECOND = '45454545454545454545454545454545047af7ead7f418a9816c1b07636b0c86fde8f43448e5dc3468a906b3135fd6762f281808d86191f0865af8a114dd7100cd6eed91a51248b280589c74c6be6a7b61d38a373864505672d545e1bf89c88b'
const DEVICE_FIRST = '5555555555555555555555555555555541ce9b4d5faf48c1bbcfa13a815111301bb278bfcb641f80ea29e3dbd2dcd4f61daa8be5182ecb428448f5004fd1c090fdbb1a2d9516ef4a87eb1fd0f307acf9'
const pair = () => ({
  host: deriveChannel(fill(32, 0x11), fill(64, 0x22), fill(64, 0x33)),
  device: deriveChannel(fill(32, 0x11), fill(64, 0x22), fill(64, 0x33), true),
})

describe('brln-3 serial channel', () => {
  it('matches the firmware vectors in both directions', () => {
    const { host, device } = pair()
    expect(host.sas).toBe('B971 626B')
    expect(device.sas).toBe(host.sas)
    expect(seal(host.channel, '/capabilities', fill(16, 0x44))).toBe(HOST_FIRST)
    expect(seal(host.channel, '/xpub Mainnet m/84h/0h/0h', fill(16, 0x45))).toBe(HOST_SECOND)
    expect(open(host.channel, DEVICE_FIRST)).toBe('/capabilities brln-3')
  })
  it('accepts each frame once, in order, and only for its direction', () => {
    const { device } = pair()
    expect(() => open(device.channel, HOST_SECOND)).toThrow('sequence')
    expect(open(device.channel, HOST_FIRST)).toBe('/capabilities')
    expect(() => open(device.channel, HOST_FIRST)).toThrow('sequence')
    expect(() => open(device.channel, DEVICE_FIRST)).toThrow('authentication')
    expect(open(device.channel, HOST_SECOND)).toBe('/xpub Mainnet m/84h/0h/0h')
  })
  it('rejects tampered, truncated and different-session frames', () => {
    for (const position of [0, 40, 160]) {
      const { device } = pair()
      const tampered = HOST_FIRST.slice(0, position) + (HOST_FIRST[position] === '0' ? '1' : '0') + HOST_FIRST.slice(position + 1)
      expect(() => open(device.channel, tampered)).toThrow()
    }
    expect(() => open(pair().device.channel, HOST_FIRST.slice(0, -32))).toThrow()
    const other = deriveChannel(fill(32, 0x12), fill(64, 0x22), fill(64, 0x33), true)
    expect(other.sas).not.toBe('B971 626B')
    expect(() => open(other.channel, HOST_FIRST)).toThrow('authentication')
  })
  it('round-trips long UTF-8 responses with random IVs', () => {
    const { host, device } = pair()
    const message = '/sign 1 ' + 'Q'.repeat(20_000) + ' ⚡'
    const first = seal(device.channel, message), second = seal(device.channel, message)
    expect(first.slice(0, 32)).not.toBe(second.slice(0, 32))
    expect(open(host.channel, first)).toBe(message)
    expect(open(host.channel, second)).toBe(message)
  })
})
