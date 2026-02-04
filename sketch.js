// Game state
const pathName = window.location.pathname.toLowerCase();
const isActive = (document.body && document.body.classList && document.body.classList.contains('dayone')) || 
                 pathName.includes('dayone.html') ||
                 pathName.includes('daytwo.html') ||
                 pathName.includes('daythree.html');

// Detect which day for difficulty scaling
let currentDay = 1;
if (pathName.includes('daytwo.html')) currentDay = 2;
if (pathName.includes('daythree.html')) currentDay = 3;

console.log('Current day detected:', currentDay, 'Path:', pathName);

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
// *** TIME LIMIT: Time between events - gets shorter each day ***
// Day 1: 5000ms, Day 2: 3500ms, Day 3: 2500ms
let spawnInterval = 5000 - (currentDay - 1) * 1500; 
let lastSpawnTime = 0;

// Stars in the sky
let stars = [];

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
  // *** TIME LIMIT: How fast fog darkens - Day 1: ~5 sec, Day 2: ~4 sec, Day 3: ~3 sec ***
  // Formula: maxDarkness / (targetSeconds * 60fps) = darkenRate per frame
  // Day 1: 0.92 / (5 * 60) = 0.00307, Day 2: 0.92 / (4 * 60) = 0.00383, Day 3: 0.92 / (3 * 60) = 0.00511
  darkenRate: currentDay === 1 ? 0.00307 : (currentDay === 2 ? 0.00383 : 0.00511),
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

  // Randomize event order
  spawnOrder = shuffle(spawnOrder);
  console.log('Event order:', spawnOrder);

  // Create stars
  createStars();

  setupButtons();
  createDayCalendar(); // Create calendar as DOM element
  lastSpawnTime = millis();
} 

function draw() {
  if (!isActive) return;
  clear(); // keep canvas transparent so CSS background shows through

  // Draw stars behind everything
  drawStars();

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

// Create stars in the sky
function createStars() {
  stars = [];
  const numStars = 150; // number of stars
  for (let i = 0; i < numStars; i++) {
    stars.push({
      x: random(width),
      y: random(0, height * 0.6), // stars in upper portion of screen
      size: random(1, 3),
      brightness: random(150, 255),
      twinkleSpeed: random(0.02, 0.05),
      twinkleOffset: random(TWO_PI)
    });
  }
}

// Draw stars with opacity based on sky brightness
function drawStars() {
  // Calculate star opacity based on how bright the sky is
  const skyTopHex = getComputedStyle(document.body).getPropertyValue('--sky-top').trim();
  const skyRgb = hexToRgbArray(skyTopHex);
  const skyBrightness = (skyRgb[0] + skyRgb[1] + skyRgb[2]) / 3;
  
  // Stars fade as sky brightens (inverse relationship)
  const starOpacity = map(skyBrightness, 0, 136, 255, 0); // 136 is average of target sky color
  
  for (let star of stars) {
    // Twinkling effect
    const twinkle = sin(millis() * star.twinkleSpeed + star.twinkleOffset) * 0.3 + 0.7;
    const alpha = starOpacity * twinkle;
    
    fill(255, 255, 255, alpha);
    noStroke();
    ellipse(star.x, star.y, star.size, star.size);
    
    // Larger stars get a subtle glow
    if (star.size > 2) {
      fill(255, 255, 255, alpha * 0.3);
      ellipse(star.x, star.y, star.size * 2, star.size * 2);
    }
  }
}

// Create day calendar indicator as DOM element (sticky note style)
function createDayCalendar() {
  const container = document.getElementById('ui-buttons');
  if (!container) return;
  
  // Calendar size and position
  const calendarSize = Math.min(120, window.innerWidth * 0.1);
  const x = 40;
  const y = window.innerHeight - calendarSize - 40;
  
  // Create calendar container
  const calendar = document.createElement('div');
  calendar.id = 'day-calendar';
  calendar.style.position = 'fixed';
  calendar.style.left = x + 'px';
  calendar.style.top = y + 'px';
  calendar.style.width = calendarSize + 'px';
  calendar.style.height = calendarSize + 'px';
  calendar.style.backgroundColor = '#F5F5DC'; // Softer beige (less saturated)
  calendar.style.border = '2px solid rgba(0, 0, 0, 0.3)'; // Lighter border
  calendar.style.borderRadius = '5px';
  calendar.style.boxShadow = '3px 3px 6px rgba(0, 0, 0, 0.2)'; // Softer shadow
  calendar.style.zIndex = '5'; // Above buttons (z-index: 3)
  calendar.style.pointerEvents = 'none';
  calendar.style.display = 'flex';
  calendar.style.flexDirection = 'column';
  calendar.style.overflow = 'hidden';
  calendar.style.opacity = '0.9'; // Slightly transparent to blend better
  
  // Create header (muted yellow bar)
  const header = document.createElement('div');
  header.style.backgroundColor = '#D4AF87'; // Muted tan/camel color
  header.style.height = '28%';
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'center';
  header.style.color = '#FFFFFF';
  header.style.fontWeight = 'bold';
  header.style.fontSize = (calendarSize * 0.16) + 'px';
  header.style.fontFamily = 'Arial, sans-serif';
  header.style.textShadow = '1px 1px 2px rgba(0, 0, 0, 0.3)';
  header.textContent = 'DAY';
  
  // Create number display
  const number = document.createElement('div');
  number.style.flex = '1';
  number.style.display = 'flex';
  number.style.alignItems = 'center';
  number.style.justifyContent = 'center';
  number.style.color = '#4A4A4A'; // Muted gray (less harsh)
  number.style.fontWeight = 'bold';
  number.style.fontSize = (calendarSize * 0.5) + 'px';
  number.style.fontFamily = 'Arial, sans-serif';
  number.textContent = currentDay.toString();
  
  calendar.appendChild(header);
  calendar.appendChild(number);
  document.body.appendChild(calendar);
  
  console.log('Calendar created for day:', currentDay);
}

function setupButtons() {
  buttons = [];
  
  // *** BUTTON SIZE AND SPACING - ADJUST THESE VALUES ***
  const buttonSizePercent = 0.08; // Button size as percentage of screen width (0.08 = 8%)
  const maxButtonSize = 110; // Maximum button size in pixels
  const bottomMargin = 40; // Distance from bottom of screen in pixels
  
  // *** BUTTON HORIZONTAL POSITIONS - CENTERED AROUND SCREEN MIDDLE ***
  // Buttons are positioned relative to center (0.5)
  // Current spacing: 0.17 between each button
  const centerX = 0.5; // Screen center
  const buttonSpacing = 0.17; // Space between buttons (keep this for current spacing)
  
  const button1Position = centerX - (buttonSpacing * 1.5); // 0.245 (left of center)
  const button2Position = centerX - (buttonSpacing * 0.5); // 0.415 (slightly left)
  const button3Position = centerX + (buttonSpacing * 0.5); // 0.585 (slightly right)
  const button4Position = centerX + (buttonSpacing * 1.5); // 0.755 (right of center)
  
  // To adjust spacing: change buttonSpacing value
  // Smaller value (e.g., 0.12) = buttons closer together
  // Larger value (e.g., 0.20) = buttons more spread out
  
  // Calculate button dimensions
  const bw = min(maxButtonSize, width * buttonSizePercent);
  const bh = bw;
  const baseY = height - bh - bottomMargin;

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

  // Create buttons with centered positions
  buttons.push(makeBtn('smoke-light', lightImg, width * button1Position, 'images/light_icon.png'));
  buttons.push(makeBtn('boat-boat', boatImg, width * button2Position, 'images/boat_icon.png'));
  buttons.push(makeBtn('siren-tsunami', sirenImg, width * button3Position, 'images/siren_icon.png'));
  buttons.push(makeBtn('sleep', sleepImg, width * button4Position, 'images/sleep_icon.png'));

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

  // *** TIME LIMIT: Speed of falling objects - gets faster each day ***
  // Day 1: 0.4-1.0, Day 2: 0.6-1.3, Day 3: 0.8-1.6
  const baseSpeed = 0.4 + (currentDay - 1) * 0.2;
  const speed = random(baseSpeed, baseSpeed + 0.6);

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
  
  // Ocean base colors: #001a33 (top) and #003b5c (bottom)
  // RGB: (0, 26, 51) and (0, 59, 92)
  const oceanR = 0;
  const oceanG_base = 26;
  const oceanB_base = 51;
  
  for (let layer = 0; layer < 3; layer++) {
    const layerOffset = layer * 20; // vertical offset between layers
    const waveY = y + layerOffset;
    const currentHeight = baseHeight * pulse;
    
    // Base wave (layer 0) uses ocean color
    // Other layers vary the green and blue values
    let r, g, b, alpha;
    
    if (layer === 0) {
      // Base layer - ocean color, gets slightly lighter as it approaches
      r = oceanR + progress * 20;
      g = oceanG_base + progress * 30;
      b = oceanB_base + progress * 40;
      alpha = 200;
    } else if (layer === 1) {
      // Middle layer - lighter variant
      r = oceanR + progress * 30;
      g = oceanG_base + 15 + progress * 40;
      b = oceanB_base + 25 + progress * 50;
      alpha = 180;
    } else {
      // Front layer - lightest variant
      r = oceanR + progress * 40;
      g = oceanG_base + 30 + progress * 50;
      b = oceanB_base + 40 + progress * 60;
      alpha = 160;
    }
    
    fill(r, g, b, alpha);
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
      const layerBrightness = map(layer, 0, 2, 0.7, 1.0);
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
    
    // Draw simple white bubbles on top of the wave
    const numBubbles = 15 + layer * 5; // more bubbles on front layers
    const layerBrightness = map(layer, 0, 2, 0.7, 1.0);
    
    for (let b = 0; b < numBubbles; b++) {
      // Position bubbles along the top edge
      const bubbleProgress = (b / numBubbles) + (millis() * 0.0001 * (layer + 1)) % 1;
      const bubbleX = bubbleProgress * waveWidth;
      const waveOffset = sin((bubbleProgress) * TWO_PI * 2 + (layer * 0.5)) * (currentHeight * 0.15);
      const bubbleY = waveY - (currentHeight / 2) + waveOffset;
      
      // Fixed bubble size (doesn't change with progress, only location animates)
      const bubbleSize = 10 + layer * 2; // Slightly bigger on front layers
      
      // Simple white bubbles
      fill(255, 255, 255, 180 * layerBrightness);
      noStroke();
      ellipse(bubbleX, bubbleY - bubbleSize, bubbleSize, bubbleSize);
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
      // Hide sleep prompt
      hideSleepPrompt();
      // Transition to next day or ending
      transitionToNextDay();
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
      showSleepPrompt();
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

// Show sleep prompt text at bottom of screen
function showSleepPrompt() {
  let promptText = '';
  if (currentDay === 1) {
    promptText = "It's already morning. I should go to sleep for tomorrow.";
  } else if (currentDay === 2) {
    promptText = "It's already morning. I should go to sleep for tomorrow.";
  } else if (currentDay === 3) {
    promptText = "Finally done with these shifts. I can't wait to go back home.";
  }
  
  // Create prompt element if it doesn't exist
  let promptEl = document.getElementById('sleep-prompt');
  if (!promptEl) {
    promptEl = document.createElement('div');
    promptEl.id = 'sleep-prompt';
    promptEl.style.position = 'fixed';
    promptEl.style.bottom = '150px'; // Above buttons (buttons are ~40px from bottom + button height)
    promptEl.style.left = '50%';
    promptEl.style.transform = 'translateX(-50%)';
    promptEl.style.color = 'white';
    promptEl.style.fontSize = '1.2em';
    promptEl.style.textAlign = 'center';
    promptEl.style.padding = '15px 30px';
    promptEl.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    promptEl.style.borderRadius = '10px';
    promptEl.style.zIndex = '10';
    promptEl.style.opacity = '0';
    promptEl.style.transition = 'opacity 1s ease-in';
    document.body.appendChild(promptEl);
  }
  
  promptEl.textContent = promptText;
  
  // Fade in
  setTimeout(() => {
    promptEl.style.opacity = '1';
  }, 100);
}

// Hide sleep prompt
function hideSleepPrompt() {
  const promptEl = document.getElementById('sleep-prompt');
  if (promptEl) {
    promptEl.style.opacity = '0';
    setTimeout(() => {
      promptEl.remove();
    }, 1000);
  }
}

// Transition to next day with white fade effect
function transitionToNextDay() {
  // Create white fade overlay
  const fadeEl = document.createElement('div');
  fadeEl.id = 'white-fade';
  fadeEl.style.position = 'fixed';
  fadeEl.style.inset = '0';
  fadeEl.style.backgroundColor = 'white';
  fadeEl.style.opacity = '0';
  fadeEl.style.zIndex = '9998';
  fadeEl.style.transition = 'opacity 2s ease-in';
  document.body.appendChild(fadeEl);
  
  // Fade to white
  setTimeout(() => {
    fadeEl.style.opacity = '1';
  }, 100);
  
  // Navigate to next page after fade
  setTimeout(() => {
    if (currentDay === 1) {
      window.location.href = 'daytwo.html';
    } else if (currentDay === 2) {
      window.location.href = 'daythree.html';
    } else if (currentDay === 3) {
      window.location.href = 'ending.html?result=win';
    }
  }, 2500);
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
  
  // Reposition calendar on resize
  const calendar = document.getElementById('day-calendar');
  if (calendar) {
    const calendarSize = Math.min(120, window.innerWidth * 0.1);
    const x = 40;
    const y = window.innerHeight - calendarSize - 40;
    
    calendar.style.left = x + 'px';
    calendar.style.top = y + 'px';
    calendar.style.width = calendarSize + 'px';
    calendar.style.height = calendarSize + 'px';
    
    // Update text sizes
    const header = calendar.children[0];
    const number = calendar.children[1];
    if (header) header.style.fontSize = (calendarSize * 0.16) + 'px';
    if (number) number.style.fontSize = (calendarSize * 0.5) + 'px';
  }
}