
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
            // 방 생성 로직 호출
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
    // players(count) 집계 연산이 복잡할 수 있으므로 간단한 쿼리로 우선 수정
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
        // 새 방 개설 (room:create 대응)
        console.log('[방 생성 시작]', payload);
        const { data, error } = await supabaseClient.from('rooms').insert({
            name: payload.name || '새 테이블', 
            host_id: '00000000-0000-0000-0000-000000000000', 
            game_status: 'LOBBY'
        }).select();
        
        if (error || !data || data.length === 0) {
            console.error('[방 생성 실패]', error);
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
    
    if (pError) return callback({success: false, message: '방 입장 실패'});
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
            callback({success: true, room: { id: roomId, name: payload.name || payload.password || '새 테이블' }, users: [], hostSocketId: null});
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
��/ * * 
   *   L i a r E n g i n e   ? ? ? �� �? ? �[����  ? �ĭ�  ? J �? ? ? ��m�Rv����
   *   P R D   3 . 1   ? ��ܮ  7s? �cK}�
   * 
   *   S t a t e   F l o w : 
   *       I D L E   ? ? D I S C U S S I N G   ? ? V O T I N G   ? ? D E F E N S E   ? ? A G R E E   ? ? K E Y W O R D   ? ? R E S U L T 
   *       ( z�� �[? ? ? A G R E E   ? ? D I S C U S S I N G   �o{1�,   ����?   2 ? ? z�� �[? ? ? �Z��#�  K E Y W O R D ) 
   * / 
 
 / /   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = 
 / /   ? �Ć�? ? ? ׬ �? ? ( �y��(`��%  ? ? [ ? ��?   ? e$1�,   ? �� �? ? ? �ȗ�  ? e$1�]   ? ? 
 / /   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = 
 c o n s t   W O R D _ P A I R S   =   [ 
         {   c a t e g o r y :   ' (`��*�' ,       c i t i z e n :   ' ? ���' ,       l i a r :   ' ������'         } , 
         {   c a t e g o r y :   ' (`��*�' ,       c i t i z e n :   ' ? x���' ,       l i a r :   ' ۊy$��? ��O�? ?   } , 
         {   c a t e g o r y :   ' ? �*' ,       c i t i z e n :   ' �Z������ ' ,   l i a r :   ' (`���? ?     } , 
         {   c a t e g o r y :   ' ? �*' ,       c i t i z e n :   ' ? �Ȯ�' ,       l i a r :   ' ? ����? ?     } , 
         {   c a t e g o r y :   ' ? ����' ,       c i t i z e n :   ' ? ���' ,       l i a r :   ' ? ����? � '     } , 
         {   c a t e g o r y :   ' ? ����' ,       c i t i z e n :   ' �y���' ,       l i a r :   ' ? ���'         } , 
         {   c a t e g o r y :   ' ? ����' ,       c i t i z e n :   ' ? ����? ? ,   l i a r :   ' ��y$��'         } , 
         {   c a t e g o r y :   ' ? ���' ,       c i t i z e n :   ' ? ��L�?a� ' ,   l i a r :   ' ? ���'         } , 
         {   c a t e g o r y :   ' ? ���' ,       c i t i z e n :   ' �y���' ,       l i a r :   ' ? I���? ��	�' } , 
         {   c a t e g o r y :   ' ������' ,       c i t i z e n :   ' ? ���' ,       l i a r :   ' �Z����? ?     } , 
         {   c a t e g o r y :   ' ������' ,       c i t i z e n :   ' ? ��n�? ? ,   l i a r :   ' �c/�Բ'         } , 
         {   c a t e g o r y :   ' ? }1����? ,   c i t i z e n :   ' pu����' ,       l i a r :   ' ? ����'         } , 
         {   c a t e g o r y :   ' ? }1����? ,   c i t i z e n :   ' ? {���' ,       l i a r :   ' ? ��v�B�?     } , 
         {   c a t e g o r y :   ' ? ׬��? ? ,   c i t i z e n :   ' B T S ' ,         l i a r :   ' E X O '           } , 
         {   c a t e g o r y :   ' ? ����' ,       c i t i z e n :   ' ?  �}�? � ? ? ,   l i a r :   ' ? �� �? ���3'   } , 
 ] ; 
 
 / /   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = 
 / /   �[����  ? ��m�  ? ��Բ
 / /   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = 
 c o n s t   P H A S E   =   { 
         I D L E :               ' I D L E ' , 
         D I S C U S S I N G :   ' D I S C U S S I N G ' , 
         V O T I N G :           ' V O T I N G ' , 
         D E F E N S E :         ' D E F E N S E ' , 
         A G R E E :             ' A G R E E ' , 
         K E Y W O R D :         ' K E Y W O R D ' , 
         R E S U L T :           ' R E S U L T ' 
 } ; 
 
 / /   P R D :   ? � ?  �g2  (`����
 c o n s t   D I S C U S S _ B A S E _ S E C   =   6 0 ; 
 c o n s t   D I S C U S S _ P E R _ U S E R _ S E C   =   3 0 ; 
 c o n s t   V O T E _ S E C   =   2 0 ; 
 c o n s t   D E F E N S E _ S E C   =   3 0 ; 
 c o n s t   A G R E E _ S E C   =   2 0 ; 
 c o n s t   K E Y W O R D _ S E C   =   2 0 ; 
 
 / /   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = 
 / /   L i a r E n g i n e   ?  ��? ? / /   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = 
 c l a s s   L i a r E n g i n e   { 
         c o n s t r u c t o r ( r o o m ,   i o )   { 
                 t h i s . r o o m               =   r o o m ;             / /   ۊ? �Zy�ܮ  ���� 
                 t h i s . i o                   =   i o ;                 / /   s o c k e t . i o   ? �ĭ�  ? ����? ���
                 t h i s . r o o m I d           =   r o o m . i d ; 
 
                 / /   �[����  ? ��m�
                 t h i s . p h a s e             =   P H A S E . I D L E ; 
                 t h i s . w o r d P a i r       =   n u l l ;             / /   {   c a t e g o r y ,   c i t i z e n ,   l i a r   } 
                 t h i s . l i a r S o c k e t I d   =   n u l l ;         / /   ? �� �? ? ? ����  I D 
 
                 / /   ? K��
                 t h i s . v o t e s             =   n e w   M a p ( ) ;   / /   v o t e r I d   ? ? t a r g e t S o c k e t I d 
                 t h i s . a c c u s e d S o c k e t I d   =   n u l l ;   / /   ��� ��x$¹  ? y$��? ? 
                 / /   ? ���/ ����޸? ?                 t h i s . a g r e e s           =   n e w   M a p ( ) ;   / /   v o t e r I d   ? ? b o o l e a n 
                 t h i s . r e j e c t C o u n t   =   0 ;                 / /   P R D :   z�� �[? ? ����  ? ��Բ  ( ����?   2 ) 
 
                 / /   ? � ?  �g2
                 t h i s . _ t i m e r I n t e r v a l   =   n u l l ; 
                 t h i s . _ t i m e r S e c   =   0 ; 
         } 
 
         / /   - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
         / /   �[����  ? ��	�
         / /   - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
         s t a r t ( )   { 
                 / /   ? �Ć�? ? ���	�? ? ? ��n�
                 t h i s . w o r d P a i r   =   W O R D _ P A I R S [ M a t h . f l o o r ( M a t h . r a n d o m ( )   *   W O R D _ P A I R S . l e n g t h ) ] ; 
 
                 / /   ? �� �? ? ���	�? ? ? ���
                 c o n s t   u s e r I d s   =   A r r a y . f r o m ( t h i s . r o o m . u s e r s . k e y s ( ) ) ; 
                 t h i s . l i a r S o c k e t I d   =   u s e r I d s [ M a t h . f l o o r ( M a t h . r a n d o m ( )   *   u s e r I d s . l e n g t h ) ] ; 
 
                 c o n s o l e . l o g ( ` [ �[����  ? ��	�]   $ { t h i s . r o o m I d }   |   ? �Ć�? ?   $ { t h i s . w o r d P a i r . c i t i z e n }   |   ? �� �? ?   $ { t h i s . l i a r S o c k e t I d } ` ) ; 
 
                 / /   P R D :   �Z���  ? e$1�  ? ���  ( ? ? 7�  ɑ��*�? ��v�) 
                 f o r   ( c o n s t   [ s i d ,   _ u s e r ]   o f   t h i s . r o o m . u s e r s )   { 
                         c o n s t   i s L i a r     =   s i d   = = =   t h i s . l i a r S o c k e t I d ; 
                         c o n s t   w o r d         =   i s L i a r   ?   t h i s . w o r d P a i r . l i a r   :   t h i s . w o r d P a i r . c i t i z e n ; 
                         t h i s . i o . t o ( s i d ) . e m i t ( ' g a m e : r o l e ' ,   { 
                                 i s L i a r , 
                                 w o r d , 
                                 c a t e g o r y :   t h i s . w o r d P a i r . c a t e g o r y 
                         } ) ; 
                 } 
 
                 / /   ? ���  ? � ���? ? ��	�
                 t h i s . _ s t a r t D i s c u s s i n g ( ) ; 
         } 
 
         / /   - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
         / /   P h a s e :   D I S C U S S I N G   ( ? ���) 
         / /   - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
         _ s t a r t D i s c u s s i n g ( )   { 
                 t h i s . p h a s e     =   P H A S E . D I S C U S S I N G ; 
                 c o n s t   n           =   t h i s . r o o m . u s e r s . s i z e ; 
                 / /   P R D :   ( N   ��  3 0 )   +   6 0 �s?                 c o n s t   t o t a l S e c   =   ( n   *   D I S C U S S _ P E R _ U S E R _ S E C )   +   D I S C U S S _ B A S E _ S E C ; 
 
                 t h i s . _ b r o a d c a s t ( ' g a m e : p h a s e ' ,   { 
                         p h a s e :   P H A S E . D I S C U S S I N G , 
                         t o t a l S e c , 
                         r e j e c t C o u n t :   t h i s . r e j e c t C o u n t 
                 } ) ; 
 
                 t h i s . _ s t a r t T i m e r ( t o t a l S e c ,   ( )   = >   t h i s . _ s t a r t V o t i n g ( ) ) ; 
         } 
 
         / /   - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
         / /   P h a s e :   V O T I N G   ( ��� ��? ? K��) 
         / /   - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
         _ s t a r t V o t i n g ( )   { 
                 t h i s . p h a s e   =   P H A S E . V O T I N G ; 
                 t h i s . v o t e s . c l e a r ( ) ; 
 
                 t h i s . _ b r o a d c a s t ( ' g a m e : p h a s e ' ,   { 
                         p h a s e :   P H A S E . V O T I N G , 
                         t o t a l S e c :   V O T E _ S E C , 
                         u s e r s :   A r r a y . f r o m ( t h i s . r o o m . u s e r s . v a l u e s ( ) ) . m a p ( u   = >   ( { 
                                 s o c k e t I d :   u . s o c k e t I d , 
                                 n i c k n a m e :   u . n i c k n a m e , 
                                 e m o j i :   u . e m o j i , 
                                 p h o t o U r l :   u . p h o t o U r l   | |   n u l l 
                         } ) ) 
                 } ) ; 
 
                 t h i s . _ s t a r t T i m e r ( V O T E _ S E C ,   ( )   = >   t h i s . _ r e s o l v e V o t i n g ( ) ) ; 
         } 
 
         / * *   ? K��  ? ���  * / 
         r e c e i v e V o t e ( v o t e r S o c k e t I d ,   t a r g e t S o c k e t I d )   { 
                 i f   ( t h i s . p h a s e   ! = =   P H A S E . V O T I N G )   r e t u r n ; 
                 i f   ( v o t e r S o c k e t I d   = = =   t a r g e t S o c k e t I d )   r e t u r n ;   / /   B���$�  ? K��  z�G�? 
 
                 t h i s . v o t e s . s e t ( v o t e r S o c k e t I d ,   t a r g e t S o c k e t I d ) ; 
                 t h i s . _ b r o a d c a s t ( ' g a m e : v o t e _ c o u n t ' ,   {   v o t e C o u n t :   t h i s . v o t e s . s i z e   } ) ; 
 
                 / /   ? ��]�  ? K��  ? ����  ? ? ��1���  ����
                 i f   ( t h i s . v o t e s . s i z e   > =   t h i s . r o o m . u s e r s . s i z e )   { 
                         t h i s . _ c l e a r T i m e r ( ) ; 
                         t h i s . _ r e s o l v e V o t i n g ( ) ; 
                 } 
         } 
 
         / * *   ? K��  ����  * / 
         _ r e s o l v e V o t i n g ( )   { 
                 / /   [ E - 1 ]   ? ��"? ? ? K��  ? ? ? I���  ? ? ? ? ? ��!�  ��� ��? +   ? 8��  ? ��%
                 i f   ( t h i s . v o t e s . s i z e   = = =   0 )   { 
                         c o n s t   u s e r I d s   =   A r r a y . f r o m ( t h i s . r o o m . u s e r s . k e y s ( ) ) ; 
                         t h i s . a c c u s e d S o c k e t I d   =   u s e r I d s [ M a t h . f l o o r ( M a t h . r a n d o m ( )   *   u s e r I d s . l e n g t h ) ] ; 
                         c o n s t   a c c u s e d U s e r   =   t h i s . r o o m . u s e r s . g e t ( t h i s . a c c u s e d S o c k e t I d ) ; 
 
                         t h i s . _ b r o a d c a s t ( ' g a m e : a c c u s e d _ r a n d o m ' ,   { 
                                 a c c u s e d S o c k e t I d :   t h i s . a c c u s e d S o c k e t I d , 
                                 a c c u s e d N i c k n a m e :   a c c u s e d U s e r ? . n i c k n a m e   | |   ' ? ? ? ' , 
                                 a c c u s e d E m o j i :         a c c u s e d U s e r ? . e m o j i         | |   ' ? ��' , 
                                 a c c u s e d P h o t o :         a c c u s e d U s e r ? . p h o t o U r l   | |   n u l l 
                         } ) ; 
                         / /   a c c u s e d   ? ����? ? �Z� �  ? °�? ?                         t h i s . _ b r o a d c a s t ( ' g a m e : a c c u s e d ' ,   { 
                                 a c c u s e d S o c k e t I d :   t h i s . a c c u s e d S o c k e t I d , 
                                 a c c u s e d N i c k n a m e :   a c c u s e d U s e r ? . n i c k n a m e   | |   ' ? ? ? ' , 
                                 a c c u s e d E m o j i :         a c c u s e d U s e r ? . e m o j i         | |   ' ? ��' , 
                                 a c c u s e d P h o t o :         a c c u s e d U s e r ? . p h o t o U r l   | |   n u l l 
                         } ) ; 
                         c o n s o l e . l o g ( ` [ ? ��!�  ��� ��?   $ { t h i s . r o o m I d }   ? ? $ { a c c u s e d U s e r ? . n i c k n a m e } ` ) ; 
 
                         i f   ( t h i s . r e j e c t C o u n t   > =   2 )   { 
                                 s e t T i m e o u t ( ( )   = >   t h i s . _ s t a r t K e y w o r d ( ) ,   2 5 0 0 ) ; 
                         }   e l s e   { 
                                 s e t T i m e o u t ( ( )   = >   t h i s . _ s t a r t D e f e n s e ( ) ,   2 5 0 0 ) ; 
                         } 
                         r e t u r n ; 
                 } 
 
                 / /   ? zŴ�  ? ? (`����
                 c o n s t   t a l l y   =   n e w   M a p ( ) ;   / /   t a r g e t S o c k e t I d   ? ? c o u n t 
                 f o r   ( c o n s t   t a r g e t I d   o f   t h i s . v o t e s . v a l u e s ( ) )   { 
                         t a l l y . s e t ( t a r g e t I d ,   ( t a l l y . g e t ( t a r g e t I d )   | |   0 )   +   1 ) ; 
                 } 
 
                 / /   ���Ď�  ? zŴ�? ? ? ���  ( ? ��  ? ? ���	�? ? 
                 l e t   m a x V o t e s   =   0 ; 
                 l e t   s u s p e c t s   =   [ ] ; 
                 f o r   ( c o n s t   [ s i d ,   c o u n t ]   o f   t a l l y )   { 
                         i f   ( c o u n t   >   m a x V o t e s )   {   m a x V o t e s   =   c o u n t ;   s u s p e c t s   =   [ s i d ] ;   } 
                         e l s e   i f   ( c o u n t   = = =   m a x V o t e s )   s u s p e c t s . p u s h ( s i d ) ; 
                 } 
 
                 t h i s . a c c u s e d S o c k e t I d   =   s u s p e c t s [ M a t h . f l o o r ( M a t h . r a n d o m ( )   *   s u s p e c t s . l e n g t h ) ] ; 
                 c o n s t   a c c u s e d U s e r         =   t h i s . r o o m . u s e r s . g e t ( t h i s . a c c u s e d S o c k e t I d ) ; 
 
                 t h i s . _ b r o a d c a s t ( ' g a m e : a c c u s e d ' ,   { 
                         a c c u s e d S o c k e t I d :   t h i s . a c c u s e d S o c k e t I d , 
                         a c c u s e d N i c k n a m e :   a c c u s e d U s e r ? . n i c k n a m e   | |   ' ? ? ? ' , 
                         a c c u s e d E m o j i :         a c c u s e d U s e r ? . e m o j i         | |   ' ? ��' , 
                         a c c u s e d P h o t o :         a c c u s e d U s e r ? . p h o t o U r l   | |   n u l l 
                 } ) ; 
 
                 / /   P R D :   z�� �[? 2 ? ? ? ����  ? ? B�� �o? ? ���  ? �� �  ۊ���  ? |1Y�? ?                 i f   ( t h i s . r e j e c t C o u n t   > =   2 )   { 
                         s e t T i m e o u t ( ( )   = >   t h i s . _ s t a r t K e y w o r d ( ) ,   1 5 0 0 ) ; 
                 }   e l s e   { 
                         s e t T i m e o u t ( ( )   = >   t h i s . _ s t a r t D e f e n s e ( ) ,   1 5 0 0 ) ; 
                 } 
         } 
 
         / /   - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
         / /   P h a s e :   D E F E N S E   ( ����Q�  B�� �o? 3 0 �s? 
         / /   - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
         _ s t a r t D e f e n s e ( )   { 
                 t h i s . p h a s e   =   P H A S E . D E F E N S E ; 
 
                 t h i s . _ b r o a d c a s t ( ' g a m e : p h a s e ' ,   { 
                         p h a s e :   P H A S E . D E F E N S E , 
                         t o t a l S e c :   D E F E N S E _ S E C 
                 } ) ; 
 
                 t h i s . _ s t a r t T i m e r ( D E F E N S E _ S E C ,   ( )   = >   t h i s . _ s t a r t A g r e e ( ) ) ; 
         } 
 
         / /   - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
         / /   P h a s e :   A G R E E   ( ? ���/ ����޸? ? ? K��) 
         / /   - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
         _ s t a r t A g r e e ( )   { 
                 t h i s . p h a s e   =   P H A S E . A G R E E ; 
                 t h i s . a g r e e s . c l e a r ( ) ; 
 
                 t h i s . _ b r o a d c a s t ( ' g a m e : p h a s e ' ,   { 
                         p h a s e :   P H A S E . A G R E E , 
                         t o t a l S e c :   A G R E E _ S E C , 
                         r e j e c t C o u n t :   t h i s . r e j e c t C o u n t 
                 } ) ; 
 
                 t h i s . _ s t a r t T i m e r ( A G R E E _ S E C ,   ( )   = >   t h i s . _ r e s o l v e A g r e e ( ) ) ; 
         } 
 
         / * *   ? ���/ ����޸? ? ? ���  * / 
         r e c e i v e A g r e e ( v o t e r S o c k e t I d ,   a g r e e d )   { 
                 i f   ( t h i s . p h a s e   ! = =   P H A S E . A G R E E )   r e t u r n ; 
                 i f   ( v o t e r S o c k e t I d   = = =   t h i s . a c c u s e d S o c k e t I d )   r e t u r n ;   / /   ? y$��? ? B���$�  ? ����
 
                 t h i s . a g r e e s . s e t ( v o t e r S o c k e t I d ,   a g r e e d ) ; 
 
                 / /   ? ��]�  ? ����  ? ? ��1���  ����
                 c o n s t   e l i g i b l e C o u n t   =   t h i s . r o o m . u s e r s . s i z e   -   1 ; 
                 i f   ( t h i s . a g r e e s . s i z e   > =   e l i g i b l e C o u n t )   { 
                         t h i s . _ c l e a r T i m e r ( ) ; 
                         t h i s . _ r e s o l v e A g r e e ( ) ; 
                 } 
         } 
 
         / * *   ? ���  ����  * / 
         _ r e s o l v e A g r e e ( )   { 
                 / /   [ E - 2 ]   ? |1#�  ? K��? ? ? ��]���? rn׬? ? ���  (`����? ? (`����  ( ������? ���  ? ����) 
                 c o n s t   a c t u a l V o t e r s     =   t h i s . a g r e e s . s i z e ; 
                 c o n s t   a g r e e C o u n t         =   A r r a y . f r o m ( t h i s . a g r e e s . v a l u e s ( ) ) . f i l t e r ( v   = >   v ) . l e n g t h ; 
                 c o n s t   d i s a g r e e C o u n t   =   a c t u a l V o t e r s   -   a g r e e C o u n t ; 
 
                 / /   ? ��"? ? ? K��  ? ? ? G�E�? ? ? ��? ? �[�æ�:   ? ���  ���%  ( rnլ���Z? 
                 l e t   m a j o r i t y ; 
                 i f   ( a c t u a l V o t e r s   = = =   0 )   { 
                         / /   ? ��"? ? ? K��  ? ? ? �2  (`����? ? ? ����o? �Z���
                         t h i s . _ b r o a d c a s t ( ' g a m e : c o n f i r m e d ' ,   {   a c c u s e d S o c k e t I d :   t h i s . a c c u s e d S o c k e t I d   } ) ; 
                         s e t T i m e o u t ( ( )   = >   t h i s . _ s t a r t K e y w o r d ( ) ,   1 5 0 0 ) ; 
                         r e t u r n ; 
                 } 
                 m a j o r i t y   =   M a t h . f l o o r ( a c t u a l V o t e r s   /   2 )   +   1 ; 
 
                 i f   ( d i s a g r e e C o u n t   > =   m a j o r i t y )   { 
                         / /   P R D :   ����޸? ? (`����? ? ? ? z�� �[? �o{1�
                         t h i s . r e j e c t C o u n t + + ; 
                         t h i s . _ b r o a d c a s t ( ' g a m e : r e j e c t e d ' ,   {   r e j e c t C o u n t :   t h i s . r e j e c t C o u n t   } ) ; 
                         s e t T i m e o u t ( ( )   = >   { 
                                 t h i s . _ s t a r t D i s c u s s i n g ( ) ; 
                         } ,   2 0 0 0 ) ; 
                 }   e l s e   { 
                         / /   ? ���  (`����? ? ? ? ? |1Y�? ? ? c$�
                         t h i s . _ b r o a d c a s t ( ' g a m e : c o n f i r m e d ' ,   {   a c c u s e d S o c k e t I d :   t h i s . a c c u s e d S o c k e t I d   } ) ; 
                         s e t T i m e o u t ( ( )   = >   t h i s . _ s t a r t K e y w o r d ( ) ,   1 5 0 0 ) ; 
                 } 
         } 
 
         / /   - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
         / /   P h a s e :   K E Y W O R D   ( �N��? ? ? 2 0 �s? 
         / /   - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
         _ s t a r t K e y w o r d ( )   { 
                 t h i s . p h a s e   =   P H A S E . K E Y W O R D ; 
 
                 / /   ? y$��? /�ɿ�[? ? ? ? �Ć�
                 t h i s . i o . t o ( t h i s . a c c u s e d S o c k e t I d ) . e m i t ( ' g a m e : p h a s e ' ,   { 
                         p h a s e :   P H A S E . K E Y W O R D , 
                         t o t a l S e c :   K E Y W O R D _ S E C , 
                         i s A c c u s e d :   t r u e , 
                         c i t i z e n W o r d :   t h i s . w o r d P a i r . c i t i z e n   / /   ? �� �? ��?   ����? ? ? ? ? ? ����
                 } ) ; 
 
                 / /   ? �g2��� ? ? ? � rn? ? ��2
                 f o r   ( c o n s t   [ s i d ]   o f   t h i s . r o o m . u s e r s )   { 
                         i f   ( s i d   ! = =   t h i s . a c c u s e d S o c k e t I d )   { 
                                 t h i s . i o . t o ( s i d ) . e m i t ( ' g a m e : p h a s e ' ,   { 
                                         p h a s e :   P H A S E . K E Y W O R D , 
                                         t o t a l S e c :   K E Y W O R D _ S E C , 
                                         i s A c c u s e d :   f a l s e 
                                 } ) ; 
                         } 
                 } 
 
                 t h i s . _ s t a r t T i m e r ( K E Y W O R D _ S E C ,   ( )   = >   { 
                         / /   ? ����  �sG���  ? ? ? � 1u? �[ˮ]��o? ���%
                         t h i s . _ r e s o l v e R e s u l t ( ' ' ) ; 
                 } ) ; 
         } 
 
         / * *   ? |1Y�? ? ? ��g�  ? ���  * / 
         r e c e i v e K e y w o r d ( s e n d e r S o c k e t I d ,   k e y w o r d )   { 
                 i f   ( t h i s . p h a s e   ! = =   P H A S E . K E Y W O R D )   r e t u r n ; 
                 i f   ( s e n d e r S o c k e t I d   ! = =   t h i s . a c c u s e d S o c k e t I d )   r e t u r n ; 
 
                 t h i s . _ c l e a r T i m e r ( ) ; 
                 t h i s . _ r e s o l v e R e s u l t ( k e y w o r d . t r i m ( ) ) ; 
         } 
 
         / /   - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
         / /   P h a s e :   R E S U L T   ( �[̬��  ? ׬�) 
         / /   - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
         _ r e s o l v e R e s u l t ( s u b m i t t e d K e y w o r d )   { 
                 t h i s . p h a s e   =   P H A S E . R E S U L T ; 
 
                 c o n s t   c o r r e c t A n s w e r     =   t h i s . w o r d P a i r . c i t i z e n ; 
                 c o n s t   i s C o r r e c t             =   s u b m i t t e d K e y w o r d . t o L o w e r C a s e ( )   = = =   c o r r e c t A n s w e r . t o L o w e r C a s e ( ) ; 
                 c o n s t   i s A c c u s e d L i a r     =   t h i s . a c c u s e d S o c k e t I d   = = =   t h i s . l i a r S o c k e t I d ; 
 
                 / * * 
                   *   P R D   ? /�Բ  ? ׬�  (`����: 
                   *   [ ? �� �? ? ? 8�%  =   ? ���? -�?   ? ����? ? ����c�  �[�æ�] 
                   *       -   ? ���? -�?   ����h�  ? �� �? ? ? ? ? �� �? ? + 2 ? ?                   *       -   ? ���? -�?   ? ����? ? ? ��?   ? ? 9m? ? ��?   + 1 ? ?                   *       -   ? �g2���   + 0 ? ?                   * 
                   *   [ ? ��?   ? 8�%  =   ? ���? -�?   ? ����? ? ? � 1u? �[�æ�] 
                   *       -   ? ���? ? 0 ? ?                   *       -   ? �g2���   ? ��?   ? ��]�  + 1 ? ?                   * / 
                 c o n s t   s c o r e C h a n g e s   =   { } ;   / /   s o c k e t I d   ? ? d e l t a 
 
                 i f   ( i s C o r r e c t )   { 
                         / /   ? �� �? ? ? 8�%
                         i f   ( i s A c c u s e d L i a r )   { 
                                 s c o r e C h a n g e s [ t h i s . a c c u s e d S o c k e t I d ]   =   2 ; 
                         }   e l s e   { 
                                 s c o r e C h a n g e s [ t h i s . a c c u s e d S o c k e t I d ]   =   1 ; 
                         } 
                 }   e l s e   { 
                         / /   ? ��?   ? 8�%
                         f o r   ( c o n s t   [ s i d ]   o f   t h i s . r o o m . u s e r s )   { 
                                 i f   ( s i d   ! = =   t h i s . a c c u s e d S o c k e t I d )   { 
                                         s c o r e C h a n g e s [ s i d ]   =   1 ; 
                                 } 
                         } 
                 } 
 
                 / /   ? /�Բ  ? ����
                 f o r   ( c o n s t   [ s i d ,   u s e r ]   o f   t h i s . r o o m . u s e r s )   { 
                         u s e r . s c o r e   + =   ( s c o r e C h a n g e s [ s i d ]   | |   0 ) ; 
                 } 
 
                 / /   �[̬��  ɑ���? ����? }1ô
                 c o n s t   u s e r s P a y l o a d   =   A r r a y . f r o m ( t h i s . r o o m . u s e r s . v a l u e s ( ) ) . m a p ( u   = >   ( { 
                         s o c k e t I d :   u . s o c k e t I d , 
                         n i c k n a m e :   u . n i c k n a m e , 
                         e m o j i :   u . e m o j i , 
                         p h o t o U r l :   u . p h o t o U r l   | |   n u l l , 
                         s c o r e :   u . s c o r e , 
                         s c o r e D e l t a :   s c o r e C h a n g e s [ u . s o c k e t I d ]   | |   0 , 
                         i s H o s t :   u . i s H o s t 
                 } ) ) ; 
 
                 t h i s . _ b r o a d c a s t ( ' g a m e : r e s u l t ' ,   { 
                         i s C o r r e c t , 
                         i s A c c u s e d L i a r , 
                         a c c u s e d S o c k e t I d :   t h i s . a c c u s e d S o c k e t I d , 
                         l i a r S o c k e t I d :         t h i s . l i a r S o c k e t I d , 
                         c i t i z e n W o r d :           c o r r e c t A n s w e r , 
                         s u b m i t t e d K e y w o r d , 
                         l i a r W o r d :                 t h i s . w o r d P a i r . l i a r , 
                         c a t e g o r y :                 t h i s . w o r d P a i r . c a t e g o r y , 
                         u s e r s :                       u s e r s P a y l o a d , 
                         v i c t o r y T e a m :           i s C o r r e c t   ?   ' L I A R '   :   ' C I T I Z E N ' 
                 } ) ; 
 
                 / /   �[����  ������  ? ? ۊy$��  I D L E   ? ��m��o?                 t h i s . r o o m . g a m e   =   n u l l ; 
         } 
 
         / /   - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
         / /   ? �ȥ�
         / /   - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
         _ b r o a d c a s t ( e v e n t ,   d a t a )   { 
                 t h i s . i o . t o ( t h i s . r o o m I d ) . e m i t ( e v e n t ,   d a t a ) ; 
         } 
 
         _ s t a r t T i m e r ( t o t a l S e c ,   o n E x p i r e )   { 
                 t h i s . _ c l e a r T i m e r ( ) ; 
                 t h i s . _ t i m e r S e c   =   t o t a l S e c ; 
 
                 t h i s . _ b r o a d c a s t ( ' g a m e : t i m e r ' ,   {   s e c :   t o t a l S e c ,   t o t a l S e c   } ) ; 
 
                 t h i s . _ t i m e r I n t e r v a l   =   s e t I n t e r v a l ( ( )   = >   { 
                         t h i s . _ t i m e r S e c - - ; 
                         t h i s . _ b r o a d c a s t ( ' g a m e : t i m e r ' ,   {   s e c :   t h i s . _ t i m e r S e c ,   t o t a l S e c   } ) ; 
 
                         i f   ( t h i s . _ t i m e r S e c   < =   0 )   { 
                                 t h i s . _ c l e a r T i m e r ( ) ; 
                                 o n E x p i r e ( ) ; 
                         } 
                 } ,   1 0 0 0 ) ; 
         } 
 
         _ c l e a r T i m e r ( )   { 
                 i f   ( t h i s . _ t i m e r I n t e r v a l )   { 
                         c l e a r I n t e r v a l ( t h i s . _ t i m e r I n t e r v a l ) ; 
                         t h i s . _ t i m e r I n t e r v a l   =   n u l l ; 
                 } 
         } 
 
         / * *   ۊ? ? ? #�  ? ? ? ��%  * / 
         d e s t r o y ( )   { 
                 t h i s . _ c l e a r T i m e r ( ) ; 
         } 
 } 
 
 m o d u l e . e x p o r t s   =   {   L i a r E n g i n e ,   P H A S E   } ; 
  
 