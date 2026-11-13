const STYLE_ID = 'region-snap-style'

const handlePositions = {
  nw: ['0', '0', 'nwse'],
  n: ['50%', '0', 'ns'],
  ne: ['100%', '0', 'nesw'],
  e: ['100%', '50%', 'ew'],
  se: ['100%', '100%', 'nwse'],
  s: ['50%', '100%', 'ns'],
  sw: ['0', '100%', 'nesw'],
  w: ['0', '50%', 'ew'],
}

const css = `
.region-snap {
  --region-snap-color: #409eff;
  --region-snap-selection-border: 1px dashed var(--region-snap-color);
  --region-snap-selection-bg: rgba(64, 158, 255, 0.2);
  --region-snap-mask: rgba(0, 0, 0, 0.45);
  position: relative;
  overflow: auto;
}
.region-snap__content {
  position: relative;
  cursor: crosshair;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
.region-snap[data-touch-mode="drag"] > .region-snap__content {
  touch-action: none;
}
.region-snap:not([data-disabled]):not([data-scrolling]) > .region-snap__content:has(iframe)::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 998;
}
.region-snap[data-scrolling] > .region-snap__content {
  cursor: auto;
}
.region-snap[data-scrolling] > .region-snap__selection {
  background-color: transparent;
  border: none;
  outline: var(--region-snap-selection-border);
}
.region-snap[data-scrolling] .region-snap__size {
  display: none;
}
.region-snap[data-screen-capturing] > .region-snap__selection,
.region-snap[data-screen-capturing] > .region-snap__toolbar {
  visibility: hidden;
}
.region-snap[data-disabled] > .region-snap__content {
  cursor: auto;
  user-select: auto;
  -webkit-user-select: auto;
  touch-action: auto;
}
.region-snap__selection {
  position: absolute;
  z-index: 999;
  box-sizing: border-box;
  border: var(--region-snap-selection-border);
  background-color: var(--region-snap-selection-bg);
  pointer-events: none;
}
.region-snap[data-mask] > .region-snap__selection {
  background-color: transparent;
  box-shadow: 0 0 0 99999px var(--region-snap-mask);
}
.region-snap[data-editable]:not([data-disabled]):not([data-scrolling]) > .region-snap__selection:not([data-mode="draw"]) {
  pointer-events: auto;
  cursor: move;
  touch-action: none;
}
.region-snap__handle {
  position: absolute;
  display: none;
  width: 8px;
  height: 8px;
  box-sizing: border-box;
  background: #fff;
  border: 1px solid var(--region-snap-color);
  transform: translate(-50%, -50%);
}
@media (pointer: coarse) {
  .region-snap__handle { width: 16px; height: 16px; border-radius: 50%; }
}
.region-snap[data-editable]:not([data-disabled]):not([data-scrolling]) > .region-snap__selection:not([data-mode="draw"]) > .region-snap__handle {
  display: block;
}
${Object.entries(handlePositions)
  .map(([name, [left, top, cursor]]) => `.region-snap__handle[data-handle="${name}"] { left: ${left}; top: ${top}; cursor: ${cursor}-resize; }`)
  .join('\n')}
.region-snap__size {
  position: absolute;
  left: -1px;
  bottom: 100%;
  margin-bottom: 4px;
  padding: 0 6px;
  font: 12px/20px system-ui, sans-serif;
  color: #fff;
  white-space: nowrap;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.65);
  border-radius: 2px;
}
.region-snap__size[data-inside] {
  top: 4px;
  left: 4px;
  bottom: auto;
  margin: 0;
}
.region-snap__selection[hidden],
.region-snap__size[hidden],
.region-snap__toolbar[hidden] {
  display: none;
}
.region-snap__toolbar {
  position: absolute;
  z-index: 1000;
  display: flex;
  gap: 8px;
  padding: 5px 10px;
  white-space: nowrap;
  background: #fff;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
`

/** 插到 head 最前面，使用者自己的样式可以直接覆盖 */
export function injectStyle(doc: Document) {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = css
  doc.head.insertBefore(style, doc.head.firstChild)
}
