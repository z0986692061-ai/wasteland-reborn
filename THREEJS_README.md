# Three.js WebGL 3D 版本

目前 Safari 網頁版已切換至 Three.js WebGL 3D 渲染，使用真正的 `PerspectiveCamera`、世界座標、3D Mesh、方向光、即時陰影、湖水、山體、3D 草叢、樹木、房屋、廢車、鐵桶、木桌與鐵櫃。

## 技術

- Three.js 0.160.0 ES Module
- `PerspectiveCamera` 第一人稱相機
- `WebGLRenderer` + PCFSoftShadowMap
- `MeshStandardMaterial` 草地、木材、鏽鐵與建築材質
- `InstancedMesh` 草叢
- Raycaster 中央準星互動
- CanvasTexture 程序化草地紋理
- Pointer Events 虛擬搖桿與右側滑動視角
- localStorage 離線進度

## 目前保留功能

拆解物件、材料背包、復甦度、天氣切換、第一人稱蹲下、工作桌／小屋／圍牆／燈具建造、提示詞與設定面板。移動碰撞使用玩家半徑、世界座標碰撞盒、每步不超過 0.12 單位的分段位移與 X/Z 分軸滑動；房屋、廢車、鐵桶、木桌、鐵櫃、湖水與建造物件都會阻擋玩家，玩家高度每幀回到草地基準，避免穿牆、穿水與浮空。虛擬搖桿以相機前方為前進基準，鎖定單一 pointer ID，並啟用 touch-action:none，避免轉視角、多指觸控或瀏覽器手勢改寫搖桿方向。

Three.js 0.160.0 核心已複製到專案的 `vendor/three.module.js`，遊戲不需要再向第三方 CDN 請求渲染核心；遊戲進度本身仍保存在 Safari 本機。第一次開啟網站仍需要能連線到遊戲網址。
