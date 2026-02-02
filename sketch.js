let homepage = true;
let dayone = true;
let ending = false;

let lightImg;
let boatImg;
let sirenImg;
let sleepImg;

function preload() {
  lightImg = loadImage('images/light_icon.png');
  boatImg = loadImage('images/boat_icon.png');
  sirenImg = loadImage('images/siren_icon.png');
  sleepImg = loadImage('images/sleep_icon.png');
}

function setup() {
    canvas = createCanvas(windowWidth, windowHeight);
    canvas.position(0, 0);
    canvas.style('z-index', '-1');
    canvas.style('position', 'fixed');
}

function draw() {
    if (dayone) {
        buttons_display();
    }
}

function buttons_display() {
    if (!lightImg) return;
    noStroke();
    fill(200, 100, 100, 100);
    
    rect(390, 830, 110, 110, 20);
    image(lightImg, 400, 830, 90, 110);

    rect(670, 800, 110, 110, 20);
    image(boatImg, 675, 800, 90, 110);

    rect(915, 800, 110, 110, 20);
    image(sirenImg, 925, 800, 90, 110);

    rect(1190, 830, 110, 110, 20);
    image(sleepImg, 1200, 830, 90, 110);
}

lightImg.mouseOver(() => {
    fill(255,255,255);
});

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}