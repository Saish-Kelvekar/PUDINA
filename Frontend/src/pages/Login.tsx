import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ShieldAlert } from 'lucide-react';

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
    <div className="flex h-screen w-full bg-slate-900">
      <div className="hidden md:w-1/3 bg-slate-950 border-r border-slate-800 flex flex-col justify-center p-10">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded bg-blue-600 flex items-center justify-center text-white font-bold text-lg">
            TV
          </div>
          <span className="text-xl font-semibold text-slate-100 tracking-tight">TrafficVision</span>
        </div>
        <h1 className="text-3xl font-bold text-slate-100 mb-2 leading-tight">
          Intelligent traffic management
        </h1>
        <p className="text-slate-400 max-w-xs leading-relaxed">
          Route optimization, incident reporting, congestion prediction, and
          emergency routing for urban mobility.
        </p>
        <div className="mt-10 space-y-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 text-slate-500" />
            <div>
              <p className="text-sm text-slate-300 font-medium">Demo accounts</p>
              <p className="text-xs text-slate-500">
                user@demo.in · admin@demo.in · emergency@demo.in<br />
                Password: <span className="font-mono text-blue-400">password</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-100">Sign in</h2>
            <p className="text-slate-400 mt-1">Enter your credentials to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="name@demo.in"
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

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input type="checkbox" className="rounded bg-slate-800 border border-slate-600 text-blue-600 focus:ring-blue-500" />
                Remember me
              </label>
              <a href="#" className="text-blue-400 hover:text-blue-300 underline">
                Forgot password?
              </a>
            </div>

            <Button type="submit" variant="primary" className="w-full" loading={loading}>
              Sign in
            </Button>
          </form>

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-900/20 border border-red-500/30 text-sm text-red-300">
              {error}
            </div>
          )}

          <p className="mt-6 text-center text-xs text-slate-500">
            Don't have an account?{' '}
            <Link to="/register" className="text-blue-400 hover:text-blue-300 font-medium underline">
              Create account
            </Link>
          </p>
          <p className="mt-3 text-center text-[11px] text-slate-600">
            Demo: user@demo.in / admin@demo.in / emergency@demo.in · password: password
          </p>
        </div>
      </div>
    </div>
  );
}
