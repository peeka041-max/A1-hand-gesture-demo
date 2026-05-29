const stage = document.getElementById("stage");
const videoElement = document.getElementById("inputVideo");
const canvasElement = document.getElementById("outputCanvas");
const canvasCtx = canvasElement.getContext("2d");

const loading = document.getElementById("loading");
const statusEl = document.getElementById("status");
const handCountEl = document.getElementById("handCount");
const handednessEl = document.getElementById("handedness");
const fingerCountEl = document.getElementById("fingerCount");
const gestureEl = document.getElementById("gesture");

const TEXT = {
  fist: "\u63e1\u62f3",
  openPalm: "\u5f20\u5f00\u624b\u638c / \u6570\u5b57 5",
  number: "\u6570\u5b57",
  noHand: "\u672a\u68c0\u6d4b\u5230\u624b",
  running: "\u8fd0\u884c\u4e2d",
  left: "\u5de6\u624b",
  right: "\u53f3\u624b",
  unknown: "\u672a\u77e5",
  detected: "\u5df2\u68c0\u6d4b",
  ready: "\u6444\u50cf\u5934\u5df2\u542f\u52a8",
  cameraError:
    "\u65e0\u6cd5\u6253\u5f00\u6444\u50cf\u5934\u3002\u8bf7\u786e\u8ba4\u5df2\u5141\u8bb8\u6d4f\u89c8\u5668\u6444\u50cf\u5934\u6743\u9650\uff0c\u5e76\u4f7f\u7528 HTTPS \u6216 localhost \u8bbf\u95ee\u9875\u9762\u3002",
  cameraFailed: "\u6444\u50cf\u5934\u5931\u8d25",
  modelError:
    "\u624b\u90e8\u68c0\u6d4b\u6a21\u578b\u52a0\u8f7d\u6216\u8fd0\u884c\u5931\u8d25\u3002\u8bf7\u5237\u65b0\u9875\u9762\uff0c\u5e76\u786e\u8ba4 MediaPipe CDN \u53ef\u6b63\u5e38\u8bbf\u95ee\u3002",
};

function setStageReady() {
  stage.classList.remove("is-loading", "is-error");
  stage.classList.add("is-ready");
}

function setStageError(message) {
  stage.classList.remove("is-loading", "is-ready");
  stage.classList.add("is-error");
  loading.textContent = message;
}

function resizeCanvas() {
  const rect = canvasElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));

  if (canvasElement.width !== width || canvasElement.height !== height) {
    canvasElement.width = width;
    canvasElement.height = height;
  }
}

function clearOverlay() {
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
}

function isFingerOpen(landmarks, tip, pip) {
  return landmarks[tip].y < landmarks[pip].y;
}

function countOpenFingers(landmarks, label) {
  const fingers = {
    index: isFingerOpen(landmarks, 8, 6),
    middle: isFingerOpen(landmarks, 12, 10),
    ring: isFingerOpen(landmarks, 16, 14),
    pinky: isFingerOpen(landmarks, 20, 18),
    thumb: false,
  };

  const isRight = label === "Right";
  fingers.thumb = isRight
    ? landmarks[4].x < landmarks[3].x
    : landmarks[4].x > landmarks[3].x;

  return Object.values(fingers).filter(Boolean).length;
}

function gestureName(count) {
  if (count === 0) return TEXT.fist;
  if (count === 5) return TEXT.openPalm;
  return `${TEXT.number} ${count}`;
}

function drawHand(landmarks) {
  drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
    color: "#00d4ff",
    lineWidth: 4,
  });
  drawLandmarks(canvasCtx, landmarks, {
    color: "#ffcf33",
    lineWidth: 2,
    radius: 4,
  });
}

function resetResultsForNoHand() {
  handCountEl.textContent = "0";
  handednessEl.textContent = "--";
  fingerCountEl.textContent = "0";
  gestureEl.textContent = TEXT.noHand;
  statusEl.textContent = TEXT.running;
}

function onResults(results) {
  resizeCanvas();
  clearOverlay();

  const hands = results.multiHandLandmarks || [];
  const handedness = results.multiHandedness || [];

  if (hands.length === 0) {
    resetResultsForNoHand();
    return;
  }

  const labels = [];
  const counts = [];

  hands.forEach((landmarks, index) => {
    drawHand(landmarks);
    const label = handedness[index]?.label || "Unknown";
    const count = countOpenFingers(landmarks, label);
    labels.push(label === "Left" ? TEXT.left : label === "Right" ? TEXT.right : TEXT.unknown);
    counts.push(count);
  });

  handCountEl.textContent = String(hands.length);
  handednessEl.textContent = labels.join("\u3001");
  fingerCountEl.textContent = counts.join("\u3001");
  gestureEl.textContent = counts.map(gestureName).join("\u3001");
  statusEl.textContent = TEXT.detected;
}

function ensureVideoVisible() {
  if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    setStageReady();
    statusEl.textContent = TEXT.ready;
  }
}

async function boot() {
  resizeCanvas();

  if (!window.Hands || !window.Camera || !window.drawConnectors || !window.drawLandmarks) {
    setStageError(TEXT.modelError);
    statusEl.textContent = TEXT.cameraFailed;
    return;
  }

  videoElement.addEventListener("loadeddata", ensureVideoVisible);
  videoElement.addEventListener("playing", ensureVideoVisible);

  const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.65,
    minTrackingConfidence: 0.65,
  });

  hands.onResults(onResults);

  const camera = new Camera(videoElement, {
    onFrame: async () => {
      try {
        await hands.send({ image: videoElement });
      } catch (error) {
        console.error(error);
        setStageError(TEXT.modelError);
        statusEl.textContent = TEXT.cameraFailed;
      }
    },
    width: 1280,
    height: 720,
  });

  try {
    await camera.start();
    statusEl.textContent = TEXT.running;
    ensureVideoVisible();
  } catch (error) {
    console.error(error);
    clearOverlay();
    resetResultsForNoHand();
    setStageError(TEXT.cameraError);
    statusEl.textContent = TEXT.cameraFailed;
  }
}

window.addEventListener("resize", () => {
  resizeCanvas();
  clearOverlay();
});

boot();