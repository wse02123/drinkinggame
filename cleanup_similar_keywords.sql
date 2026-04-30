-- ================================================
-- 유사 키워드 제거 SQL
-- Supabase SQL Editor에서 실행하세요
-- ================================================

-- 스포츠: 축구/풋살 (같은 종목, 풋살 제거)
DELETE FROM liar_game_keywords WHERE keyword = '풋살';

-- 스포츠: 수영/수영장 중복
DELETE FROM liar_game_keywords WHERE keyword = '수영장' AND category = '스포츠';

-- 음식: 피자/파자 중복류 (라자냐/파스타 모두 이탈리안이지만 세부 달라 유지)
-- 음식: 치킨/닭갈비 -> 닭갈비 제거 (둘 다 닭)
DELETE FROM liar_game_keywords WHERE keyword = '닭갈비';

-- 장소: 카페/커피숍 중복 제거
DELETE FROM liar_game_keywords WHERE keyword = '커피숍';

-- 장소: 편의점/마트 (마트가 더 큰 개념, 편의점 유지)
-- 장소: 헬스장/체육관 중복 제거
DELETE FROM liar_game_keywords WHERE keyword = '체육관' AND category = '장소';

-- 동물: 고양이/고양이과 동물들 (비슷한 계열 정리)
-- 동물: 강아지/개 중복
DELETE FROM liar_game_keywords WHERE keyword = '개' AND category = '동물';

-- 브랜드: 삼성/갤럭시 (같은 회사 다른 제품군이면 유지)
-- 브랜드: 현대/기아 (경쟁사지만 같은 그룹, 기아 제거)
DELETE FROM liar_game_keywords WHERE keyword = '기아';

-- 직업: 의사/의원 중복
DELETE FROM liar_game_keywords WHERE keyword = '의원' AND category = '직업';

-- 가전제품: TV/텔레비전 중복
DELETE FROM liar_game_keywords WHERE keyword = '텔레비전';

-- 남은 현황 확인
SELECT category, COUNT(*) as cnt
FROM liar_game_keywords
GROUP BY category
ORDER BY category;
