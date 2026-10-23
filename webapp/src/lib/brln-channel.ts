import aesjs from 'aes-js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from './utils'

// brln-3 serial channel. Mirrors wallet/brln_channel.h byte for byte:
// HKDF-SHA256 keys per direction, AES-256-CBC, HMAC-SHA256 over IV and
// ciphertext, and a strict counter inside every frame.
export type Channel = {
  sendEncryption: Uint8Array
  sendAuthentication: Uint8Array
  receiveEncryption: Uint8Array
  receiveAuthentication: Uint8Array
  sendCounter: bigint
  receiveCounter: bigint
}

const text = new TextEncoder()
const IV_SIZE = 16, TAG_SIZE = 32, HEADER_SIZE = 12

const concat = (...parts: Uint8Array[]) => {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) { result.set(part, offset); offset += part.length }
  return result
}

export const formatSas = (bytes: Uint8Array) => {
  const hex = bytesToHex(bytes).toUpperCase()
  return `${hex.slice(0, 4)} ${hex.slice(4, 8)}`
}

export function deriveChannel(shared: Uint8Array, hostPublicKey: Uint8Array, devicePublicKey: Uint8Array, forDevice = false) {
  if (shared.length !== 32 || hostPublicKey.length !== 64 || devicePublicKey.length !== 64)
    throw new Error('Invalid pairing material')
  const salt = sha256(concat(text.encode('BRLN pair v3'), hostPublicKey, devicePublicKey))
  const keys = hkdf(sha256, shared, salt, text.encode('BRLN channel v3'), 128)
  const sas = hkdf(sha256, shared, salt, text.encode('BRLN SAS v3'), 4)
  const hostToDevice = keys.slice(0, 64), deviceToHost = keys.slice(64, 128)
  const send = forDevice ? deviceToHost : hostToDevice
  const receive = forDevice ? hostToDevice : deviceToHost
  keys.fill(0); salt.fill(0)
  const channel: Channel = {
    sendEncryption: send.slice(0, 32), sendAuthentication: send.slice(32),
    receiveEncryption: receive.slice(0, 32), receiveAuthentication: receive.slice(32),
    sendCounter: 0n, receiveCounter: 0n,
  }
  send.fill(0); receive.fill(0)
  const code = formatSas(sas)
  sas.fill(0)
  return { channel, sas: code }
}

export function clearChannel(channel: Channel | null) {
  if (!channel) return
  for (const key of [channel.sendEncryption, channel.sendAuthentication, channel.receiveEncryption, channel.receiveAuthentication]) key.fill(0)
}

export function seal(channel: Channel, message: string, iv: Uint8Array = crypto.getRandomValues(new Uint8Array(IV_SIZE))) {
  if (iv.length !== IV_SIZE) throw new Error('Invalid IV')
  const payload = text.encode(message)
  const body = new Uint8Array(Math.ceil((HEADER_SIZE + payload.length) / 16) * 16)
  const view = new DataView(body.buffer)
  view.setBigUint64(0, channel.sendCounter)
  view.setUint32(8, payload.length)
  body.set(payload, HEADER_SIZE)
  const ciphertext = new aesjs.ModeOfOperation.cbc(channel.sendEncryption, iv).encrypt(body)
  const authenticated = concat(iv, ciphertext)
  const tag = hmac(sha256, channel.sendAuthentication, authenticated)
  channel.sendCounter++
  const result = bytesToHex(concat(authenticated, tag))
  payload.fill(0); body.fill(0); ciphertext.fill(0)
  return result
}

export function open(channel: Channel, hex: string) {
  const sealed = hexToBytes(hex)
  const bodySize = sealed.length - IV_SIZE - TAG_SIZE
  if (bodySize < 16 || bodySize % 16) throw new Error('Invalid sealed frame')
  const authenticated = sealed.subarray(0, IV_SIZE + bodySize)
  const expected = hmac(sha256, channel.receiveAuthentication, authenticated)
  const received = sealed.subarray(IV_SIZE + bodySize)
  let difference = 0
  for (let i = 0; i < TAG_SIZE; i++) difference |= expected[i] ^ received[i]
  if (difference) throw new Error('Frame authentication failed')
  const body = new aesjs.ModeOfOperation.cbc(channel.receiveEncryption, sealed.subarray(0, IV_SIZE))
    .decrypt(sealed.subarray(IV_SIZE, IV_SIZE + bodySize))
  try {
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength)
    const length = view.getUint32(8)
    if (view.getBigUint64(0) !== channel.receiveCounter || length > bodySize - HEADER_SIZE)
      throw new Error('Frame out of sequence')
    const message = new TextDecoder('utf-8', { fatal: true }).decode(body.subarray(HEADER_SIZE, HEADER_SIZE + length))
    channel.receiveCounter++
    return message
  } finally { body.fill(0) }
}
