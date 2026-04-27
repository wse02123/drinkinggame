-- Supabase 데이터베이스 스키마 및 통계/로그 테이블 설계
-- Project: PartyGame Final

-- 기존에 생성된 구버전 테이블들이 있다면 먼저 삭제합니다. (초기화)
DROP TABLE IF EXISTS results CASCADE;
DROP TABLE IF EXISTS game_logs CASCADE;
DROP TABLE IF EXISTS votes CASCADE;
DROP TABLE IF EXISTS players CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;

-- 1. 방 정보 테이블
-- 게임이 진행 중인 방의 상태를 기록합니다.
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    password TEXT, -- 비밀방 생성을 위한 비밀번호 컬럼
    host_id UUID NOT NULL, -- 방장 player id
    game_status TEXT DEFAULT 'LOBBY', -- 'LOBBY'(대기/Y), 'PLAYING'(진행중), 'FINISHED'(종료/N)
    current_phase TEXT DEFAULT 'NONE', 
    max_players INTEGER DEFAULT 8,    -- 설정된 최대 인원수
    started_player_count INTEGER,     -- 실제 게임 시작 시점의 참여 인원수 (통계용)
    target_word TEXT,
    liar_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,  -- 게임 실제 시작 시각
    finished_at TIMESTAMP WITH TIME ZONE  -- 게임 완전히 끝난 시각
);

-- 2. 유저(플레이어) 테이블
-- 방에 접속한 플레이어의 세션 정보를 저장합니다.
CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    nickname TEXT NOT NULL,
    avatar_url TEXT,
    emoji TEXT,
    is_host BOOLEAN DEFAULT FALSE,
    score INTEGER DEFAULT 0, -- 누적 벌칙 잔 수 (최종 사람별 점수)
    is_winner BOOLEAN,       -- 게임 종료 시 승리 여부 (통계용)
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 투표 이력 테이블 (통계 추적용)
-- 누가 누구를 투표했는지 개별 기록을 남깁니다.
CREATE TABLE votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    voter_id UUID REFERENCES players(id),     -- 투표한 사람
    target_id UUID REFERENCES players(id),    -- 지목당한 사람 (투표 대상)
    phase_name TEXT NOT NULL,                 -- 어느 페이즈에서 나온 투표인지 (예: 'VOTING_PHASE_1')
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 게임 로그 테이블 (상세 행동 추적용)
-- 게임 중 발생한 주요 이벤트(키워드 제출, 동의/미동의 여부 등)를 기록합니다.
CREATE TABLE game_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id),
    action_type TEXT NOT NULL,                -- 'SUBMIT_KEYWORD', 'AGREE', 'DISAGREE', 'SKIP_PHASE'
    action_detail TEXT,                       -- 기록할 상세 내용 (예: 입력한 키워드 단어)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. 게임 최종 결과 테이블 (통계 및 정산용)
-- 게임 종료 시 최종 승리자 및 벌칙 분배 결과를 기록합니다.
CREATE TABLE results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    winner_team TEXT NOT NULL,                -- 'LIAR', 'CITIZEN'
    liar_id UUID REFERENCES players(id),
    is_liar_caught BOOLEAN NOT NULL,          -- 라이어가 투표로 잡혔는지 여부
    liar_guessed_word BOOLEAN,                -- 라이어가 역전 퀴즈에서 진짜 키워드를 맞췄는지 여부
    submitted_keyword TEXT,                   -- 라이어가 최종적으로 제출한 단어
    correct_keyword TEXT,                     -- 실제 시민의 키워드
    total_punishment_drinks INTEGER,          -- 이번 게임에서 발생한 총 벌칙 잔 수 합계 (통계용)
    play_duration_seconds INTEGER,            -- 게임 진행 총 소요 시간(초) (통계용)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Storage 버킷: 'avatars' (수동 생성 혹은 아래의 SQL 함수 사용 지원 시)
-- insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);

-- ==========================================
-- 보안 정책 (Row Level Security - RLS) 설정
-- ==========================================
-- 아래 항목들은 Supabase의 "RLS가 비활성화되어 있다"는 경고를 해결합니다.
-- 본 파티 게임은 링크 기반의 캐주얼 게임이므로, 누구나 읽고 쓸 수 있도록 공개(Public) 권한을 부여합니다.

-- 1. RLS 활성화
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;

-- 2. 모든 테이블에 대해 Public(익명) 접근 허용 폴리시(Policy) 추가
CREATE POLICY "Allow public all access on rooms" ON rooms FOR ALL USING (true);
CREATE POLICY "Allow public all access on players" ON players FOR ALL USING (true);
CREATE POLICY "Allow public all access on votes" ON votes FOR ALL USING (true);
CREATE POLICY "Allow public all access on game_logs" ON game_logs FOR ALL USING (true);
CREATE POLICY "Allow public all access on results" ON results FOR ALL USING (true);

