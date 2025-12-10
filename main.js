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
        const TOTAL_POINT_COUNT = 200000;
        
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

                    shaderMaterial.setFloat("perspectiveFactor", 500.0);
                    shaderMaterial.setFloat("minAlpha", 0.1); 
                    shaderMaterial.setFloat("cullFactor", 0.85); 
                    shaderMaterial.setFloat("edgeFadeStart", 1.0);
                    shaderMaterial.setFloat("edgeFadePower", 5.0);
                    shaderMaterial.setFloat("centerDensityFactor", 2.0);
                    shaderMaterial.setFloat("centerDensityRadius", 0.4);

                    shaderMaterial.setTexture("textureSampler", texture);
                    shaderMaterial.backFaceCulling = false;
                    shaderMaterial.fillMode = BABYLON.Material.PointFillMode;
                    
                    shaderMaterials.push(shaderMaterial);

                    const pointCloudMesh = new BABYLON.Mesh("manual_point_cloud_" + mesh.id, scene);
                    const vertexData = new BABYLON.VertexData();
                    vertexData.positions = pointData.positions;
                    vertexData.indices = pointData.indices;
                    vertexData.uvs = pointData.uvs;
                    vertexData.applyToMesh(pointCloudMesh);
                    pointCloudMesh.material = shaderMaterial;
                    
                    pointCloudMeshes.push(pointCloudMesh);
                    
                    pointCloudMesh.isVisible = isPointCloudMode;
                    mesh.isVisible = !isPointCloudMode;
                }
            }

            // ============================================================
            // --- [Step 1] UI 樣式與 HTML 結構注入 ---
            // ============================================================
            
            const style = document.createElement('style');
            style.innerHTML = `
                #navigation-bar { display: none !important; }

                /* --- 通用面板基礎樣式 --- */
                #info-panel {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%) translateY(50px);
                    border-radius: 4px;
                    color: white;
                    opacity: 0;
                    pointer-events: none;
                    transition: all 0.8s cubic-bezier(0.2, 0.8, 0.2, 1);
                    z-index: 10;
                    font-family: 'Helvetica Neue', 'Arial', sans-serif;
                    box-sizing: border-box;
                    overflow: hidden;
                    
                    background: rgba(0, 0, 0, 0.45);
                    backdrop-filter: blur(12px);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    box-shadow: 0 20px 50px rgba(0,0,0,0.5);
                }

                #info-panel.active {
                    opacity: 1;
                    transform: translate(-50%, -50%) translateY(0);
                    pointer-events: auto;
                }

                /* --- 模式 A: 首頁 (Cover Mode) --- */
                #info-panel.mode-cover {
                    width: 70%;
                    min-height: 50%;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    text-align: center;
                    padding: 60px;
                    background: rgba(0, 0, 0, 0.15);
                }

                .cover-studio {
                    font-size: 0.9rem;
                    letter-spacing: 3px;
                    text-transform: uppercase;
                    margin-bottom: 20px;
                    color: #aaa;
                    border-bottom: 1px solid rgba(255,255,255,0.3);
                    padding-bottom: 5px;
                }

                .cover-main-title {
                    font-size: 5rem;
                    font-weight: 700;
                    letter-spacing: -1px;
                    margin-bottom: 5px;
                    color: #fff;
                    text-shadow: 0 6px 20px rgba(0,0,0,0.8);
                }

                .cover-sub-title {
                    font-size: 1.2rem;
                    font-weight: 300;
                    font-style: italic;
                    color: #ddd;
                    margin-top: 15px;
                    margin-bottom: 50px;
                    font-family: 'Times New Roman', serif;
                }

                .cover-footer {
                    font-size: 0.9rem;
                    color: #ccc;
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                }

                .cover-staff {
                    font-family: monospace;
                    font-size: 0.8rem;
                    color: #888;
                }

                /* --- 模式 B: 雙人組 (Group Mode) --- */
                #info-panel.mode-group {
                    width: 90%;
                    height: 85%;
                    display: flex;
                    flex-direction: column;
                    padding: 0;
                }

                .group-header-bar {
                    flex: 0 0 auto;
                    padding: 18px;
                    text-align: center;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    background: rgba(255, 255, 255, 0.02);
                    font-style: italic;
                    font-family: 'Times New Roman', serif;
                    text-shadow: 0 6px 20px rgba(0,0,0,0.8);
                }

                .group-title {
                    font-size: 1.4rem;
                    font-weight: 400;
                    letter-spacing: 2px;
                    color: #fff;
                    text-transform: uppercase;
                }

                .group-content-body {
                    display: flex;
                    flex: 1;
                    flex-direction: row;
                    overflow: hidden;
                }

                .group-half-pane {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    border-right: 1px solid rgba(255, 255, 255, 0.1);
                    position: relative;
                }
                .group-half-pane:last-child { border-right: none; }

                .pane-header {
                    padding: 15px 30px;
                    background: transparent;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    height: 90px;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                }

                .pane-project-title {
                    text-align: center;
                    font-size: 1.1rem;
                    font-weight: 800;
                    margin-bottom: 25px;
                    color: #e0e0e0;
                    line-height: 1.3;
                }

                .pane-author {
                    text-align: center;
                    font-size: 0.8rem;
                    color: #999;
                    font-family: monospace;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    text-decoration: underline;
                }

                .pane-canvas-area {
                    flex: 1;
                    background: transparent;
                    padding: 30px;
                    box-sizing: border-box;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    position: relative;
                }

                .pane-canvas-area iframe {
                    width: 100%;
                    height: 100%;
                    border: 1px solid rgba(255,255,255,0.2);
                    border-radius: 2px;
                }

                /* --- RWD: 直式螢幕 或 寬度 < 高度 --- */
                /* [關鍵修正] 使用 orientation: portrait 偵測直式狀態 */
                @media (max-width: 768px), (orientation: portrait) {
                    
                    #info-panel.mode-cover { width: 85%; padding: 30px; }
                    .cover-main-title { font-size: 3rem; }
                    
                    /* Group 頁面轉為上下排列 */
                    .group-content-body {
                        flex-direction: column; /* 改為垂直 */
                        overflow-y: auto;       /* 允許滾動 */
                    }

                    .group-half-pane {
                        border-right: none;
                        border-bottom: 1px solid rgba(255, 255, 255, 0.15);
                        /* [修正] 強制設定最小高度，確保內容不被擠壓，每個成員至少佔 50% 視窗高度 */
                        min-height: 50%;
                        flex: 0 0 auto; 
                    }
                    
                    .group-title { font-size: 1rem; }
                    .pane-canvas-area { padding: 15px; }
                }
            `;
            document.head.appendChild(style);

            const infoPanel = document.createElement('div');
            infoPanel.id = 'info-panel';
            document.body.appendChild(infoPanel);

            // ============================================================
            // --- [Step 2] 定義資料庫 ---
            // ============================================================
            
            const viewContentData = {
                0: {
                    type: 'cover',
                    studio: "TKUA 2025 Fall Semester",
                    mainTitle: "re: Model your Daily Living",
                    subTitle: "Intelligence Information Architecture Studio",
                    advisor: "Advisor: Hsiao, Chi-Fu",
                    staff: "Yi-Ting | Ying-Hua | Li-Hong | Ting-Yu | Hao-Lun | Zhi-Shan"
                },
                1: {
                    type: 'group',
                    groupTitle: "Kinetic Mechanisms of Event Translation",
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
                    groupTitle: "Research on Light Interfaces",
                    member1: {
                        author: "Hao-Lun",
                        title: "Applying Noise Warp Shaders to Flexible Surface Projection",
                        p5Url: "https://editor.p5js.org/chifuresearch/full/VR-V2eKMg"
                    },
                    member2: {
                        author: "Zhi-Shan",
                        title: "Optical Deflection in Heterogeneous Transparent Interfaces for Fluid Light Effects",
                        p5Url: "https://editor.p5js.org/chifuresearch/full/N_I8gjMPq"
                    }
                }
            };

            const renderPanelContent = (data) => {
                infoPanel.classList.remove('mode-cover', 'mode-group');
                
                if (data.type === 'cover') {
                    // --- Cover Mode ---
                    infoPanel.classList.add('mode-cover');
                    infoPanel.innerHTML = `
                        <div class="cover-studio">${data.studio}</div>
                        <div class="cover-main-title">${data.mainTitle}</div>
                        <div class="cover-sub-title">${data.subTitle}</div>
                        <div class="cover-footer">
                            <div>${data.advisor}</div>
                            <div class="cover-staff">Staff: ${data.staff}</div>
                        </div>
                    `;
                } else if (data.type === 'group') {
                    // --- Group Mode ---
                    infoPanel.classList.add('mode-group');
                    
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
                            <div class="group-title">${data.groupTitle}</div>
                        </div>
                        <div class="group-content-body">
                            ${createHalfHTML(data.member1)}
                            ${createHalfHTML(data.member2)}
                        </div>
                    `;
                }
            };

            const getContent = (index) => {
                return viewContentData[index] || {
                    type: 'cover',
                    studio: "", mainTitle: "Loading...", subTitle: "", advisor: "", staff: ""
                };
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
                if (isAnimating || navigationNodes.length === 0) return;
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
                if (isAnimating || navigationNodes.length === 0) return;
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

