/* ============================================================
   HAND CONTROL — MediaPipe Hands -> game gestures
   ☝️  index only        => start / restart (rising edge)
   ✌️  index + middle    => jump (rising edge)
   ============================================================ */

(() => {
  const videoEl = document.getElementById('inputVideo');
  const handCanvas = document.getElementById('handCanvas');
  const handCtx = handCanvas.getContext('2d');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const gestureReadout = document.getElementById('gestureReadout');

  // Landmark index reference (MediaPipe Hands, 21 points per hand):
  // 0 wrist | thumb 1-4 | index 5-8 | middle 9-12 | ring 13-16 | pinky 17-20
  const FINGERS = {
    index: { mcp: 5, pip: 6, tip: 8 },
    middle: { mcp: 9, pip: 10, tip: 12 },
    ring: { mcp: 13, pip: 14, tip: 16 },
    pinky: { mcp: 17, pip: 18, tip: 20 }
  };

  let prevIndexOnly = false;
  let prevIndexMiddle = false;

  function isExtended(landmarks, finger) {
    // A finger counts as "up" when its tip sits meaningfully above its
    // PIP joint relative to the palm size (robust-ish to hand distance).
    const wrist = landmarks[0];
    const { pip, tip, mcp } = finger;
    const palmSize = Math.hypot(
      landmarks[mcp].x - wrist.x,
      landmarks[mcp].y - wrist.y
    ) || 0.001;
    const tipToPip = landmarks[pip].y - landmarks[tip].y; // positive if tip is above pip
    return tipToPip / palmSize > 0.35;
  }

  function classifyGesture(landmarks) {
    const index = isExtended(landmarks, FINGERS.index);
    const middle = isExtended(landmarks, FINGERS.middle);
    const ring = isExtended(landmarks, FINGERS.ring);
    const pinky = isExtended(landmarks, FINGERS.pinky);

    if (index && middle && !ring && !pinky) return 'jump';
    if (index && !middle && !ring && !pinky) return 'start';
    return 'none';
  }

  function drawLandmarks(landmarks) {
    handCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);
    if (!landmarks) return;

    const w = handCanvas.width;
    const h = handCanvas.height;
    const connections = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [5,9],[9,10],[10,11],[11,12],
      [9,13],[13,14],[14,15],[15,16],
      [13,17],[17,18],[18,19],[19,20],
      [0,17]
    ];

    handCtx.strokeStyle = 'rgba(224,147,47,0.9)';
    handCtx.lineWidth = 2;
    connections.forEach(([a, b]) => {
      handCtx.beginPath();
      handCtx.moveTo(landmarks[a].x * w, landmarks[a].y * h);
      handCtx.lineTo(landmarks[b].x * w, landmarks[b].y * h);
      handCtx.stroke();
    });

    handCtx.fillStyle = '#4F7A5A';
    landmarks.forEach(pt => {
      handCtx.beginPath();
      handCtx.arc(pt.x * w, pt.y * h, 3, 0, Math.PI * 2);
      handCtx.fill();
    });
  }

  function sizeHandCanvasToVideo() {
    handCanvas.width = videoEl.videoWidth || 320;
    handCanvas.height = videoEl.videoHeight || 240;
  }

  function onResults(results) {
    if (handCanvas.width !== (videoEl.videoWidth || 320)) sizeHandCanvasToVideo();

    const hasHand = results.multiHandLandmarks && results.multiHandLandmarks.length > 0;
    statusDot.classList.toggle('live', hasHand);
    statusText.textContent = hasHand ? 'HAND DETECTED' : 'NO HAND VISIBLE';

    if (!hasHand) {
      drawLandmarks(null);
      gestureReadout.textContent = '— NO HAND —';
      prevIndexOnly = false;
      prevIndexMiddle = false;
      return;
    }

    const landmarks = results.multiHandLandmarks[0];
    drawLandmarks(landmarks);

    const gesture = classifyGesture(landmarks);
    const isIndexOnly = gesture === 'start';
    const isIndexMiddle = gesture === 'jump';

    gestureReadout.textContent =
      gesture === 'jump' ? '✌️ JUMP' :
      gesture === 'start' ? '☝️ READY' :
      '— NO GESTURE —';

    // Rising-edge triggers so holding a pose doesn't spam actions.
    if (isIndexOnly && !prevIndexOnly) {
      window.DinoGame.attemptStart();
    }
    if (isIndexMiddle && !prevIndexMiddle) {
      window.DinoGame.jump();
    }

    prevIndexOnly = isIndexOnly;
    prevIndexMiddle = isIndexMiddle;
  }

  async function init() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      statusText.textContent = 'CAMERA NOT SUPPORTED';
      gestureReadout.textContent = 'Browser has no camera API';
      return;
    }

    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6
    });
    hands.onResults(onResults);

    videoEl.addEventListener('loadedmetadata', sizeHandCanvasToVideo, { once: false });

    statusText.textContent = 'REQUESTING CAMERA…';

    // IMPORTANT: only Camera (from @mediapipe/camera_utils) touches
    // getUserMedia here. It owns the stream, attaches it to videoEl,
    // and drives the per-frame loop that feeds Hands. Requesting the
    // stream a second time ourselves is what caused the blank video.
    try {
      const camera = new Camera(videoEl, {
        onFrame: async () => {
          await hands.send({ image: videoEl });
        },
        width: 320,
        height: 240
      });
      await camera.start();
      statusText.textContent = 'LOOKING FOR HAND…';
    } catch (err) {
      console.error('Camera error:', err);
      statusText.textContent = 'CAMERA ACCESS DENIED';
      gestureReadout.textContent = 'Check permissions & reload';
    }
  }

  init();
})();