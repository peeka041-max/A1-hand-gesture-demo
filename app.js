const stage = document.getElementById("stage");
const videoElement = document.getElementById("inputVideo");
const canvasElement = document.getElementById("outputCanvas");
const canvasCtx = canvasElement.getContext("2d");

const placeholder = document.getElementById("placeholder");
const statusEl = document.getElementById("status");
const handCountEl = document.getElementById("handCount");
const handednessEl = document.getElementById("handedness");
const fingerCountEl = document.getElementById("fingerCount");
const gestureEl = document.getElementById("gesture");

let latestHands = [];
let latestHandedness = [];
let handsModel = null;
let isSendingFrame = false;
let mediaPipeAvailable = false;
let sendFrameCount = 0;

const TEXT = {
  fist: "握拳",
  openPalm: "张开手掌 / 数字 5",
  number: "数字",
  noHand: "未检测到手",
  noHandHint: "请将手放到画面中央并保持光线充足",
  running: "运行中",
  left: "左手",
  right: "右手",
  unknown: "未知",
  detected: "已检测",
  cameraReady: "摄像头已启动",
  modelReady: "检测运行中",
  cameraError:
    "无法打开摄像头。请确认已允许浏览器摄像头权限，并使用 HTTPS 或 localhost 访问页面。",
  modelError:
    "摄像头已启动，但 MediaPipe 模型初始化失败；页面会继续显示真实摄像头画面。",
};

function setStageReady() {
  stage.classList.remove("is-loading", "is-error");
  stage.classList.add("is-ready");
}

function setStageError(message) {
  stage.classList.remove("is-loading", "is-ready");
  stage.classList.add("is-error");
  placeholder.textContent = message;
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

function hasUsableVideoFrame() {
  return (
    videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    videoElement.videoWidth > 0 &&
    videoElement.videoHeight > 0
  );
}

function waitForVideoDimensions() {
  return new Promise((resolve) => {
    const check = () => {
      if (hasUsableVideoFrame()) {
        resolve();
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
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

function resetResultsForNoHand() {
  handCountEl.textContent = "0";
  handednessEl.textContent = "--";
  fingerCountEl.textContent = "0";
  gestureEl.textContent = TEXT.noHand;
}

function updateResults(hands, handedness) {
  if (hands.length === 0) {
    resetResultsForNoHand();
    statusEl.textContent = mediaPipeAvailable ? TEXT.noHandHint : TEXT.modelReady;
    return;
  }

  const labels = [];
  const counts = [];

  hands.forEach((landmarks, index) => {
    const label = handedness[index]?.label || "Unknown";
    const count = countOpenFingers(landmarks, label);
    labels.push(label === "Left" ? TEXT.left : label === "Right" ? TEXT.right : TEXT.unknown);
    counts.push(count);
  });

  handCountEl.textContent = String(hands.length);
  handednessEl.textContent = labels.join("、");
  fingerCountEl.textContent = counts.join("、");
  gestureEl.textContent = counts.map(gestureName).join("、");
  statusEl.textContent = TEXT.detected;
}

function drawCameraFrame() {
  resizeCanvas();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  if (hasUsableVideoFrame()) {
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
  }

  latestHands.forEach((landmarks) => {
    drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
      color: "#00d4ff",
      lineWidth: 4,
    });
    drawLandmarks(canvasCtx, landmarks, {
      color: "#ffcf33",
      lineWidth: 2,
      radius: 4,
    });
  });
}

function renderLoop() {
  drawCameraFrame();
  requestAnimationFrame(renderLoop);
}

async function sendFrameToMediaPipe() {
  if (!mediaPipeAvailable || !handsModel || isSendingFrame) return;
  if (!hasUsableVideoFrame()) return;

  sendFrameCount += 1;
  if (sendFrameCount % 60 === 0) {
    console.log("[MediaPipe Hands] sending frame", {
      readyState: videoElement.readyState,
      videoWidth: videoElement.videoWidth,
      videoHeight: videoElement.videoHeight,
    });
  }

  isSendingFrame = true;
  try {
    await handsModel.send({ image: videoElement });
  } catch (error) {
    console.error(error);
    mediaPipeAvailable = false;
    statusEl.textContent = TEXT.cameraReady;
  } finally {
    isSendingFrame = false;
  }
}

function detectionLoop() {
  sendFrameToMediaPipe();
  requestAnimationFrame(detectionLoop);
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("getUserMedia is not supported in this browser.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: 1280,
      height: 720,
      facingMode: "user",
    },
  });

  videoElement.srcObject = stream;

  await new Promise((resolve, reject) => {
    videoElement.onloadedmetadata = async () => {
      try {
        await videoElement.play();
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    videoElement.onerror = () => reject(new Error("Video element failed to load camera stream."));
  });

  await waitForVideoDimensions();
  setStageReady();
  statusEl.textContent = TEXT.cameraReady;
}

async function initMediaPipe() {
  if (!window.Hands || !window.drawConnectors || !window.drawLandmarks) {
    throw new Error("MediaPipe scripts are not available.");
  }

  handsModel = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  handsModel.setOptions({
    maxNumHands: 2,
    modelComplexity: 0,
    selfieMode: true,
    minDetectionConfidence: 0.35,
    minTrackingConfidence: 0.35,
  });

  handsModel.onResults((results) => {
    latestHands = results.multiHandLandmarks || [];
    latestHandedness = results.multiHandedness || [];
    updateResults(latestHands, latestHandedness);
  });

  mediaPipeAvailable = true;
  statusEl.textContent = TEXT.modelReady;
}

async function boot() {
  resizeCanvas();
  resetResultsForNoHand();
  renderLoop();

  try {
    await startCamera();
  } catch (error) {
    console.error(error);
    setStageError(TEXT.cameraError);
    statusEl.textContent = "摄像头失败";
    return;
  }

  try {
    await initMediaPipe();
    await waitForVideoDimensions();
    detectionLoop();
  } catch (error) {
    console.error(error);
    placeholder.textContent = TEXT.modelError;
    statusEl.textContent = TEXT.cameraReady;
  }
}

window.addEventListener("resize", resizeCanvas);

boot();