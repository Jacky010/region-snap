# @region-snap/vue

Drag to select any region of a web page and capture it as an image – Vue 3 component.

在网页上拖动框选任意区域并截图，Vue 3 组件。

```bash
npm i @region-snap/vue
```

```vue
<template>
  <RegionSnap v-model:region="region" style="height: 600px" mask show-size>
    <img src="/paper.png" />

    <template #toolbar="{ getFile, clear, capturing }">
      <button :disabled="capturing" @click="upload(getFile, clear)">Recognize</button>
      <button @click="clear()">Cancel</button>
    </template>
  </RegionSnap>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { RegionSnap, type Region } from '@region-snap/vue'

const region = ref<Region | null>(null)

const upload = async (getFile: () => Promise<File | null>, clear: () => void) => {
  const file = await getFile()
  clear()
}
</script>
```

Website | 官网：<https://jacky010.github.io/region-snap-website/>

Full documentation: [English](https://github.com/Jacky010/region-snap#readme) | [简体中文](https://github.com/Jacky010/region-snap/blob/main/README.zh-CN.md)

License: [AGPL-3.0](https://github.com/Jacky010/region-snap/blob/main/LICENSE). A commercial license is required for closed-source use – contact 1126651826@qq.com. | 协议：AGPL-3.0，闭源商用需购买商业授权。
