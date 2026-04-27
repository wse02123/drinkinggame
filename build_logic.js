const fs = require('fs');

const engineCode = fs.readFileSync('engine_temp.js', 'utf8');

const wrapperCode = `
// ==========================================
// PartyGame: Supabase Realtime & Socket Mock
// ==========================================

let realtimeChannel = null;
let currentMyDbId = null;

if (typeof window.mySocketId === 'undefined') {
    window.mySocketId = 'supa_' + Math.random().toString(36).substr(2, 9);
}

// ---- 소켓 호환 Mock 객체 ----
const _callbacks = {};
const mockSocket = {
    id: window.mySocketId,
    connected: false,
    on: function(event, cb) {
        if (!_callbacks[event]) _callbacks[event] = [];
        _callbacks[event].push(cb);
    },
    emit: async function(event, payload, callback) {
        if (event === 'room:list') {
            await fetchRoomList();
            if (callback) callback();
        } 
        else if (event === 'room:create') {
            await joinRoom(payload, callback);
        }
        else if (event === 'room:join') {
            await joinRoom(payload, callback);
        }
        else if (event === 'room:leave') {
            await leaveRoom();
            if (callback) callback();
        }
        else if (event === 'game:request') {
            if (realtimeChannel) {
                realtimeChannel.send({ type: 'broadcast', event: 'game:request:broadcast', payload: {
                    requesterSocketId: mockSocket.id,
                    requesterNickname: payload.user?.nickname || '유저',
                    gameName: payload.gameName
                }});
            }
        }
        // Host Action overrides
        else if (window.isHostLevel && window.hostGameEngine) {
            if (event === 'game:start') {
                window.hostGameEngine.start();
                if (callback) callback({success: true});
            } else if (event === 'game:phase_skip') {
                // 방장 스킵
                window.hostGameEngine._clearTimer();
                const skipTo = payload.skipTo || 'VOTING';
                if (skipTo === 'VOTING') window.hostGameEngine._startVoting();
                else if (skipTo === 'DEFENSE') {
                    if (window.hostGameEngine.accusedSocketId) window.hostGameEngine._startDefense();
                } else if (skipTo === 'AGREE') {
                    if (window.hostGameEngine.accusedSocketId) window.hostGameEngine._startAgree();
                }
            } else if (event === 'game:vote') {
                window.hostGameEngine.receiveVote(mockSocket.id, payload.targetSocketId);
            } else if (event === 'game:agree') {
                window.hostGameEngine.receiveAgree(mockSocket.id, payload.agreed);
            } else if (event === 'game:keyword') {
                window.hostGameEngine.receiveKeyword(mockSocket.id, payload.keyword);
            }
        } 
        // Guest Actions forwarded to channel
        else if (!window.isHostLevel && realtimeChannel) {
            if (['game:vote', 'game:agree', 'game:keyword'].includes(event)) {
                realtimeChannel.send({ type: 'broadcast', event: 'guest:'+event, payload: { senderId: mockSocket.id, ...payload } });
            }
        }
    },
    
    // 내부 트리거 (수신)
    _trigger: function(event, payload) {
        if (_callbacks[event]) {
            _callbacks[event].forEach(cb => cb(payload));
        }
    }
};

// IO 함수 인터셉트
window.io = function() {
    setTimeout(() => {
        mockSocket.connected = true;
        mockSocket._trigger('connect');
    }, 100);
    return mockSocket;
};

let roomUsers = [];

// ---- 방 목록 패치 로직 ----
async function fetchRoomList() {
    const { data: rooms, error } = await supabaseClient.from('rooms').select('*, players(id)').eq('game_status', 'LOBBY');
    if (!error && rooms) {
        const mapped = rooms.map(r => ({
            id: r.id,
            name: r.name,
            isLocked: false,
            isFull: r.players ? r.players.length >= 8 : false,
            userCount: r.players ? r.players.length : 0
        }));
        mockSocket._trigger('room:list', mapped);
    } else {
        console.error('[방 목록 패치 에러]', error);
    }
}

// ---- 방 입장 / 채널 구독 로직 ----
async function joinRoom(payload, callback) {
    let roomId = payload.roomId;
    if (!roomId) {
        // 새 방 개설
        const { data, error } = await supabaseClient.from('rooms').insert({
            name: payload.name || payload.password || '새 테이블', // 임시로 rName 받기
            host_id: '00000000-0000-0000-0000-000000000000', // 추후 myId 반영
            game_status: 'LOBBY'
        }).select();
        
        if (error || !data || data.length === 0) {
            console.error('[방 생성 실패 디테일]', error);
            alert('방 생성 실패! 사유: ' + (error?.message || '알 수 없는 DB 오류. (키값 혹은 RLS 확인 필요)'));
            return callback({success: false, message: '방 개설 실패: ' + (error?.message || 'DB 에러')});
        }
        roomId = data[0].id;
    }
    
    // 플레이어 insert
    const { data: pData, error: pError } = await supabaseClient.from('players').insert({
        room_id: roomId,
        nickname: payload.user.nickname,
        emoji: payload.user.emoji,
        avatar_url: payload.user.photoUrl
    }).select();
    
    if (pError) {
        console.error('[플레이어 입장 실패]', pError);
        alert('플레이어 입장 실패! 사유: ' + pError.message);
        return callback({success: false, message: '방 입장 실패'});
    }
    currentMyDbId = pData[0].id;

    // 만약 방장이라면 rooms의 host_id 업데이트
    if (!payload.roomId) {
        await supabaseClient.from('rooms').update({ host_id: currentMyDbId }).eq('id', roomId);
    }

    // 채널 구독
    realtimeChannel = supabaseClient.channel('room-' + roomId, {
        config: {
            presence: { key: mockSocket.id }
        }
    });

    realtimeChannel
    .on('presence', { event: 'sync' }, () => {
        const state = realtimeChannel.presenceState();
        roomUsers = [];
        let hostFound = false;
        for (const key in state) {
            const p = state[key][0];
            // 가장 첫번째 접속자를 호스트로 지정
            if (!hostFound) { p.isHost = true; hostFound = true; }
            roomUsers.push(p);
        }
        
        // Host 엔진 연결 갱신
        const me = roomUsers.find(u => u.socketId === mockSocket.id);
        if (me && me.isHost && !window.hostGameEngine) {
            window.hostGameEngine = new LiarEngine({ id: roomId, users: new Map(roomUsers.map(u => [u.socketId, u])) }, {
                to: (sid) => ({
                    emit: (ev, pl) => {
                        if (sid === mockSocket.id) mockSocket._trigger(ev, pl);
                        else realtimeChannel.send({ type: 'broadcast', event: 'direct:'+ev, payload: { targetSid: sid, ...pl } });
                    }
                }),
                emit: (ev, pl) => {
                    mockSocket._trigger(ev, pl); // 내 화면 갱신
                    realtimeChannel.send({ type: 'broadcast', event: 'broadcast:'+ev, payload: pl }); // 남들 화면 갱신
                }
            });
        }
        
        // 엔진 유저 정보 갱신
        if (window.hostGameEngine) {
            window.hostGameEngine.room.users = new Map(roomUsers.map(u => [u.socketId, u]));
        }

        mockSocket._trigger('room:users', roomUsers);
    })
    .on('broadcast', { event: 'game:request:broadcast' }, (msg) => { mockSocket._trigger('game:request:broadcast', msg.payload); })
    .on('broadcast', { event: 'direct:game:role' }, (msg) => { if (msg.payload.targetSid === mockSocket.id) mockSocket._trigger('game:role', msg.payload); })
    .on('broadcast', { event: 'broadcast:game:phase' }, (msg) => mockSocket._trigger('game:phase', msg.payload))
    .on('broadcast', { event: 'broadcast:game:timer' }, (msg) => mockSocket._trigger('game:timer', msg.payload))
    .on('broadcast', { event: 'broadcast:game:vote_count' }, (msg) => mockSocket._trigger('game:vote_count', msg.payload))
    .on('broadcast', { event: 'broadcast:game:accused_random' }, (msg) => mockSocket._trigger('game:accused_random', msg.payload))
    .on('broadcast', { event: 'broadcast:game:accused' }, (msg) => mockSocket._trigger('game:accused', msg.payload))
    .on('broadcast', { event: 'broadcast:game:rejected' }, (msg) => mockSocket._trigger('game:rejected', msg.payload))
    .on('broadcast', { event: 'broadcast:game:confirmed' }, (msg) => mockSocket._trigger('game:confirmed', msg.payload))
    .on('broadcast', { event: 'broadcast:game:result' }, (msg) => mockSocket._trigger('game:result', msg.payload))
    
    // 게스트가 보낸 이벤트를 방장이 캡처
    .on('broadcast', { event: 'guest:game:vote' }, (msg) => { if(window.isHostLevel) window.hostGameEngine.receiveVote(msg.payload.senderId, msg.payload.targetSocketId); })
    .on('broadcast', { event: 'guest:game:agree' }, (msg) => { if(window.isHostLevel) window.hostGameEngine.receiveAgree(msg.payload.senderId, msg.payload.agreed); })
    .on('broadcast', { event: 'guest:game:keyword' }, (msg) => { if(window.isHostLevel) window.hostGameEngine.receiveKeyword(msg.payload.senderId, msg.payload.keyword); })
    .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            await realtimeChannel.track({
                socketId: mockSocket.id,
                nickname: payload.user.nickname,
                emoji: payload.user.emoji,
                photoUrl: payload.user.photoUrl,
                score: 0,
                isHost: false
            });
            callback({success: true, room: { id: roomId, name: payload.name || payload.password || '새방' }, users: [], hostSocketId: null});
        }
    });
}

async function leaveRoom() {
    if (currentMyDbId) await supabaseClient.from('players').delete().eq('id', currentMyDbId);
    if (realtimeChannel) { await supabaseClient.removeChannel(realtimeChannel); realtimeChannel = null; }
    window.hostGameEngine = null;
}

// ==========================================
// 엔진 코드 임베딩
// ==========================================
` + engineCode.replace(/module\.exports = LiarEngine;/, 'window.LiarEngine = LiarEngine;');

fs.writeFileSync('supabase_logic.js', wrapperCode);
console.log('supabase_logic.js 생성 완료!');
