import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { Spinner } from './components/ui';
import { useAuth } from './lib/session';
import Home from './pages/Home';
import Discover from './pages/Discover';
import Games from './pages/Games';
import GameDetail from './pages/GameDetail';
import Login from './pages/Login';
import Register from './pages/Register';

const GamePlay = lazy(() => import('./pages/GamePlay'));
const Create = lazy(() => import('./pages/Create'));
const Studio = lazy(() => import('./pages/Studio'));
const Social = lazy(() => import('./pages/Social'));
const Messages = lazy(() => import('./pages/Messages'));
const Communities = lazy(() => import('./pages/Communities'));
const CommunityDetail = lazy(() => import('./pages/CommunityDetail'));
const Live = lazy(() => import('./pages/Live'));
const Music = lazy(() => import('./pages/Music'));
const Clips = lazy(() => import('./pages/Clips'));
const Battles = lazy(() => import('./pages/Battles'));
const Events = lazy(() => import('./pages/Events'));
const Marketplace = lazy(() => import('./pages/Marketplace'));
const Profile = lazy(() => import('./pages/Profile'));
const Admin = lazy(() => import('./pages/Admin'));
const ExperienceDetail = lazy(() => import('./pages/ExperienceDetail'));
const NotFound = lazy(() => import('./pages/NotFound'));

function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Shell>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/games" element={<Games />} />
          <Route path="/games/:slug" element={<GameDetail />} />
          <Route path="/play/:slug" element={<GamePlay />} />
          <Route path="/create" element={<Create />} />
          <Route path="/studio/:id" element={<Protected><Studio /></Protected>} />
          <Route path="/social" element={<Social />} />
          <Route path="/messages" element={<Protected><Messages /></Protected>} />
          <Route path="/communities" element={<Communities />} />
          <Route path="/c/:slug" element={<CommunityDetail />} />
          <Route path="/live" element={<Live />} />
          <Route path="/music" element={<Music />} />
          <Route path="/clips" element={<Clips />} />
          <Route path="/battles" element={<Battles />} />
          <Route path="/events" element={<Events />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/experience/:id" element={<ExperienceDetail />} />
          <Route path="/profile" element={<Protected><Profile /></Protected>} />
          <Route path="/u/:handle" element={<Profile />} />
          <Route path="/admin" element={<AdminOnly><Admin /></AdminOnly>} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Shell>
  );
}
