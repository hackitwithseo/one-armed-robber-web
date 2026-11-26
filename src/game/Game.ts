import * as THREE from 'three'
import { buildLevel, Level, LootSpot, Rect } from './level'
import { Sfx } from './audio'

const TARGET = 50000
const BAG_SLOTS = 6
const MAG_SIZE = 6
const POLICE_TIME = 90
const PLAYER_RADIUS = 0.38
const EYE_STAND = 1.68
const EYE_CROUCH = 1.02
const RELOAD_TIME = 2.6
const DRILL_TIME = 4.5

type Phase = 'menu' | 'playing' | 'paused' | 'dead' | 'win' | 'busted'

interface Guard {
  group: THREE.Group
  pos: THREE.Vector3
  route: THREE.Vector3[]
  wp: number
  facing: number
  state: 'patrol' | 'alert' | 'dead'
  suspicion: number
  shootCd: number
  searchT: number
  lastKnown: THREE.Vector3
  muzzleT: number
  fall: number
}

interface BagItem {
  value: number
  label: string
}

interface DroppedBag {
  pos: THREE.Vector3
  items: BagItem[]
  mesh: THREE.Group
}

type Interaction =
  | { kind: 'loot'; loot: LootSpot; dist: number }
  | { kind: 'takedown'; guard: Guard; dist: number }
  | { kind: 'vault'; dist: number }
  | { kind: 'pickup'; bag: DroppedBag; dist: number }
  | { kind: 'deposit'; dist: number }
  | { kind: 'escape'; dist: number }

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Missing element #${id}`)
  return el as T
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}

function segmentHitsRect(x0: number, z0: number, x1: number, z1: number, r: Rect): boolean {
  const dx = x1 - x0
  const dz = z1 - z0
  let tmin = 0
  let tmax = 1
  const axes: number[][] = [
    [x0, dx, r.minX, r.maxX],
    [z0, dz, r.minZ, r.maxZ],
  ]
  for (const axis of axes) {
    const p = axis[0]
    const d = axis[1]
    const min = axis[2]
    const max = axis[3]
    if (Math.abs(d) < 1e-8) {
      if (p < min || p > max) return false
    } else {
      let t1 = (min - p) / d
      let t2 = (max - p) / d
      if (t1 > t2) {
        const tmp = t1
        t1 = t2
        t2 = tmp
      }
      tmin = Math.max(tmin, t1)
      tmax = Math.min(tmax, t2)
      if (tmin > tmax) return false
    }
  }
  return true
}

export class Game {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private clock = new THREE.Clock()
  private level: Level
  private sfx = new Sfx()

  private phase: Phase = 'menu'
  private yaw = 0
  private pitch = 0
  private playerPos = new THREE.Vector3()
  private enemyFlash = new THREE.PointLight(0xffce8a, 9, 8, 2)
  private enemyFlashT = 0
  private crouching = false
  private health = 100
  private bob = 0
  private eyeHeight = EYE_STAND
  private damageFlash = 0

  private mag = MAG_SIZE
  private reserve = 24
  private reloading = false
  private reloadT = 0
  private fireCd = 0
  private recoil = 0
  private muzzleT = 0

  private bag: BagItem[] = []
  private banked = 0
  private dropped: DroppedBag[] = []
  private guards: Guard[] = []

  private alarm = false
  private policeT = POLICE_TIME
  private takenDown = 0
  private shotDown = 0
  private shotsFired = 0
  private alarms = 0
  private elapsed = 0
  private drillT = 0
  private vaultOpened = false

  private keys = new Set<string>()
  private current: Interaction | null = null
  private toastT = 0
  private dragging = false
  private dragMoved = 0
  private pressAt = 0

  private isTouch =
    typeof window !== 'undefined' &&
    (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window)
  private touchMove = { x: 0, y: 0 }
  private touchUse = false
  private touchCrouch = false
  private touchSprint = false
  private lookId = -1
  private lookX = 0
  private lookY = 0

  private viewmodel!: THREE.Group
  private gunModel!: THREE.Group
  private bagModel!: THREE.Group
  private muzzleLight!: THREE.PointLight
  private muzzleFlash!: THREE.Mesh
  private gunBase = new THREE.Vector3(0.19, -0.19, -0.46)

  private ui = {
    menu: byId<HTMLElement>('menu'),
    pause: byId<HTMLElement>('pause'),
    end: byId<HTMLElement>('end'),
    hud: byId<HTMLElement>('hud'),
    healthBar: byId<HTMLElement>('healthBar'),
    bankedText: byId<HTMLElement>('bankedText'),
    objectiveBar: byId<HTMLElement>('objectiveBar'),
    bagCount: byId<HTMLElement>('bagCount'),
    bagValue: byId<HTMLElement>('bagValue'),
    stowWarn: byId<HTMLElement>('stowWarn'),
    ammoText: byId<HTMLElement>('ammoText'),
    reloadWrap: byId<HTMLElement>('reloadWrap'),
    reloadBar: byId<HTMLElement>('reloadBar'),
    prompt: byId<HTMLElement>('prompt'),
    promptKey: byId<HTMLElement>('promptKey'),
    promptText: byId<HTMLElement>('promptText'),
    drillWrap: byId<HTMLElement>('drillWrap'),
    drillBar: byId<HTMLElement>('drillBar'),
    alarmBanner: byId<HTMLElement>('alarmBanner'),
    policeTimer: byId<HTMLElement>('policeTimer'),
    toast: byId<HTMLElement>('toast'),
    vignette: byId<HTMLElement>('vignette'),
    crosshair: byId<HTMLElement>('crosshair'),
    endTitle: byId<HTMLElement>('endTitle'),
    endSub: byId<HTMLElement>('endSub'),
    endStats: byId<HTMLElement>('endStats'),
    objectiveText: byId<HTMLElement>('objectiveText'),
  }

  constructor(host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.isTouch ? 1 : 1.5))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = !this.isTouch
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.25
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.03, 260)
    this.camera.rotation.order = 'YXZ'
    this.scene.add(this.camera)

    this.scene.background = new THREE.Color(0x070910)
    this.scene.fog = new THREE.Fog(0x07090f, 28, 96)

    this.buildLights()
    this.enemyFlash.visible = false
    this.scene.add(this.enemyFlash)
    this.level = buildLevel(this.scene)
    this.buildGuards()
    this.buildViewModel()
    this.bindEvents()
    this.bindTouch()
    this.resetState()
    this.ui.hud.classList.add('hidden')
    if (import.meta.env.DEV) {
      ;(window as unknown as { __game: Game }).__game = this
    }
    this.renderer.setAnimationLoop(this.frame)
  }

  // ------------------------------------------------------------------ setup

  private buildLights() {
    const hemi = new THREE.HemisphereLight(0x9db4e0, 0x2a2118, 0.8)
    this.scene.add(hemi)
    this.scene.add(new THREE.AmbientLight(0x2f3a4e, 0.55))

    const moon = new THREE.DirectionalLight(0xa8bce6, 0.85)
    moon.position.set(14, 24, 44)
    moon.castShadow = true
    moon.shadow.mapSize.set(1024, 1024)
    const cam = moon.shadow.camera
    cam.left = -28
    cam.right = 28
    cam.top = 30
    cam.bottom = -30
    cam.near = 1
    cam.far = 100
    this.scene.add(moon)

    const fill = new THREE.DirectionalLight(0x33415a, 0.28)
    fill.position.set(14, 12, -18)
    this.scene.add(fill)
  }

  private buildGuards() {
    for (const route of this.level.routes) {
      this.guards.push(this.makeGuard(route))
    }
  }

  private makeGuard(route: THREE.Vector3[]): Guard {
    const group = new THREE.Group()
    const uniform = new THREE.MeshLambertMaterial({ color: 0x2a3b53 })
    const dark = new THREE.MeshLambertMaterial({ color: 0x121820 })
    const skin = new THREE.MeshLambertMaterial({ color: 0xbe8a64 })

    const part = (
      w: number,
      h: number,
      d: number,
      mat: THREE.Material,
      x: number,
      y: number,
      z: number,
    ) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
      m.position.set(x, y, z)
      m.castShadow = true
      m.receiveShadow = true
      group.add(m)
      return m
    }

    part(0.16, 0.74, 0.22, dark, -0.14, 0.37, 0)
    part(0.16, 0.74, 0.22, dark, 0.14, 0.37, 0)
    part(0.5, 0.72, 0.3, uniform, 0, 1.16, 0)
    part(0.56, 0.46, 0.36, dark, 0, 1.22, 0)
    part(0.14, 0.56, 0.18, uniform, -0.33, 1.14, 0)
    part(0.14, 0.56, 0.18, uniform, 0.33, 1.14, 0)

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 10), skin)
    head.position.set(0, 1.66, 0)
    head.castShadow = true
    group.add(head)

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 12), dark)
    cap.position.set(0, 1.8, 0)
    group.add(cap)
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.16), dark)
    brim.position.set(0, 1.76, 0.15)
    group.add(brim)

    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.34), dark)
    gun.position.set(0.31, 1.0, 0.26)
    group.add(gun)

    const pos = route[0].clone()
    group.position.copy(pos)
    this.scene.add(group)

    return {
      group,
      pos,
      route,
      wp: 1,
      facing: 0,
      state: 'patrol',
      suspicion: 0,
      shootCd: 0,
      searchT: 0,
      lastKnown: pos.clone(),
      muzzleT: 0,
      fall: 0,
    }
  }

  private buildViewModel() {
    const vm = new THREE.Group()
    this.camera.add(vm)
    this.viewmodel = vm

    const sleeve = new THREE.MeshLambertMaterial({ color: 0x3d4a62, emissive: 0x141a26 })
    const skin = new THREE.MeshLambertMaterial({ color: 0xc0885f, emissive: 0x2a1d16 })
    const metal = new THREE.MeshLambertMaterial({ color: 0x333a44, emissive: 0x131820 })
    const grip = new THREE.MeshLambertMaterial({ color: 0x21252c, emissive: 0x0b0d11 })

    const gun = new THREE.Group()
    gun.position.copy(this.gunBase)
    gun.rotation.set(0.02, 0.18, 0)
    gun.scale.setScalar(0.62)

    const slide = new THREE.Mesh(
      new THREE.BoxGeometry(0.078, 0.11, 0.36),
      new THREE.MeshLambertMaterial({ color: 0x454c56, emissive: 0x0e1218 }),
    )
    slide.position.set(0, 0.04, -0.05)
    gun.add(slide)
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.06), metal)
    sight.position.set(0, 0.11, -0.17)
    gun.add(sight)

    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.1), metal)
    barrel.position.set(0, 0.04, -0.26)
    gun.add(barrel)

    const gripMesh = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.2, 0.12), grip)
    gripMesh.position.set(0, -0.08, 0.09)
    gripMesh.rotation.x = -0.22
    gun.add(gripMesh)

    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.1), metal)
    guard.position.set(0, -0.05, -0.02)
    gun.add(guard)

    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.15), skin)
    hand.position.set(0, -0.09, 0.08)
    hand.rotation.x = -0.2
    gun.add(hand)

    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.4), sleeve)
    forearm.position.set(0.03, -0.17, 0.3)
    forearm.rotation.set(-0.45, 0.08, 0)
    gun.add(forearm)

    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe3a3 }),
    )
    flash.position.set(0, 0.05, -0.34)
    flash.visible = false
    gun.add(flash)
    this.muzzleFlash = flash

    const light = new THREE.PointLight(0xffce8a, 0, 9, 2)
    light.position.set(0, 0.05, -0.4)
    gun.add(light)
    this.muzzleLight = light

    vm.add(gun)
    this.gunModel = gun

    const carry = new THREE.Group()
    carry.position.set(0.2, -0.36, -0.52)
    carry.scale.setScalar(0.9)
    const bagBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.3, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x4c4d33, emissive: 0x0a0b06 }),
    )
    bagBody.rotation.set(0.1, 0.1, 0.12)
    carry.add(bagBody)
    const strap = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.05, 0.08),
      new THREE.MeshLambertMaterial({ color: 0x24251b, emissive: 0x050604 }),
    )
    strap.position.set(0, 0.16, 0)
    carry.add(strap)
    const bagHandle = new THREE.Mesh(
      new THREE.TorusGeometry(0.09, 0.018, 6, 10),
      new THREE.MeshLambertMaterial({ color: 0x26271c }),
    )
    bagHandle.rotation.x = Math.PI / 2
    bagHandle.position.set(0, 0.15, 0.16)
    carry.add(bagHandle)
    carry.visible = false
    vm.add(carry)
    this.bagModel = carry
  }

  private bindEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(window.innerWidth, window.innerHeight)
    })

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code)
      if (e.code === 'Escape') {
        if (this.phase === 'playing') this.pause()
        return
      }
      if (this.phase !== 'playing') return
      if (e.code === 'KeyE') {
        if (this.current && this.current.kind !== 'vault') this.interact()
      } else if (e.code === 'KeyG') {
        this.dropBag()
      } else if (e.code === 'KeyR') {
        this.startReload()
      } else if (e.code === 'KeyM') {
        this.sfx.setMuted(!this.sfx.muted)
        this.toast(this.sfx.muted ? 'Sound off' : 'Sound on')
      }
    })

    window.addEventListener('keyup', (e) => this.keys.delete(e.code))
    window.addEventListener('blur', () => this.keys.clear())

    const canvas = this.renderer.domElement

    canvas.addEventListener('mousedown', (e) => {
      if (this.isTouch || this.phase !== 'playing' || e.button !== 0) return
      if (document.pointerLockElement === canvas) {
        this.fire()
      } else {
        this.dragging = true
        this.dragMoved = 0
        this.pressAt = performance.now()
        this.requestLock()
      }
    })

    canvas.addEventListener('mouseup', () => {
      if (!this.dragging) return
      this.dragging = false
      const quick = performance.now() - this.pressAt < 260
      if (document.pointerLockElement !== canvas && this.dragMoved < 8 && !quick) {
        this.fire()
      }
    })

    window.addEventListener('mousemove', (e) => {
      if (this.isTouch || this.phase !== 'playing') return
      const locked = document.pointerLockElement === canvas
      if (!locked && !this.dragging) return
      this.yaw -= e.movementX * 0.0022
      this.pitch = clamp(this.pitch - e.movementY * 0.002, -1.35, 1.35)
      this.dragMoved += Math.abs(e.movementX) + Math.abs(e.movementY)
    })

    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.phase === 'playing') this.pause()
    })

    byId<HTMLButtonElement>('startBtn').addEventListener('click', () => this.start())
    byId<HTMLButtonElement>('restartBtn').addEventListener('click', () => this.start())
    byId<HTMLButtonElement>('resumeBtn').addEventListener('click', () => this.resume())
  }

  /** Touch controls: left stick to move, drag anywhere to look, buttons to act. */
  private bindTouch() {
    if (!this.isTouch) return
    document.body.classList.add('touch')
    const canvas = this.renderer.domElement

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || this.phase !== 'playing') return
      this.lookId = e.pointerId
      this.lookX = e.clientX
      this.lookY = e.clientY
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {
        // capture is a nicety only
      }
    })

    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId || this.phase !== 'playing') return
      const dx = e.clientX - this.lookX
      const dy = e.clientY - this.lookY
      this.lookX = e.clientX
      this.lookY = e.clientY
      this.yaw -= dx * 0.0045
      this.pitch = clamp(this.pitch - dy * 0.004, -1.35, 1.35)
    })

    const endLook = (e: PointerEvent) => {
      if (e.pointerId === this.lookId) this.lookId = -1
    }
    canvas.addEventListener('pointerup', endLook)
    canvas.addEventListener('pointercancel', endLook)

    const stick = byId<HTMLElement>('stick')
    const knob = byId<HTMLElement>('stickKnob')
    let stickId = -1
    const moveStick = (e: PointerEvent) => {
      const r = stick.getBoundingClientRect()
      let dx = e.clientX - (r.left + r.width / 2)
      let dy = e.clientY - (r.top + r.height / 2)
      const max = r.width * 0.36
      const d = Math.hypot(dx, dy)
      if (d > max) {
        dx = (dx / d) * max
        dy = (dy / d) * max
      }
      this.touchMove.x = dx / max
      this.touchMove.y = dy / max
      this.touchSprint = d / max > 0.85
      knob.style.transform = `translate(${dx}px, ${dy}px)`
    }
    stick.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      stickId = e.pointerId
      try {
        stick.setPointerCapture(e.pointerId)
      } catch {
        // capture is a nicety only
      }
      moveStick(e)
    })
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId !== stickId) return
      e.preventDefault()
      moveStick(e)
    })
    const releaseStick = () => {
      stickId = -1
      this.touchMove.x = 0
      this.touchMove.y = 0
      this.touchSprint = false
      knob.style.transform = ''
    }
    stick.addEventListener('pointerup', releaseStick)
    stick.addEventListener('pointercancel', releaseStick)

    const crouchBtn = byId<HTMLButtonElement>('btnCrouch')
    const bindTap = (id: string, down: () => void, up?: () => void) => {
      const el = byId<HTMLButtonElement>(id)
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (this.phase !== 'playing') return
        down()
      })
      const release = (e: Event) => {
        e.preventDefault()
        up?.()
      }
      el.addEventListener('pointerup', release)
      el.addEventListener('pointercancel', release)
      el.addEventListener('pointerleave', release)
    }

    bindTap('btnFire', () => this.fire())
    bindTap(
      'btnUse',
      () => {
        this.touchUse = true
        if (this.current && this.current.kind !== 'vault') this.interact()
      },
      () => {
        this.touchUse = false
      },
    )
    bindTap('btnReload', () => this.startReload())
    bindTap('btnDrop', () => this.dropBag())
    bindTap('btnCrouch', () => {
      this.touchCrouch = !this.touchCrouch
      crouchBtn.classList.toggle('active', this.touchCrouch)
    })
    bindTap('btnPause', () => {
      this.touchUse = false
      this.touchMove.x = 0
      this.touchMove.y = 0
      this.pause()
    })
  }

  private requestLock() {
    const canvas = this.renderer.domElement
    if (document.pointerLockElement === canvas) return
    try {
      const result = canvas.requestPointerLock()
      if (result && typeof result.catch === 'function') result.catch(() => undefined)
    } catch {
      // pointer lock is a nicety; drag-look still works without it
    }
  }

  // ------------------------------------------------------------------ rounds

  private start() {
    this.sfx.init()
    this.resetState()
    this.phase = 'playing'
    this.ui.menu.classList.add('hidden')
    this.ui.pause.classList.add('hidden')
    this.ui.end.classList.add('hidden')
    this.ui.hud.classList.remove('hidden')
    if (!this.isTouch) this.requestLock()
  }

  private resume() {
    if (this.phase !== 'paused') return
    this.phase = 'playing'
    this.ui.pause.classList.add('hidden')
    if (!this.isTouch) this.requestLock()
  }

  private pause() {
    if (this.phase !== 'playing') return
    this.phase = 'paused'
    this.ui.pause.classList.remove('hidden')
  }

  private resetState() {
    this.playerPos.copy(this.level.spawn)
    this.yaw = 0.5
    this.pitch = 0
    this.health = 100
    this.mag = MAG_SIZE
    this.reserve = 24
    this.reloading = false
    this.reloadT = 0
    this.fireCd = 0
    this.recoil = 0
    this.bag = []
    this.banked = 0
    this.alarm = false
    this.policeT = POLICE_TIME
    this.takenDown = 0
    this.shotDown = 0
    this.shotsFired = 0
    this.alarms = 0
    this.elapsed = 0
    this.drillT = 0
    this.vaultOpened = false
    this.current = null
    this.damageFlash = 0
    this.keys.clear()
    this.touchUse = false
    this.touchMove.x = 0
    this.touchMove.y = 0
    this.touchSprint = false
    this.touchCrouch = false
    byId<HTMLButtonElement>('btnCrouch').classList.remove('active')
    this.sfx.alarmStop()

    for (const item of this.level.loot) {
      item.taken = false
      item.mesh.visible = true
    }

    for (const bag of this.dropped) this.scene.remove(bag.mesh)
    this.dropped = []

    this.level.vaultDoor.group.visible = true
    if (!this.level.colliders.includes(this.level.vaultDoor.collider)) {
      this.level.colliders.push(this.level.vaultDoor.collider)
    }

    for (const guard of this.guards) {
      const startPos = guard.route[0]
      guard.pos.copy(startPos)
      guard.group.position.copy(startPos)
      guard.group.position.y = 0
      guard.group.rotation.set(0, 0, 0)
      guard.state = 'patrol'
      guard.wp = 1
      const next = guard.route[1] ?? guard.route[0]
      guard.facing = Math.atan2(next.x - startPos.x, next.z - startPos.z)
      guard.group.rotation.set(0, guard.facing + Math.PI, 0)
      guard.suspicion = 0
      guard.shootCd = 1
      guard.searchT = 0
      guard.fall = 0
      guard.lastKnown.copy(startPos)
    }
    this.enemyFlash.visible = false
    this.enemyFlashT = 0

    this.camera.position.set(this.playerPos.x, EYE_STAND, this.playerPos.z)
    this.camera.rotation.set(0, 0, 0)
    this.updateHud()
  }

  // ------------------------------------------------------------------ loop

  private frame = () => {
    const dt = Math.min(this.clock.getDelta(), 0.05)
    if (this.phase === 'playing') this.update(dt)
    this.animateViewModel(dt)
    this.renderer.render(this.scene, this.camera)
  }

  private update(dt: number) {
    this.elapsed += dt
    this.updatePlayer(dt)
    this.updateGuards(dt)
    this.updateInteraction(dt)
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.6)
    if (this.enemyFlashT > 0) {
      this.enemyFlashT -= dt
      if (this.enemyFlashT <= 0) this.enemyFlash.visible = false
    }

    if (this.alarm && this.phase === 'playing') {
      this.policeT -= dt
      if (this.policeT <= 0) {
        this.endRound('busted')
        return
      }
    }

    this.updateHud()
  }

  private updatePlayer(dt: number) {
    this.crouching =
      this.touchCrouch ||
      this.keys.has('ControlLeft') ||
      this.keys.has('ControlRight') ||
      this.keys.has('KeyC')
    const sprintKey =
      this.touchSprint || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')
    const carrying = this.bag.length > 0
    const speed = this.crouching
      ? 2.0
      : carrying
        ? sprintKey
          ? 3.8
          : 3.1
        : sprintKey
          ? 5.2
          : 3.5

    let forward = 0
    let strafe = 0
    if (this.isTouch) {
      forward = -this.touchMove.y
      strafe = this.touchMove.x
    } else {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) strafe -= 1
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) strafe += 1
    }

    const fwdX = -Math.sin(this.yaw)
    const fwdZ = -Math.cos(this.yaw)
    const rightX = Math.cos(this.yaw)
    const rightZ = -Math.sin(this.yaw)

    let mx = fwdX * forward + rightX * strafe
    let mz = fwdZ * forward + rightZ * strafe
    const len = Math.sqrt(mx * mx + mz * mz)
    if (len > 0) {
      mx /= len
      mz /= len
    }

    const step = speed * dt
    const nx = this.playerPos.x + mx * step
    if (!this.blocked(nx, this.playerPos.z, PLAYER_RADIUS)) this.playerPos.x = nx
    const nz = this.playerPos.z + mz * step
    if (!this.blocked(this.playerPos.x, nz, PLAYER_RADIUS)) this.playerPos.z = nz

    this.bob += len > 0 ? dt * (sprintKey ? 11 : 8) : dt * 2.4
    this.eyeHeight += ((this.crouching ? EYE_CROUCH : EYE_STAND) - this.eyeHeight) * Math.min(1, dt * 9)
    const bobY = len > 0 ? Math.sin(this.bob) * (sprintKey ? 0.05 : 0.03) : 0

    this.camera.position.set(this.playerPos.x, this.eyeHeight + bobY, this.playerPos.z)
    this.camera.rotation.set(this.pitch, this.yaw, 0)

    if (this.fireCd > 0) this.fireCd -= dt
    if (this.reloading) {
      this.reloadT += dt
      if (this.reloadT >= RELOAD_TIME) {
        const need = MAG_SIZE - this.mag
        const take = Math.min(need, this.reserve)
        this.mag += take
        this.reserve -= take
        this.reloading = false
        this.reloadT = 0
        this.toast('Reloaded — one hand, a lot of patience')
      }
    }
  }

  private updateGuards(dt: number) {
    for (const guard of this.guards) {
      if (guard.state === 'dead') {
        guard.fall = Math.min(1, guard.fall + dt * 2.4)
        guard.group.rotation.x = -guard.fall * 1.45
        guard.group.position.y = -guard.fall * 0.5
        continue
      }

      if (guard.muzzleT > 0) guard.muzzleT -= dt

      const dx = this.playerPos.x - guard.pos.x
      const dz = this.playerPos.z - guard.pos.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      const sees = this.canSee(guard, dist)

      if (guard.state === 'patrol') {
        if (sees) {
          guard.suspicion += dt * (this.crouching ? 0.85 : 1.7) * (dist < 7 ? 1.5 : 1)
          if (guard.suspicion >= 1) {
            guard.state = 'alert'
            guard.lastKnown.set(this.playerPos.x, 0, this.playerPos.z)
            guard.searchT = 0
            guard.shootCd = 0.6
            this.raiseAlarm()
            this.toast('A guard spotted you — "FREEZE!"')
          }
        } else {
          guard.suspicion = Math.max(0, guard.suspicion - dt * 0.55)
        }

        if (guard.state === 'patrol') {
          const target = guard.route[guard.wp] ?? guard.route[0]
          if (this.guardMove(guard, target.x, target.z, 1.35, dt)) {
            guard.wp = (guard.wp + 1) % guard.route.length
          }
        }
      } else if (guard.state === 'alert') {
        if (sees) {
          guard.lastKnown.set(this.playerPos.x, 0, this.playerPos.z)
          guard.searchT = 0
        } else {
          guard.searchT += dt
        }

        if (sees) {
          guard.facing = this.turnTo(guard.facing, Math.atan2(dx, dz), dt * 6)
        }

        guard.shootCd -= dt
        if (sees && guard.shootCd <= 0 && dist < 22) {
          this.guardShoot(guard, dist)
        }

        const lx = guard.lastKnown.x - guard.pos.x
        const lz = guard.lastKnown.z - guard.pos.z
        if (sees && dist < 5.5) {
          // hold position, keep the pistol pointed at the robber
        } else if (!sees || Math.sqrt(lx * lx + lz * lz) > 4.5) {
          this.guardMove(guard, guard.lastKnown.x, guard.lastKnown.z, 2.5, dt)
        }

        if (!sees && guard.searchT > 7) {
          guard.state = 'patrol'
          guard.suspicion = 0.15
        }
      }

      guard.group.position.set(guard.pos.x, 0, guard.pos.z)
      guard.group.rotation.y = guard.facing + Math.PI
    }
  }

  private guardShoot(guard: Guard, dist: number) {
    guard.shootCd = 1.15 + Math.random() * 0.5
    guard.muzzleT = 0.07
    this.enemyFlashT = 0.07
    this.enemyFlash.position.set(
      guard.pos.x + Math.sin(guard.facing) * 0.5,
      1.05,
      guard.pos.z + Math.cos(guard.facing) * 0.5,
    )
    this.enemyFlash.visible = true
    this.enemyFlash.intensity = 9
    this.sfx.enemyShot()
    const chance = Math.max(0.3, 0.85 - dist * 0.03)
    if (Math.random() < chance) {
      this.damagePlayer(7 + Math.floor(Math.random() * 7))
    }
  }

  private canSee(guard: Guard, dist: number): boolean {
    // the street is dark and the guard keeps his eyes on the lobby
    if (this.playerPos.z > 14.6) return false
    const range = this.crouching ? 10 : 17
    if (dist > range) return false
    const dx = this.playerPos.x - guard.pos.x
    const dz = this.playerPos.z - guard.pos.z
    const fx = Math.sin(guard.facing)
    const fz = Math.cos(guard.facing)
    const dot = (dx / (dist || 1)) * fx + (dz / (dist || 1)) * fz
    if (dot < 0.42 && dist > 2.6) return false
    return !this.losBlocked(guard.pos.x, guard.pos.z, this.playerPos.x, this.playerPos.z, this.crouching)
  }

  private losBlocked(ax: number, az: number, bx: number, bz: number, crouch: boolean): boolean {
    for (const c of this.level.colliders) {
      const blocks = c.h >= 1.55 || (crouch && c.h >= 0.7)
      if (blocks && segmentHitsRect(ax, az, bx, bz, c)) return true
    }
    return false
  }

  private blocked(x: number, z: number, radius: number): boolean {
    for (const c of this.level.colliders) {
      if (
        x + radius > c.minX &&
        x - radius < c.maxX &&
        z + radius > c.minZ &&
        z - radius < c.maxZ
      ) {
        return true
      }
    }
    return false
  }

  private guardMove(guard: Guard, tx: number, tz: number, speed: number, dt: number): boolean {
    const dx = tx - guard.pos.x
    const dz = tz - guard.pos.z
    const d = Math.sqrt(dx * dx + dz * dz)
    if (d < 0.45) return true
    const step = Math.min(speed * dt, d)
    const nx = guard.pos.x + (dx / d) * step
    if (!this.blocked(nx, guard.pos.z, 0.42)) guard.pos.x = nx
    const nz = guard.pos.z + (dz / d) * step
    if (!this.blocked(guard.pos.x, nz, 0.42)) guard.pos.z = nz
    guard.facing = this.turnTo(guard.facing, Math.atan2(dx, dz), dt * 4)
    return false
  }

  private turnTo(current: number, target: number, maxStep: number): number {
    let diff = target - current
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    return current + clamp(diff, -maxStep, maxStep)
  }

  // ------------------------------------------------------------------ combat

  private fire() {
    if (this.phase !== 'playing') return
    if (this.fireCd > 0 || this.reloading) return
    if (this.bag.length > 0) {
      this.toast('Duffel in your only hand — press G to drop it')
      return
    }
    if (this.mag <= 0) {
      this.sfx.dryFire()
      this.toast('Empty — press R to reload (one hand, slow)')
      return
    }

    this.mag -= 1
    this.shotsFired += 1
    this.fireCd = 0.24
    this.recoil = 1
    this.muzzleT = 0.06
    this.sfx.gunshot()
    this.raiseAlarm()

    const origin = this.camera.position.clone()
    const dir = new THREE.Vector3()
    this.camera.getWorldDirection(dir)

    let best: Guard | null = null
    let bestT = Infinity
    for (const guard of this.guards) {
      if (guard.state === 'dead') continue
      const centre = new THREE.Vector3(guard.pos.x, 1.05, guard.pos.z)
      const toCentre = centre.clone().sub(origin)
      const t = toCentre.dot(dir)
      if (t < 0.2 || t > 42) continue
      const closest = origin.clone().addScaledVector(dir, t)
      if (closest.distanceTo(centre) > 0.62) continue
      if (this.losBlocked(origin.x, origin.z, guard.pos.x, guard.pos.z, false)) continue
      if (t < bestT) {
        bestT = t
        best = guard
      }
    }

    if (best) {
      best.state = 'dead'
      best.fall = 0
      this.shotDown += 1
      this.toast('Guard down — and everyone heard that')
    }
  }

  private startReload() {
    if (this.bag.length > 0) {
      this.toast('Drop the duffel (G) before reloading')
      return
    }
    if (this.reloading || this.mag >= MAG_SIZE || this.reserve <= 0) return
    this.reloading = true
    this.reloadT = 0
    this.sfx.reload()
  }

  private damagePlayer(amount: number) {
    if (this.phase !== 'playing') return
    this.health -= amount
    this.damageFlash = 1
    this.drillT = Math.max(0, this.drillT - 0.25)
    this.sfx.hurt()
    if (this.health <= 0) {
      this.health = 0
      this.endRound('dead')
    }
  }

  // ------------------------------------------------------------------ interaction

  private facingPoint(x: number, z: number): boolean {
    const dx = x - this.playerPos.x
    const dz = z - this.playerPos.z
    const len = Math.sqrt(dx * dx + dz * dz) || 1
    const hx = -Math.sin(this.yaw)
    const hz = -Math.cos(this.yaw)
    return (hx * dx + hz * dz) / len > 0.1
  }

  private updateInteraction(dt: number) {
    const px = this.playerPos.x
    const pz = this.playerPos.z
    const candidates: Interaction[] = []

    for (const spot of this.level.loot) {
      if (spot.taken) continue
      const d = Math.sqrt((spot.pos.x - px) ** 2 + (spot.pos.z - pz) ** 2)
      if (d > 2.7) continue
      if (!this.facingPoint(spot.pos.x, spot.pos.z)) continue
      candidates.push({ kind: 'loot', loot: spot, dist: d })
    }

    for (const guard of this.guards) {
      if (guard.state !== 'patrol') continue
      const d = Math.sqrt((guard.pos.x - px) ** 2 + (guard.pos.z - pz) ** 2)
      if (d > 2.6 || d < 0.001) continue
      const dot = ((px - guard.pos.x) / d) * Math.sin(guard.facing) + ((pz - guard.pos.z) / d) * Math.cos(guard.facing)
      if (dot > -0.1) continue
      if (!this.facingPoint(guard.pos.x, guard.pos.z)) continue
      candidates.push({ kind: 'takedown', guard, dist: d })
    }

    for (const bag of this.dropped) {
      const d = Math.sqrt((bag.pos.x - px) ** 2 + (bag.pos.z - pz) ** 2)
      if (d < 2.4) candidates.push({ kind: 'pickup', bag, dist: d })
    }

    if (!this.vaultOpened) {
      const vd = this.level.vaultDoor.pos
      const d = Math.sqrt((vd.x - px) ** 2 + (vd.z - pz) ** 2)
      if (d < 3.1) candidates.push({ kind: 'vault', dist: d })
    }

    const vanD = Math.sqrt((this.level.vanDrop.x - px) ** 2 + (this.level.vanDrop.z - pz) ** 2)
    if (vanD < 3.6) {
      if (this.bag.length > 0) candidates.push({ kind: 'deposit', dist: vanD })
      else if (this.banked >= TARGET) candidates.push({ kind: 'escape', dist: vanD })
    }

    candidates.sort((a, b) => a.dist - b.dist)
    this.current = candidates[0] ?? null

    const vaultHold =
      this.current?.kind === 'vault' && (this.keys.has('KeyE') || this.touchUse)
    if (vaultHold && !this.vaultOpened) {
      this.drillT += dt / DRILL_TIME
      if (this.drillT >= 1) this.openVault()
    } else {
      this.drillT = Math.max(0, this.drillT - dt * 0.6)
    }
  }

  private interact() {
    const target = this.current
    if (!target) return
    switch (target.kind) {
      case 'loot':
        this.takeLoot(target.loot)
        break
      case 'takedown':
        this.takedown(target.guard)
        break
      case 'pickup':
        this.takeDropped(target.bag)
        break
      case 'deposit':
        this.deposit()
        break
      case 'escape':
        this.endRound('win')
        break
      case 'vault':
        break
    }
  }

  private takeLoot(spot: LootSpot) {
    if (spot.taken) return
    if (this.bag.length >= BAG_SLOTS) {
      this.toast('Duffel full — carry it out to the van')
      return
    }
    spot.taken = true
    spot.mesh.visible = false
    this.bag.push({ value: spot.value, label: spot.label })
    this.sfx.pickup()
    this.toast(`${spot.label} +$${spot.value.toLocaleString()}`)
  }

  private takedown(guard: Guard) {
    if (guard.state === 'dead') return
    guard.state = 'dead'
    guard.fall = 0
    this.takenDown += 1
    this.sfx.takedown()
    this.toast('One-armed take-down — not a sound')
  }

  private deposit() {
    const value = this.bagValue()
    if (value <= 0) return
    this.banked += value
    this.bag = []
    this.sfx.deposit()
    this.toast(`+$${value.toLocaleString()} in the van`)
    if (this.banked >= TARGET) {
      this.toast('Target reached — get to the van and drive off!')
    }
  }

  private dropBag() {
    if (this.bag.length === 0) return
    const items = this.bag.slice()
    const group = new THREE.Group()
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.35, 0.62),
      new THREE.MeshLambertMaterial({ color: 0x4c4d33 }),
    )
    body.position.y = 0.18
    body.castShadow = true
    group.add(body)
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.06, 0.1), new THREE.MeshLambertMaterial({ color: 0x22231a }))
    strap.position.y = 0.36
    group.add(strap)
    const fwdX = -Math.sin(this.yaw)
    const fwdZ = -Math.cos(this.yaw)
    group.position.set(this.playerPos.x + fwdX * 0.7, 0.01, this.playerPos.z + fwdZ * 0.7)
    this.scene.add(group)
    this.dropped.push({ pos: group.position.clone(), items, mesh: group })
    this.bag = []
    this.sfx.pickup()
    this.toast('Duffel dropped — pistol drawn')
  }

  private takeDropped(bag: DroppedBag) {
    if (this.bag.length > 0) {
      this.toast('You only have one arm — drop your duffel first (G)')
      return
    }
    this.bag = bag.items.slice()
    this.scene.remove(bag.mesh)
    this.dropped = this.dropped.filter((b) => b !== bag)
    this.sfx.pickup()
    this.toast(`Duffel back in hand — $${this.bagValue().toLocaleString()}`)
  }

  private openVault() {
    if (this.vaultOpened) return
    this.vaultOpened = true
    this.drillT = 1
    this.level.vaultDoor.group.visible = false
    const idx = this.level.colliders.indexOf(this.level.vaultDoor.collider)
    if (idx >= 0) this.level.colliders.splice(idx, 1)
    this.sfx.vaultOpen()
    this.toast('Vault open. Take everything you can carry.')
  }

  private bagValue(): number {
    return this.bag.reduce((sum, item) => sum + item.value, 0)
  }

  private raiseAlarm() {
    if (this.alarm) return
    this.alarm = true
    this.alarms += 1
    this.policeT = POLICE_TIME
    this.sfx.alarmStart()
    this.toast('ALARM! Police arrive in 90 seconds')
  }

  private endRound(kind: Phase) {
    if (this.phase !== 'playing') return
    this.phase = kind
    this.sfx.alarmStop()
    if (document.pointerLockElement) document.exitPointerLock()

    if (kind === 'win') this.sfx.win()
    else this.sfx.lose()

    const guardsDown = this.takenDown + this.shotDown
    const stats: [string, string][] = [
      ['CASH SECURED', `$${this.banked.toLocaleString()}`],
      ['TIME', formatTime(this.elapsed)],
      ['GUARDS OUT', `${guardsDown} (${this.takenDown} silent)`],
      ['ALARMS', `${this.alarms}`],
      ['SHOTS FIRED', `${this.shotsFired}`],
    ]

    let title = 'HEIST OVER'
    let sub = ''
    if (kind === 'win') {
      title = 'CLEAN ESCAPE'
      sub = this.alarm
        ? 'You got away — with the whole city on your tail.'
        : 'Silent, smooth, and one-handed. Nobody saw a thing.'
    } else if (kind === 'busted') {
      title = 'BUSTED'
      sub = 'The police got there first. The duffel stays with them.'
    } else if (kind === 'dead') {
      title = 'YOU BLED OUT'
      sub = 'One arm was not quite enough tonight.'
    }

    this.ui.endTitle.textContent = title
    this.ui.endSub.textContent = sub
    this.ui.endStats.innerHTML = stats
      .map(
        ([label, value]) =>
          `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`,
      )
      .join('')
    this.ui.end.classList.remove('hidden')
    this.ui.hud.classList.add('hidden')
    this.ui.pause.classList.add('hidden')
  }

  // ------------------------------------------------------------------ presentation

  private animateViewModel(dt: number) {
    const progress = this.reloading ? this.reloadT / RELOAD_TIME : 0
    const carry = this.bag.length > 0

    this.gunModel.visible = !carry
    this.bagModel.visible = carry

    if (this.muzzleT > 0) this.muzzleT -= dt
    this.muzzleFlash.visible = this.muzzleT > 0
    this.muzzleLight.visible = this.muzzleT > 0
    this.muzzleLight.intensity = this.muzzleT > 0 ? 6 : 0

    this.recoil = Math.max(0, this.recoil - dt * 9)

    const sway = Math.sin(this.bob) * 0.012
    const swayY = Math.cos(this.bob * 2) * 0.008

    if (!carry) {
      this.gunModel.position.set(
        this.gunBase.x + sway,
        this.gunBase.y - swayY - progress * 0.3 + Math.sin(progress * Math.PI) * 0.02,
        this.gunBase.z + this.recoil * 0.07,
      )
      this.gunModel.rotation.set(
        0.02 + this.recoil * 0.3,
        -0.08,
        Math.sin(progress * Math.PI) * 0.5,
      )
    } else {
      this.bagModel.position.set(
        0.2 + sway,
        -0.36 - swayY + Math.sin(this.bob) * 0.02,
        -0.52,
      )
      this.bagModel.rotation.set(0.1, 0.1 + sway, 0.12 + Math.sin(this.bob * 0.8) * 0.05)
    }
  }

  private updateHud() {
    const healthPct = clamp(this.health, 0, 100)
    this.ui.healthBar.style.width = `${healthPct}%`
    this.ui.healthBar.style.background =
      healthPct > 60 ? '#6cc07a' : healthPct > 30 ? '#d8a23c' : '#d2453c'

    this.ui.bankedText.textContent = `$${this.banked.toLocaleString()} / $${TARGET.toLocaleString()} secured`
    this.ui.objectiveBar.style.width = `${clamp(this.banked / TARGET, 0, 1) * 100}%`
    this.ui.bagCount.textContent = `${this.bag.length} / ${BAG_SLOTS}`
    this.ui.bagValue.textContent = `$${this.bagValue().toLocaleString()}`
    this.ui.ammoText.innerHTML = `${this.mag}<span> / ${this.reserve}</span>`

    const carrying = this.bag.length > 0
    this.ui.stowWarn.classList.toggle('hidden', !carrying)
    this.ui.crosshair.classList.toggle('stowed', carrying)

    this.ui.reloadWrap.classList.toggle('hidden', !this.reloading)
    if (this.reloading) {
      this.ui.reloadBar.style.width = `${clamp(this.reloadT / RELOAD_TIME, 0, 1) * 100}%`
    }

    const showDrill = this.drillT > 0.01 && !this.vaultOpened
    this.ui.drillWrap.classList.toggle('hidden', !showDrill)
    if (showDrill) this.ui.drillBar.style.width = `${clamp(this.drillT, 0, 1) * 100}%`

    this.ui.alarmBanner.classList.toggle('hidden', !this.alarm)
    if (this.alarm) {
      const secs = Math.max(0, Math.ceil(this.policeT))
      this.ui.policeTimer.textContent = `POLICE IN ${formatTime(secs)}`
    }

    const prompt = this.current ? this.promptFor(this.current) : null
    this.ui.prompt.classList.toggle('hidden', !prompt)
    if (prompt) {
      this.ui.promptKey.textContent = this.isTouch ? 'TAP' : prompt.key
      this.ui.promptText.textContent = prompt.text
    }

    this.ui.vignette.style.opacity = `${clamp(this.damageFlash, 0, 1) * 0.85}`

    const objective = carrying
      ? 'Carry the duffel to the van'
      : this.banked >= TARGET
        ? 'Drive off with the cash'
        : 'Loot the bank, get to $50,000'
    this.ui.objectiveText.textContent = objective

    if (this.toastT > 0) this.toastT -= 1 / 60
    this.ui.toast.classList.toggle('show', this.toastT > 0)
  }

  private promptFor(target: Interaction): { key: string; text: string } {
    switch (target.kind) {
      case 'loot':
        return {
          key: 'E',
          text: `Take ${target.loot.label} · $${target.loot.value.toLocaleString()} — duffel ${this.bag.length}/${BAG_SLOTS}`,
        }
      case 'takedown':
        return { key: 'E', text: 'One-armed take-down (silent)' }
      case 'vault':
        return { key: 'E', text: 'Hold to drill the vault — one hand' }
      case 'pickup':
        return { key: 'E', text: `Pick up duffel · $${target.bag.items.reduce((s, i) => s + i.value, 0).toLocaleString()}` }
      case 'deposit':
        return { key: 'E', text: `Dump duffel in the van · $${this.bagValue().toLocaleString()}` }
      case 'escape':
        return { key: 'E', text: 'Drive off — end the heist' }
    }
  }

  private toast(message: string) {
    this.ui.toast.textContent = message
    this.ui.toast.classList.add('show')
    this.toastT = 3
  }
}


function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
