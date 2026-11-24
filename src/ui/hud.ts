export interface Hud {
  setShelved(count: number): void
}

export interface HudActions {
  /** Flips sound on or off and returns whether it is now on. */
  toggleSound(): boolean
  toggleView(): void
}

/** The small overlay: a jar counter, two buttons and a hint. Press H to hide it for recording. */
export function createHud(root: HTMLElement, actions: HudActions): Hud {
  root.innerHTML = `
    <div class="hud-count"><span class="hud-label">Jars shelved</span><span class="hud-number" id="hud-number">0</span></div>
    <div class="hud-actions">
      <button type="button" id="hud-sound">Sound on</button>
      <button type="button" id="hud-view">Change view</button>
    </div>
    <p class="hud-hint">Click an item on the belt to sort it by hand. Press H to hide this.</p>`

  const number = root.querySelector<HTMLElement>('#hud-number')!
  const sound = root.querySelector<HTMLButtonElement>('#hud-sound')!
  sound.addEventListener('click', () => {
    sound.textContent = actions.toggleSound() ? 'Sound on' : 'Sound off'
  })
  root.querySelector<HTMLButtonElement>('#hud-view')!.addEventListener('click', () => actions.toggleView())
  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'h') root.hidden = !root.hidden
  })

  let shown = -1
  return {
    setShelved(count) {
      if (count === shown) return
      shown = count
      number.textContent = String(count)
    },
  }
}
