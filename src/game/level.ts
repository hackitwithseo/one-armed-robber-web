import * as THREE from 'three'

export interface Rect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  h: number
}

export interface LootSpot {
  id: number
  pos: THREE.Vector3
  value: number
  label: string
  mesh: THREE.Object3D
  taken: boolean
}

export interface VaultDoor {
  group: THREE.Group
  pos: THREE.Vector3
  collider: Rect
  opened: boolean
}

export interface Level {
  colliders: Rect[]
  loot: LootSpot[]
  routes: THREE.Vector3[][]
  vanDrop: THREE.Vector3
  spawn: THREE.Vector3
  vaultDoor: VaultDoor
}

const lam = (color: number, emissive = 0x000000) =>
  new THREE.MeshLambertMaterial({ color, emissive })

const glow = (color: number) => new THREE.MeshBasicMaterial({ color })

function signTexture(text: string, fg = '#f5c97a', bg = '#141821') {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = bg
  g.fillRect(0, 0, 1024, 256)
  g.strokeStyle = fg
  g.lineWidth = 6
  g.strokeRect(18, 18, 988, 220)
  g.fillStyle = fg
  g.font = 'bold 112px Georgia, "Times New Roman", serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, 512, 136)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

export function buildLevel(scene: THREE.Scene): Level {
  const colliders: Rect[] = []
  const loot: LootSpot[] = []
  const root = new THREE.Group()
  scene.add(root)

  let lootId = 0

  const addMesh = (
    w: number,
    h: number,
    d: number,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    cast = true,
  ) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
    m.position.set(x, y, z)
    m.castShadow = cast
    m.receiveShadow = true
    root.add(m)
    return m
  }

  const wall = (minX: number, maxX: number, minZ: number, maxZ: number, h: number, color: number) => {
    const m = addMesh(maxX - minX, h, maxZ - minZ, lam(color), (minX + maxX) / 2, h / 2, (minZ + maxZ) / 2)
    colliders.push({ minX, maxX, minZ, maxZ, h })
    return m
  }

  const pillar = (x: number, z: number) => {
    addMesh(1.05, 4.4, 1.05, lam(0xb6a68a), x, 2.2, z)
    addMesh(1.25, 0.22, 1.25, lam(0xd9cbb0), x, 0.11, z)
    addMesh(1.25, 0.22, 1.25, lam(0xd9cbb0), x, 4.28, z)
    colliders.push({ minX: x - 0.62, maxX: x + 0.62, minZ: z - 0.62, maxZ: z + 0.62, h: 4.4 })
  }

  const bench = (x: number, z: number) => {
    addMesh(2.4, 0.16, 0.7, lam(0x5b3a24), x, 0.46, z)
    addMesh(0.16, 0.44, 0.6, lam(0x2b2b2f), x - 1.0, 0.22, z)
    addMesh(0.16, 0.44, 0.6, lam(0x2b2b2f), x + 1.0, 0.22, z)
    colliders.push({ minX: x - 1.2, maxX: x + 1.2, minZ: z - 0.35, maxZ: z + 0.35, h: 0.55 })
  }

  const plant = (x: number, z: number) => {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.5, 10), lam(0x3a3a3e))
    pot.position.set(x, 0.25, z)
    pot.castShadow = true
    root.add(pot)
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), lam(0x2f5c38))
    leaves.position.set(x, 0.95, z)
    leaves.scale.set(1, 1.25, 1)
    leaves.castShadow = true
    root.add(leaves)
  }

  // ---------------------------------------------------------------- floors
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(24, 17.2), lam(0x3b322b))
  carpet.rotation.x = -Math.PI / 2
  carpet.position.set(0, 0.01, 5.6)
  carpet.receiveShadow = true
  root.add(carpet)

  const rug = new THREE.Mesh(new THREE.PlaneGeometry(9, 6), lam(0x4d3a35))
  rug.rotation.x = -Math.PI / 2
  rug.position.set(0, 0.02, 11)
  root.add(rug)

  const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(90, 2.8), lam(0x33363d))
  sidewalk.rotation.x = -Math.PI / 2
  sidewalk.position.set(0, 0.02, 15.9)
  sidewalk.receiveShadow = true
  root.add(sidewalk)

  const road = new THREE.Mesh(new THREE.PlaneGeometry(110, 20), lam(0x16181c))
  road.rotation.x = -Math.PI / 2
  road.position.set(0, 0.005, 27)
  road.receiveShadow = true
  root.add(road)

  addMesh(90, 0.18, 0.3, lam(0x5c5f66), 0, 0.09, 17.3, false)
  for (let x = -40; x <= 40; x += 6) {
    addMesh(2.4, 0.02, 0.14, lam(0x6e6a52), x, 0.02, 22, false)
  }

  // ---------------------------------------------------------------- shell
  const WALL_H = 4.4
  const CREAM = 0xb9a888
  wall(-12, -1.8, 14.1, 14.5, WALL_H, CREAM)
  wall(1.8, 12, 14.1, 14.5, WALL_H, CREAM)
  wall(-12, 12, -3.2, -3, WALL_H, 0xa89579)
  wall(-12.2, -12, -3, 14.1, WALL_H, 0xa89579)
  wall(12, 12.2, -3, 14.1, WALL_H, 0xa89579)

  // stone base + entrance frame
  addMesh(10.2, 0.6, 0.5, lam(0x6a655c), -6.9, 0.3, 14.4, false)
  addMesh(10.2, 0.6, 0.5, lam(0x6a655c), 6.9, 0.3, 14.4, false)
  addMesh(0.28, 3.0, 0.5, lam(0x2b2f36), -1.9, 1.5, 14.3, false)
  addMesh(0.28, 3.0, 0.5, lam(0x2b2f36), 1.9, 1.5, 14.3, false)
  addMesh(4.1, 0.3, 0.5, lam(0x2b2f36), 0, 3.0, 14.3, false)

  // glass storefront strips (unlit night glass)
  for (const [x0, x1] of [
    [-11.6, -2.2],
    [2.2, 11.6],
  ]) {
    addMesh(x1 - x0, 2.0, 0.12, lam(0x1c2937, 0x0b1520), (x0 + x1) / 2, 2.3, 14.18, false)
    addMesh(x1 - x0, 0.14, 0.16, lam(0x2b2f36), (x0 + x1) / 2, 3.35, 14.18, false)
    for (let mx = x0 + 2.2; mx < x1 - 0.4; mx += 2.2) {
      addMesh(0.12, 2.0, 0.18, lam(0x2b2f36), mx, 2.3, 14.2, false)
    }
  }

  // outside sign
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 0.9),
    new THREE.MeshBasicMaterial({ map: signTexture('FIRST NATIONAL') }),
  )
  sign.position.set(0, 3.9, 14.64)
  root.add(sign)
  addMesh(4.9, 1.2, 0.2, lam(0x1a1d24), 0, 3.9, 14.52, false)

  // ceiling
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(24, 17.2), lam(0x24211f))
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.set(0, WALL_H, 5.6)
  root.add(ceiling)

  for (const [x, z] of [
    [-7, 11],
    [0, 11],
    [7, 11],
    [-7, 6],
    [0, 6],
    [7, 6],
    [-7, 1.5],
    [8, 1.5],
  ]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.7), glow(0xfff0cc))
    panel.rotation.x = Math.PI / 2
    panel.position.set(x, WALL_H - 0.02, z)
    root.add(panel)
  }

  // ---------------------------------------------------------------- vault room
  wall(4.5, 7.0, 3.8, 4.2, WALL_H, 0x9c8d74)
  wall(8.8, 12, 3.8, 4.2, WALL_H, 0x9c8d74)
  wall(4.3, 4.7, -3, 4, WALL_H, 0x9c8d74)

  // vault door
  const doorGroup = new THREE.Group()
  doorGroup.position.set(7.9, 0, 4)
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x6d7683, metalness: 0.65, roughness: 0.45 })
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.78, 2.9, 0.32), doorMat)
  slab.position.y = 1.45
  slab.castShadow = true
  doorGroup.add(slab)
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.16, 18), doorMat)
  dial.rotation.x = Math.PI / 2
  dial.position.set(0, 1.7, 0.22)
  doorGroup.add(dial)
  const dialInner = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.2, 14), lam(0x2b3038))
  dialInner.rotation.x = Math.PI / 2
  dialInner.position.set(0, 1.7, 0.28)
  doorGroup.add(dialInner)
  for (const y of [0.35, 2.55]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.36), lam(0x3d444d))
    bar.position.set(0, y, 0.02)
    doorGroup.add(bar)
  }
  root.add(doorGroup)

  const vaultCollider: Rect = { minX: 7.0, maxX: 8.8, minZ: 3.8, maxZ: 4.2, h: 2.9 }
  colliders.push(vaultCollider)

  // safe deposit boxes inside the vault
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 6; col++) {
      const bx = 5.2 + col * 1.0
      const by = 0.9 + row * 0.55
      const b = addMesh(0.82, 0.44, 0.24, lam(0x8b939d), bx, by, -2.8, false)
      b.material = new THREE.MeshLambertMaterial({ color: 0x8b939d, emissive: 0x11151a })
    }
  }
  const vaultSign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.65),
    new THREE.MeshBasicMaterial({ map: signTexture('VAULT', '#d6c79b', '#20242c') }),
  )
  vaultSign.position.set(8.3, 3.4, -2.9)
  root.add(vaultSign)

  // ---------------------------------------------------------------- office
  wall(-12, -8, 0.8, 1.2, WALL_H, 0x9c8d74)
  wall(-6.5, -4.5, 0.8, 1.2, WALL_H, 0x9c8d74)
  wall(-4.7, -4.3, -3, 1, WALL_H, 0x9c8d74)

  // office desk
  addMesh(2.6, 0.12, 1.2, lam(0x5a3d28), -7.3, 0.82, -1.3)
  addMesh(0.12, 0.8, 1.1, lam(0x4a3222), -8.5, 0.4, -1.3)
  addMesh(0.12, 0.8, 1.1, lam(0x4a3222), -6.1, 0.4, -1.3)
  colliders.push({ minX: -8.6, maxX: -6.0, minZ: -1.9, maxZ: -0.7, h: 0.9 })

  // staff lockers
  for (let i = 0; i < 3; i++) {
    addMesh(0.9, 2.0, 0.5, lam(0x39424c), -11.4, 1.0, -2.6 + i * 0.65)
    colliders.push({ minX: -11.85, maxX: -10.95, minZ: -2.85 + i * 0.65, maxZ: -2.35 + i * 0.65, h: 2.0 })
  }

  // ---------------------------------------------------------------- teller counter
  addMesh(3.5, 1.1, 5, lam(0x7b4f2d), -9.25, 0.55, 6.5)
  addMesh(3.8, 0.14, 5.3, lam(0xd7cbb3), -9.25, 1.15, 6.5)
  addMesh(3.6, 0.5, 5.1, lam(0x5b3b22), -9.25, 0.3, 6.5, false)
  colliders.push({ minX: -11, maxX: -7.5, minZ: 4, maxZ: 9, h: 1.22 })
  const tellerSign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 0.5),
    new THREE.MeshBasicMaterial({ map: signTexture('TELLERS', '#e8dcc0', '#241f1a') }),
  )
  tellerSign.position.set(-9.25, 2.7, 4.98)
  tellerSign.rotation.y = Math.PI
  root.add(tellerSign)

  pillar(-3, 7)
  pillar(2, 7)
  pillar(8, 9.5)
  bench(-4.5, 12.1)
  bench(4.5, 12.1)
  plant(-11, 13.2)
  plant(11, 13.2)
  plant(-11, 2.4)

  // ---------------------------------------------------------------- loot helpers
  const registerLoot = (mesh: THREE.Object3D, pos: THREE.Vector3, value: number, label: string) => {
    const spot: LootSpot = { id: lootId++, pos, value, label, mesh, taken: false }
    loot.push(spot)
    return spot
  }

  const cashPile = (x: number, y: number, z: number, value: number, label = 'Cash bundle') => {
    const g = new THREE.Group()
    const stackCount = 3
    for (let i = 0; i < stackCount; i++) {
      const stack = new THREE.Group()
      for (let j = 0; j < 4; j++) {
        const bill = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.055, 0.34), lam(0x50864a))
        bill.position.y = j * 0.06
        bill.castShadow = true
        stack.add(bill)
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.35), lam(0xe2d9bf))
        band.position.y = j * 0.06
        stack.add(band)
      }
      stack.position.set((i - 1) * 0.42, i * 0.06, (i % 2) * 0.24 - 0.1)
      stack.rotation.y = (i - 1) * 0.18
      g.add(stack)
    }
    g.position.set(x, y, z)
    root.add(g)
    return registerLoot(g, new THREE.Vector3(x, y + 0.16, z), value, label)
  }

  const goldStash = (x: number, y: number, z: number, value: number) => {
    const g = new THREE.Group()
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xe0b040, metalness: 0.85, roughness: 0.3 })
    for (let i = 0; i < 3; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.24), goldMat)
      bar.position.set(0, i * 0.13, (i - 1) * 0.03)
      bar.rotation.y = i * 0.1
      bar.castShadow = true
      g.add(bar)
    }
    g.position.set(x, y, z)
    root.add(g)
    return registerLoot(g, new THREE.Vector3(x, y + 0.14, z), value, 'Gold bars')
  }

  const openDrawer = (x: number, y: number, z: number, value: number) => {
    const g = new THREE.Group()
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.62), lam(0x8a6a45))
    tray.castShadow = true
    g.add(tray)
    for (let i = 0; i < 3; i++) {
      const bill = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.4), lam(0x5b9455))
      bill.position.set(0.03, 0.06, (i - 1) * 0.14)
      g.add(bill)
    }
    g.position.set(x, y, z)
    root.add(g)
    return registerLoot(g, new THREE.Vector3(x, y + 0.2, z), value, 'Teller drawer')
  }

  const safe = (x: number, z: number, value: number) => {
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.2, 0.85), lam(0x3c444e))
    body.position.y = 0.6
    body.castShadow = true
    g.add(body)
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.95, 0.06), lam(0x2c343d))
    face.position.set(0, 0.62, 0.44)
    g.add(face)
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.07, 12), lam(0xc9a227))
    knob.rotation.x = Math.PI / 2
    knob.position.set(0, 0.66, 0.5)
    g.add(knob)
    g.position.set(x, 0, z)
    root.add(g)
    colliders.push({ minX: x - 0.55, maxX: x + 0.55, minZ: z - 0.48, maxZ: z + 0.48, h: 1.2 })
    return registerLoot(g, new THREE.Vector3(x, 0.7, z), value, 'Office safe')
  }

  // ---------------------------------------------------------------- loot placement
  cashPile(-9.3, 1.22, 5.4, 2500)
  cashPile(-9.3, 1.22, 7.5, 2500)
  openDrawer(-7.4, 0.95, 5.2, 1500)
  openDrawer(-7.4, 0.95, 6.6, 1500)
  openDrawer(-7.4, 0.95, 8.0, 1500)
  cashPile(4.5, 0.55, 12.1, 3000, 'Courier bag')
  cashPile(-7.2, 0.9, -1.25, 2000, 'Desk cash')
  safe(-10.6, -2.2, 6000)

  cashPile(6.0, 0.1, 0.2, 8000, 'Vault bundle')
  cashPile(8.2, 0.1, 0.2, 8000, 'Vault bundle')
  cashPile(10.2, 0.1, 0.2, 8000, 'Vault bundle')
  cashPile(6.0, 0.1, 2.3, 8000, 'Vault bundle')
  goldStash(10.2, 0.06, 2.3, 6000)
  goldStash(8.2, 0.06, 1.3, 6000)

  // ---------------------------------------------------------------- street
  const van = new THREE.Group()
  const vanBody = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.75, 4.7), lam(0x2c3a46))
  vanBody.position.y = 1.25
  vanBody.castShadow = true
  van.add(vanBody)
  const vanLower = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 4.8), lam(0x1c252c))
  vanLower.position.y = 0.55
  van.add(vanLower)
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.75, 0.12), lam(0x0e161d))
  windshield.position.set(0, 1.75, 2.32)
  van.add(windshield)
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.3, 0.28), lam(0x11161b))
  bumper.position.set(0, 0.55, 2.4)
  van.add(bumper)
  for (const [x, z] of [
    [-1.18, 1.5],
    [1.18, 1.5],
    [-1.18, -1.5],
    [1.18, -1.5],
  ]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.3, 14), lam(0x0b0d10))
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(x, 0.42, z)
    van.add(wheel)
  }
  for (const s of [-1, 1]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.7, 2.1), lam(0x364855))
    door.position.set(s * 1.1, 1.35, -3.2)
    door.rotation.y = s * 0.45
    van.add(door)
  }
  for (const s of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), glow(0xfff2c4))
    head.position.set(s * 0.75, 1.0, 2.42)
    van.add(head)
  }
  van.position.set(0, 0, 22.6)
  root.add(van)
  colliders.push({ minX: -1.2, maxX: 1.2, minZ: 20.2, maxZ: 25.0, h: 2.3 })

  for (const sx of [-8, 8]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 8), lam(0x2a2f36))
    pole.position.set(sx, 2.7, 17.0)
    pole.castShadow = true
    root.add(pole)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.1), lam(0x2a2f36))
    arm.position.set(sx + Math.sign(sx) * -0.5, 5.3, 17.0)
    root.add(arm)
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), glow(0xffdba0))
    lamp.position.set(sx + Math.sign(sx) * -0.95, 5.2, 17.0)
    root.add(lamp)
    const lampLight = new THREE.PointLight(0xffc98a, 34, 20, 2)
    lampLight.position.set(sx + Math.sign(sx) * -0.95, 5.1, 17.0)
    root.add(lampLight)
  }

  // neighbouring buildings so the bank sits in a street, not a void
  addMesh(15, 9.5, 4.4, lam(0x151a22), -19.5, 4.75, 12.7, false)
  addMesh(15, 7.5, 4.4, lam(0x151a22), 19.5, 3.75, 12.7, false)
  for (const [x, y] of [
    [-24, 6.5],
    [-21, 3.2],
    [-17, 7.4],
    [16.5, 5.6],
    [20, 2.6],
    [23.5, 4.4],
  ]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5), glow(0xffdca6))
    win.position.set(x, y, 14.92)
    root.add(win)
  }

  // distant city silhouettes
  for (const [w, h, d, x, z] of [
    [22, 15, 12, -26, 47],
    [18, 9, 12, 22, 45],
    [14, 20, 12, 42, 52],
    [26, 7, 10, -50, 44],
  ]) {
    addMesh(w, h, d, lam(0x0f1218), x, h / 2, z, false)
  }

  // entrance lighting so the bank reads from the street
  const entranceLight = new THREE.PointLight(0xffc98a, 28, 16, 2)
  entranceLight.position.set(0, 3.5, 15.4)
  root.add(entranceLight)
  const entranceLamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.5), glow(0xffe2b4))
  entranceLamp.position.set(0, 3.14, 14.95)
  root.add(entranceLamp)
  for (const sx of [-6, 6]) {
    const sconce = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.22), glow(0xffb15e))
    sconce.position.set(sx, 3.1, 14.6)
    root.add(sconce)
  }

  // ---------------------------------------------------------------- interior lights
  for (const [x, z, intensity, color] of [
    [0, 11, 38, 0xffd9a8],
    [-6, 6, 34, 0xffd9a8],
    [6, 6, 30, 0xffd2a0],
    [8, 0.5, 28, 0xbcd0ff],
  ] as [number, number, number, number][]) {
    const l = new THREE.PointLight(color, intensity, 16, 2)
    l.position.set(x, 3.9, z)
    root.add(l)
  }
  const officeLight = new THREE.PointLight(0xffd7a0, 16, 10, 2)
  officeLight.position.set(-8, 3.9, -1.4)
  root.add(officeLight)

  return {
    colliders,
    loot,
    routes: [
      [
        new THREE.Vector3(-6, 0, 13.2),
        new THREE.Vector3(6, 0, 13.2),
        new THREE.Vector3(6, 0, 6),
        new THREE.Vector3(-6, 0, 6),
      ],
      [
        new THREE.Vector3(-6.6, 0, 7.5),
        new THREE.Vector3(-6.6, 0, 2.5),
        new THREE.Vector3(-2, 0, 2.5),
        new THREE.Vector3(-2, 0, 7.5),
      ],
      [
        new THREE.Vector3(6.4, 0, 2.6),
        new THREE.Vector3(10.8, 0, 2.6),
        new THREE.Vector3(10.8, 0, -1.4),
        new THREE.Vector3(5.4, 0, -1.4),
      ],
      [
        new THREE.Vector3(-2.5, 0, 11.8),
        new THREE.Vector3(2.5, 0, 11.8),
        new THREE.Vector3(2.5, 0, 9.6),
        new THREE.Vector3(-2.5, 0, 9.6),
      ],
      [
        new THREE.Vector3(-10.6, 0, -1.3),
        new THREE.Vector3(-10.6, 0, 0.3),
        new THREE.Vector3(-5.0, 0, 0.3),
        new THREE.Vector3(-5.0, 0, -2.4),
      ],
    ],
    vanDrop: new THREE.Vector3(0, 0, 19.3),
    spawn: new THREE.Vector3(3.2, 0, 20.2),
    vaultDoor: { group: doorGroup, pos: new THREE.Vector3(7.9, 1.4, 4), collider: vaultCollider, opened: false },
  }
}
