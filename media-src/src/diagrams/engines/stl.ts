// STL 3D models (three.js) — task 409, split out of custom-diagrams.ts's god-module into its own
// engine file. Lazy-loads three.js + STLLoader/OrbitControls (vendored bundle), finds unprocessed
// `language-stl` blocks, and renders each into a WebGL canvas.
import {
  renderDiagramError,
  renderDiagramLoadError,
} from '../../diagram-kit/diagram-error'
import {
  findBlocks,
  getCdn,
  resetCustomBlocks,
} from '../../diagram-kit/diagram-dom'
import { loadScript } from '../../util/load-script'

declare const window: Window & {
  __threeSTL?: any
}

// A shaded 3D solid can't follow the theme foreground (currentColor) the way our line-art SVG
// diagrams do: three.js lighting MULTIPLIES the base colour, so a near-black foreground — every light
// content theme, e.g. github-light — collapses the model into an all-black, formless blob (reported
// bug). Use a fixed, theme-INDEPENDENT neutral mid-grey instead; the directional lights then render
// clear 3D shading on BOTH light and dark backgrounds. Kept mid-tone (luminance ~0.35) so neither the
// lit nor the shadowed faces clip to white/black. Exported + asserted in stl.test.ts.
export const STL_MATERIAL_COLOR = '#9aa0a6'

function initStlViewer(wrapper: HTMLElement, stlText: string): void {
  const T = window.__threeSTL
  if (!T) return

  const canvas = document.createElement('canvas')
  canvas.style.cssText =
    'width:100%;height:300px;display:block;background:transparent'
  wrapper.innerHTML = ''
  wrapper.appendChild(canvas)

  const w = canvas.clientWidth || 400
  const h = canvas.clientHeight || 300

  const scene = new T.Scene()
  const camera = new T.PerspectiveCamera(50, w / h, 0.1, 10000)
  scene.add(new T.AmbientLight(0x666666))
  const keyLight = new T.DirectionalLight(0xffffff, 1.2)
  keyLight.position.set(1, 2, 1.5)
  scene.add(keyLight)
  const fillLight = new T.DirectionalLight(0xffffff, 0.4)
  fillLight.position.set(-1, -0.5, -1)
  scene.add(fillLight)

  const geom = new T.STLLoader().parse(stlText)
  geom.computeVertexNormals()
  // Theme-independent neutral material (see STL_MATERIAL_COLOR) — NOT the wrapper's foreground, which
  // turned the model all-black on every light theme. data-stl-material records the applied colour so
  // the real-VS-Code e2e can verify the fix without a flaky WebGL pixel read-back.
  const mat = new T.MeshPhongMaterial({
    color: new T.Color(STL_MATERIAL_COLOR),
    shininess: 60,
    specular: new T.Color(0x444444),
  })
  canvas.dataset.stlMaterial = STL_MATERIAL_COLOR
  const mesh = new T.Mesh(geom, mat)
  scene.add(mesh)

  const box = new T.Box3().setFromObject(mesh)
  const center = box.getCenter(new T.Vector3())
  mesh.position.sub(center)
  const size = box.getSize(new T.Vector3()).length()
  // Offset camera for a 3/4 view so multiple faces are visible with shading
  camera.position.set(size * 0.8, size * 0.6, size * 1.2)

  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  // Ctrl-to-interact: orbit/zoom only with Ctrl held (plain scroll = page scroll)
  const controls = new T.OrbitControls(camera, canvas)
  controls.enableZoom = false
  controls.enableRotate = false
  controls.enablePan = false
  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.ctrlKey) {
      controls.enableRotate = true
      controls.enablePan = true
    }
  })
  canvas.addEventListener('mouseup', () => {
    controls.enableRotate = false
    controls.enablePan = false
  })
  canvas.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      if (e.ctrlKey) {
        controls.enableZoom = true
        e.preventDefault()
      } else {
        controls.enableZoom = false
      }
    },
    { passive: false },
  )

  function animate() {
    if (!canvas.isConnected) {
      renderer.dispose()
      return
    }
    requestAnimationFrame(animate)
    controls.update()
    renderer.render(scene, camera)
  }
  animate()

  wrapper.setAttribute('data-processed', 'true')
}

export function renderStl(root?: ParentNode): void {
  const container = root ?? document
  const blocks = findBlocks(container, 'stl')
  if (!blocks.length) return

  const cdn = getCdn()
  loadScript(
    `${cdn}/dist/js/threejs/three-stl.min.js`,
    'vditorThreeStlScript',
  ).then(() => {
    if (!window.__threeSTL) {
      renderDiagramLoadError(blocks, 'stl', 'Three.js STL')
      return
    }
    blocks.forEach(({ wrapper, code }) => {
      try {
        initStlViewer(wrapper, code)
      } catch (error) {
        // Bad ASCII STL → the shared themed error box (task 178; was: silent, left blank). initStlViewer
        // sets data-processed only on success, so set it here too: marks the box terminal so the observer
        // doesn't re-find + re-render the wrapper into a loop (findBlocks skips [data-processed="true"]).
        renderDiagramError(wrapper, 'stl', error)
        wrapper.setAttribute('data-processed', 'true')
      }
    })
  })
}

export function reRenderStl(root?: ParentNode): void {
  const container = root ?? document
  resetCustomBlocks(container, 'stl', 'data-stl-error')
  renderStl(container)
}
