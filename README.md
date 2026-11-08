# 🐱 냥이네 집 (Bangbae Cat Servant)

휴대폰 세로 화면용 고양이 키우기 게임이에요. HTML 파일 하나에 그림·소리가 모두 들어 있어서 설치 없이 브라우저에서 바로 할 수 있어요.

## 플레이
- GitHub Pages를 켜면(Settings → Pages → Branch `main` / `/ (root)`) `index.html`이 바로 열려요.
- 또는 `index.html`을 내려받아 휴대폰·PC 브라우저로 열면 돼요.
- 진행 기록은 브라우저(localStorage)에 저장돼요. 설정 → 백업 코드로 다른 기기로 옮길 수 있어요.

## 주요 기능
- 털 색·눈 색·이름·성격(4가지)을 고르는 고양이, 성격별 냥체 말투
- 밥·물·화장실 돌보기, 손에 든 간식을 끌어다 주기, 쓰다듬기·빗질·장난감 놀이
- 캣휠·캣타워·소파 등 가구를 손으로 끌어 배치, 가끔 나타나는 도마뱀
- 시간 속도 조절·일시정지, 고양이의 부탁과 팁 카드
- 상점(오늘의 특가, 꾸미기 소품과 색깔, 방 스타일, 방·고양이 칸 확장)
- 끝없는 목표: 보호소 후원 단계, 일일·주간 미션, 사진 의뢰와 앨범, 창가 화분

## 개발
```
src/        index.html, data.js, audio.js, draw.js, game.js, ui.js
sounds/     효과음·배경음악 (mp3)
build.py    src와 sounds를 index.html 하나로 합침
```
수정 후 `python build.py`를 실행하면 `index.html`이 다시 만들어져요.

## 소리 출처
- 고양이 울음·골골송: BigSoundBank (CC0)
- 배경음악: Pixabay (Pixabay Content License)
