# 패키징 및 푸시 전환 가이드

## 목표
- 사용자가 앱을 열지 않아도 취소표 알림을 받을 수 있게 한다.
- 감지는 서버가 수행하고, 전달은 Android 패키징 앱의 푸시로 보낸다.

## 권장 구현 순서
1. 백엔드 서버를 외부 접근 가능한 환경에 배포
2. FCM 서버 키를 발급받아 `backend/config.json`에 설정
3. 앱에 Capacitor Push Notifications 플러그인 연결
4. Android 패키징 후 실제 기기 토큰을 `/api/devices/register`로 등록
5. 실경기 일정으로 수동 점검 후 자동 모니터링 활성화

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
  "fcmServerKey": "YOUR_FCM_SERVER_KEY",
  "dataFile": "./backend/data/state.json"
}
```

## Android 패키징 권장 명령
```powershell
cd app
npm install @capacitor/core @capacitor/cli @capacitor/android
npm install @capacitor/push-notifications
npx cap add android
npx cap sync android
npx cap open android
```

## 검증 체크리스트
- `GET /api/health`가 정상 응답하는지
- `POST /api/monitor/run` 결과가 200 또는 207로 오는지
- 앱 화면에서 실시간 연결 배지가 보이는지
- 실제 푸시 토큰이 `/api/devices/register`에 등록되는지
- 취소표 발생 시 `state.json`에 알림이 저장되는지
- 푸시 수신 후 링크 클릭 시 예매 페이지로 이동하는지

## 주의
- 현재 환경처럼 외부 네트워크가 제한된 곳에서는 KBO/NOL 호출이 실패할 수 있다.
- 실운영 전에는 실제 인터넷 연결 환경에서 점검해야 한다.
- FCM 서버 키 없이도 앱 내 실시간 알림과 브라우저 알림은 검증 가능하다.
