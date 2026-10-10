#!/usr/bin/env bash
# PS-AMS v1.6.1 acceptance battery — web backend, scratch database.
# Starts the standalone server on :3111 with a throwaway SQLite file,
# runs every acceptance check from the issue list, prints PASS/FAIL.
set -u
cd /home/z/my-project

DB="file:/home/z/my-project/db/verify-test.db"
rm -f db/verify-test.db
PORT=3111
export DATABASE_URL="$DB" HOSTNAME=127.0.0.1 PORT NODE_ENV=production
node .next/standalone/server.js > verify-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT

# wait for readiness
for i in $(seq 1 40); do
  curl -s -m 2 "http://127.0.0.1:$PORT/api/data-info" > /dev/null 2>&1 && break
  sleep 0.5
done

B="http://127.0.0.1:$PORT"
fail=0
ok() { if [ "$1" = "0" ]; then echo "  PASS  $2"; else echo "  FAIL  $2"; fail=1; fi }

echo "== 3. settings data location =="
DI=$(curl -s "$B/api/data-info")
echo "$DI" | grep -q '"database":"/home/z/my-project/db/verify-test.db"'; ok $? "data-info returns the real DATABASE_URL file"

echo "== 4. letterhead defaults =="
curl -s "$B/api/settings" | grep -q "Markaz Colony, Karanthur, Kunnamangalam, Kozhikode"; ok $? "empty-DB letterhead uses the Kozhikode address"
curl -s "$B/api/settings" | grep -q "Municipal Stadium Road"; [ $? -ne 0 ]; ok $? "no stale Municipal Stadium Road default"

echo "== 1. dashboard == fees defaulter count =="
DASH_DEF=$(curl -s "$B/api/dashboard" | python3 -c "import json,sys;print(json.load(sys.stdin)['feeCycle']['defaulterCount'])")
DASH_DUE=$(curl -s "$B/api/dashboard" | python3 -c "import json,sys;print(json.load(sys.stdin)['feeCycle']['dueSoonCount'])")
FEES_DEF=$(curl -s "$B/api/fees/statuses" | python3 -c "import json,sys;rows=json.load(sys.stdin);print(sum(1 for r in rows if r['isDefaulter']))")
FEES_DUE=$(curl -s "$B/api/fees/statuses" | python3 -c "import json,sys;rows=json.load(sys.stdin);print(sum(1 for r in rows if not r['isDefaulter'] and r['pendingMonths']))")
[ "$DASH_DEF" = "$FEES_DEF" ]; ok $? "dashboard overdue ($DASH_DEF) == fees defaulters ($FEES_DEF)"
[ "$DASH_DUE" = "$FEES_DUE" ]; ok $? "dashboard due ($DASH_DUE) == fees due-not-defaulted ($FEES_DUE)"

echo "== 1b. new joiner is neither due nor overdue =="
BEFORE_DUE=$DASH_DUE
BEFORE_PAID=$(curl -s "$B/api/dashboard" | python3 -c "import json,sys;print(json.load(sys.stdin)['feeCycle']['paidCount'])")
JOIN=$(curl -s -X POST "$B/api/students" -H "Content-Type: application/json" -d "{\"fullName\":\"Verify Joiner\",\"dateOfBirth\":\"2013-04-01\",\"parentName\":\"Verify Parent\",\"mobile\":\"9847000001\",\"ageCategory\":\"Junior\",\"monthlyFee\":500,\"registrationDate\":\"$(date +%Y-%m-%d)\"}")
JOIN_ID=$(echo "$JOIN" | python3 -c "import json,sys;print(json.load(sys.stdin).get('id',''))")
[ -n "$JOIN_ID" ]; ok $? "new joiner registered ($JOIN_ID)"
AFTER_DUE=$(curl -s "$B/api/dashboard" | python3 -c "import json,sys;print(json.load(sys.stdin)['feeCycle']['dueSoonCount'])")
AFTER_PAID=$(curl -s "$B/api/dashboard" | python3 -c "import json,sys;print(json.load(sys.stdin)['feeCycle']['paidCount'])")
[ "$AFTER_DUE" = "$BEFORE_DUE" ]; ok $? "due count unchanged after joiner ($BEFORE_DUE -> $AFTER_DUE)"
[ "$AFTER_PAID" = "$((BEFORE_PAID + 1))" ]; ok $? "joiner lands in settled bucket ($BEFORE_PAID -> $AFTER_PAID)"

echo "== 5. payment write-path guards =="
# register a player with 8-month-old registration → at least 6 pending months
REG=$(python3 -c "
from datetime import datetime
n=datetime.now().replace(day=1)
m=n.month-8; y=n.year
while m<=0: m+=12; y-=1
print(f'{y}-{m:02d}-05')")
SID=$(curl -s -X POST "$B/api/students" -H "Content-Type: application/json" -d "{\"fullName\":\"Verify Arrears\",\"dateOfBirth\":\"2012-02-01\",\"parentName\":\"Arrears Parent\",\"mobile\":\"9847000009\",\"ageCategory\":\"Junior\",\"monthlyFee\":500,\"registrationDate\":\"$REG\"}" | python3 -c "import json,sys;print(json.load(sys.stdin).get('id',''))")
MONTHS=$(curl -s "$B/api/fees/statuses" | python3 -c "
import json,sys
rows=json.load(sys.stdin)
r=[x for x in rows if x['student']['id']=='$SID'][0]
print(json.dumps(r['pendingMonths'][:6]))")
FEE=$(curl -s "$B/api/students/$SID" | python3 -c "import json,sys;print(json.load(sys.stdin)['monthlyFee'])")
echo "   arrears student $SID fee=$FEE months=$MONTHS"
# ₹1 for six months must be rejected
CODE=$(curl -s -o /tmp/p1.json -w "%{http_code}" -X POST "$B/api/payments" -H "Content-Type: application/json" -d "{\"studentId\":\"$SID\",\"months\":$MONTHS,\"amount\":1}")
grep -q "Amount must match" /tmp/p1.json; ok $? "₹1 for six months rejected with amount-mismatch (HTTP $CODE)"
[ "$CODE" = "400" ]; ok $? "rejection is a 400"
# exact amount succeeds
TOTAL=$((FEE * 6))
CODE=$(curl -s -o /tmp/p2.json -w "%{http_code}" -X POST "$B/api/payments" -H "Content-Type: application/json" -d "{\"studentId\":\"$SID\",\"months\":$MONTHS,\"amount\":$TOTAL}")
[ "$CODE" = "201" ]; ok $? "exact-amount payment accepted (HTTP $CODE)"
# submitting the SAME months again must be rejected (no double receipt)
CODE=$(curl -s -o /tmp/p3.json -w "%{http_code}" -X POST "$B/api/payments" -H "Content-Type: application/json" -d "{\"studentId\":\"$SID\",\"months\":$MONTHS,\"amount\":$TOTAL}")
grep -q "already settled" /tmp/p3.json; ok $? "double-submit rejected — month already receipted (HTTP $CODE)"
[ "$CODE" = "400" ]; ok $? "double-submit is a 400"
# bad month format rejected (web already did; still guarded by shared validator)
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/payments" -H "Content-Type: application/json" -d "{\"studentId\":\"$SID\",\"months\":[\"01-2026\"],\"amount\":$FEE}")
[ "$CODE" = "400" ]; ok $? "malformed month key rejected (HTTP $CODE)"

echo "== 8. student write-path guards =="
CODE=$(curl -s -o /tmp/s1.json -w "%{http_code}" -X POST "$B/api/students" -H "Content-Type: application/json" -d '{"fullName":"Future Baby","dateOfBirth":"2999-01-01","parentName":"X","mobile":"9847000002","ageCategory":"Junior"}')
grep -q "future" /tmp/s1.json && [ "$CODE" = "400" ]; ok $? "future DOB rejected (HTTP $CODE)"
CODE=$(curl -s -o /tmp/s2.json -w "%{http_code}" -X POST "$B/api/students" -H "Content-Type: application/json" -d '{"fullName":"Bad Phone","dateOfBirth":"2013-04-01","parentName":"X","mobile":"123","ageCategory":"Junior"}')
grep -q "10 digits" /tmp/s2.json && [ "$CODE" = "400" ]; ok $? "bad mobile rejected (HTTP $CODE)"
CODE=$(curl -s -o /tmp/s3.json -w "%{http_code}" -X POST "$B/api/students" -H "Content-Type: application/json" -d '{"fullName":"Neg Fee","dateOfBirth":"2013-04-01","parentName":"X","mobile":"9847000003","ageCategory":"Junior","monthlyFee":-5}')
grep -q "cannot be negative" /tmp/s3.json && [ "$CODE" = "400" ]; ok $? "negative fee rejected (HTTP $CODE)"

echo "== 7. demo load must not overwrite saved settings =="
# save a custom profile first
curl -s -X PUT "$B/api/settings" -H "Content-Type: application/json" -d '{"academyName":"Real Academy Kerala","phone":"+91 99999 11111"}' > /dev/null
curl -s -X POST "$B/api/demo" > /dev/null
S=$(curl -s "$B/api/settings")
echo "$S" | grep -q "Real Academy Kerala"; ok $? "custom academy name survives demo load"
echo "$S" | grep -q "+91 99999 11111"; ok $? "custom phone survives demo load"

echo "== 9. media path guard (web route) =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/media?path=../package.json")
[ "$CODE" = "400" ]; ok $? "traversal path rejected (HTTP $CODE)"

kill $SRV 2>/dev/null
echo
[ $fail = 0 ] && echo "ACCEPTANCE BATTERY: ALL PASS" || echo "ACCEPTANCE BATTERY: FAILURES PRESENT"
exit $fail
