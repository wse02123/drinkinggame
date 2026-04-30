
    let myInfo = { nickname: '', emoji: '?��', imageUrl: '', isHost: false, score: 0 };
    let isHostLevel = false;

    // 목업???�이?�는 고정?�둠 (PRD �?증명??
    const trueLiarName = ""; 

    // 배포 ?�경?��?�????�상 가�??�바?��?주입?��? ?�음
    let dummyAvatars = [];

    window.onload = () => { 
        // PRD 1. ?�원가?? 로컬?�???�동
        const saved = localStorage.getItem('partyGameUser');
        if (saved) {
            try {
                myInfo = JSON.parse(saved);
                document.getElementById('signupNickname').value = myInfo.nickname;
                if(myInfo.imageUrl) { document.getElementById('signupEmoji').innerHTML = `<img src="${myInfo.imageUrl}" style="width:100%;height:100%;object-fit:cover; border-radius:50%;">`; }
                else { document.getElementById('signupEmoji').innerText = myInfo.emoji; }
            } catch(e) {}
        } else {
            generateRandomPName('signupNickname'); 
        }

        // Fix 1: 로비?�서 ?�시�?�?목록??주기?�으�?가?�옵?�다 (5�?간격)
        setInterval(() => {
            if (socket && socket.connected && document.getElementById('view-lobby').classList.contains('active')) {
                socket.emit('room:list');
            }
        }, 5000);
    }
    
    const emojis = ['?��','?��','?��','?��','?��','?��','?��','?��','?��','?��','?��','?��','?��','?��','?��','?��','?��','?��'];

    // 1-3: ?�네??경우?????�???��? (50×50 = 2,500 조합 + ?�자 suffix)
    const pfx = [
        '만취??,'?�난','?�울??,'졸린','춤추??,'?�래?�는','?�리지르는','조용??,'말많?�','?�물?�는',
        '?�고?�는','?�난','?�하??,'뻗어버린','집에가고싶?�','첫잔??,'막잔??,'?�샷?�는','반샷?�는','꺾어마시??,
        '물마?�는','?�주빨세?�는','계산?�는','?�망가??,'?�는척하??,'?�게?�잘?�는','벌칙받는','?�브?�하??,'?�역?�생?�중??,'?�름?�긴',
        '기억?�실','?�일?�없??,'?�늘만사??,'지각한','먼�?가??,'?�까지?�는','?�시?�는','?�리�?르는','길바?�에?�운','?�남친한?�전?�하??,
        '?�여친한?�연?�하??,'고백?�는','?�소리하??,'진�??�진','꼰�?짓하??,'?�떼?�말?�야?�는','?�션?�른','분위기메?�커','갑분?�만?�는','?�소리하??,
        '귀?�운척하??,'치명?�인척하??,'?�척?�는','?�빌?�달?�는','지갑잃?�버�?,'?�드?�깨�?,'?�발?�어버린','길잃?�','?�무?�붙?�는','?�비거는',
        '?�상착해�?,'갑자기우??,'갑자기웃??,'?�장?��???,'거울보는','?�진찍는','브이?�는','?�스?�?�리??,'?�토리올리는','릴스찍는',
        '?�톡찍는','?�튜버인척하??,'?�플루언?�인척하??,'?�예?�병걸린','춤신춤왕','?�수?�','?�쓰','주당','?�맥마는','??��주제조기',
        '콜라마시??,'?�이?�마?�는','?��?마시??,'초코?�몽마시??,'?�취?�소?�먹??,'?�이?�크림사?�는','?�배?�러가??,'공기마시?��???,'바람?�러가??,'?�신차리?�는',
        '멀쩡한척하??,'?�취?�척?�는','취했?�고?�기??,'?�톤??,'?�당무된','창백?�진','?��?�?,'?�꼬인','?�던말또?�는','비�???��?�는'
    ];
    const sfx = [
        '?�입?�원','?�턴','?��?,'과장','차장','부??,'?�사','?�무','?�무','?�장',
        '?�장','?�바??,'매니?�','?�장','?�장??,'?�님','진상','?�골','?�?�생','?�입??,
        '?�내�?,'복학??,'졸업??,'취�???,'고시??,'직장??,'백수','?�리?�서','?��???,'?�줌�?,
        '?�아버�?','?�머??,'?�네??,'?�네?�나','?�네?�빠','?�네?�니','?�네?�생','?�집?��???,'?�집?�줌�?,'?�랫집학??,
        '건물�?,'?�입??,'갓물�?,'?�싸','?�싸','관�?,'쭈구�?,'?�찐','찐따','?�인??,
        '?�재','줌마','?�배','?�매','?�촌','?�모','고모','조카','?�남','차남',
        '막내','?��?','차�?','?�동','?�둥??,'천재','바보','?�재','?�재','?�재',
        '몸짱','?�짱','?�얼','?��?,'?�피','?�러리스??,'관찰자','방�???,'?�결??,'?�러블메?�커',
        '?�화주의??,'?�투민족','?�계??,'지구인','?�성??,'로봇','?�공지??,'?�이보그','?�연변??,'초능?�자',
        '마법??,'?�정','천사','?�마','?�령','좀�?,'뱀?�이??,'?��??�간','?�명?�간','?�톨??
    ];
    let cIdx = 0;

    function getDrunkBgColor(score) {
        if (score >= 3) return "#fca5a5"; 
        if (score >= 1) return "#fee2e2"; 
        return "#ffffff"; 
    }

    function changeEmoji(targetId) { cIdx=(cIdx+1)%emojis.length; const e=document.getElementById(targetId); e.innerHTML=emojis[cIdx]; myInfo.imageUrl=''; }

    // 1-2: ?�제 ?�진 ?�로??(FileReader ??Base64, 모바??갤러�?직접 ?�동)
    function handlePhotoUpload(event, targetId) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(ev) {
            const base64 = ev.target.result;
            const el = document.getElementById(targetId);
            el.innerHTML = '<img src="' + base64 + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
            myInfo.imageUrl = base64;
            // ?�로??모달?�면 ?�?�도 ?�동
            if (targetId === 'currentEmoji') {
                localStorage.setItem('partyGameUser', JSON.stringify(myInfo));
            }
        };
        reader.readAsDataURL(file);
    }
    function uploadPhotoMock(targetId) { const e=document.getElementById(targetId); e.innerHTML=`<img src="https://i.pravatar.cc/150?u=123" style="width:100%;height:100%;object-fit:cover; border-radius:50%;">`; myInfo.imageUrl="https://i.pravatar.cc/150?u=123"; }
    // 1-3: ?�네???�덤 ?�성 - ?�자 suffix ?�함 (30×30×99 ??89,100 조합)
    function generateRandomPName(inputId) {
        const p = pfx[Math.floor(Math.random() * pfx.length)];
        const s = sfx[Math.floor(Math.random() * sfx.length)];
        const num = Math.floor(Math.random() * 99) + 1;
        const combined = (p + ' ' + s + num);
        document.getElementById(inputId).value = combined;
    }
    
    function switchView(id) { document.querySelectorAll('.view').forEach(v=>v.classList.remove('active')); document.getElementById(id).classList.add('active'); }
    
    let alertCallback = null;
    let _alertAutoCloseTimer = null;
    function showCustomAlert(msg, callback, autoClose=false) {
        if (typeof msg === 'string' && (msg.includes('<') || msg.includes('&'))) {
            document.getElementById('customAlertMsg').innerHTML = msg;
        } else {
            document.getElementById('customAlertMsg').innerText = msg;
        }
        document.getElementById('modal-alert-custom').classList.add('active');
        alertCallback = callback;
        // autoClose: true ??2.5�????�동 ?�기
        if (_alertAutoCloseTimer) clearTimeout(_alertAutoCloseTimer);
        if (autoClose) {
            _alertAutoCloseTimer = setTimeout(() => {
                if (document.getElementById('modal-alert-custom').classList.contains('active')) {
                    closeCustomAlert();
                }
            }, 2500);
        }
    }
    function closeCustomAlert() {
        if (_alertAutoCloseTimer) { clearTimeout(_alertAutoCloseTimer); _alertAutoCloseTimer = null; }
        document.getElementById('modal-alert-custom').classList.remove('active');
        const cb = alertCallback;
        alertCallback = null;
        if (cb) cb();
    }
    function closeModalDirect(id) { document.getElementById(id).classList.remove('active'); }

    function handleSignup() {
        const nn = document.getElementById('signupNickname').value.trim();
        if(!nn) return showCustomAlert('?�네?�을 ?�력?�세??');
        myInfo.nickname = nn; 
        // ?��?지가 ?�을 ?�만 emoji ?�스???�??(?��?지 ?�으�?imageUrl ?��?)
        const emojiEl = document.getElementById('signupEmoji');
        const hasImg = emojiEl.querySelector('img');
        if (!hasImg) {
            const eText = emojiEl.innerText;
            myInfo.emoji = eText ? eText : '?��';
            myInfo.imageUrl = '';  // ?��?지 ?�으�?초기??        }
        
        // 로컬 ?�???�료
        localStorage.setItem('partyGameUser', JSON.stringify(myInfo));

        applyProfileToLobby();
        switchView('view-lobby');
        showLoading('lobby', '게임�?찾는 �?..<br><span style="font-size:0.5em; opacity:0.7">?�시�?기다?�주?�요</span>');
    }

    function applyProfileToLobby() {
        document.getElementById('lobbyUserName').innerText = myInfo.nickname;
        const lobEmojiEl = document.getElementById('lobbyUserEmoji');
        if (myInfo.imageUrl) { lobEmojiEl.innerHTML=`<img src="${myInfo.imageUrl}" style="width:100%;height:100%;object-fit:cover; border-radius:50%;">`; } 
        else { lobEmojiEl.innerHTML=myInfo.emoji; }
    }

    function openProfileModal() {
        document.getElementById('modal-edit-profile').classList.add('active');
        document.getElementById('nicknameInput').value = myInfo.nickname;
        if (myInfo.imageUrl) { document.getElementById('currentEmoji').innerHTML = `<img src="${myInfo.imageUrl}" style="width:100%;height:100%;object-fit:cover; border-radius:50%;">`; }
        else { document.getElementById('currentEmoji').innerText = myInfo.emoji; }
    }

    function saveProfile() {
        const nn = document.getElementById('nicknameInput').value.trim();
        if(!nn) return showCustomAlert('?�네?�을 ?�력?�세??');
        myInfo.nickname = nn; 
        const eText = document.getElementById('currentEmoji').innerText;
        myInfo.emoji = eText ? eText : '?��';
        myInfo.name = nn; // myInfo ??name �?nickname ?�일
        
        localStorage.setItem('partyGameUser', JSON.stringify(myInfo));

        applyProfileToLobby();
        closeModalDirect('modal-edit-profile');
        
        if (document.getElementById('view-room').classList.contains('active')) {
            renderRoomAvatars(isHostLevel);
        }
    }

    function filterRooms() {
        const term = document.getElementById('roomSearchInput').value.trim().toLowerCase();
        // Gate 4: ?�버?�서 받�? ?�시�?�?목록 ?�터�?        if (latestRoomList.length > 0) {
            renderRoomList(latestRoomList.filter(r => r.name.toLowerCase().includes(term)));
        } else {
            // Gate 3 ?�백: 로컬 DOM ?�터
            document.querySelectorAll('.room-card-item').forEach(el => {
                const title = el.getAttribute('data-name')?.toLowerCase() || '';
                el.style.display = title.includes(term) ? 'flex' : 'none';
            });
        }
    }

    let currentClickRoomName = '';
    function tryJoinLockRoom(rName) {
        currentClickRoomName = rName;
        document.getElementById('pwRoomNameLabel').innerText = rName;
        document.getElementById('modal-enter-password').classList.add('active');
    }

    // ======================================================
    // Gate 4: ?�켓 기반 �??�장 (Mock ?��?
    // ======================================================
    function joinRoomMock(asHost, rName) {
        // ?�위 ?�환???��? ???�켓 ?�결 ?�패 ??Mock?�로 ?�백
        if (!socket || !socket.connected) {
            closeModalDirect('modal-create-room');
            closeModalDirect('modal-enter-password');
            setupRoom(asHost, rName);
            switchView('view-room');
            return;
        }
        const pw = document.querySelector('#modal-enter-password input')?.value || '';
        if (asHost) {
            const roomName = document.getElementById('createRoomNameInput').value.trim() || '?�로???�이�?;
            const roomPw   = document.querySelector('#modal-create-room input[type=password]')?.value || '';
            showLoading('room');
            socket.emit('room:create', {
                name: roomName,
                password: roomPw,
                user: { nickname: myInfo.nickname, emoji: myInfo.emoji, photoUrl: myInfo.imageUrl || null }
            }, (res) => {
                hideLoading();
                if (!res.success) return showCustomAlert(res.message);
                closeModalDirect('modal-create-room');
                currentRoomId = res.room.id;
                currentInviteCode = res.room.inviteCode;
                currentInvitePw   = res.room.invitePassword;
                setupRoom(true, res.room.name);
                renderSocketAvatars(res.users);
                switchView('view-room');
                showToast(`�??�성 ?�료! ID: ${res.room.id}`);
            });
        } else {
            // 비�?�??�장
            showLoading('room');
            socket.emit('room:join', {
                roomId: currentClickRoomId,
                password: pw,
                user: { nickname: myInfo.nickname, emoji: myInfo.emoji, photoUrl: myInfo.imageUrl || null }
            }, (res) => {
                hideLoading();
                if (!res.success) return showCustomAlert(res.message);
                closeModalDirect('modal-enter-password');
                currentRoomId = res.room.id;
                setupRoom(false, res.room.name);
                renderSocketAvatars(res.users);
                isHostLevel = res.hostSocketId === socket.id;
                updateRoomControls();
                switchView('view-room');
            });
        }
    }

    // 공개�??�릭 ?�장
    function joinOpenRoom(roomId, rName) {
        if (!socket || !socket.connected) return joinRoomMock(false, rName);
        currentClickRoomId = roomId;
        showLoading('room');
        socket.emit('room:join', {
            roomId,
            password: '',
            user: { nickname: myInfo.nickname, emoji: myInfo.emoji, photoUrl: myInfo.imageUrl || null }
        }, (res) => {
            hideLoading();
            if (!res.success) return showCustomAlert(res.message);
            currentRoomId = res.room.id;
            setupRoom(false, res.room.name);
            renderSocketAvatars(res.users);
            isHostLevel = res.hostSocketId === socket.id;
            updateRoomControls();
            switchView('view-room');
        });
    }

    function setupRoom(asHost, rName) {
        isHostLevel = asHost;
        myInfo.isHost = asHost;
        myInfo.score = 0; 
        dummyAvatars.forEach(u => u.score = 0); 

        document.getElementById('headerRoomTitle').innerText = rName;
        document.getElementById('host-controls').style.display = asHost ? 'flex' : 'none';
        document.getElementById('guest-controls').style.display = asHost ? 'none' : 'flex';
        
        document.querySelectorAll('.host-only').forEach(btn => {
            btn.style.display = asHost ? 'flex' : 'none';
        });
        
        document.getElementById('roomCount').innerText = `${dummyAvatars.length + 1}�?;
        renderRoomAvatars(asHost);
    }

    function renderRoomAvatars(asHost) {
        const grid = document.getElementById('avatarGrid');
        let allUsers = [myInfo, ...dummyAvatars];
        let maxScore = Math.max(...allUsers.map(u => u.score));
        
        grid.innerHTML = '';
        
        allUsers.forEach((u, i) => {
            const isMe = (u === myInfo);
            const isHostNode = (isMe && asHost) || (!isMe && u.isHost);
            const isCrownTarget = (u.score > 0 && u.score === maxScore); // PRD: 최고?�을 가�??�에�??��? ?�워주기

            const imgHTML = u.imageUrl ? `<img src="${u.imageUrl}" style="width:100%;height:100%;object-fit:cover; border-radius:50%;">` : u.emoji;
            const crownHtml = isCrownTarget ? `<div class="host-crown"><svg width="18" height="18" viewBox="0 0 24 24" fill="var(--point-red)" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"><path d="M2 22h20M2 20l4-12 4 6 2-10 2 10 4-6 4 12"/></svg></div>` : '';
            
            let label = u.nickname || u.name;
            if(isHostNode) label += ' (방장)';
            if(isMe) label += ' (??';

            grid.innerHTML += `
                <div class="wf-avatar-card ${isMe ? 'is-me' : ''}" id="${isMe ? 'avatar-me' : ''}">
                    ${crownHtml}
                    <div class="wf-emoji" style="background-color:${getDrunkBgColor(u.score)}">${imgHTML}</div>
                    <div class="avatar-name">${label}</div>
                    <div class="avatar-score">?�� ${u.score} ??/div>
                </div>`;
        });
    }

    let roomSelectedGameName = '?�이??게임';
    function selectGame(el, gameName) {
        const wrapper = el.parentElement;
        wrapper.querySelectorAll('.game-selector').forEach(sel => {
            sel.classList.remove('selected');
            sel.classList.add('unselected');
            sel.querySelector('.game-icon').style.background = '#bbb';
        });
        el.classList.add('selected');
        el.classList.remove('unselected');
        el.querySelector('.game-icon').style.background = 'var(--point-soju)';
        roomSelectedGameName = gameName;
    }

    function startGameHost() {
        if (document.getElementById('avatarGrid').children.length < 2) {
            showCustomAlert('?�자?�는 게임???�작?????�습?�다!<br>2�??�상 모여???�니??');
            return;
        }
        if (!socket || !socket.connected) {
            // Gate 3 ?�백
            if (roomSelectedGameName === '?�이??게임') startLiarEngine();
            else showCustomAlert('구현 ?�정??기능?�니?? (준비중)');
            return;
        }
        showLoading('game');
        socket.emit('game:start', { gameName: roomSelectedGameName }, (res) => {
            hideLoading();
            if (!res.success) showCustomAlert(res.message || '게임 ?�작 ?�패');
        });
    }

    function requestGameGuest() {
        // Gate 4: ?�켓?�로 �??�체???�림 ?�송
        if (socket && socket.connected) {
            socket.emit('game:request', { gameName: roomSelectedGameName });
        }
        // 로컬 즉시 ?�각 ?�과 (?�신 ?�면)
        _showGameRequestEffect(roomSelectedGameName);
    }

    function _showGameRequestEffect(gameName) {
        const myAvatarNode = document.getElementById('avatar-me');
        if (myAvatarNode) {
            const existing = myAvatarNode.querySelector('.speech-bubble');
            if (existing) existing.remove();
            const bubble = document.createElement('div');
            bubble.className = 'speech-bubble';
            bubble.innerText = `[${gameName}] 진행?�켜!`;
            myAvatarNode.appendChild(bubble);
            setTimeout(() => { if(bubble.parentNode) bubble.remove(); }, 2000);
        }
        // PRD 2.3 ?�력 지???�래??        const flasher = document.getElementById('flashScreen');
        flasher.classList.remove('flash-active');
        void flasher.offsetWidth;
        flasher.classList.add('flash-active');
    }

    function exitRoom() { switchView('view-lobby'); }

    function copyInviteBoard() {
        const roomName = document.getElementById('headerRoomTitle').innerText;
        // Gate 4: ?�버?�서 받�? ?�제 초�?코드 & 비�?번호 ?�용
        const link = currentInviteCode || `${window.location.origin}/join/${currentRoomId || 'XXXXXXXX'}`;
        const pwLine = currentInvitePw ? `비�?번호: ${currentInvitePw}` : '비�?번호: ?�음 (공개�?';
        const txt = `[�? ?�같???�게??\n�??�름: ${roomName}\n${pwLine}\n초�? 링크: ${link}`;
        if(navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(txt).then(()=>showToast('초�? ?�보가 복사?�었?�니??')).catch(()=>showToast('복사 ?�패!'));
        } else {
            showToast('초�? ?�보가 복사?�었?�니??');
        }
    }
    function showToast(msg) {
        const t = document.getElementById('toast');
        if(msg) t.innerText = msg;
        t.className = "show";
        setTimeout(() => { t.className = t.className.replace("show", ""); }, 3000);
    }

    let loadingInterval = null;
    function showLoading(context) {
        document.getElementById('loadingModal').classList.add('active');
        let index = 0;
        const messages = context === 'room' ? [
            {title:"?�자�??�팅 �?..?��", desc:"?�주 주문?�고 ?�습?�다"},
            {title:"?�주�??�는 �?..?��", desc:"?�버?� �??�는 중입?�다"}
        ] : [
            {title:"게임 ?�팅 �?..?��", desc:"�??�명???�는 중입?�다"},
            {title:"?�리??준�?�?..?��", desc:"?�이?��? 고르�??�습?�다"}
        ];
        
        const updateText = () => {
            document.getElementById('loadingTitle').innerText = messages[index].title;
            document.getElementById('loadingDesc').innerText = messages[index].desc;
            index = (index + 1) % messages.length;
        };
        updateText();
        loadingInterval = setInterval(updateText, 2500);
    }
    
    function hideLoading() {
        document.getElementById('loadingModal').classList.remove('active');
        clearInterval(loadingInterval);
    }

    // --- Liar JS Engine (Gate 3 ?�백?????�켓 ?�결 ???�버가 ?�어) ---
    let failLoopCount = 0;
    let isForceMode = false;
    let selectedSuspect = null;
    let activeTimer = null;

    function startTick(elementId, seconds, onComplete, tickCallback) {
        // 4-1: ?�켓 ?�결 ???�라?�언???�?�머 ?�전 차단
        if (socket && socket.connected) return;
        clearInterval(activeTimer);
        const el = document.getElementById(elementId);
        let t = seconds;
        let maxT = seconds;
        const tick = () => {
            if (t <= 0) {
                clearInterval(activeTimer); 
                if(el) el.innerText = "00:00"; 
                if(tickCallback) tickCallback(0, maxT);
                if(onComplete) onComplete();
            } else {
                let m = Math.floor(t / 60); let s = t % 60; 
                if(el) el.innerText = `${elementId==='agreeTimer'?'?��? ?�간 ':''}${m<10?'0'+m:m}:${s<10?'0'+s:s}`;
                if(tickCallback) tickCallback(t, maxT);
            }
            t--;
        };
        tick();
        activeTimer = setInterval(tick, 1000);
    }

    // 4-4: ?�켓 ?�결 중엔 ?�라?�언???�진 ?�행 차단
    function startLiarEngine() {
        if (socket && socket.connected) return; // ?�버가 game:phase�??�어
        failLoopCount = 0; isForceMode = false;
        document.getElementById('keywordSubmitInput').value = '';
        switchView('view-liar-discuss');
        
        const beerBg = document.getElementById('discussBeerBg');
        // PRD 3-4. 가변 ?�론 ?�??(?�원*30�?+ 60�? ?��?�?기존 ?�드�?20�??�축 반영
        startTick('discussTimer', 20, () => { if (isHostLevel) startVotingPhase(); }, (currentSec, maxSec) => {
            if(beerBg) {
                const percent = (currentSec / maxSec) * 100;
                beerBg.style.height = `${percent}%`;
            }
        });
    }

    // 3-3: 방장 ?�킵 ???�켓 ?�결 ???�버???�림, 비연�???로컬 처리
    function startVotingPhase() {
        if (socket && socket.connected) {
            // ?�버???�론 ?�킵 ?�청 ???�버가 VOTING ?�이�?브로?�캐?�트
            socket.emit('game:phase_skip', { skipTo: 'VOTING' });
            return;
        }
        // Gate 3 ?�백 (?�켓 미연�???
        clearInterval(activeTimer);
        selectedSuspect = null;
        const btn = document.getElementById('voteCompleteBtn');
        btn.disabled = true;
        btn.innerHTML = '<span style="font-size:1em;">?��</span> ?�표?�기';
        const listDiv = document.getElementById('liarVoteList');
        listDiv.innerHTML = '';
        [myInfo, ...dummyAvatars].forEach(function(u) {
            const dispEmoji = u.imageUrl ? '<img src="'+u.imageUrl+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">' : u.emoji;
            listDiv.innerHTML += '<div class="vote-row" onclick="selectSuspectNode(this,\'' + u.name + '\',\'' + (u.imageUrl||u.emoji) + '\')"><span style="display:flex;align-items:center;gap:14px;"><div style="font-size:1.5em;width:34px;height:34px;border-radius:50%;overflow:hidden;display:flex;justify-content:center;align-items:center;border:2px solid var(--ink);background:' + getDrunkBgColor(u.score) + '">' + dispEmoji + '</div>' + u.name + '</span><div class="custom-check"><svg class="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" style="opacity:0;"><polyline points="20 6 9 17 4 12"/></svg></div></div>';
        });
        switchView('view-liar-vote');
        startTick('voteTimer', 20, function() { if(isHostLevel) submitVote(); });
    }

    let currentSuspectName = ''; let currentSuspectEmoji = '';
    function selectSuspectNode(el, name, emojiOrUrl) {
        document.querySelectorAll('.vote-row').forEach(row => {
            row.classList.remove('selected'); row.querySelector('.check-icon').style.opacity = '0';
        });
        el.classList.add('selected'); el.querySelector('.check-icon').style.opacity = '1';
        currentSuspectName = name; currentSuspectEmoji = emojiOrUrl;
        document.getElementById('voteCompleteBtn').disabled = false;
    }

    function submitVote() {
        if (socket && socket.connected) {
            if (!selectedSuspectSocketId) { showToast('?�표???�?�을 ?�택?�세??'); return; }
            socket.emit('game:vote', { targetSocketId: selectedSuspectSocketId });
            const btn = document.getElementById('voteCompleteBtn');
            btn.disabled = true;
            btn.innerText = '?�표 ?�료!';
            return;
        }
        // Gate3 ?�백
        if(!currentSuspectName) currentSuspectName = dummyAvatars[2]?.name || '???';
        const btn = document.getElementById('voteCompleteBtn');
        btn.disabled = true;
        btn.innerText = '결과 취합 �?..';
        setTimeout(() => {
            showCustomAlert('<span style="color:var(--point-blue); font-size:1.2em;">[' + currentSuspectName + ']</span><br/>가??많�? ?��? 받아 지목되?�습?�다!', () => {
                if(isForceMode) {
                    showCustomAlert('룰에 ?�라 무조�??�정?�었?�니??', () => startKeywordPhase());
                } else {
                    startDefensePhase();
                }
            }, true);
        }, 1500);
    }

    function startDefensePhase() {
        // ?�켓 ?�결 ?????�버??DEFENSE ?�킵 ?�청 (?�버가 game:phase 브로?�캐?�트)
        if (socket && socket.connected) {
            socket.emit('game:phase_skip', { skipTo: 'DEFENSE' });
            return;
        }
        // Gate3 ?�백
        document.getElementById('defenseName').innerText = currentSuspectName;
        if(currentSuspectEmoji && currentSuspectEmoji.includes('http')) {
            document.getElementById('defenseEmoji').innerHTML = `<img src="${currentSuspectEmoji}" style="width:100%;height:100%;object-fit:cover; border-radius:50%;">`;
        } else {
            document.getElementById('defenseEmoji').innerText = currentSuspectEmoji || '?��';
        }
        switchView('view-liar-defense');
        startTick('defenseTimer', 20, () => { if(isHostLevel) startAgreePhase(); });
    }

    function startAgreePhase() {
        // ?�켓 ?�결 ?????�버??AGREE ?�킵 ?�청
        if (socket && socket.connected) {
            socket.emit('game:phase_skip', { skipTo: 'AGREE' });
            return;
        }
        // Gate3 ?�백
        clearInterval(activeTimer);
        document.getElementById('agreeName').innerText = currentSuspectName;
        document.getElementById('failLoopStr').innerText = failLoopCount >= 1 ? `(미동???�적 1?? ?�번 부�???무조�??�정??)` : `(?�재 미동??0??`;
        switchView('view-liar-agree');
        startTick('agreeTimer', 20, () => { if(isHostLevel) handleAgree(); });
    }
    
    function handleDisagree() {
        if (socket && socket.connected) {
            socket.emit('game:agree', { agreed: false });
            return;
        }
        // Gate3 ?�백
        failLoopCount++;
        if(failLoopCount >= 2) {
            isForceMode = true;
            showCustomAlert('2??부�??�적! 마�?�?발언??거치�? ?�음 지목자??무조�??�이?�로 ?�정?�니??', () => { startLiarEngine(); });
        } else {
            showCustomAlert(`1�?미동??부�? 발언 ?�간??추�? 부?�하�??�투?�합?�다.`, () => { startLiarEngine(); });
        }
    }
    
    function handleAgree() {
        if (socket && socket.connected) {
            socket.emit('game:agree', { agreed: true });
            return;
        }
        // Gate3 ?�백
        showCustomAlert('<span style="color:var(--point-red); font-size:1.2em;">?�이?�로 최종 ?�결?�습?�다.</span><br/><br/>??�� ?�테?��?�??�동?�니??', () => { startKeywordPhase(); }, true);
    }

    function startKeywordPhase() {
        switchView('view-liar-keyword');
        document.getElementById('kwMsg').innerText = `[${currentSuspectName}] ?�이 ?��??�의 진짜 ?�시?��? 맞추�??�습?�다...`;
        
        const kwInput = document.getElementById('keywordSubmitInput');
        kwInput.disabled = false; 
        kwInput.value = '';
        kwInput.onkeydown = (e) => { if (e.key === 'Enter') finishLiarScoring(); };
        
        startTick('keywordTimer', 20, () => { if (isHostLevel) finishLiarScoring(); });
    }

    function finishLiarScoring() {
        clearInterval(activeTimer);
        const inputKey = document.getElementById('keywordSubmitInput').value.trim();
        if (socket && socket.connected) {
            // 비용?�자???�출 불�? (?�력�?disabled 체크)
            const kwInput = document.getElementById('keywordSubmitInput');
            if (kwInput.disabled) return;
            if (!inputKey) { showToast('?�시?��? ?�력?�주?�요!'); return; }
            socket.emit('game:keyword', { keyword: inputKey });
            kwInput.disabled = true;
            const btn = document.querySelector('#view-liar-keyword .btn-callbell');
            if (btn) btn.disabled = true;
            return;
        }
        // Gate3 ?�백
        const targetWord = "?�과"; 
        const isLiarWin = (inputKey === targetWord); 
        
        let targetUser = [myInfo, ...dummyAvatars].find(u => u.name === currentSuspectName);
        let rHtml = "";

        // PRD 3-6. ?�수 ?�정 (?�판) 규정 ?�벽 복구
        if(isLiarWin) {
            if (currentSuspectName === trueLiarName) {
                // ?�사?��? 진짜 ?�이?��??�면: +2???�득 (가??취함)
                targetUser.score += 2;
                rHtml = `<span style="font-size:3em;">?��</span><br/><strong style="color:var(--point-beer); font-size:1.5em; font-family:'Jua';">?�이???�??�� ?�리!</strong><br/><br/>본인??진짜 ?�이?��??�니??<br/>(+2??벌칙 ?�득)`;
            } else {
                // ?�사???�힌 ?��??�었?�면: +1???�득
                targetUser.score += 1;
                rHtml = `<span style="font-size:3em;">?��</span><br/><strong style="color:var(--point-beer); font-size:1.5em; font-family:'Jua';">?�이???�??�� ?�리!</strong><br/><br/>?�사?�는 ?�울???��??�었?�니??<br/>(+1??벌칙 ?�득) (진짜 ?�이?? 고인물유?�)`;
            }
        } else {
            // ?��? ?�리: ?�정?�는 무조�?0?? ?�른 구성?�들(?��? ?�원)?� ?�심??조건?�로 각각 +1???�득.
            [myInfo, ...dummyAvatars].forEach(u => {
                if(u.name !== currentSuspectName) u.score += 1;
            });
            rHtml = `<span style="font-size:3em;">?��</span><br/><strong style="color:var(--point-blue); font-size:1.5em; font-family:'Jua';">?��? ?�승!</strong><br/><br/>?�출?? [${inputKey||'?�음'}], ?�답: [${targetWord}]<br/><br/><strong style="font-size:1.1em; color:var(--point-red);">?�의???�존(0??!<br>?�머지 ?��? ?�원 축배 ?�� +1??/strong>`;
        }
        
        showCustomAlert(rHtml, () => { 
            renderRoomAvatars(isHostLevel); 
            switchView('view-room'); 
        }, true);
    }

    // ?�자�?종료 ?�인�?    function confirmFinishRoom() {
        if(confirm('?�늘???�자리�? 종료?�까??')) {
            finishRoom();
        }
    }

    // ?�자�?종료
    function finishRoom() {
        let allUsers = [myInfo, ...dummyAvatars].sort((a,b) => b.score - a.score);
        let topScore = allUsers[0].score;
        let topRankers = allUsers.filter(u => u.score === topScore); 
        
        let topHtml = '';
        topRankers.forEach(u => {
            const imgHTML = u.imageUrl ? `<img src="${u.imageUrl}" style="width:100%;height:100%;object-fit:cover; border-radius:50%;">` : u.emoji;
            topHtml += `<div style="display:flex; flex-direction:column; align-items:center;">
                            <div style="width:80px; height:80px; border-radius:50%; border:var(--border-style); box-shadow:2px 2px 0 var(--ink); display:flex; justify-content:center; align-items:center; font-size:3em; background-color:${getDrunkBgColor(u.score)}; overflow:hidden; margin-bottom:5px;">
                                ${imgHTML}
                            </div>
                            <span style="font-family:'Jua'; font-size:1.4em; color:var(--ink);">${u.name}</span>
                        </div>`;
        });
        document.getElementById('topRankersArea').innerHTML = topHtml;

        let html = '';
        allUsers.forEach((u, idx) => {
            let rankEmoji = (u.score > 0 && u.score === topScore) ? '?��' : '?��';
            if (u.score === 0) rankEmoji = '?��'; 
            html += `<div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px dashed #ccc; padding-bottom:5px;">
                        <span>${rankEmoji} ${u.name}</span>
                        <span style="color:var(--point-red); font-family:'Jua';">?�� ${u.score} ??/span>
                     </div>`;
        });
        
        document.getElementById('rankingList').innerHTML = html;
        document.getElementById('modal-result-capture').classList.add('active');
    }

    function shareResult() {
        const captureArea = document.getElementById('result-capture-content');
        html2canvas(captureArea, { backgroundColor: '#ffffff' }).then(canvas => {
            const imgData = canvas.toDataURL("image/jpeg");
            showToast('??�� ?��?지가 캡쳐?�어 공유 ?�업???�니??');
        });
    }


    // ======================================================
    // Gate 4: Socket.io ?�라?�언?????�체 ?�벤???�이??    // ======================================================

    // --- ?�태 변??---
    let socket = null;
    let currentRoomId    = null;
    let currentInviteCode = null;
    let currentInvitePw  = null;
    let currentClickRoomId = null;
    let latestRoomList   = [];
    let mySocketId       = null;

    // --- Socket 초기??(DOMContentLoaded ?�후) ---
    window.addEventListener('load', () => {
        try {
            socket = io();

            // ?�속 ?�공
            socket.on('connect', () => {
                mySocketId = socket.id;
                console.log('[?�켓 ?�결]', socket.id);
                if(document.getElementById('view-lobby').classList.contains('active')) showLoading('lobby', '게임�?찾는 �?..');
                socket.emit('room:list'); // 로비 �?목록 ?�청
            });

            // ---- �?목록 ?�신 ----
            socket.on('room:list', (rooms) => {
                hideLoading();
                latestRoomList = rooms;
                // 로비가 ?�성?�된 경우?�만 ?�더�?                if (document.getElementById('view-lobby').classList.contains('active')) {
                    renderRoomList(rooms);
                }
            });

            // ---- �??��? 목록 갱신 ----
            socket.on('room:users', (users) => {
                renderSocketAvatars(users);
                document.getElementById('roomCount').innerText = `${users.length}�?;
                // 방장 변�?반영
                const me = users.find(u => u.socketId === socket.id);
                if (me) {
                    isHostLevel = me.isHost;
                    updateRoomControls();
                }
            });

            // ---- 방장 변�?----
            socket.on('room:host_changed', ({ newHostSocketId }) => {
                isHostLevel = (newHostSocketId === socket.id);
                updateRoomControls();
                if (isHostLevel) showToast('방장???�었?�니?? ?��');
            });

            // ---- 방장 ?�탈???�른 권한 ?�임 ----
            socket.on('game:host_handoff', () => {
                isHostLevel = true;
                updateRoomControls();
                showToast('?�� 방장???��???방장 권한???�임받았?�니??');
            });

            // ---- 게임 ?�청 ?�림 (?�력지?? ----
            socket.on('game:request:broadcast', ({ requesterSocketId, requesterNickname, gameName }) => {
                // 3-1: ?�청???�바?�??말풍???�시 (?�른 ?�람 ?�면?�도 보임)
                const avatarEl = document.getElementById('avatar-' + requesterSocketId);
                if (avatarEl) {
                    const existing = avatarEl.querySelector('.speech-bubble');
                    if (existing) existing.remove();
                    const bubble = document.createElement('div');
                    bubble.className = 'speech-bubble';
                    bubble.innerText = '[' + gameName + '] 진행?�켜!';
                    avatarEl.appendChild(bubble);
                    setTimeout(() => { if(bubble.parentNode) bubble.remove(); }, 2500);
                }
                // 3-2: ?�청 ??카운??증�?
                const badge = document.getElementById('gameRequestBadge');
                const counter = document.getElementById('gameRequestCount');
                if (badge && counter) {
                    const cur = parseInt(counter.innerText) + 1;
                    counter.innerText = cur;
                    badge.style.display = 'block';
                    clearTimeout(badge._hideTimer);
                    badge._hideTimer = setTimeout(() => {
                        badge.style.display = 'none';
                        counter.innerText = '0';
                    }, 5000);
                }
                showToast(requesterNickname + '?�이 [' + gameName + '] ?�청!');
                const flasher = document.getElementById('flashScreen');
                flasher.classList.remove('flash-active');
                void flasher.offsetWidth;
                flasher.classList.add('flash-active');
            });

            // ---- ?�이??게임: ??�� �??�어 ?�신 ----
            socket.on('game:role', ({ isLiar, word, category }) => {
                document.getElementById('keywordSubmitInput').value = '';
                document.getElementById('roleWord').innerText = word;
                // 3-2: 카테고리 / ?�워???�벨 갱신
                const catEl = document.getElementById('roleCategory');
                if (catEl) catEl.innerText = '카테고리: [' + category + ']';
                switchView('view-liar-discuss');
            });

            // ---- 게임 ?�이�??�신 ----
            socket.on('game:phase', (data) => {
                switch(data.phase) {
                    case 'DISCUSSING':
                        switchView('view-liar-discuss');
                        document.getElementById('failLoopStr').innerText =
                            data.rejectCount > 0 ? `(미동??${data.rejectCount}???�적)` : '(?�재 미동??0??';
                        break;

                    case 'VOTING':
                        selectedSuspect = null;
                        const btn = document.getElementById('voteCompleteBtn');
                        btn.disabled = true;
                        btn.innerHTML = `<span style="font-size:1em;">?��</span> ?�표?�기`;
                        // ?�버?�서 받�? ?��? 목록?�로 ?�표 리스???�성
                        if (data.users) _renderVoteList(data.users);
                        switchView('view-liar-vote');
                        break;

                    case 'DEFENSE':
                        // accusedName/Emoji??game:accused ?�벤?�에???��? ?�팅??                        switchView('view-liar-defense');
                        break;

                    case 'AGREE':
                        document.getElementById('failLoopStr').innerText =
                            data.rejectCount >= 1 ? `(미동???�적 1?? ?�번 부�???무조�??�정??)` : '(?�재 미동??0??';
                        // agreeName?� game:accused ?�벤?�에???��? ?�팅??                        switchView('view-liar-agree');
                        break;

                    case 'KEYWORD': {
                        switchView('view-liar-keyword');
                        const kwSubmitBtn = document.querySelector('#view-liar-keyword .btn-callbell');
                        if (data.isAccused) {
                            document.getElementById('kwMsg').innerText = '?��??�의 진짜 ?�시?��? ?�력?�세??';
                            const kwInput2 = document.getElementById('keywordSubmitInput');
                            kwInput2.disabled = false;
                            kwInput2.value = '';
                            kwInput2.focus();
                            // ?�터???�출 ?�성??                            kwInput2.onkeydown = (e) => { if (e.key === 'Enter') finishLiarScoring(); };
                            if (kwSubmitBtn) kwSubmitBtn.style.display = '';
                        } else {
                            document.getElementById('kwMsg').innerText = '?�의?��? ?�워?��? ?�력 중입?�다... ?�️';
                            const kwInput2 = document.getElementById('keywordSubmitInput');
                            kwInput2.disabled = true;
                            kwInput2.value = '';
                            kwInput2.placeholder = '?�시�?기다?�주?�요...';
                            kwInput2.onkeydown = null;
                            if (kwSubmitBtn) kwSubmitBtn.style.display = 'none';
                        }
                        break;
                    }
                }
            });

            // ---- ?�버 ?�?�머 ?�신 ----
            socket.on('game:timer', ({ sec, totalSec }) => {
                const activeView = document.querySelector('.view.active');
                if (!activeView) return;
                const viewId = activeView.id;

                if (viewId === 'view-liar-discuss') {
                    const m = Math.floor(sec / 60), s = sec % 60;
                    const el = document.getElementById('discussTimer');
                    if (el) el.innerText = `${m<10?'0'+m:m}:${s<10?'0'+s:s}`;
                    // 맥주 ???�니메이??                    const beerBg = document.getElementById('discussBeerBg');
                    if (beerBg) beerBg.style.height = `${(sec / totalSec) * 100}%`;
                } else if (viewId === 'view-liar-vote') {
                    const el = document.getElementById('voteTimer');
                    if (el) el.innerText = sec;
                } else if (viewId === 'view-liar-defense') {
                    const m = Math.floor(sec / 60), s = sec % 60;
                    const el = document.getElementById('defenseTimer');
                    if (el) el.innerText = `${m<10?'0'+m:m}:${s<10?'0'+s:s}`;
                } else if (viewId === 'view-liar-agree') {
                    const m = Math.floor(sec / 60), s = sec % 60;
                    const el = document.getElementById('agreeTimer');
                    if (el) el.innerText = `?��? ?�간 ${m<10?'0'+m:m}:${s<10?'0'+s:s}`;
                } else if (viewId === 'view-liar-keyword') {
                    const m = Math.floor(sec / 60), s = sec % 60;
                    const el = document.getElementById('keywordTimer');
                    if (el) el.innerText = `${m<10?'0'+m:m}:${s<10?'0'+s:s}`;
                }
            });

            // ---- ?�표 ???�시�??�시 ----
            socket.on('game:vote_count', ({ voteCount }) => {
                const btn = document.getElementById('voteCompleteBtn');
                if (btn && btn.disabled) btn.innerText = `결과 취합 �?.. (${voteCount}??`;
            });

            // ---- 4-5: 무투???�덤 지�??�업 ----
            socket.on('game:accused_random', ({ accusedNickname }) => {
                showCustomAlert(
                    '<span style="font-size:2em;">?��</span><br>?�무???�표�??��? ?�아<br><strong style="color:var(--point-red);font-family:\'Jua\';font-size:1.3em;">' + accusedNickname + '</strong><br>?�이 ?�덤?�로 지목되?�어??',
                    null, true
                );
            });

            // ---- ?�의??발표 ----
            socket.on('game:accused', ({ accusedSocketId, accusedNickname, accusedEmoji, accusedPhoto }) => {
                currentSuspectName  = accusedNickname;
                currentSuspectEmoji = accusedPhoto || accusedEmoji;
                document.getElementById('defenseName').innerText = accusedNickname;
                const defEl = document.getElementById('defenseEmoji');
                if (accusedPhoto) {
                    defEl.innerHTML = `<img src="${accusedPhoto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
                } else {
                    defEl.innerText  = accusedEmoji;
                }
                document.getElementById('agreeName').innerText = accusedNickname;
            });

            // ---- 부�?----
            socket.on('game:rejected', ({ rejectCount }) => {
                const msg = rejectCount >= 2
                    ? '2??부�??�적! ?�음 지목자??무조�??�이?�로 강제 ?�정?�니??'
                    : '1�?미동??부�? ?�시 발언 ?�간???�립?�다.';
                // 2�????�동 ?�히 (백엔?�에??game:phase DISCUSSING ?�송 ?�정)
                showCustomAlert(msg, null, true);
            });

            // ---- ?�정 ----
            socket.on('game:confirmed', () => {
                // game:phase(KEYWORD)???�버?�서 별도�??��?�??�업�??�시
                showCustomAlert('<span style="color:var(--point-red);">?�이?�로 최종 ?�결?�습?�다.</span><br>??�� ?�테?��?�??�동?�니??', null, true);
            });

            // ---- 최종 결과 ?�신 ----
            socket.on('game:result', (data) => {
                // PRD 차등 ?�수 반영
                data.users.forEach(u => {
                    if (u.socketId === socket.id) myInfo.score = u.score;
                });

                let rHtml = '';
                if (data.isCorrect) {
                    if (data.isAccusedLiar) {
                        rHtml = `<span style="font-size:3em;">?��</span><br><strong style="color:var(--point-beer); font-size:1.5em; font-family:'Jua';">?�이???�??�� ?�리!</strong><br><br>진짜 ?�이?�의 ?�벽???�주!<br>(?�이?�에�?+2??벌칙)`;
                    } else {
                        rHtml = `<span style="font-size:3em;">?��</span><br><strong style="color:var(--point-beer); font-size:1.5em; font-family:'Jua';">?�이???�??�� ?�리!</strong><br><br>?�울???��??�었?�니??<br>(?�당 ?��? +1?? 진짜 ?�이?�는 무죄)`;
                    }
                } else {
                    rHtml = `<span style="font-size:3em;">?��</span><br><strong style="color:var(--point-blue); font-size:1.5em; font-family:'Jua';">?��? ?�승!</strong><br><br>?�출?? [${data.submittedKeyword||'?�음'}], ?�답: [${data.citizenWord}]<br><br><strong style="color:var(--point-red);">?�의???�존(0??!<br>?�머지 ?��? ?�원 축배 ?�� +1??/strong>`;
                }

                showCustomAlert(rHtml, () => {
                    renderSocketAvatars(data.users);
                    switchView('view-room');
                }, true);
            });

            socket.on('disconnect', () => {
                console.warn('[?�켓 ?��?]');
                showToast('?�버?� ?�결???�어졌습?�다');
            });

        } catch(e) {
            console.warn('[?�켓 초기???�패 ??Gate3 Mock 모드�??�행]', e);
        }
    });

    // ---- ?�표 리스???�더�?(?�켓 ?��? ?�이??기반) ----
    function _renderVoteList(users) {
        const listDiv = document.getElementById('liarVoteList');
        listDiv.innerHTML = '';
        users.forEach(u => {
            const dispContent = u.photoUrl
                ? `<img src="${u.photoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
                : u.emoji;
            listDiv.innerHTML += `
                <div class="vote-row" data-socket-id="${u.socketId}" onclick="selectSuspectSocket(this, '${u.socketId}', '${u.nickname}', '${u.photoUrl||u.emoji}')">
                    <span style="display:flex; align-items:center; gap:14px;">
                        <div style="font-size:1.5em; width:34px; height:34px; border-radius:50%; overflow:hidden; display:flex; justify-content:center; align-items:center; border:2px solid var(--ink); background:${getDrunkBgColor(u.score)}">${dispContent}</div>
                        ${u.nickname}${u.isHost ? ' (방장)' : ''}${u.socketId === socket?.id ? ' (??' : ''}
                    </span>
                    <div class="custom-check"><svg class="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" style="opacity:0;"><polyline points="20 6 9 17 4 12"/></svg></div>
                </div>`;
        });
    }

    let selectedSuspectSocketId = null;
    function selectSuspectSocket(el, socketId, name, emojiOrUrl) {
        document.querySelectorAll('.vote-row').forEach(row => {
            row.classList.remove('selected');
            row.querySelector('.check-icon').style.opacity = '0';
        });
        el.classList.add('selected');
        el.querySelector('.check-icon').style.opacity = '1';
        selectedSuspectSocketId = socketId;
        currentSuspectName  = name;
        currentSuspectEmoji = emojiOrUrl;
        document.getElementById('voteCompleteBtn').disabled = false;
    }

    // ---- ?�켓 ?�바?� 그리???�더�?----
    function renderSocketAvatars(users) {
        const grid = document.getElementById('avatarGrid');
        if (!grid) return;
        const maxScore = Math.max(0, ...users.map(u => u.score));
        grid.innerHTML = '';
        users.forEach(u => {
            const isMe = (u.socketId === socket?.id);
            const isCrown = u.score > 0 && u.score === maxScore;
            const imgHTML = u.photoUrl
                ? `<img src="${u.photoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
                : u.emoji;
            const crownHtml = isCrown
                ? `<div class="host-crown"><svg width="18" height="18" viewBox="0 0 24 24" fill="var(--point-red)" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"><path d="M2 22h20M2 20l4-12 4 6 2-10 2 10 4-6 4 12"/></svg></div>`
                : '';
            
            let label = u.nickname;
            if (u.isHost) label += ' (방장)';
            if (isMe) label += ' (??';
            
            grid.innerHTML += `
                <div class="wf-avatar-card ${isMe ? 'is-me' : ''}" id="${isMe ? 'avatar-me' : 'avatar-'+u.socketId}">
                    ${crownHtml}
                    <div class="wf-emoji" style="background-color:${getDrunkBgColor(u.score)}">${imgHTML}</div>
                    <div class="avatar-name">${label}</div>
                    <div class="avatar-score">?�� ${u.score} ??/div>
                </div>`;
        });
        document.getElementById('roomCount').innerText = `${users.length}�?;
    }

    // ---- �?목록 ?�더�?(?�켓 기반) ----
    function renderRoomList(rooms) {
        const container = document.getElementById('roomListContainer');
        // Gate 3 ?�드코딩 목업 보존 ???�켓 �?목록???�에 ?�입
        const socketRoomsHtml = rooms.map(r => {
            if (r.game_status === 'PLAYING') {
                return `<div class="room-card-item" data-name="${r.name}" style="opacity:0.5;cursor:not-allowed;">
                    <div><h4 style="color:var(--ink);font-family:'Jua';font-size:1.3em;">${r.isLocked?'?��':'?��'} ${r.name}</h4>
                    <p style="font-size:0.9em;font-weight:bold;color:var(--point-red);margin-top:5px;">게임�?(?�장불�?)</p></div>
                    <div style="font-size:1em;font-weight:900;">${r.userCount} / 8�?/div></div>`;
            } else if (r.isFull) {
                return `<div class="room-card-item" data-name="${r.name}" style="opacity:0.5;cursor:not-allowed;">
                    <div><h4 style="color:var(--ink);font-family:'Jua';font-size:1.3em;">${r.isLocked?'?��':'?��'} ${r.name}</h4>
                    <p style="font-size:0.9em;font-weight:bold;color:var(--point-red);margin-top:5px;">?�장불�? (만석)</p></div>
                    <div style="font-size:1em;font-weight:900;">${r.userCount} / 8�?/div></div>`;
            } else if (r.isLocked) {
                return `<div class="room-card-item" data-name="${r.name}" style="cursor:pointer;" onclick="tryJoinSocketRoom('${r.id}','${r.name}')">
                    <div><h4 style="color:var(--point-blue);font-family:'Jua';font-size:1.3em;">?�� ${r.name}</h4>
                    <p style="font-size:0.9em;font-weight:bold;color:var(--ink-light);margin-top:5px;">비�?�?(?�치?�여 ?�출)</p></div>
                    <div style="font-size:1em;font-weight:900;">${r.userCount} / 8�?/div></div>`;
            } else {
                return `<div class="room-card-item" data-name="${r.name}" style="cursor:pointer;" onclick="joinOpenRoom('${r.id}','${r.name}')">
                    <div><h4 style="color:var(--ink);font-family:'Jua';font-size:1.3em;">?�� ${r.name}</h4>
                    <p style="font-size:0.9em;font-weight:bold;color:var(--ink-light);margin-top:5px;">개방 (?�치?�여 진입)</p></div>
                    <div style="font-size:1em;font-weight:900;">${r.userCount} / 8�?/div></div>`;
            }
        }).join('');
        // 기존 ?�드코딩 목업?� �??�래??참고?�으�??��? (?�중???�거)
        container.innerHTML = socketRoomsHtml || '<p style="color:var(--ink-light);text-align:center;padding:20px;font-family:\'Jua\';font-size:1.2em;">?�직 ?�린 ?�자리�? ?�어??br>먼�? ?�이블을 깔아보세?? ?��</p>';
    }

    // 2-2: ?�시�?�?목록 ?�로고침
    function refreshRoomList() {
        if (socket && socket.connected) {
            socket.emit('room:list');
            showToast('?�� ?�로고침!');
        }
    }

    function tryJoinSocketRoom(roomId, rName) {
        currentClickRoomId = roomId;
        currentClickRoomName = rName;
        document.getElementById('pwRoomNameLabel').innerText = rName;
        document.getElementById('modal-enter-password').classList.add('active');
    }

    // ---- submitVote ?�켓 버전 ?�버?�이??----
    function submitVote() {
        if (socket && socket.connected && selectedSuspectSocketId) {
            socket.emit('game:vote', { targetSocketId: selectedSuspectSocketId });
            const btn = document.getElementById('voteCompleteBtn');
            btn.disabled = true;
            btn.innerText = '?�표 ?�료! 결과 취합 �?..';
        } else {
            // Gate 3 ?�백
            if (!currentSuspectName) currentSuspectName = dummyAvatars[2]?.name || '?�의??;
            const btn = document.getElementById('voteCompleteBtn');
            btn.disabled = true;
            btn.innerText = '결과 취합 �?..';
            setTimeout(() => {
                showCustomAlert(`<span style="color:var(--point-blue);">[${currentSuspectName}]</span><br>지목되?�습?�다!`, () => startDefensePhase(), true);
            }, 1500);
        }
    }

    // ---- handleAgree/handleDisagree ?�켓 버전 ?�버?�이??----
    function handleAgree() {
        if (socket && socket.connected) {
            socket.emit('game:agree', { agreed: true });
            showToast('?�의 ?�료!');
        } else {
            showCustomAlert('<span style="color:var(--point-red);">?�이?�로 최종 ?�결?�습?�다.</span><br>??�� ?�테?��?�??�동?�니??', () => startKeywordPhase(), true);
        }
    }

    function handleDisagree() {
        if (socket && socket.connected) {
            socket.emit('game:agree', { agreed: false });
            showToast('미동???�료!');
        } else {
            failLoopCount++;
            if (failLoopCount >= 2) {
                isForceMode = true;
                showCustomAlert('2??부�??�적! ?�음 지목자??무조�??�정?�니??', () => startLiarEngine());
            } else {
                showCustomAlert('1�?부�? ?�투?�합?�다.', () => startLiarEngine());
            }
        }
    }

    // ---- finishLiarScoring ?�켓 버전 ?�버?�이??----
    function finishLiarScoring() {
        if (socket && socket.connected) {
            const inputKey = document.getElementById('keywordSubmitInput').value.trim();
            socket.emit('game:keyword', { keyword: inputKey });
            document.getElementById('keywordSubmitInput').disabled = true;
        } else {
            // Gate 3 ?�백 로컬 로직
            clearInterval(activeTimer);
            const inputKey = document.getElementById('keywordSubmitInput').value.trim();
            const targetWord = '?�과';
            const isLiarWin = (inputKey === targetWord);
            let rHtml = isLiarWin
                ? `<span style="font-size:3em;">?��</span><br><strong style="color:var(--point-beer); font-size:1.5em;">?�이???�??�� ?�리!</strong>`
                : `<span style="font-size:3em;">?��</span><br><strong style="color:var(--point-blue); font-size:1.5em;">?��? ?�승!</strong><br><br>?�답: [${targetWord}]`;
            showCustomAlert(rHtml, () => { renderRoomAvatars(isHostLevel); switchView('view-room'); }, true);
        }
    }

    // ---- updateRoomControls ----
    function updateRoomControls() {
        document.getElementById('host-controls').style.display = isHostLevel ? 'flex' : 'none';
        document.getElementById('guest-controls').style.display = isHostLevel ? 'none' : 'flex';
        document.querySelectorAll('.host-only').forEach(btn => {
            btn.style.display = isHostLevel ? 'flex' : 'none';
        });
    }

    // ---- exitRoom ?�켓 버전 ?�버?�이??----
    const _origExitRoom = typeof exitRoom === 'function' ? exitRoom : null;
    function exitRoom() {
        if (socket && socket.connected && currentRoomId) {
            socket.emit('room:leave');
            currentRoomId = null;
        }
        switchView('view-lobby');
        socket && socket.emit('room:list');
    }

