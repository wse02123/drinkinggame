
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
        try {
            if (event === 'room:list') {
                await fetchRoomList();
                if (callback) callback();
            } 
            else if (event === 'room:create' || event === 'room:join') {
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
        } catch (err) {
            console.error('[Socket Mock Emit Error]', event, err);
            if (callback) callback({success: false, message: '알 수 없는 시스템 오류가 발생했습니다. (' + err.message + ')'});
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
    .subscribe(async (status, err) => {
        if (status === 'SUBSCRIBED') {
            try {
                await realtimeChannel.track({
                    socketId: mockSocket.id,
                    nickname: payload.user?.nickname || '이름없음',
                    emoji: payload.user?.emoji || '😎',
                    photoUrl: payload.user?.photoUrl || null,
                    score: 0,
                    isHost: false
                });
                callback({success: true, room: { id: roomId, name: payload.name || payload.password || '새방' }, users: [], hostSocketId: null});
            } catch (trackErr) {
                console.error('[채널 트래킹 실패]', trackErr);
                callback({success: false, message: '채널 트래킹에 실패했습니다.'});
            }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('[채널 구독 실패]', status, err);
            callback({success: false, message: '실시간 통신 연결 실패: ' + status});
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
/**
 * LiarEngine — 라이어 게임 서버 사이드 상태머신
 * PRD 3.1 전체 룰 구현
 *
 * State Flow:
 *   IDLE → DISCUSSING → VOTING → DEFENSE → AGREE → KEYWORD → RESULT
 *   (부결 시 AGREE → DISCUSSING 롤백, 최대 2회 부결 후 강제 KEYWORD)
 */

// ============================================================
// 제시어 데이터 (카테고리 → [시민 단어, 라이어 유사 단어] 쌍)
// ============================================================
const WORD_PAIRS = [
    { category: '과일',   citizen: '수박',   liar: '참외'    },
    { category: '과일',   citizen: '딸기',   liar: '방울토마토' },
    { category: '동물',   citizen: '강아지', liar: '고양이'  },
    { category: '동물',   citizen: '토끼',   liar: '햄스터'  },
    { category: '음식',   citizen: '피자',   liar: '파스타'  },
    { category: '음식',   citizen: '치킨',   liar: '피자'    },
    { category: '음식',   citizen: '삼겹살', liar: '목살'    },
    { category: '장소',   citizen: '도서관', liar: '서점'    },
    { category: '장소',   citizen: '카페',   liar: '레스토랑'},
    { category: '직업',   citizen: '의사',   liar: '간호사'  },
    { category: '직업',   citizen: '선생님', liar: '교수'    },
    { category: '스포츠', citizen: '축구',   liar: '풋살'    },
    { category: '스포츠', citizen: '농구',   liar: '핸드볼'  },
    { category: '연예인', citizen: 'BTS',    liar: 'EXO'     },
    { category: '영화',   citizen: '어벤저스', liar: '아이언맨' },
];

// ============================================================
// 게임 상태 상수
// ============================================================
const PHASE = {
    IDLE:       'IDLE',
    DISCUSSING: 'DISCUSSING',
    VOTING:     'VOTING',
    DEFENSE:    'DEFENSE',
    AGREE:      'AGREE',
    KEYWORD:    'KEYWORD',
    RESULT:     'RESULT'
};

// PRD: 타이머 공식
const DISCUSS_BASE_SEC = 60;
const DISCUSS_PER_USER_SEC = 30;
const VOTE_SEC = 20;
const DEFENSE_SEC = 30;
const AGREE_SEC = 20;
const KEYWORD_SEC = 20;

// ============================================================
// LiarEngine 클래스
// ============================================================
class LiarEngine {
    constructor(room, io) {
        this.room       = room;      // 방 객체 참조
        this.io         = io;        // socket.io 서버 인스턴스
        this.roomId     = room.id;

        // 게임 상태
        this.phase      = PHASE.IDLE;
        this.wordPair   = null;      // { category, citizen, liar }
        this.liarSocketId = null;    // 라이어 소켓 ID

        // 투표
        this.votes      = new Map(); // voterId → targetSocketId
        this.accusedSocketId = null; // 지목된 용의자

        // 동의/미동의
        this.agrees     = new Map(); // voterId → boolean
        this.rejectCount = 0;        // PRD: 부결 누적 횟수 (최대 2)

        // 타이머
        this._timerInterval = null;
        this._timerSec = 0;
    }

    // ----------------------------------------------------------
    // 게임 시작
    // ----------------------------------------------------------
    start() {
        // 제시어 무작위 선택
        this.wordPair = WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)];

        // 라이어 무작위 선정
        const userIds = Array.from(this.room.users.keys());
        this.liarSocketId = userIds[Math.floor(Math.random() * userIds.length)];

        console.log(`[게임 시작] ${this.roomId} | 제시어: ${this.wordPair.citizen} | 라이어: ${this.liarSocketId}`);

        // PRD: 개별 단어 전송 (역할 블라인드)
        for (const [sid, _user] of this.room.users) {
            const isLiar  = sid === this.liarSocketId;
            const word    = isLiar ? this.wordPair.liar : this.wordPair.citizen;
            this.io.to(sid).emit('game:role', {
                isLiar,
                word,
                category: this.wordPair.category
            });
        }

        // 토론 페이즈 시작
        this._startDiscussing();
    }

    // ----------------------------------------------------------
    // Phase: DISCUSSING (토론)
    // ----------------------------------------------------------
    _startDiscussing() {
        this.phase  = PHASE.DISCUSSING;
        const n     = this.room.users.size;
        // PRD: (N × 30) + 60초
        const totalSec = (n * DISCUSS_PER_USER_SEC) + DISCUSS_BASE_SEC;

        this._broadcast('game:phase', {
            phase: PHASE.DISCUSSING,
            totalSec,
            rejectCount: this.rejectCount
        });

        this._startTimer(totalSec, () => this._startVoting());
    }

    // ----------------------------------------------------------
    // Phase: VOTING (지목 투표)
    // ----------------------------------------------------------
    _startVoting() {
        this.phase = PHASE.VOTING;
        this.votes.clear();

        this._broadcast('game:phase', {
            phase: PHASE.VOTING,
            totalSec: VOTE_SEC,
            users: Array.from(this.room.users.values()).map(u => ({
                socketId: u.socketId,
                nickname: u.nickname,
                emoji: u.emoji,
                photoUrl: u.photoUrl || null
            }))
        });

        this._startTimer(VOTE_SEC, () => this._resolveVoting());
    }

    /** 투표 수신 */
    receiveVote(voterSocketId, targetSocketId) {
        if (this.phase !== PHASE.VOTING) return;
        if (voterSocketId === targetSocketId) return; // 본인 투표 불가

        this.votes.set(voterSocketId, targetSocketId);
        this._broadcast('game:vote_count', { voteCount: this.votes.size });

        // 전원 투표 완료 시 즉시 집계
        if (this.votes.size >= this.room.users.size) {
            this._clearTimer();
            this._resolveVoting();
        }
    }

    /** 투표 집계 */
    _resolveVoting() {
        // [E-1] 아무도 투표 안 했을 때 → 랜덤 지목 + 특별 알림
        if (this.votes.size === 0) {
            const userIds = Array.from(this.room.users.keys());
            this.accusedSocketId = userIds[Math.floor(Math.random() * userIds.length)];
            const accusedUser = this.room.users.get(this.accusedSocketId);

            this._broadcast('game:accused_random', {
                accusedSocketId: this.accusedSocketId,
                accusedNickname: accusedUser?.nickname || '???',
                accusedEmoji:    accusedUser?.emoji    || '😶',
                accusedPhoto:    accusedUser?.photoUrl || null
            });
            // accused 정보도 같이 동기화
            this._broadcast('game:accused', {
                accusedSocketId: this.accusedSocketId,
                accusedNickname: accusedUser?.nickname || '???',
                accusedEmoji:    accusedUser?.emoji    || '😶',
                accusedPhoto:    accusedUser?.photoUrl || null
            });
            console.log(`[랜덤 지목] ${this.roomId} → ${accusedUser?.nickname}`);

            if (this.rejectCount >= 2) {
                setTimeout(() => this._startKeyword(), 2500);
            } else {
                setTimeout(() => this._startDefense(), 2500);
            }
            return;
        }

        // 득표 수 계산
        const tally = new Map(); // targetSocketId → count
        for (const targetId of this.votes.values()) {
            tally.set(targetId, (tally.get(targetId) || 0) + 1);
        }

        // 최다 득표자 선정 (동점 시 무작위)
        let maxVotes = 0;
        let suspects = [];
        for (const [sid, count] of tally) {
            if (count > maxVotes) { maxVotes = count; suspects = [sid]; }
            else if (count === maxVotes) suspects.push(sid);
        }

        this.accusedSocketId = suspects[Math.floor(Math.random() * suspects.length)];
        const accusedUser    = this.room.users.get(this.accusedSocketId);

        this._broadcast('game:accused', {
            accusedSocketId: this.accusedSocketId,
            accusedNickname: accusedUser?.nickname || '???',
            accusedEmoji:    accusedUser?.emoji    || '😶',
            accusedPhoto:    accusedUser?.photoUrl || null
        });

        // PRD: 부결 2회 누적 → 변론/동의 없이 바로 키워드
        if (this.rejectCount >= 2) {
            setTimeout(() => this._startKeyword(), 1500);
        } else {
            setTimeout(() => this._startDefense(), 1500);
        }
    }

    // ----------------------------------------------------------
    // Phase: DEFENSE (최후 변론 30초)
    // ----------------------------------------------------------
    _startDefense() {
        this.phase = PHASE.DEFENSE;

        this._broadcast('game:phase', {
            phase: PHASE.DEFENSE,
            totalSec: DEFENSE_SEC
        });

        this._startTimer(DEFENSE_SEC, () => this._startAgree());
    }

    // ----------------------------------------------------------
    // Phase: AGREE (동의/미동의 투표)
    // ----------------------------------------------------------
    _startAgree() {
        this.phase = PHASE.AGREE;
        this.agrees.clear();

        this._broadcast('game:phase', {
            phase: PHASE.AGREE,
            totalSec: AGREE_SEC,
            rejectCount: this.rejectCount
        });

        this._startTimer(AGREE_SEC, () => this._resolveAgree());
    }

    /** 동의/미동의 수신 */
    receiveAgree(voterSocketId, agreed) {
        if (this.phase !== PHASE.AGREE) return;
        if (voterSocketId === this.accusedSocketId) return; // 용의자 본인 제외

        this.agrees.set(voterSocketId, agreed);

        // 전원 완료 시 즉시 집계
        const eligibleCount = this.room.users.size - 1;
        if (this.agrees.size >= eligibleCount) {
            this._clearTimer();
            this._resolveAgree();
        }
    }

    /** 동의 집계 */
    _resolveAgree() {
        // [E-2] 실제 투표한 인원만 기준으로 과반수 계산 (미투표자 제외)
        const actualVoters  = this.agrees.size;
        const agreeCount    = Array.from(this.agrees.values()).filter(v => v).length;
        const disagreeCount = actualVoters - agreeCount;

        // 아무도 투표 안 했거나 동점인 경우: 동의 처리 (기본값)
        let majority;
        if (actualVoters === 0) {
            // 아무도 투표 안 하면 과반수 동의로 간주
            this._broadcast('game:confirmed', { accusedSocketId: this.accusedSocketId });
            setTimeout(() => this._startKeyword(), 1500);
            return;
        }
        majority = Math.floor(actualVoters / 2) + 1;

        if (disagreeCount >= majority) {
            // PRD: 미동의 과반수 → 부결 롤백
            this.rejectCount++;
            this._broadcast('game:rejected', { rejectCount: this.rejectCount });
            setTimeout(() => {
                this._startDiscussing();
            }, 2000);
        } else {
            // 동의 과반수 → 키워드 단계
            this._broadcast('game:confirmed', { accusedSocketId: this.accusedSocketId });
            setTimeout(() => this._startKeyword(), 1500);
        }
    }

    // ----------------------------------------------------------
    // Phase: KEYWORD (주관식 20초)
    // ----------------------------------------------------------
    _startKeyword() {
        this.phase = PHASE.KEYWORD;

        // 용의자에게 폼 표시
        this.io.to(this.accusedSocketId).emit('game:phase', {
            phase: PHASE.KEYWORD,
            totalSec: KEYWORD_SEC,
            isAccused: true,
            citizenWord: this.wordPair.citizen // 라이어가 맞혀야 할 정답
        });

        // 나머지는 대기 화면
        for (const [sid] of this.room.users) {
            if (sid !== this.accusedSocketId) {
                this.io.to(sid).emit('game:phase', {
                    phase: PHASE.KEYWORD,
                    totalSec: KEYWORD_SEC,
                    isAccused: false
                });
            }
        }

        this._startTimer(KEYWORD_SEC, () => {
            // 시간 초과 → 틀린 것으로 처리
            this._resolveResult('');
        });
    }

    /** 키워드 제출 수신 */
    receiveKeyword(senderSocketId, keyword) {
        if (this.phase !== PHASE.KEYWORD) return;
        if (senderSocketId !== this.accusedSocketId) return;

        this._clearTimer();
        this._resolveResult(keyword.trim());
    }

    // ----------------------------------------------------------
    // Phase: RESULT (결과 산정)
    // ----------------------------------------------------------
    _resolveResult(submittedKeyword) {
        this.phase = PHASE.RESULT;

        const correctAnswer  = this.wordPair.citizen;
        const isCorrect      = submittedKeyword.toLowerCase() === correctAnswer.toLowerCase();
        const isAccusedLiar  = this.accusedSocketId === this.liarSocketId;

        /**
         * PRD 점수 산정 공식:
         * [라이어 승리 = 선정자가 정답을 맞춘 경우]
         *   - 선정자가 진짜 라이어 → 라이어 +2점
         *   - 선정자가 억울한 시민 → 그 시민 +1점
         *   - 나머지 +0점
         *
         * [시민 승리 = 선정자가 정답을 틀린 경우]
         *   - 선정자 0점
         *   - 나머지 시민 전원 +1점
         */
        const scoreChanges = {}; // socketId → delta

        if (isCorrect) {
            // 라이어 승리
            if (isAccusedLiar) {
                scoreChanges[this.accusedSocketId] = 2;
            } else {
                scoreChanges[this.accusedSocketId] = 1;
            }
        } else {
            // 시민 승리
            for (const [sid] of this.room.users) {
                if (sid !== this.accusedSocketId) {
                    scoreChanges[sid] = 1;
                }
            }
        }

        // 점수 적용
        for (const [sid, user] of this.room.users) {
            user.score += (scoreChanges[sid] || 0);
        }

        // 결과 브로드캐스트
        const usersPayload = Array.from(this.room.users.values()).map(u => ({
            socketId: u.socketId,
            nickname: u.nickname,
            emoji: u.emoji,
            photoUrl: u.photoUrl || null,
            score: u.score,
            scoreDelta: scoreChanges[u.socketId] || 0,
            isHost: u.isHost
        }));

        this._broadcast('game:result', {
            isCorrect,
            isAccusedLiar,
            accusedSocketId: this.accusedSocketId,
            liarSocketId:    this.liarSocketId,
            citizenWord:     correctAnswer,
            submittedKeyword,
            liarWord:        this.wordPair.liar,
            category:        this.wordPair.category,
            users:           usersPayload,
            victoryTeam:     isCorrect ? 'LIAR' : 'CITIZEN'
        });

        // 게임 종료 — 방을 IDLE 상태로
        this.room.game = null;
    }

    // ----------------------------------------------------------
    // 유틸
    // ----------------------------------------------------------
    _broadcast(event, data) {
        this.io.to(this.roomId).emit(event, data);
    }

    _startTimer(totalSec, onExpire) {
        this._clearTimer();
        this._timerSec = totalSec;

        this._broadcast('game:timer', { sec: totalSec, totalSec });

        this._timerInterval = setInterval(() => {
            this._timerSec--;
            this._broadcast('game:timer', { sec: this._timerSec, totalSec });

            if (this._timerSec <= 0) {
                this._clearTimer();
                onExpire();
            }
        }, 1000);
    }

    _clearTimer() {
        if (this._timerInterval) {
            clearInterval(this._timerInterval);
            this._timerInterval = null;
        }
    }

    /** 방 삭제 시 정리 */
    destroy() {
        this._clearTimer();
    }
}

module.exports = { LiarEngine, PHASE };
