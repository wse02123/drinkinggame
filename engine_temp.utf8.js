/**
 * LiarEngine ???쇱씠??寃뚯엫 ?쒕쾭 ?ъ씠???곹깭癒몄떊
 * PRD 3.1 ?꾩껜 猷?援ы쁽
 *
 * State Flow:
 *   IDLE ??DISCUSSING ??VOTING ??DEFENSE ??AGREE ??KEYWORD ??RESULT
 *   (遺寃???AGREE ??DISCUSSING 濡ㅻ갚, 理쒕? 2??遺寃???媛뺤젣 KEYWORD)
 */

// ============================================================
// ?쒖떆???곗씠??(移댄뀒怨좊━ ??[?쒕? ?⑥뼱, ?쇱씠???좎궗 ?⑥뼱] ??
// ============================================================
const WORD_PAIRS = [
    { category: '怨쇱씪',   citizen: '?섎컯',   liar: '李몄쇅'    },
    { category: '怨쇱씪',   citizen: '?멸린',   liar: '諛⑹슱?좊쭏?? },
    { category: '?숇Ъ',   citizen: '媛뺤븘吏', liar: '怨좎뼇??  },
    { category: '?숇Ъ',   citizen: '?좊겮',   liar: '?꾩뒪??  },
    { category: '?뚯떇',   citizen: '?쇱옄',   liar: '?뚯뒪?'  },
    { category: '?뚯떇',   citizen: '移섑궓',   liar: '?쇱옄'    },
    { category: '?뚯떇',   citizen: '?쇨껸??, liar: '紐⑹궡'    },
    { category: '?μ냼',   citizen: '?꾩꽌愿', liar: '?쒖젏'    },
    { category: '?μ냼',   citizen: '移댄럹',   liar: '?덉뒪?좊옉'},
    { category: '吏곸뾽',   citizen: '?섏궗',   liar: '媛꾪샇??  },
    { category: '吏곸뾽',   citizen: '?좎깮??, liar: '援먯닔'    },
    { category: '?ㅽ룷痢?, citizen: '異뺢뎄',   liar: '?뗭궡'    },
    { category: '?ㅽ룷痢?, citizen: '?띻뎄',   liar: '?몃뱶蹂?  },
    { category: '?곗삁??, citizen: 'BTS',    liar: 'EXO'     },
    { category: '?곹솕',   citizen: '?대깽???, liar: '?꾩씠?몃㎤' },
];

// ============================================================
// 寃뚯엫 ?곹깭 ?곸닔
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

// PRD: ??대㉧ 怨듭떇
const DISCUSS_BASE_SEC = 60;
const DISCUSS_PER_USER_SEC = 30;
const VOTE_SEC = 20;
const DEFENSE_SEC = 30;
const AGREE_SEC = 20;
const KEYWORD_SEC = 20;

// ============================================================
// LiarEngine ?대옒??// ============================================================
class LiarEngine {
    constructor(room, io) {
        this.room       = room;      // 諛?媛앹껜 李몄“
        this.io         = io;        // socket.io ?쒕쾭 ?몄뒪?댁뒪
        this.roomId     = room.id;

        // 寃뚯엫 ?곹깭
        this.phase      = PHASE.IDLE;
        this.wordPair   = null;      // { category, citizen, liar }
        this.liarSocketId = null;    // ?쇱씠???뚯폆 ID

        // ?ы몴
        this.votes      = new Map(); // voterId ??targetSocketId
        this.accusedSocketId = null; // 吏紐⑸맂 ?⑹쓽??
        // ?숈쓽/誘몃룞??        this.agrees     = new Map(); // voterId ??boolean
        this.rejectCount = 0;        // PRD: 遺寃??꾩쟻 ?잛닔 (理쒕? 2)

        // ??대㉧
        this._timerInterval = null;
        this._timerSec = 0;
    }

    // ----------------------------------------------------------
    // 寃뚯엫 ?쒖옉
    // ----------------------------------------------------------
    start() {
        // ?쒖떆??臾댁옉???좏깮
        this.wordPair = WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)];

        // ?쇱씠??臾댁옉???좎젙
        const userIds = Array.from(this.room.users.keys());
        this.liarSocketId = userIds[Math.floor(Math.random() * userIds.length)];

        console.log(`[寃뚯엫 ?쒖옉] ${this.roomId} | ?쒖떆?? ${this.wordPair.citizen} | ?쇱씠?? ${this.liarSocketId}`);

        // PRD: 媛쒕퀎 ?⑥뼱 ?꾩넚 (??븷 釉붾씪?몃뱶)
        for (const [sid, _user] of this.room.users) {
            const isLiar  = sid === this.liarSocketId;
            const word    = isLiar ? this.wordPair.liar : this.wordPair.citizen;
            this.io.to(sid).emit('game:role', {
                isLiar,
                word,
                category: this.wordPair.category
            });
        }

        // ?좊줎 ?섏씠利??쒖옉
        this._startDiscussing();
    }

    // ----------------------------------------------------------
    // Phase: DISCUSSING (?좊줎)
    // ----------------------------------------------------------
    _startDiscussing() {
        this.phase  = PHASE.DISCUSSING;
        const n     = this.room.users.size;
        // PRD: (N 횞 30) + 60珥?        const totalSec = (n * DISCUSS_PER_USER_SEC) + DISCUSS_BASE_SEC;

        this._broadcast('game:phase', {
            phase: PHASE.DISCUSSING,
            totalSec,
            rejectCount: this.rejectCount
        });

        this._startTimer(totalSec, () => this._startVoting());
    }

    // ----------------------------------------------------------
    // Phase: VOTING (吏紐??ы몴)
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

    /** ?ы몴 ?섏떊 */
    receiveVote(voterSocketId, targetSocketId) {
        if (this.phase !== PHASE.VOTING) return;
        if (voterSocketId === targetSocketId) return; // 蹂몄씤 ?ы몴 遺덇?

        this.votes.set(voterSocketId, targetSocketId);
        this._broadcast('game:vote_count', { voteCount: this.votes.size });

        // ?꾩썝 ?ы몴 ?꾨즺 ??利됱떆 吏묎퀎
        if (this.votes.size >= this.room.users.size) {
            this._clearTimer();
            this._resolveVoting();
        }
    }

    /** ?ы몴 吏묎퀎 */
    _resolveVoting() {
        // [E-1] ?꾨Т???ы몴 ???덉쓣 ?????쒕뜡 吏紐?+ ?밸퀎 ?뚮┝
        if (this.votes.size === 0) {
            const userIds = Array.from(this.room.users.keys());
            this.accusedSocketId = userIds[Math.floor(Math.random() * userIds.length)];
            const accusedUser = this.room.users.get(this.accusedSocketId);

            this._broadcast('game:accused_random', {
                accusedSocketId: this.accusedSocketId,
                accusedNickname: accusedUser?.nickname || '???',
                accusedEmoji:    accusedUser?.emoji    || '?샄',
                accusedPhoto:    accusedUser?.photoUrl || null
            });
            // accused ?뺣낫??媛숈씠 ?숆린??            this._broadcast('game:accused', {
                accusedSocketId: this.accusedSocketId,
                accusedNickname: accusedUser?.nickname || '???',
                accusedEmoji:    accusedUser?.emoji    || '?샄',
                accusedPhoto:    accusedUser?.photoUrl || null
            });
            console.log(`[?쒕뜡 吏紐? ${this.roomId} ??${accusedUser?.nickname}`);

            if (this.rejectCount >= 2) {
                setTimeout(() => this._startKeyword(), 2500);
            } else {
                setTimeout(() => this._startDefense(), 2500);
            }
            return;
        }

        // ?앺몴 ??怨꾩궛
        const tally = new Map(); // targetSocketId ??count
        for (const targetId of this.votes.values()) {
            tally.set(targetId, (tally.get(targetId) || 0) + 1);
        }

        // 理쒕떎 ?앺몴???좎젙 (?숈젏 ??臾댁옉??
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
            accusedEmoji:    accusedUser?.emoji    || '?샄',
            accusedPhoto:    accusedUser?.photoUrl || null
        });

        // PRD: 遺寃?2???꾩쟻 ??蹂濡??숈쓽 ?놁씠 諛붾줈 ?ㅼ썙??        if (this.rejectCount >= 2) {
            setTimeout(() => this._startKeyword(), 1500);
        } else {
            setTimeout(() => this._startDefense(), 1500);
        }
    }

    // ----------------------------------------------------------
    // Phase: DEFENSE (理쒗썑 蹂濡?30珥?
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
    // Phase: AGREE (?숈쓽/誘몃룞???ы몴)
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

    /** ?숈쓽/誘몃룞???섏떊 */
    receiveAgree(voterSocketId, agreed) {
        if (this.phase !== PHASE.AGREE) return;
        if (voterSocketId === this.accusedSocketId) return; // ?⑹쓽??蹂몄씤 ?쒖쇅

        this.agrees.set(voterSocketId, agreed);

        // ?꾩썝 ?꾨즺 ??利됱떆 吏묎퀎
        const eligibleCount = this.room.users.size - 1;
        if (this.agrees.size >= eligibleCount) {
            this._clearTimer();
            this._resolveAgree();
        }
    }

    /** ?숈쓽 吏묎퀎 */
    _resolveAgree() {
        // [E-2] ?ㅼ젣 ?ы몴???몄썝留?湲곗??쇰줈 怨쇰컲??怨꾩궛 (誘명닾?쒖옄 ?쒖쇅)
        const actualVoters  = this.agrees.size;
        const agreeCount    = Array.from(this.agrees.values()).filter(v => v).length;
        const disagreeCount = actualVoters - agreeCount;

        // ?꾨Т???ы몴 ???덇굅???숈젏??寃쎌슦: ?숈쓽 泥섎━ (湲곕낯媛?
        let majority;
        if (actualVoters === 0) {
            // ?꾨Т???ы몴 ???섎㈃ 怨쇰컲???숈쓽濡?媛꾩＜
            this._broadcast('game:confirmed', { accusedSocketId: this.accusedSocketId });
            setTimeout(() => this._startKeyword(), 1500);
            return;
        }
        majority = Math.floor(actualVoters / 2) + 1;

        if (disagreeCount >= majority) {
            // PRD: 誘몃룞??怨쇰컲????遺寃?濡ㅻ갚
            this.rejectCount++;
            this._broadcast('game:rejected', { rejectCount: this.rejectCount });
            setTimeout(() => {
                this._startDiscussing();
            }, 2000);
        } else {
            // ?숈쓽 怨쇰컲?????ㅼ썙???④퀎
            this._broadcast('game:confirmed', { accusedSocketId: this.accusedSocketId });
            setTimeout(() => this._startKeyword(), 1500);
        }
    }

    // ----------------------------------------------------------
    // Phase: KEYWORD (二쇨???20珥?
    // ----------------------------------------------------------
    _startKeyword() {
        this.phase = PHASE.KEYWORD;

        // ?⑹쓽?먯뿉寃????쒖떆
        this.io.to(this.accusedSocketId).emit('game:phase', {
            phase: PHASE.KEYWORD,
            totalSec: KEYWORD_SEC,
            isAccused: true,
            citizenWord: this.wordPair.citizen // ?쇱씠?닿? 留욏??????뺣떟
        });

        // ?섎㉧吏???湲??붾㈃
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
            // ?쒓컙 珥덇낵 ???由?寃껋쑝濡?泥섎━
            this._resolveResult('');
        });
    }

    /** ?ㅼ썙???쒖텧 ?섏떊 */
    receiveKeyword(senderSocketId, keyword) {
        if (this.phase !== PHASE.KEYWORD) return;
        if (senderSocketId !== this.accusedSocketId) return;

        this._clearTimer();
        this._resolveResult(keyword.trim());
    }

    // ----------------------------------------------------------
    // Phase: RESULT (寃곌낵 ?곗젙)
    // ----------------------------------------------------------
    _resolveResult(submittedKeyword) {
        this.phase = PHASE.RESULT;

        const correctAnswer  = this.wordPair.citizen;
        const isCorrect      = submittedKeyword.toLowerCase() === correctAnswer.toLowerCase();
        const isAccusedLiar  = this.accusedSocketId === this.liarSocketId;

        /**
         * PRD ?먯닔 ?곗젙 怨듭떇:
         * [?쇱씠???밸━ = ?좎젙?먭? ?뺣떟??留욎텣 寃쎌슦]
         *   - ?좎젙?먭? 吏꾩쭨 ?쇱씠?????쇱씠??+2??         *   - ?좎젙?먭? ?듭슱???쒕? ??洹??쒕? +1??         *   - ?섎㉧吏 +0??         *
         * [?쒕? ?밸━ = ?좎젙?먭? ?뺣떟???由?寃쎌슦]
         *   - ?좎젙??0??         *   - ?섎㉧吏 ?쒕? ?꾩썝 +1??         */
        const scoreChanges = {}; // socketId ??delta

        if (isCorrect) {
            // ?쇱씠???밸━
            if (isAccusedLiar) {
                scoreChanges[this.accusedSocketId] = 2;
            } else {
                scoreChanges[this.accusedSocketId] = 1;
            }
        } else {
            // ?쒕? ?밸━
            for (const [sid] of this.room.users) {
                if (sid !== this.accusedSocketId) {
                    scoreChanges[sid] = 1;
                }
            }
        }

        // ?먯닔 ?곸슜
        for (const [sid, user] of this.room.users) {
            user.score += (scoreChanges[sid] || 0);
        }

        // 寃곌낵 釉뚮줈?쒖틦?ㅽ듃
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

        // 寃뚯엫 醫낅즺 ??諛⑹쓣 IDLE ?곹깭濡?        this.room.game = null;
    }

    // ----------------------------------------------------------
    // ?좏떥
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

    /** 諛???젣 ???뺣━ */
    destroy() {
        this._clearTimer();
    }
}

module.exports = { LiarEngine, PHASE };

