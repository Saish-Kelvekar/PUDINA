import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { ArrowRight, KeyRound } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/map');
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Routing — Prediction — Signals"
      title="Cities That"
      accent="Flow"
      description="Live congestion, AI-optimised routes, incident reporting and emergency priority routing, all on one calm map of the city."
    >
      <p className="eyebrow">Welcome back</p>
      <h2 className="display mt-2 text-4xl">
        Sign <span className="accent-word">in</span>
      </h2>
      <p className="mt-2 text-sm text-ink-muted">Enter your credentials to continue.</p>

      <form onSubmit={handleSubmit} className="mt-7 space-y-4">
        <Input
          label="Email"
          type="email"
          placeholder="admin@demo.test"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error.includes('email') ? error : undefined}
          required
        />
        <Input
          label="Password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error.includes('password') ? error : undefined}
          required
        />

        <div className="flex items-center justify-between px-1 text-xs">
          <label className="flex cursor-pointer items-center gap-2 text-ink-muted">
            <input type="checkbox" className="h-3.5 w-3.5 rounded accent-ink" />
            Remember me
          </label>
          <a href="#" className="font-medium text-bronze hover:text-bronze-dark">
            Forgot password?
          </a>
        </div>

        <Button type="submit" variant="primary" size="lg" className="w-full justify-between pl-7 pr-2" loading={loading}>
          <span>Sign in</span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sand-50 text-ink transition-transform group-hover:translate-x-0.5">
            <ArrowRight className="h-4 w-4" />
          </span>
        </Button>
      </form>

      {error && (
        <div className="mt-4 rounded-2xl border border-traffic-red/25 bg-traffic-red/10 px-4 py-3 text-sm text-traffic-red">
          {error}
        </div>
      )}

      <div className="mt-6 flex items-start gap-3 rounded-3xl bg-ink px-5 py-4 text-sand-100">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-bronze-light" />
        <div className="text-xs leading-relaxed">
          <p className="font-semibold text-sand-50">Demo accounts</p>
          <p className="text-sand-300">user@demo.test · admin@demo.test · ems@demo.test</p>
          <p className="text-sand-300">
            Password: <span className="font-mono text-bronze-light">demo123</span>
          </p>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-ink-muted">
        Don't have an account?{' '}
        <Link to="/register" className="font-semibold text-ink underline decoration-bronze/50 underline-offset-4 hover:decoration-bronze">
          Create account
        </Link>
      </p>
    </AuthLayout>
  );
}
