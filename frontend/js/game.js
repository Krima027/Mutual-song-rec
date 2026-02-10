const gameState = {
    gameType: null,                 
    stage: "menu",                  
    timer: 30,
    round: 0,
    currentDJ: null,
    players: [
        { id: 1, name: "You", score: 0 },
        { id: 2, name: "player1", score: 0 },
        { id: 3, name: "player2", score: 0 },
        { id: 4, name: "player3", score: 0 }
    ]
};

let gameTimer = null;

const lyricQuestions = [
    {
        song: "Shape of You",
        artist: "Ed Sheeran",
        lyric: "I'm in love with the shape of _____",
        answer: "You",
        options: ["You", "Us", "Me", "It"]
    },
    {
        song: "Starboy",
        artist: "The Weeknd",
        lyric: "Look what you've _____",
        answer: "Done",
        options: ["Won", "Done", "Lost", "Seen"]
    },
    {
        song: "Flowers",
        artist: "Miley Cyrus",
        lyric: "I can buy myself _____",
        answer: "Flowers",
        options: ["Diamonds", "Candy", "Flowers", "Houses"]
    }
];

function startGame(gameType) {
    gameState.gameType = gameType;
    gameState.stage = "lobby";
    gameState.round = 0;
    resetScores();
    assignRandomDJ();

    document.getElementById("game-menu").style.display = "none";
    document.getElementById("game-interface").style.display = "flex";

    const titles = {
        guessWho: "Guess Who Played This?",
        lyricDrop: "Lyric Line Drop"
    };

    document.getElementById("active-game-title").innerText =
        titles[gameType] || "Game";

    renderStage();
}

function endGame() {
    clearInterval(gameTimer);

    const audio = document.getElementById("game-audio");
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
    }

    gameState.stage = "menu";
    gameState.gameType = null;

    document.getElementById("game-menu").style.display = "grid";
    document.getElementById("game-interface").style.display = "none";
}

function advanceGameState() {
    gameState.stage = "playing";
    renderStage();

    if (gameState.gameType === "guessWho") {
        runGuessWhoGame();
    } else if (gameState.gameType === "lyricDrop") {
        loadLyricRound();
    }
}

function renderStage() {
    document.getElementById("lobby-screen").style.display =
        gameState.stage === "lobby" ? "block" : "none";

    document.getElementById("guess-who-stage").style.display =
        gameState.stage === "playing" && gameState.gameType === "guessWho"
            ? "block"
            : "none";

    document.getElementById("lyric-stage").style.display =
        gameState.stage === "playing" && gameState.gameType === "lyricDrop"
            ? "block"
            : "none";

    document.getElementById("winner-stage").style.display =
        gameState.stage === "finished" ? "block" : "none";
}

function resetScores() {
    gameState.players.forEach(p => (p.score = 0));
}

function assignRandomDJ() {
    const randomIndex = Math.floor(Math.random() * gameState.players.length);
    gameState.currentDJ = gameState.players[randomIndex].name;
}

function addScore(playerName, points) {
    const player = gameState.players.find(p => p.name === playerName);
    if (player) player.score += points;
}

function runGuessWhoGame() {
    const status = document.getElementById("gw-status");
    const instr = document.getElementById("gw-instruction");
    const timerEl = document.getElementById("timer-ring");
    const audio = document.getElementById("game-audio");

    status.innerText = "The DJ is picking a song... 🤫";
    instr.innerText = "Wait for the track to drop...";
    timerEl.innerText = "Wait";
    timerEl.classList.remove("active");

    setTimeout(() => {
        status.innerText = "Who played this?";
        instr.innerText = "Listen and vote below!";
        document.getElementById("voting-area").style.display = "block";

        gameState.timer = 30;
        timerEl.classList.add("active");
        timerEl.innerText = gameState.timer;

        audio.currentTime = 30;
        audio.play().catch(() => {});

        gameTimer = setInterval(() => {
            gameState.timer--;
            timerEl.innerText = gameState.timer;

            if (gameState.timer <= 0) {
                clearInterval(gameTimer);
                timerEl.classList.remove("active");
            }
        }, 1000);
    }, 3000);
}

function castVote(name) {
    clearInterval(gameTimer);

    const audio = document.getElementById("game-audio");
    audio.pause();

    document.getElementById("voting-area").style.display = "none";

    const status = document.getElementById("gw-status");
    const instr = document.getElementById("gw-instruction");

    if (name === gameState.currentDJ) {
        status.innerText = `Correct! It was ${gameState.currentDJ} 🎉`;
        instr.innerText = "Nice guess!";
    } else {
        status.innerText = `Wrong! It was ${gameState.currentDJ} 😜`;
        instr.innerText = "Better luck next time.";
    }

    setTimeout(() => {
        audio.currentTime = 0;
        audio.play();
    }, 2000);
}


function loadLyricRound() {
    if (gameState.round >= lyricQuestions.length) {
        showWinnerScreen();
        return;
    }

    const q = lyricQuestions[gameState.round];

    document.getElementById("lyric-song").innerText =
        `${q.song} - ${q.artist}`;
    document.getElementById("lyric-text").innerText = `"${q.lyric}"`;

    const feedback = document.getElementById("lyric-feedback");
    feedback.style.display = "none";

    const options = document.getElementById("lyric-options");
    options.innerHTML = "";

    q.options.forEach(opt => {
        const btn = document.createElement("button");
        btn.className = "lyric-opt-btn";
        btn.innerText = opt;
        btn.onclick = () => submitLyricAnswer(opt, q.answer);
        options.appendChild(btn);
    });
}

function submitLyricAnswer(selected, correct) {
    document
        .querySelectorAll(".lyric-opt-btn")
        .forEach(b => (b.disabled = true));

    const feedback = document.getElementById("lyric-feedback");
    feedback.style.display = "block";

    if (selected === correct) {
        addScore("You", 100);
        feedback.innerText = "Correct! +100 Points 🎵";
        feedback.style.color = "#22c55e";
    } else {
        feedback.innerText = `Wrong! Answer was: ${correct}`;
        feedback.style.color = "#ef4444";
    }

    simulateOpponentScores();

    setTimeout(() => {
        gameState.round++;
        loadLyricRound();
    }, 2000);
}

function simulateOpponentScores() {
    gameState.players.forEach(p => {
        if (p.name !== "You" && Math.random() > 0.5) {
            p.score += 100;
        }
    });
}


function showWinnerScreen() {
    gameState.stage = "finished";
    renderStage();

    const sorted = [...gameState.players].sort(
        (a, b) => b.score - a.score
    );

    const list = document.getElementById("winner-list");
    list.innerHTML = "";

    sorted.forEach((p, i) => {
        const row = document.createElement("div");
        row.className = "winner-row";
        row.innerHTML = `
            <span>#${i + 1} ${p.name}</span>
            <span style="font-weight:800; color:var(--accent);">
                ${p.score} pts
            </span>
        `;
        list.appendChild(row);
    });
}
