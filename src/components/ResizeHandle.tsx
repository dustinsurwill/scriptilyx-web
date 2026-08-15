interface ResizeHandleProps {
  axis: 'x' | 'y'
  onMouseDown: (e: React.MouseEvent) => void
}

export function ResizeHandle({ axis, onMouseDown }: ResizeHandleProps) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={
        axis === 'x'
          ? { width: 6, marginLeft: -3, marginRight: -3, cursor: 'col-resize', zIndex: 1 }
          : { height: 6, marginTop: -3, marginBottom: -3, cursor: 'row-resize', zIndex: 1 }
      }
    />
  )
}
