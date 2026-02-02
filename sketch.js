// Game state
const isActive = (document.body && document.body.classList && document.body.classList.contains('dayone')) || window.location.pathname.endsWith('dayone.html');
let dayone = isActive;

// Images
let lightImg, boatImg, sirenImg, sleepImg;
let smokeImg, fallingBoatImg, starfishImg;

// Buttons
let buttons = []; // objects: {id, img, x,y,w,h}

// Falling objects
let falling = []; // array of {type, img, x, y, w, h, speed}
let spawnOrder = ['smoke', 'boat', 'starfish'];
let nextSpawnIndex = 0;
let spawnInterval = 5000; // 5 seconds
let lastSpawnTime = 0;

// Progress
let successCount = 0;
let requiredSuccess = 3;
let waitingForSleep = false;
let brightening = false;

function preload() {
  lightImg = loadImage('images/light_icon.png');
  boatImg = loadImage('images/boat_icon.png');
  sirenImg = loadImage('images/siren_icon.png');
  sleepImg = loadImage('images/sleep_icon.png');

  // assets for threats
  smokeImg = loadImage('images/smoke monster.png');
  fallingBoatImg = loadImage('images/boat.png');
  starfishImg = loadImage('images/starfish.avif');
}

function setup() {
  if (!isActive) {
    // Do not initialize canvas or game logic on other pages
    return;
  }
  canvas = createCanvas(windowWidth, windowHeight);
  canvas.position(0, 0);
  canvas.style('z-index', '1');
  canvas.style('position', 'fixed');
  imageMode(CORNER);

  setupButtons();
  lastSpawnTime = millis();
} 

function draw() {
  if (!isActive) return;
  clear(); // keep canvas transparent so CSS background shows through

  updateFalling();
  drawFalling();
  drawButtons();

  // spawn sequence: spawn exactly three items, one every 5s
  if (!waitingForSleep && nextSpawnIndex < spawnOrder.length) {
    if (millis() - lastSpawnTime > spawnInterval) {
      spawnNext();
      lastSpawnTime = millis();
    }
  }

  // after successCount reaches required, start brightening ocean
  if (successCount >= requiredSuccess && !brightening) {
    brightening = true;
    startBrightening();
  }
} 

function setupButtons() {
  buttons = [];
  // define button size
  const bw = min(110, width * 0.08);
  const bh = bw;
  const baseY = height - bh - 40;

  // positions are responsive
  buttons.push({id: 'smoke-light', img: lightImg, x: width * 0.18, y: baseY, w: bw, h: bh});
  buttons.push({id: 'boat-boat', img: boatImg, x: width * 0.38, y: baseY, w: bw, h: bh});
  buttons.push({id: 'siren-starfish', img: sirenImg, x: width * 0.58, y: baseY, w: bw, h: bh});
  buttons.push({id: 'sleep', img: sleepImg, x: width * 0.78, y: baseY, w: bw, h: bh});
}

function drawButtons() {
  let hovering = false;
  for (let b of buttons) {
    // draw background rounded rect
    noStroke();
    fill(255, 255, 255, 90);
    rect(b.x - 10, b.y - 10, b.w + 20, b.h + 20, 20);
    // draw icon
    image(b.img, b.x, b.y, b.w, b.h);

    // hover detection for cursors
    if (mouseX >= b.x && mouseX <= b.x + b.w && mouseY >= b.y && mouseY <= b.y + b.h) {
      hovering = true;
    }
  }
  if (hovering) cursor(HAND); else cursor(ARROW);
}

function spawnNext() {
  const typ = spawnOrder[nextSpawnIndex];
  nextSpawnIndex++;
  const x = random(width * 0.1, width * 0.9);
  const y = -120;
  let img;
  if (typ === 'smoke') img = smokeImg;
  else if (typ === 'boat') img = fallingBoatImg;
  else img = starfishImg;

  // slower speeds so objects descend much more slowly
  falling.push({type: typ, img: img, x: x, y: y, w: 120, h: 120, speed: random(0.6, 1.2)});
}

function updateFalling() {
  for (let i = falling.length - 1; i >= 0; i--) {
    falling[i].y += falling[i].speed;
    // slowly steer toward bottom center slightly
    const targetX = width / 2;
    falling[i].x += (targetX - falling[i].x) * 0.005;

    // check if reaches bottom center area
    if (falling[i].y > height - 140) {
      // failed to stop it
      endGame(false);
    }
  }
}

function drawFalling() {
  for (let f of falling) {
    image(f.img, f.x - f.w / 2, f.y - f.h / 2, f.w, f.h);
  }
}

function mousePressed() {
  if (!isActive) return;
  // check buttons
  for (let b of buttons) {
    if (mouseX >= b.x && mouseX <= b.x + b.w && mouseY >= b.y && mouseY <= b.y + b.h) {
      handleButtonClick(b.id);
      return;
    }
  }
} 

function handleButtonClick(id) {
  if (id === 'sleep') {
    if (waitingForSleep) {
      // success ending
      endGame(true);
    }
    return;
  }

  // map button id to falling type
  let expectedType = null;
  if (id === 'smoke-light') expectedType = 'smoke';
  if (id === 'boat-boat') expectedType = 'boat';
  if (id === 'siren-starfish') expectedType = 'starfish';

  if (!expectedType) return;

  // find corresponding falling object and remove it
  for (let i = falling.length - 1; i >= 0; i--) {
    if (falling[i].type === expectedType) {
      // clicked correct button for an active threat -> remove
      falling.splice(i, 1);
      successCount++;
      if (successCount >= requiredSuccess) {
        waitingForSleep = true;
      }
      break;
    }
  }
}

function startBrightening() {
  // animate CSS vars to make ocean brighter
  let steps = 60;
  let step = 0;
  const fromTop = [0x00,0x1a,0x33];
  const fromBottom = [0x00,0x3b,0x5c];
  const toTop = [0x20,0x6b,0x9a];
  const toBottom = [0x4b,0x9f,0xc7];

  const interval = setInterval(() => {
    step++;
    const t = step / steps;
    const top = lerpColorHex(fromTop, toTop, t);
    const bottom = lerpColorHex(fromBottom, toBottom, t);
    document.documentElement.style.setProperty('--ocean-top', top);
    document.documentElement.style.setProperty('--ocean-bottom', bottom);

    if (step >= steps) {
      clearInterval(interval);
      // fully brightened and waiting for sleep click
      waitingForSleep = true;
    }
  }, 40);
}

// helper to lerp rgb arrays and return hex string
function lerpColorHex(a, b, t) {
  const r = Math.round(lerp(a[0], b[0], t));
  const g = Math.round(lerp(a[1], b[1], t));
  const bl = Math.round(lerp(a[2], b[2], t));
  return '#' + hex(r, 2) + hex(g, 2) + hex(bl, 2);
}

function endGame(won) {
  // navigate to ending page with query param
  if (won) {
    window.location.href = 'ending.html?result=win';
  } else {
    window.location.href = 'ending.html?result=lose';
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  setupButtons();
}
