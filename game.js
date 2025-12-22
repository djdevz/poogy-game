// --- CONFIGURATION ---
const GRID_SIZE = 6;
let boardSolution = [];
let regionMap = [];
let playerBoard = [];
let timerInterval;
let startTime;
let penaltySeconds = 0;
let isGameActive = false;

// --- DOM ELEMENTS ---
const gridEl = document.getElementById('grid');
const timeEl = document.getElementById('time-display');
const startOverlay = document.getElementById('start-overlay');
const winOverlay = document.getElementById('win-modal');

// --- SEEDED RANDOM ---
function mulberry32(a) {
    return function() {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

// --- SMART GENERATOR (Retries until valid) ---
function generateLevel(seed) {
    const rng = mulberry32(seed);
    let attempts = 0;
    let success = false;

    // Keep trying to place carrots until we find a set that doesn't touch
    while (!success && attempts < 1000) {
        attempts++;
        boardSolution = new Array(36).fill(false);
        let carrots = [];
        let rows = [0,1,2,3,4,5];
        let cols = [0,1,2,3,4,5];
        
        // Shuffle rows/cols for randomness
        rows.sort(() => rng() - 0.5);
        cols.sort(() => rng() - 0.5);

        let validPlacement = true;
        
        // Try to place 6 carrots
        for(let i=0; i<6; i++) {
            let r = rows[i];
            let c = cols[i];
            
            // Check against existing carrots for diagonal touches
            for(let existing of carrots) {
                if(Math.abs(existing.r - r) <= 1 && Math.abs(existing.c - c) <= 1) {
                    validPlacement = false;
                    break;
                }
            }
            if(!validPlacement) break;
            
            carrots.push({r, c, color: i});
            boardSolution[r*6 + c] = true;
        }

        if(validPlacement) {
            success = true;
            generateRegions(carrots, rng);
        }
    }
}

function generateRegions(carrots, rng) {
    regionMap = new Array(36).fill(-1);
    for(let r=0; r<6; r++) {
        for(let c=0; c<6; c++) {
            let idx = r*6 + c;
            let minDst = 100;
            let closestRegion = 0;
            carrots.forEach(carrot => {
                let dist = Math.abs(carrot.r - r) + Math.abs(carrot.c - c);
                dist += (rng() * 0.4); // Less Jitter for cleaner shapes
                if(dist < minDst) {
                    minDst = dist;
                    closestRegion = carrot.color;
                }
            });
            regionMap[idx] = closestRegion;
        }
    }
}

// --- GAME LOOP ---
function initGame() {
    playerBoard = new Array(36).fill(false);
    isGameActive = false;
    penaltySeconds = 0;
    
    // Daily Seed
    const today = new Date().toISOString().slice(0, 10);
    const seed = today.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    document.getElementById('mode-title').innerText = "Daily Garden: " + today;

    generateLevel(seed);
    renderBoard();
    
    startOverlay.classList.remove('hidden');
    winOverlay.classList.add('hidden');
    gridEl.classList.add('blurred');
    timeEl.innerText = "00:00";
}

function renderBoard() {
    gridEl.innerHTML = '';
    for(let i=0; i<36; i++) {
        let cell = document.createElement('div');
        cell.className = `cell region-${regionMap[i]}`;
        cell.id = `c-${i}`;
        cell.onclick = () => handleInput(i);
        gridEl.appendChild(cell);
    }
}

function startGame() {
    startOverlay.classList.add('hidden');
    gridEl.classList.remove('blurred');
    isGameActive = true;
    startTime = Date.now();
    
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const delta = Math.floor((Date.now() - startTime) / 1000) + penaltySeconds;
        let m = Math.floor(delta / 60).toString().padStart(2, '0');
        let s = (delta % 60).toString().padStart(2, '0');
        timeEl.innerText = `${m}:${s}`;
    }, 1000);
}

function handleInput(idx) {
    if(!isGameActive) return;
    
    playerBoard[idx] = !playerBoard[idx];
    const cell = document.getElementById(`c-${idx}`);
    
    if(playerBoard[idx]) {
        cell.innerHTML = '🕳️'; // Dig Hole
    } else {
        cell.innerHTML = ''; // Fill Hole
    }
}

function checkWin() {
    if(!isGameActive) return;

    // 1. Get all player moves
    let holes = [];
    playerBoard.forEach((hasHole, idx) => {
        if(hasHole) holes.push(idx);
    });

    // Rule 1: Must have exactly 6 holes
    if (holes.length !== 6) {
        showPenalty("Find exactly 6 carrots!");
        return;
    }

    // Rule Checkers
    let rows = new Set();
    let cols = new Set();
    let regions = new Set();

    // Loop through every hole the player placed
    for (let h of holes) {
        let r = Math.floor(h / 6);
        let c = h % 6;
        let reg = regionMap[h];

        // Rule 2, 3, 4: Unique Row, Col, Region
        if (rows.has(r)) { showPenalty("Row Conflict!"); return; }
        if (cols.has(c)) { showPenalty("Column Conflict!"); return; }
        if (regions.has(reg)) { showPenalty("Region Conflict!"); return; }
        
        rows.add(r);
        cols.add(c);
        regions.add(reg);

        // Rule 5: No Touching (Diagonal or Orthogonal)
        for (let other of holes) {
            if (h === other) continue;
            let or = Math.floor(other / 6);
            let oc = other % 6;
            
            // Check if distance is 1 or less in both directions
            if (Math.abs(r - or) <= 1 && Math.abs(c - oc) <= 1) {
                showPenalty("Rabbits are touching!"); 
                return;
            }
        }
    }

    // IF WE SURVIVED ALL CHECKS, WE WIN!
    doWin();
}

// Helper for showing penalty text on the button
function showPenalty(msg) {
    penaltySeconds += 10;
    const btn = document.getElementById('check-btn');
    const originalText = btn.innerText;
    
    btn.style.backgroundColor = '#ef5350';
    btn.innerText = `+10s: ${msg}`;
    
    // Shake animation
    btn.animate([
        { transform: 'translateX(0)' },
        { transform: 'translateX(-5px)' },
        { transform: 'translateX(5px)' },
        { transform: 'translateX(0)' }
    ], { duration: 300 });

    setTimeout(() => {
        btn.style.backgroundColor = '';
        btn.innerText = originalText;
    }, 1500);
}

function doWin() {
    isGameActive = false;
    clearInterval(timerInterval);
    
    // Reveal Carrots!
    for(let i=0; i<36; i++) {
        if(boardSolution[i]) {
            document.getElementById(`c-${i}`).innerHTML = '🥕';
        }
    }

    winOverlay.classList.remove('hidden');
    document.getElementById('final-score').innerText = timeEl.innerText;
}

function shareScore() {
    const text = `🐰 Poogy's Garden \nTime: ${timeEl.innerText} \nTry it: [YourLink]`;
    navigator.clipboard.writeText(text);
    alert("Score copied!");
}

initGame();