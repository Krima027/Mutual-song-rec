// --- STATE MANAGEMENT ---
let myGroups = [
    { id: 1, name: "Chill Drives", members: ["You", "Rahul"], active: false },
    { id: 2, name: "Late Night Study", members: ["You", "Hemangi", "Dev"], active: false }
];

let selectedFriends = [];
const allUsers = ["Hemangi", "Rahul", "Dev", "Priya", "Amit", "Sara"]; // Mock Database

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    renderGroupList();
});

// --- RENDER GROUP SIDEBAR ---
function renderGroupList() {
    const container = document.getElementById('group-list-content');
    container.innerHTML = '';

    myGroups.forEach(grp => {
        const item = document.createElement('div');
        item.className = `group-card-item ${grp.active ? 'active' : ''}`;
        item.onclick = () => openGroup(grp.id);
        
        // Random gradient for avatar
        const hue = Math.floor(Math.random() * 360);
        item.innerHTML = `
            <div class="g-avatar" style="background: linear-gradient(45deg, hsl(${hue}, 60%, 50%), hsl(${hue + 40}, 60%, 50%));">
                <i class="fas fa-music"></i>
            </div>
            <div>
                <div style="font-weight:700; font-size:0.9rem;">${grp.name}</div>
                <div style="font-size:0.7rem; color:#aaa;">${grp.members.length} Members</div>
            </div>
        `;
        container.appendChild(item);
    });
}

// --- NAVIGATION LOGIC ---
function showCreateView() {
    document.getElementById('view-empty').style.display = 'none';
    document.getElementById('view-active').style.display = 'none';
    document.getElementById('view-create').style.display = 'block';
    
    // Reset inputs
    document.getElementById('newGroupName').value = '';
    document.getElementById('selectedFriends').innerHTML = '';
    selectedFriends = [];
}

function cancelCreate() {
    document.getElementById('view-create').style.display = 'none';
    document.getElementById('view-empty').style.display = 'flex';
}

function openGroup(id) {
    const group = myGroups.find(g => g.id === id);
    if (!group) return;

    // UI Updates
    document.getElementById('view-empty').style.display = 'none';
    document.getElementById('view-create').style.display = 'none';
    document.getElementById('view-active').style.display = 'flex';

    // Set Header Info
    document.getElementById('activeGroupName').innerText = group.name;
    document.getElementById('activeGroupMembers').innerText = `${group.members.join(", ")} • Active Jam`;

    // 1. GENERATE PLAYLIST (Mock ML Model)
    generatePlaylist(group.name);

    // 2. LOAD CHAT
    loadChat(group.id);
}

// --- CREATE GROUP LOGIC ---
function searchFriends() {
    const input = document.getElementById('friendSearchInput').value.toLowerCase();
    const resultsBox = document.getElementById('searchResults');
    resultsBox.innerHTML = '';

    if (input.length > 0) {
        resultsBox.style.display = 'block';
        const matches = allUsers.filter(u => u.toLowerCase().includes(input) && !selectedFriends.includes(u));
        
        matches.forEach(user => {
            const div = document.createElement('div');
            div.className = 'search-res-item';
            div.innerHTML = `<span>${user}</span> <i class="fas fa-plus"></i>`;
            div.onclick = () => addFriendToSelection(user);
            resultsBox.appendChild(div);
        });
        if(matches.length === 0) resultsBox.style.display = 'none';
    } else {
        resultsBox.style.display = 'none';
    }
}

function addFriendToSelection(name) {
    selectedFriends.push(name);
    document.getElementById('friendSearchInput').value = '';
    document.getElementById('searchResults').style.display = 'none';
    renderSelectedFriends();
}

function renderSelectedFriends() {
    const container = document.getElementById('selectedFriends');
    container.innerHTML = selectedFriends.map(f => `
        <div class="friend-chip">${f} <i class="fas fa-times" style="cursor:pointer;" onclick="removeFriend('${f}')"></i></div>
    `).join('');
}

function removeFriend(name) {
    selectedFriends = selectedFriends.filter(f => f !== name);
    renderSelectedFriends();
}

function finalizeGroup() {
    const name = document.getElementById('newGroupName').value;
    if (!name) return alert("Please name your group!");
    if (selectedFriends.length === 0) return alert("Add at least one friend!");

    const newGroup = {
        id: Date.now(),
        name: name,
        members: ["You", ...selectedFriends],
        active: true
    };

    myGroups.push(newGroup);
    renderGroupList();
    openGroup(newGroup.id); // Go directly to new group
}

// --- JAM FUNCTIONS ---
function generatePlaylist(seed) {
    const trackList = document.getElementById('jamTrackList');
    trackList.innerHTML = ''; // Clear old

    // Mock Songs
    const songs = [
        { t: "Blinding Lights", a: "The Weeknd" },
        { t: "Levitating", a: "Dua Lipa" },
        { t: "Starboy", a: "The Weeknd" },
        { t: "As It Was", a: "Harry Styles" },
        { t: "Flowers", a: "Miley Cyrus" }
    ];

    // "ML" Shuffle
    songs.sort(() => Math.random() - 0.5);

    songs.forEach((s, i) => {
        const div = document.createElement('div');
        div.className = 'jam-track';
        div.innerHTML = `
            <div class="jt-info"><h5>${s.t}</h5><span>${s.a}</span></div>
            <i class="fas fa-play" style="font-size:0.8rem; color:#aaa;"></i>
        `;
        div.onclick = () => window.playSong(s.t, s.a); // Calls global player
        trackList.appendChild(div);
    });
}

// --- CHAT LOGIC ---
function loadChat(groupId) {
    const chat = document.getElementById('chatWindow');
    chat.innerHTML = `
        <div class="c-msg inc"><span class="sender-name">System</span>Jam started! Playlist generated based on everyone's taste.</div>
    `;
}

function sendMessage() {
    const input = document.getElementById('chatInput');
    const txt = input.value;
    if (!txt) return;

    const chat = document.getElementById('chatWindow');
    
    // Add My Message
    const myMsg = document.createElement('div');
    myMsg.className = 'c-msg out';
    myMsg.innerText = txt;
    chat.appendChild(myMsg);

    input.value = '';
    chat.scrollTop = chat.scrollHeight;

    // Simulate Reply
    setTimeout(() => {
        const reply = document.createElement('div');
        reply.className = 'c-msg inc';
        reply.innerHTML = `<span class="sender-name">Hemangi</span>${["Nice song!", "Skip this one?", "Love this vibe!"][Math.floor(Math.random()*3)]}`;
        chat.appendChild(reply);
        chat.scrollTop = chat.scrollHeight;
    }, 1500);
}