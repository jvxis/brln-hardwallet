import { afterEach, describe, expect, it, vi } from 'vitest'
import { BowserDevice } from './bowser'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

class ResetDevice extends BowserDevice {
  protected override async prepareSession() { await this.restartForPairing() }
}

function setup(errorName = 'FramingError', remainingErrors = 1, reset = false, readyDelay: number | null = 2500) {
  let controller: ReadableStreamDefaultController<Uint8Array>
  const good = new ReadableStream<Uint8Array>({ start(c) { controller = c } })
  const failedReader = {
    read: vi.fn().mockRejectedValue(new DOMException('UART startup failure', errorName)),
    cancel: vi.fn().mockResolvedValue(undefined),
    releaseLock: vi.fn(() => { remainingErrors-- }),
  }
  const port = {
    open: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn(),
    setSignals: vi.fn(async (signals: { requestToSend: boolean }) => {
      if (!signals.requestToSend && readyDelay !== null)
        setTimeout(() => controller.enqueue(new TextEncoder().encode('/password-clear 1\n')), readyDelay)
    }),
    get readable() { return remainingErrors > 0 ? { getReader: () => failedReader } : good },
    writable: new WritableStream<Uint8Array>({ write(bytes) {
      if (new TextDecoder().decode(bytes).startsWith('/ping '))
        controller.enqueue(new TextEncoder().encode('/ping 0 test-device\n'))
    } }),
  }
  vi.stubGlobal('navigator', { serial: { requestPort: async () => port } })
  vi.stubGlobal('location', { host: 'localhost' })
  const Device = reset ? ResetDevice : BowserDevice
  const device = new Device({ confirmPair: async () => true, psbtReview: vi.fn(), log: vi.fn(), state: vi.fn() })
  // Isolate serial startup: cryptographic pairing has separate transport tests.
  const pair = vi.fn().mockResolvedValue(undefined)
  Object.assign(device, { pair })
  return { device, port, failedReader, pair, failRead: () => controller.error(new DOMException('UART error', 'FramingError')),
    reboot: () => controller.enqueue(new TextEncoder().encode('/password-clear 1\n')) }
}

describe('serial startup and cleanup', () => {
  it('waits for actual BRLN startup after resetting before beginning the protocol', async () => {
    vi.useFakeTimers()
    const { device, port, pair } = setup('FramingError', 1, true)
    const connected = device.connect()
    await vi.advanceTimersByTimeAsync(1100)
    expect(pair).not.toHaveBeenCalled()
    expect(port.setSignals.mock.calls.map(call => call[0])).toEqual([
      { dataTerminalReady: false, requestToSend: true },
      { dataTerminalReady: false, requestToSend: false },
    ])
    await vi.advanceTimersByTimeAsync(2000); await connected
    expect(device.connected).toBe(true)
    await device.disconnect()
  })
  it('times out and releases the port if the board never finishes starting', async () => {
    vi.useFakeTimers()
    const { device, port, pair } = setup('FramingError', 1, true, null)
    const result = device.connect().then(() => 'connected', () => 'failed')
    await vi.advanceTimersByTimeAsync(21000)
    expect(await result).toBe('failed')
    expect(port.close).toHaveBeenCalledOnce()
    expect(pair).not.toHaveBeenCalled()
  })
  it('invalidates an idle paired session on a firmware reboot', async () => {
    vi.useFakeTimers()
    const { device, port, reboot } = setup()
    const connected = device.connect()
    await vi.advanceTimersByTimeAsync(1100); await connected
    reboot(); await vi.advanceTimersByTimeAsync(0)
    expect(device.connected).toBe(false)
    expect(port.close).toHaveBeenCalledOnce()
  })
  it('recovers a boot-time UART framing error before the first command', async () => {
    vi.useFakeTimers()
    const { device, failedReader, port } = setup()
    const connection = device.connect()
    const result = expect(connection).resolves.toBeUndefined()
    await vi.advanceTimersByTimeAsync(1100)
    await result
    expect(failedReader.releaseLock).toHaveBeenCalledOnce()
    expect(device.connected).toBe(true)
    await device.disconnect()
    expect(port.close).toHaveBeenCalledOnce()
  })
  it('closes the port after an unrecoverable reader failure', async () => {
    vi.useFakeTimers()
    const { device, port, pair } = setup('NetworkError')
    const connection = device.connect()
    const result = expect(connection).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(1100)
    await result
    expect(port.close).toHaveBeenCalledOnce()
    expect(pair).not.toHaveBeenCalled()
    expect(device.connected).toBe(false)
  })
  it('limits startup recovery instead of looping forever on a faulty UART', async () => {
    vi.useFakeTimers()
    const { device, port, failedReader, pair } = setup('FramingError', 10)
    const result = device.connect().then(() => 'connected', () => 'failed')
    await vi.advanceTimersByTimeAsync(1100)
    expect(await result).toBe('failed')
    expect(failedReader.read).toHaveBeenCalledTimes(4)
    expect(port.close).toHaveBeenCalledOnce()
    expect(pair).not.toHaveBeenCalled()
  })
  it('fails an active command and closes the connection on a later framing error', async () => {
    vi.useFakeTimers()
    const { device, port, failRead } = setup()
    const connected = device.connect()
    await vi.advanceTimersByTimeAsync(1100); await connected
    const request = (device as unknown as { request(command: string, args: string[], secure: boolean): Promise<string> }).request('/test', [], false)
    const result = request.then(() => 'accepted', () => 'failed')
    failRead()
    await vi.advanceTimersByTimeAsync(0)
    expect(await result).toBe('failed')
    expect(port.close).toHaveBeenCalledOnce()
    expect(device.connected).toBe(false)
  })
})
