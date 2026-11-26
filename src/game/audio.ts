/**
 * Tiny synthesized sound kit — no audio files, no external licences.
 */
export class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private sirenOsc: OscillatorNode | null = null
  private sirenGain: GainNode | null = null
  muted = false

  init() {
    if (this.ctx) {
      void this.ctx.resume()
      return
    }
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    this.ctx = new Ctor()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.55
    this.master.connect(this.ctx.destination)
  }

  setMuted(muted: boolean) {
    this.muted = muted
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.05)
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
    if (!this.ctx || !this.master || this.muted) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g)
    g.connect(this.master)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  private noise(dur: number, cutoff: number, gain: number, type: BiquadFilterType = 'lowpass') {
    if (!this.ctx || !this.master || this.muted) return
    const t = this.ctx.currentTime
    const length = Math.floor(this.ctx.sampleRate * dur)
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) {
      const env = 1 - i / length
      data[i] = (Math.random() * 2 - 1) * env * env
    }
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    const filter = this.ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.setValueAtTime(cutoff, t)
    filter.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.25), t + dur)
    const g = this.ctx.createGain()
    g.gain.value = gain
    src.connect(filter)
    filter.connect(g)
    g.connect(this.master)
    src.start(t)
  }

  gunshot() {
    this.noise(0.26, 2600, 0.85)
    this.tone(150, 0.16, 'square', 0.25, 55)
  }

  enemyShot() {
    this.noise(0.2, 1500, 0.5)
    this.tone(110, 0.12, 'square', 0.14, 50)
  }

  dryFire() {
    this.tone(900, 0.04, 'square', 0.12)
  }

  reload() {
    this.tone(420, 0.06, 'square', 0.1)
    window.setTimeout(() => this.tone(560, 0.05, 'square', 0.1), 240)
    window.setTimeout(() => this.tone(720, 0.07, 'square', 0.12), 1900)
  }

  pickup() {
    this.tone(660, 0.09, 'triangle', 0.16)
    window.setTimeout(() => this.tone(990, 0.12, 'triangle', 0.14), 70)
  }

  deposit() {
    this.tone(523, 0.1, 'triangle', 0.16)
    window.setTimeout(() => this.tone(784, 0.1, 'triangle', 0.16), 90)
    window.setTimeout(() => this.tone(1046, 0.18, 'triangle', 0.14), 180)
  }

  takedown() {
    this.noise(0.18, 700, 0.4)
    this.tone(90, 0.2, 'sine', 0.2, 45)
  }

  hurt() {
    this.noise(0.18, 500, 0.5)
    this.tone(80, 0.24, 'sine', 0.22, 40)
  }

  vaultOpen() {
    this.noise(1.0, 320, 0.5)
    this.tone(58, 1.1, 'sawtooth', 0.12, 120)
  }

  alarmStart() {
    if (!this.ctx || !this.master || this.sirenOsc || this.muted) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    const lfo = this.ctx.createOscillator()
    const lfoGain = this.ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.value = 520
    lfo.type = 'triangle'
    lfo.frequency.value = 0.55
    lfoGain.gain.value = 170
    lfo.connect(lfoGain)
    lfoGain.connect(osc.frequency)
    gain.gain.value = 0.045
    osc.connect(gain)
    gain.connect(this.master)
    osc.start(t)
    lfo.start(t)
    this.sirenOsc = osc
    this.sirenGain = gain
  }

  alarmStop() {
    if (this.sirenOsc && this.ctx) {
      this.sirenOsc.stop(this.ctx.currentTime + 0.05)
      this.sirenOsc.disconnect()
      this.sirenGain?.disconnect()
    }
    this.sirenOsc = null
    this.sirenGain = null
  }

  win() {
    const notes = [523, 659, 784, 1046]
    notes.forEach((n, i) => {
      window.setTimeout(() => this.tone(n, 0.28, 'triangle', 0.16), i * 130)
    })
  }

  lose() {
    const notes = [330, 260, 200, 140]
    notes.forEach((n, i) => {
      window.setTimeout(() => this.tone(n, 0.35, 'sawtooth', 0.12), i * 170)
    })
  }
}
