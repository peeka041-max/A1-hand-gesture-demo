const videoElement = document.getElementById("inputVideo");
const canvasElement = document.getElementById("outputCanvas");
const canvasCtx = canvasElement.getContext("2d");

const loading = document.getElementById("loading");
const statusEl = document.getElementById("status");
const handCountEl = document.getElementById("handCount");
const handednessEl = document.getElementById("handedness");
const fingerCountEl = document.getElementById("fingerCount");
const gestureEl = document.getElementById("gesture");

function resizeCanvas() {
  const rect = canvasElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvasElement.width = Math.round(rect.width * dpr);
  canvasElement.height = Math.round(rect.height * dpr);
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
  if (count === 0) return "握拳";
  if (count === 5) return "张开手掌 / 数字 5";
  return `数字 ${count}`;
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

function onResults(results) {
  resizeCanvas();
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

  const hands = results.multiHandLandmarks || [];
  const handedness = results.multiHandedness || [];

  if (hands.length === 0) {
    handCountEl.textContent = "0";
    handednessEl.textContent = "--";
    fingerCountEl.textContent = "0";
    gestureEl.textContent = "未检测到手";
    statusEl.textContent = "运行中";
  } else {
    const labels = [];
    const counts = [];

    hands.forEach((landmarks, index) => {
      drawHand(landmarks);
      const label = handedness[index]?.label || "Unknown";
      const count = countOpenFingers(landmarks, label);
      labels.push(label === "Left" ? "左手" : label === "Right" ? "右手" : "未知");
      counts.push(count);
    });

    handCountEl.textContent = String(hands.length);
    handednessEl.textContent = labels.join("、");
    fingerCountEl.textContent = counts.join("、");
    gestureEl.textContent = counts.map(gestureName).join("、");
    statusEl.textContent = "已检测";
  }

  canvasCtx.restore();
  loading.hidden = true;
}

async function boot() {
  resizeCanvas();

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
      await hands.send({ image: videoElement });
    },
    width: 1280,
    height: 720,
  });

  try {
    await camera.start();
    statusEl.textContent = "运行中";
  } catch (error) {
    loading.textContent = "无法打开摄像头，请确认浏览器权限或使用 HTTPS / localhost 访问。";
    statusEl.textContent = "摄像头失败";
    console.error(error);
  }
}

window.addEventListener("resize", resizeCanvas);
boot();