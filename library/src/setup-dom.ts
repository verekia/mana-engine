import { Window } from 'happy-dom'

const win = new Window()

// Register DOM globals needed for tests
globalThis.window = win as any
globalThis.document = win.document as any
globalThis.HTMLElement = win.HTMLElement as any
globalThis.KeyboardEvent = win.KeyboardEvent as any
globalThis.MouseEvent = win.MouseEvent as any
globalThis.Event = win.Event as any
