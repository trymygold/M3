/* core.js - Jewels-Ai: Master Engine (v12.1 - Fixed Camera & Loops) */

/* --- CONFIGURATION --- */
const API_KEY = "AIzaSyAXG3iG2oQjUA_BpnO8dK8y-MHJ7HLrhyE"; 

const DRIVE_FOLDERS = {
  earrings: "1eftKhpOHbCj8hzO11-KioFv03g0Yn61n",
  chains: "1G136WEiA9QBSLtRk0LW1fRb3HDZb4VBD",
  rings: "1iB1qgTE-Yl7w-CVsegecniD_DzklQk90",
  bangles: "1d2b7I8XlhIEb8S_eXnRFBEaNYSwngnba"
};

/* --- GLOBAL STATE --- */
window.JewelsState = {
    active: { earrings: null, chains: null, rings: null, bangles: null }, 
    stackingEnabled: false, 
    currentType: ''
};

const JEWELRY_ASSETS = {}; 
const CATALOG_PROMISES = {}; 
const IMAGE_CACHE = {}; 

const watermarkImg = new Image(); 
watermarkImg.crossOrigin = "anonymous"; 
watermarkImg.src = 'logo_watermark.png'; 

/* DOM Elements */
const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('overlay');
const canvasCtx = canvasElement.getContext('2d');
const loadingStatus = document.getElementById('loading-status');
const flashOverlay = document.getElementById('flash-overlay'); 

/* Tracking State */
let currentAssetName = "Select a Design"; 
let currentAssetIndex = 0; 
let physics = { earringAngle: 0, earringVelocity: 0, swayOffset: 0, lastHeadX: 0 };
let currentCameraMode = 'user'; 

/* MediaPipe Setup */
const faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
faceMesh.setOptions({ refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });

const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });

/* --- 1. UTILITY FUNCTIONS (MISSING IN ORIGINAL) --- */
function showToast(msg) {
    const toast = document.getElementById('toast-notification');
    if (toast) {
        toast.innerText = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
}

function triggerFlash() {
    if (flashOverlay) {
        flashOverlay.classList.add('flash-active');
        setTimeout(() => flashOverlay.classList.remove('flash-active'), 250);
    }
}

function lerp(a, b, n) { return (1 - n) * a + n * b; }

/* --- 2. CAMERA & ENGINE START --- */
async function startCameraFast(mode = 'user') {
    currentCameraMode = mode;
    loadingStatus.style.display = 'block';
    loadingStatus.innerText = "Starting Engine...";

    if (videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: mode } 
        });
        videoElement.srcObject = stream;
        
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            // Start the detection loop
            detectLoop();
            loadingStatus.style.display = 'none';
        };
    } catch (err) { 
        console.error("Camera Error", err);
        loadingStatus.innerText = "Error: Camera Access Denied. Please enable camera and refresh.";
        showToast("Check camera permissions!");
    }
}

async function detectLoop() {
    if (videoElement.paused || videoElement.ended) return;
    
    // Send to MediaPipe based on current category
    if (window.JewelsState.currentType === 'rings' || window.JewelsState.currentType === 'bangles') {
        await hands.send({image: videoElement});
    } else {
        await faceMesh.send({image: videoElement});
    }
    
    requestAnimationFrame(detectLoop);
}

/* --- 3. RENDERING LOGIC --- */
faceMesh.onResults((results) => {
    const w = videoElement.videoWidth; const h = videoElement.videoHeight;
    canvasElement.width = w; canvasElement.height = h;
    canvasCtx.save();
    
    // Mirroring logic
    if (currentCameraMode === 'user') {
        canvasCtx.translate(w, 0); canvasCtx.scale(-1, 1);
    }
    canvasCtx.drawImage(videoElement, 0, 0, w, h);
    
    if (results.multiFaceLandmarks && results.multiFaceLandmarks[0]) {
        const lm = results.multiFaceLandmarks[0];
        const earringImg = window.JewelsState.active.earrings;
        
        if (earringImg && earringImg.complete) {
            const leftEar = { x: lm[132].x * w, y: lm[132].y * h };
            const rightEar = { x: lm[361].x * w, y: lm[361].y * h };
            const earDist = Math.hypot(rightEar.x - leftEar.x, rightEar.y - leftEar.y);
            const ew = earDist * 0.25; 
            const eh = (earringImg.height / earringImg.width) * ew;
            
            canvasCtx.drawImage(earringImg, leftEar.x - ew/2, leftEar.y, ew, eh);
            canvasCtx.drawImage(earringImg, rightEar.x - ew/2, rightEar.y, ew, eh);
        }
    }
    canvasCtx.restore();
});

// Re-integrate your hand tracking and category fetching logic here...
// (Existing JEWELRY_ASSETS, selectJewelryType, and downloadAllSnapshots functions)

/* --- 4. INITIALIZATION --- */
window.onload = async () => {
    // Pre-fetch data
    Object.keys(DRIVE_FOLDERS).forEach(key => fetchCategoryData(key));
    
    // Start Camera
    await startCameraFast('user');
    await selectJewelryType('earrings');
};

/* --- ASSET FETCHING --- */
async function fetchCategoryData(category) {
    if (JEWELRY_ASSETS[category]) return JEWELRY_ASSETS[category];
    try {
        const url = `https://www.googleapis.com/drive/v3/files?q='${DRIVE_FOLDERS[category]}' in parents and trashed = false&fields=files(id,name,thumbnailLink)&key=${API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        JEWELRY_ASSETS[category] = data.files.map(file => ({
            id: file.id, name: file.name,
            thumbSrc: file.thumbnailLink.replace(/=s\d+$/, "=s400"),
            fullSrc: `https://drive.google.com/uc?export=view&id=${file.id}`
        }));
        return JEWELRY_ASSETS[category];
    } catch (err) { console.error(err); return []; }
}

async function selectJewelryType(type) {
    window.JewelsState.currentType = type;
    const container = document.getElementById('jewelry-options');
    container.style.display = 'flex';
    container.innerHTML = '<p>Loading Designs...</p>';
    
    const assets = await fetchCategoryData(type);
    container.innerHTML = '';
    
    assets.forEach((asset, i) => {
        const img = document.createElement('img');
        img.src = asset.thumbSrc;
        img.className = "thumb-btn";
        img.onclick = () => applyAssetInstantly(asset, i);
        container.appendChild(img);
    });
}

async function applyAssetInstantly(asset, index) {
    currentAssetName = asset.name;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = asset.fullSrc;
    img.onload = () => {
        window.JewelsState.active[window.JewelsState.currentType] = img;
    };
}
/* --- 5. ASSET LOADING --- */
function initBackgroundFetch() { Object.keys(DRIVE_FOLDERS).forEach(key => fetchCategoryData(key)); }

function fetchCategoryData(category) {
    if (CATALOG_PROMISES[category]) return CATALOG_PROMISES[category];
    const fetchPromise = new Promise(async (resolve, reject) => {
        try {
            const url = `https://www.googleapis.com/drive/v3/files?q='${DRIVE_FOLDERS[category]}' in parents and trashed = false and mimeType contains 'image/'&pageSize=1000&fields=files(id,name,thumbnailLink)&key=${API_KEY}`;
            const response = await fetch(url);
            const data = await response.json();
            JEWELRY_ASSETS[category] = data.files.map(file => ({
                id: file.id, name: file.name,
                thumbSrc: file.thumbnailLink ? file.thumbnailLink.replace(/=s\d+$/, "=s400") : `https://drive.google.com/thumbnail?id=${file.id}`,
                fullSrc: file.thumbnailLink ? file.thumbnailLink.replace(/=s\d+$/, "=s3000") : `https://drive.google.com/uc?export=view&id=${file.id}`
            }));
            
            if (category === 'earrings') setTimeout(prepareDailyDrop, 2000);
            resolve(JEWELRY_ASSETS[category]);
        } catch (err) { console.error(err); resolve([]); }
    });
    CATALOG_PROMISES[category] = fetchPromise;
    return fetchPromise;
}

function loadAsset(src, id) {
    return new Promise((resolve) => {
        if (!src) { resolve(null); return; }
        if (IMAGE_CACHE[id]) { resolve(IMAGE_CACHE[id]); return; }
        
        const img = new Image(); 
        img.crossOrigin = 'anonymous'; 
        const safeSrc = src + (src.includes('?') ? '&' : '?') + 't=' + new Date().getTime(); 
        
        img.onload = () => { IMAGE_CACHE[id] = img; resolve(img); };
        img.onerror = () => { resolve(null); };
        img.src = safeSrc;
    });
}

function setActiveARImage(img) {
    const type = window.JewelsState.currentType;
    if (type === 'earrings') window.JewelsState.active.earrings = img;
    else if (type === 'chains') window.JewelsState.active.chains = img;
    else if (type === 'rings') window.JewelsState.active.rings = img;
    else if (type === 'bangles') window.JewelsState.active.bangles = img;
}

/* --- 6. APP INIT --- */
window.onload = async () => {
    initBackgroundFetch();
    coShop.init(); 
    concierge.init();
    
    // Manual Close Button Binding
    const closePrev = document.querySelector('.close-preview');
    if(closePrev) closePrev.onclick = closePreview;
    
    const closeGal = document.querySelector('.close-gallery');
    if(closeGal) closeGal.onclick = closeGallery;
    
    const closeLight = document.querySelector('.close-lightbox');
    if(closeLight) closeLight.onclick = closeLightbox;

    await startCameraFast('user');
    setTimeout(() => { loadingStatus.style.display = 'none'; }, 2000);
    await selectJewelryType('earrings');
};

/* --- 7. LOGIC: SELECTION & STACKING -- - */
function toggleStacking() {
    window.JewelsState.stackingEnabled = !window.JewelsState.stackingEnabled;
    const btn = document.getElementById('stacking-btn');
    
    if (window.JewelsState.stackingEnabled) {
        if(btn) btn.classList.add('active');
        showToast("Mix & Match: ON");
        if(concierge.active) concierge.speak("Stacking enabled. Select another category.");
    } else {
        if(btn) btn.classList.remove('active');
        showToast("Mix & Match: OFF");
        
        const current = window.JewelsState.currentType;
        Object.keys(window.JewelsState.active).forEach(key => {
            if (key !== current) window.JewelsState.active[key] = null;
        });
        if(concierge.active) concierge.speak("Single mode active.");
    }
}

async function selectJewelryType(type) {
  if (window.JewelsState.currentType === type && type !== undefined) return;
  window.JewelsState.currentType = type;
  
  if(concierge.hasStarted) concierge.speak(`Selected ${type}.`);
  
  const targetMode = (type === 'rings' || type === 'bangles') ? 'environment' : 'user';
  startCameraFast(targetMode); 
  
  if (!window.JewelsState.stackingEnabled) {
      window.JewelsState.active = { earrings: null, chains: null, rings: null, bangles: null };
  }

  const container = document.getElementById('jewelry-options'); 
  container.innerHTML = ''; 
  container.style.display = 'flex';
  
  let assets = JEWELRY_ASSETS[type];
  if (!assets) assets = await fetchCategoryData(type);
  if (!assets || assets.length === 0) return;

  assets.forEach((asset, i) => {
    const btnImg = new Image(); 
    btnImg.src = asset.thumbSrc; btnImg.className = "thumb-btn"; 
    btnImg.onclick = () => { applyAssetInstantly(asset, i, true); };
    container.appendChild(btnImg);
  });
  
  applyAssetInstantly(assets[0], 0, false);
}

async function applyAssetInstantly(asset, index, shouldBroadcast = true) {
    currentAssetIndex = index; 
    currentAssetName = asset.name; 
    highlightButtonByIndex(index);
    
    const thumbImg = new Image(); 
    thumbImg.src = asset.thumbSrc; thumbImg.crossOrigin = 'anonymous'; 
    setActiveARImage(thumbImg);
    
    if (shouldBroadcast && coShop.active && coShop.isHost) {
        coShop.sendUpdate(window.JewelsState.currentType, index);
    }
    
    const highResImg = await loadAsset(asset.fullSrc, asset.id);
    if (currentAssetName === asset.name && highResImg) {
        setActiveARImage(highResImg);
    }
}

function highlightButtonByIndex(index) {
    const children = document.getElementById('jewelry-options').children;
    for (let i = 0; i < children.length; i++) {
        children[i].style.borderColor = (i === index) ? "var(--accent)" : "rgba(255,255,255,0.2)"; 
        children[i].style.transform = (i === index) ? "scale(1.05)" : "scale(1)"; 
        if(i===index) children[i].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
}

/* --- 8. VOICE CONTROL --- */
function initVoiceControl() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { if(voiceBtn) voiceBtn.style.display = 'none'; return; }
    recognition = new SpeechRecognition(); recognition.continuous = true; recognition.interimResults = false; recognition.lang = 'en-US';
    recognition.onstart = () => { isRecognizing = true; if(voiceBtn) { voiceBtn.style.backgroundColor = "rgba(0, 255, 0, 0.2)"; voiceBtn.style.borderColor = "#00ff00"; } };
    recognition.onresult = (event) => { if (event.results[event.results.length - 1].isFinal) processVoiceCommand(event.results[event.results.length - 1][0].transcript.trim().toLowerCase()); };
    recognition.onend = () => { isRecognizing = false; if (voiceEnabled) setTimeout(() => { try { recognition.start(); } catch(e) {} }, 500); else if(voiceBtn) { voiceBtn.style.backgroundColor = "rgba(255,255,255,0.1)"; voiceBtn.style.borderColor = "rgba(255,255,255,0.3)"; } };
    try { recognition.start(); } catch(e) {}
}
function toggleVoiceControl() { if (!recognition) { initVoiceControl(); return; } voiceEnabled = !voiceEnabled; if (!voiceEnabled) { recognition.stop(); if(voiceBtn) { voiceBtn.innerHTML = '🔇'; voiceBtn.classList.add('voice-off'); } } else { try { recognition.start(); } catch(e) {} if(voiceBtn) { voiceBtn.innerHTML = '🎙️'; voiceBtn.classList.remove('voice-off'); } } }
function processVoiceCommand(cmd) { 
    cmd = cmd.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,""); 
    if (cmd.includes('next') || cmd.includes('change')) { changeProduct(1); triggerVisualFeedback("Next"); } 
    else if (cmd.includes('back') || cmd.includes('previous')) { changeProduct(-1); triggerVisualFeedback("Previous"); } 
    else if (cmd.includes('earring')) selectJewelryType('earrings'); 
    else if (cmd.includes('chain')) selectJewelryType('chains'); 
    else if (cmd.includes('ring')) selectJewelryType('rings'); 
    else if (cmd.includes('bangle')) selectJewelryType('bangles'); 
}

/* --- 9. CAMERA & TRACKING --- */
async function startCameraFast(mode = 'user') {
    if (!coShop.isHost && coShop.active) return; 
    if (videoElement.srcObject && currentCameraMode === mode && videoElement.readyState >= 2) return;
    currentCameraMode = mode;
    if (videoElement.srcObject) { videoElement.srcObject.getTracks().forEach(track => track.stop()); }
    if (mode === 'environment') { videoElement.classList.add('no-mirror'); } else { videoElement.classList.remove('no-mirror'); }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: mode } });
        videoElement.srcObject = stream;
        videoElement.onloadeddata = () => { videoElement.play(); detectLoop(); if(!recognition) initVoiceControl(); };
    } catch (err) { console.error("Camera Error", err); }
}

async function detectLoop() {
    if (videoElement.readyState >= 2 && !remoteVideo.srcObject) { 
        if (!isProcessingFace) { isProcessingFace = true; await faceMesh.send({image: videoElement}); isProcessingFace = false; }
        if (!isProcessingHand) { isProcessingHand = true; await hands.send({image: videoElement}); isProcessingHand = false; }
    }
    requestAnimationFrame(detectLoop);
}

/* --- 10. RENDER LOOPS --- */
const faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
faceMesh.setOptions({ refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
faceMesh.onResults((results) => {
  const earringImg = window.JewelsState.active.earrings;
  const necklaceImg = window.JewelsState.active.chains;
  if (!earringImg && !necklaceImg) return;

  const w = videoElement.videoWidth; const h = videoElement.videoHeight;
  canvasElement.width = w; canvasElement.height = h;
  canvasCtx.save();
  if (currentCameraMode === 'environment') { canvasCtx.translate(0, 0); canvasCtx.scale(1, 1); } 
  else { canvasCtx.translate(w, 0); canvasCtx.scale(-1, 1); }
  canvasCtx.drawImage(videoElement, 0, 0, w, h);
  
  if (results.multiFaceLandmarks && results.multiFaceLandmarks[0]) {
    const lm = results.multiFaceLandmarks[0]; 
    const leftEar = { x: lm[132].x * w, y: lm[132].y * h }; const rightEar = { x: lm[361].x * w, y: lm[361].y * h };
    const neck = { x: lm[152].x * w, y: lm[152].y * h }; const nose = { x: lm[1].x * w, y: lm[1].y * h };
    
    const gravityTarget = -Math.atan2(rightEar.y - leftEar.y, rightEar.x - leftEar.x); 
    physics.earringVelocity += (gravityTarget - physics.earringAngle) * 0.1; 
    physics.earringVelocity *= 0.92; physics.earringAngle += physics.earringVelocity;
    const headSpeed = (lm[1].x - physics.lastHeadX) * w; physics.lastHeadX = lm[1].x;
    physics.swayOffset += headSpeed * -0.005; physics.swayOffset *= 0.85; 
    
    const earDist = Math.hypot(rightEar.x - leftEar.x, rightEar.y - leftEar.y);
    const distToLeft = Math.hypot(nose.x - leftEar.x, nose.y - leftEar.y); 
    const distToRight = Math.hypot(nose.x - rightEar.x, nose.y - rightEar.y);
    const ratio = distToLeft / (distToLeft + distToRight);
    
    if (earringImg && earringImg.complete) {
      let ew = earDist * 0.25; let eh = (earringImg.height/earringImg.width) * ew; const xShift = ew * 0.05; const totalAngle = physics.earringAngle + (physics.swayOffset * 0.5);
      if (ratio > 0.25) { canvasCtx.save(); canvasCtx.translate(leftEar.x, leftEar.y); canvasCtx.rotate(totalAngle); canvasCtx.drawImage(earringImg, (-ew/2) - xShift, -eh * 0.20, ew, eh); canvasCtx.restore(); }
      if (ratio < 0.75) { canvasCtx.save(); canvasCtx.translate(rightEar.x, rightEar.y); canvasCtx.rotate(totalAngle); canvasCtx.drawImage(earringImg, (-ew/2) + xShift, -eh * 0.20, ew, eh); canvasCtx.restore(); }
    }
    if (necklaceImg && necklaceImg.complete) {
      const nw = earDist * 0.85; const nh = (necklaceImg.height/necklaceImg.width) * nw;
      canvasCtx.drawImage(necklaceImg, neck.x - nw/2, neck.y + (nw*0.1), nw, nh);
    }
  }
  canvasCtx.restore();
});

const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
function calculateAngle(p1, p2) { return Math.atan2(p2.y - p1.y, p2.x - p1.x); }

hands.onResults((results) => {
  const w = videoElement.videoWidth; const h = videoElement.videoHeight;
  
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const lm = results.multiHandLandmarks[0];
      const indexTipX = lm[8].x; 

      if (!autoTryRunning && (Date.now() - lastGestureTime > GESTURE_COOLDOWN)) {
          if (previousHandX !== null) {
              const diff = indexTipX - previousHandX;
              if (Math.abs(diff) > 0.04) { 
                  const dir = (diff > 0) ? -1 : 1; 
                  changeProduct(dir); 
                  triggerVisualFeedback(dir === -1 ? "⬅️ Previous" : "Next ➡️");
                  lastGestureTime = Date.now(); 
                  previousHandX = null; 
              }
          }
          if (Date.now() - lastGestureTime > 100) previousHandX = indexTipX;
      }
  } else { 
      previousHandX = null; 
  }

  const ringImg = window.JewelsState.active.rings;
  const bangleImg = window.JewelsState.active.bangles;
  
  if (!ringImg && !bangleImg) return;

  canvasElement.width = w; canvasElement.height = h;
  canvasCtx.save();
  if (currentCameraMode === 'environment') { canvasCtx.translate(0, 0); canvasCtx.scale(1, 1); } 
  else { canvasCtx.translate(w, 0); canvasCtx.scale(-1, 1); }
  canvasCtx.drawImage(videoElement, 0, 0, w, h);

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const lm = results.multiHandLandmarks[0];
      const mcp = { x: lm[13].x * w, y: lm[13].y * h }; const pip = { x: lm[14].x * w, y: lm[14].y * h };
      const wrist = { x: lm[0].x * w, y: lm[0].y * h }; 
      
      const targetRingAngle = calculateAngle(mcp, pip) - (Math.PI / 2);
      const targetRingWidth = Math.hypot(pip.x - mcp.x, pip.y - mcp.y) * 0.6; 
      const targetArmAngle = calculateAngle(wrist, { x: lm[9].x * w, y: lm[9].y * h }) - (Math.PI / 2);
      const targetBangleWidth = Math.hypot((lm[17].x*w)-(lm[5].x*w), (lm[17].y*h)-(lm[5].y*h)) * 1.25; 
      
      if (!handSmoother.active) {
          handSmoother = { active: true, ring: { x: mcp.x, y: mcp.y, angle: targetRingAngle, size: targetRingWidth }, bangle: { x: wrist.x, y: wrist.y, angle: targetArmAngle, size: targetBangleWidth } };
      } else {
          handSmoother.ring.x = lerp(handSmoother.ring.x, mcp.x, SMOOTH_FACTOR);
          handSmoother.ring.y = lerp(handSmoother.ring.y, mcp.y, SMOOTH_FACTOR);
          handSmoother.ring.angle = lerp(handSmoother.ring.angle, targetRingAngle, SMOOTH_FACTOR);
          handSmoother.ring.size = lerp(handSmoother.ring.size, targetRingWidth, SMOOTH_FACTOR);
          
          handSmoother.bangle.x = lerp(handSmoother.bangle.x, wrist.x, SMOOTH_FACTOR);
          handSmoother.bangle.y = lerp(handSmoother.bangle.y, wrist.y, SMOOTH_FACTOR);
          handSmoother.bangle.angle = lerp(handSmoother.bangle.angle, targetArmAngle, SMOOTH_FACTOR);
          handSmoother.bangle.size = lerp(handSmoother.bangle.size, targetBangleWidth, SMOOTH_FACTOR);
      }
      
      if (ringImg && ringImg.complete) {
          const rHeight = (ringImg.height / ringImg.width) * handSmoother.ring.size;
          canvasCtx.save(); canvasCtx.translate(handSmoother.ring.x, handSmoother.ring.y); canvasCtx.rotate(handSmoother.ring.angle); 
          canvasCtx.drawImage(ringImg, -handSmoother.ring.size/2, (handSmoother.ring.size/0.6)*0.15, handSmoother.ring.size, rHeight); canvasCtx.restore();
      }
      if (bangleImg && bangleImg.complete) {
          const bHeight = (bangleImg.height / bangleImg.width) * handSmoother.bangle.size;
          canvasCtx.save(); canvasCtx.translate(handSmoother.bangle.x, handSmoother.bangle.y); canvasCtx.rotate(handSmoother.bangle.angle);
          canvasCtx.drawImage(bangleImg, -handSmoother.bangle.size/2, -bHeight/2, handSmoother.bangle.size, bHeight); canvasCtx.restore();
      }
  }
  canvasCtx.restore();
});

/* --- 11. CAPTURE LOGIC (Secure Screenshot) --- */
function captureToGallery() {
    const tempCanvas = document.createElement('canvas'); 
    tempCanvas.width = videoElement.videoWidth; 
    tempCanvas.height = videoElement.videoHeight; 
    const tempCtx = tempCanvas.getContext('2d');
    
    if (currentCameraMode === 'environment') { tempCtx.translate(0, 0); tempCtx.scale(1, 1); } 
    else { tempCtx.translate(tempCanvas.width, 0); tempCtx.scale(-1, 1); }
    tempCtx.drawImage(videoElement, 0, 0); 
    tempCtx.setTransform(1, 0, 0, 1, 0, 0);
    try { tempCtx.drawImage(canvasElement, 0, 0); } catch(e) {}

    let cleanName = currentAssetName.replace(/\.(png|jpg|jpeg|webp)$/i, "").replace(/_/g, " "); 
    cleanName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
    
    const padding = tempCanvas.width * 0.05; 
    const titleSize = tempCanvas.width * 0.045; 
    const descSize = tempCanvas.width * 0.032; 
    const maxWidth = tempCanvas.width - (padding * 2);
    const lineHeight = descSize * 1.4;

    function getLines(text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = words[0];
        for (let i = 1; i < words.length; i++) {
            let word = words[i];
            let width = tempCtx.measureText(currentLine + " " + word).width;
            if (width < maxWidth) { currentLine += " " + word; } 
            else { lines.push(currentLine); currentLine = word; }
        }
        lines.push(currentLine);
        return lines;
    }

    tempCtx.font = `${descSize}px Montserrat, sans-serif`;
    const descriptionLines = getLines(cleanName, maxWidth);
    const totalTextHeight = (descriptionLines.length * lineHeight) + titleSize + (padding * 2);

    const gradient = tempCtx.createLinearGradient(0, tempCanvas.height - totalTextHeight - padding, 0, tempCanvas.height);
    gradient.addColorStop(0, "rgba(0,0,0,0)"); 
    gradient.addColorStop(0.2, "rgba(0,0,0,0.9)"); 
    gradient.addColorStop(1, "rgba(0,0,0,0.98)");
    tempCtx.fillStyle = gradient; 
    tempCtx.fillRect(0, tempCanvas.height - totalTextHeight - padding, tempCanvas.width, totalTextHeight + padding);

    tempCtx.font = `bold ${titleSize}px Playfair Display, serif`; 
    tempCtx.fillStyle = "#d4af37"; 
    tempCtx.textAlign = "left"; 
    const titleY = tempCanvas.height - totalTextHeight + padding;
    tempCtx.fillText("Product Description", padding, titleY);

    tempCtx.font = `${descSize}px Montserrat, sans-serif`; 
    tempCtx.fillStyle = "#ffffff"; 
    descriptionLines.forEach((line, index) => {
        const lineY = titleY + titleSize + (index * lineHeight) + (padding * 0.5);
        tempCtx.fillText(line, padding, lineY);
    });

    if (watermarkImg.complete) { 
        const wWidth = tempCanvas.width * 0.22; 
        const wHeight = (watermarkImg.height / watermarkImg.width) * wWidth; 
        tempCtx.drawImage(watermarkImg, tempCanvas.width - wWidth - padding, padding, wWidth, wHeight);
    }
    
    try { return { url: tempCanvas.toDataURL('image/png'), name: `Jewels-Ai_${Date.now()}.png` }; } 
    catch(e) { return null; }
}

/* --- 12. TRY ALL & GALLERY LOGIC --- */
function toggleTryAll() { 
    if (!window.JewelsState.currentType) { showToast("Please select a category first!"); return; } 
    if (autoTryRunning) stopAutoTry(); else startAutoTry(); 
}

function startAutoTry() { 
    autoTryRunning = true; 
    autoSnapshots = []; 
    autoTryIndex = 0; 
    const btn = document.getElementById('tryall-btn');
    if(btn) { btn.textContent = "STOP AUTO"; btn.style.background = "#ff4444"; }
    if(concierge.active) concierge.speak("Starting auto-try. Stay still!");
    runAutoStep(); 
}

function stopAutoTry() { 
    autoTryRunning = false; 
    clearTimeout(autoTryTimeout); 
    const btn = document.getElementById('tryall-btn');
    if(btn) { btn.textContent = "Try All Designs"; btn.style.background = "var(--accent)"; }
    if (autoSnapshots.length > 0) showGallery(); 
}

async function runAutoStep() { 
    if (!autoTryRunning) return; 
    const assets = JEWELRY_ASSETS[window.JewelsState.currentType]; 
    if (!assets || autoTryIndex >= assets.length) { stopAutoTry(); return; } 
    
    const asset = assets[autoTryIndex]; 
    const highResImg = await loadAsset(asset.fullSrc, asset.id); 
    setActiveARImage(highResImg); 
    currentAssetName = asset.name; 
    highlightButtonByIndex(autoTryIndex);

    autoTryTimeout = setTimeout(() => { 
        triggerFlash(); 
        const data = captureToGallery(); 
        if (data) autoSnapshots.push(data); 
        autoTryIndex++; 
        runAutoStep();
    }, 2000); 
}

function showGallery() {
    const grid = document.getElementById('gallery-grid');
    if(!grid) return;
    grid.innerHTML = ''; 
    autoSnapshots.forEach((item, index) => {
        const card = document.createElement('div'); 
        card.className = "gallery-card";
        card.innerHTML = `<img src="${item.url}" class="gallery-img">`;
        card.onclick = () => openLightbox(item.url);
        grid.appendChild(card);
    });
    document.getElementById('gallery-modal').style.display = 'flex';
}

function openLightbox(url) {
    const lbImg = document.getElementById('lightbox-image');
    if(lbImg) lbImg.src = url;
    document.getElementById('lightbox-overlay').style.display = 'flex';
}

/* --- 13. DOWNLOAD & SHARE LOGIC --- */
function downloadAllSnapshots() {
    if (autoSnapshots.length === 0) { showToast("No images to download."); return; }
    const statusEl = document.getElementById('download-status');
    if(statusEl) statusEl.innerText = "[Downloading in process...]";

    autoSnapshots.forEach((snap, i) => {
        setTimeout(() => {
            const link = document.createElement('a');
            link.href = snap.url;
            link.download = `Jewels-AI-Look-${i + 1}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            if (i === autoSnapshots.length - 1) {
                setTimeout(() => {
                    if(statusEl) statusEl.innerText = "[Successfully Downloaded]";
                    showToast("All looks saved!");
                }, 1000);
            }
        }, i * 500);
    });
}

async function shareAllSnapshots() {
    if (!navigator.share) { showToast("Sharing not supported on this device."); return; }
    const statusEl = document.getElementById('download-status');
    if(statusEl) statusEl.innerText = "[Preparing files for sharing...]";

    try {
        const files = [];
        for (let i = 0; i < autoSnapshots.length; i++) {
            const res = await fetch(autoSnapshots[i].url);
            const blob = await res.blob();
            files.push(new File([blob], `Jewel-Look-${i + 1}.png`, { type: 'image/png' }));
        }
        await navigator.share({ title: 'My Jewels-AI Collection', files: files });
        if(statusEl) statusEl.innerText = "";
    } catch (err) {
        showToast("Share failed. Try Download All.");
        if(statusEl) statusEl.innerText = "";
    }
}

/* --- HELPER FUNCTIONS --- */
function closePreview() { document.getElementById('preview-modal').style.display = 'none'; }
function closeGallery() { document.getElementById('gallery-modal').style.display = 'none'; }
function closeLightbox() { document.getElementById('lightbox-overlay').style.display = 'none'; }

function prepareDailyDrop() { if(JEWELRY_ASSETS['earrings'] && JEWELRY_ASSETS['earrings'].length > 0) { const l=JEWELRY_ASSETS['earrings']; const i=Math.floor(Math.random()*l.length); dailyItem={item:l[i],index:i,type:'earrings'}; document.getElementById('daily-img').src=dailyItem.item.thumbSrc; document.getElementById('daily-name').innerText=dailyItem.item.name; } }
function closeDailyDrop() { document.getElementById('daily-drop-modal').style.display='none'; }
function tryDailyItem() { closeDailyDrop(); if (dailyItem) { selectJewelryType(dailyItem.type).then(() => { applyAssetInstantly(dailyItem.item, dailyItem.index, true); }); } }
function toggleCoShop() { const m=document.getElementById('coshop-modal'); if (coShop.myId) { document.getElementById('invite-link-box').innerText=window.location.origin+window.location.pathname+"?room="+coShop.myId; m.style.display='flex'; } else showToast("Generating ID..."); }
function closeCoShopModal() { document.getElementById('coshop-modal').style.display='none'; }
function copyInviteLink() { navigator.clipboard.writeText(document.getElementById('invite-link-box').innerText).then(()=>showToast("Link Copied!")); }
function triggerFlash() { if(!flashOverlay) return; flashOverlay.classList.remove('flash-active'); void flashOverlay.offsetWidth; flashOverlay.classList.add('flash-active'); setTimeout(()=>flashOverlay.classList.remove('flash-active'),300); }
function lerp(start, end, amt) { return (1 - amt) * start + amt * end; }

/* --- EXPORTS --- */
window.selectJewelryType = selectJewelryType; 
window.toggleTryAll = toggleTryAll; 
window.tryDailyItem = tryDailyItem; 
window.closeDailyDrop = closeDailyDrop; 
window.toggleCoShop = toggleCoShop; 
window.closeCoShopModal = closeCoShopModal; 
window.copyInviteLink = copyInviteLink; 
window.sendVote = (val) => coShop.sendVote(val); 
window.toggleStacking = toggleStacking; 
window.downloadAllSnapshots = downloadAllSnapshots;
window.shareAllSnapshots = shareAllSnapshots;
window.takeSnapshot = takeSnapshot;
window.closePreview = closePreview;
window.closeGallery = closeGallery;
window.closeLightbox = closeLightbox;
window.toggleConciergeMute = () => concierge.toggle();
window.initVoiceControl = initVoiceControl;
window.toggleVoiceControl = toggleVoiceControl;
window.changeProduct = changeProduct; 
window.showToast = (msg) => { var x=document.getElementById("toast-notification"); x.innerText=msg; x.className="show"; setTimeout(()=>x.className=x.className.replace("show",""),3000); };