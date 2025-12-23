// --- CONFIGURATION ---
let currentSize = 6;     // Changes to 7 for Hard Mode
let targetCarrots = 6;
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

// --- SEEDED RANDOM ---
function mulberry32(a) {
    return function() {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

// --- GENERATOR (Supports 6x6 and 7x7) ---
function generateLevel(seed, size, numCarrots) {
    const rng = mulberry32(seed);
    const totalCells = size * size;
    let attempts = 0;
    let success = false;

    while (!success && attempts < 20000) {
        attempts++;
        boardSolution = new Array(totalCells).fill(false);
        let carrots = [];
        
        // Create arrays for rows/cols
        let rows = Array.from({length: size}, (_, i) => i);
        let cols = Array.from({length: size}, (_, i) => i);
        
        // Shuffle
        rows.sort(() => rng() - 0.5);
        cols.sort(() => rng() - 0.5);

        let validPlacement = true;
        
        for(let i=0; i < numCarrots; i++) {
            let r = rows[i];
            let c = cols[i];
            
            // NO TOUCHING RULE (Diagonal & Orthogonal)
            for(let existing of carrots) {
                if(Math.abs(existing.r - r) <= 1 && Math.abs(existing.c - c) <= 1) {
                    validPlacement = false;
                    break;
                }
            }
            if(!validPlacement) break;
            
            carrots.push({r, c, color: i}); // Color matches index (0-6)
            boardSolution[r * size + c] = true;
        }

        if(validPlacement && carrots.length === numCarrots) {
            success = true;
            generateRegions(carrots, rng, size);
        }
    }
    
    // Safety fallback
    if(!success) {
        console.log("Retrying generation...");
        generateLevel(seed + 1, size, numCarrots);
    }
}

function generateRegions(carrots, rng, size) {
    const totalCells = size * size;
    regionMap = new Array(totalCells).fill(-1);
    
    for(let r=0; r<size; r++) {
        for(let c=0; c<size; c++) {
            let idx = r * size + c;
            let minDst = 100;
            let closestRegion = 0;
            
            carrots.forEach(carrot => {
                let dist = Math.abs(carrot.r - r) + Math.abs(carrot.c - c);
                dist += (rng() * 0.45); // Jitter for irregular shapes
                if(dist < minDst) {
                    minDst = dist;
                    closestRegion = carrot.color;
                }
            });
            regionMap[idx] = closestRegion;
        }
    }
}

// --- GAME LOGIC ---

function selectMode(mode, difficulty) {
    // 1. Determine Grid Size
    if (difficulty === 7) {
        currentSize = 7; // Hard Mode is 7x7
    } else {
        currentSize = 6; // Easy/Med/Daily are 6x6
    }
    
    targetCarrots = difficulty;
    currentMode = mode;
    
    // 2. Set Grid CSS
    gridEl.style.gridTemplateColumns = `repeat(${currentSize}, 1fr)`;
    gridEl.style.gridTemplateRows = `repeat(${currentSize}, 1fr)`;

    // 3. Setup Seed
    let seed;
    if (mode === 'daily') {
        const today = new Date().toISOString().slice(0, 10);
        seed = today.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        modeTitle.innerText = "Daily Challenge";
        timeEl.style.display = 'block';
        // Daily is always Standard (6x6, 6 Carrots)
        currentSize = 6;
        targetCarrots = 6;
    } else {
        seed = Math.floor(Math.random() * 100000);
        modeTitle.innerText = "Relax Mode";
        timeEl.style.display = 'none';
    }

    // 4. Update UI Text
    instructEl.innerText = `Find ${targetCarrots} Rabbits. Must have their own Row, Col & Color!`;
    
    // 5. Generate and Start
    generateLevel(seed, currentSize, targetCarrots);
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
        // Using event listener instead of onclick attribute for better reliability
        cell.addEventListener('click', () => handleInput(i));
        gridEl.appendChild(cell);
    }
}

function startGame() {
    startOverlay.classList.add('hidden');
    winOverlay.classList.add('hidden');
    gridEl.classList.remove('blurred');
    exitBtn.style.display = 'block'; // Show X button
    isGameActive = true;
    penaltySeconds = 0;
    startTime = Date.now();
    
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
    
    if(playerBoard[idx]) {
        cell.innerHTML = '<span class="animate-pop">🕳️</span>';
    } else {
        cell.innerHTML = ''; 
    }
}

function checkWin() {
    if(!isGameActive) return;

    let holes = [];
    playerBoard.forEach((hasHole, idx) => { if(hasHole) holes.push(idx); });

    // 1. Count Check
    if (holes.length !== targetCarrots) {
        showPenalty(`Find exactly ${targetCarrots}!`);
        return;
    }

    let rows = new Set();
    let cols = new Set();
    let regions = new Set();

    // 2. Logic Check
    for (let h of holes) {
        let r = Math.floor(h / currentSize);
        let c = h % currentSize;
        let reg = regionMap[h];

        if (rows.has(r)) { showPenalty("Row Conflict!"); return; }
        if (cols.has(c)) { showPenalty("Column Conflict!"); return; }
        if (regions.has(reg)) { showPenalty("Color Conflict!"); return; }

        rows.add(r); cols.add(c); regions.add(reg);

        // 3. No Touching Check
        for (let other of holes) {
            if (h === other) continue;
            let or = Math.floor(other / currentSize);
            let oc = other % currentSize;
            if (Math.abs(r - or) <= 1 && Math.abs(c - oc) <= 1) {
                showPenalty("Too close!"); 
                return;
            }
        }
    }
    doWin();
}

function showPenalty(msg) {
    if(currentMode === 'daily') {
        penaltySeconds += 10;
        updateTimer();
    }
    
    const btn = document.getElementById('check-btn');
    const oldText = btn.innerText;
    btn.style.backgroundColor = '#ef5350';
    btn.innerText = msg;
    setTimeout(() => {
        btn.style.backgroundColor = '';
        btn.innerText = oldText;
    }, 1500);
}

function doWin() {
    isGameActive = false;
    clearInterval(timerInterval);
    
    // Show Real Rabbits
    for(let i=0; i < currentSize * currentSize; i++) {
        let cell = document.getElementById(`c-${i}`);
        cell.innerHTML = '';
        if(boardSolution[i]) {
            cell.innerHTML = '<div class="carrot-win">🐰</div>';
        }
    }

    winOverlay.classList.remove('hidden');
    let msg = (currentMode === 'daily') ? `Time: ${timeEl.innerText}` : "Solved!";
    document.getElementById('win-text').innerText = msg;
}

function shareScore() {
    let txt = `🐰 Poogy Puzzle\nMode: ${currentMode === 'daily' ? 'Daily' : 'Relax'}\nResult: ${timeEl.innerText}`;
    navigator.clipboard.writeText(txt);
    alert("Score copied!");
}

// Initialize
gridEl.style.gridTemplateColumns = `repeat(6, 1fr)`;
document.getElementById('mode-title').innerText = "Menu";