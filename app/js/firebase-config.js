// Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹) → SDK 설정 값.
// 웹 config는 비밀값이 아니다(공개 저장소에 올려도 됨). 데이터 보호는 firestore.rules가 담당.
// apiKey가 비어 있으면 앱은 Firebase 없이 동작한다.
export const firebaseConfig = {
  apiKey: 'AIzaSyAKiBQCd7uwMVljM_7tl3ZBBloH-UUodAc',
  authDomain: 'health-tracker-c4273.firebaseapp.com',
  projectId: 'health-tracker-c4273',
  storageBucket: 'health-tracker-c4273.firebasestorage.app',
  messagingSenderId: '1025233031946',
  appId: '1:1025233031946:web:ee3de1e3eb451c243860f3',
};
