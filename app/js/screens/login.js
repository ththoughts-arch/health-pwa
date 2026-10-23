export function renderLogin({ loginError, busy }) {
  return `
    <section class="hero hero-tall">
      <span class="hero-date">HEALTH</span>
      <span class="hero-caption">건강 트래커</span>
      <span class="hero-msg">수면·운동·영양제를 내 평소 상태와 비교해 봐요.</span>
    </section>
    <form class="section form" data-submit="login">
      <label class="field">
        <span class="field-label">이메일</span>
        <input class="text-input" type="email" name="email" autocomplete="username" required>
      </label>
      <label class="field">
        <span class="field-label">비밀번호</span>
        <input class="text-input" type="password" name="password" autocomplete="current-password" required>
      </label>
      ${loginError ? `<p class="error" role="alert">${loginError}</p>` : ''}
      <button class="primary-btn" type="submit" ${busy ? 'disabled' : ''}>${busy ? '로그인 중…' : '로그인'}</button>
    </form>`;
}

// Firebase Auth 오류 코드 → 안내 문구
export function loginErrorText(code) {
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(code)) {
    return '이메일 또는 비밀번호가 맞지 않아요.';
  }
  if (code === 'auth/too-many-requests') return '시도가 너무 많아요. 잠시 후 다시 해 주세요.';
  if (code === 'auth/network-request-failed') return '네트워크에 연결할 수 없어요.';
  return '로그인하지 못했어요. 잠시 후 다시 해 주세요.';
}
