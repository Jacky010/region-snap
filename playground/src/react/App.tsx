import { useEffect, useMemo, useRef, useState } from 'react'
import { RegionSnap, type CaptureOptions, type Region, type RegionSnapHandle } from '@region-snap/react'
import {
  PRESET_REGION,
  createPreview,
  defaultConfig,
  download,
  drawChart,
  formatBytes,
  paperHtml,
  zoomStyle,
  type DemoConfig,
  type Preview,
} from '../shared/paper'

const switches = ['disabled', 'editable', 'mask', 'showSize', 'autoCapture', 'autoScroll', 'fastCrop'] as const

export function App() {
  const snapRef = useRef<RegionSnapHandle>(null)
  const paperRef = useRef<HTMLDivElement>(null)
  const [region, setRegion] = useState<Region | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [config, setConfig] = useState(defaultConfig)

  const captureOptions = useMemo<CaptureOptions>(
    () => ({
      scale: config.scale || undefined,
      fastCrop: config.fastCrop,
      minWidth: config.minWidth,
      minHeight: config.minHeight,
    }),
    [config.scale, config.fastCrop, config.minWidth, config.minHeight],
  )

  const log = (name: string, payload?: unknown) => {
    const time = new Date().toLocaleTimeString()
    const line = `${time}  ${name}${payload === undefined ? '' : '  ' + JSON.stringify(payload)}`
    setLogs((prev) => [line, ...prev].slice(0, 50))
  }

  const handlePreview = async (getImage: () => Promise<string | null>, getBlob: () => Promise<Blob | null>) => {
    const [src, blob] = await Promise.all([getImage(), getBlob()])
    setPreview(await createPreview(src, blob))
  }

  const handleDownload = async (getImage: () => Promise<string | null>) => {
    const src = await getImage()
    if (src) download(src, 'region.png')
  }

  const setField = <K extends keyof DemoConfig>(key: K, value: DemoConfig[K]) =>
    setConfig((prev) => ({ ...prev, [key]: value }))

  useEffect(() => {
    if (paperRef.current) drawChart(paperRef.current)
  }, [])

  useEffect(() => {
    snapRef.current?.refresh()
  }, [config.zoom])

  return (
    <div className="demo">
      <div className="demo-main">
        <div className="demo-tip">
          React · 拖动框选，拖到边缘自动滚动；选区可移动、拖角点调整；触屏长按后拖动；Esc 或点击外部清除
        </div>
        <div className="demo-stage">
          <div className="zoom-wrapper" style={zoomStyle(config.zoom)}>
            <RegionSnap
              ref={snapRef}
              className="demo-viewer"
              region={region}
              onRegionChange={setRegion}
              disabled={config.disabled}
              editable={config.editable}
              mask={config.mask}
              showSize={config.showSize}
              autoCapture={config.autoCapture}
              autoScroll={config.autoScroll}
              touchMode={config.touchMode}
              captureOptions={captureOptions}
              onSelect={(r) => log('select', r)}
              onCapture={(_, r) => log('capture', r)}
              onClear={() => log('clear')}
              onError={(e) => log('error', String(e))}
              renderToolbar={({ getImage, getBlob, clear, capturing }) => (
                <>
                  <button className="btn btn-primary" disabled={capturing} onClick={() => handlePreview(getImage, getBlob)}>
                    预览截图
                  </button>
                  <button className="btn" disabled={capturing} onClick={() => handleDownload(getImage)}>
                    下载
                  </button>
                  <button className="btn" onClick={clear}>
                    取消
                  </button>
                </>
              )}
            >
              <div ref={paperRef} dangerouslySetInnerHTML={{ __html: paperHtml }} />
            </RegionSnap>
          </div>
        </div>
      </div>

      <div className="demo-side">
        <section className="panel">
          <h3>参数</h3>
          {switches.map((key) => (
            <label key={key} className="field">
              {key}
              <input type="checkbox" checked={config[key]} onChange={(e) => setField(key, e.target.checked)} />
            </label>
          ))}
          <label className="field">
            touchMode
            <select value={config.touchMode} onChange={(e) => setField('touchMode', e.target.value as DemoConfig['touchMode'])}>
              <option value="longpress">longpress</option>
              <option value="drag">drag</option>
            </select>
          </label>
          <label className="field">
            scale（0 = 自动）
            <input type="number" min={0} value={config.scale} onChange={(e) => setField('scale', Number(e.target.value))} />
          </label>
          <label className="field">
            minWidth
            <input type="number" min={0} step={50} value={config.minWidth} onChange={(e) => setField('minWidth', Number(e.target.value))} />
          </label>
          <label className="field">
            minHeight
            <input type="number" min={0} step={50} value={config.minHeight} onChange={(e) => setField('minHeight', Number(e.target.value))} />
          </label>
          <label className="field">
            zoom（CSS 缩放）
            <select value={config.zoom} onChange={(e) => setField('zoom', Number(e.target.value))}>
              <option value={1}>1</option>
              <option value={0.75}>0.75</option>
              <option value={1.25}>1.25</option>
            </select>
          </label>
        </section>

        <section className="panel">
          <h3>region（受控）</h3>
          <code className="region-value">{region ? JSON.stringify(region) : 'null'}</code>
          <div className="actions">
            <button className="btn" onClick={() => setRegion({ ...PRESET_REGION })}>预设选区</button>
            <button className="btn" onClick={() => setRegion(null)}>清除</button>
          </div>
        </section>

        <section className="panel">
          <h3>
            截图预览
            {preview && (
              <span className="meta">
                {preview.width} × {preview.height} px · {formatBytes(preview.bytes)}
              </span>
            )}
          </h3>
          <div className="preview">
            {preview ? <img src={preview.src} /> : <span className="placeholder">点击工具栏「预览截图」</span>}
          </div>
        </section>

        <section className="panel">
          <h3>
            事件日志 <button className="btn btn-link" onClick={() => setLogs([])}>清空</button>
          </h3>
          <div className="logs">
            {logs.map((item, index) => (
              <div key={index}>{item}</div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
