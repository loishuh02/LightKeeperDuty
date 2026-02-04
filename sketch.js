// Game state
const isActive = (document.body && document.body.classList && document.body.classList.contains('dayone')) || window.location.pathname.endsWith('dayone.html');
let dayone = isActive;

// Images
let lightImg, boatImg, sirenImg, sleepImg;
let smokeImg, fallingBoatImg, tsunamiImg;

// Buttons
let buttons = []; // objects: {id, img, x,y,w,h}

// Falling objects
let falling = []; // array of {type, img, x, y, startY, endY, startW, endW, speed}
let spawnOrder = ['smoke', 'boat', 'tsunami'];
let nextSpawnIndex = 0;
let spawnInterval = 5000; // 5 seconds
let lastSpawnTime = 0;

// Size controls (change these values to adjust appearance)
const fallingSizeConfig = {
  startSize: 32,   // px size when object appears at horizon (small)
  endSize: 140,    // px size when object reaches near the bottom (large)
  startOffsetAboveOcean: 220 // how many px above the ocean top the object starts
};

/**
 * Read the CSS variable --ocean-height and return the pixel Y coordinate
 * of the ocean's top edge (i.e., the start line where horizon sits).
 */
function getOceanTopPx() {
  const raw = getComputedStyle(document.body).getPropertyValue('--ocean-height') || '40vh';
  const v = raw.trim();
  let oceanHeightPx;
  if (v.endsWith('vh')) {
    const n = parseFloat(v.slice(0, -2));
    oceanHeightPx = (n / 100) * height; // use canvas height for consistency
  } else if (v.endsWith('px')) {
    oceanHeightPx = parseFloat(v.slice(0, -2));
  } else {
    const n = parseFloat(v);
    oceanHeightPx = Number.isFinite(n) ? n : (40 / 100) * height;
  }
  return height - oceanHeightPx;
}

// Progress
let successCount = 0;
let requiredSuccess = 3;
let waitingForSleep = false;
let brightening = false;

// Fog event state — replaces smoke_monster behavior
let fog = {
  active: false,
  circles: [],
  darkness: 0,
  maxDarkness: 0.92,
  darkenRate: 0.006,
  fadeOut: false,
  fadeRate: 0.02
};

function isEventActive() {
  return fog.active || falling.length > 0;
} 

function preload() {
  lightImg = loadImage('images/light_icon.png');
  boatImg = loadImage('images/boat_icon.png');
  sirenImg = loadImage('images/siren_icon.png');
  sleepImg = loadImage('images/sleep_icon.png');

  // assets for threats
  smokeImg = loadImage('images/smoke monster.png');
  fallingBoatImg = loadImage('images/boat.png');
  // tsunami will be drawn programmatically
}

function setup() {
  if (!isActive) {
    // Do not initialize canvas or game logic on other pages
    return;
  }
  canvas = createCanvas(windowWidth, windowHeight);
  canvas.position(0, 0);
  // put the canvas above the ocean layer (z-index:1), but beneath the lighthouse overlay (::before z-index:2) and UI buttons (z-index:3)
  canvas.style('z-index', '1');
  canvas.style('position', 'fixed');
  imageMode(CORNER);

  setupButtons();
  lastSpawnTime = millis();
} 

function draw() {
  if (!isActive) return;
  clear(); // keep canvas transparent so CSS background shows through

  if (fog.active) {
    updateFog();
    drawFog();
  } else {
    updateFalling();
    drawFalling();
  }
  drawButtons();

  // spawn sequence: spawn exactly three items, one every 5s, but only when no other event is in progress
  if (!waitingForSleep && nextSpawnIndex < spawnOrder.length && !isEventActive()) {
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

  // check danger conditions each frame and toggle the subtle red outline
  checkDangerConditions();
} 

function setupButtons() {
  buttons = [];
  // define button size
  const bw = min(110, width * 0.08);
  const bh = bw;
  const baseY = height - bh - 40;

  // helper to create button objects with path for DOM img
  function makeBtn(id, img, x, path) {
    return {
      id: id,
      img: img,
      path: path,
      x: x,
      y: baseY,
      w: bw,
      h: bh,
      el: null
    };
  }

  // positions are responsive; include asset path strings to create DOM elements
  buttons.push(makeBtn('smoke-light', lightImg, width * 0.18, 'images/light_icon.png'));
  buttons.push(makeBtn('boat-boat', boatImg, width * 0.38, 'images/boat_icon.png'));
  buttons.push(makeBtn('siren-tsunami', sirenImg, width * 0.58, 'images/siren_icon.png'));
  buttons.push(makeBtn('sleep', sleepImg, width * 0.78, 'images/sleep_icon.png'));

  // create or update DOM button elements
  createButtonElements();
} 

function createButtonElements() {
  const container = document.getElementById('ui-buttons');
  if (!container) return;
  // reuse existing DOM elements when possible to avoid duplicates (fullscreen/resizes)
  for (let b of buttons) {
    if (!b.el) {
      // check for existing matching elements
      const matches = container.querySelectorAll(`[data-id="${b.id}"]`);
      if (matches.length > 0) {
        // reuse first match and remove any extra duplicates
        b.el = matches[0];
        if (matches.length > 1) {
          for (let i = 1; i < matches.length; i++) {
            container.removeChild(matches[i]);
          }
        }
      } else {
        const elt = document.createElement('img');
        elt.className = 'ui-btn';
        elt.setAttribute('draggable', 'false');
        elt.dataset.id = b.id;
        elt.src = b.path;
        elt.addEventListener('click', (e) => { e.stopPropagation(); handleButtonClick(b.id); });
        // support touch hover-like feedback
        elt.addEventListener('touchstart', (e) => { elt.classList.add('touched'); });
        elt.addEventListener('touchend', (e) => { elt.classList.remove('touched'); });
        container.appendChild(elt);
        b.el = elt;
      }
    }
    // position the element based on computed b.x/b.y/w/h
    b.el.style.left = b.x + 'px';
    b.el.style.top = b.y + 'px';
    b.el.style.width = b.w + 'px';
    b.el.style.height = b.h + 'px';
  }
  // remove any DOM elements that are not in buttons (cleanup)
  Array.from(container.children).forEach(child => {
    const id = child.dataset.id;
    if (!buttons.find(b => b.id === id)) container.removeChild(child);
  });
}

function drawButtons() {
  // Keep DOM elements in sync with responsive positions on each frame
  for (let b of buttons) {
    if (b.el) {
      b.el.style.left = b.x + 'px';
      b.el.style.top = b.y + 'px';
      b.el.style.width = b.w + 'px';
      b.el.style.height = b.h + 'px';
    }
  }
} 

 

function spawnNext() {
  const typ = spawnOrder[nextSpawnIndex];
  nextSpawnIndex++;
  const x = random(width * 0.1, width * 0.9);

  // determine ocean top (horizon line) and start at the horizon (slightly adjusted so image sits nicely on the line)
  const oceanTop = getOceanTopPx();
  const startY = oceanTop - (fallingSizeConfig.startSize / 2); // start centered on the horizon line
  const endY = height - 140; // same threshold used to trigger failure

  // Fog event replaces the smoke monster: create overlapping, slowly-darkening circles
  if (typ === 'smoke') {
    fog.active = true;
    fog.fadeOut = false;
    fog.darkness = 0;
    // slightly randomize how quickly the fog will darken
    fog.darkenRate = 0.004 + random(0.002);
    fog.circles = [];
    const minY = max(0, oceanTop - 150);
    const maxY = min(height, oceanTop + height * 0.25);
    const count = 30;
    for (let i = 0; i < count; i++) {
      fog.circles.push({
        x: random(0, width),
        y: random(minY, maxY),
        r: random(60, 260),
        phase: random(1000)
      });
    }
    // do not push a falling object — fog is its own event
    return;
  }

  let img;
  if (typ === 'boat') img = fallingBoatImg;
  else img = null; // tsunami will be drawn programmatically

  // slower speeds so objects descend much more slowly
  const speed = random(0.4, 1.0);

  // configure start and end sizes (you can tweak fallingSizeConfig)
  falling.push({
    type: typ,
    img: img,
    x: x,
    y: startY,
    startY: startY,
    endY: endY,
    startW: fallingSizeConfig.startSize,
    startH: fallingSizeConfig.startSize,
    endW: fallingSizeConfig.endSize,
    endH: fallingSizeConfig.endSize,
    speed: speed
  });
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
    // progress from startY to endY (0..1)
    const denom = (f.endY - f.startY) || 1;
    let t = (f.y - f.startY) / denom;
    t = constrain(t, 0, 1);

    // interpolate size
    const w = lerp(f.startW, f.endW, t);
    const h = lerp(f.startH, f.endH, t);

    // If tsunami, draw waves instead of image
    if (f.type === 'tsunami') {
      drawTsunami(f.x, f.y, w, h, t);
    } else if (f.img) {
      image(f.img, f.x - w / 2, f.y - h / 2, w, h);
    }
  }
}

// Draw tsunami as three flat overlapping wave shapes that pulse in height
function drawTsunami(x, y, w, h, progress) {
  push();
  
  // Three wave layers, full screen width
  const waveWidth = width;
  const baseHeight = h * 1.5; // base height of each wave
  
  // Pulsing animation - height increases and decreases
  const pulseSpeed = 0.003; // speed of the pulse
  const pulseAmount = 0.3; // how much the height changes (30% of base height)
  const pulse = sin(millis() * pulseSpeed) * pulseAmount + 1; // oscillates between 0.7 and 1.3
  
  for (let layer = 0; layer < 3; layer++) {
    const layerOffset = layer * 20; // vertical offset between layers
    const waveY = y + layerOffset;
    const currentHeight = baseHeight * pulse;
    
    // Colors get lighter/whiter as waves approach (higher progress)
    const blueIntensity = map(progress, 0, 1, 40, 180);
    const greenIntensity = map(progress, 0, 1, 80, 200);
    const whiteIntensity = map(progress, 0, 1, 100, 240);
    
    // Each layer slightly different color for depth
    const layerBrightness = map(layer, 0, 2, 0.7, 1.0);
    
    fill(
      blueIntensity * layerBrightness,
      greenIntensity * layerBrightness,
      whiteIntensity * layerBrightness,
      map(layer, 0, 2, 200, 140) // back layers more transparent
    );
    noStroke();
    
    // Draw flat wave shape
    beginShape();
    
    // Top edge of wave - create gentle curves across the screen
    const segments = 30;
    for (let i = 0; i <= segments; i++) {
      const segX = (waveWidth / segments) * i;
      // Gentle sine wave for the top edge
      const waveOffset = sin((i / segments) * TWO_PI * 2 + (layer * 0.5)) * (currentHeight * 0.15);
      const segY = waveY - (currentHeight / 2) + waveOffset;
      
      if (i === 0) {
        vertex(segX, segY);
      } else {
        vertex(segX, segY);
      }
    }
    
    // Bottom edge - straight line across to close the shape
    vertex(waveWidth, waveY + (currentHeight / 2));
    vertex(0, waveY + (currentHeight / 2));
    
    endShape(CLOSE);
    
    // Add white foam/highlight on top edge for closer waves
    if (progress > 0.4) {
      stroke(255, 255, 255, 180 * layerBrightness);
      strokeWeight(2 + progress * 2);
      noFill();
      
      beginShape();
      for (let i = 0; i <= segments; i++) {
        const segX = (waveWidth / segments) * i;
        const waveOffset = sin((i / segments) * TWO_PI * 2 + (layer * 0.5)) * (currentHeight * 0.15);
        const segY = waveY - (currentHeight / 2) + waveOffset;
        vertex(segX, segY);
      }
      endShape();
    }
  }
  
  pop();
}

// Fog updates darkness and handles fade-out behavior
function updateFog() {
  if (!fog.active) return;

  // subtle movement for the fog blobs
  for (let c of fog.circles) {
    c.x += sin((millis() * 0.0006) + c.phase) * 0.3;
    c.y += cos((millis() * 0.00045) + c.phase) * 0.12;
  }

  if (fog.fadeOut) {
    fog.darkness = max(0, fog.darkness - fog.fadeRate);
    if (fog.darkness <= 0.002) {
      // fog fully cleared
      fog.active = false;
      fog.fadeOut = false;
      fog.circles = [];
      lastSpawnTime = millis();
    }
  } else {
    fog.darkness = min(fog.maxDarkness, fog.darkness + fog.darkenRate);
    if (fog.darkness >= fog.maxDarkness - 0.001) {
      // fog became too dark and caused a failure
      endGame(false);
    }
  }
}

function drawFog() {
  noStroke();
  // draw overlapping circles with opacity driven by fog.darkness
  for (let c of fog.circles) {
    const alpha = fog.darkness * 220 * map(constrain(c.r, 60, 260), 60, 260, 0.6, 1.05);
    fill(180, 180, 190, alpha);
    ellipse(c.x, c.y, c.r * 2, c.r * 2);
  }
  // soft fullscreen overlay to deepen fog appearance
  fill(180, 180, 190, fog.darkness * 120);
  rect(0, 0, width, height);
}

function mousePressed() {
  if (!isActive) return;
  // check buttons with scaled hitboxes
  for (let b of buttons) {
    const sW = b.w * b.scale;
    const sH = b.h * b.scale;
    const sX = b.x - (sW - b.w) / 2;
    const sY = b.y - (sH - b.h) / 2;
    if (mouseX >= sX && mouseX <= sX + sW && mouseY >= sY && mouseY <= sY + sH) {
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

  // If fog is active, only the light button can clear it
  if (fog.active) {
    if (id === 'smoke-light' && !fog.fadeOut) {
      fog.fadeOut = true;
      // mark success immediately; the fog will visually fade out soon
      successCount++;
      brightenSky(); // brighten sky after resolving event
      if (successCount >= requiredSuccess) waitingForSleep = true;
    }
    return;
  }

  // map button id to falling type
  let expectedType = null;
  if (id === 'smoke-light') expectedType = 'smoke';
  if (id === 'boat-boat') expectedType = 'boat';
  if (id === 'siren-tsunami') expectedType = 'tsunami';

  if (!expectedType) return;

  // find corresponding falling object and remove it
  for (let i = falling.length - 1; i >= 0; i--) {
    if (falling[i].type === expectedType) {
      // clicked correct button for an active threat -> remove
      falling.splice(i, 1);
      successCount++;
      brightenSky(); // brighten sky after resolving event
      lastSpawnTime = millis();
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

// Brighten the sky incrementally after each successful event
function brightenSky() {
  const totalEvents = requiredSuccess; // 3 events total
  
  // Target colors (final bright sky)
  const targetTop = [0x88, 0xc7, 0xff]; // #88c7ff
  const targetBottom = [0x1e, 0x3a, 0x66]; // #1e3a66
  
  // Get current sky colors from body element
  const currentTopHex = getComputedStyle(document.body).getPropertyValue('--sky-top').trim();
  const currentBottomHex = getComputedStyle(document.body).getPropertyValue('--sky-bottom').trim();
  
  console.log('Current sky top:', currentTopHex, 'bottom:', currentBottomHex); // Debug
  
  // Parse current colors
  const fromTop = hexToRgbArray(currentTopHex);
  const fromBottom = hexToRgbArray(currentBottomHex);
  
  // Calculate target brightness for this event (incremental)
  const targetProgress = successCount / totalEvents;
  const toTop = [
    Math.round(targetTop[0] * targetProgress),
    Math.round(targetTop[1] * targetProgress),
    Math.round(targetTop[2] * targetProgress)
  ];
  const toBottom = [
    Math.round(targetBottom[0] * targetProgress),
    Math.round(targetBottom[1] * targetProgress),
    Math.round(targetBottom[2] * targetProgress)
  ];
  
  console.log('Animating sky to:', toTop, toBottom, 'Progress:', targetProgress); // Debug
  
  // Animate from current to new target
  let steps = 40;
  let step = 0;
  
  const interval = setInterval(() => {
    step++;
    const t = step / steps;
    const top = lerpColorHex(fromTop, toTop, t);
    const bottom = lerpColorHex(fromBottom, toBottom, t);
    document.body.style.setProperty('--sky-top', top);
    document.body.style.setProperty('--sky-bottom', bottom);
    
    if (step >= steps) {
      clearInterval(interval);
      console.log('Sky brightening complete'); // Debug
    }
  }, 30);
}

// Helper to convert hex color to RGB array
function hexToRgbArray(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  return [
    parseInt(hex.substring(0, 2), 16),
    parseInt(hex.substring(2, 4), 16),
    parseInt(hex.substring(4, 6), 16)
  ];
}

// Danger overlay control
let dangerActive = false;
function setDangerActive(on) {
  const el = document.getElementById('danger-flash');
  if (!el) return;
  if (on && !dangerActive) {
    dangerActive = true;
    el.classList.add('pulse');
  } else if (!on && dangerActive) {
    dangerActive = false;
    el.classList.remove('pulse');
  }
}

function checkDangerConditions() {
  // fog near limit
  let shouldDanger = false;

  if (fog && fog.active && !fog.fadeOut) {
    if (fog.darkness >= 0.8 * fog.maxDarkness) shouldDanger = true;
  }

  // any falling item that is at least 80% of the way down
  for (let f of falling) {
    const denom = (f.endY - f.startY) || 1;
    let t = (f.y - f.startY) / denom;
    if (t >= 0.8) {
      shouldDanger = true;
      break;
    }
  }

  setDangerActive(shouldDanger);
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