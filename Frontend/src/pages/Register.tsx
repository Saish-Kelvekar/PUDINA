import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { ArrowRight } from 'lucide-react';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form);
      navigate('/map');
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Commuters — Admins — Responders"
      title="Join The"
      accent="Network"
      description="Plan routes, report incidents and help keep the city moving. Get started in under a minute."
    >
      <p className="eyebrow">New here</p>
      <h2 className="display mt-2 text-4xl">
        Create <span className="accent-word">account</span>
      </h2>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Input
          label="Full name"
          type="text"
          placeholder="Aryan Sharma"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          error={error.includes('email') ? error : undefined}
          required
        />
        <Input
          label="Password"
          type="password"
          placeholder="At least 6 characters"
          minLength={6}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={error.includes('password') ? error : undefined}
          required
        />
        <p className="px-1 text-[11px] text-ink-faint">New accounts are commuters. Admin and emergency accounts are provisioned by the operator.</p>

        <Button type="submit" variant="primary" size="lg" className="w-full justify-between pl-7 pr-2" loading={loading}>
          <span>Create account</span>
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

      <p className="mt-6 text-center text-xs text-ink-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-ink underline decoration-bronze/50 underline-offset-4 hover:decoration-bronze">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
