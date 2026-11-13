/** 模拟第三方文档预览页（如 Office 在线预览），放在 sandbox iframe 里，与页面不同源 */
export const frameHtml = `<!doctype html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { margin: 0; padding: 40px; font: 15px/1.9 system-ui, 'Microsoft YaHei', sans-serif; color: #303133; background: #e9ebef; }
  .page { width: 640px; margin: 0 auto 24px; padding: 40px 48px; background: #fff; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12); }
  h1 { margin: 0 0 16px; font-size: 22px; text-align: center; }
  .block { width: 200px; height: 100px; margin: 16px 0; background: #ff0000; }
  .marker { height: 12px; margin: 0 0 16px; }
  canvas { display: block; margin: 16px 0; }
  p { margin: 0; }
</style>
</head>
<body>
  <div class="page">
    <h1>第三方文档预览（跨域 iframe）</h1>
    <div class="block" id="red-block"></div>
    <p>这一页渲染在不同源的 iframe 中，页面脚本无法读取其中的内容，html2canvas 也只能得到空白。</p>
    <p>开启截图模式后，region-snap 通过共享当前标签页获取屏幕画面，再按选区裁剪。</p>
    <canvas id="chart" width="480" height="160"></canvas>
    <p>框选后点「滚动截图」，在选区内滚动文档，组件会边滚边拼接，点「完成」得到长图。</p>
  </div>
  <div id="pages"></div>
  <script>
    const ctx = document.getElementById('chart').getContext('2d')
    const colors = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399']
    colors.forEach((color, i) => {
      const h = 30 + i * 25
      ctx.fillStyle = color
      ctx.fillRect(30 + i * 90, 150 - h, 60, h)
    })

    const markers = ['#00c853', '#2962ff', '#d500f9', '#ff6d00']
    const options = ['y = -x²', 'y = 1/x', 'y = ln x', 'y = (1/2)^x', 'y = |x - 1|', 'y = x³ - x']
    let html = ''
    for (let page = 0; page < 4; page++) {
      html += '<div class="page"><h1>第 ' + (page + 2) + ' 页</h1>'
      html += '<div class="marker" style="background:' + markers[page] + '"></div>'
      for (let q = 1; q <= 6; q++) {
        const n = page * 6 + q
        html += '<p>' + n + '. 下列函数中，在区间 (0, +∞) 上单调递增的是（ ）</p>'
        html += '<p>A. ' + options[n % 6] + ' &nbsp;&nbsp; B. ' + options[(n + 1) % 6] + ' &nbsp;&nbsp; C. ' + options[(n + 2) % 6] + ' &nbsp;&nbsp; D. ' + options[(n + 3) % 6] + '</p>'
      }
      html += '</div>'
    }
    document.getElementById('pages').innerHTML = html
  </script>
</body>
</html>`
