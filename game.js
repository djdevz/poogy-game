// --- CONFIGURATION ---
const GRID_SIZE = 6;
let boardSolution = [];
let regionMap = [];
let playerBoard = [];
let timerInterval;
let startTime;
let penaltySeconds = 0;
let isGameActive = false;
let currentMode = 'daily';
let targetCarrots = 6;

// --- DOM ELEMENTS ---
const gridEl = document.getElementById('grid');
const timeEl = document.getElementById('time-display');
const startOverlay = document.getElementById('start-overlay');
const winOverlay = document.getElementById('win-modal');
const instructEl = document.getElementById('instruction-text');

// --- SEEDED RANDOM ---
function mulberry32(a) {
    return function() {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

// --- LEVEL GENERATOR ---
function generateLevel(seed, numCarrots) {
    const rng = mulberry32(seed);
    let attempts = 0;
    let success = false;

    // Retry loop to ensure valid board
    while (!success && attempts < 5000) {
        attempts++;
        boardSolution = new Array(36).fill(false);
        let carrots = [];
        let rows = [0,1,2,3,4,5];
        let cols = [0,1,2,3,4,5];
        
        rows.sort(() => rng() - 0.5);
        cols.sort(() => rng() - 0.5);

        let validPlacement = true;
        
        for(let i=0; i < numCarrots; i++) {
            let r, c;
            // Strict rows/cols for the first 6
            if(i < 6) {
                r = rows[i];
                c = cols[i];
            } else {
                // Find any empty spot for extra carrots (Hard mode)
                let possible = [];
                for(let x=0; x<36; x++) {
                    if(!boardSolution[x]) possible.push(x);
                }
                if(possible.length === 0) { validPlacement = false; break; }
                let pick = possible[Math.floor(rng() * possible.length)];
                r = Math.floor(pick/6);
                c = pick%6;
            }
            
            // NO TOUCHING RULE
            for(let existing of carrots) {
                if(Math.abs(existing.r - r) <= 1 && Math.abs(existing.c - c) <= 1) {
                    validPlacement = false;
                    break;
                }
            }
            if(!validPlacement) break;
            
            carrots.push({r, c, color: i % 6});
            boardSolution[r*6 + c] = true;
        }

        if(validPlacement && carrots.length === numCarrots) {
            success = true;
            generateRegions(carrots, rng);
        }
    }
    
    // Fallback if generation fails (very rare)
    if(!success) {
        console.log("Retry gen...");
        generateLevel(seed + 1, numCarrots); 
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
                dist += (rng() * 0.4); 
                if(dist < minDst) {
                    minDst = dist;
                    closestRegion = carrot.color;
                }
            });
            regionMap[idx] = closestRegion;
        }
    }
}

// --- GAME STATE MANAGEMENT ---

// This function is called when a button is clicked
function selectMode(mode, difficulty) {
    initGame(mode, difficulty);
    startGame(); // Immediately start playing
}

function initGame(mode, difficulty = 6) {
    currentMode = mode;
    targetCarrots = difficulty;
    playerBoard = new Array(36).fill(false);
    isGameActive = false;
    penaltySeconds = 0;
    
    // UI Updates
    instructEl.innerText = `Find ${targetCarrots} Carrots. No touching!`;
    
    let seed;
    if (mode === 'daily') {
        const today = new Date().toISOString().slice(0, 10);
        seed = today.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        document.getElementById('mode-title').innerText = "Daily Challenge: " + today;
        timeEl.style.display = 'block'; 
        targetCarrots = 6; 
        instructEl.innerText = "Find 6 Carrots. No touching!";
    } else if (mode === 'menu') {
        // Just a background for the menu
        seed = Math.floor(Math.random() * 10000); 
        document.getElementById('mode-title').innerText = "Select a Mode";
    } else {
        // Practice Mode
        seed = Math.floor(Math.random() * 100000);
        document.getElementById('mode-title').innerText = "Relax Mode (" + difficulty + " Carrots)";
        timeEl.style.display = 'none'; 
    }

    generateLevel(seed, targetCarrots);
    renderBoard();
    
    // Reset Timer UI
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
    if(currentMode === 'daily') {
        timerInterval = setInterval(() => {
            const delta = Math.floor((Date.now() - startTime) / 1000) + penaltySeconds;
            let m = Math.floor(delta / 60).toString().padStart(2, '0');
            let s = (delta % 60).toString().padStart(2, '0');
            timeEl.innerText = `${m}:${s}`;
        }, 1000);
    }
}

function handleInput(idx) {
    if(!isGameActive) return;
    playerBoard[idx] = !playerBoard[idx];
    const cell = document.getElementById(`c-${idx}`);
    cell.innerHTML = playerBoard[idx] ? '🕳️' : '';
}

function checkWin() {
    if(!isGameActive) return;

    let holes = [];
    playerBoard.forEach((hasHole, idx) => { if(hasHole) holes.push(idx); });

    // 1. Count Check
    if (holes.length !== targetCarrots) {
        showPenalty(`Find exactly ${targetCarrots} carrots!`);
        return;
    }

    // 2. Rules Check
    let rows = new Set();
    let cols = new Set();
    let regions = new Set();

    for (let h of holes) {
        let r = Math.floor(h / 6);
        let c = h % 6;
        let reg = regionMap[h];

        // Strict Rules (Only apply if we have 6 or fewer carrots)
        if(targetCarrots <= 6) {
            if (rows.has(r)) { showPenalty("Row Conflict!"); return; }
            if (cols.has(c)) { showPenalty("Column Conflict!"); return; }
            if (regions.has(reg)) { showPenalty("Region Conflict!"); return; }
        }

        rows.add(r); cols.add(c); regions.add(reg);

        // ALWAYS enforce No Touching
        for (let other of holes) {
            if (h === other) continue;
            let or = Math.floor(other / 6);
            let oc = other % 6;
            if (Math.abs(r - or) <= 1 && Math.abs(c - oc) <= 1) {
                showPenalty("Rabbits are touching!"); 
                return;
            }
        }
    }
    doWin();
}

function showPenalty(msg) {
    if(currentMode === 'daily') penaltySeconds += 10;
    
    const btn = document.getElementById('check-btn');
    btn.style.backgroundColor = '#ef5350';
    btn.innerText = msg;
    setTimeout(() => {
        btn.style.backgroundColor = '';
        btn.innerText = "CHECK GARDEN";
    }, 1500);
}

function doWin() {
    isGameActive = false;
    clearInterval(timerInterval);
    
    // Reveal Carrots
    for(let i=0; i<36; i++) {
        if(boardSolution[i]) document.getElementById(`c-${i}`).innerHTML = '🥕';
    }

    winOverlay.classList.remove('hidden');
    let msg = (currentMode === 'daily') ? `Time: ${timeEl.innerText}` : "Relaxed & Solved!";
    document.getElementById('win-text').innerText = msg;
}

function shareScore() {
    let txt = (currentMode === 'daily') 
        ? `🐰 Poogy Daily ${new Date().toISOString().slice(0,10)} \nTime: ${timeEl.innerText}`
        : `🐰 Poogy Relax Mode (${targetCarrots} carrots) solved!`;
    navigator.clipboard.writeText(txt);
    alert("Score copied!");
}

// Initialize Menu Background
initGame('menu');