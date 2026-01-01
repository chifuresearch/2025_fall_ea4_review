// --- Shaders ---
// --- Shaders ---
const pointCloudVertexShader = `
    precision highp float;
    attribute vec3 position;
    attribute vec2 uv;

    uniform mat4 worldViewProjection;
    uniform float perspectiveFactor;
    
    uniform vec2 mousePos;
    uniform float time;
    uniform float minAlpha;          // [新增] 重新加回最小 Alpha 值
    uniform float cullFactor;        // [新增] 剔除與 Alpha 的混合因子 (0.0 - 1.0)
    uniform float edgeFadeStart;
    uniform float edgeFadePower;
    uniform float centerDensityFactor;
    uniform float centerDensityRadius;

    varying vec2 vUV;
    varying float vAlpha;            // [新增] 重新加回 vAlpha

    // --- PRNG (Unchanged) ---
    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    // --- Simplex Noise (Unchanged) ---
    // ... (noise function code is identical, so it's omitted here for brevity)
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
    float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy) );
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m; m = m*m;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
    }


    void main(void) {
        // --- 基本計算 (與之前類似) ---
        vec4 screenPos = worldViewProjection * vec4(position, 1.0);
        vec2 normalizedScreenPos = (screenPos.xy / screenPos.w) * 0.5 + 0.5;
        
        float mouseNoiseFrequency = 2.0;
        float mouseNoiseStrength = 0.30; 
        float noise = (snoise(normalizedScreenPos * mouseNoiseFrequency + time * 0.3) + 1.0) * 0.5;
        float distToMouse = distance(normalizedScreenPos, mousePos) - noise * mouseNoiseStrength;
        float calmRadius = 0.1;       
        float transitionRadius = 0.2; 
        float strength = smoothstep(calmRadius, calmRadius + transitionRadius, distToMouse);
        
        vec2 distToScreenCenter = abs(normalizedScreenPos - vec2(0.5, 0.5));
        float maxDistFromCenter = max(distToScreenCenter.x, distToScreenCenter.y); 
        float normalizedEdgeDist = maxDistFromCenter * 2.0; 
        float edgeFactor = 1.0 - smoothstep(edgeFadeStart, 1.0, normalizedEdgeDist);
        edgeFactor = pow(edgeFactor, edgeFadePower);
        
        // --- [修改] 混合剔除與 Alpha 的核心邏輯 ---

        // 1. 計算總體可見度 (1.0 = 完全可見, 0.0 = 完全不可見)
        float visibility = (1.0 - strength) * edgeFactor;

        // 2. 根據 cullFactor 計算剔除機率
        // 當點完全不可見時 (visibility=0), 剔除機率為 cullFactor
        float cullProbability = (1.0 - visibility) * cullFactor;
        
        // 3. 執行剔除
        if (random(position.xy) < cullProbability) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // 移出畫面
            return;
        }

        // 4. 對於存活下來的點，計算並傳遞 Alpha 值
        // 將 visibility (0-1) 映射到我們期望的 alpha 範圍 (minAlpha-1.0)
        vAlpha = mix(minAlpha, 1.0, visibility);

        // --- 後續計算 (與之前相同) ---
        vec3 finalPosition = position;
        float maxDisplacement = 50.0;
        float noiseFrequency = 0.05;
        float displacementX = snoise(position.yz * noiseFrequency + time * 0.5) * 2.0 - 1.0;
        float displacementY = snoise(position.xz * noiseFrequency + time * 0.5) * 2.0 - 1.0;
        float displacementZ = snoise(position.xy * noiseFrequency + time * 0.5) * 2.0 - 1.0;
        vec3 displacement = normalize(vec3(displacementX, displacementY, displacementZ)) * maxDisplacement;
        finalPosition += displacement * strength;

        gl_Position = worldViewProjection * vec4(finalPosition, 1.0);
        vUV = uv;
        
        float baseSize = perspectiveFactor / gl_Position.w;
        float finalPointSize = baseSize;
        float distToCenter = distance(normalizedScreenPos, vec2(0.5, 0.5));
        
        if (distToCenter < centerDensityRadius) {
            float densityEffect = smoothstep(centerDensityRadius, 0.0, distToCenter);
            finalPointSize *= (1.0 + densityEffect * centerDensityFactor);
        }
        
        gl_PointSize = clamp(finalPointSize, 1.0, 100.0); 
    }
`;
const pointCloudFragmentShader = `
    precision highp float;
    varying vec2 vUV;
    varying float vAlpha; // [新增] 重新加回
    uniform sampler2D textureSampler;

    void main(void) {
        vec4 texColor = texture2D(textureSampler, vUV);
        if (texColor.a < 0.25) { discard; }

        // [修改] 重新使用 vAlpha 來混合透明度
        gl_FragColor = vec4(texColor.rgb, texColor.a * vAlpha);
    }
`;


// ==========================================
// Shader 2: 連線專用 (Lines) - 滑鼠中心淨空版
// ==========================================
const lineVertexShader = `
    precision highp float;
    attribute vec3 position;

    uniform mat4 worldViewProjection;
    uniform vec2 mousePos;
    uniform float time;
    uniform float interactionRadius; // 這個變數現在用來控制「變密」的過渡範圍

    varying float vLineAlpha;

    // --- (雜訊函數保持不變，省略以節省篇幅) ---
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
    float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy) );
        vec2 x0 = v -  i + dot(i, C.xx);
        vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m; m = m*m;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
    }

    void main(void) {
        // 1. 計算螢幕座標與滑鼠距離 (包含一點雜訊讓邊緣是有機的)
        vec4 tempScreenPos = worldViewProjection * vec4(position, 1.0);
        vec2 normalizedScreenPos = (tempScreenPos.xy / tempScreenPos.w) * 0.5 + 0.5;

        float mouseNoiseFrequency = 2.0;
        float mouseNoiseStrength = 0.2; // 稍微降低一點雜訊強度
        float noise = (snoise(normalizedScreenPos * mouseNoiseFrequency + time * 0.3) + 1.0) * 0.5;
        
        // 計算到滑鼠的距離，並加入雜訊干擾
        float distToMouse = distance(normalizedScreenPos, mousePos) + (noise - 0.5) * mouseNoiseStrength;

        // --- [核心修改] 透明度計算邏輯反轉 ---
        
        // 定義「絕對淨空區」半徑 (在這個範圍內 alpha = 0)
        float clearRadius = 0.15; 
        
        // 定義「完全密集區」開始的半徑 (超過這個範圍 alpha = 1)
        // 我們利用 interactionRadiusuniform 來控制這個過渡帶的寬度
        float denseRadius = clearRadius + interactionRadius;

        // 使用 smoothstep 產生從 0 到 1 的平滑過渡
        // 當 dist < clearRadius，結果為 0
        // 當 dist > denseRadius，結果為 1
        float intensity = smoothstep(clearRadius, denseRadius, distToMouse);
        
        // 直接使用 intensity 作為 Alpha 值，或者加個次方調整曲線
        vLineAlpha = intensity; 

        // --- (位移與位置計算保持不變) ---
        vec3 finalPosition = position;
        float maxDisplacement = 50.0;
        float noiseFrequency = 0.05;
        float displacementX = snoise(position.yz * noiseFrequency + time * 0.5) * 2.0 - 1.0;
        float displacementY = snoise(position.xz * noiseFrequency + time * 0.5) * 2.0 - 1.0;
        float displacementZ = snoise(position.xy * noiseFrequency + time * 0.5) * 2.0 - 1.0;
        vec3 displacement = normalize(vec3(displacementX, displacementY, displacementZ)) * maxDisplacement;
        
        // 這裡的 strength 計算可以移除，因為我們不再需要它來控制位移幅度
        // 線條的位移應該總是跟著點跑，我們只控制它的透明度
        finalPosition += displacement; 

        gl_Position = worldViewProjection * vec4(finalPosition, 1.0);
    }
`;

const lineFragmentShader = `
    precision highp float;
    varying float vLineAlpha;

    void main(void) {
        // 1. 門檻值稍微提高，過濾掉太虛的邊緣，讓線條看起來更銳利
        if (vLineAlpha < 0.1) discard; 

        // 2. [修正] 顏色改為與點雲相同的淺藍色
        vec3 lineColor = vec3(0.3, 0.4, 0.5); 
        
        // 3. [修正] 透明度降低 (0.6 -> 0.3)
        // 降低透明度是讓 1px 線條看起來更細緻的最好方法
        gl_FragColor = vec4(lineColor, vLineAlpha * 0.1); 
    }
`;

// ==========================================
// 3. Helper Functions
// ==========================================
function calculateMeshSurfaceArea(mesh){mesh.computeWorldMatrix(true);const p=mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind),i=mesh.getIndices();if(!p||!i)return 0;let t=0;for(let n=0;n<i.length;n+=3){const o=BABYLON.Vector3.FromArray(p,i[n]*3),r=BABYLON.Vector3.FromArray(p,i[n+1]*3),s=BABYLON.Vector3.FromArray(p,i[n+2]*3);const e=new BABYLON.Vector3,a=new BABYLON.Vector3;r.subtractToRef(o,e);s.subtractToRef(o,a);t+=BABYLON.Vector3.Cross(e,a).length()/2}return t}

// [新增] 產生線段數據的函式 (連接相鄰的點)
// [修正版] 產生線段數據 (隨機 2-6 條連線)
function generateLineDataFromPoints(positions, connectRatio = 0.1, maxDist = 300) {
    const linePositions = [];
    const numPoints = positions.length / 3;
    
    // 搜尋範圍維持大一點，確保能找到足夠的鄰居
    const searchWindow = 100; 
    
    const step = Math.floor(1 / connectRatio); 

    for (let i = 0; i < numPoints; i += step) {
        const x1 = positions[i * 3];
        const y1 = positions[i * 3 + 1];
        const z1 = positions[i * 3 + 2];

        let connectionsFound = 0; 

        // [新增] 隨機決定這個點要連幾條線 (2 到 6 之間)
        // Math.random() * (max - min + 1) + min
        const targetConnections = Math.floor(Math.random() * (8 - 3 + 1)) + 3;

        // 內層迴圈：往後找鄰居
        for (let j = 1; j <= searchWindow; j++) {
            const nextIdx = (i + j);
            if (nextIdx >= numPoints) break;

            const x2 = positions[nextIdx * 3];
            const y2 = positions[nextIdx * 3 + 1];
            const z2 = positions[nextIdx * 3 + 2];

            const distSq = (x2-x1)**2 + (y2-y1)**2 + (z2-z1)**2;
            
            if (distSq < maxDist * maxDist) {
                linePositions.push(x1, y1, z1);
                linePositions.push(x2, y2, z2);
                
                connectionsFound++;
                
                // [修改] 達到隨機目標數量就停止
                if (connectionsFound >= targetConnections) break; 
            }
        }
    }
    
    console.log(`Generated lines vertices: ${linePositions.length / 3}`);
    return linePositions;
}

// [新增] 全域變數追蹤狀態
let isInfoMode = false;

let countdownInterval = null; // Store the timer ID
let aboutCarouselInterval = null; // [新增] 用來儲存 About 輪播的計時器
let matrixIntervals = []; // [新增] 用來儲存 Matrix 亂碼特效的計時器

// --- Main Babylon.js Script ---
window.addEventListener('DOMContentLoaded', async () => {
    const canvas = document.getElementById('renderCanvas');
    const engine = new BABYLON.Engine(canvas, true);

    const createScene = async () => {
        const scene = new BABYLON.Scene(engine);
        
        // [修正] 設定背景顏色為純黑，讓玻璃擬態效果更明顯，且不透出網頁白底
        scene.clearColor = new BABYLON.Color4(0, 0, 0.05, 0.95);

        let renderableMeshes = [];
        let pointCloudMeshes = [];
        let shaderMaterials = []; 
        let time = 0;
        let isPointCloudMode = true;
        let globalMousePos = new BABYLON.Vector2(0.5, 0.5);

        const defaultInitialView = { 
            name: "預設視角", 
            position: new BABYLON.Vector3(446, 180, -2000),
            target: new BABYLON.Vector3(446, 180, -500) 
        };

        const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 150, BABYLON.Vector3.Zero(), scene);
        camera.position.copyFrom(defaultInitialView.position);
        camera.setTarget(defaultInitialView.target);
        
        new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);

        const GLB_FILE_PATH = "sitecam.glb"; 
        const TOTAL_POINT_COUNT = 50000;
        
        try {
            const importResult = await BABYLON.SceneLoader.ImportMeshAsync(null, "", GLB_FILE_PATH, scene);
            
            const rootNode = scene.getMeshByName("__root__");
            if (rootNode) {
                const scaleFactor = 100;
                rootNode.scaling = new BABYLON.Vector3(-1*scaleFactor, scaleFactor, scaleFactor);
                rootNode.computeWorldMatrix(true);
            }

            // 處理導覽節點
            const navigationNodes = [];
            const navDataMap = new Map();

            importResult.meshes.forEach(mesh => {
                const locMatch = mesh.name.match(/^c(\d+)_loc$/);
                const targetMatch = mesh.name.match(/^c(\d+)_target$/);
                let id = null;
                let type = '';
                if (locMatch) { id = locMatch[1]; type = 'loc'; }
                else if (targetMatch) { id = targetMatch[1]; type = 'target'; }
                
                if (id) {
                    if (!navDataMap.has(id)) { navDataMap.set(id, {}); }
                    navDataMap.get(id)[type] = mesh;
                    mesh.isVisible = false; 
                }
            });

            navigationNodes.push(defaultInitialView);
            const sortedKeys = Array.from(navDataMap.keys()).sort((a, b) => parseInt(a) - parseInt(b));
            
            for (const id of sortedKeys) {
                const data = navDataMap.get(id);
                if (data.loc && data.target) {
                    navigationNodes.push({
                        name: `視角 ${id}`,
                        position: data.loc.getAbsolutePosition(),
                        target: data.target.getAbsolutePosition()
                    });
                }
            }
            
            renderableMeshes = importResult.meshes.filter(m => 
                m.getTotalVertices() > 0 && 
                m instanceof BABYLON.Mesh &&
                !m.name.match(/^c\d+_(loc|target)$/)
            );

            if (renderableMeshes.length > 0) {
                let totalArea = 0;
                const meshAreas = renderableMeshes.map(mesh => {
                    const area = calculateMeshSurfaceArea(mesh);
                    totalArea += area;
                    return { mesh, area };
                }).filter(data => data.area > 0);

                for (const meshData of meshAreas) {
                    const { mesh, area } = meshData;
                    const pointsForThisMesh = Math.round(TOTAL_POINT_COUNT * (area / totalArea));
                    if (pointsForThisMesh === 0) continue;
                    const texture = (mesh.material instanceof BABYLON.PBRMaterial) ? mesh.material.albedoTexture : null;
                    if (!texture) { mesh.isVisible = false; continue; }


                    // ------------------------------------
                    // LAYER 1: 點 Mesh (Point)
                    // ------------------------------------

                    const pointData = generatePointDataOnMesh(mesh, pointsForThisMesh);
                    if (!pointData) continue;
                    
                    const shaderMaterial = new BABYLON.ShaderMaterial("pointCloudShader_" + mesh.id, scene, {
                        vertexSource: pointCloudVertexShader,
                        fragmentSource: pointCloudFragmentShader,
                    }, {
                        attributes: ["position", "uv"],
                        uniforms: ["worldViewProjection", "perspectiveFactor", "mousePos", "time", "minAlpha", "cullFactor", "edgeFadeStart", "edgeFadePower", "centerDensityFactor", "centerDensityRadius"],
                        samplers: ["textureSampler"]
                    });

                    shaderMaterial.setFloat("perspectiveFactor", 1200.0);
                    shaderMaterial.setFloat("interactionRadius", 0.15);
                    shaderMaterial.setFloat("sizeMultiplier", 30.0);

                    shaderMaterial.setFloat("minAlpha", 0.1); 
                    shaderMaterial.setFloat("cullFactor", 0.85); 
                    shaderMaterial.setFloat("edgeFadeStart", 1.0);
                    shaderMaterial.setFloat("edgeFadePower", 5.0);
                    shaderMaterial.setFloat("centerDensityFactor", 2.0);
                    shaderMaterial.setFloat("centerDensityRadius", 0.4);

                    shaderMaterial.setTexture("textureSampler", texture);
                    shaderMaterial.backFaceCulling = false;
                    shaderMaterial.fillMode = BABYLON.Material.PointFillMode;
                    // 開啟透明度混合
                    shaderMaterial.needAlphaBlending = () => true;
                    shaderMaterial.alphaMode = BABYLON.Engine.ALPHA_ADD;
                    shaderMaterial.forceDepthWrite = false;
                    
                    shaderMaterials.push(shaderMaterial);

                    const pointCloudMesh = new BABYLON.Mesh("manual_point_cloud_" + mesh.id, scene);
                    const vertexData = new BABYLON.VertexData();
                    vertexData.positions = pointData.positions;
                    vertexData.indices = pointData.indices;
                    vertexData.uvs = pointData.uvs;
                    vertexData.applyToMesh(pointCloudMesh);
                    pointCloudMesh.material = shaderMaterial;
                    
                    pointCloudMeshes.push(pointCloudMesh);

                    // ----------------------------------------------------
                    // B. 建立連線 (Lines Mesh) - 修正後
                    // ----------------------------------------------------
                    // 產生線段數據 (連接 20% 的點，最大距離 150)
                    const linePos = generateLineDataFromPoints(pointData.positions, 1, 200);
                    
                    if (linePos.length > 0) {
                        // [修正] 改用 CreateLineSystem 來建立基礎網格，這保證它是 Line 結構
                        // 我們需要把 linePos 轉換成 Babylon 需要的格式 (Array of Arrays)
                        const linesArray = [];
                        for (let k = 0; k < linePos.length; k += 6) {
                            linesArray.push([
                                new BABYLON.Vector3(linePos[k], linePos[k+1], linePos[k+2]),
                                new BABYLON.Vector3(linePos[k+3], linePos[k+4], linePos[k+5])
                            ]);
                        }

                        // 使用 CreateLineSystem (這會自動處理 indices 為畫線模式)
                        const lineMesh = BABYLON.MeshBuilder.CreateLineSystem("lines_" + mesh.id, {
                            lines: linesArray,
                            updatable: true
                        }, scene);

                        const lineMaterial = new BABYLON.ShaderMaterial("lineMat_" + mesh.id, scene, {
                            vertexSource: lineVertexShader,
                            fragmentSource: lineFragmentShader,
                        }, {
                            attributes: ["position"],
                            uniforms: ["worldViewProjection", "mousePos", "time", "interactionRadius"]
                        });

                        lineMaterial.setFloat("interactionRadius", 1.7);
                        lineMaterial.backFaceCulling = false;

                        lineMaterial.needAlphaBlending = () => true; //shadermaterial 用這個才對
                        lineMaterial.alphaMode = BABYLON.Engine.ALPHA_ADD;
                        lineMaterial.forceDepthWrite = false;
                        
                        // [修正] 確保 Shader 知道這是畫線
                        lineMaterial.fillMode = BABYLON.Material.LineListDrawMode;

                        lineMesh.material = lineMaterial;
                        shaderMaterials.push(lineMaterial);
                        
                        // 加入控制陣列
                        pointCloudMeshes.push(lineMesh); 
                    }
                    
                    pointCloudMesh.isVisible = isPointCloudMode;
                    mesh.isVisible = !isPointCloudMode;
                }
            }

            // ============================================================
            // --- [Step 1] UI 樣式與 HTML 結構注入 ---
            // ============================================================
            
            // 在 style.innerHTML 的最前面加入動畫定義
            const typewriterAnimations = `
                /* --- 打字機動畫定義 --- */
                @keyframes typing { from { width: 0 } to { width: 100% } }
                @keyframes blink-caret { from, to { border-color: transparent } 50% { border-color: #fff; } }
            `;


            const style = document.createElement('style');
            style.innerHTML = typewriterAnimations + `
                #navigation-bar { display: none !important; }

                /* --- [基礎面板設定 - 核心定位] --- */
                #info-panel {
                    position: absolute;
                    top: 50%; left: 50%;
                    /* 預設隱藏時稍微向下偏移，製造浮現效果 */
                    transform: translate(-50%, -50%) translateY(30px);
                    
                    z-index: 10;
                    /* [關鍵] 預設不擋滑鼠，讓事件穿透到 Canvas */
                    pointer-events: none;
                    opacity: 0;
                    transition: all 0.8s cubic-bezier(0.2, 0.8, 0.2, 1);
                    
                    font-family: 'Courier New', Courier, monospace;
                    color: white;
                    box-sizing: border-box;
                }

                /* 啟動狀態：完全置中，透明度 1 */
                #info-panel.active {
                    opacity: 1;
                    transform: translate(-50%, -50%);
                    /* [關鍵] 即使顯示了，依然保持 none，除非是特定模式覆寫 */
                    pointer-events: none;
                }

                /* ========================================= */
                /* --- [修正 1] 模式 A: 首頁 (Cover Mode) --- */
                /* ========================================= */
                #info-panel.mode-cover {
                    width: 100%; 
                    height: 100%;
                    background: radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.4) 100%);
                    
                    /* [關鍵修改] 讓內容向中心集中 */
                    display: flex;
                    flex-direction: column;
                    justify-content: center; /* 垂直置中 (不再是 space-between) */
                    align-items: center;
                    
                    /* [關鍵修改] 控制三個區塊(上、中、下)之間的距離 */
                    /* 使用 vh 單位，讓距離隨螢幕高度縮放，保持集中感 */
                    gap: 8vh; 
                    
                    padding: 20px;
                }

                /* --- 1. 頂部資訊區 --- */
                .cover-top-section {
                    flex: 0 0 auto;
                    text-align: center;
                    border-bottom: 1px solid rgba(0, 255, 204, 0.3);
                    padding-bottom: 10px;
                }

                .cover-meta-info {
                    font-size: 0.9rem;
                    letter-spacing: 2px;
                    font-family: 'Courier New', monospace;
                    font-size: 0.9rem;
                    font-weight: 700;
                    letter-spacing: 2px;
                    color: #aaffdd;
                    text-shadow: 0 0 8px rgba(0, 255, 180, 0.7);
                    text-transform: uppercase;
                }

                /* --- 2. 中間核心區 (標題 + 倒數) --- */
                .cover-hero-section {
                    flex: 0 0 auto; /* 不再強制撐開空間，改由 gap 控制距離 */
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 3vh;
                }

                .cover-main-title {
                    font-family: 'Helvetica Neue', Arial, sans-serif;
                    font-weight: 700;
                    text-transform: uppercase;
                    text-align: center;
                    color: #e0fffa;
                    font-size: clamp(2.5rem, 6vw, 6rem);
                    line-height: 1.1;
                    letter-spacing: 2px;
                    text-shadow: 
                        0 0 10px rgba(0, 255, 204, 0.8),
                        0 0 30px rgba(0, 255, 204, 0.4),
                        0 0 60px rgba(0, 255, 204, 0.2);
                }

                .countdown-wrapper {
                    display: flex;
                    gap: 3vw;
                    align-items: flex-start;
                }
                .time-unit { display: flex; flex-direction: column; align-items: center; }
                .time-val {
                    font-family: 'Courier New', monospace;
                    font-weight: 700;
                    color: #fff;
                    font-size: clamp(2rem, 4vw, 4rem);
                    text-shadow: 0 0 15px rgba(0, 255, 204, 0.6);
                    line-height: 1;
                }
                .time-separator {
                    font-family: 'Courier New', monospace;
                    font-size: clamp(2rem, 4vw, 4rem);
                    color: rgba(0, 255, 204, 0.5);
                    margin-top: -5px;
                }
                .time-label {
                    font-size: 0.9rem; color: #00ffcc; margin-top: 5px; letter-spacing: 2px; opacity: 0.8;
                }

                /* --- [修正 2] 底部資訊區 (間距加大) --- */
                .cover-bottom-section {
                    flex: 0 0 auto;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                    
                    /* [關鍵修改] 增加垂直間距，解決擁擠問題 */
                    gap: 30px; 
                }

                .studio-info-group {
                    display: flex;
                    flex-direction: column;
                    gap: 8px; /* Studio 和 Project Title 之間的微小間距 */
                }

                .bottom-studio-name {
                    font-family: 'Courier New', monospace;
                    font-size: 0.9rem;
                    font-weight: 700;
                    letter-spacing: 2px;
                    color: #aaffdd;
                    text-shadow: 0 0 8px rgba(0, 255, 180, 0.7);
                    letter-spacing: 3px; text-transform: uppercase;
                }

                .bottom-project-title {
                    font-family: 'Courier New', monospace;
                    font-size: 1.3rem;
                    color: #fff;
                    letter-spacing: 1px;
                    text-shadow: 0 0 5px rgba(255,255,255,0.5);
                    font-weight: bold;
                }

                /* 按鈕 */
                .explore-simple-btn {
                    pointer-events: auto; /* 恢復按鈕互動 */
                    font-size: 0.8rem;
                    color: #00ffcc;
                    cursor: pointer;
                    letter-spacing: 2px;
                    transition: all 0.3s ease;
                    text-transform: uppercase;
                    padding: 10px 20px;
                    border: 1px solid rgba(0, 255, 204, 0.3);
                    background: rgba(0, 255, 204, 0.05);
                }
                .explore-simple-btn:hover {
                    color: #fff;
                    text-shadow: 0 0 8px #00ffcc;
                    border-color: rgba(0, 255, 204, 0.8);
                    background: rgba(0, 255, 204, 0.2);
                    box-shadow: 0 0 15px rgba(0, 255, 204, 0.2);
                }

                .staff-info-row {
                    font-size: 0.9rem; color: #666; letter-spacing: 1px; line-height: 1.5;
                }

                /* --- 手機橫向優化 --- */
                @media (max-height: 500px) {
                    #info-panel.mode-cover { gap: 3vh; padding: 10px; }
                    .cover-main-title { font-size: 2.5rem; }
                    .time-val { font-size: 1.8rem; }
                    .cover-bottom-section { gap: 15px; }
                }

                /* ========================================= */
                /* --- [修正 3] 模式 B & C: 置中與邊距 --- */
                /* ========================================= */
                
                /* 定義共用樣式，確保 Group 和 Info 模式行為一致 */
                #info-panel.mode-group, 
                #info-panel.mode-info {
                    /* [關鍵修改] 設定寬高為 80% (留白 10%) */
                    width: 80%;
                    height: 80%;
                    
                    /* 確保面板本身有背景與邊框 */
                    background: rgba(10, 10, 15, 0.95);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 4px;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.5);
                    
                    display: flex;
                    flex-direction: column;
                    padding: 0;
                    /* [關鍵] 在這兩種模式下，面板內容需要可以滾動/互動，所以要開啟 */
                    pointer-events: auto;
                    /* 因為 #info-panel 已經有 top:50%, left:50%, translate(-50%, -50%) */
                    /* 這裡不需要額外寫定位代碼，只要設定寬高即可 */
                }

                /* --- Mode B: Group --- */
                .group-header-bar { 
                    flex: 0 0 auto; 
                    padding: 15px 20px; 
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1); 
                    background: rgba(255, 255, 255, 0.02); 
                    font-family: 'Courier New', monospace; 
                    
                    display: flex;
                    justify-content: space-between; /* 左右撐開 */
                    align-items: center;
                }

                .group-title { 
                    font-size: 1.4rem; 
                    font-weight: 400; 
                    letter-spacing: 2px;
                    color: #aaffdd;
                    text-shadow: 0 0 8px rgba(0, 255, 180, 0.7); 
                    text-align: center;
                }

                /* [新增] 箭頭按鈕樣式 */
                .group-nav-btn {
                    font-size: 1.5rem;
                    color: rgba(255,255,255,0.4);
                    cursor: pointer;
                    user-select: none;
                    transition: all 0.3s;
                    width: 40px;
                    height: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    border: 1px solid transparent;
                }

                .group-nav-btn:hover {
                    color: #fff;
                    border-color: rgba(255,255,255,0.2);
                    background: rgba(255,255,255,0.05);
                    text-shadow: 0 0 8px #fff;
                }

                /* 讓無效的按鈕 (例如第一頁的上一頁) 變暗且不能按 */
                .group-nav-btn.disabled {
                    opacity: 0;
                    pointer-events: none;
                }
                .group-content-body { display: flex; flex: 1; flex-direction: row; overflow: hidden; }
                .group-half-pane { flex: 1; display: flex; flex-direction: column; border-right: 1px solid rgba(255, 255, 255, 0.1); position: relative; }
                .group-half-pane:last-child { border-right: none; }
                .pane-header { padding: 15px 30px; background: transparent; border-bottom: 1px solid rgba(255,255,255,0.05); height: 90px; display: flex; flex-direction: column; justify-content: center; }
                .pane-project-title { text-align: center; font-size: 1.1rem; font-weight: 800; margin-bottom: 25px; color: #e0e0e0; line-height: 1.3; }
                .pane-author { text-align: center; font-size: 0.8rem; color: #999; font-family: monospace; text-transform: uppercase; letter-spacing: 1px; text-decoration: underline; }
                .pane-canvas-area { flex: 1; background: transparent; padding: 30px; box-sizing: border-box; display: flex; justify-content: center; align-items: center; position: relative; }
                .pane-canvas-area iframe { width: 100%; height: 100%; border: 1px solid rgba(255,255,255,0.2); border-radius: 2px; }
                
                /* RWD for Group Mode */
                @media (max-width: 768px), (orientation: portrait) {
                    /* 手機版可以稍微寬一點，避免內容太擠 */
                    #info-panel.mode-group { width: 90%; height: 90%; }
                    .group-content-body { flex-direction: column; overflow-y: auto; }
                    .group-half-pane { border-right: none; border-bottom: 1px solid rgba(255, 255, 255, 0.15); min-height: 50%; flex: 0 0 auto; }
                }

                /* --- Mode C: Info --- */
                .info-header { flex: 0 0 auto; display: flex; border-bottom: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.02); }
                .tab-btn { flex: 1; padding: 20px; text-align: center; cursor: pointer; color: #888; text-transform: uppercase; letter-spacing: 1px; font-size: 0.9rem; transition: all 0.3s; border-right: 1px solid rgba(255,255,255,0.05); font-weight: bold; }
                .tab-btn.active { font-family: 'Courier New', monospace;
                    font-size: 0.9rem;
                    font-weight: 700;
                    letter-spacing: 2px;
                    color: #aaffdd;
                    text-shadow: 0 0 8px rgba(0, 255, 180, 0.7); background: rgba(255,255,255,0.1); }
                .close-info-btn { width: 60px; display: flex; align-items: center; justify-content: center; cursor: pointer; border-left: 1px solid rgba(255,255,255,0.1); font-size: 1.2rem; }
                .info-content-area { flex: 1; overflow-y: auto; padding: 40px; position: relative; }
                .tab-pane { display: none; height: 100%; animation: fadeIn 0.5s; }
                .tab-pane.active { display: block; }
                
                /* About / Carousel / Diagram (Keep Existing) */
                .about-content-wrapper { display: flex; flex-direction: row; align-items: center; justify-content: center; height: 100%; gap: 50px; max-width: 1200px; margin: 0 auto; }
                .about-left-img {
                    flex: 1;
                    height: 70%;
                    background-size: cover;
                    background-position: center;
                    border-radius: 8px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                    border: 1px solid rgba(255,255,255,0.1);
                    min-width: 300px;
                    
                    /* [新增] 讓背景圖片切換有淡入淡出感 (部分瀏覽器支援) */
                    transition: background-image 0.5s ease-in-out;
                }
                .about-text { flex: 1; font-size: 1.1rem; line-height: 1.8; color: #ddd; text-align: left; }
                .carousel-wrapper { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
                .carousel-container { display: flex; overflow-x: auto; gap: 40px; padding: 0 calc(50% - 150px); scroll-snap-type: x mandatory; height: 100%; align-items: center; scrollbar-width: none; width: 100%; font-size: 0.8rem}
                .carousel-item { flex: 0 0 300px; height: 400px; box-sizing: border-box; flex-shrink: 0; scroll-snap-align: center; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 30px; text-align: center; transition: all 0.4s; display: flex; flex-direction: column; align-items: center; justify-content: center; transform: scale(0.9); opacity: 0.5; filter: blur(2px); }
                .carousel-item.center-focus { transform: scale(1.1); opacity: 1; filter: blur(0px); background: rgba(255,255,255,0.1); z-index: 2; border-color: rgba(255,255,255,0.4); }
                /* --- [修改] Tool Logo 圖片容器 --- */
                .tool-logo {
                    width: 100%;       /* 寬度跟隨父容器 (.carousel-item) */
                    height: 220px;     /* 設定統一高度，確保排版整齊 (可依需求調整) */
                    margin-bottom: 20px;
                    
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    
                    overflow: hidden;  /* [關鍵] 隱藏超出的圖片部分 */
                    border-radius: 6px; /* 增加一點圓角讓裁切更自然 */
                    background: rgba(255, 255, 255, 0.02); /* 圖片底圖，避免透明圖全黑 */
                }

                /* --- [修改] 圖片本體 (自動裁切邏輯) --- */
                .tool-logo img {
                    width: 100%;
                    height: 100%;
                    
                    /* [核心指令] cover: 保持比例填滿容器，多餘部分自動裁切 */
                    object-fit: cover; 
                    
                    /* 設定裁切重心：置中 (也可改 top 或 bottom) */
                    object-position: center; 
                    
                    filter: drop-shadow(0 5px 15px rgba(0,0,0,0.5));
                    transition: transform 0.5s ease;
                }

                /* 滑鼠滑過時，圖片稍微放大增加互動感 */
                .carousel-item:hover .tool-logo img {
                    transform: scale(1.1);
                }
                .tool-name { font-size: 1.5rem; color: #fff; margin-bottom: 15px; font-weight: bold; }
                .nav-arrow { position: absolute; top: 50%; transform: translateY(-50%); width: 50px; height: 50px; background: rgba(0, 0, 0, 0.6); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 50%; color: white; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 20; transition: all 0.3s; user-select: none; }
                .arrow-left { left: 10px; } .arrow-right { right: 10px; }
                .diagram-container { display: flex; align-items: center; justify-content: center; height: 100%; width: 100%; gap: 20px; }
                .diagram-node { width: 140px; height: 140px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.3); display: flex; align-items: center; justify-content: center; flex-direction: column; text-align: center; position: relative; transition: all 0.4s; background: rgba(0,0,0,0.3); }
                .diagram-node:hover { border-color: #fff; background: rgba(255,255,255,0.1); transform: scale(1.1); }
                .node-title { font-weight: bold; color: #fff; margin-bottom: 5px; }
                .diagram-arrow { color: #555; font-size: 1.5rem; }
                
                @media (max-width: 768px) {
                    #info-panel.mode-info { width: 95%; height: 90%; }
                    .about-content-wrapper { flex-direction: column; padding: 20px 0; }
                    .about-left-img { width: 100%; height: 250px; flex: none; }
                    .diagram-container { flex-direction: column; gap: 40px; overflow-y: auto; padding: 50px 0; }
                    .diagram-arrow { transform: rotate(90deg); }
                    .info-header { flex-wrap: wrap; } .tab-btn { flex: 1 0 50%; }
                }
            `;
            document.head.appendChild(style);

            let infoPanel = document.createElement('div');
            infoPanel.id = 'info-panel';
            document.body.appendChild(infoPanel);

            // ============================================================
            // --- [Step 2] 定義資料庫 ---
            // ============================================================
            
            const viewContentData = {
                0: {
                    type: 'cover',
                    // [上] 小字資訊
                    topInfo: "2026.01.10 10:00 | TKU BLACK SWAN HALL",
                    // [中] 主標題
                    mainTitle: "EA4 FINAL REVIEW", 
                    // [下] 底部資訊
                    studioName: "IIA STUDIO", // 縮寫符合圖片風格
                    projectTitle: "re: Model Your Daily Life",
                    btnText: "In Progress ..", // 箭頭直接寫在字串裡比較好控
                    
                    // Staff 資訊 (放在最下面)
                    advisor: "Advisor: Hsiao, Chi-Fu",
                    staff: "Staff: Yi-Ting | Ying-Hua | Li-Hong | Ting-Yu | Hao-Lun | Zhi-Shan"
                },
                1: {
                    type: 'group',
                    groupTitle: "Event Translation & Dynamic Mechanisms",
                    member1: {
                        author: "Yi-Ting",
                        title: "Translating Music Signals into Dynamic Spatial Mechanisms",
                        p5Url: "https://editor.p5js.org/chifuresearch/full/O966wnmEP" 
                    },
                    member2: {
                        author: "Ying-Hua",
                        title: "Dynamic Response of Discrete Skin Arrays to External Perturbations",
                        p5Url: "https://editor.p5js.org/chifuresearch/full/OaQXwMr-v"
                    }
                },
                2: {
                    type: 'group',
                    groupTitle: "Energy Pulse & Light/Shadow Expression",
                    member1: {
                        author: "Li-Hong",
                        title: "Audio Energy Translation for Atmospheric Light and Shadow Creation",
                        p5Url: "https://editor.p5js.org/chifuresearch/full/oLuJA3MBC"
                    },
                    member2: {
                        author: "Ting-Yu",
                        title: "Visualizing Fluid Potential Energy as Spatial Guidance Cues",
                        p5Url: "https://editor.p5js.org/chifuresearch/full/_mmx_4MSw"
                    }
                },
                3: {
                    type: 'group',
                    groupTitle: "Research on Light Interface & Warp Shaders",
                    member1: {
                        author: "Hao-Lun",
                        title: "Applying Noise Warp Shaders to Dynamic Flexible Surface Projection",
                        p5Url: "https://editor.p5js.org/chifuresearch/full/VR-V2eKMg"
                    },
                    member2: {
                        author: "Zhi-Shan",
                        title: "Optical Deflection in Heterogeneous Transparent Interfaces for Fluid Light Effects",
                        p5Url: "https://editor.p5js.org/chifuresearch/full/N_I8gjMPq"
                    }
                }
            };

            // [新增] 時間到之後要顯示的資料
            const postEventCoverData = {
                type: 'cover',
                topInfo: "Tamkang University EA4",
                mainTitle: "re: Model Your Daily Life", 
                studioName: "IIA STUDIO", 
                projectTitle: "2026 Fall Introduction",
                btnText: "Explore Further ➔", 
                advisor: "Advisor: Hsiao, Chi-Fu",
                staff: "Staff: Yi-Ting | Ying-Hua | Li-Hong | Ting-Yu | Hao-Lun | Zhi-Shan"
            };

            // [新增] Matrix 亂碼特效函式
            // function startMatrixEffect(elementId, originalText) {
            //     const element = document.getElementById(elementId);
            //     if (!element) return;

            //     const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890@#$%^&*アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポ";
                
            //     // 設定一個計時器，不斷隨機替換文字
            //     const interval = setInterval(() => {
            //         let randomText = "";
            //         // 產生與原文字長度相近的亂碼
            //         for (let i = 0; i < originalText.length; i++) {
            //             // 保留原本的空格或標點符號，讓格式看起來稍微有點結構，或者全部亂碼
            //             if (originalText[i] === ' ' || originalText[i] === '|' || originalText[i] === ':') {
            //                 randomText += originalText[i];
            //             } else {
            //                 randomText += chars[Math.floor(Math.random() * chars.length)];
            //             }
            //         }
            //         element.innerText = randomText;
                    
            //         // 偶爾隨機改變顏色 (營造故障感)
            //         if (Math.random() > 0.9) {
            //             element.style.color = "#00ffcc";
            //             element.style.textShadow = "0 0 5px #00ffcc";
            //         } else {
            //             element.style.color = "#666"; // 回復原本顏色
            //             element.style.textShadow = "none";
            //         }

            //     }, 60); // 每 60 毫秒更新一次

            //     matrixIntervals.push(interval);
            // }
            
            // [新增] 暫時性解碼動畫 (亂碼跳動 -> 回復正常)
            function runTemporaryDecodingEffect(elementId, originalText, duration = 1500) {
                const element = document.getElementById(elementId);
                if (!element) return;

                const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890@#$%^&*";
                const startTime = Date.now();
                
                // 儲存原始樣式以便復原
                const originalColor = element.style.color;
                const originalShadow = element.style.textShadow;

                const interval = setInterval(() => {
                    const elapsed = Date.now() - startTime;
                    
                    // 動畫結束條件
                    if (elapsed > duration) {
                        clearInterval(interval);
                        element.innerText = originalText; // 恢復正確文字
                        element.style.color = originalColor; // 恢復顏色
                        element.style.textShadow = originalShadow; // 恢復陰影
                        return;
                    }

                    // 產生亂碼
                    let randomText = "";
                    for (let i = 0; i < originalText.length; i++) {
                        if (originalText[i] === ' ' || originalText[i] === '|' || originalText[i] === ':') {
                            randomText += originalText[i];
                        } else {
                            randomText += chars[Math.floor(Math.random() * chars.length)];
                        }
                    }
                    element.innerText = randomText;

                    // 故障特效樣式 (青色螢光)
                    // element.style.color = "#00ffcc";
                    element.style.textShadow = "0 0 5px #00ffcc";

                }, 50); // 每 50ms 更新一次
            }

            // [新增] 模式 C 的資料
            const infoContentData = {
                about: {
                    title: "Architecture as Information Interface",
                    content: "This studio explores the intersection of digital intelligence and physical space. We treat daily living events as data inputs, using computational tools to translate them into spatial mechanisms. Our goal is to redefine how architecture can respond, adapt, and inform its inhabitants through dynamic prototyping and algorithmic design.",
                    // [修改] 改為圖片陣列 (支援多張圖片)
                    images: [
                        "00.png","01.png","02.png","03.png","04.png","05.png","06.png","07.png","08.png",
                    ]
                },
                // [修改] Tools 改用圖片連結 (image)
                tools: [
                    { name: "p5.js", image: "https://upload.wikimedia.org/wikipedia/commons/c/c6/P5.js_icon.svg", desc: "Creative Coding for Visual Arts", link: "https://p5js.org/" },
                    { name: "Grasshopper", image: "https://images.seeklogo.com/logo-png/29/1/grasshopper-3d-logo-png_seeklogo-291372.png", desc: "Parameteric Design of Visual Scripting.", link: "https://www.grasshopper3d.com/" },
                    { name: "Gemini AI", image: "https://upload.wikimedia.org/wikipedia/commons/8/8a/Google_Gemini_logo.svg", desc: "Large Language Model Reasoning", link: "#" },
                    { name: "Arduino", image: "https://upload.wikimedia.org/wikipedia/commons/8/87/Arduino_Logo.svg", desc: "Physical Computing & Sensors", link: "https://www.arduino.cc/" }
                ],
                // [修改] process 改用圖片連結 (image)
                process: [
                    { name: "Notation", type: "Documentation", image: "a_notation.png", desc: "Recording invisible data from daily events." },
                    { name: "Diagram", type: "Software", image: "a_diagram.png", desc: "Analyzing logic and relationships visually." },
                    { name: "Translation", type: "Hardware", image: "a_translation.png", desc: "Converting logic into geomertric algorithms." },
                    { name: "Sample", type: "Fabrication", image: "a_sample.png", desc: "Sample texture from site." }
                ]
            };

            // ============================================================
            // --- [修正後] Render Panel 邏輯 (含 Carousel 置中與點擊導航) ---
            // ============================================================
            const renderPanelContent = (data) => {
                // 0. 清除計時器
                if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
                if (aboutCarouselInterval) { clearInterval(aboutCarouselInterval); aboutCarouselInterval = null; }
                // 清除 Matrix 永久特效 (如果是過期後切換回來的)
                if (window.matrixIntervals) {
                    window.matrixIntervals.forEach(i => clearInterval(i));
                    window.matrixIntervals = [];
                }

                // 1. Clear classes
                infoPanel.classList.remove('mode-cover', 'mode-group', 'mode-info');
                
                // 2. Clone node (重置 Event Listener)
                const newPanel = infoPanel.cloneNode(false);
                infoPanel.parentNode.replaceChild(newPanel, infoPanel);
                infoPanel = newPanel;

                // --- 時間檢查 ---
                const targetDate = new Date("January 1, 2026 9:00:00").getTime();
                const now = new Date().getTime();
                const isTimeUp = now >= targetDate;

                // =========================================
                // --- A. Cover Mode (主要修改區) ---
                // =========================================
                if (data.type === 'cover') {
                    infoPanel.classList.add('mode-cover');

                    // 決定顯示資料 (時間到之後切換為 postEventCoverData)
                    const activeData = isTimeUp ? postEventCoverData : data;

                    // 根據時間決定是否顯示倒數
                    const heroHtml = isTimeUp ? `
                        <div class="cover-hero-section">
                            <div class="cover-main-title">${activeData.mainTitle}</div>
                        </div>
                    ` : `
                        <div class="cover-hero-section">
                            <div class="cover-main-title">${activeData.mainTitle}</div>
                            <div class="countdown-wrapper" id="countdown-box">
                                <div class="time-unit"><div class="time-val" id="cd-d">00</div><div class="time-label">DAYS</div></div>
                                <div class="time-separator">:</div>
                                <div class="time-unit"><div class="time-val" id="cd-h">00</div><div class="time-label">HRS</div></div>
                                <div class="time-separator">:</div>
                                <div class="time-unit"><div class="time-val" id="cd-m">00</div><div class="time-label">MIN</div></div>
                                <div class="time-separator">:</div>
                                <div class="time-unit"><div class="time-val" id="cd-s">00</div><div class="time-label">SEC</div></div>
                            </div>
                        </div>
                    `;

                    // [修改] 加上 ID (id="cover-studio", id="cover-project", id="cover-advisor", id="cover-staff") 以便動畫抓取
                    infoPanel.innerHTML = `
                        <div class="cover-top-section">
                            <div class="cover-meta-info">${activeData.topInfo}</div>
                        </div>
                        
                        ${heroHtml}

                        <div class="cover-bottom-section">
                            <div class="studio-info-group">
                                <div class="bottom-studio-name" id="cover-studio">${activeData.studioName}</div>
                                <div class="bottom-project-title" id="cover-project">${activeData.projectTitle}</div>
                            </div>

                            <div class="explore-simple-btn" id="explore-trigger">${activeData.btnText}</div>

                            <div class="staff-info-row">
                                <div id="cover-advisor">${activeData.advisor}</div>
                                <div id="cover-staff">${activeData.staff}</div>
                            </div>
                        </div>
                    `;
                    
                    // --- [核心修改] 按鈕點擊邏輯 ---
                    document.getElementById('explore-trigger').addEventListener('click', () => {
                        if (isTimeUp) {
                            // 情況 1: 時間已到 -> 進入模式 C (Info) 或 模式 B (Group)
                            // 這裡設定為進入 Info Mode (探索工作室)
                            toggleInfoMode(true); 
                        } else {
                            // 情況 2: 時間未到 -> 播放亂碼動畫，不跳轉
                            runTemporaryDecodingEffect('cover-studio', activeData.studioName, 500);
                            runTemporaryDecodingEffect('cover-project', activeData.projectTitle, 1000);
                            runTemporaryDecodingEffect('cover-advisor', activeData.advisor, 1200);
                            runTemporaryDecodingEffect('cover-staff', activeData.staff, 1500);
                        }
                    });

                    // --- 倒數計時器或永久亂碼 ---
                    if (!isTimeUp) {
                        const updateTimer = () => {
                            const currentNow = new Date().getTime();
                            const distance = targetDate - currentNow;
                            if (distance < 0) {
                                clearInterval(countdownInterval);
                                renderPanelContent(data); // 時間到，重刷畫面
                                return;
                            }
                            // ... (計算時間邏輯保持不變) ...
                            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
                            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                            const seconds = Math.floor((distance % (1000 * 60)) / 1000);
                            const pad = (n) => n < 10 ? "0" + n : n;
                            const elD = document.getElementById("cd-d");
                            const elH = document.getElementById("cd-h");
                            const elM = document.getElementById("cd-m");
                            const elS = document.getElementById("cd-s");
                            if(elD) { elD.innerText = pad(days); elH.innerText = pad(hours); elM.innerText = pad(minutes); elS.innerText = pad(seconds); }
                        };
                        updateTimer();
                        countdownInterval = setInterval(updateTimer, 1000);
                    } else {
                        // 時間到之後，讓 Staff 名字呈現永久的 Matrix 效果 (依您的需求)
                        // 注意：這裡使用之前定義的 startMatrixEffect (永久循環)，而非上面的 runTemporaryDecodingEffect
                        if (!window.matrixIntervals) window.matrixIntervals = [];
                        
                        // 定義永久亂碼函式 (如果您還沒定義的話，放在這裡或是全域皆可)
                        // const startMatrixEffect = (elementId, originalText) => {
                        //     const element = document.getElementById(elementId);
                        //     if (!element) return;
                        //     const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890@#$%^&*";
                        //     const interval = setInterval(() => {
                        //         let randomText = "";
                        //         for (let i = 0; i < originalText.length; i++) {
                        //             if (originalText[i] === ' ' || originalText[i] === '|') randomText += originalText[i];
                        //             else randomText += chars[Math.floor(Math.random() * chars.length)];
                        //         }
                        //         element.innerText = randomText;
                        //         if (Math.random() > 0.9) { element.style.color = "#00ffcc"; element.style.textShadow = "0 0 5px #00ffcc"; }
                        //         else { element.style.color = "#666"; element.style.textShadow = "none"; }
                        //     }, 80);
                        //     window.matrixIntervals.push(interval);
                        // };

                        // 啟動永久亂碼
                        // setTimeout(() => {
                        //     startMatrixEffect('cover-advisor', activeData.advisor);
                        //     startMatrixEffect('cover-staff', activeData.staff);
                        // }, 100);
                    }
                }
                
                // --- B. Group Mode (強健防卡死版) ---
                else if (data.type === 'group') {
                    infoPanel.classList.add('mode-group');

                    const nextIndex = currentViewIndex + 1;
                    const prevIndex = currentViewIndex - 1;
                    
                    // 檢查是否有資料 (決定按鈕是否亮起)
                    const hasNext = viewContentData[nextIndex] !== undefined;
                    const hasPrev = viewContentData[prevIndex] !== undefined;

                    const createHalfHTML = (member) => `
                        <div class="group-half-pane">
                            <div class="pane-header">
                                <div class="pane-project-title">${member.title}</div>
                                <div class="pane-author">${member.author}</div>
                            </div>
                            <div class="pane-canvas-area">
                                ${member.p5Url ? `<iframe src="${member.p5Url}" allowfullscreen></iframe>` : ''}
                            </div>
                        </div>
                    `;

                    infoPanel.innerHTML = `
                        <div class="group-header-bar">
                            <div class="group-nav-btn ${hasPrev ? '' : 'disabled'}" id="grp-btn-prev">❮</div>
                            <div class="group-title">${data.groupTitle}</div>
                            <div class="group-nav-btn ${hasNext ? '' : 'disabled'}" id="grp-btn-next">❯</div>
                        </div>
                        <div class="group-content-body">
                            ${createHalfHTML(data.member1)}
                            ${createHalfHTML(data.member2)}
                        </div>
                    `;

                    // --- 按鈕事件綁定 ---
                    const btnPrev = document.getElementById('grp-btn-prev');
                    const btnNext = document.getElementById('grp-btn-next');

                    // 定義一個通用的切換函式，包含安全機制
                    const safeTransition = (targetIndex) => {
                        // [關鍵修正] 強制解鎖動畫狀態，防止因滾輪誤觸導致按鈕無效
                        isAnimating = false; 

                        // 判斷 3D 場景中是否有對應的相機
                        if (targetIndex < navigationNodes.length) {
                            console.log("Attempting camera transition to:", targetIndex);
                            transitionToView(targetIndex);

                            // [關鍵修正] 安全網：如果相機動畫 500ms 後還沒完成 (或沒觸發 callback)，強制切換內容
                            // 這能解決 GLB 節點損壞或動畫卡住的問題
                            setTimeout(() => {
                                if (currentViewIndex !== targetIndex) {
                                    console.warn("Animation lag detected, forcing panel update.");
                                    currentViewIndex = targetIndex;
                                    showPanel(currentViewIndex);
                                }
                            }, 500);
                            
                        } else {
                            // 沒有相機節點，直接切換內容
                            console.log("No camera node, switching content only.");
                            currentViewIndex = targetIndex;
                            showPanel(currentViewIndex);
                        }
                    };

                    if (btnPrev && hasPrev) {
                        btnPrev.addEventListener('click', (e) => {
                            e.stopPropagation();
                            safeTransition(prevIndex);
                        });
                    }

                    if (btnNext && hasNext) {
                        btnNext.addEventListener('click', (e) => {
                            e.stopPropagation();
                            safeTransition(nextIndex);
                        });
                    }
                }
                // --- C. Info Mode (保持不變) ---
                else if (data.type === 'info') {
                    infoPanel.classList.add('mode-info');
                    
                    // ... (Info Mode 的 HTML 生成與邏輯保持與上一個版本一致) ...
                    // 為節省篇幅，這裡省略重複的 Info Mode 代碼
                    // 請直接複製上一個回答中的 Info Mode 區塊到這裡
                    
                    // 為了完整性，這裡簡單列出結構：
                    // const renderTools = ...
                    // const renderProcess = ...
                    // const renderDiagram = ...
                    // infoPanel.innerHTML = ...
                    // About Carousel Logic ...
                    // Tabs Logic ...
                    // Close Logic ...
                    // setupCarouselNav ...
                    
                    // (如果您需要這部分的完整代碼，請讓我知道，我可以再貼一次)
                    // 這裡我將放入簡化的佔位符，實際請使用上一個版本的 Info 代碼
                    const renderTools = infoContentData.tools.map(t => `<div class="carousel-item"><div class="tool-logo"><img src="${t.image}"></div><div class="tool-name">${t.name}</div><a href="${t.link}" target="_blank" class="item-link">Learn More</a></div>`).join('');
                    const renderProcess = infoContentData.process.map(p => `<div class="carousel-item"><div class="tool-logo"><img src="${p.image}"></div><div class="tool-name">${p.name}</div></div>`).join('');
                    // const renderDiagram = infoContentData.teaching.map(n => `<div class="diagram-node"><div class="node-title">${n.step}</div></div>`).join('');
                    
                    infoPanel.innerHTML = `
                        <div class="info-header">
                            <div class="tab-btn active" data-tab="about">About</div>
                            <div class="tab-btn" data-tab="tools">Tools</div>
                            <div class="tab-btn" data-tab="process">Process</div>
                            <div class="close-info-btn" id="close-info">✕</div>
                        </div>
                        <div class="info-content-area">
                            <div id="tab-about" class="tab-pane active"><div class="about-content-wrapper"><div id="about-carousel-img" class="about-left-img" style="background-image: url('${infoContentData.about.images[0]}');"></div><div class="about-text"><h3>${infoContentData.about.title}</h3><p>${infoContentData.about.content}</p></div></div></div>
                            <div id="tab-tools" class="tab-pane"><div class="carousel-wrapper"><div class="nav-arrow arrow-left" id="btn-left-tools">❮</div><div class="carousel-container" id="tools-carousel">${renderTools}</div><div class="nav-arrow arrow-right" id="btn-right-tools">❯</div></div></div>
                            <div id="tab-process" class="tab-pane"><div class="carousel-wrapper"><div class="nav-arrow arrow-left" id="btn-left-prod">❮</div><div class="carousel-container" id="prod-carousel">${renderProcess}</div><div class="nav-arrow arrow-right" id="btn-right-prod">❯</div></div></div>
                        </div>
                    `;
                    
                    // About Carousel
                    const aboutImages = infoContentData.about.images;
                    if (aboutImages && aboutImages.length > 1) {
                        let currentImgIndex = 0;
                        const imgElement = document.getElementById('about-carousel-img');
                        aboutImages.forEach(src => { const img = new Image(); img.src = src; });
                        aboutCarouselInterval = setInterval(() => {
                            currentImgIndex = (currentImgIndex + 1) % aboutImages.length;
                            if(imgElement) imgElement.style.backgroundImage = `url('${aboutImages[currentImgIndex]}')`;
                        }, 3000);
                    }

                    // Tabs
                    const tabs = infoPanel.querySelectorAll('.tab-btn');
                    tabs.forEach(tab => {
                        tab.addEventListener('click', (e) => {
                            tabs.forEach(t => t.classList.remove('active'));
                            infoPanel.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                            e.target.classList.add('active');
                            const targetId = e.target.getAttribute('data-tab');
                            document.getElementById('tab-' + targetId).classList.add('active');
                            setTimeout(() => {
                                if (targetId === 'tools') setupCarouselNav('tools-carousel', 'btn-left-tools', 'btn-right-tools');
                                if (targetId === 'process') setupCarouselNav('prod-carousel', 'btn-left-prod', 'btn-right-prod');
                            }, 50);
                        });
                    });

                    document.getElementById('close-info').addEventListener('click', () => { isInfoMode = false; currentViewIndex = 1; transitionToView(currentViewIndex); });
                    
                    // Carousel Nav Logic (Compact)
                    const setupCarouselNav = (elementId, leftBtnId, rightBtnId) => {
                        const container = document.getElementById(elementId);
                        const leftBtn = document.getElementById(leftBtnId);
                        const rightBtn = document.getElementById(rightBtnId);
                        if(!container || !leftBtn || !rightBtn) return;
                        const initCarousel = (retry=0) => {
                            const items = container.querySelectorAll('.carousel-item');
                            if(items.length===0 || container.offsetParent===null) return;
                            if(items[0].getBoundingClientRect().width===0) { if(retry<10) setTimeout(()=>initCarousel(retry+1), 50); return; }
                            container.scrollTo({ left: 0, behavior: 'instant' }); handleScroll();
                        };
                        const getSettings = () => {
                            const item = container.querySelector('.carousel-item');
                            const width = item ? item.getBoundingClientRect().width : 300;
                            const gap = parseFloat(window.getComputedStyle(container).gap) || 40;
                            return { step: width + gap, maxIndex: container.querySelectorAll('.carousel-item').length - 1 };
                        };
                        const scroll = (dir) => {
                            const s = getSettings();
                            let idx = Math.round((container.scrollLeft + 1) / s.step) + dir;
                            if(idx < 0) idx = 0; if(idx > s.maxIndex) idx = s.maxIndex;
                            container.scrollTo({ left: idx * s.step, behavior: 'smooth' });
                        };
                        if(!leftBtn.dataset.bound) {
                            const nL = leftBtn.cloneNode(true), nR = rightBtn.cloneNode(true);
                            leftBtn.parentNode.replaceChild(nL, leftBtn); rightBtn.parentNode.replaceChild(nR, rightBtn);
                            nL.addEventListener('click', ()=>scroll(-1)); nR.addEventListener('click', ()=>scroll(1));
                            nL.dataset.bound="true";
                        }
                        const handleScroll = () => {
                            const cRect = container.getBoundingClientRect();
                            const cCenter = cRect.left + cRect.width/2;
                            container.querySelectorAll('.carousel-item').forEach(item => {
                                const iRect = item.getBoundingClientRect();
                                const dist = Math.abs(cCenter - (iRect.left + iRect.width/2));
                                if(dist < iRect.width/2) { item.classList.add('center-focus'); item.style.opacity='1'; item.style.transform='scale(1.1)'; item.style.filter='blur(0px)'; }
                                else { item.classList.remove('center-focus'); item.style.opacity='0.5'; item.style.transform='scale(0.9)'; item.style.filter='blur(2px)'; }
                            });
                        };
                        container.onscroll = handleScroll; initCarousel();
                    };
                }

                // 3. Trigger reflow
                void infoPanel.offsetWidth; 
                infoPanel.classList.add('active');
            };

            // ============================================================
            // --- 完成 renderPanelContent ---
            // ============================================================

            const getContent = (index) => {
                return viewContentData[index] || {
                    type: 'cover',
                    studio: "", mainTitle: "Loading...", subTitle: "", advisor: "", staff: ""
                };
            };

            // ============================================================
            // --- [新增] 模式 C 切換與相機動畫邏輯 ---
            // ============================================================

            const toggleInfoMode = (enable) => {
                if (isAnimating) return;
                isAnimating = true;
                hidePanel();

                isInfoMode = enable;
                const currentView = defaultInitialView; // 假設我們總是在 View 0 進入此模式

                let targetPosition;
                
                if (enable) {
                    // --- 進入 Info Mode: 旋轉 180 度 ---
                    // 計算邏輯: 
                    // 1. 取得 View 0 的視線向量 (Eye - Target)
                    // 2. 將該向量繞 Y 軸旋轉 180 度 (或直接反向 Z 和 X)
                    // 3. 新位置 = Target + 新向量
                    
                    const targetVec = currentView.target;
                    const posVec = currentView.position;
                    const viewVec = posVec.subtract(targetVec);
                    
                    // 簡單的 180 度旋轉 (假設 Y 軸朝上)
                    const rotatedVec = new BABYLON.Vector3(-viewVec.x, viewVec.y, -viewVec.z); 
                    targetPosition = targetVec.add(rotatedVec);
                    
                } else {
                    // --- 離開 Info Mode: 回到 View 0 ---
                    targetPosition = currentView.position;
                }

                // 執行相機動畫
                camera.detachControl();
                createCameraAnimation(camera, targetPosition, currentView.target, scene, () => {
                    camera.attachControl(canvas, true);
                    isAnimating = false;
                    
                    if (enable) {
                        // 渲染 Info 內容
                        renderPanelContent({ type: 'info' });
                    } else {
                        // 渲染 Cover 內容
                        renderPanelContent(getContent(0));
                    }
                });
            };

            // ============================================================
            // --- [Step 3] 滾動與面板控制邏輯 ---
            // ============================================================
            
            let currentViewIndex = 0;
            let isAnimating = false;
            let scrollAccumulator = 0;
            const SCROLL_THRESHOLD = 200;

            const showPanel = (index) => {
                const data = getContent(index);
                renderPanelContent(data);
                void infoPanel.offsetWidth; 
                infoPanel.classList.add('active');
            };

            const hidePanel = () => {
                infoPanel.classList.remove('active');
            };

            showPanel(0);

            const transitionToView = (index) => {
                if (index < 0 || index >= navigationNodes.length) return;
                if (isAnimating) return;

                isAnimating = true;
                hidePanel();

                const node = navigationNodes[index];
                camera.detachControl();

                createCameraAnimation(camera, node.position, node.target, scene, () => {
                    camera.attachControl(canvas, true);
                    isAnimating = false;
                    scrollAccumulator = 0;
                    showPanel(index);
                });
            };

            window.addEventListener('wheel', (event) => {
                // [新增] 檢查時間
                const now = new Date().getTime();
                const isTimeUp = now >= targetDate;

                // [新增條件] 如果時間沒到 (!isTimeUp)，直接 return，不執行切換場景
                // 這樣 Babylon.js 原生的相機控制 (旋轉/縮放) 依然有效，只是不會觸發 transitionToView
                if (isAnimating || navigationNodes.length === 0 || isInfoMode || !isTimeUp) return;
                
                scrollAccumulator += event.deltaY;

                if (scrollAccumulator > SCROLL_THRESHOLD) {
                    if (currentViewIndex < navigationNodes.length - 1) {
                        currentViewIndex++;
                        transitionToView(currentViewIndex);
                    } else { scrollAccumulator = SCROLL_THRESHOLD; }
                } else if (scrollAccumulator < -SCROLL_THRESHOLD) {
                    if (currentViewIndex > 0) {
                        currentViewIndex--;
                        transitionToView(currentViewIndex);
                    } else { scrollAccumulator = -SCROLL_THRESHOLD; }
                }
                
                clearTimeout(window.scrollResetTimer);
                window.scrollResetTimer = setTimeout(() => { if(!isAnimating) scrollAccumulator = 0; }, 200);
            }, { passive: false });

            let touchStartY = 0;
            window.addEventListener('touchstart', (e) => { touchStartY = e.touches[0].clientY; }, { passive: true });
            window.addEventListener('touchmove', (e) => {
                // [新增] 檢查時間
                const now = new Date().getTime();
                const isTimeUp = now >= targetDate;

                // [新增條件] 時間未到 (!isTimeUp) 則不觸發換頁
                if (isAnimating || navigationNodes.length === 0 || isInfoMode || !isTimeUp) return;
                
                const touchCurrentY = e.touches[0].clientY;
                const touchDiff = touchStartY - touchCurrentY;
                if (Math.abs(touchDiff) > 100) {
                    if (touchDiff > 0 && currentViewIndex < navigationNodes.length - 1) {
                        currentViewIndex++;
                        transitionToView(currentViewIndex);
                        touchStartY = touchCurrentY;
                    } else if (touchDiff < 0 && currentViewIndex > 0) {
                        currentViewIndex--;
                        transitionToView(currentViewIndex);
                        touchStartY = touchCurrentY;
                    }
                }
            }, { passive: true });
            
            camera.attachControl(canvas, true);
            camera.minZ = 1.0;
            camera.maxZ = 20000;
            // 讓滑鼠滾輪縮放稍微慢一點，避免誤觸感太強 (選用)
            camera.wheelPrecision = 50;

        } catch (e) { console.error("Error during model loading:", e); }

        window.addEventListener('mousemove', (event) => {
            const x = event.clientX / window.innerWidth;
            const y = 1.0 - (event.clientY / window.innerHeight); 
            globalMousePos.x = x;
            globalMousePos.y = y;
        });
        
        scene.onBeforeRenderObservable.add(() => {
            time += engine.getDeltaTime() / 1000;
            shaderMaterials.forEach(mat => {
                mat.setFloat("time", time);
                mat.setVector2("mousePos", globalMousePos);
            });
        });

        return scene;
    };

    function createCameraAnimation(camera, newPosition, newTarget, scene, onAnimationEnd) {
        const frameRate = 30;
        const duration = 1.5;
        const totalFrames = frameRate * duration;
        const positionAnimation = new BABYLON.Animation("cameraPositionAnimation", "position", frameRate, BABYLON.Animation.ANIMATIONTYPE_VECTOR3, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
        positionAnimation.setKeys([ { frame: 0, value: camera.position.clone() }, { frame: totalFrames, value: newPosition } ]);
        const targetAnimation = new BABYLON.Animation("cameraTargetAnimation", "target", frameRate, BABYLON.Animation.ANIMATIONTYPE_VECTOR3, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
        targetAnimation.setKeys([ { frame: 0, value: camera.target.clone() }, { frame: totalFrames, value: newTarget } ]);
        const easingFunction = new BABYLON.CubicEase();
        easingFunction.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);
        positionAnimation.setEasingFunction(easingFunction);
        targetAnimation.setEasingFunction(easingFunction);
        scene.beginDirectAnimation(camera, [positionAnimation, targetAnimation], 0, totalFrames, false, 1.0, onAnimationEnd);
    }

    createScene().then(scene => {
        engine.runRenderLoop(() => { if (scene) { scene.render(); } });
        window.addEventListener('resize', () => engine.resize());
    });
});

// Helper functions (Unchanged)
function calculateMeshSurfaceArea(mesh){mesh.computeWorldMatrix(true);const p=mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind),i=mesh.getIndices();if(!p||!i)return 0;let t=0;for(let n=0;n<i.length;n+=3){const o=BABYLON.Vector3.FromArray(p,i[n]*3),r=BABYLON.Vector3.FromArray(p,i[n+1]*3),s=BABYLON.Vector3.FromArray(p,i[n+2]*3);const e=new BABYLON.Vector3,a=new BABYLON.Vector3;r.subtractToRef(o,e);s.subtractToRef(o,a);t+=BABYLON.Vector3.Cross(e,a).length()/2}return t}
function generatePointDataOnMesh(mesh, pointCount) {
    mesh.computeWorldMatrix(true);const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);const uvs = mesh.getVerticesData(BABYLON.VertexBuffer.UVKind);const indices = mesh.getIndices();
    if (!positions || !indices || !uvs) {console.error(`Mesh "${mesh.name}" is missing required data.`);return null;}
    const triangleAreas = [];let totalArea = 0;
    for (let i = 0; i < indices.length; i += 3) {const p1 = BABYLON.Vector3.FromArray(positions, indices[i] * 3);const p2 = BABYLON.Vector3.FromArray(positions, indices[i + 1] * 3);const p3 = BABYLON.Vector3.FromArray(positions, indices[i + 2] * 3);const area = BABYLON.Vector3.Cross(p2.subtract(p1), p3.subtract(p1)).length() / 2;totalArea += area;triangleAreas.push({ index: i, cumulative: totalArea });}
    if (totalArea === 0) return null;
    const pointPositions = [];const pointUVs = [];const pointIndices = [];const worldMatrix = mesh.getWorldMatrix();
    for (let i = 0; i < pointCount; i++) {const randomArea = Math.random() * totalArea;const pickedTriangle = triangleAreas.find(t => t.cumulative >= randomArea);const faceIndex = pickedTriangle.index;
        const i1 = indices[faceIndex], i2 = indices[faceIndex + 1], i3 = indices[faceIndex + 2];const v1 = BABYLON.Vector3.FromArray(positions, i1 * 3), uv1 = BABYLON.Vector2.FromArray(uvs, i1 * 2);const v2 = BABYLON.Vector3.FromArray(positions, i2 * 3), uv2 = BABYLON.Vector2.FromArray(uvs, i2 * 2);const v3 = BABYLON.Vector3.FromArray(positions, i3 * 3), uv3 = BABYLON.Vector2.FromArray(uvs, i3 * 2);
        let r1 = Math.random(), r2 = Math.random();if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }const a = 1 - r1 - r2, b = r1, c = r2;
        const randomPointPos = v1.scale(a).add(v2.scale(b)).add(v3.scale(c));const randomPointUV = uv1.scale(a).add(uv2.scale(b)).add(uv3.scale(c));const worldPos = BABYLON.Vector3.TransformCoordinates(randomPointPos, worldMatrix);
        pointPositions.push(worldPos.x, worldPos.y, worldPos.z);pointUVs.push(randomPointUV.x, randomPointUV.y);pointIndices.push(i);}
    return { positions: pointPositions, uvs: pointUVs, indices: pointIndices };
}
