# Firebase 최종 연결 가이드

## 목적
- 실제 취소표 감지 시 휴대폰으로 원격 푸시 알림을 보내기 위한 최종 설정

## 지금 프로젝트 상태
- 안드로이드 앱은 `google-services.json` 이 있으면 Firebase 앱 등록이 가능하도록 준비되어 있습니다.
- 백엔드는 Firebase Cloud Messaging `HTTP v1` 방식으로 푸시를 보낼 수 있도록 준비되어 있습니다.
- 따라서 지금 남은 것은 Firebase 콘솔에서 발급받는 자격 파일 2종입니다.

## 반드시 필요한 것
1. Android 앱용 `google-services.json`
- 위치: `app/android/app/google-services.json`
- Firebase 콘솔에서 안드로이드 앱 패키지 `com.stans.doosanjamsilalert` 로 등록 후 다운로드

2. Firebase 서비스 계정 JSON
- 권장 방식: Firebase 프로젝트와 연결된 Google Cloud 서비스 계정 키 JSON
- Render 환경변수로 넣는 값:
  - `PUSH_PROVIDER=fcm`
  - `FIREBASE_PROJECT_ID=...`
  - `FIREBASE_SERVICE_ACCOUNT_JSON=...`

## backend/config.json 예시
```json
{
  "port": 8787,
  "monitorIntervalSec": 15,
  "daysAhead": 21,
  "maxConcurrentGames": 8,
  "preferredConsecutiveSeats": 3,
  "kboEndpoint": "https://www.koreabaseball.com/ws/Schedule.asmx/GetSchedule",
  "teamTicketUrl": "https://ticket.interpark.com/Contents/Sports/GoodsInfo?SportsCode=07001&TeamCode=PB004",
  "defaultGameUrl": "https://ticket.interpark.com/Contents/Sports/GoodsInfo?SportsCode=07001&TeamCode=PB004",
  "pushProvider": "fcm",
  "firebaseProjectId": "YOUR_FIREBASE_PROJECT_ID",
  "firebaseServiceAccountPath": "./backend/firebase-service-account.json",
  "firebaseServiceAccountJson": "",
  "fcmServerKey": "",
  "dataFile": "./backend/data/state.json"
}
```

## Render 환경변수 권장값
1. `PUSH_PROVIDER` = `fcm`
2. `FIREBASE_PROJECT_ID` = Firebase 프로젝트 ID
3. `FIREBASE_SERVICE_ACCOUNT_JSON` = 서비스 계정 JSON 전체 문자열

## 검증 순서
1. Firebase 콘솔에서 Android 앱 등록
2. `google-services.json` 를 `app/android/app/google-services.json` 에 복사
3. Firebase 서비스 계정 JSON 발급
4. Render 환경변수에 `PUSH_PROVIDER`, `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON` 입력
5. APK 재빌드 후 설치
6. 앱에서 푸시 권한 허용
7. 서버에서 `/api/test/alert` 호출 또는 앱의 테스트 알림 실행

## 주의
- `google-services.json` 없이도 APK는 빌드되지만 실제 FCM 기기 등록은 되지 않습니다.
- 서비스 계정 JSON 없이도 앱 로컬 알림 테스트는 되지만 서버 원격 푸시는 되지 않습니다.
- 예전 `fcmServerKey` 방식은 구형 레거시 호환용으로만 남겨두었고, 우선순위는 `HTTP v1` 입니다.
