// --- CONFIGURATION ---
let currentSize = 6;
let targetRabbits = 6;
let boardSolution = [];
let regionMap = [];
let playerBoard = [];
let timerInterval;
let startTime;
let penaltySeconds = 0;
let isGameActive = false;
let currentMode = 'menu';

// --- DOM ELEMENTS ---
const gridEl = document.getElementById('grid');
const timeEl = document.getElementById('time-display');
const startOverlay = document.getElementById('start-overlay');
const winOverlay = document.getElementById('win-modal');
const instructEl = document.getElementById('instruction-text');
const exitBtn = document.getElementById('exit-btn');
const modeTitle = document.getElementById('mode-title');
const checkBtn = document.getElementById('check-btn');
const rainContainer = document.getElementById('rain-container');

// --- SEEDED RANDOM ---
function mulberry32(a) {
    return function() {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

// --- GENERATOR ---
function generateLevel(seed, size, numRabbits) {
    const rng = mulberry32(seed);
    const totalCells = size * size;
    let attempts = 0;
    let success = false;

    while (!success && attempts < 20000) {
        attempts++;
        boardSolution = new Array(totalCells).fill(false);
        let rabbits = [];
        
        let rows = Array.from({length: size}, (_, i) => i);
        let cols = Array.from({length: size}, (_, i) => i);
        
        rows.sort(() => rng() - 0.5);
        cols.sort(() => rng() - 0.5);

        let validPlacement = true;
        
        for(let i=0; i < numRabbits; i++) {
            let r = rows[i];
            let c = cols[i];
            
            for(let existing of rabbits) {
                if(Math.abs(existing.r - r) <= 1 && Math.abs(existing.c - c) <= 1) {
                    validPlacement = false;
                    break;
                }
            }
            if(!validPlacement) break;
            
            rabbits.push({r, c, color: i}); 
            boardSolution[r * size + c] = true;
        }

        if(validPlacement && rabbits.length === numRabbits) {
            success = true;
            generateRegions(rabbits, rng, size);
        }
    }
    
    if(!success) {
        generateLevel(seed + 1, size, numRabbits);
    }
}

function generateRegions(rabbits, rng, size) {
    const totalCells = size * size;
    regionMap = new Array(totalCells).fill(-1);
    
    for(let r=0; r<size; r++) {
        for(let c=0; c<size; c++) {
            let idx = r * size + c;
            let minDst = 100;
            let closestRegion = 0;
            
            rabbits.forEach(rabbit => {
                let dist = Math.abs(rabbit.r - r) + Math.abs(rabbit.c - c);
                // REDUCED JITTER: Changed from 0.45 to 0.1 to prevent orphan squares
                dist += (rng() * 0.1); 
                if(dist < minDst) {
                    minDst = dist;
                    closestRegion = rabbit.color;
                }
            });
            regionMap[idx] = closestRegion;
        }
    }
}

// --- GAME LOGIC ---

function selectMode(mode, difficulty) {
    if (difficulty === 7) {
        currentSize = 7; 
    } else {
        currentSize = 6; 
    }
    
    targetRabbits = difficulty;
    currentMode = mode;
    
    gridEl.style.gridTemplateColumns = `repeat(${currentSize}, 1fr)`;
    gridEl.style.gridTemplateRows = `repeat(${currentSize}, 1fr)`;

    let seed;
    if (mode === 'daily') {
        const today = new Date().toISOString().slice(0, 10);
        seed = today.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        modeTitle.innerText = "Daily Challenge";
        timeEl.style.display = 'block';
        currentSize = 6;
        targetRabbits = 6;
    } else {
        seed = Math.floor(Math.random() * 100000);
        modeTitle.innerText = "Relax Mode";
        timeEl.style.display = 'none';
    }

    instructEl.innerText = `Find ${targetRabbits} Rabbits. One per Row, Col & Color!`;
    
    generateLevel(seed, currentSize, targetRabbits);
    initBoard();
    startGame();
}

function initBoard() {
    gridEl.innerHTML = '';
    playerBoard = new Array(currentSize * currentSize).fill(false);
    
    for(let i=0; i < currentSize * currentSize; i++) {
        let cell = document.createElement('div');
        cell.className = `cell region-${regionMap[i]}`;
        cell.id = `c-${i}`;
        cell.addEventListener('click', () => handleInput(i));
        gridEl.appendChild(cell);
    }
}

function startGame() {
    startOverlay.classList.add('hidden');
    winOverlay.classList.add('hidden');
    gridEl.classList.remove('blurred');
    rainContainer.innerHTML = ''; // Stop rain
    exitBtn.style.display = 'block'; 
    isGameActive = true;
    penaltySeconds = 0;
    startTime = Date.now();
    
    // Reset Button State
    checkBtn.innerText = "CHECK RABBITS";
    checkBtn.style.background = "";
    
    clearInterval(timerInterval);
    if(currentMode === 'daily') {
        timerInterval = setInterval(updateTimer, 1000);
    } else {
        timeEl.innerText = "00:00";
    }
}

function updateTimer() {
    const delta = Math.floor((Date.now() - startTime) / 1000) + penaltySeconds;
    let m = Math.floor(delta / 60).toString().padStart(2, '0');
    let s = (delta % 60).toString().padStart(2, '0');
    timeEl.innerText = `${m}:${s}`;
}

function handleInput(idx) {
    if(!isGameActive) return;
    
    playerBoard[idx] = !playerBoard[idx];
    const cell = document.getElementById(`c-${idx}`);
    
    // EMOJI UPDATE: Rabbit instead of Hole
    if(playerBoard[idx]) {
        cell.innerHTML = '<span class="rabbit-pop">🐰</span>';
    } else {
        cell.innerHTML = ''; 
    }
}

function checkWin() {
    if(!isGameActive) return;

    let rabbits = [];
    playerBoard.forEach((hasRabbit, idx) => { if(hasRabbit) rabbits.push(idx); });

    // 1. Count Check
    if (rabbits.length !== targetRabbits) {
        showPenalty(`Place exactly ${targetRabbits} rabbits!`);
        return;
    }

    let rows = new Set();
    let cols = new Set();
    let regions = new Set();

    // 2. Logic Check
    for (let rIdx of rabbits) {
        let r = Math.floor(rIdx / currentSize);
        let c = rIdx % currentSize;
        let reg = regionMap[rIdx];

        if (rows.has(r)) { showPenalty("Row Conflict!"); triggerSadRabbits(); return; }
        if (cols.has(c)) { showPenalty("Column Conflict!"); triggerSadRabbits(); return; }
        if (regions.has(reg)) { showPenalty("Color Conflict!"); triggerSadRabbits(); return; }

        rows.add(r); cols.add(c); regions.add(reg);

        // 3. No Touching Check
        for (let other of rabbits) {
            if (rIdx === other) continue;
            let or = Math.floor(other / currentSize);
            let oc = other % currentSize;
            if (Math.abs(r - or) <= 1 && Math.abs(c - oc) <= 1) {
                showPenalty("Rabbits are touching!");
                triggerSadRabbits();
                return;
            }
        }
    }
    doWin();
}

// ANIMATION LOGIC

function triggerSadRabbits() {
    // Make all placed rabbits fade/shake
    for(let i=0; i<playerBoard.length; i++) {
        if(playerBoard[i]) {
            const cell = document.getElementById(`c-${i}`);
            const span = cell.querySelector('span');
            if(span) {
                span.classList.remove('rabbit-pop');
                span.classList.add('rabbit-sad');
                // Reset after animation
                setTimeout(() => {
                    if(span) span.classList.remove('rabbit-sad');
                }, 500);
            }
        }
    }
}

function triggerRain() {
    rainContainer.style.display = 'block';
    for(let i=0; i<30; i++) {
        let d = document.createElement('div');
        d.className = 'falling-carrot';
        d.innerText = '🥕';
        d.style.left = Math.random() * 100 + 'vw';
        d.style.animationDuration = (Math.random() * 2 + 2) + 's';
        d.style.fontSize = (Math.random() * 2 + 1) + 'rem';
        rainContainer.appendChild(d);
    }
}

function showPenalty(msg) {
    if(currentMode === 'daily') {
        penaltySeconds += 10;
        updateTimer();
    }
    
    const oldText = checkBtn.innerText;
    checkBtn.style.backgroundColor = '#ef5350';
    checkBtn.innerText = "Oh no! Rabbits unhappy!";
    
    setTimeout(() => {
        checkBtn.style.backgroundColor = '';
        checkBtn.innerText = oldText;
    }, 2000);
}

function doWin() {
    isGameActive = false;
    clearInterval(timerInterval);
    
    // Happy Dance Animation
    for(let i=0; i < currentSize * currentSize; i++) {
        if(playerBoard[i]) {
            let cell = document.getElementById(`c-${i}`);
            if(cell.firstChild) cell.firstChild.classList.add('rabbit-happy');
        }
    }

    triggerRain();

    // Delay Win Overlay slightly to enjoy the animation
    setTimeout(() => {
        winOverlay.classList.remove('hidden');
        let msg = (currentMode === 'daily') ? `Time: ${timeEl.innerText}` : "Solved!";
        document.getElementById('win-text').innerText = msg;
    }, 1500);
}

function shareScore() {
    let txt = `🐰 Poogy Puzzle\nMode: ${currentMode === 'daily' ? 'Daily' : 'Relax'}\nResult: ${timeEl.innerText}`;
    navigator.clipboard.writeText(txt);
    alert("Score copied!");
}

// Init
gridEl.style.gridTemplateColumns = `repeat(6, 1fr)`;
document.getElementById('mode-title').innerText = "Menu";