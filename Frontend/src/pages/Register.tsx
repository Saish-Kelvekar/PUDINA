import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user' as 'user' | 'admin' | 'emergency',
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
    <div className="flex h-screen w-full bg-slate-900">
      <div className="hidden md:w-1/3 bg-slate-950 border-r border-slate-800 flex flex-col justify-center p-10">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded bg-blue-600 flex items-center justify-center text-white font-bold text-lg">
            TV
          </div>
          <span className="text-xl font-semibold text-slate-100 tracking-tight">TrafficVision</span>
        </div>
        <h1 className="text-3xl font-bold text-slate-100 mb-2 leading-tight">
          Create your account
        </h1>
        <p className="text-slate-400 max-w-xs leading-relaxed">
          Join TrafficVision AI to plan routes, report incidents, and help
          improve urban mobility.
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-100">Create account</h2>
            <p className="text-slate-400 mt-1">Get started in under a minute</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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
              placeholder="name@demo.in"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              error={error.includes('email') ? error : undefined}
              required
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              error={error.includes('password') ? error : undefined}
              required
            />
            <Select
              label="Role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as any })}
            >
              <option value="user">Commuter / User</option>
              <option value="admin">Traffic Administrator</option>
              <option value="emergency">Emergency Services</option>
            </Select>

            <Button type="submit" variant="primary" className="w-full" loading={loading}>
              Create account
            </Button>
          </form>

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-900/20 border border-red-500/30 text-sm text-red-300">
              {error}
            </div>
          )}

          <p className="mt-6 text-center text-xs text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-400 hover:text-blue-300 font-medium underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
