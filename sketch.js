const MY_BACKEND_URL = "https://rhythmix-server.onrender.com/api";

const BASE_W = 1000;
const BASE_H = 560;

let page = 1;

let scaleFactor = 1;
let offsetX = 0;
let offsetY = 0;
let baseMouseX = 0;
let baseMouseY = 0;

let analyzeProgress = 0;
let spinAngle = 0;
let wavePhase = 0;
let pageStartMillis = 0;

let particles = [];
let analysisDots = [];
let drawnPoints = [];

// 입력 모드
let inputMode = "waveform"; // "waveform" or "shape"

// 음길이
let noteLength = 15;
let noteLengthMin = 5;
let noteLengthMax = 20;

// 도형 블록
let shapeBlocks = [];
let selectedShapeIndex = -1;

// 생성된 음악
let generatedSequence = [];
let generatedAudioUrl = "";
let generatedAudioBlob = null;

// Suno 생성 이미지 변수
let generatedImageUrl = "";
let generatedImage = null;

// 생성 상태
let generationState = "idle"; // idle or working or ready or error
let generationStarted = false;
let generationToken = 0;
let generationPrompt = "";
let generationStartMillis = 0;
let generationReadyMillis = 0;
let generationProgress = 0;

// 재생
let isPlaying = false;
let audioPlayer = null;
let currentAudioObjectUrl = "";
let htmlAudioPlayer = null;

let messageText = "";
let messageStartTime = 0;

// 2번 슬라이드 조작 영역
let drawArea = {
  x: 55,
  y: 135,
  w: 890,
  h: 370,
};

function setup() {
  createCanvas(windowWidth, windowHeight);
  textFont("sans-serif");
  angleMode(RADIANS);
  rectMode(CORNER);

  pageStartMillis = millis();

  for (let i = 0; i < 55; i++) {
    particles.push({
      x: random(330, 670),
      y: random(210, 330),
      size: random(2, 5),
      speed: random(0.3, 0.9),
      alpha: random(60, 140),
    });
  }

  for (let i = 0; i < 36; i++) {
    analysisDots.push({
      x: random(300, 700),
      y: random(220, 350),
      r: random(3, 7),
      a: random(80, 180),
    });
  }

  syncShapeBlocks();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
  background(255);
  updateLayout();

  analyzeProgress += 0.008;
  if (analyzeProgress > 1) analyzeProgress = 0;

  spinAngle += 0.025;
  wavePhase += 0.045;

  if (audioPlayer && isPlaying) {
    if (audioPlayer.currentTime >= noteLength) {
      stopPlayback();
      showMessage("초 시연 재생 완료");
    }
  }

  if (page === 3 && millis() - pageStartMillis > 2200) {
    setPage(4);
  }

  if (page === 4) {
    if (generationState === "working") {
      generationProgress = min(
        0.95,
        (millis() - generationStartMillis) / 60000
      );
      ensureGenerationStarted();
    } else if (generationState === "ready") {
      generationProgress = 1;
      if (millis() - generationReadyMillis > 550) {
        setPage(5);
      }
    } else if (generationState === "error") {
      generationProgress = 1;
      if (millis() - generationReadyMillis > 900) {
        setPage(5);
      }
    }
  }

  push();
  translate(offsetX, offsetY);
  scale(scaleFactor);

  if (page === 1) drawPage1();
  else if (page === 2) drawPage2();
  else if (page === 3) drawPage3();
  else if (page === 4) drawPage4();
  else if (page === 5) drawPage5();
  else if (page === 6) drawPage6();

  drawMessage();

  pop();
}

function updateLayout() {
  scaleFactor = min(width / BASE_W, height / BASE_H);
  offsetX = (width - BASE_W * scaleFactor) / 2;
  offsetY = (height - BASE_H * scaleFactor) / 2;

  baseMouseX = constrain((mouseX - offsetX) / scaleFactor, 0, BASE_W);
  baseMouseY = constrain((mouseY - offsetY) / scaleFactor, 0, BASE_H);
}

function mousePressed() {
  updateLayout();

  // 1페이지 메인 액션
  if (page === 1 && inside(baseMouseX, baseMouseY, BASE_W/2 - 80, 410, 160, 50)) {
    setPage(2);
    return;
  }

  // 2페이지 메인 액션
  if (page === 2) {
    if (inside(baseMouseX, baseMouseY, 55, 70, 135, 50)) { inputMode = "waveform"; return; }
    if (inside(baseMouseX, baseMouseY, 200, 70, 135, 50)) { inputMode = "shape"; syncShapeBlocks(); return; }
    if (inside(baseMouseX, baseMouseY, 345, 70, 90, 50)) { clearInput(); showMessage("입력을 모두 지웠습니다."); return; }

    if (dist(baseMouseX, baseMouseY, 520, 95) < 18) { noteLength = constrain(noteLength - 1, noteLengthMin, noteLengthMax); syncShapeBlocks(); return; }
    if (dist(baseMouseX, baseMouseY, 600, 95) < 18) { noteLength = constrain(noteLength + 1, noteLengthMin, noteLengthMax); syncShapeBlocks(); return; }

    if (inside(baseMouseX, baseMouseY, 645, 70, 300, 50)) {
      if (inputMode === "waveform" && drawnPoints.length < 10) { showMessage("먼저 파형을 조금 그려주세요"); return; }
      if (inputMode === "shape" && shapeBlocks.length < 2) { showMessage("도형을 조금 조절해 주세요"); return; }
      startMusicGeneration();
      return;
    }

    if (inside(baseMouseX, baseMouseY, drawArea.x, drawArea.y, drawArea.w, drawArea.h)) {
      if (inputMode === "waveform") { drawnPoints.push({ x: baseMouseX, y: baseMouseY }); } 
      else {
        selectedShapeIndex = findShapeIndexUnderMouse(baseMouseX, baseMouseY);
        if (selectedShapeIndex === -1) selectedShapeIndex = nearestShapeIndex(baseMouseX, baseMouseY);
      }
      return;
    }
  }

  // 5페이지 메인 액션
  if (page === 5 && inside(baseMouseX, baseMouseY, BASE_W/2 - 80, 420, 160, 50)) {
    setPage(6);
    return;
  }

  // 6페이지 버튼 및 타임라인 제어 박스 액션
  if (page === 6) {
    let btnW = 160;
    let btnH = 50;
    let btnX = 740; 
    let btnY = 440;
    
    // 다시 만들기 버튼
    if (inside(baseMouseX, baseMouseY, btnX, btnY, btnW, btnH)) {
      clearInput();
      releaseGeneratedAudioUrl();
      generatedSequence = [];
      generatedAudioBlob = null;
      generatedImageUrl = "";
      generatedImage = null;
      generationState = "idle";
      generationStarted = false;
      stopPlayback();
      
      if (htmlAudioPlayer) {
        htmlAudioPlayer.stop();
        htmlAudioPlayer.hide();
      }
      
      setPage(2);
      return;
    }
  }

  let btnBoxY = 320;
    
    // 재생, 일시정지 버튼
  if (inside(baseMouseX, baseMouseY, 110, btnBoxY + 35, 140, 50)) {
    if (isPlaying) {
      isPlaying = false;
      if (audioPlayer) audioPlayer.pause();
      showMessage("재생을 일시 정지했습니다.");
    } else {
      startPlayback();
    }
    return;
  }

  // 다운로드 버튼
  if (inside(baseMouseX, baseMouseY, 410, btnBoxY + 35, 140, 50)) { downloadResult(); return; }

  // 공유하기 버튼
  if (inside(baseMouseX, baseMouseY, 570, btnBoxY + 35, 140, 50)) { shareResult(); return; }

  // 다시 만들기 버튼
  if (inside(baseMouseX, baseMouseY, 730, btnBoxY + 35, 140, 50)) {
    clearInput();
    releaseGeneratedAudioUrl();
    generatedSequence = [];
    generatedAudioBlob = null;

    generatedImageUrl = "";
    generatedImage = null;

    generationState = "idle";
    generationStarted = false;
    stopPlayback();
    setPage(2);
    return;
  }
}

function mouseDragged() {
  updateLayout();

  if (page !== 2) return;

  if (inputMode === "waveform") {
    if (inside(baseMouseX, baseMouseY, drawArea.x, drawArea.y, drawArea.w, drawArea.h)) {
      drawnPoints.push({ x: baseMouseX, y: baseMouseY });
    }
  } else {
    if (selectedShapeIndex !== -1) {
      shapeBlocks[selectedShapeIndex].y = constrain(
        baseMouseY,
        drawArea.y + 20,
        drawArea.y + drawArea.h - 20
      );
    }
  }
}

function mouseReleased() {
  selectedShapeIndex = -1;
}

function setPage(newPage) {
  // 6페이지를 벗어날 때 HTML 플레이어 숨기기 및 정지
  if (page === 6 && newPage !== 6 && htmlAudioPlayer) {
    try {
      htmlAudioPlayer.stop();
      htmlAudioPlayer.hide();
    } catch (e) {}
  }
  
  if (newPage !== 6) stopPlayback();

  page = newPage;
  pageStartMillis = millis();

  if (page === 4) {
    generationProgress = 0;
    generationStarted = false;
    generationStartMillis = millis();
  }
}

function drawLargeCard() {
  drawingContext.shadowBlur = 30;
  drawingContext.shadowColor = "rgba(60, 80, 120, 0.08)";
  noStroke();
  fill(248, 250, 253);
  rect(20, 20, BASE_W - 40, BASE_H - 40, 24);
  drawingContext.shadowBlur = 0;
  
  stroke(228, 233, 240);
  strokeWeight(1.5);
  noFill();
  rect(20, 20, BASE_W - 40, BASE_H - 40, 24);
}

function drawCard(x, y, w, h) {
  drawingContext.shadowBlur = 24;
  drawingContext.shadowColor = "rgba(60, 80, 120, 0.12)";
  noStroke();
  fill(255);
  rect(x, y, w, h, 24);
  drawingContext.shadowBlur = 0;
  stroke(224, 229, 236);
  strokeWeight(1.4);
  noFill();
  rect(x, y, w, h, 24);
}

// Page 1 (페이지 1)
function drawPage1() {
  drawLargeCard();
  
  // 배경 장식
  noStroke();
  fill(55, 125, 255, 12);
  ellipse(BASE_W * 0.2, BASE_H * 0.3, 220, 220);
  fill(255, 95, 105, 10);
  ellipse(BASE_W * 0.8, BASE_H * 0.7, 280, 280);
  
  noFill();
  stroke(45, 195, 225, 30);
  strokeWeight(2);

  drawSmallSparkle(BASE_W / 2, 100, 20);
  
  textAlign(CENTER, CENTER);
  noStroke();
  textStyle(BOLD);
  textSize(65); 
  fill(25, 29, 38);
  text("RHYTHMIX", BASE_W / 2, 177);
  
  textStyle(NORMAL);
  textSize(15);
  fill(112, 120, 132);
  text("Team 듣보", BASE_W / 2, 225);

  textStyle(BOLD);
  textSize(24);
  fill(35, 40, 50);
  text("Visual Sound Making Service", BASE_W / 2, 290);
  
  textStyle(NORMAL);
  textSize(15);
  fill(115, 123, 135);
  text("자신만의 파형을 직접 그려보세요!", BASE_W / 2, 335);
  text("RHYTHMIX AI를 이용해 음악을 만들어드립니다.", BASE_W / 2, 360);

  let hover = inside(baseMouseX, baseMouseY, BASE_W/2 - 80, 410, 160, 50);
  fill(hover ? color(230, 45, 60) : color(255, 65, 85));
  noStroke();
  rect(BASE_W/2 - 80, 410, 160, 50, 14);

  fill(255);
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(18);
  text("시작하기", BASE_W/2 - 10, 435); 

  push();
  translate(BASE_W/2 + 45, 435);
  stroke(255);
  strokeWeight(2.5);
  noFill();
  strokeCap(ROUND);
  strokeJoin(ROUND);
  beginShape(); vertex(-4, -5); vertex(2, 0); vertex(-4, 5); endShape();
  pop();
}

// Page 2 (페이지 2)
function drawPage2() {
  drawCard(35, 35, 930, 490);
  drawPage2Toolbar();
  drawPage2DrawingPanel();
}

function drawPage2Toolbar() {
  drawCompactModeButton(55, 70, 135, 50, inputMode === "waveform", "wave", "직접 그리기");
  drawCompactModeButton(200, 70, 135, 50, inputMode === "shape", "shape", "블록 조절");
  drawCompactModeButton(345, 70, 90, 50, false, "clear", "지우기");
  
  drawToolbarLengthPanel();
  drawToolbarGenerateButton();
}

function drawCompactModeButton(x, y, w, h, active, type, label) {
  let hover = inside(baseMouseX, baseMouseY, x, y, w, h);
  
  if (type === "clear") {
    fill(hover ? color(255, 95, 105) : color(245, 247, 252));
    stroke(hover ? color(255, 95, 105) : color(210, 216, 225));
    strokeWeight(1.5);
    rect(x, y, w, h, 8);
    
    noStroke();
    fill(hover ? 255 : color(112, 120, 132));
    textAlign(CENTER, CENTER);
    textStyle(BOLD);
    textSize(14);
    text(label, x + w/2, y + h/2);
    return;
  }

  fill(active ? color(55, 125, 255, 15) : (hover ? color(248, 250, 253) : color(255)));
  stroke(active ? color(55, 125, 255) : color(210, 216, 225));
  strokeWeight(active ? 2 : 1.5);
  rect(x, y, w, h, 8);

  let iconX = x + 24;
  let cy = y + h/2;

  if (type === "wave") drawCompactWaveIcon(iconX, cy, active || hover);
  if (type === "shape") drawCompactBarIcon(iconX, cy, active || hover);

  noStroke();
  fill(active ? color(55, 125, 255) : color(35, 40, 50));
  textAlign(LEFT, CENTER);
  textStyle(BOLD);
  textSize(14);
  text(label, x + 44, cy);
}

function drawCompactWaveIcon(cx, cy, active) {
  push();
  translate(cx, cy);
  noFill();
  stroke(active ? color(55, 125, 255) : color(150, 158, 170));
  strokeWeight(2.5);
  beginShape();
  for(let i = -12; i <= 12; i += 3) curveVertex(i, sin(i * 0.3) * 6);
  endShape();
  noStroke();
  fill(active ? color(255, 95, 105) : color(150, 158, 170));
  ellipse(12, sin(12 * 0.3) * 6, 5, 5);
  pop();
}

function drawCompactBarIcon(cx, cy, active) {
  push();
  translate(cx, cy);
  noStroke();
  let cOn = active ? color(55, 125, 255) : color(150, 158, 170);
  let cOff = active ? color(55, 125, 255, 30) : color(225, 230, 235);
  
  fill(cOff); rect(-10, -6, 5, 12, 2);
  fill(cOn);  rect(-10, 0, 5, 6, 2);
  fill(cOff); rect(-2, -6, 5, 12, 2);
  fill(active ? color(45, 195, 225) : color(120, 128, 140)); rect(-2, -2, 5, 8, 2);
  fill(cOff); rect(6, -6, 5, 12, 2);
  fill(active ? color(255, 95, 105) : color(180, 185, 190)); rect(6, -4, 5, 10, 2);
  pop();
}

function drawToolbarLengthPanel() {
  noStroke();
  fill(248, 250, 253);
  rect(450, 70, 180, 50, 8);
  stroke(225, 230, 238);
  strokeWeight(1.5);
  noFill();
  rect(450, 70, 180, 50, 8);

  noStroke();
  fill(112, 120, 132);
  textAlign(LEFT, CENTER);
  textStyle(BOLD);
  textSize(13);
  text("음길이", 465, 95);

  fill(35, 40, 50);
  textAlign(CENTER, CENTER);
  textSize(22);
  text(String(noteLength), 560, 96);

  drawCompactArrow(520, 95, false);
  drawCompactArrow(600, 95, true);
}

function drawCompactArrow(cx, cy, isRight) {
  let hover = dist(baseMouseX, baseMouseY, cx, cy) < 14;
  noFill();
  stroke(hover ? color(255, 95, 105) : color(180, 185, 190));
  strokeWeight(2);
  ellipse(cx, cy, 24, 24);

  noStroke();
  fill(hover ? color(255, 95, 105) : color(150, 158, 170));
  push();
  translate(cx, cy);
  if (isRight) triangle(-3, -4, -3, 4, 4, 0);
  else triangle(3, -4, 3, 4, -4, 0);
  pop();
}

function drawToolbarGenerateButton() {
  let hover = inside(baseMouseX, baseMouseY, 645, 70, 300, 50);
  
  fill(hover ? color(230, 45, 60) : color(255, 65, 85));
  noStroke();
  rect(645, 70, 300, 50, 12);
  
  push();
  translate(735, 95);
  fill(255);
  noStroke();
  beginShape();
  vertex(0, -9);
  quadraticVertex(2, -2, 9, 0);
  quadraticVertex(2, 2, 0, 9);
  quadraticVertex(-2, 2, -9, 0);
  quadraticVertex(-2, -2, 0, -9);
  endShape(CLOSE);
  pop();
  
  fill(255);
  textAlign(LEFT, CENTER);
  textStyle(BOLD);
  textSize(17);
  text("음악 생성하기", 755, 95);
}

function drawPage2DrawingPanel() {
  noFill();
  stroke(35, 40, 50);
  strokeWeight(2.5);
  rect(drawArea.x, drawArea.y, drawArea.w, drawArea.h, 8);

  let baseline = drawArea.y + drawArea.h / 2;

  stroke(55, 125, 255);
  strokeWeight(2);
  line(drawArea.x + 22, baseline, drawArea.x + drawArea.w - 44, baseline);

  stroke(230, 230, 230);
  strokeWeight(1);
  for (let i = 1; i < 6; i++) {
    let gx = drawArea.x + (drawArea.w / 6) * i;
    line(gx, drawArea.y + 20, gx, drawArea.y + drawArea.h - 20);
  }
  for (let j = 1; j < 4; j++) {
    let gy = drawArea.y + (drawArea.h / 4) * j;
    line(drawArea.x + 20, gy, drawArea.x + drawArea.w - 20, gy);
  }

  if (inputMode === "waveform" && drawnPoints.length < 2) {
    noStroke();
    fill(185, 190, 196);
    textAlign(CENTER, CENTER);
    textStyle(NORMAL);
    textSize(19);
    text("마우스를 드래그하여 원하는 파형을 그려보세요!", 500, baseline + 80);

    noFill();
    stroke(215, 215, 215);
    strokeWeight(3);
    beginShape();
    for (let i = 0; i <= 80; i++) {
      let x = map(i, 0, 80, drawArea.x + 90, drawArea.x + drawArea.w - 240);
      let y = baseline + sin(i * 0.2 + wavePhase) * 45; 
      curveVertex(x, y);
    }
    endShape();
  }

  if (inputMode === "waveform") {
    noStroke();
    fill(150, 160, 170);
    textAlign(RIGHT, CENTER);
    textStyle(NORMAL);
    textSize(14);
    text("기준음", drawArea.x + drawArea.w - 20, baseline - 12);
    
    drawUserWaveform();
  } else {
    drawModernShapeBlocks();
  }

  // 공통 안내 텍스트
  fill(112, 120, 132);
  textAlign(LEFT, CENTER);
  textSize(12);
  text("낮은 음", drawArea.x + 18, drawArea.y + drawArea.h - 18);
  text("높은 음", drawArea.x + 18, drawArea.y + 18);
  textAlign(RIGHT, CENTER);
  text("시간 흐름 →", drawArea.x + drawArea.w - 18, drawArea.y + drawArea.h - 18);
}

function drawUserWaveform() {
  if (drawnPoints.length < 2) return;

  noFill();
  stroke(45, 195, 225);
  strokeWeight(4);
  beginShape();
  for (let i = 0; i < drawnPoints.length; i++) {
    curveVertex(drawnPoints[i].x, drawnPoints[i].y);
  }
  endShape();

  for (let i = 0; i < drawnPoints.length; i += 10) {
    noStroke();
    fill(255, 95, 105, 150);
    ellipse(drawnPoints[i].x, drawnPoints[i].y, 5, 5);
  }
}

function syncShapeBlocks() {
  let defaultY = drawArea.y + drawArea.h / 2;

  while (shapeBlocks.length < noteLength) {
    shapeBlocks.push({ y: defaultY });
  }
  while (shapeBlocks.length > noteLength) {
    shapeBlocks.pop();
  }
}

function drawModernShapeBlocks() {
  syncShapeBlocks();
  let count = shapeBlocks.length;
  if (count < 1) return;

  let gap = 10;
  let bw = max(8, (drawArea.w - 60 - gap * (count - 1)) / count); // 너비를 살짝 더 슬림하게

  for (let i = 0; i < count; i++) {
    let b = shapeBlocks[i];
    let h = map(b.y, drawArea.y + drawArea.h - 20, drawArea.y + 20, drawArea.h * 0.15, drawArea.h * 0.85);
    h = constrain(h, 30, drawArea.h * 0.82);

    let x = drawArea.x + 30 + i * (bw + gap);
    let y = drawArea.y + drawArea.h / 2 - h / 2;

    let hover = inside(baseMouseX, baseMouseY, x, y, bw, h);

    noStroke();
    fill(hover ? color(255, 95, 105) : color(55, 125, 255, 200));
    rect(x, y, bw, h, bw/2);

  }
}

function nearestShapeIndex(mx, my) {
  if (shapeBlocks.length === 0) return -1;

  let count = shapeBlocks.length;
  let gap = 10;
  let bw = max(8, (drawArea.w - 60 - gap * (count - 1)) / count);

  let bestIndex = 0;
  let bestDist = Infinity;

  for (let i = 0; i < count; i++) {
    let b = shapeBlocks[i];
    let h = map(b.y, drawArea.y + drawArea.h - 20, drawArea.y + 20, drawArea.h * 0.15, drawArea.h * 0.85);
    h = constrain(h, 30, drawArea.h * 0.82);

    let x = drawArea.x + 30 + i * (bw + gap);
    let y = drawArea.y + drawArea.h / 2 - h / 2;
    let cx = x + bw / 2;
    let cy = y + h / 2;
    let d = dist(mx, my, cx, cy);

    if (d < bestDist) {
      bestDist = d;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function findShapeIndexUnderMouse(mx, my) {
  let count = shapeBlocks.length;
  let gap = 10;
  let bw = max(8, (drawArea.w - 60 - gap * (count - 1)) / count);

  for (let i = 0; i < count; i++) {
    let b = shapeBlocks[i];
    let h = map(b.y, drawArea.y + drawArea.h - 20, drawArea.y + 20, drawArea.h * 0.15, drawArea.h * 0.85);
    h = constrain(h, 30, drawArea.h * 0.82);

    let x = drawArea.x + 30 + i * (bw + gap);
    let y = drawArea.y + drawArea.h / 2 - h / 2;

    if (inside(mx, my, x, y, bw, h)) return i;
  }
  return -1;
}

function clearInput() {
  drawnPoints = [];
  shapeBlocks = [];
  syncShapeBlocks();
}

// Page 3 (페이지 3)
function drawPage3() {
  drawLargeCard();
  drawPage3Header();
  drawAnalysisPanel();
  drawAnalysisResultCards();
  drawAnalysisAutoNotice();
}

function drawPage3Header() {
  drawSmallSparkle(BASE_W/2, 80, 16); 
  textAlign(CENTER, CENTER);
  noStroke();
  textStyle(BOLD);
  textSize(36); 
  fill(25, 29, 38);
  text("음악 분석 중", BASE_W/2, 135);
  
  textStyle(NORMAL);
  textSize(16);
  fill(112, 120, 132);
  text("사용자가 그린 파형의 흐름을 추출합니다", BASE_W/2, 180);
}

function drawAnalysisPanel() {
  noStroke();
  fill(250, 252, 255);
  rect(BASE_W/2 - 300, 210, 600, 150, 20); 
  stroke(228, 233, 240);
  strokeWeight(1.3);
  noFill();
  rect(BASE_W/2 - 300, 210, 600, 150, 20);

  let gridX = BASE_W/2 - 270, gridY = 230, gridW = 540, gridH = 110;
  
  drawAnalysisGrid(gridX, gridY, gridW, gridH);
  drawDetectedWave(gridX, gridY + gridH/2, gridW, gridH * 0.9);
  drawAnalysisDataPoints(gridX, gridY + gridH/2, gridW, gridH * 0.9);
  drawScanLine(gridX, gridY - 10, gridW, gridH + 20);
}

// 1. 그리드 배경 드로잉 함수
function drawAnalysisGrid(x, y, w, h) {
  stroke(225, 230, 238, 100); 
  strokeWeight(1);
  for (let i = 0; i <= 6; i++) {
    let gx = x + (w / 6) * i;
    line(gx, y, gx, y + h);
  }
  for (let j = 0; j <= 4; j++) {
    let gy = y + (h / 4) * j;
    line(x, gy, x + w, gy);
  }
}

// 2. 파형 추출 시각화 함수
function drawDetectedWave(x, y, w, h) {
  let values = getInputValuesForSequence();
  if (values.length < 2) return;

  noFill();
  stroke(55, 125, 255, 30);
  strokeWeight(6);
  beginShape();
  for (let i = 0; i < values.length; i++) {
    let px = map(i, 0, values.length - 1, x, x + w);
    let py = map(values[i], 0, 1, y + h * 0.45, y - h * 0.45);
    curveVertex(px, py);
  }
  endShape();

  stroke(45, 195, 225);
  strokeWeight(3.5);
  beginShape();
  for (let i = 0; i < values.length; i++) {
    let px = map(i, 0, values.length - 1, x, x + w);
    let py = map(values[i], 0, 1, y + h * 0.45, y - h * 0.45);
    curveVertex(px, py);
  }
  endShape();
}

// 3. 스캔 라인 드로잉 함수
function drawScanLine(x, y, w, h) {
  let sx = x + analyzeProgress * w;
  noStroke();
  for(let i=0; i<15; i++) {
    fill(255, 95, 105, 30 - i * 2);
    rect(sx - (i+2), y, i+2, h, 2);
  }
  stroke(255, 95, 105);
  strokeWeight(2.5);
  line(sx, y, sx, y + h);
  noStroke();
  fill(255, 95, 105);
  ellipse(sx, y, 6, 6);
  ellipse(sx, y + h, 6, 6);
}

// 4. 스캔 위치에 따른 데이터 포인트 드로잉 함수
function drawAnalysisDataPoints(x, y, w, h) {
  let values = getInputValuesForSequence();
  if (values.length < 10) return;

  let scanX = x + analyzeProgress * w;
  noStroke();

  for (let i = 0; i < values.length; i++) {
    let px = map(i, 0, values.length - 1, x, x + w);
    let py = map(values[i], 0, 1, y + h * 0.45, y - h * 0.45);
    let distToScanner = abs(px - scanX);
    
    if (distToScanner < 30) {
      let alpha = map(distToScanner, 0, 30, 200, 0);
      fill(55, 125, 255, alpha);
      let size = 4 + sin(frameCount * 0.2 + i) * 2;
      ellipse(px, py + random(-2, 2), size, size); 
    } else if (px < scanX) {
      fill(180, 185, 190, 80);
      ellipse(px, py, 2.5, 2.5);
    }
  }
}

// 5. 하단 상태 카드 레이아웃 배치 함수
function drawAnalysisResultCards() {
  let totalW = 600;
  let gap = 20;
  let boxW = (totalW - gap * 2) / 3;
  let startX = BASE_W/2 - 300;
  let boxY = 390;
  let boxH = 65;

  drawCompactStatusCard(startX, boxY, boxW, boxH, "Data", "음 높이 및 길이 계산", "진행");
  drawCompactStatusCard(startX + boxW + gap, boxY, boxW, boxH, "Pattern", "리듬 패턴 추출", "진행");
  drawCompactStatusCard(startX + (boxW + gap) * 2, boxY, boxW, boxH, "Organization", "소리 구조화", "진행");
}

function drawCompactStatusCard(x, y, w, h, title, desc, state) {
  let isComplete = state === "완료";
  let colorTheme = isComplete ? color(45, 195, 225) : color(255, 95, 105);

  stroke(228, 233, 240);
  strokeWeight(1.3);
  fill(isComplete ? color(248, 250, 253) : 255);
  rect(x, y, w, h, 14);

  push();
  translate(x + 24, y + h/2);
  if (isComplete) {
    stroke(colorTheme);
    strokeWeight(2.5);
    noFill();
    strokeCap(ROUND); strokeJoin(ROUND);
    beginShape(); vertex(-6, 0); vertex(-2, 4); vertex(6, -4); endShape();
  } else {
    noFill();
    stroke(210, 216, 225); strokeWeight(2.5);
    ellipse(0, 0, 14, 14);
    stroke(colorTheme);
    arc(0, 0, 14, 14, frameCount * 0.1, frameCount * 0.1 + PI);
  }
  pop();

  textAlign(LEFT, TOP);
  noStroke();
  textStyle(BOLD);
  textSize(15);
  fill(25, 29, 38);
  text(title, x + 45, y + 15);
  
  textStyle(NORMAL);
  textSize(12);
  fill(115, 123, 135);
  text(desc, x + 45, y + 36);

  textAlign(RIGHT, CENTER);
  textStyle(BOLD);
  textSize(12);
  fill(colorTheme);
  text(state, x + w - 18, y + 20);
}

// 7. 최하단 안내 메시지 및 도트 애니메이션 함수
function drawAnalysisAutoNotice() {
  noStroke();
  fill(150, 158, 170);
  textAlign(CENTER, CENTER);
  textStyle(NORMAL);
  textSize(14);
  text("데이터를 합성 중입니다", BASE_W/2, 485);

  for(let i=0; i<3; i++) {
    let size = 5 + sin(frameCount * 0.1 + i * 0.5) * 2;
    fill(45, 195, 225, map(size, 3, 7, 50, 200));
    ellipse(BASE_W/2 - 15 + i * 15, 505, size, size);
  }
}

// Page 4 (페이지 4)
function drawPage4() {
  drawLargeCard();
  drawPage4Header();
  drawPage4VisualArea();
  drawPage4ProcessTimeline();
}

function drawPage4Header() {
  drawSmallSparkle(BASE_W/2, 85, 18);
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(36);
  fill(55, 125, 255); 
  noStroke();
  text("오디오 생성 중", BASE_W/2, 146);
  
  textStyle(NORMAL);
  textSize(16);
  fill(112, 120, 132);
  text("분석된 데이터를 바탕으로 실제 음악을 생성하고 있습니다. 잠시만 기다려주세요!", BASE_W/2, 187);
}

function drawPage4VisualArea() {
  noStroke();
  fill(250, 252, 255);
  rect(BASE_W/2 - 250, 225, 500, 180, 20); 
  stroke(228, 233, 240);
  strokeWeight(1.3);
  noFill();
  rect(BASE_W/2 - 250, 225, 500, 180, 20);

  stroke(225, 230, 238, 50);
  for(let x = BASE_W/2 - 230; x < BASE_W/2 + 230; x += 20) line(x, 225, x, 405);
  for(let y = 245; y < 405; y += 20) line(BASE_W/2 - 250, y, BASE_W/2 + 250, y);

  let cx = BASE_W/2, cy = 315;
  drawGeneratingStream(BASE_W/2 - 230, cy, 460, 70);
  drawMinimalProgressNode(cx, cy, 75); 
}

function drawGeneratingStream(x, y, w, h) {
  noFill();
  stroke(45, 195, 225, 100);
  strokeWeight(1.5);
  beginShape();
  for(let i=0; i<=50; i++) {
    let px = map(i, 0, 50, x, x + w);
    let py = y + sin(i * 0.2 + frameCount * 0.08) * h * 0.3 + sin(i * 0.05 + wavePhase) * h * 0.2;
    curveVertex(px, py);
  }
  endShape();
  
  noStroke();
  for(let i=0; i<30; i++) {
    let idx = (frameCount + i * 5) % 50;
    let px = map(idx, 0, 50, x, x + w);
    let py = y + sin(idx * 0.2 + frameCount * 0.08) * h * 0.3 + sin(idx * 0.05 + wavePhase) * h * 0.2;
    let size = 3 + sin(i + frameCount * 0.2) * 1.5;
    fill(i % 2 === 0 ? color(55, 125, 255, 180) : color(255, 95, 105, 180));
    ellipse(px, py, size, size);
  }
}

function drawMinimalProgressNode(cx, cy, r) {
  drawingContext.shadowBlur = 15;
  drawingContext.shadowColor = "rgba(60, 80, 120, 0.12)";
  noStroke();
  fill(255);
  ellipse(cx, cy, r * 2, r * 2);
  drawingContext.shadowBlur = 0;

  noFill();
  stroke(228, 233, 240);
  strokeWeight(5);
  ellipse(cx, cy, r * 2 - 5, r * 2 - 5);
  
  stroke(255, 95, 105);
  strokeWeight(5);
  strokeCap(ROUND);
  arc(cx, cy, r * 2 - 5, r * 2 - 5, -HALF_PI, -HALF_PI + generationProgress * TWO_PI);

  noStroke();
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(28);
  fill(25, 29, 38);
  text(int(generationProgress * 100) + "%", cx, cy - 1);
  
  noFill();
  stroke(55, 125, 255, 60);
  strokeWeight(2);
  arc(cx, cy, 80, 80, spinAngle, spinAngle + PI * 0.6);
  arc(cx, cy, 80, 80, spinAngle + PI, spinAngle + PI * 1.6);
}

function drawPage4ProcessTimeline() {
  let cx = BASE_W/2;
  let y = 455;
  let steps = ["Waveform", "Analysis", "Synthesis", "Mixing"];
  let totalW = 460;
  let gap = totalW / (steps.length - 1);
  let currentStep = floor(generationProgress * (steps.length - 0.01));

  textAlign(CENTER, CENTER);
  for (let i = 0; i < steps.length; i++) {
    let tx = cx - totalW/2 + i * gap;
    let isActive = i <= currentStep;
    
    noStroke();
    fill(isActive ? color(55, 125, 255) : color(220, 225, 230));
    ellipse(tx, y, isActive ? 12 : 8, isActive ? 12 : 8);
    if(isActive) {
      fill(55, 125, 255, 50);
      ellipse(tx, y, 18 + sin(frameCount * 0.1) * 4, 18 + sin(frameCount * 0.1) * 4);
    }
    
    if(i < steps.length - 1) {
      stroke(isActive && i < currentStep ? color(55, 125, 255) : color(228, 233, 240));
      strokeWeight(isActive && i < currentStep ? 2.5 : 2);
      line(tx + gap * 0.1, y, tx + gap * 0.9, y);
      
      noStroke();
      fill(i < currentStep ? color(55, 125, 255) : color(210, 210, 220));
      triangle(tx + gap * 0.88, y - 4, tx + gap * 0.88, y + 4, tx + gap * 0.93, y);
    }

    noStroke();
    textStyle(isActive ? BOLD : NORMAL);
    textSize(13);
    fill(isActive ? color(35, 40, 50) : color(150, 158, 170));
    text(steps[i], tx, y + 25);
  }
}

// Page 5 (페이지 5)
function drawPage5() {
  drawLargeCard();
  drawPage5Header();
  
  // 중앙 앨범 커버 영역 확대
  noStroke();
  fill(250, 252, 255);
  rect(BASE_W/2 - 250, 240, 500, 160, 24);
  stroke(228, 233, 240);
  strokeWeight(1.3);
  noFill();
  rect(BASE_W/2 - 250, 240, 500, 160, 24);
  
  // 앨범 아트 그리기
  drawAlbumCover(BASE_W/2 - 220, 255, 130);
  
  // 결과 텍스트 영역
  noStroke();
  textAlign(LEFT, CENTER);
  textStyle(BOLD);
  textSize(28);
  fill(25, 29, 38);
  text("MUSIC RESULT", BASE_W/2 - 30, 310);
  
  textStyle(NORMAL);
  textSize(15);
  fill(115, 123, 135);
  text("그린 파형이 녹아있는 음악", BASE_W/2 - 30, 340);

  // 결과 확인 버튼
  let hover = inside(baseMouseX, baseMouseY, BASE_W/2 - 80, 440, 160, 50);
  fill(hover ? color(255, 75, 90) : color(255, 95, 105));
  noStroke();
  rect(BASE_W/2 - 80, 440, 160, 50, 25);
  fill(255);
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(16);
  text("음악 듣기 →", BASE_W/2, 465);
}

function drawPage5Header() {
  drawSmallSparkle(BASE_W/2, 100, 18);
  fill(25, 29, 38);
  noStroke();
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(38);
  text("음악 생성 완료!", BASE_W/2, 165);
  textSize(15);
  textStyle(NORMAL);
  text("Music is successfully generated!", BASE_W/2, 206);
}

function drawAlbumCover(x, y, size) {
  // 바이닐 레코드 디스크
  fill(25, 29, 38);
  ellipse(x + size * 0.85, y + size / 2, size * 0.9, size * 0.9);
  noFill();
  stroke(45, 50, 60);
  strokeWeight(1);
  ellipse(x + size * 0.85, y + size / 2, size * 0.75, size * 0.75);
  ellipse(x + size * 0.85, y + size / 2, size * 0.55, size * 0.55);
  noStroke();
  fill(55, 125, 255);
  ellipse(x + size * 0.85, y + size / 2, size * 0.3, size * 0.3);
  fill(25, 29, 38);
  ellipse(x + size * 0.85, y + size / 2, size * 0.05, size * 0.05);

  // 앨범 아트 사각형
  drawingContext.save();
  drawingContext.shadowBlur = 15;
  drawingContext.shadowColor = "rgba(0,0,0,0.15)";
  fill(255);
  rect(x, y, size, size, 12);
  drawingContext.restore();

  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.roundRect(x, y, size, size, 12);
  drawingContext.clip();

  fill(245, 247, 252);
  rect(x, y, size, size);

  noStroke();
  fill(55, 125, 255, 200);
  ellipse(x + size * 0.2, y + size * 0.8, size * 0.9);
  fill(45, 195, 225, 180);
  ellipse(x + size * 0.8, y + size * 0.2, size * 0.7);

  noFill();
  stroke(255);
  strokeWeight(3);
  beginShape();
  for(let i=0; i<=size; i+=5) {
    let px = x + i;
    let py = y + size/2 + sin(i * 0.05 + wavePhase) * 15;
    curveVertex(px, py);
  }
  endShape();
  drawingContext.restore();

  noFill();
  stroke(228, 233, 240);
  strokeWeight(1);
  rect(x, y, size, size, 12);
}

// Page 6 (페이지 6)
function drawPage6() {
  drawLargeCard();
  
  textAlign(CENTER, CENTER);
  fill(25, 29, 38);
  noStroke();
  textSize(34);
  textStyle(BOLD);
  text("음악 플레이어", BASE_W/2, 100);
  
  textSize(16);
  fill(112, 120, 132);
  textStyle(NORMAL);
  text("RHYTHMIX AI가 생성한 실제 음악을 감상하세요", BASE_W/2, 140);

  fill(250, 252, 255);
  stroke(228, 233, 240);
  strokeWeight(1.5);
  rect(100, 190, 800, 140, 12);

  let imgSize = 100;
  let imgX = 120;
  let imgY = 210;

  if (generatedImage) {
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.roundRect(imgX, imgY, imgSize, imgSize, 8);
    drawingContext.clip();
    image(generatedImage, imgX, imgY, imgSize, imgSize);
    drawingContext.restore();
  } else {
    // 이미지가 없을 때 임시 박스
    fill(235, 240, 245);
    noStroke();
    rect(imgX, imgY, imgSize, imgSize, 8);
    fill(150, 160, 170);
    textSize(14);
    textAlign(CENTER, CENTER);
    text("No Image", imgX + imgSize/2, imgY + imgSize/2);
  }

  // 오디오 세팅
  if (generatedAudioUrl) {
    if (!htmlAudioPlayer) {
      htmlAudioPlayer = createAudio(generatedAudioUrl);
      htmlAudioPlayer.showControls();
    } else {
      if (htmlAudioPlayer.elt.src !== generatedAudioUrl && !htmlAudioPlayer.elt.src.includes(generatedAudioUrl)) {
        htmlAudioPlayer.elt.src = generatedAudioUrl;
      }
    }
    
    let playerWidth = 630 * scaleFactor; 
    let playerX = offsetX + (240 * scaleFactor);
    let playerY = offsetY + (245 * scaleFactor);

    htmlAudioPlayer.position(playerX, playerY);
    htmlAudioPlayer.style('width', playerWidth + 'px');
    htmlAudioPlayer.show();
  } else {
    fill(255, 95, 105);
    textAlign(LEFT, CENTER);
    textSize(16);
    text("오디오를 불러오는 중입니다...", 240, 260);
  }

  // 다운로드 안내 텍스트
  fill(112, 120, 132);
  noStroke();
  textAlign(LEFT, CENTER);
  textStyle(NORMAL);
  textSize(13);
  text("음악을 저장하고 싶다면? 점 세개(⋮)를 눌러 다운로드 버튼을 클릭하세요!", 110, 360);

  // 다시 만들기 버튼
  let btnW = 160;
  let btnH = 50;
  let btnX = 740;
  let btnY = 440;

  let hover = inside(baseMouseX, baseMouseY, btnX, btnY, btnW, btnH);
  fill(hover ? color(75, 140, 255) : color(55, 125, 255));
  noStroke();
  rect(btnX, btnY, btnW, btnH, 8);

  fill(255);
  textAlign(CENTER, CENTER);
  textSize(16);
  textStyle(BOLD);
  text("다시 만들기", btnX + btnW/2, btnY + btnH/2);
}

function drawActionBtn(x, y, w, h, label, bg, type) {
  let hover = inside(baseMouseX, baseMouseY, x, y, w, h);

  if (type === "play") {
    fill(hover ? color(255, 75, 90) : bg);
    noStroke();
    rect(x, y, w, h, 14);
    fill(255);
  } else if (type === "remake") {
    fill(hover ? color(235, 240, 248) : bg);
    noStroke();
    rect(x, y, w, h, 14);
    fill(100, 110, 120);
  } else {
    // 다운로드, 공유하기 버튼
    fill(hover ? color(248, 250, 253) : bg);
    stroke(hover ? color(45, 195, 225) : color(220, 225, 235));
    strokeWeight(1.5);
    rect(x, y, w, h, 14);
    
    noStroke();
    fill(35, 40, 50);
  }
  
  textAlign(CENTER, CENTER);
  textSize(15);
  textStyle(BOLD);
  text(label, x + w/2, y + h/2);
}

// 음악 생성 및 API 로직
function startMusicGeneration() {
  releaseGeneratedAudioUrl();

  generatedSequence = buildMusicSequence();
  if (generatedSequence.length === 0) {
    showMessage("입력이 부족합니다.");
    return;
  }

  generationToken++;
  generationState = "working";
  generationStarted = false;
  generationPrompt = buildSunoPrompt(generatedSequence);
  generationStartMillis = millis();
  generationReadyMillis = 0;
  generationProgress = 0;
  generatedAudioBlob = null;
  generatedAudioUrl = "";

  generatedImageUrl = "";
  generateImage = null;

  setPage(3);
}

function ensureGenerationStarted() {
  if (generationStarted) return;
  generationStarted = true;
  requestMusicAsync(generationToken, generationPrompt, generatedSequence);
}

async function requestMusicAsync(token, prompt, sequence) {
  if (token !== generationToken) return;

  try {
    // 1. 내 백엔드(Render)에 음악 생성 요청
    const generateRes = await fetch(`${MY_BACKEND_URL}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!generateRes.ok) throw new Error("서버 응답 오류 (Render 백엔드 확인 필요)");
    const generateData = await generateRes.json();
    const jobId = generateData.jobId;
    if (!jobId) throw new Error("작업 ID를 받지 못했습니다.");

    let finalAudioUrl = null;
    let finalImageUrl = null;

    // 2. 내 백엔드(Render)를 통해 주기적으로 상태 확인
    for (let i = 0; i < 80; i++) {
      if (token !== generationToken) return;

      const statusRes = await fetch(`${MY_BACKEND_URL}/status?id=${jobId}`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        
        if (statusData.status === "completed" || statusData.status === "success") {
          finalAudioUrl = statusData.audioUrl;
          finalImageUrl = statusData.imageUrl;
          break;
        }
      }
      await sleep(3000);
    }

    if (!finalAudioUrl) throw new Error("시간 초과: 오디오 링크를 찾지 못했습니다.");

    // 3. 이미지 및 오디오 URL 세팅
    if (finalImageUrl) {
      generatedImageUrl = finalImageUrl;
      loadImage(finalImageUrl,
        (img) => { generatedImage = img; },
        (err) => { console.warn("이미지 불러오기 차단됨:", err); }
      );
    }

    // 4. 오디오 다이렉트 적용
    generatedAudioUrl = finalAudioUrl;

    generationState = "ready";
    generationReadyMillis = millis();
    generationProgress = 1;
    setPage(5);

  } catch (e) {
    console.error("API 연동 에러:", e);
    generationState = "error";
    generationReadyMillis = millis();
    generationProgress = 1;
    showMessage("음악 생성에 실패했습니다. 에러: " + e.message);
    setPage(5);
  }
}

async function renderFallbackBeepBlob(seq) {
  let totalDur = seq.reduce((acc, note) => acc + note.duration, 0);
  if (totalDur <= 0) totalDur = 1;
  
  let OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  let ctx = new OfflineCtx(1, Math.ceil(44100 * totalDur), 44100);
  let startTime = 0;
  
  for (let note of seq) {
    let osc = ctx.createOscillator();
    let gain = ctx.createGain();
    
    osc.type = note.type;
    osc.frequency.value = note.freq;
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    gain.gain.setValueAtTime(note.amp, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + note.duration);
    
    osc.start(startTime);
    osc.stop(startTime + note.duration);
    
    startTime += note.duration;
  }
  
  let renderedBuffer = await ctx.startRendering();
  return bufferToWaveBlob(renderedBuffer);
}

function bufferToWaveBlob(abuffer) {
  let numOfChan = abuffer.numberOfChannels;
  let length = abuffer.length * numOfChan * 2 + 44;
  let buffer = new ArrayBuffer(length);
  let view = new DataView(buffer);
  let channels = [], i, sample, offset = 0, pos = 0;
  
  function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
  function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }
  
  setUint32(0x46464952);
  setUint32(length - 8);
  setUint32(0x45564157);
  setUint32(0x20746d66);
  setUint32(16);
  setUint16(1);
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);
  setUint32(0x61746164);
  setUint32(length - pos - 4);
  
  for(i = 0; i < abuffer.numberOfChannels; i++) {
    channels.push(abuffer.getChannelData(i));
  }
  
  while(pos < length) {
    for(i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }
  return new Blob([buffer], {type: "audio/wav"});
}

function buildSunoPrompt(sequence) {
  let values = sequence.map((n) => midiToNormalized(n.midi));
  let avg = values.reduce((a, b) => a + b, 0) / max(1, values.length);
  let minV = Math.min(...values);
  let maxV = Math.max(...values);
  let range = maxV - minV;

  // 멜로디 고저차에 따른 무드 자동 매칭
  let mood = "calm, emotional, melodic";
  if (range > 0.65) mood = "dramatic, dynamic, energetic";
  else if (avg > 0.6) mood = "bright, uplifting, hopeful";
  else if (avg < 0.4) mood = "dark, deep, moody";

  // 음길이 개수에 따른 밀도 제어
  let density = "moderate";
  if (noteLength <= 8) density = "sparse";
  else if (noteLength >= 15) density = "dense";

  let contour = values.map((v) => v.toFixed(2)).join(", ");

  return [
    `[Structure: Instrumental, No Vocals, No Lyrics]`,
    `[Duration: ${noteLength} seconds, precise timing, clean fade out ending]`, // 대괄호 메타 태그로 초 단위 강조
    `Style: Modern electronic synth, polished production, ${density} texture, soft percussion, atmospheric pads, warm bass.`,
    `Mood & Contours: ${mood}.`,
    `Instruction: Create a short musical phrase inspired by a hand-drawn waveform. Follow this normalized contour data closely to shape the main melody line: [${contour}].`,
    `Ending: Conclude clearly exactly at ${noteLength} seconds with a sharp, precise, and concise musical resolution.` // 끝맺음 시간 한번 더 강조
  ].join(" ");
}

function getInputValuesForSequence() {
  if (inputMode === "waveform") {
    if (drawnPoints.length < 2) return [];
    return sampleWaveformToValues(drawnPoints, noteLength);
  }

  syncShapeBlocks();
  if (shapeBlocks.length === 0) return [];

  return shapeBlocks.map((b) => {
    let normalized = map(b.y, drawArea.y + drawArea.h, drawArea.y, 0, 1);
    return constrain(normalized, 0, 1);
  });
}

function sampleWaveformToValues(points, count) {
  let sorted = points.slice().sort((a, b) => a.x - b.x);
  let result = [];

  for (let i = 0; i < count; i++) {
    let targetX = map(
      i,
      0,
      max(1, count - 1),
      drawArea.x + 10,
      drawArea.x + drawArea.w - 10
    );
    let y = sampleYAtX(sorted, targetX);
    let normalized = map(y, drawArea.y + drawArea.h, drawArea.y, 0, 1);
    result.push(constrain(normalized, 0, 1));
  }
  return result;
}

function sampleYAtX(points, targetX) {
  if (points.length === 0) return drawArea.y + drawArea.h / 2;
  if (points.length === 1) return points[0].y;

  if (targetX <= points[0].x) return points[0].y;
  if (targetX >= points[points.length - 1].x)
    return points[points.length - 1].y;

  for (let i = 0; i < points.length - 1; i++) {
    let p1 = points[i];
    let p2 = points[i + 1];
    if (targetX >= p1.x && targetX <= p2.x) {
      let t = map(targetX, p1.x, p2.x, 0, 1);
      return lerp(p1.y, p2.y, t);
    }
  }
  return points[points.length - 1].y;
}

function buildMusicSequence() {
  let values = getInputValuesForSequence();
  if (values.length === 0) return [];

  const scale = [0, 2, 3, 5, 7, 10, 12, 15];
  const baseMidi = 50;
  const stepDur = constrain(14 / values.length, 0.35, 1.8);

  let seq = [];
  for (let i = 0; i < values.length; i++) {
    let v = values[i];
    let idx = floor(v * (scale.length - 0.001));
    idx = constrain(idx, 0, scale.length - 1);

    let midi = baseMidi + scale[idx];
    if (i % 8 === 0) midi -= 12;
    if (v > 0.78) midi += 12;
    midi = constrain(midi, 36, 84);

    seq.push({
      midi: midi,
      freq: midiToFreq(midi),
      duration: stepDur * 0.92,
      amp: 0.06 + v * 0.11,
      type: i % 3 === 0 ? "triangle" : i % 3 === 1 ? "sine" : "sawtooth",
    });
  }
  return seq;
}

function midiToFreq(midi) {
  return 440 * pow(2, (midi - 69) / 12);
}

function midiToNormalized(midi) {
  return constrain(map(midi, 36, 84, 0, 1), 0, 1);
}

// 재생 & 다운로드 & 공유

function startPlayback() {
  if (!generatedAudioUrl) {
    showMessage("먼저 음악을 생성해주세요.");
    return;
  }
  stopPlayback();

  if (!audioPlayer) {
    audioPlayer = new Audio();
  }

  audioPlayer.pause();
  audioPlayer.currentTime = 0;
  audioPlayer.src = generatedAudioUrl;
  audioPlayer.loop = false;
  audioPlayer.onended = () => {
    isPlaying = false;
  };

  audioPlayer
    .play()
    .then(() => {
      isPlaying = true;
      showMessage("재생을 시작했습니다.");
    })
    .catch((err) => {
      isPlaying = false;
      showMessage("재생 실패: " + err);
    });
}

function stopPlayback() {
  isPlaying = false;
  if (audioPlayer) {
    try {
      audioPlayer.pause();
      audioPlayer.currentTime = 0;
    } catch (e) {}
  }
}

function getCurrentPlaybackIndex() {
  if (!isPlaying || !audioPlayer || !generatedSequence || generatedSequence.length === 0) return -1;
  let pct = audioPlayer.currentTime / noteLength;
  let idx = floor(pct * generatedSequence.length);
  return constrain(idx, 0, generatedSequence.length - 1);
}

async function downloadResult() {
  try {
    let blob = await getGeneratedAudioBlob();
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "rhythmix_music.wav";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showMessage("음악 파일을 다운로드했습니다.");
      return;
    }

    if (generatedAudioUrl) {
      const a = document.createElement("a");
      a.href = generatedAudioUrl;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      a.remove();
      showMessage("새 창에서 음악 링크를 열었습니다.");
      return;
    }

    showMessage("다운로드할 음악이 없습니다.");
  } catch (err) {
    console.error(err);
    showMessage("다운로드 실패");
  }
}

async function shareResult() {
  try {
    let blob = await getGeneratedAudioBlob();
    if (blob) {
      const file = new File([blob], "rhythmix_music.wav", {
        type: "audio/wav",
      });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: "RHYTHMIX 음악",
          text: "그린 파형으로 만든 음악입니다.",
          files: [file],
        });
        showMessage("공유 창이 열렸습니다.");
        return;
      }
    }

    if (generatedAudioUrl && navigator.share) {
      await navigator.share({
        title: "RHYTHMIX 음악",
        text: "그린 파형으로 만든 음악입니다.",
        url: generatedAudioUrl,
      });
      showMessage("공유 창이 열렸습니다.");
      return;
    }

    if (generatedAudioUrl) {
      await copyText(generatedAudioUrl);
      showMessage("공유 링크를 복사했습니다.");
      return;
    }

    showMessage("공유할 음악이 없습니다.");
  } catch (err) {
    console.error(err);
    showMessage("공유 실패");
  }
}

async function getGeneratedAudioBlob() {
  if (generatedAudioBlob) return generatedAudioBlob;
  if (!generatedAudioUrl) return null;

  try {
    const response = await fetch(generatedAudioUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    generatedAudioBlob = blob;
    return blob;
  } catch (e) {
    return null;
  }
}

async function fetchAudioBlob(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("audio fetch failed");
  return await response.blob();
}

function releaseGeneratedAudioUrl() {
  if (generatedAudioUrl && generatedAudioUrl.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(generatedAudioUrl);
    } catch (e) {}
  }
  generatedAudioUrl = "";
  currentAudioObjectUrl = "";
}

async function copyText(txt) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(txt);
  }
  const ta = document.createElement("textarea");
  ta.value = txt;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  document.execCommand("copy");
  ta.remove();
}

// 공유 유틸리티들
function drawSmallSparkle(x, y, s) {
  push();
  translate(x, y);

  rotate(frameCount * 0.015);

  noStroke();
  fill(55, 125, 255, 40);
  ellipse(0, 0, s * 2.8, s * 2.8);
  fill(45, 195, 225, 70);
  ellipse(0, 0, s * 1.6, s * 1.6);

  fill(55, 125, 255);
  beginShape();
  vertex(0, -s);
  quadraticVertex(s * 0.15, -s * 0.15, s, 0);
  quadraticVertex(s * 0.15, s * 0.15, 0, s);
  quadraticVertex(-s * 0.15, s * 0.15, -s, 0);
  quadraticVertex(-s * 0.15, -s * 0.15, 0, -s);
  endShape(CLOSE);

  fill(45, 195, 225);
  beginShape();
  let innerS = s * 0.65;
  vertex(0, -innerS);
  quadraticVertex(innerS * 0.15, -innerS * 0.15, innerS, 0);
  quadraticVertex(innerS * 0.15, innerS * 0.15, 0, innerS);
  quadraticVertex(-innerS * 0.15, innerS * 0.15, -innerS, 0);
  quadraticVertex(-innerS * 0.15, -innerS * 0.15, 0, -innerS);
  endShape(CLOSE);

  fill(255);
  ellipse(0, 0, s * 0.4, s * 0.4);
  pop();

  push();
  translate(x, y);
  noStroke();
  fill(255, 95, 105, 200 + sin(frameCount * 0.1) * 55);
  ellipse(s * 1.1, -s * 0.8, s * 0.25, s * 0.25);
  fill(45, 195, 225, 200 + cos(frameCount * 0.1) * 55);
  ellipse(-s * 0.9, s * 0.9, s * 0.18, s * 0.18);
  pop();
}

function inside(mx, my, x, y, w, h) {
  return mx >= x && mx <= x + w && my >= y && my <= y + h;
}

function showMessage(txt) {
  messageText = txt;
  messageStartTime = millis();
}

function drawMessage() {
  if (messageText === "") return;
  if (millis() - messageStartTime > 1800) return;

  noStroke();
  fill(25, 29, 38, 210);
  rect(BASE_W/2 - 170, 465, 340, 36, 14);

  fill(255);
  textAlign(CENTER, CENTER);
  textStyle(NORMAL);
  textSize(14);
  text(messageText, BASE_W/2, 483);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
