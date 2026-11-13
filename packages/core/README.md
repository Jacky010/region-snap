# @region-snap/core

Drag to select any region of a web page and capture it as an image – framework-agnostic core. For Vue / React use [`@region-snap/vue`](https://www.npmjs.com/package/@region-snap/vue) / [`@region-snap/react`](https://www.npmjs.com/package/@region-snap/react).

在网页上拖动框选任意区域并截图，框架无关的核心库。

```bash
npm i @region-snap/core
```

```ts
import { RegionSnap } from '@region-snap/core'

const snap = new RegionSnap(containerEl, contentEl, {
  mask: true,
  showSize: true,
  captureOptions: { minWidth: 300, minHeight: 100 },
  onSelect: (region) => console.log(region),
})
snap.setToolbar(toolbarEl)

const file = await snap.getFile() // or getImage() / getBlob()
snap.setRegion({ x: 0, y: 0, width: 200, height: 100 })
snap.destroy()
```

Full documentation: [English](https://github.com/Jacky010/region-snap#readme) | [简体中文](https://github.com/Jacky010/region-snap/blob/main/README.zh-CN.md)

License: [AGPL-3.0](https://github.com/Jacky010/region-snap/blob/main/LICENSE). A commercial license is required for closed-source use – contact 1126651826@qq.com. | 协议：AGPL-3.0，闭源商用需购买商业授权。
