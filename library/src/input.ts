export class Input {
  private keysDown = new Set<string>()
  private keysPressed = new Set<string>()
  private keysReleased = new Set<string>()
  private mouseButtonsDown = new Set<number>()
  private mouseButtonsPressed = new Set<number>()
  private mouseButtonsReleased = new Set<number>()
  private _mouseX = 0
  private _mouseY = 0
  private _mouseDeltaX = 0
  private _mouseDeltaY = 0
  private prevMouseX = 0
  private prevMouseY = 0
  private _scrollDelta = 0
  private element: HTMLElement

  private handleKeyDown = (e: KeyboardEvent) => {
    if (!this.keysDown.has(e.code)) {
      this.keysPressed.add(e.code)
    }
    this.keysDown.add(e.code)
  }

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keysDown.delete(e.code)
    this.keysReleased.add(e.code)
  }

  private handleMouseMove = (e: MouseEvent) => {
    this._mouseX = e.clientX
    this._mouseY = e.clientY
  }

  private handleMouseDown = (e: MouseEvent) => {
    if (!this.mouseButtonsDown.has(e.button)) {
      this.mouseButtonsPressed.add(e.button)
    }
    this.mouseButtonsDown.add(e.button)
  }

  private handleMouseUp = (e: MouseEvent) => {
    this.mouseButtonsDown.delete(e.button)
    this.mouseButtonsReleased.add(e.button)
  }

  private handleWheel = (e: WheelEvent) => {
    this._scrollDelta += e.deltaY
  }

  private handleBlur = () => {
    this.keysDown.clear()
    this.mouseButtonsDown.clear()
  }

  constructor(element: HTMLElement) {
    this.element = element
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
    element.addEventListener('mousemove', this.handleMouseMove)
    element.addEventListener('mousedown', this.handleMouseDown)
    window.addEventListener('mouseup', this.handleMouseUp)
    element.addEventListener('wheel', this.handleWheel)
    window.addEventListener('blur', this.handleBlur)
  }

  /** Call at the start of each frame to compute mouse deltas */
  beginFrame() {
    this._mouseDeltaX = this._mouseX - this.prevMouseX
    this._mouseDeltaY = this._mouseY - this.prevMouseY
    this.prevMouseX = this._mouseX
    this.prevMouseY = this._mouseY
  }

  /** Call at the end of each frame to clear per-frame state */
  endFrame() {
    this.keysPressed.clear()
    this.keysReleased.clear()
    this.mouseButtonsPressed.clear()
    this.mouseButtonsReleased.clear()
    this._scrollDelta = 0
  }

  /** True while the key is held down. Uses KeyboardEvent.code (e.g. 'KeyW', 'Space', 'ShiftLeft'). */
  isKeyDown(code: string): boolean {
    return this.keysDown.has(code)
  }

  /** True only on the frame the key was first pressed */
  isKeyPressed(code: string): boolean {
    return this.keysPressed.has(code)
  }

  /** True only on the frame the key was released */
  isKeyReleased(code: string): boolean {
    return this.keysReleased.has(code)
  }

  /** True while the mouse button is held (0=left, 1=middle, 2=right) */
  isMouseDown(button = 0): boolean {
    return this.mouseButtonsDown.has(button)
  }

  /** True only on the frame the mouse button was pressed */
  isMousePressed(button = 0): boolean {
    return this.mouseButtonsPressed.has(button)
  }

  /** True only on the frame the mouse button was released */
  isMouseReleased(button = 0): boolean {
    return this.mouseButtonsReleased.has(button)
  }

  /** Current mouse X position in client coordinates */
  get mouseX(): number {
    return this._mouseX
  }

  /** Current mouse Y position in client coordinates */
  get mouseY(): number {
    return this._mouseY
  }

  /** Mouse X movement since last frame */
  get mouseDeltaX(): number {
    return this._mouseDeltaX
  }

  /** Mouse Y movement since last frame */
  get mouseDeltaY(): number {
    return this._mouseDeltaY
  }

  /** Scroll wheel delta since last frame (positive = scroll down) */
  get scrollDelta(): number {
    return this._scrollDelta
  }

  /** Get a -1 to 1 axis value. 'horizontal' = A/D or Left/Right, 'vertical' = W/S or Up/Down. */
  getAxis(name: 'horizontal' | 'vertical'): number {
    switch (name) {
      case 'horizontal': {
        let v = 0
        if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) v -= 1
        if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) v += 1
        return v
      }
      case 'vertical': {
        let v = 0
        if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) v -= 1
        if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) v += 1
        return v
      }
      default:
        return 0
    }
  }

  dispose() {
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    this.element.removeEventListener('mousemove', this.handleMouseMove)
    this.element.removeEventListener('mousedown', this.handleMouseDown)
    window.removeEventListener('mouseup', this.handleMouseUp)
    this.element.removeEventListener('wheel', this.handleWheel)
    window.removeEventListener('blur', this.handleBlur)
  }
}
