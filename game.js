// --- CONFIGURATION ---
const GRID_SIZE = 6;
let gameMode = 'daily'; // 'daily' or 'practice'
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

// --- SEEDED RANDOM (For Daily Puzzle) ---
// This ensures everyone gets the same puzzle on the same day
function mulberry32(a) {
    return function() {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

// --- BOARD GENERATOR ---
// 1. Places Carrots safely. 2. Grows regions around them.
function generateLevel(seed) {
    const rng = mulberry32(seed); // Initialize random number generator
    
    // Clear
    boardSolution = new Array(36).fill(false);
    regionMap = new Array(36).fill(-1);
    
    // 1. Place Carrots (Diagonal simplified strategy for guaranteed solution)
    // We shuffle rows/cols to randomize the diagonal pattern
    let rows = [0,1,2,3,4,5].sort(() => rng() - 0.5);
    let cols = [0,1,2,3,4,5].sort(() => rng() - 0.5);
    
    let seeds = []; // Center points for regions
    
    for(let i=0; i<6; i++) {
        let r = rows[i];
        let c = cols[i];
        let idx = r * 6 + c;
        boardSolution[idx] = true;
        seeds.push({r, c, color: i}); // This carrot belongs to region 'i'
    }

    // 2. Grow Regions (Voronoi-ish)
    // Every cell becomes the color of the closest Carrot
    for(let r=0; r<6; r++) {
        for(let c=0; c<6; c++) {
            let idx = r*6 + c;
            let minDst = 100;
            let closestRegion = 0;
            
            // Find closest carrot
            seeds.forEach(seed => {
                let dist = Math.abs(seed.r - r) + Math.abs(seed.c - c); // Manhattan distance
                // Add tiny random jitter so borders aren't perfectly straight lines
                dist += (rng() * 0.5); 
                if(dist < minDst) {
                    minDst = dist;
                    closestRegion = seed.color;
                }
            });
            regionMap[idx] = closestRegion;
        }
    }
}

// --- GAME LOOP ---

function initGame(mode) {
    gameMode = mode;
    playerBoard = new Array(36).fill(false);
    isGameActive = false;
    penaltySeconds = 0;
    
    // Determine Seed
    let seed;
    if (mode === 'daily') {
        const today = new Date().toISOString().slice(0, 10); // "2023-12-22"
        // Convert string to number hash
        seed = today.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        document.getElementById('mode-title').innerText = "Daily Challenge: " + today;
    } else {
        seed = Math.floor(Math.random() * 100000);
        document.getElementById('mode-title').innerText = "Practice Mode";
    }

    generateLevel(seed);
    renderBoard();
    
    // Show Start Screen
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
        cell.innerHTML = '🥕'; // Placed
    } else {
        cell.innerHTML = ''; // Removed
    }
}

function checkWin() {
    if(!isGameActive) return;

    // 1. Check if board matches solution exactly
    let mistakes = 0;
    let correctCount = 0;
    
    // Simple logic: Does player board match our valid generated board?
    // (In a real advanced version, we would check if their solution is valid, 
    // even if it's different from ours, but for this generator, there is usually only 1 solution)
    
    for(let i=0; i<36; i++) {
        if(playerBoard[i] && !boardSolution[i]) mistakes++; // Digging in wrong spot
        if(!playerBoard[i] && boardSolution[i]) mistakes++; // Missed a spot
        if(playerBoard[i] && boardSolution[i]) correctCount++;
    }

    if (mistakes === 0 && correctCount === 6) {
        doWin();
    } else {
        // Penalty!
        penaltySeconds += 10;
        const btn = document.getElementById('check-btn');
        btn.style.backgroundColor = 'red';
        btn.innerText = "+10s PENALTY!";
        setTimeout(() => {
            btn.style.backgroundColor = '';
            btn.innerText = "DIG FOR CARROTS";
        }, 1000);
    }
}

function doWin() {
    isGameActive = false;
    clearInterval(timerInterval);
    winOverlay.classList.remove('hidden');
    document.getElementById('final-score').innerText = timeEl.innerText;
}

function shareScore() {
    const text = `🐰 Poogy's Daily Puzzle \nTime: ${timeEl.innerText} \nPlay here: [YourLink]`;
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
}

// Start
initGame('daily');