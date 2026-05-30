import { useState } from 'react';
import './AuthScreen.css';

const CONTACT_EMAIL = 'andiwonder808@gmail.com';
const NOTICE_DISMISS_COOKIE = 'simple_dj_notice_dismissed';
const ONE_WEEK_SECONDS = 7 * 24 * 60 * 60;

const noticeCopy = {
  ko: {
    langLabel: 'English',
    title: 'Simple DJ를 써주셔서 감사합니다!',
    paragraphs: [
      'Simple DJ는 현재 개인 사이드 프로젝트로 운영되고 있습니다.',
      '프론트엔드, 백엔드, GPU 서버 모두 무료 플랜으로 운영하고 있어 업로드, 분석, stem 변환 속도가 느릴 수 있습니다.',
      '이용 중 오류가 발생하거나 불편한 점이 있다면 아래 이메일로 편하게 연락 부탁드립니다.',
    ],
    ok: '확인',
    dismissWeek: '일주일 동안 보지 않기',
    contactLabel: 'Contact',
  },
  en: {
    langLabel: '한국어',
    title: 'Thanks for checking out Simple DJ!',
    paragraphs: [
      'Simple DJ is currently running as a personal side project.',
      'The frontend, backend, and GPU server are all operated on free-tier plans, so uploads, analysis, and stem conversion may be slow at times.',
      'If you run into any errors or issues while using the site, feel free to contact me at the email below.',
    ],
    ok: 'OK',
    dismissWeek: 'Don’t show for 7 days',
    contactLabel: 'Contact',
  },
};

const shouldShowNotice = () => {
  return !document.cookie
    .split(';')
    .some(cookie => cookie.trim().startsWith(`${NOTICE_DISMISS_COOKIE}=1`));
};

const dismissNoticeCookie = () => {
  document.cookie = `${NOTICE_DISMISS_COOKIE}=1; max-age=${ONE_WEEK_SECONDS}; path=/; SameSite=Lax`;
};

export default function AuthScreen({ onSignIn, onSignUp, onSignInWithGoogle }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [noticeLanguage, setNoticeLanguage] = useState('ko');
  const [showNotice, setShowNotice] = useState(shouldShowNotice);

  const notice = noticeCopy[noticeLanguage];

  const resetMessages = () => {
    setError('');
    setSuccess('');
  };

  const handleTabSwitch = (newMode) => {
    setMode(newMode);
    setEmail('');
    setPassword('');
    resetMessages();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    resetMessages();

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);

    try {
      if (mode === 'login') {
        await onSignIn(email, password);
      } else {
        await onSignUp(email, password);
        setSuccess('Account created! Check your email to confirm, then log in.');
        setEmail('');
        setPassword('');
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    resetMessages();
    setSubmitting(true);

    try {
      await onSignInWithGoogle();
    } catch (err) {
      setError(err.message || 'Google sign-in failed.');
      setSubmitting(false);
    }
  };

  const handleDismissNotice = () => {
    setShowNotice(false);
  };

  const handleDismissNoticeForWeek = () => {
    dismissNoticeCookie();
    setShowNotice(false);
  };

  return (
    <div className="auth-screen">
      {showNotice && (
        <div className="auth-notice-overlay" role="presentation">
          <div className="auth-notice" role="dialog" aria-modal="true" aria-labelledby="auth-notice-title">
            <div className="auth-notice-header">
              <h2 id="auth-notice-title" className="auth-notice-title">
                {notice.title}
              </h2>
              <button
                type="button"
                className="auth-notice-language"
                onClick={() => setNoticeLanguage(prev => prev === 'ko' ? 'en' : 'ko')}
              >
                {notice.langLabel}
              </button>
            </div>

            <div className="auth-notice-body">
              {notice.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>

            <a className="auth-notice-email" href={`mailto:${CONTACT_EMAIL}`}>
              <span>{notice.contactLabel}</span>
              {CONTACT_EMAIL}
            </a>

            <div className="auth-notice-actions">
              <button type="button" className="auth-notice-secondary" onClick={handleDismissNoticeForWeek}>
                {notice.dismissWeek}
              </button>
              <button type="button" className="auth-notice-primary" onClick={handleDismissNotice}>
                {notice.ok}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="auth-card">
        <h1 className="auth-title">SIMPLE DJ</h1>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('login')}
          >
            LOGIN
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('signup')}
          >
            SIGN UP
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-input-group">
            <label className="auth-label" htmlFor="auth-email">
              Email
            </label>
            <input
              id="auth-email"
              className="auth-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={submitting}
            />
          </div>

          <div className="auth-input-group">
            <label className="auth-label" htmlFor="auth-password">
              Password
            </label>
            <input
              id="auth-password"
              className="auth-input"
              type="password"
              placeholder="Min 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              disabled={submitting}
            />
          </div>

          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          <button
            type="submit"
            className="auth-submit"
            disabled={submitting}
          >
            {submitting
              ? 'LOADING...'
              : mode === 'login'
                ? 'LOGIN'
                : 'CREATE ACCOUNT'}
          </button>

          <div className="auth-divider">
            <span>OR</span>
          </div>

          <button
            type="button"
            className="auth-google"
            onClick={handleGoogleSignIn}
            disabled={submitting}
          >
            CONTINUE WITH GOOGLE
          </button>
        </form>

        <div className="auth-contact">
          <span>Contact</span>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </div>
      </div>
    </div>
  );
}
