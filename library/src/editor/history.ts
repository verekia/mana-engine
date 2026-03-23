export interface HistoryAction {
  description: string
  undo: () => void
  redo: () => void
}

export class UndoHistory {
  private stack: HistoryAction[] = []
  private index = -1

  push(action: HistoryAction) {
    // Discard any redo history beyond the current position
    this.stack.length = this.index + 1
    this.stack.push(action)
    this.index++
  }

  undo(): boolean {
    if (this.index < 0) return false
    this.stack[this.index].undo()
    this.index--
    return true
  }

  redo(): boolean {
    if (this.index >= this.stack.length - 1) return false
    this.index++
    this.stack[this.index].redo()
    return true
  }

  get canUndo(): boolean {
    return this.index >= 0
  }

  get canRedo(): boolean {
    return this.index < this.stack.length - 1
  }

  clear() {
    this.stack.length = 0
    this.index = -1
  }
}
