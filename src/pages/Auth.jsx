import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Icon, Logo } from '../ui.jsx';

export default function Auth({ mode, onAuthed }) {
  const signup = mode === 'signup';
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', password: '', orgName: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await api.post(signup ? '/api/auth/signup' : '/api/auth/login', f);
      await onAuthed();
      nav(signup ? '/app?welcome=1' : '/app');
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <aside className="auth-side">
        <Link to="/" className="wordmark"><Logo />LandVerify</Link>
        <div>
          <p className="h-feature" style={{ maxWidth: '12em' }}>Make complicated land decisions feel clear.</p>
          <p className="muted" style={{ marginTop: 16, maxWidth: '26em' }}>Your documents are stored privately. Only members of your workspace can open them, and every view and change is recorded.</p>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>LandVerify records checks. It does not certify title or replace legal advice.</p>
      </aside>
      <main className="auth-main">
        <Link to="/" className="wordmark" style={{ display: 'none' }}><Logo />LandVerify</Link>
        <div>
          <h1 className="page-h">{signup ? 'Create your workspace' : 'Sign in'}</h1>
          <p className="page-sub" style={{ fontSize: 16 }}>{signup ? 'Start a structured land file for your first property.' : 'Welcome back. Pick up where you left off.'}</p>
        </div>
        <form onSubmit={submit} style={{ display: 'grid', gap: 16 }} noValidate>
          {signup && (
            <>
              <div className="field"><label htmlFor="n">Your name</label><input id="n" className="input" value={f.name} onChange={set('name')} autoComplete="name" required /></div>
              <div className="field"><label htmlFor="o">Workspace name</label><input id="o" className="input" value={f.orgName} onChange={set('orgName')} placeholder="For example, your firm or group" /><span className="hint">Optional. Teammates you invite join this workspace.</span></div>
            </>
          )}
          <div className="field"><label htmlFor="e">Email</label><input id="e" type="email" className="input" value={f.email} onChange={set('email')} autoComplete="email" required /></div>
          <div className="field"><label htmlFor="p">Password</label><input id="p" type="password" className="input" value={f.password} onChange={set('password')} autoComplete={signup ? 'new-password' : 'current-password'} required />{signup && <span className="hint">At least 10 characters.</span>}</div>
          {err && <div className="error-text" role="alert"><Icon name="warn" size={16} />{err}</div>}
          <button className="btn lg" disabled={busy}>{busy ? 'One moment' : signup ? 'Create workspace' : 'Sign in'}</button>
        </form>
        <p className="muted" style={{ fontSize: 14.5 }}>{signup ? <>Already have a workspace? <Link to="/login">Sign in</Link></> : <>New to LandVerify? <Link to="/signup">Create a workspace</Link></>}</p>
      </main>
    </div>
  );
}
