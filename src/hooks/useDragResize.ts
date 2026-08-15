import { useCallback, useRef, useState } from 'react'

/** Drag-to-resize a single numeric dimension (panel width or height).
 * `invert` flips the drag direction — use it when the handle sits on the
 * leading edge of the panel it resizes (dragging left grows a right-hand
 * panel, dragging up grows a bottom panel). */
export function useDragResize(
  initial: number,
  axis: 'x' | 'y',
  min: number,
  max: number,
  invert = false,
) {
  const [size, setSize] = useState(initial)
  const sizeRef = useRef(initial)
  sizeRef.current = size

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const start = axis === 'x' ? e.clientX : e.clientY
      const startSize = sizeRef.current

      const onMove = (ev: MouseEvent) => {
        const delta = (axis === 'x' ? ev.clientX : ev.clientY) - start
        const next = startSize + (invert ? -delta : delta)
        setSize(Math.min(max, Math.max(min, next)))
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [axis, invert, min, max],
  )

  return [size, onMouseDown] as const
}
