/**
 * Neon Sign Creator — SVG Pathfinding Engine
 *
 * Architecture:
 *  - Loads TTF fonts via opentype.js and parses them into raw Bézier path data
 *  - Each word becomes an independent SVG element on the canvas
 *  - The SVG contains: acrylic backboard (thick stroke expansion) + neon glow layers + white tube
 *  - getTotalLength() on the rendered SVG path yields exact neon strip length in cm
 *  - Words can be dragged freely, resized, and individually styled
 */

document.addEventListener('DOMContentLoaded', async () => {

    // ============================================================
    // FONT REGISTRY — only consistent monoline-stroke typefaces
    // ============================================================
    const FONT_LIST = [
        { name: 'Adventure Island Script', file: 'Adventure Island Script.ttf' },
        { name: 'Andolucia',           file: 'Andolucia.ttf' },
        { name: 'Anthony Houston',     file: 'Anthony_Houston.ttf' },
        { name: 'Barokah Signature',   file: 'Barokah Signature by Alifinart Studio.ttf' },
        { name: 'Famulred',            file: 'Famulred.otf' },
        { name: 'High Empathy',        file: 'High Empathy.ttf' },
        { name: 'Jastyka',             file: 'Jastyka.ttf' },
        { name: 'Nickainley',          file: 'Nickainley.ttf' },
        { name: 'Zing Script Rust',    file: 'ZingScriptRustSBDemo-Base.otf' },
        { name: 'Gruppo',              file: 'Gruppo-Regular.ttf' },
        { name: 'Kodchasan',           file: 'Kodchasan-Regular.ttf' },
        { name: 'Meow Script',         file: 'MeowScript-Regular.ttf' },
        { name: 'Sacramento',          file: 'Sacramento-Regular.ttf' },
        { name: 'Megrim',              file: 'Megrim-Regular.ttf' },
        { name: 'Sue Ellen Francisco', file: 'SueEllenFrancisco-Regular.ttf' },
        { name: 'Julius Sans One',     file: 'JuliusSansOne-Regular.ttf' },
        { name: 'Wire One',            file: 'WireOne-Regular.ttf' },
        { name: 'Poiret One',          file: 'PoiretOne-Regular.ttf' },
        { name: 'Text Me One',         file: 'TextMeOne-Regular.ttf' },
        { name: 'Tulpen One',          file: 'TulpenOne-Regular.ttf' },
        { name: 'Neonderthaw',         file: 'Neonderthaw-Regular.ttf' },
        { name: 'Ms Madi',             file: 'MsMadi-Regular.ttf' },
    ];

    // ============================================================
    // NEON COLORS
    // ============================================================
    const NEON_COLORS = [
        { id: 'pink',       name: 'Pink',       glowColor: '#ff0080' },
        { id: 'red',        name: 'Red',        glowColor: '#ff0000' },
        { id: 'orange',     name: 'Orange',     glowColor: '#ff6600' },
        { id: 'yellow',     name: 'Yellow',     glowColor: '#ffff00' },
        { id: 'green',      name: 'Green',      glowColor: '#00ff00' },
        { id: 'ice-blue',   name: 'Ice Blue',   glowColor: '#19d6ff' },
        { id: 'blue',       name: 'Blue',       glowColor: '#0055ff' },
        { id: 'purple',     name: 'Purple',     glowColor: '#bf00ff' },
        { id: 'white',      name: 'White',       glowColor: '#ffffff' },
        { id: 'warm-white', name: 'Warm White', glowColor: '#fff0cc' },
        { id: 'rgb',        name: 'RGB Cycle',  glowColor: '#ff0000' }, 
        { id: 'flow',       name: 'Color Flow', glowColor: '#ff0000' },
    ];

    // 1px ≈ 0.22cm at base font size (120px) — calibrated to real neon sign ratios
    const BASE_FONT_SIZE = 120;
    const PX_TO_CM = 0.22;

    // ============================================================
    // STATE
    let currentSign = {
        text: 'Good Vibes',
        fontName: 'Meow Script',
        colorId: 'ice-blue',
        scale: 1.0,
        lineSpacing: 1.2,
        x: 0, // offset from center
        y: 0,
        selected: true,
        targetWidthCm: 100, // Default physical width
        _stripCm: 0
    };
    let currentBacking = 'cut-to-shape';
    let currentBackingColor = 'acrylic';
    const fontCache = {};

    // ============================================================
    // DOM REFERENCES
    // ============================================================
    const textInput      = document.getElementById('sign-text');
    const charCountEl    = document.getElementById('char-count');
    const priceTotal     = document.getElementById('price-total');
    const estHeightEl    = document.getElementById('est-height');
    const totalLengthEl  = document.getElementById('total-strip-length');
    const inputWidthCm   = document.getElementById('input-width-cm');
    const inputHeightCm  = document.getElementById('input-height-cm');
    const customInputs   = document.getElementById('custom-inputs-section');
    const neonContainer  = document.getElementById('neon-container');
    const contextMenu    = document.getElementById('word-context-menu');
    const ctxFontGallery = document.getElementById('ctx-font-gallery');
    const ctxColorGrid   = document.getElementById('ctx-color-grid');
    const ctxSizeLabel   = document.getElementById('ctx-size-label');
    const previewSection = document.querySelector('.preview-section');
    const uploadInput    = document.getElementById('bg-upload-input');
    const uploadBtn      = document.getElementById('upload-bg-btn');

    function checkElements() {
        const required = [textInput, neonContainer, totalLengthEl];
        return required.every(el => el !== null);
    }
    
    if (!checkElements()) {
        console.error("Critical DOM elements missing. Neon engine cannot start.");
        return;
    }

    // ============================================================
    // FONT LOADING
    // ============================================================
    const loadFont = (fontName) => {
        if (fontCache[fontName]) return Promise.resolve(fontCache[fontName]);
        const entry = FONT_LIST.find(f => f.name === fontName);
        if (!entry) return Promise.reject(new Error(`Unknown font: ${fontName}`));
        return new Promise((resolve, reject) => {
            opentype.load(`/fonts/${entry.file}`, (err, font) => {
                if (err) { reject(err); return; }
                fontCache[fontName] = font;
                resolve(font);
            });
        });
    };

    const preloadAllFonts = async () => {
        await Promise.all(FONT_LIST.map(f => loadFont(f.name).catch(() => {})));
    };

    // ============================================================
    // POPULATE CONTEXT MENU UI (null-guarded)
    // ============================================================
    if (ctxFontGallery) {
        ctxFontGallery.innerHTML = '';
        FONT_LIST.forEach(f => {
            const btn = document.createElement('div');
            btn.className = 'font-item';
            btn.dataset.fontName = f.name;
            btn.textContent = f.name;
            btn.style.fontFamily = `"${f.name}", sans-serif`;
            ctxFontGallery.appendChild(btn);
        });
    }

    if (ctxColorGrid) ctxColorGrid.innerHTML = '';

    // Populate Sidebar Color Grid
    const globalColorGrid = document.getElementById('global-color-grid');
    if (globalColorGrid) globalColorGrid.innerHTML = '';

    // Populate Sidebar Font Gallery
    const globalFontGallery = document.getElementById('global-font-gallery');
    if (globalFontGallery) {
        globalFontGallery.innerHTML = '';
        FONT_LIST.forEach(f => {
            const card = document.createElement('div');
            card.className = 'font-item';
            card.dataset.fontName = f.name;
            card.textContent = 'Good Vibes';
            card.style.fontFamily = `"${f.name}", sans-serif`;
            
            card.addEventListener('click', () => {
                document.querySelectorAll('.font-item').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                currentSign.fontName = f.name;
                syncTextToCanvas();
            });
            globalFontGallery.appendChild(card);
        });

        // Mark current font as active after small delay
        setTimeout(() => {
            const activeCard = globalFontGallery.querySelector(`[data-font-name="${currentSign.fontName}"]`);
            if (activeCard) activeCard.classList.add('active');
        }, 100);
    }

    // Line Spacing Slider
    const lineSpacingSlider = document.getElementById('line-spacing-slider');
    const lineSpacingVal    = document.getElementById('line-spacing-val');
    if (lineSpacingSlider) {
        lineSpacingSlider.addEventListener('input', () => {
            currentSign.lineSpacing = parseFloat(lineSpacingSlider.value);
            if (lineSpacingVal) lineSpacingVal.textContent = `${currentSign.lineSpacing.toFixed(1)}x`;
            syncTextToCanvas();
        });
    }

    // Populate Neon Color Buttons
    if (globalColorGrid) {
        NEON_COLORS.forEach(color => {
            const btn = document.createElement('div');
            btn.className = 'neon-color-button';
            if (currentSign.colorId === color.id) btn.classList.add('active');
            
            const dot = document.createElement('div');
            dot.className = 'color-status-dot';
            
            if (color.id === 'rgb') {
                dot.style.background = 'linear-gradient(45deg, red, orange, yellow, green, blue, indigo, violet)';
            } else if (color.id === 'flow') {
                dot.style.background = 'linear-gradient(to right, #ff0080, #19d6ff, #00ff00)';
            } else {
                dot.style.setProperty('--dot-color', color.glowColor);
            }
            
            const name = document.createElement('span');
            name.textContent = color.name;
            
            btn.appendChild(dot);
            btn.appendChild(name);
            
            btn.addEventListener('click', () => {
                document.querySelectorAll('.neon-color-button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentSign.colorId = color.id;
                syncTextToCanvas();
            });
            
            globalColorGrid.appendChild(btn);
        });
    }

    // ============================================================
    // SVG RENDERING ENGINE — the heart of the pathfinder
    // ============================================================
    const svgNS = 'http://www.w3.org/2000/svg';

    /**
     * Builds a single SVG for the entire sign (multi-line)
     */
    const buildSignSVG = (signData, font, backing) => {
        const lines = signData.text.split('\n');
        const fontSize = BASE_FONT_SIZE * signData.scale;
        const lineSpacing = fontSize * signData.lineSpacing;
        
        const combinedPaths = [];
        let totalMaxX = -Infinity, totalMinX = Infinity;
        let totalMaxY = -Infinity, totalMinY = Infinity;

        // 1. Calculate paths and overall bounding box
        lines.forEach((line, idx) => {
            const yOffset = idx * lineSpacing;
            const linePath = font.getPath(line || ' ', 0, yOffset, fontSize);
            const bbox = linePath.getBoundingBox();
            
            // Center the line horizontally by offsetting its path
            const lineWidth = (bbox.x2 - bbox.x1) || 0;
            const xShift = -lineWidth / 2;
            
            combinedPaths.push({ path: linePath, xShift, yOffset, bbox, lineWidth });

            totalMinX = Math.min(totalMinX, -lineWidth / 2);
            totalMaxX = Math.max(totalMaxX, lineWidth / 2);
            totalMinY = Math.min(totalMinY, bbox.y1 + yOffset);
            totalMaxY = Math.max(totalMaxY, bbox.y2 + yOffset);
        });

        if (totalMinX === Infinity) return null;

        const color = NEON_COLORS.find(c => c.id === signData.colorId) || NEON_COLORS[0];
        const glow = color.glowColor;

        // Padding for backboard and glow
        const boardPadding = fontSize * (backing === 'cut-to-letter' ? 0.18 : 0.30);
        const bleed = boardPadding + 40;

        const vx = totalMinX - bleed;
        const vy = totalMinY - bleed;
        const vw = (totalMaxX - totalMinX) + 2 * bleed;
        const vh = (totalMaxY - totalMinY) + 2 * bleed;

        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
        svg.setAttribute('width', Math.round(vw));
        svg.setAttribute('height', Math.round(vh));
        svg.style.cssText = 'display:block;overflow:visible;pointer-events:none;';

        const defs = document.createElementNS(svgNS, 'defs');
        const uid = 'sign';
        defs.innerHTML = `
            <linearGradient id="flow-grad" x1="0%" y1="0%" x2="200%" y2="0%" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#ff0000" />
                <stop offset="10%" stop-color="#ff7700" />
                <stop offset="20%" stop-color="#ffff00" />
                <stop offset="30%" stop-color="#00ff00" />
                <stop offset="40%" stop-color="#00aaff" />
                <stop offset="50%" stop-color="#8800ff" />
                <stop offset="60%" stop-color="#ff0000" />
                <stop offset="70%" stop-color="#ff7700" />
                <stop offset="80%" stop-color="#ffff00" />
                <stop offset="90%" stop-color="#00ff00" />
                <stop offset="100%" stop-color="#ff0000" />
                <animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="-1000 0" dur="10s" repeatCount="indefinite" />
            </linearGradient>
            <filter id="glow-outer-${uid}" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="25"/>
            </filter>
            <filter id="glow-mid-${uid}" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="10"/>
            </filter>
            <filter id="glow-inner-${uid}" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3.5"/>
            </filter>`;
        svg.appendChild(defs);

        const group = document.createElementNS(svgNS, 'g');

        // --- RECTANGLE BACKBOARD: drawn as a single SVG rect behind everything ---
        if (backing === 'rectangle') {
            const rectPad = fontSize * 0.5;
            const rRect = document.createElementNS(svgNS, 'rect');
            rRect.setAttribute('x', totalMinX - rectPad);
            rRect.setAttribute('y', totalMinY - rectPad);
            rRect.setAttribute('width', (totalMaxX - totalMinX) + rectPad * 2);
            rRect.setAttribute('height', (totalMaxY - totalMinY) + rectPad * 2);
            rRect.setAttribute('rx', fontSize * 0.15);
            rRect.setAttribute('ry', fontSize * 0.15);

            let rectFill = 'rgba(255, 255, 255, 0.12)';
            let rectStroke = 'rgba(255, 255, 255, 0.2)';
            if (currentBackingColor === 'black') { rectFill = 'rgba(0,0,0,0.85)'; rectStroke = '#222'; }
            if (currentBackingColor === 'white') { rectFill = 'rgba(255,255,255,0.9)'; rectStroke = '#ddd'; }

            rRect.setAttribute('fill', rectFill);
            rRect.setAttribute('stroke', rectStroke);
            rRect.setAttribute('stroke-width', '4');
            group.appendChild(rRect);
        }

        combinedPaths.forEach(cp => {
            const lineG = document.createElementNS(svgNS, 'g');
            lineG.setAttribute('transform', `translate(${cp.xShift}, ${cp.yOffset})`);
            
            const d = cp.path.toPathData(2);
            
            // Layer 0: Backboard (contoured — cut-to-shape and cut-to-letter only)
            if (backing !== 'rectangle') {
                let fill = 'rgba(255, 255, 255, 0.12)';
                let stroke = 'rgba(255, 255, 255, 0.15)';
                
                if (currentBackingColor === 'black') { fill = '#000'; stroke = '#000'; }
                if (currentBackingColor === 'white') { fill = '#fff'; stroke = '#fff'; }
                
                const pBoard = document.createElementNS(svgNS, 'path');
                pBoard.setAttribute('d', d);
                pBoard.setAttribute('fill', fill);
                pBoard.setAttribute('stroke', stroke);
                pBoard.setAttribute('stroke-width', boardPadding * 2);
                pBoard.setAttribute('stroke-linejoin', 'round');
                pBoard.setAttribute('stroke-linecap', 'round');
                lineG.appendChild(pBoard);
            }

            // Create a sub-group for the lighting (glow + tube)
            const lightingG = document.createElementNS(svgNS, 'g');
            if (signData.colorId === 'rgb') lightingG.classList.add('neon-rgb-anim');
            lineG.appendChild(lightingG);

            // Layers 1-3: Glow
            ['outer', 'mid', 'inner'].forEach(level => {
                const p = document.createElementNS(svgNS, 'path');
                p.setAttribute('d', d);
                p.setAttribute('fill', signData.colorId === 'flow' ? 'url(#flow-grad)' : glow);
                p.setAttribute('filter', `url(#glow-${level}-${uid})`);
                p.setAttribute('opacity', level === 'outer' ? '0.4' : level === 'mid' ? '0.7' : '0.9');
                lightingG.appendChild(p);
            });

            const pTube = document.createElementNS(svgNS, 'path');
            pTube.setAttribute('d', d);
            pTube.setAttribute('fill', signData.colorId === 'flow' ? 'url(#flow-grad)' : '#fff');
            pTube.classList.add('neon-tube-core');
            if (signData.colorId === 'flow') {
                pTube.classList.add('neon-flow-anim');
            }
            lightingG.appendChild(pTube);

            group.appendChild(lineG);
        });

        svg.appendChild(group);

        return { svg, vw, vh };
    };

    // ============================================================
    // WORD NODE DOM MANAGEMENT
    // ============================================================
    // Obsolete per-word rendering

    // ============================================================
    // SELECTION & CONTEXT MENU
    // ============================================================
    // Obsolete selection logic

    // ============================================================
    // TEXT INPUT → CANVAS SYNC (Sentence Flow Layout Engine)
    // ============================================================
    const syncTextToCanvas = async () => {
        const text = textInput.value || ' ';
        currentSign.text = text;
        
        charCountEl.textContent = `${text.replace(/\s/g, '').length} letter${text.length !== 1 ? 's' : ''}`;

        const font = await loadFont(currentSign.fontName);
        const result = buildSignSVG(currentSign, font, currentBacking);
        
        neonContainer.innerHTML = '';
        if (!result) return;

        const signNode = document.createElement('div');
        signNode.className = 'unified-sign';
        signNode.style.position = 'absolute';
        signNode.style.left = '50%';
        signNode.style.top = '50%';
        signNode.style.transform = `translate(calc(-50% + ${currentSign.x}px), calc(-50% + ${currentSign.y}px))`;
        
        const svgWrapper = document.createElement('div');
        svgWrapper.className = 'interaction-wrapper';
        svgWrapper.style.position = 'relative';
        svgWrapper.appendChild(result.svg);
        signNode.appendChild(svgWrapper);

        // 1. Selection Box
        const selectionBox = document.createElement('div');
        selectionBox.className = 'selection-box';
        svgWrapper.appendChild(selectionBox);

        // 2. Multi-Point Handles
        ['tl', 'tr', 'tm', 'bl', 'br'].forEach(pos => {
            const h = document.createElement('div');
            h.className = `sign-handle ${pos}`;
            svgWrapper.appendChild(h);

            // Resizing Logic for all handles
            let resizing = false;
            let startScale, startDist, centerX, centerY;

            h.addEventListener('pointerdown', e => {
                e.stopPropagation();
                resizing = true;
                startScale = currentSign.scale;
                const rect = svgWrapper.getBoundingClientRect();
                centerX = rect.left + rect.width / 2;
                centerY = rect.top + rect.height / 2;
                startDist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
                h.setPointerCapture(e.pointerId);
                svgWrapper.style.transition = 'none';
            });

            h.addEventListener('pointermove', e => {
                if (!resizing) return;
                const dist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
                const newScale = Math.max(0.2, Math.min(5.0, startScale * (dist / startDist)));
                
                // Visual scale (fast)
                const visualFactor = newScale / startScale;
                svgWrapper.style.transform = `scale(${visualFactor})`;
                
                // Live metrics (fast)
                const curWCm = (result.vw * PX_TO_CM * visualFactor).toFixed(1);
                const curHCm = (result.vh * PX_TO_CM * visualFactor).toFixed(1);
                const curWIn = (result.vw * PX_TO_CM * visualFactor / 2.54).toFixed(1);
                const curHIn = (result.vh * PX_TO_CM * visualFactor / 2.54).toFixed(1);
                
                badge.textContent = `${curWCm}cm x ${curHCm}cm / ${curWIn}in x ${curHIn}in`;
                hTxt.textContent = `${curWCm}cm`;
                vTxt.innerHTML = `${curHCm}cm<br>${curHIn}in`;
                
                h.lastScale = newScale;
            });

            h.addEventListener('pointerup', e => { 
                if (resizing) {
                    currentSign.scale = h.lastScale || currentSign.scale;
                    syncTextToCanvas();
                }
                resizing = false; 
            });
        });

        // 3. Dimension Logic (Decoupled: Visual scale vs Physical CM)
        const currentPxWidth  = result.vw;
        const currentPxHeight = result.vh;
        
        // Calibration factor: how many CM is 1 PX for this specific setup?
        const currentCmPerPx = currentSign.targetWidthCm / currentPxWidth;

        // Update Sidebar Labels for Size Cards
        document.querySelectorAll('.size-card').forEach(card => {
            if (card.dataset.custom) return;
            const cardW = parseFloat(card.dataset.width);
            const cardH = (cardW * (result.vh / result.vw)).toFixed(0);
            const cardWIn = (cardW / 2.54).toFixed(0);
            const cardHIn = (parseFloat(cardH) / 2.54).toFixed(0);
            
            const dimsEl = card.querySelector('.size-dims');
            if (dimsEl) {
                dimsEl.textContent = `${cardW}cm x ${cardH}cm / ${cardWIn}in x ${cardHIn}in`;
            }
        });

        const finalWCm = currentSign.targetWidthCm.toFixed(1);
        const finalHCm = (currentPxHeight * currentCmPerPx).toFixed(1);
        const finalWIn = (currentSign.targetWidthCm / 2.54).toFixed(1);
        const finalHIn = (currentPxHeight * currentCmPerPx / 2.54).toFixed(1);

        if (inputHeightCm) inputHeightCm.value = Math.round(finalHCm);

        const badge = document.createElement('div');
        badge.className = 'dim-badge';
        badge.textContent = `${finalWCm}cm x ${finalHCm}cm / ${finalWIn}in x ${finalHIn}in`;
        svgWrapper.appendChild(badge);

        // 4. Ruler Lines (Re-adding missing style definitions in JS for layout)
        const hr = document.createElement('div'); hr.className = 'ruler-line h';
        hr.style.cssText = 'height:1px; top:-15px; left:0; right:0; position:absolute; background:rgba(255,255,255,0.4);';
        const vr = document.createElement('div'); vr.className = 'ruler-line v';
        vr.style.cssText = 'width:1px; left:-15px; top:0; bottom:0; position:absolute; background:rgba(255,255,255,0.4);';
        
        const hTxt = document.createElement('div'); hTxt.className = 'ruler-text h';
        hTxt.style.cssText = 'position:absolute; top:-30px; left:50%; transform:translateX(-50%); color:rgba(255,255,255,0.7); font-size:0.75rem;';
        const vTxt = document.createElement('div'); vTxt.className = 'ruler-text v';
        vTxt.style.cssText = 'position:absolute; left:-55px; top:50%; transform:translateY(-50%); color:rgba(255,255,255,0.7); font-size:0.75rem; text-align:right;';
        
        hTxt.textContent = `${finalWCm}cm`;
        vTxt.innerHTML = `${finalHCm}cm<br>${finalHIn}in`;
        
        // Exact alignment: The sign's outer edge is 40px from the SVG border at scale 1
        const bleedOffset = 40;
        hr.style.left = `${bleedOffset}px`;
        hr.style.right = `${bleedOffset}px`;
        vr.style.top = `${bleedOffset}px`;
        vr.style.bottom = `${bleedOffset}px`;

        svgWrapper.appendChild(hr); svgWrapper.appendChild(vr);
        svgWrapper.appendChild(hTxt); svgWrapper.appendChild(vTxt);

        neonContainer.appendChild(signNode);

        // --- Interaction: Dragging ---
        let dragging = false;
        let startX, startY, origX, origY;

        // Selection Toggle logic
        if (currentSign.selected) signNode.classList.add('selected');

        signNode.addEventListener('pointerdown', e => {
            // Dragging prep
            if (e.target.classList.contains('sign-handle')) return;
            
            dragging = true;
            startX = e.clientX; startY = e.clientY;
            origX = currentSign.x; origY = currentSign.y;
            signNode.setPointerCapture(e.pointerId);

            // Selection toggle
            if (!currentSign.selected) {
                currentSign.selected = true;
                syncTextToCanvas(); 
            }
        }, { capture: true }); 

        signNode.addEventListener('pointermove', e => {
            if (!dragging) return;
            currentSign.x = origX + (e.clientX - startX);
            currentSign.y = origY + (e.clientY - startY);
            signNode.style.transform = `translate(calc(-50% + ${currentSign.x}px), calc(-50% + ${currentSign.y}px))`;
        });

        signNode.addEventListener('pointerup', () => { dragging = false; });

        // Update Global metrics
        const tubes = signNode.querySelectorAll('.neon-tube-core');
        let totalPx = 0;
        tubes.forEach(t => { try { totalPx += t.getTotalLength(); } catch(e) {} });
        
        const totalCm = (totalPx * PX_TO_CM).toFixed(1);
        const totalIn = (totalPx * PX_TO_CM / 2.54).toFixed(1);

        if (totalLengthEl) {
            totalLengthEl.textContent = `${totalCm} cm / ${totalIn} in`;
        }
        
        if (estWidthEl) estWidthEl.textContent = `Total: ${finalWCm}cm x ${finalHCm}cm / ${finalWIn}in x ${finalHIn}in`;
        
        // Accurate price based on neon strip length
        const baseCost = 45;
        const cmCost = 0.85; 
        const finalPrice = baseCost + (totalPx * currentCmPerPx * cmCost);
        priceTotal.textContent = `$${finalPrice.toFixed(2)}`;
    };

    // Background click to deselect
    previewSection.addEventListener('pointerdown', e => {
        if (!e.target.closest('.unified-sign') && !e.target.closest('.control-panel')) {
            if (currentSign.selected) {
                currentSign.selected = false;
                syncTextToCanvas();
            }
        }
    });

    // ============================================================
    // BACKBOARD & MATERIAL SELECTION
    // ============================================================
    document.querySelectorAll('.bb-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.bb-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            currentBacking = card.dataset.backing;
            currentSign.backing = card.dataset.backing;
            syncTextToCanvas();
        });
    });

    document.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            currentBackingColor = swatch.dataset.bcolor;
            currentSign.backingColor = swatch.dataset.bcolor;
            syncTextToCanvas();
        });
    });

    // ============================================================
    // BACKGROUND SWITCHING
    // ============================================================
    const uploadBgBtn   = document.getElementById('upload-bg-btn');
    const bgUploadInput = document.getElementById('bg-upload-input');

    if (uploadBgBtn && bgUploadInput) {
        uploadBgBtn.addEventListener('click', () => bgUploadInput.click());
        bgUploadInput.addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;
            const url = URL.createObjectURL(file);
            document.querySelectorAll('.bg-option').forEach(b => b.classList.remove('active'));
            uploadBgBtn.classList.add('active');
            previewSection.className = 'preview-section';
            previewSection.style.backgroundImage = `url(${url})`;
            previewSection.style.backgroundSize = 'cover';
            previewSection.style.backgroundPosition = 'center';
        });
    }

    document.querySelectorAll('.bg-option.bg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.bg-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            previewSection.style.backgroundImage = '';
            previewSection.className = `preview-section bg-${btn.dataset.bg}`;
        });
    });

    // ============================================================
    // SIZE CARDS
    // ============================================================
    previewSection.classList.add('bg-black');

    document.querySelectorAll('.size-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.size-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');

            if (card.dataset.custom) {
                if (customInputs) customInputs.style.display = 'grid';
            } else {
                if (customInputs) customInputs.style.display = 'none';
                currentSign.targetWidthCm = parseFloat(card.dataset.width);
                if (inputWidthCm) inputWidthCm.value = currentSign.targetWidthCm;
            }
            syncTextToCanvas();
        });
    });

    if (inputWidthCm) {
        inputWidthCm.addEventListener('input', () => {
            currentSign.targetWidthCm = parseFloat(inputWidthCm.value) || 10;
            syncTextToCanvas();
        });
    }

    // ============================================================
    // STARTUP — load fonts then render
    // ============================================================
    neonContainer.innerHTML = '<div class="fonts-loading">⚡ Loading neon fonts…</div>';
    await preloadAllFonts();
    neonContainer.innerHTML = '';

    textInput.addEventListener('input', syncTextToCanvas);
    syncTextToCanvas();

    // ============================================================
    // CART LOGIC
    // ============================================================
    let cart = JSON.parse(localStorage.getItem('neon_cart')) || [];

    const cartSidebar    = document.getElementById('cart-sidebar');
    const cartToggleBtn  = document.getElementById('cart-toggle-btn');
    const closeCartBtn   = document.getElementById('close-cart');
    const cartCountEl    = document.getElementById('cart-count');
    const cartItemsList  = document.getElementById('cart-items-list');
    const cartSubtotalEl = document.getElementById('cart-subtotal-val');
    const addToCartBtn   = document.getElementById('add-to-cart-btn');
    const continueBtn    = document.getElementById('continue-shopping');
    const goToCartBtn    = document.getElementById('go-to-cart-btn');

    const updateCartUI = () => {
        cartCountEl.textContent = cart.length;
        
        if (cart.length === 0) {
            cartItemsList.innerHTML = '<div class="empty-cart-msg">Your cart is empty</div>';
            cartSubtotalEl.textContent = '$0.00';
        } else {
            cartItemsList.innerHTML = '';
            let subtotal = 0;
            
            cart.forEach((item, index) => {
                subtotal += item.price;
                const itemEl = document.createElement('div');
                itemEl.className = 'cart-item';
                itemEl.innerHTML = `
                    <div class="cart-item-img">
                        ${item.svgMarkup}
                    </div>
                    <div class="cart-item-info">
                        <div class="cart-item-name">${item.text.replace(/\n/g, ' ')}</div>
                        <div class="cart-item-details">
                            ${item.fontName} • ${item.colorName}<br>
                            ${item.widthCm}cm x ${item.heightCm}cm • ${item.backing}
                        </div>
                        <div class="cart-item-price">$${item.price.toFixed(2)}</div>
                    </div>
                    <button class="remove-item-btn" data-index="${index}">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                `;
                cartItemsList.appendChild(itemEl);
            });
            
            cartSubtotalEl.textContent = `$${subtotal.toFixed(2)}`;
            
            // Add remove listeners
            document.querySelectorAll('.remove-item-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.dataset.index);
                    cart.splice(idx, 1);
                    localStorage.setItem('neon_cart', JSON.stringify(cart));
                    updateCartUI();
                });
            });
        }
    };

    const openCart = () => cartSidebar.classList.add('open');
    const closeCart = () => cartSidebar.classList.remove('open');

    if (cartToggleBtn) cartToggleBtn.addEventListener('click', openCart);
    if (closeCartBtn)  closeCartBtn.addEventListener('click', closeCart);
    if (continueBtn)   continueBtn.addEventListener('click', closeCart);

    if (addToCartBtn) {
        addToCartBtn.addEventListener('click', () => {
            const currentPrice = parseFloat(priceTotal.textContent.replace('$', ''));
            const colorObj = NEON_COLORS.find(c => c.id === currentSign.colorId);
            
            // Generate a simplified SVG preview for the cart
            const font = fontCache[currentSign.fontName];
            const result = buildSignSVG({...currentSign, scale: 0.5}, font, currentBacking);
            const svgMarkup = result ? result.svg.outerHTML : '';

            const cartItem = {
                text: currentSign.text,
                fontName: currentSign.fontName,
                colorName: colorObj ? colorObj.name : 'Custom',
                widthCm: Math.round(parseFloat(inputWidthCm.value)),
                heightCm: Math.round(parseFloat(inputHeightCm.value)),
                backing: currentBacking,
                price: currentPrice,
                svgMarkup: svgMarkup,
                timestamp: Date.now()
            };

            cart.push(cartItem);
            localStorage.setItem('neon_cart', JSON.stringify(cart));
            updateCartUI();
            openCart();

            // Success feedback on button
            const originalText = addToCartBtn.textContent;
            addToCartBtn.textContent = 'Added! ✓';
            addToCartBtn.style.background = '#10b981';
            setTimeout(() => {
                addToCartBtn.textContent = originalText;
                addToCartBtn.style.background = '';
            }, 2000);
        });
    }

    if (goToCartBtn) {
        goToCartBtn.addEventListener('click', () => {
            window.location.href = 'cart.html';
        });
    }

    // Initial UI Sync
    updateCartUI();
});
