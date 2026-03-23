# Firebase 최종 연결 가이드

## 목적
- 갤럭시 휴대폰에서 앱이 꺼져 있어도 취소표 푸시를 받기 위한 최종 설정

## 반드시 필요한 외부 파일/값
1. Firebase 프로젝트의 `google-services.json`
   - 위치: `app/android/app/google-services.json`
2. Firebase Cloud Messaging 서버 키
   - 위치: `backend/config.json`의 `fcmServerKey`

## backend/config.json 예시
```json
{
  "port": 8787,
  "monitorIntervalSec": 15,
  "daysAhead": 21,
  "maxConcurrentGames": 8,
  "kboEndpoint": "https://www.koreabaseball.com/ws/Schedule.asmx/GetSchedule",
  "teamTicketUrl": "https://ticket.interpark.com/Contents/Sports/GoodsInfo?SportsCode=07001&TeamCode=PB004",
  "defaultGameUrl": "https://ticket.interpark.com/Contents/Sports/GoodsInfo?SportsCode=07001&TeamCode=PB004",
  "pushProvider": "fcm",
  "fcmServerKey": "YOUR_FIREBASE_SERVER_KEY",
  "dataFile": "./backend/data/state.json"
}
```

## 검증 순서
1. `google-services.json`를 넣는다
2. `backend/config.json`에 `pushProvider: "fcm"` 과 `fcmServerKey`를 넣는다
3. 백엔드 서버 실행
4. APK 설치 후 앱에서 백엔드 주소 저장
5. 앱에서 푸시 권한 허용
6. 앱에서 `알림 동작 테스트` 실행
7. 필요하면 `POST /api/test/alert` 직접 호출

## 현재 코드 기준 동작
- 푸시 토큰은 `/api/devices/register`에 저장
- 테스트 알림은 `/api/test/alert`
- 테스트/실제 알림 클릭 시 인터파크 URL로 이동

## 주의
- `google-services.json` 없이도 APK는 빌드되지만 실푸시는 동작하지 않음
- 서버 키 없이도 앱 내부 테스트는 되지만 원격 푸시는 발송되지 않음
