import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three'

export interface ManaScene {
  dispose(): void
}

export function createScene(canvas: HTMLCanvasElement): ManaScene {
  const renderer = new WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)

  const scene = new Scene()
  scene.background = new Color(0x111111)

  const camera = new PerspectiveCamera(50, 1, 0.1, 100)
  camera.position.set(0, 1, 3)
  camera.lookAt(0, 0, 0)

  const geometry = new BoxGeometry()
  const material = new MeshStandardMaterial({ color: 0x4488ff })
  const cube = new Mesh(geometry, material)
  scene.add(cube)

  const light = new DirectionalLight(0xffffff, 2)
  light.position.set(2, 3, 4)
  scene.add(light)
  scene.add(new AmbientLight(0xffffff, 0.3))

  let animationId = 0

  function resize() {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== w || canvas.height !== h) {
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
  }

  function animate() {
    animationId = requestAnimationFrame(animate)
    cube.rotation.x += 0.01
    cube.rotation.y += 0.015
    resize()
    renderer.render(scene, camera)
  }

  animate()

  return {
    dispose() {
      cancelAnimationFrame(animationId)
      renderer.dispose()
      geometry.dispose()
      material.dispose()
    },
  }
}
