// @ts-nocheck -- geometry recipes written against three.js directly; the scene that uses them is typed.
/**
 * The model recipes for each drawing language. Every role is drawn by a
 * function that builds a three.js group on a one-unit tile and registers its
 * animations, so a scene can show work happening rather than buildings
 * standing still.
 */
import * as THREE from 'three';

export interface KitContext {
  /** Animations to run each frame, given the time in seconds. */
  anims: ((t: number) => void)[];
  palette: { add: string; mod: string; del: string };
  dark: boolean;
}

type Shape = (...args: any[]) => any;

export interface Kit {
  MODELS: Record<'Icons' | 'City' | 'Machine', Record<string, (place: any, hue: string) => { group: any; top: number }> & { service: (place: any, hue: string) => { group: any; top: number } }>;
  MEMBER_SHAPE: Record<string, (colour: string) => any> & { function: (colour: string) => any };
  REMOVAL: Record<'Icons' | 'City' | 'Machine', () => { group: any }>;
  crossed: (width: number, height: number, y: number, z: number) => any;
  box: Shape;
  cyl: Shape;
  ball: Shape;
  mesh: Shape;
  prism: Shape;
  shade: (hex: string, factor: number) => string;
  memberHue: (member: { change?: string }) => string;
  dispose(): void;
}

export function createKit(ctx: KitContext): Kit {
const anims = ctx.anims
/* ---------- small shape kit ---------- */

const mats = new Map()
function mat(color, extra = {}) {
  const key = color + JSON.stringify(extra)
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.78, metalness: 0.05, ...extra }))
  return mats.get(key)
}
function mesh(geometry, color, extra) {
  const m = new THREE.Mesh(geometry, mat(color, extra))
  m.castShadow = true
  m.receiveShadow = true
  return m
}
const box = (w, h, d, c, x = 0, y = 0, z = 0, extra) => { const m = mesh(new THREE.BoxGeometry(w, h, d), c, extra); m.position.set(x, y + h / 2, z); return m }
const cyl = (rt, rb, h, c, x = 0, y = 0, z = 0, seg = 16, extra) => { const m = mesh(new THREE.CylinderGeometry(rt, rb, h, seg), c, extra); m.position.set(x, y + h / 2, z); return m }
const ball = (r, c, x = 0, y = 0, z = 0, extra) => { const m = mesh(new THREE.IcosahedronGeometry(r, 1), c, extra); m.position.set(x, y, z); return m }
function prism(w, h, d, c, x = 0, y = 0, z = 0) {
  const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)])
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false })
  g.translate(0, 0, -d / 2)
  const m = mesh(g, c)
  m.position.set(x, y, z)
  return m
}
function gear(r, teeth, thick, c) {
  const g = new THREE.Group()
  const hub = mesh(new THREE.CylinderGeometry(r, r, thick, 20), c)
  hub.rotation.x = Math.PI / 2
  g.add(hub)
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2
    const t = mesh(new THREE.BoxGeometry(r * 0.32, r * 0.32, thick), c)
    t.position.set(Math.cos(a) * r, Math.sin(a) * r, 0)
    t.rotation.z = a
    g.add(t)
  }
  const axle = mesh(new THREE.CylinderGeometry(r * 0.25, r * 0.25, thick * 1.4, 10), '#3a3f44')
  axle.rotation.x = Math.PI / 2
  g.add(axle)
  return g
}
function shade(hex, f) { return '#' + new THREE.Color(hex).multiplyScalar(f).getHexString() }

let windowTextures = null
function windows() {
  if (windowTextures) return windowTextures
  const make = (lit) => {
    const c = document.createElement('canvas')
    c.width = 64; c.height = 128
    const x = c.getContext('2d')
    x.fillStyle = lit ? '#000' : '#fff'
    x.fillRect(0, 0, 64, 128)
    for (let r = 0; r < 8; r++) for (let k = 0; k < 4; k++) {
      x.fillStyle = lit ? (Math.random() > 0.25 ? '#fff' : '#000') : '#8fb4c9'
      x.fillRect(6 + k * 15, 6 + r * 15, 9, 9)
    }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = lit ? THREE.NoColorSpace : THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    return t
  }
  windowTextures = { base: make(false), lit: make(true) }
  return windowTextures
}


/* ---------- moving work ---------- */

/** Items riding a straight belt along x from a to b, recoloured past `paint` if given. */
function belt(g, a, b, y, z, n, colour, speed, options = {}) {
  const base = box(Math.abs(b - a) + 0.06, 0.04, 0.12, '#30353b', (a + b) / 2, y - 0.04, z)
  base.castShadow = false
  g.add(base)
  const items = []
  for (let i = 0; i < n; i++) {
    const item = box(0.07, 0.06, 0.07, colour, a, y, z, { emissive: '#000000' })
    item.material = item.material.clone()
    g.add(item)
    items.push(item)
    anims.push((t) => {
      const f = (t * speed + i / n) % 1
      item.position.x = a + (b - a) * f
      if (options.paint) item.material.color.set(f > options.paint.at ? options.paint.to : colour)
      if (options.drop) item.position.y = y + (f < 0.12 ? (0.12 - f) * 3 : 0)
    })
  }
  return items
}

function curvePath(points) {
  return new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0.09, z)), true, 'catmullrom', 0.3)
}

/* ---------- the three languages ---------- */

const spin = (o, speed, axis = 'y') => anims.push((t) => { o.rotation[axis] = t * speed })

function count(place, kind) { return place.members.filter((m) => m.kind === kind) }
function memberHue(m) { return m.change === 'added' ? ctx.palette.add : m.change === 'modified' ? ctx.palette.mod : m.change === 'deleted' ? ctx.palette.del : '#3a4048' }

const MODELS = {
  Icons: {
    service(p, hue) {
      const g = new THREE.Group()
      g.add(box(0.66, 0.5, 0.5, hue, 0, 0.06))
      g.add(box(0.66, 0.08, 0.52, shade(hue, 0.75), 0, 0.56))
      ;['#e2654c', '#e0a23c', '#5fb37a'].forEach((c, i) => g.add(box(0.05, 0.03, 0.02, c, -0.26 + i * 0.07, 0.585, 0.26)))
      g.add(box(0.56, 0.36, 0.02, '#1d2329', 0, 0.12, 0.26))
      const fs = p.members.slice(0, 5)
      fs.forEach((m, i) => g.add(box(0.12 + ((i * 37) % 30) / 100, 0.035, 0.02, memberHue(m), -0.18 + ((i * 37) % 30) / 200, 0.4 - i * 0.06, 0.275)))
      return { group: g, top: 0.7 }
    },
    api(p, hue) {
      const g = new THREE.Group()
      const ends = count(p, 'endpoint')
      const n = Math.max(1, ends.length)
      const w = Math.max(0.6, n * 0.2 + 0.2)
      g.add(box(w, 0.42, 0.42, hue, 0, 0.06))
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + 0.2 + i * 0.2
        g.add(box(0.12, 0.16, 0.03, '#1d2329', x, 0.18, 0.21))
        g.add(box(0.05, 0.05, 0.05, ends[i] ? memberHue(ends[i]) : '#5fb37a', x, 0.23, 0.24))
        const cable = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 6), '#2b3036')
        cable.rotation.x = Math.PI / 2
        cable.position.set(x, 0.255, 0.4)
        g.add(cable)
      }
      g.add(cyl(0.012, 0.012, 0.28, '#3a3f44', w / 2 - 0.08, 0.48, -0.1, 6))
      g.add(ball(0.035, '#e2654c', w / 2 - 0.08, 0.78, -0.1))
      return { group: g, top: 0.8 }
    },
    pipeline(p, hue) {
      const g = new THREE.Group()
      g.add(box(0.7, 0.08, 0.36, shade(hue, 0.7), 0, 0.06))
      const a = gear(0.2, 9, 0.08, hue); a.position.set(-0.13, 0.36, 0); g.add(a); spin(a, 0.9, 'z')
      const b = gear(0.13, 6, 0.08, shade(hue, 1.2)); b.position.set(0.17, 0.42, 0.04); g.add(b); spin(b, -1.4, 'z')
      return { group: g, top: 0.68 }
    },
    store(p, hue) {
      const g = new THREE.Group()
      for (let i = 0; i < 3; i++) {
        g.add(cyl(0.32, 0.32, 0.14, i === 2 ? shade(hue, 1.15) : hue, 0, 0.06 + i * 0.17, 0, 28))
        g.add(cyl(0.325, 0.325, 0.012, shade(hue, 0.6), 0, 0.06 + i * 0.17 + 0.14, 0, 28))
      }
      g.add(box(0.06, 0.03, 0.02, '#5fb37a', 0.18, 0.12, 0.31))
      return { group: g, top: 0.62 }
    },
    cache(p, hue) {
      const g = new THREE.Group()
      g.add(box(0.52, 0.08, 0.38, '#23282e', 0, 0.16))
      for (let i = 0; i < 6; i++) for (const s of [-1, 1]) g.add(box(0.03, 0.12, 0.05, '#c9ced3', -0.2 + i * 0.08, 0.06, s * 0.2))
      g.add(box(0.2, 0.012, 0.1, hue, 0, 0.24))
      return { group: g, top: 0.4 }
    },
    queue(p, hue) {
      const g = new THREE.Group()
      const tube = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.8, 20, 1, true), hue, { transparent: true, opacity: 0.35, side: THREE.DoubleSide })
      tube.rotation.z = Math.PI / 2
      tube.position.y = 0.3
      g.add(tube)
      for (const x of [-0.4, 0.4]) { const r = mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 20), shade(hue, 0.7)); r.rotation.y = Math.PI / 2; r.position.set(x, 0.3, 0); g.add(r) }
      for (let i = 0; i < 4; i++) {
        const pk = box(0.1, 0.1, 0.1, '#f2c14c', 0, 0.25)
        g.add(pk)
        anims.push((t) => { pk.position.x = (((t * 0.25 + i / 4) % 1) - 0.5) * 0.76 })
      }
      return { group: g, top: 0.55 }
    },
    topic(p, hue) {
      const g = new THREE.Group()
      g.add(cyl(0.03, 0.06, 0.6, '#5d646b', 0, 0.06, 0, 8))
      g.add(ball(0.06, hue, 0, 0.7))
      for (let i = 0; i < 3; i++) {
        const r = mesh(new THREE.TorusGeometry(0.12, 0.012, 6, 28), hue, { transparent: true })
        r.rotation.x = Math.PI / 2
        r.position.y = 0.7
        g.add(r)
        anims.push((t) => { const f = (t * 0.5 + i / 3) % 1; r.scale.setScalar(1 + f * 3); r.material.opacity = 1 - f })
      }
      return { group: g, top: 0.8 }
    },
    external(p, hue) {
      const g = new THREE.Group()
      const s = ball(0.28, hue, 0, 0.38); g.add(s)
      for (const rot of [[Math.PI / 2, 0], [0, 0], [0, Math.PI / 2]]) { const r = mesh(new THREE.TorusGeometry(0.29, 0.012, 6, 32), shade(hue, 0.6)); r.rotation.set(rot[0], rot[1], 0); r.position.y = 0.38; g.add(r); spin(r, 0.3) }
      return { group: g, top: 0.7 }
    },
    person(p, hue) {
      const g = new THREE.Group()
      g.add(cyl(0.08, 0.12, 0.3, hue, 0, 0.06, 0, 10))
      g.add(ball(0.08, '#f1d2b6', 0, 0.46))
      return { group: g, top: 0.56 }
    },
    runtime(p, hue) {
      const g = new THREE.Group()
      for (let i = 0; i < 3; i++) { g.add(box(0.5, 0.14, 0.4, hue, 0, 0.06 + i * 0.16)); g.add(box(0.3, 0.02, 0.01, '#5fb37a', -0.05, 0.12 + i * 0.16, 0.205)) }
      return { group: g, top: 0.6 }
    },
  },

  City: {
    service(p, hue) {
      const g = new THREE.Group()
      const floors = Math.max(3, Math.min(8, 2 + p.members.length))
      const h = floors * 0.12
      const t = windows()
      const body = mesh(new THREE.BoxGeometry(0.5, h, 0.46), '#ffffff', { map: t.base, emissiveMap: t.lit, emissive: ctx.dark ? '#ffcf6a' : '#000000' })
      body.position.y = 0.06 + h / 2
      g.add(body)
      g.add(box(0.54, 0.04, 0.5, shade(hue, 0.8), 0, 0.06 + h))
      g.add(box(0.14, 0.08, 0.12, '#8a9096', 0.1, 0.1 + h, -0.06))
      return { group: g, top: h + 0.2 }
    },
    api(p, hue) {
      const g = new THREE.Group()
      const ends = count(p, 'endpoint')
      const n = Math.max(1, ends.length)
      const w = Math.max(0.6, n * 0.24 + 0.16)
      g.add(box(w, 0.34, 0.4, '#e9e4d8', 0, 0.06))
      g.add(box(w + 0.06, 0.05, 0.46, hue, 0, 0.4))
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + 0.2 + i * 0.24
        g.add(box(0.14, 0.22, 0.02, ends[i] ? memberHue(ends[i]) : '#5b4636', x, 0.06, 0.205))
        const arch = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12, 1, false, 0, Math.PI), '#e9e4d8')
        arch.rotation.set(Math.PI / 2, 0, Math.PI / 2)
        arch.position.set(x, 0.28, 0.215)
        g.add(arch)
      }
      g.add(cyl(0.01, 0.01, 0.4, '#5d646b', -w / 2 + 0.06, 0.45, 0.1, 6))
      const flag = box(0.14, 0.08, 0.005, hue, -w / 2 + 0.13, 0.75, 0.1)
      g.add(flag)
      anims.push((t) => { flag.rotation.y = Math.sin(t * 3) * 0.25 })
      return { group: g, top: 0.9 }
    },
    pipeline(p, hue) {
      const g = new THREE.Group()
      g.add(box(0.72, 0.28, 0.46, '#d9d6cc', 0, 0.06))
      for (let i = 0; i < 3; i++) { const r = prism(0.24, 0.14, 0.46, shade(hue, 0.9), -0.24 + i * 0.24, 0.34, 0); r.rotation.y = 0; g.add(r) }
      g.add(cyl(0.05, 0.06, 0.5, '#a24f3a', 0.26, 0.34, -0.15, 10))
      for (let i = 0; i < 3; i++) {
        const puff = ball(0.05, '#9aa0a4', 0.26, 0.85, -0.15, { transparent: true })
        g.add(puff)
        anims.push((t) => { const f = (t * 0.35 + i / 3) % 1; puff.position.y = 0.88 + f * 0.4; puff.scale.setScalar(0.6 + f * 1.4); puff.material.opacity = 0.8 * (1 - f) })
      }
      g.add(box(0.2, 0.18, 0.02, '#5b4636', -0.18, 0.06, 0.23))
      return { group: g, top: 0.95 }
    },
    store(p, hue) {
      const g = new THREE.Group()
      const stone = ctx.dark ? '#b7b2a6' : '#ebe6da'
      g.add(box(0.74, 0.04, 0.56, shade(stone, 0.85), 0, 0.06))
      g.add(box(0.68, 0.04, 0.5, shade(stone, 0.92), 0, 0.1))
      g.add(box(0.56, 0.3, 0.34, stone, 0, 0.14, -0.04))
      for (let i = 0; i < 4; i++) g.add(cyl(0.03, 0.035, 0.3, stone, -0.24 + i * 0.16, 0.14, 0.19, 10))
      g.add(box(0.66, 0.05, 0.46, shade(stone, 0.9), 0, 0.44))
      g.add(prism(0.66, 0.14, 0.46, hue, 0, 0.49, 0))
      g.add(box(0.12, 0.2, 0.02, '#4b3a2c', 0, 0.14, 0.135))
      for (let i = 0; i < 3; i++) g.add(box(0.36, 0.012, 0.01, shade(hue, 0.8), 0, 0.22 + i * 0.07, 0.132))
      return { group: g, top: 0.75 }
    },
    cache(p, hue) {
      const g = new THREE.Group()
      g.add(box(0.42, 0.32, 0.36, '#ece6d8', 0, 0.06))
      for (let i = 0; i < 6; i++) g.add(box(0.07, 0.02, 0.16, i % 2 ? '#fbfbf7' : hue, -0.175 + i * 0.07, 0.36, 0.22))
      g.add(box(0.3, 0.12, 0.01, '#8fb4c9', 0, 0.16, 0.185))
      return { group: g, top: 0.5 }
    },
    queue(p, hue) {
      const g = new THREE.Group()
      g.add(box(0.6, 0.28, 0.36, '#e4ddcc', 0, 0.06, -0.08))
      g.add(prism(0.64, 0.14, 0.4, shade(hue, 0.85), 0, 0.34, -0.08))
      g.add(box(0.7, 0.05, 0.12, '#3a3f44', 0, 0.1, 0.22))
      for (let i = 0; i < 3; i++) {
        const pk = box(0.08, 0.07, 0.08, '#b88a55', 0, 0.15, 0.22)
        g.add(pk)
        anims.push((t) => { pk.position.x = (((t * 0.2 + i / 3) % 1) - 0.5) * 0.66 })
      }
      return { group: g, top: 0.6 }
    },
    topic(p, hue) {
      const g = new THREE.Group()
      const tower = mesh(new THREE.ConeGeometry(0.16, 0.9, 4, 6, true), '#9aa0a6', { wireframe: true })
      tower.position.y = 0.51
      g.add(tower)
      const light = ball(0.04, hue, 0, 0.98, 0, { emissive: hue })
      g.add(light)
      anims.push((t) => { light.visible = Math.sin(t * 4) > -0.3 })
      return { group: g, top: 1.05 }
    },
    external(p, hue) {
      const g = new THREE.Group()
      g.add(box(0.03, 0.5, 0.03, '#6b7177', -0.32, 0.06, 0.2))
      g.add(box(0.03, 0.5, 0.03, '#6b7177', 0.32, 0.06, 0.2))
      g.add(box(0.7, 0.14, 0.03, '#2e8b57', 0, 0.48, 0.2))
      g.add(box(0.36, 0.7, 0.32, shade(hue, 0.9), 0, 0.06, -0.15))
      return { group: g, top: 0.85 }
    },
    person(p, hue) { return MODELS.Icons.person(p, hue) },
    runtime(p, hue) {
      const g = new THREE.Group()
      g.add(box(0.6, 0.3, 0.4, '#d6d2c6', 0, 0.06))
      for (let i = 0; i < 2; i++) g.add(cyl(0.06, 0.09, 0.5, '#c4bfb2', -0.15 + i * 0.3, 0.36, -0.06, 12))
      return { group: g, top: 0.9 }
    },
  },

  Machine: {
    service(p, hue) {
      const g = new THREE.Group()
      g.add(box(0.5, 0.4, 0.4, hue, -0.05, 0.06))
      const w = gear(0.17, 8, 0.05, '#8a9096'); w.rotation.y = Math.PI / 2; w.position.set(0.24, 0.32, 0); g.add(w)
      anims.push((t) => { w.rotation.x = t * 1.2 })
      const piston = box(0.06, 0.16, 0.06, '#c9ced3', -0.15, 0.46)
      g.add(piston)
      anims.push((t) => { piston.position.y = 0.46 + Math.abs(Math.sin(t * 3)) * 0.08 })
      return { group: g, top: 0.72 }
    },
    api(p, hue) {
      const g = new THREE.Group()
      const ends = count(p, 'endpoint')
      const n = Math.max(1, ends.length)
      const w = Math.max(0.5, n * 0.22 + 0.1)
      g.add(box(w, 0.3, 0.4, shade(hue, 0.8), 0, 0.06))
      for (let i = 0; i < n; i++) {
        const funnel = mesh(new THREE.ConeGeometry(0.1, 0.18, 12, 1, true), ends[i] ? memberHue(ends[i]) : hue, { side: THREE.DoubleSide })
        funnel.rotation.x = Math.PI
        funnel.position.set(-w / 2 + 0.16 + i * 0.22, 0.45, 0)
        g.add(funnel)
      }
      return { group: g, top: 0.6 }
    },
    pipeline(p, hue) {
      const g = new THREE.Group()
      g.add(box(0.74, 0.06, 0.18, '#3a3f44', 0, 0.06, 0.18))
      g.add(cyl(0.1, 0.12, 0.08, '#5d646b', -0.1, 0.06, -0.1, 12))
      const arm = new THREE.Group()
      arm.position.set(-0.1, 0.14, -0.1)
      const a1 = box(0.06, 0.34, 0.06, hue, 0, 0, 0)
      arm.add(a1)
      const elbow = new THREE.Group(); elbow.position.y = 0.34; arm.add(elbow)
      const a2 = box(0.05, 0.26, 0.05, shade(hue, 1.15)); a2.rotation.z = -1.1; elbow.add(a2)
      g.add(arm)
      anims.push((t) => { arm.rotation.y = Math.sin(t * 0.8) * 0.9; elbow.rotation.z = Math.sin(t * 1.3) * 0.4 })
      for (let i = 0; i < 3; i++) { const pk = box(0.07, 0.06, 0.07, '#f2c14c', 0, 0.12, 0.18); g.add(pk); anims.push((t) => { pk.position.x = (((t * 0.18 + i / 3) % 1) - 0.5) * 0.7 }) }
      return { group: g, top: 0.7 }
    },
    store(p, hue) {
      const g = new THREE.Group()
      g.add(cyl(0.26, 0.26, 0.6, hue, 0, 0.06, 0, 24))
      const dome = mesh(new THREE.SphereGeometry(0.26, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), shade(hue, 1.12))
      dome.position.y = 0.66
      g.add(dome)
      for (let i = 0; i < 3; i++) g.add(cyl(0.265, 0.265, 0.015, shade(hue, 0.6), 0, 0.2 + i * 0.16, 0, 24))
      g.add(box(0.03, 0.62, 0.03, '#6b7177', 0.27, 0.06, 0.05))
      return { group: g, top: 1.0 }
    },
    cache(p, hue) {
      const g = new THREE.Group()
      const hopper = mesh(new THREE.ConeGeometry(0.2, 0.28, 4, 1, true), hue, { side: THREE.DoubleSide })
      hopper.rotation.x = Math.PI
      hopper.position.y = 0.36
      g.add(hopper)
      g.add(box(0.05, 0.22, 0.05, '#6b7177', 0, 0.06))
      return { group: g, top: 0.55 }
    },
    queue(p, hue) {
      const g = new THREE.Group()
      g.add(box(0.8, 0.06, 0.24, '#30353b', 0, 0.18))
      for (let i = 0; i < 5; i++) { const r = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.26, 8), '#8a9096'); r.rotation.x = Math.PI / 2; r.position.set(-0.32 + i * 0.16, 0.18, 0); g.add(r); spin(r, 4, 'y') }
      for (const x of [-0.36, 0.36]) g.add(box(0.04, 0.14, 0.2, '#5d646b', x, 0.04))
      for (let i = 0; i < 4; i++) { const pk = box(0.09, 0.08, 0.09, hue, 0, 0.24); g.add(pk); anims.push((t) => { pk.position.x = (((t * 0.22 + i / 4) % 1) - 0.5) * 0.76 }) }
      return { group: g, top: 0.5 }
    },
    topic(p, hue) {
      const g = new THREE.Group()
      g.add(cyl(0.02, 0.03, 0.4, '#5d646b', 0, 0.06, 0, 8))
      const horn = mesh(new THREE.ConeGeometry(0.14, 0.24, 16, 1, true), hue, { side: THREE.DoubleSide })
      horn.rotation.x = -Math.PI / 2
      horn.position.set(0, 0.5, 0.08)
      g.add(horn)
      return { group: g, top: 0.7 }
    },
    external(p, hue) {
      const g = new THREE.Group()
      const pipe = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 12), hue)
      pipe.rotation.z = Math.PI / 2
      pipe.position.set(0, 0.2, 0)
      g.add(pipe)
      const valve = mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 16), '#c8452f')
      valve.position.set(0, 0.38, 0)
      g.add(valve)
      spin(valve, 0.6, 'y')
      return { group: g, top: 0.55 }
    },
    person(p, hue) { return MODELS.Icons.person(p, hue) },
    runtime(p, hue) {
      const g = new THREE.Group()
      g.add(box(0.5, 0.3, 0.36, hue, 0, 0.06))
      const fan = gear(0.12, 6, 0.04, '#c9ced3'); fan.position.set(0, 0.22, 0.2); g.add(fan); spin(fan, 3, 'z')
      return { group: g, top: 0.5 }
    },
  },
}

Object.assign(MODELS.City, {
    api(p, hue) {
      // A roundabout: requests come in on one road and leave by the exit signed with their endpoint.
      const g = new THREE.Group()
      const ends = count(p, 'endpoint')
      const n = Math.max(2, Math.min(6, ends.length))
      g.add(cyl(0.34, 0.34, 0.02, '#5d646b', 0, 0.06, 0, 32))
      g.add(cyl(0.16, 0.16, 0.05, '#7fae6e', 0, 0.06, 0, 24))
      g.add(cyl(0.02, 0.02, 0.22, '#6b7177', 0, 0.1, 0, 6))
      g.add(box(0.14, 0.08, 0.01, hue, 0, 0.32, 0))
      const entry = box(0.12, 0.02, 0.24, '#5d646b', 0, 0.06, 0.44)
      g.add(entry)
      const exits = []
      for (let i = 0; i < n; i++) {
        const a = Math.PI / 2 + ((i + 1) * 2 * Math.PI) / (n + 1)
        const end = ends[i]
        const road = box(0.11, 0.02, 0.24, '#5d646b', Math.cos(a) * 0.44, 0.06, Math.sin(a) * 0.44)
        road.rotation.y = -a + Math.PI / 2
        g.add(road)
        const sx = Math.cos(a) * 0.5
        const sz = Math.sin(a) * 0.5
        g.add(box(0.012, 0.16, 0.012, '#6b7177', sx + Math.sin(a) * 0.09, 0.06, sz - Math.cos(a) * 0.09))
        const sign = box(0.13, 0.06, 0.01, end?.change ? memberHue(end) : '#2e8b57', sx + Math.sin(a) * 0.09, 0.21, sz - Math.cos(a) * 0.09)
        sign.rotation.y = -a + Math.PI / 2
        g.add(sign)
        exits.push(a)
      }
      const colours = ['#f2c14c', '#4f80dc', '#e0883a', '#d35f7c']
      for (let k = 0; k < 4; k++) {
        const car = box(0.07, 0.045, 0.045, colours[k], 0, 0.08, 0)
        g.add(car)
        anims.push((t) => {
          const cycle = (t * 0.22 + k / 4) % 1
          const exit = exits[(k + Math.floor(t * 0.22 + k / 4)) % exits.length]
          const enter = Math.PI / 2
          if (cycle < 0.25) { const f = cycle / 0.25; car.position.set(0, 0.08, 0.56 - f * 0.31); car.rotation.y = Math.PI / 2 }
          else if (cycle < 0.7) {
            let span = exit - enter; if (span <= 0) span += Math.PI * 2
            const a = enter + span * ((cycle - 0.25) / 0.45)
            car.position.set(Math.cos(a) * 0.25, 0.08, Math.sin(a) * 0.25); car.rotation.y = -a
          } else { const f = (cycle - 0.7) / 0.3; const r = 0.25 + f * 0.33; car.position.set(Math.cos(exit) * r, 0.08, Math.sin(exit) * r); car.rotation.y = -exit + Math.PI / 2 }
        })
      }
      return { group: g, top: 0.45 }
    },

    pipeline(p, hue) {
      const g = new THREE.Group()
      const steps = p.members.filter((m) => m.kind === 'process' || m.kind === 'job')
      const n = Math.max(2, steps.length)
      const curve = curvePath([[-0.42, -0.3], [0.42, -0.3], [0.48, 0.28], [-0.48, 0.28]])
      const track = mesh(new THREE.TubeGeometry(curve, 80, 0.012, 4, true), '#4a4f55')
      track.castShadow = false
      g.add(track)
      for (let i = 0; i < 40; i++) {
        const at = curve.getPointAt(i / 40)
        const tan = curve.getTangentAt(i / 40)
        const sleeper = box(0.02, 0.012, 0.09, '#8a6a4a', at.x, 0.06, at.z)
        sleeper.rotation.y = Math.atan2(-tan.z, tan.x)
        g.add(sleeper)
      }
      const stations = []
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n
        const at = curve.getPointAt(u)
        const out = new THREE.Vector3(at.x, 0, at.z).normalize().multiplyScalar(0.13)
        const step = steps[i]
        const platform = box(0.2, 0.05, 0.08, '#d7d2c4', at.x + out.x, 0.06, at.z + out.z)
        g.add(platform)
        g.add(box(0.22, 0.015, 0.1, step ? memberHue(step) === '#3a4048' ? hue : memberHue(step) : hue, at.x + out.x, 0.2, at.z + out.z))
        for (const dx of [-0.08, 0.08]) g.add(box(0.012, 0.09, 0.012, '#6b7177', at.x + out.x + dx, 0.11, at.z + out.z))
        const lamp = ball(0.025, '#9aa0a6', at.x + out.x, 0.25, at.z + out.z, { emissive: '#000000' })
        lamp.material = lamp.material.clone()
        g.add(lamp)
        stations.push({ u, lamp })
      }
      const cars = []
      for (let k = 0; k < 3; k++) {
        const car = box(0.12, 0.07, 0.06, k === 0 ? hue : shade(hue, 1.25), 0, 0.07, 0)
        g.add(car)
        cars.push(car)
      }
      anims.push((t) => {
        const head = (t * 0.07) % 1
        cars.forEach((car, k) => {
          const u = (head - k * 0.045 + 1) % 1
          const at = curve.getPointAt(u)
          const tan = curve.getTangentAt(u)
          car.position.set(at.x, 0.07, at.z)
          car.rotation.y = Math.atan2(-tan.z, tan.x)
        })
        for (const st of stations) {
          const near = Math.min(Math.abs(head - st.u), 1 - Math.abs(head - st.u)) < 0.05
          st.lamp.material.color.set(near ? '#4fd17f' : '#9aa0a6')
          st.lamp.material.emissive.set(near ? '#2a8f50' : '#000000')
        }
      })
      return { group: g, top: 0.42 }
    },
    store(p, hue) {
      const g = new THREE.Group()
      g.add(box(1.0, 0.02, 0.8, '#a8aca4', 0, 0.06, 0))
      const stacks = Math.max(3, Math.min(8, p.members.length + 3))
      const palette = [hue, shade(hue, 1.25), '#c8452f', '#2f74c0', '#d9952a', '#3a8f6a']
      const heights = []
      for (let i = 0; i < stacks; i++) {
        const col = i % 4
        const row = Math.floor(i / 4)
        const h = 1 + ((i * 7) % 3)
        heights.push(h)
        const member = p.members[i]
        for (let k = 0; k < h; k++) g.add(box(0.2, 0.09, 0.12, member && k === h - 1 && member.change ? memberHue(member) : palette[(i + k) % palette.length], -0.33 + col * 0.22, 0.08 + k * 0.09, -0.15 + row * 0.3))
      }
      const gantry = new THREE.Group()
      for (const z of [-0.36, 0.36]) for (const x of [-0.04, 0.04]) gantry.add(box(0.02, 0.5, 0.02, '#e0a23c', x, 0.06, z))
      gantry.add(box(0.1, 0.04, 0.78, '#e0a23c', 0, 0.56, 0))
      const trolley = new THREE.Group()
      trolley.add(box(0.1, 0.04, 0.08, '#4a4f55', 0, 0.52, 0))
      const cable = box(0.006, 0.2, 0.006, '#2b3036', 0, 0.32, 0)
      trolley.add(cable)
      const crate = box(0.2, 0.09, 0.12, hue, 0, 0.23, 0)
      trolley.add(crate)
      gantry.add(trolley)
      g.add(gantry)
      anims.push((t) => {
        const cycle = (t * 0.18) % 1
        gantry.position.x = -0.33 + 0.66 * (0.5 - 0.5 * Math.cos(cycle * Math.PI * 2))
        trolley.position.z = Math.sin(cycle * Math.PI * 2) * 0.15
        const lower = Math.max(0, Math.sin(cycle * Math.PI * 4))
        crate.position.y = 0.23 - lower * 0.08
        cable.scale.y = 1 + lower * 0.4
        cable.position.y = 0.32 - lower * 0.04
      })
      return { group: g, top: 0.7 }
    },
    queue(p, hue) {
      const g = new THREE.Group()
      g.add(box(0.5, 0.02, 0.2, '#c9c4b6', -0.1, 0.06, 0.15))
      g.add(box(0.5, 0.03, 0.18, hue, -0.1, 0.36, 0.08))
      for (const x of [-0.33, 0.13]) g.add(box(0.02, 0.3, 0.02, '#6b7177', x, 0.06, 0.02))
      const people = []
      for (let i = 0; i < 5; i++) { const pr = new THREE.Group(); pr.add(cyl(0.025, 0.035, 0.1, ['#4f80dc', '#d35f7c', '#e0883a', '#2fa596', '#8a6bd0'][i], 0, 0.06, 0, 8)); pr.add(ball(0.025, '#f1d2b6', 0, 0.2, 0)); g.add(pr); people.push(pr) }
      const bus = box(0.5, 0.14, 0.14, '#d9ae2f', 0.9, 0.06, -0.25)
      g.add(bus)
      anims.push((t) => {
        const cycle = (t * 0.12) % 1
        bus.position.x = cycle < 0.4 ? 0.9 - cycle * 2.25 : cycle < 0.6 ? 0 : -(cycle - 0.6) * 2.25
        const boarded = cycle > 0.45 && cycle < 0.6 ? Math.floor((cycle - 0.45) / 0.03) : 0
        people.forEach((pr, i) => { pr.visible = i >= boarded || cycle >= 0.6 && i < 2; pr.position.set(-0.3 + i * 0.09 + (cycle > 0.6 ? 0 : 0), 0, 0.17) })
      })
      return { group: g, top: 0.45 }
    },
})
Object.assign(MODELS.Machine, {
    api(p, hue) {
      // A sorter: every request arrives on one belt and a turning gate sends it down its endpoint's chute.
      const g = new THREE.Group()
      const ends = count(p, 'endpoint')
      const n = Math.max(2, Math.min(5, ends.length))
      belt(g, -0.55, -0.08, 0.16, 0, 3, '#f2c14c', 0.3)
      g.add(cyl(0.09, 0.09, 0.12, hue, 0, 0.06, 0, 16))
      const gate = box(0.18, 0.04, 0.02, '#d6453a', 0, 0.2, 0)
      const pivot = new THREE.Group(); pivot.position.set(0, 0.2, 0); gate.position.set(0.09, 0, 0); pivot.add(gate); g.add(pivot)
      const angles = []
      for (let i = 0; i < n; i++) {
        const a = -0.9 + (1.8 * i) / (n - 1)
        angles.push(a)
        const end = ends[i]
        const chute = box(0.36, 0.03, 0.08, end?.change ? memberHue(end) : shade(hue, 0.85), 0, 0.1, 0)
        const arm = new THREE.Group(); arm.rotation.y = -a; chute.position.set(0.3, 0, 0); arm.add(chute); g.add(arm)
        const bin = box(0.1, 0.1, 0.1, '#5d646b', 0, 0.06, 0); const binArm = new THREE.Group(); binArm.rotation.y = -a; bin.position.set(0.52, 0, 0); binArm.add(bin); g.add(binArm)
      }
      const parcel = box(0.06, 0.05, 0.06, '#f2c14c', 0, 0.2, 0)
      g.add(parcel)
      anims.push((t) => {
        const cycle = t * 0.5
        const i = Math.floor(cycle) % n
        const f = cycle % 1
        pivot.rotation.y = -angles[i]
        const r = f * 0.5
        parcel.position.set(Math.cos(angles[i]) * r, 0.2 - f * 0.08, Math.sin(angles[i]) * r)
      })
      return { group: g, top: 0.45 }
    },

    pipeline(p, hue) {
      const g = new THREE.Group()
      const steps = p.members.filter((m) => m.kind === 'process' || m.kind === 'job')
      const n = Math.max(2, steps.length + 1)
      const a = -0.5
      const b = 0.5
      belt(g, a, b, 0.16, 0, 4, '#9aa0a6', 0.16, { paint: { at: 0.85, to: '#4fd17f' } })
      for (let i = 0; i < n; i++) {
        const x = a + ((i + 1) * (b - a)) / (n + 1)
        const step = steps[i]
        const colour = step ? (memberHue(step) === '#3a4048' ? hue : memberHue(step)) : hue
        for (const z of [-0.09, 0.09]) g.add(box(0.03, 0.34, 0.03, '#5d646b', x, 0.06, z))
        g.add(box(0.12, 0.05, 0.22, colour, x, 0.38))
        const ram = box(0.07, 0.12, 0.07, '#c9ced3', x, 0.26)
        g.add(ram)
        const lamp = ball(0.025, '#9aa0a6', x, 0.47, 0, { emissive: '#000000' })
        lamp.material = lamp.material.clone()
        g.add(lamp)
        const at = (x - a) / (b - a)
        anims.push((t) => {
          let near = false
          for (let k = 0; k < 4; k++) { const f = (t * 0.16 + k / 4) % 1; if (Math.abs(f - at) < 0.035) near = true }
          ram.position.y = near ? 0.2 : 0.26
          lamp.material.color.set(near ? '#4fd17f' : '#9aa0a6')
          lamp.material.emissive.set(near ? '#2a8f50' : '#000000')
        })
      }
      return { group: g, top: 0.6 }
    },
    store(p, hue) {
      const g = new THREE.Group()
      const cols = 4
      const rows = 3
      for (let c = 0; c <= cols; c++) g.add(box(0.015, rows * 0.15 + 0.04, 0.3, '#6b7177', -0.36 + c * 0.18, 0.06, -0.05))
      for (let r = 0; r <= rows; r++) g.add(box(0.74, 0.012, 0.3, '#8a9096', 0, 0.06 + r * 0.15, -0.05))
      const filled = Math.min(cols * rows - 1, 4 + p.members.length)
      for (let i = 0; i < filled; i++) {
        const member = p.members[i]
        g.add(box(0.13, 0.1, 0.22, member?.change ? memberHue(member) : i % 3 ? shade(hue, 0.9) : hue, -0.27 + (i % cols) * 0.18, 0.075 + Math.floor(i / cols) * 0.15, -0.05))
      }
      const lift = new THREE.Group()
      lift.add(box(0.03, rows * 0.15 + 0.1, 0.03, '#e0a23c', 0, 0.06, 0.2))
      const carriage = box(0.16, 0.02, 0.12, '#e0a23c', 0, 0, 0.16)
      const parcel = box(0.13, 0.1, 0.1, hue, 0, 0.02, 0.16)
      lift.add(carriage, parcel)
      g.add(lift)
      const target = { c: filled % cols, r: Math.floor(filled / cols) }
      anims.push((t) => {
        const f = (t * 0.2) % 1
        const x = -0.27 + target.c * 0.18
        const y = 0.075 + target.r * 0.15
        lift.position.x = f < 0.4 ? -0.36 + (x + 0.36) * (f / 0.4) : x
        const h = f < 0.4 ? 0.07 * (f / 0.4) : y
        carriage.position.y = h
        parcel.position.y = h + 0.02
        parcel.position.z = f > 0.55 && f < 0.85 ? 0.16 - ((f - 0.55) / 0.3) * 0.2 : f >= 0.85 ? -0.04 : 0.16
        parcel.visible = f < 0.9
      })
      return { group: g, top: 0.65 }
    },
    service(p, hue) {
      const g = new THREE.Group()
      belt(g, -0.55, 0.55, 0.14, 0.18, 4, '#9aa0a6', 0.14, { paint: { at: 0.55, to: hue } })
      g.add(box(0.36, 0.34, 0.3, hue, 0, 0.06, 0.08))
      g.add(box(0.12, 0.14, 0.32, '#1d2329', 0, 0.08, 0.08))
      const w = gear(0.14, 8, 0.05, '#8a9096'); w.position.set(0, 0.32, -0.1); g.add(w); spin(w, 1.2, 'z')
      return { group: g, top: 0.6 }
    },
})



/** What removal looks like in each language, set beside a place this change deletes. */
const REMOVAL = {
  Icons() {
    const g = new THREE.Group()
    g.add(cyl(0.13, 0.11, 0.26, '#7d858c', 0.42, 0.06, 0.3, 14))
    const lid = box(0.3, 0.03, 0.3, '#5d646b', 0.42, 0.34, 0.3)
    g.add(lid)
    for (const x of [-0.05, 0, 0.05]) g.add(box(0.012, 0.18, 0.012, '#5d646b', 0.42 + x, 0.1, 0.42))
    const scrap = ball(0.04, '#c9ced3', 0.42, 0.7, 0.3)
    g.add(scrap)
    anims.push((t) => {
      const f = (t * 0.45) % 1
      lid.rotation.z = f < 0.6 ? -0.9 : 0
      lid.position.y = f < 0.6 ? 0.4 : 0.34
      scrap.position.y = 0.75 - Math.min(1, f / 0.6) * 0.55
      scrap.visible = f < 0.62
    })
    return { group: g }
  },
  City() {
    const g = new THREE.Group()
    for (let i = 0; i < 9; i++) g.add(box(0.07 + (i % 3) * 0.02, 0.04 + (i % 2) * 0.03, 0.07, i % 2 ? '#b9b2a4' : '#8f887c', -0.3 + (i % 5) * 0.12, 0.06, 0.32 + Math.floor(i / 5) * 0.08))
    g.add(box(0.05, 0.9, 0.05, '#e0a23c', 0.45, 0.06, -0.3))
    g.add(box(0.6, 0.04, 0.04, '#e0a23c', 0.2, 0.92, -0.3))
    const swing = new THREE.Group()
    swing.position.set(-0.05, 0.92, -0.3)
    swing.add(box(0.006, 0.45, 0.006, '#2b3036', 0, -0.45, 0))
    swing.add(ball(0.08, '#3a3f44', 0, -0.5, 0))
    g.add(swing)
    const dust = []
    for (let i = 0; i < 3; i++) { const d = ball(0.06, '#c9c2b2', -0.1 + i * 0.1, 0.15, 0.1, { transparent: true }); d.material = d.material.clone(); g.add(d); dust.push(d) }
    anims.push((t) => {
      swing.rotation.z = Math.sin(t * 1.6) * 0.6
      dust.forEach((d, i) => { const f = (t * 0.4 + i / 3) % 1; d.position.y = 0.12 + f * 0.35; d.scale.setScalar(0.6 + f * 1.6); d.material.opacity = 0.7 * (1 - f) })
    })
    return { group: g }
  },
  Machine() {
    const g = new THREE.Group()
    g.add(box(0.24, 0.16, 0.2, '#5d646b', 0.4, 0.2, 0.25))
    for (const z of [-0.04, 0.04]) { const r = gear(0.05, 8, 0.2, '#c9ced3'); r.rotation.y = Math.PI / 2; r.position.set(0.4, 0.38, 0.25 + z); g.add(r); spin(r, z > 0 ? 6 : -6, 'x') }
    g.add(box(0.26, 0.12, 0.22, '#3a3f44', 0.4, 0.06, 0.25))
    for (let i = 0; i < 3; i++) {
      const bit = box(0.03, 0.02, 0.03, '#c9ced3', 0.4, 0.5, 0.25)
      g.add(bit)
      anims.push((t) => { const f = (t * 0.7 + i / 3) % 1; bit.position.y = 0.55 - f * 0.4; bit.position.x = 0.4 + Math.sin(i * 2 + t) * 0.05; bit.rotation.y = t * 4 })
    }
    return { group: g }
  },
}

/** Two crossed boards over something removed. */
function crossed(width, height, y, z) {
  const g = new THREE.Group()
  for (const a of [0.6, -0.6]) { const b = box(width, 0.03, 0.02, '#8a6a4a', 0, 0, 0); b.rotation.z = a; b.position.set(0, y + height / 2, z); g.add(b) }
  return g
}

const MEMBER_SHAPE = {
  endpoint: (c) => box(0.22, 0.34, 0.06, c),
  function: (c) => { const g = new THREE.Group(); g.add(box(0.3, 0.12, 0.2, c)); g.add(ball(0.06, '#f1d2b6', 0, 0.2, -0.05)); return g },
  process: (c) => { const g = new THREE.Group(); g.add(box(0.36, 0.05, 0.16, '#3a3f44', 0, 0.06)); g.add(box(0.1, 0.1, 0.1, c, 0, 0.11)); return g },
  job: (c) => { const g = new THREE.Group(); g.add(cyl(0.12, 0.12, 0.05, c, 0, 0.15, 0, 20)); g.children[0].rotation.x = Math.PI / 2; return g },
  config: (c) => box(0.26, 0.2, 0.03, c),
  class: (c) => { const g = new THREE.Group(); g.add(box(0.36, 0.22, 0.3, c)); g.add(prism(0.38, 0.1, 0.32, shade(c, 0.8), 0, 0.22, 0)); return g },
  interface: (c) => { const g = new THREE.Group(); g.add(box(0.3, 0.02, 0.3, c)); for (const x of [-0.1, 0, 0.1]) g.add(box(0.04, 0.12, 0.04, shade(c, 0.85), x, 0.02, 0.1)); return g },
  module: (c) => box(0.38, 0.2, 0.34, c),
}

return { MODELS, MEMBER_SHAPE, REMOVAL, crossed, box, cyl, ball, mesh, shade, prism, memberHue, dispose: () => { for (const m of mats.values()) m.dispose(); mats.clear() } }
}
