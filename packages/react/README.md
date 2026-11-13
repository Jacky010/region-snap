# @region-snap/react

Drag to select any region of a web page and capture it as an image – React component (React 17+, works with Next.js App Router).

在网页上拖动框选任意区域并截图，React 组件（支持 React 17+，含 Next.js App Router）。

```bash
npm i @region-snap/react
```

```tsx
import { useState } from 'react'
import { RegionSnap, type Region } from '@region-snap/react'

export function Viewer() {
  const [region, setRegion] = useState<Region | null>(null)

  return (
    <RegionSnap
      region={region}
      onRegionChange={setRegion}
      style={{ height: 600 }}
      mask
      showSize
      renderToolbar={({ getFile, clear, capturing }) => (
        <>
          <button
            disabled={capturing}
            onClick={async () => {
              const file = await getFile()
              clear()
            }}
          >
            Recognize
          </button>
          <button onClick={clear}>Cancel</button>
        </>
      )}
    >
      <img src="/paper.png" />
    </RegionSnap>
  )
}
```

Full documentation: [English](https://github.com/Jacky010/region-snap#readme) | [简体中文](https://github.com/Jacky010/region-snap/blob/main/README.zh-CN.md)

License: [AGPL-3.0](https://github.com/Jacky010/region-snap/blob/main/LICENSE). A commercial license is required for closed-source use – contact 1126651826@qq.com. | 协议：AGPL-3.0，闭源商用需购买商业授权。
