#!/usr/bin/env bash
set -euo pipefail

EMAIL="${1:-}"
if [[ -z "$EMAIL" ]]; then
  echo "usage: $0 <본인이메일>"
  echo "예: $0 me@example.test"
  exit 1
fi

CT="supabase_db_dei"

SELF_ID=$(docker exec "$CT" psql -U postgres -d postgres -tA -c "select id from auth.users where email = '$EMAIL';")

if [[ -z "$SELF_ID" ]]; then
  echo "❌ auth.users 에 email='$EMAIL' 없음. 앱에서 먼저 가입/로그인 하세요."
  exit 1
fi

echo "✓ 본인 user_id: $SELF_ID"

docker exec -i "$CT" psql -U postgres -d postgres -v self_id="$SELF_ID" < supabase/seeds/dev-room-join-self.sql

echo ""
echo "================================================================"
echo "✅ 방 join 완료. room_id = 00000000-0000-0000-0000-000000000001"
echo ""
echo "테스트 deep link 예시 (앱 안에서 자동 라우팅 처리):"
echo "  - S10 blur:       /(app)/room/00000000-0000-0000-0000-000000000001/preview"
echo "  - S13 grid:       /(app)/room/00000000-0000-0000-0000-000000000001"
echo "  - S11 촬영:        /(app)/room/00000000-0000-0000-0000-000000000001/upload"
echo "================================================================"
